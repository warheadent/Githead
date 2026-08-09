import fs from "node:fs/promises";
import path from "node:path";
import type { GitHubDeviceFlow, GitHubDeviceFlowPollResult } from "../shared/types";
import { GITHUB_APP_CLIENT_ID, GITHUB_APP_INSTALL_URL, GITHUB_APP_SLUG } from "../shared/githubApp";
import type { SecretStorage } from "./aiSettingsService";

export { GITHUB_APP_CLIENT_ID, GITHUB_APP_INSTALL_URL, GITHUB_APP_SLUG };

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const REFRESH_WINDOW_MS = 5 * 60 * 1_000;

interface StoredGitHubCredential {
  version: 1;
  encryptedAccessToken: string;
  accessTokenExpiresAt: string | null;
  encryptedRefreshToken?: string;
  refreshTokenExpiresAt?: string | null;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
  interval?: number;
}

interface DeviceCodeResponse {
  device_code?: string;
  user_code?: string;
  verification_uri?: string;
  expires_in?: number;
  interval?: number;
  error?: string;
  error_description?: string;
}

export class GitHubAuthService {
  private readonly credentialPath: string;
  private credential: StoredGitHubCredential | null | undefined;
  private refreshInFlight: Promise<string | null> | undefined;

  constructor(
    userDataPath: string,
    private readonly secretStorage: SecretStorage,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now
  ) {
    this.credentialPath = path.join(userDataPath, "github-auth.json");
  }

  async getToken(): Promise<string | null> {
    const credential = await this.readCredential();
    if (!credential) return null;
    const expiresAt = parseTimestamp(credential.accessTokenExpiresAt);
    if (expiresAt === null || expiresAt - this.now() > REFRESH_WINDOW_MS) {
      return this.decrypt(credential.encryptedAccessToken);
    }
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = this.refreshCredential(credential);
    try {
      return await this.refreshInFlight;
    } finally {
      this.refreshInFlight = undefined;
    }
  }

  async beginDeviceFlow(): Promise<GitHubDeviceFlow> {
    this.requireSecureStorage();
    const response = await this.postForm<DeviceCodeResponse>(DEVICE_CODE_URL, {
      client_id: GITHUB_APP_CLIENT_ID
    });
    const deviceCode = response.device_code?.trim();
    const userCode = response.user_code?.trim();
    const verificationUri = response.verification_uri?.trim();
    if (!deviceCode || !userCode || !verificationUri || !Number.isFinite(response.expires_in)) {
      throw new Error(response.error_description?.trim() || "GitHub did not return a valid device authorization.");
    }
    return {
      deviceCode,
      userCode,
      verificationUri,
      expiresAt: new Date(this.now() + Number(response.expires_in) * 1_000).toISOString(),
      intervalSeconds: Math.max(1, Number(response.interval) || 5)
    };
  }

  async pollDeviceFlow(flow: GitHubDeviceFlow): Promise<GitHubDeviceFlowPollResult> {
    if (parseTimestamp(flow.expiresAt) !== null && parseTimestamp(flow.expiresAt)! <= this.now()) {
      return { state: "error", message: "The GitHub connection code expired. Start again.", retryable: true };
    }
    const response = await this.postForm<TokenResponse>(ACCESS_TOKEN_URL, {
      client_id: GITHUB_APP_CLIENT_ID,
      device_code: flow.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    });
    if (response.error === "authorization_pending") {
      return { state: "pending", intervalSeconds: flow.intervalSeconds };
    }
    if (response.error === "slow_down") {
      return { state: "pending", intervalSeconds: Math.max(flow.intervalSeconds + 5, Number(response.interval) || 0) };
    }
    if (response.error) {
      const retryable = response.error === "expired_token" || response.error === "incorrect_device_code";
      return {
        state: "error",
        message: response.error_description?.trim() || formatOAuthError(response.error),
        retryable
      };
    }
    if (!response.access_token?.trim()) {
      return { state: "error", message: "GitHub did not return an access token.", retryable: true };
    }
    await this.saveTokenResponse(response);
    return {
      state: "connected",
      connection: {
        state: "authenticated",
        source: "githubApp",
        accountLogin: null,
        repositoryAccess: "unknown",
        message: "GitHub authorization completed.",
        failure: null
      }
    };
  }

  async disconnect(): Promise<void> {
    this.credential = null;
    this.refreshInFlight = undefined;
    try {
      await fs.unlink(this.credentialPath);
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") throw error;
    }
  }

  private async refreshCredential(credential: StoredGitHubCredential): Promise<string | null> {
    const encryptedRefreshToken = credential.encryptedRefreshToken;
    const refreshExpiresAt = parseTimestamp(credential.refreshTokenExpiresAt ?? null);
    if (!encryptedRefreshToken || (refreshExpiresAt !== null && refreshExpiresAt <= this.now())) {
      return null;
    }
    const response = await this.postForm<TokenResponse>(ACCESS_TOKEN_URL, {
      client_id: GITHUB_APP_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: this.decrypt(encryptedRefreshToken)
    });
    if (!response.access_token?.trim()) {
      return null;
    }
    await this.saveTokenResponse(response);
    return response.access_token.trim();
  }

  private async saveTokenResponse(response: TokenResponse): Promise<void> {
    this.requireSecureStorage();
    const accessToken = response.access_token?.trim();
    if (!accessToken) throw new Error("GitHub did not return an access token.");
    const refreshToken = response.refresh_token?.trim();
    const credential: StoredGitHubCredential = {
      version: 1,
      encryptedAccessToken: this.secretStorage.encryptString(accessToken).toString("base64"),
      accessTokenExpiresAt: durationToTimestamp(this.now(), response.expires_in),
      ...(refreshToken ? {
        encryptedRefreshToken: this.secretStorage.encryptString(refreshToken).toString("base64"),
        refreshTokenExpiresAt: durationToTimestamp(this.now(), response.refresh_token_expires_in)
      } : {})
    };
    await fs.mkdir(path.dirname(this.credentialPath), { recursive: true });
    await fs.writeFile(this.credentialPath, `${JSON.stringify(credential, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    this.credential = credential;
  }

  private async readCredential(): Promise<StoredGitHubCredential | null> {
    if (this.credential !== undefined) return this.credential;
    try {
      const parsed = JSON.parse(await fs.readFile(this.credentialPath, "utf8")) as Partial<StoredGitHubCredential>;
      this.credential = parsed.version === 1 && typeof parsed.encryptedAccessToken === "string"
        ? parsed as StoredGitHubCredential
        : null;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") throw error;
      this.credential = null;
    }
    return this.credential;
  }

  private decrypt(value: string): string {
    this.requireSecureStorage();
    return this.secretStorage.decryptString(Buffer.from(value, "base64"));
  }

  private requireSecureStorage(): void {
    if (!this.secretStorage.isEncryptionAvailable()) {
      throw new Error("Secure GitHub credential storage is not available on this system.");
    }
  }

  private async postForm<T>(url: string, values: Record<string, string>): Promise<T> {
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams(values).toString()
    });
    const payload = await response.json() as T;
    if (!response.ok) throw new Error(`GitHub authentication failed with status ${response.status}.`);
    return payload;
  }
}

function durationToTimestamp(now: number, seconds: number | undefined): string | null {
  return Number.isFinite(seconds) ? new Date(now + Number(seconds) * 1_000).toISOString() : null;
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatOAuthError(error: string): string {
  if (error === "access_denied") return "GitHub connection was cancelled.";
  if (error === "expired_token") return "The GitHub connection code expired. Start again.";
  if (error === "device_flow_disabled") return "Device flow is not enabled for the Githead GitHub App.";
  return `GitHub connection failed: ${error.replaceAll("_", " ")}.`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
