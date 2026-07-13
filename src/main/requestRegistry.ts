export interface RequestRegistration {
  signal: AbortSignal;
  complete(): void;
}

export class RequestRegistry<Owner = number> {
  private readonly active = new Map<Owner, Map<string, AbortController>>();

  register(owner: Owner, requestId: string): RequestRegistration {
    let requests = this.active.get(owner);
    if (!requests) {
      requests = new Map();
      this.active.set(owner, requests);
    }

    requests.get(requestId)?.abort();
    const controller = new AbortController();
    requests.set(requestId, controller);

    return {
      signal: controller.signal,
      complete: () => this.complete(owner, requestId, controller)
    };
  }

  cancel(owner: Owner, requestId: string): void {
    this.active.get(owner)?.get(requestId)?.abort();
  }

  cancelAll(owner: Owner): void {
    for (const controller of this.active.get(owner)?.values() ?? []) {
      controller.abort();
    }
    this.active.delete(owner);
  }

  private complete(owner: Owner, requestId: string, controller: AbortController): void {
    const requests = this.active.get(owner);
    if (requests?.get(requestId) !== controller) {
      return;
    }

    requests.delete(requestId);
    if (requests.size === 0) {
      this.active.delete(owner);
    }
  }
}
