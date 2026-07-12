export class GitHubRequestRegistry {
  private readonly active = new Map<number, Map<string, AbortController>>();

  register(ownerId: number, requestId: string): AbortSignal {
    let requests = this.active.get(ownerId);
    if (!requests) { requests = new Map(); this.active.set(ownerId, requests); }
    if (requests.has(requestId)) throw new Error(`GitHub request '${requestId}' is already active.`);
    const controller = new AbortController();
    requests.set(requestId, controller);
    return controller.signal;
  }

  complete(ownerId: number, requestId: string): void {
    const requests = this.active.get(ownerId);
    requests?.delete(requestId);
    if (requests?.size === 0) this.active.delete(ownerId);
  }

  cancel(ownerId: number, requestId: string): void {
    this.active.get(ownerId)?.get(requestId)?.abort();
  }

  cancelAll(ownerId: number): void {
    for (const controller of this.active.get(ownerId)?.values() ?? []) controller.abort();
    this.active.delete(ownerId);
  }
}
