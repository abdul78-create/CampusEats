import { Response } from 'express';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { IEventBus } from '../domain/EventBus.js';
import { DomainEventEnvelope } from '../domain/RealtimeInterfaces.js';
import { DomainEventType } from '../domain/RealtimeEnums.js';

export interface SseClientConnection {
  connectionId: string;
  userId: string;
  role: string;
  res: Response;
  authorizedChannels: Set<string>;
  unsubscribes: Array<() => void>;
  bufferCount: number;
  connectedAt: Date;
}

export class SseConnectionManager {
  public static readonly MAX_BUFFER_FRAMES = 100;
  public static readonly MAX_STUDENT_CONNECTIONS = 5;
  public static readonly MAX_STALL_CONNECTIONS = 20;
  public static readonly KEEPALIVE_INTERVAL_MS = 15000; // 15 seconds
  public static readonly REVALIDATION_INTERVAL_MS = 60000; // 60 seconds

  private connections = new Map<string, SseClientConnection>();
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private revalidationTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly prisma: PrismaClient
  ) {
    this.keepaliveTimer = setInterval(() => this.sendHeartbeats(), SseConnectionManager.KEEPALIVE_INTERVAL_MS);
    if (this.keepaliveTimer.unref) {
      this.keepaliveTimer.unref();
    }

    this.revalidationTimer = setInterval(() => this.revalidateActiveSessions(), SseConnectionManager.REVALIDATION_INTERVAL_MS);
    if (this.revalidationTimer.unref) {
      this.revalidationTimer.unref();
    }
  }

  /**
   * Registers and initializes a new SSE client connection with strict buffering and BOLA boundaries.
   */
  public registerConnection(
    userId: string,
    role: string,
    res: Response,
    authorizedChannels: string[]
  ): SseClientConnection {
    // 1. Connection Limits check
    const userConns = Array.from(this.connections.values()).filter(c => c.userId === userId);
    if (role === 'STUDENT' && userConns.length >= SseConnectionManager.MAX_STUDENT_CONNECTIONS) {
      throw new Error('TOO_MANY_CONNECTIONS: Maximum concurrent student connections reached (5)');
    }

    // 2. Set authoritative SSE headers
    if (typeof res.setHeader === 'function') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
    }
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const connectionId = crypto.randomUUID();
    const unsubscribes: Array<() => void> = [];
    const clientChannels = new Set(authorizedChannels);

    const clientConn: SseClientConnection = {
      connectionId,
      userId,
      role,
      res,
      authorizedChannels: clientChannels,
      unsubscribes,
      bufferCount: 0,
      connectedAt: new Date(),
    };

    // 3. Subscribe client to their authorized channels
    for (const channel of authorizedChannels) {
      const unsub = this.eventBus.subscribe(channel, (event: DomainEventEnvelope) => {
        this.dispatchFrame(clientConn, event);
      });
      unsubscribes.push(unsub);
    }

    this.connections.set(connectionId, clientConn);

    // Initial connection established comment
    res.write(`:connected ${connectionId}\n\n`);

    // Clean up on disconnect
    if (typeof res.on === 'function') {
      res.on('close', () => {
        this.removeConnection(connectionId);
      });
    }

    return clientConn;
  }

  /**
   * Dispatches an event frame to the client with bounded buffer overflow protection.
   */
  public dispatchFrame(conn: SseClientConnection, event: DomainEventEnvelope): void {
    if (conn.res.writableEnded || conn.res.destroyed) {
      this.removeConnection(conn.connectionId);
      return;
    }

    // Check buffer threshold (Slow Consumer Defense)
    if (conn.bufferCount >= SseConnectionManager.MAX_BUFFER_FRAMES) {
      // Forcefully terminate connection to prevent memory leaks
      const overflowFrame = `event: ${DomainEventType.RESYNC_REQUIRED}\ndata: ${JSON.stringify({
        reason: 'BUFFER_OVERFLOW',
        action: 'FETCH_REST_SNAPSHOT',
      })}\n\n`;

      try {
        conn.res.write(overflowFrame);
      } catch {
        // Ignore write failures on stalled socket
      }
      conn.res.end();
      this.removeConnection(conn.connectionId);
      return;
    }

    conn.bufferCount++;
    const frame = `id: ${event.eventId}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`;

    conn.res.write(frame, () => {
      conn.bufferCount = Math.max(0, conn.bufferCount - 1);
    });
  }

  /**
   * Emits keepalive ping comment to prevent idle timeouts.
   */
  private sendHeartbeats(): void {
    for (const [id, conn] of this.connections.entries()) {
      if (conn.res.writableEnded || conn.res.destroyed) {
        this.removeConnection(id);
        continue;
      }
      try {
        conn.res.write(':keepalive\n\n');
      } catch {
        this.removeConnection(id);
      }
    }
  }

  /**
   * Revalidates student account status and staff stall permissions against PostgreSQL.
   */
  public async revalidateActiveSessions(): Promise<void> {
    const userIds = Array.from(new Set(Array.from(this.connections.values()).map(c => c.userId)));
    if (userIds.length === 0) return;

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      include: {
        studentProfile: {
          include: { verifications: { orderBy: { createdAt: 'desc' }, take: 1 } },
        },
        staffAccount: {
          include: { permissions: true },
        },
      },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    for (const [connId, conn] of this.connections.entries()) {
      const dbUser = userMap.get(conn.userId);

      // 1. Account suspended or deactivated
      if (!dbUser || !dbUser.isActive) {
        this.terminateConnection(connId, 'CREDENTIAL_EXPIRED', 'User account is inactive');
        continue;
      }

      if (conn.role === 'STUDENT') {
        const isSuspended = dbUser.studentProfile?.accountStatus === 'SUSPENDED' ||
          dbUser.studentProfile?.verifications[0]?.status === 'SUSPENDED';

        if (isSuspended) {
          this.terminateConnection(connId, 'ACCOUNT_SUSPENDED', 'Student account has been suspended');
          continue;
        }
      }

      if (conn.role === 'STALL_STAFF') {
        const staffStallId = dbUser.staffAccount?.stallId;
        // Check if any subscribed stall channel is no longer active
        for (const channel of conn.authorizedChannels) {
          if (channel.startsWith('stall:')) {
            const stallId = channel.replace('stall:', '');
            if (!staffStallId || staffStallId !== stallId) {
              this.terminateConnection(connId, 'STAFF_PERMISSION_REVOKED', 'Staff permission on stall revoked');
              break;
            }
          }
        }
      }
    }
  }

  public terminateConnection(
    connectionId: string,
    reason: 'ACCOUNT_SUSPENDED' | 'CREDENTIAL_EXPIRED' | 'STAFF_PERMISSION_REVOKED',
    message: string
  ): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    try {
      const termFrame = `event: ${DomainEventType.SESSION_TERMINATED}\ndata: ${JSON.stringify({
        reason,
        message,
      })}\n\n`;
      conn.res.write(termFrame);
      conn.res.end();
    } catch {
      // socket already closed
    }
    this.removeConnection(connectionId);
  }

  public removeConnection(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      for (const unsub of conn.unsubscribes) {
        try {
          unsub();
        } catch {
          // ignore cleanup errors
        }
      }
      this.connections.delete(connectionId);
    }
  }

  public unregisterConnection(connectionId: string): void {
    this.removeConnection(connectionId);
  }

  public async revalidateAllConnections(): Promise<void> {
    await this.revalidateActiveSessions();
  }

  public getActiveConnectionCount(): number {
    return this.connections.size;
  }

  public destroy(): void {
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    if (this.revalidationTimer) clearInterval(this.revalidationTimer);
    for (const connId of this.connections.keys()) {
      this.removeConnection(connId);
    }
  }
}
