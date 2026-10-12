import type { ReactNode } from "react";
import { TooltipTarget } from "@/components/ui/tooltip";
import type { RepoSyncStatus } from "../shared/types";
import gitIconUrl from "./assets/git-icon-white.svg";
import loreIconUrl from "./assets/lore-icon-white.svg";
import { formatCommitCountLabel } from "./remoteActions";

export function RecentRepositoryVcsIcon({ kind }: { kind: RepoSyncStatus["kind"] }): ReactNode {
  const icon = kind === "lore"
    ? {
      label: "Lore repository",
      src: loreIconUrl
    }
    : {
      label: "Git repository",
      src: gitIconUrl
    };

  return (
    <TooltipTarget content={icon.label}>
      <span
        className={`repo-recent-vcs-icon ${kind === "lore" ? "is-lore" : "is-git"}`}
        role="img"
        aria-label={icon.label}
      >
        <img src={icon.src} alt="" aria-hidden="true" />
      </span>
    </TooltipTarget>
  );
}

export function SyncCountChip({
  children,
  className = "",
  title
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}): ReactNode {
  const classNames = ["sync-count-chip", className].filter(Boolean).join(" ");

  return (
    <TooltipTarget content={title}>
      <span className={classNames} aria-hidden="true">{children}</span>
    </TooltipTarget>
  );
}

export function RepoSyncStatusChips({ status }: { status: RepoSyncStatus | null }): ReactNode {
  if (!status?.isValid || (status.ahead <= 0 && status.behind <= 0)) {
    return null;
  }

  return (
    <span className="repo-recent-sync" aria-hidden="true">
      {status.ahead > 0 ? (
        <SyncCountChip className="is-ahead" title={formatCommitCountLabel(status.ahead, "ahead")}>
          {status.ahead} ↑
        </SyncCountChip>
      ) : null}
      {status.behind > 0 ? (
        <SyncCountChip className="is-behind" title={formatCommitCountLabel(status.behind, "behind")}>
          {status.behind} ↓
        </SyncCountChip>
      ) : null}
    </span>
  );
}

export function formatRepoSyncStatusDescription(status: RepoSyncStatus | null): string {
  if (!status?.isValid) {
    return "";
  }

  return [
    status.ahead > 0 ? formatCommitCountLabel(status.ahead, "ahead") : "",
    status.behind > 0 ? formatCommitCountLabel(status.behind, "behind") : ""
  ].filter(Boolean).join(", ");
}
