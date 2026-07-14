export interface ConcurrencyLimiterOptions {
  globalLimit: number;
  perClientLimit: number;
}

export class HttpConcurrencyLimiter {
  private active = 0;
  private readonly clients = new Map<string, number>();

  constructor(private readonly options: ConcurrencyLimiterOptions) {}

  acquire(clientId: string): (() => void) | null {
    const clientActive = this.clients.get(clientId) ?? 0;
    if (
      this.active >= this.options.globalLimit ||
      clientActive >= this.options.perClientLimit
    ) {
      return null;
    }
    this.active += 1;
    this.clients.set(clientId, clientActive + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      const remaining = (this.clients.get(clientId) ?? 1) - 1;
      if (remaining <= 0) this.clients.delete(clientId);
      else this.clients.set(clientId, remaining);
    };
  }

  snapshot(): { active: number; identities: number } {
    return { active: this.active, identities: this.clients.size };
  }
}
