interface Counter {
  count: number;
  windowStartedAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  scope: "client" | "global";
}

export interface RateLimiterOptions {
  windowMs: number;
  perClientLimit: number;
  globalLimit: number;
  now?: () => number;
}

export class HttpRateLimiter {
  private global: Counter | undefined;
  private readonly clients = new Map<string, Counter>();
  private readonly now: () => number;

  constructor(private readonly options: RateLimiterOptions) {
    this.now = options.now ?? Date.now;
  }

  check(clientId: string): RateLimitResult {
    const now = this.now();
    const previousGlobal = this.global;
    const global = this.currentCounter(previousGlobal, now);
    this.global = global;
    if (previousGlobal !== global) this.clients.clear();
    const client = this.currentCounter(this.clients.get(clientId), now);

    if (global.count >= this.options.globalLimit) {
      return this.denied("global", this.options.globalLimit, global, now);
    }
    if (client.count >= this.options.perClientLimit) {
      return this.denied("client", this.options.perClientLimit, client, now);
    }

    global.count += 1;
    client.count += 1;
    this.clients.set(clientId, client);
    return {
      allowed: true,
      limit: this.options.perClientLimit,
      remaining: Math.max(0, this.options.perClientLimit - client.count),
      retryAfterSeconds: 0,
      scope: "client",
    };
  }

  private currentCounter(counter: Counter | undefined, now: number): Counter {
    if (!counter || now - counter.windowStartedAt >= this.options.windowMs) {
      return { count: 0, windowStartedAt: now };
    }
    return counter;
  }

  private denied(
    scope: "client" | "global",
    limit: number,
    counter: Counter,
    now: number,
  ): RateLimitResult {
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          (counter.windowStartedAt + this.options.windowMs - now) / 1_000,
        ),
      ),
      scope,
    };
  }
}
