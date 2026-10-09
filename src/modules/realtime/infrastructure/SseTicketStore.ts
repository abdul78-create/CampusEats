import crypto from 'node:crypto';

export interface SseTicketContext {
  userId: string;
  role: string;
  authorizedChannels: string[];
  expiresAt: number;
}

export class SseTicketStore {
  public static readonly TICKET_TTL_MS = 30 * 1000; // 30 seconds strict TTL

  private tickets = new Map<string, SseTicketContext>();
  private sweepInterval: NodeJS.Timeout | null = null;
  private readonly ttlMs: number;

  constructor(ttlMs: number = SseTicketStore.TICKET_TTL_MS) {
    this.ttlMs = ttlMs;
    // Periodically clean up expired tickets every 60 seconds
    this.sweepInterval = setInterval(() => this.sweepExpired(), 60000);
    // Unref so the timer does not block test teardown
    if (this.sweepInterval.unref) {
      this.sweepInterval.unref();
    }
  }

  /**
   * Generates a secure, cryptographically random single-use ticket valid for 30 seconds.
   */
  public createTicket(userId: string, role: string, authorizedChannels: string[]): string {
    const rawToken = `sse_tkt_${crypto.randomBytes(32).toString('hex')}`;
    const hash = this.hashToken(rawToken);

    this.tickets.set(hash, {
      userId,
      role,
      authorizedChannels,
      expiresAt: Date.now() + this.ttlMs,
    });

    return rawToken;
  }

  public issueTicket(input: { userId: string; role: string; authorizedChannels: string[] }): { ticket: string; expiresInSeconds: number } {
    const ticket = this.createTicket(input.userId, input.role, input.authorizedChannels);
    return {
      ticket,
      expiresInSeconds: Math.round(this.ttlMs / 1000),
    };
  }

  /**
   * Atomically consumes and invalidates a single-use ticket.
   * If valid and within the 30-second TTL, returns the ticket context; otherwise returns null.
   */
  public consumeTicket(rawToken: string): Omit<SseTicketContext, 'expiresAt'> | null {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    const hash = this.hashToken(rawToken);
    const ticket = this.tickets.get(hash);

    if (!ticket) {
      return null;
    }

    // Single-use: immediately delete from memory
    this.tickets.delete(hash);

    if (Date.now() > ticket.expiresAt) {
      return null; // Expired
    }

    return {
      userId: ticket.userId,
      role: ticket.role,
      authorizedChannels: ticket.authorizedChannels,
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [hash, ticket] of this.tickets.entries()) {
      if (now > ticket.expiresAt) {
        this.tickets.delete(hash);
      }
    }
  }

  public destroy(): void {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
    this.tickets.clear();
  }
}
