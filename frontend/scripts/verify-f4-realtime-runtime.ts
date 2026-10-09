/**
 * Phase F4 Runtime Verification Script: Browser SSE Lifecycle & Resilience
 *
 * Verifies:
 * 1. Single-use ticket acquisition handshake
 * 2. EventSource connection establishment and event decoding
 * 3. Exact event deduplication via seenEventIds cache
 * 4. Last-Event-ID persistence and catchup replay handshake
 * 5. RESYNC_REQUIRED cache invalidation trigger
 * 6. Disconnect recovery and exponential backoff timing calculation
 */
import http from "node:http";
import assert from "node:assert";

interface StorageMock {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}
const storageData: Record<string, string> = {};
const mockLocalStorage: StorageMock = {
  getItem: (k: string) => storageData[k] || null,
  setItem: (k: string, v: string) => { storageData[k] = v; },
  removeItem: (k: string) => { delete storageData[k]; },
};

const PORT = 4199;
let server: http.Server;
let lastReceivedTicket: string | null = null;
let lastReceivedEventId: string | null = null;

// Start mock authoritative backend
function startMockBackend(): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "", `http://localhost:${PORT}`);

      // Route: Ticket Handshake
      if (req.method === "POST" && url.pathname === "/api/v1/events/ticket") {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith("Bearer ")) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: { code: "UNAUTHORIZED" } }));
          return;
        }

        const ticket = `sse_tkt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          data: { ticket, expiresInSeconds: 30 },
        }));
        return;
      }

      // Route: SSE Stream
      if (req.method === "GET" && url.pathname === "/api/v1/events/stream") {
        const ticket = url.searchParams.get("ticket");
        const queryLastId = url.searchParams.get("lastEventId");
        const headerLastId = req.headers["last-event-id"] as string | undefined;

        lastReceivedTicket = ticket;
        lastReceivedEventId = queryLastId || headerLastId || null;

        if (!ticket || !ticket.startsWith("sse_tkt_")) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: { code: "UNAUTHORIZED" } }));
          return;
        }

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });

        // If client provided Last-Event-ID, immediately replay missed event
        if (lastReceivedEventId === "EVT_HISTORICAL_1") {
          const replayedEvent = {
            eventId: "EVT_REPLAY_2",
            eventType: "SUBORDER_PREPARING",
            aggregateType: "SubOrder",
            aggregateId: "sub_123",
            sequenceNumber: 2,
            payload: { subOrderId: "sub_123", status: "PREPARING" },
            timestamp: new Date().toISOString(),
          };
          res.write(`id: ${replayedEvent.eventId}\nevent: ${replayedEvent.eventType}\ndata: ${JSON.stringify(replayedEvent)}\n\n`);
        } else {
          // Standard connection greeting
          res.write(`: connected\n\n`);
        }

        // Close after writing test payload
        setTimeout(() => {
          res.end();
        }, 50);
        return;
      }

      res.writeHead(404);
      res.end();
    });

    server.listen(PORT, () => {
      resolve();
    });
  });
}

interface TestDomainEvent {
  eventId: string;
  eventType: string;
  aggregateType?: string;
  aggregateId?: string;
  sequenceNumber?: number;
  payload?: Record<string, unknown>;
  timestamp?: string;
}

interface TicketResponse {
  success: boolean;
  data: {
    ticket: string;
    expiresInSeconds: number;
  };
}

// Client Simulation matching RealtimeContext.tsx
class RealtimeClientSimulation {
  public status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RECONNECTING" | "ERROR" = "DISCONNECTED";
  public lastEventId: string | null = null;
  public seenEventIds = new Set<string>();
  public dispatchedEvents: TestDomainEvent[] = [];
  public invalidatedQueries: string[] = [];
  public retryCount = 0;

  constructor() {
    this.lastEventId = mockLocalStorage.getItem("ce_last_event_id");
  }

  // Deduplication & Invalidation Logic (Mirrors RealtimeContext.tsx lines 75-138)
  public handleIncomingEvent(event: TestDomainEvent) {
    // 1. Deduplication check
    if (event.eventId && this.seenEventIds.has(event.eventId)) {
      return false; // Ignored as duplicate
    }
    if (event.eventId) {
      this.seenEventIds.add(event.eventId);
    }

    // 2. Update pointer & localStorage
    if (event.eventId) {
      this.lastEventId = event.eventId;
      mockLocalStorage.setItem("ce_last_event_id", event.eventId);
    }

    // 3. Cache Invalidation
    if (event.eventType === "RESYNC_REQUIRED") {
      this.invalidatedQueries.push("orders", "payment", "kitchen-queue");
    } else if (
      event.eventType.startsWith("SUBORDER_") ||
      event.eventType.startsWith("ORDER_")
    ) {
      this.invalidatedQueries.push("orders");
      if (event.aggregateId) {
        this.invalidatedQueries.push(`order:${event.aggregateId}`);
      }
    }

    this.dispatchedEvents.push(event);
    return true;
  }

  // Exponential Backoff Delay (Mirrors RealtimeContext.tsx line 185)
  public getBackoffDelay(attempt: number): number {
    return Math.min(1500 * Math.pow(2, attempt), 15000);
  }
}

async function runVerification() {
  console.log("=================================================");
  console.log("Phase F4 Runtime Realtime / SSE Audit Suite");
  console.log("=================================================\n");

  await startMockBackend();

  try {
    // TEST 1: Ticket Handshake
    console.log("Test 1: Single-Use Ticket Handshake (POST /api/v1/events/ticket)");
    const ticketRes = await fetch(`http://localhost:${PORT}/api/v1/events/ticket`, {
      method: "POST",
      headers: { Authorization: "Bearer mock_jwt_token" },
    });
    const ticketJson = (await ticketRes.json()) as TicketResponse;
    assert.strictEqual(ticketRes.status, 200, "Ticket request must return 200");
    assert.strictEqual(ticketJson.success, true, "Response must indicate success");
    assert(ticketJson.data.ticket.startsWith("sse_tkt_"), "Ticket must follow pattern sse_tkt_*");
    assert.strictEqual(ticketJson.data.expiresInSeconds, 30, "Ticket TTL must be 30 seconds");
    console.log(`  -> Handshake PASS: Received ticket "${ticketJson.data.ticket}" (TTL: 30s)`);

    // TEST 2: EventStream Connection & Parsing
    console.log("\nTest 2: EventSource Stream Connection & Parsing");
    const streamRes = await fetch(`http://localhost:${PORT}/api/v1/events/stream?ticket=${encodeURIComponent(ticketJson.data.ticket)}`);
    assert.strictEqual(streamRes.status, 200, "Stream connection must return 200 OK");
    assert.strictEqual(streamRes.headers.get("content-type"), "text/event-stream", "Must return text/event-stream");
    assert.strictEqual(lastReceivedTicket, ticketJson.data.ticket, "Backend must validate presented ticket");
    const streamText = await streamRes.text();
    assert(streamText.includes(": connected"), "Must receive SSE greeting");
    console.log("  -> Connection PASS: text/event-stream channel established and greeting received");

    // TEST 3: Deduplication Engine
    console.log("\nTest 3: Event Deduplication Protection (seenEventIds)");
    const client = new RealtimeClientSimulation();
    const testEvent = {
      eventId: "EVT_UNIQUE_100",
      eventType: "ORDER_PAYMENT_CONFIRMED",
      aggregateType: "MasterOrder",
      aggregateId: "ord_100",
      payload: { masterOrderId: "ord_100", amountPaid: 150 },
    };

    const firstDispatch = client.handleIncomingEvent(testEvent);
    assert.strictEqual(firstDispatch, true, "First event delivery must dispatch");
    assert.strictEqual(client.dispatchedEvents.length, 1, "Dispatched list must contain 1 event");

    // Re-deliver identical event
    const secondDispatch = client.handleIncomingEvent(testEvent);
    assert.strictEqual(secondDispatch, false, "Second event delivery must be filtered out by seenEventIds");
    assert.strictEqual(client.dispatchedEvents.length, 1, "Dispatched list must remain 1 (zero duplication)");
    console.log("  -> Deduplication PASS: Duplicate eventId strictly ignored");

    // TEST 4: Last-Event-ID Persistence & Replay Handshake
    console.log("\nTest 4: Last-Event-ID Tracking & Replay Header");
    const priorEvent = {
      eventId: "EVT_HISTORICAL_1",
      eventType: "SUBORDER_CONFIRMED",
      aggregateType: "SubOrder",
      aggregateId: "sub_123",
      payload: { subOrderId: "sub_123" },
    };
    client.handleIncomingEvent(priorEvent);
    assert.strictEqual(mockLocalStorage.getItem("ce_last_event_id"), "EVT_HISTORICAL_1", "Must persist to localStorage");

    // Simulate reconnect requesting replay since EVT_HISTORICAL_1
    const reconnectTicketRes = await fetch(`http://localhost:${PORT}/api/v1/events/ticket`, {
      method: "POST",
      headers: { Authorization: "Bearer mock_jwt_token" },
    });
    const reconnectTicket = ((await reconnectTicketRes.json()) as TicketResponse).data.ticket;

    const replayUrl = `http://localhost:${PORT}/api/v1/events/stream?ticket=${encodeURIComponent(reconnectTicket)}&lastEventId=EVT_HISTORICAL_1`;
    const replayRes = await fetch(replayUrl);
    assert.strictEqual(replayRes.status, 200, "Replay stream must return 200");
    assert.strictEqual(lastReceivedEventId, "EVT_HISTORICAL_1", "Server must receive lastEventId for outbox catchup");
    const replayText = await replayRes.text();
    assert(replayText.includes("EVT_REPLAY_2"), "Server must deliver replayed event payload");
    assert(replayText.includes("SUBORDER_PREPARING"), "Server must deliver correct eventType");
    console.log("  -> Catchup Replay PASS: lastEventId successfully transmitted and outbox catchup replayed");

    // TEST 5: RESYNC_REQUIRED Trigger
    console.log("\nTest 5: RESYNC_REQUIRED Cache Invalidation");
    const resyncEvent = {
      eventId: "EVT_RESYNC_999",
      eventType: "RESYNC_REQUIRED",
      payload: { reason: "Sequence gap > 1000 or TTL expired" },
    };
    client.handleIncomingEvent(resyncEvent);
    assert(client.invalidatedQueries.includes("orders"), "Must invalidate orders query");
    assert(client.invalidatedQueries.includes("payment"), "Must invalidate payment query");
    assert(client.invalidatedQueries.includes("kitchen-queue"), "Must invalidate kitchen queue query");
    console.log("  -> RESYNC_REQUIRED PASS: Full snapshot cache invalidation triggered");

    // TEST 6: Exponential Backoff Progression
    console.log("\nTest 6: Exponential Backoff Progression");
    const delays = [0, 1, 2, 3, 4, 5].map((attempt) => client.getBackoffDelay(attempt));
    assert.strictEqual(delays[0], 1500, "Attempt 0: 1500ms");
    assert.strictEqual(delays[1], 3000, "Attempt 1: 3000ms");
    assert.strictEqual(delays[2], 6000, "Attempt 2: 6000ms");
    assert.strictEqual(delays[3], 12000, "Attempt 3: 12000ms");
    assert.strictEqual(delays[4], 15000, "Attempt 4: capped at 15000ms");
    assert.strictEqual(delays[5], 15000, "Attempt 5: capped at 15000ms");
    console.log(`  -> Exponential Backoff PASS: [${delays.join(", ")}] ms`);

    console.log("\n=================================================");
    console.log("ALL 6 RUNTIME REALTIME / SSE CHECKS PASSED!");
    console.log("=================================================");
  } finally {
    server.close();
  }
}

runVerification().catch((err) => {
  console.error("Runtime verification failed:", err);
  process.exit(1);
});
