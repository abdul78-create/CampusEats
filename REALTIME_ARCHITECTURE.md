# CampusEats — Realtime & Event Infrastructure Specification

## 1. Realtime Philosophy & Role in Congestion Control

Realtime communication is foundational to CampusEats. Without instantaneous updates:
- Students would crowd stall pickup counters guessing whether their order is ready.
- Kitchens would lack live visibility into incoming queue spikes.
- Pickup schedule shifts caused by kitchen surges would not reach students in time to prevent premature counter arrivals.

CampusEats provides a transport-agnostic **`RealtimeGatewayProvider`** that decouples event emission from physical connection protocols.

---

## 2. Realtime Event Catalog

Every event published across the platform carries a standardized envelope:

```typescript
export interface RealtimeEvent<T = unknown> {
  id: string;               // Unique UUIDv4 per event instance
  sequenceNumber: number;   // Monotonic sequence number per channel
  eventType: RealtimeEventType;
  channel: string;          // e.g. "student:usr_102", "stall:stl_55", "platform:global"
  timestamp: string;        // ISO 8601 UTC
  payload: T;
}
```

### Standard Event Types

| Event Type | Channel Target | Triggering Domain Action |
| :--- | :--- | :--- |
| `ORDER_CREATED` | `stall:<stallId>` | MasterOrder decomposed and checkout completed. |
| `PAYMENT_VERIFIED` | `student:<studentId>` | Payment gateway webhook confirmed advance deposit. |
| `SUB_ORDER_STATUS_CHANGED` | `student:<studentId>`, `stall:<stallId>` | SubOrder moved to `PREPARING`, `READY`, or `COLLECTED`. |
| `STALL_STATUS_CHANGED` | `platform:stalls` | Stall toggled between `OPEN`, `BUSY`, `PAUSED`, `CLOSED`. |
| `QUEUE_CONGESTION_CHANGED`| `platform:stalls` | Live queue depth crossed rush thresholds (80%). |
| `ITEM_STOCK_CHANGED` | `stall:<stallId>`, `platform:stalls` | Menu item inventory depleted or marked `SOLD_OUT`. |
| `SCHEDULE_SHIFTED` | `student:<studentId>` | Dynamic scheduler recomputed pickup time due to surge. |
| `SUB_ORDER_REFUND_PROCESSED`| `student:<studentId>` | Bank credit reversal completed for isolated refund. |
| `NOTIFICATION_CREATED` | `user:<userId>` | New persistent user alert generated. |

---

## 3. Reliability, Reconnects & Deduplication

In a campus environment with intermittent Wi-Fi and cell handoffs, network drops are frequent. The realtime layer guarantees reliability through four mechanisms:

### 3.1 Monotonic Sequence Numbers & Gap Detection
Every channel stream assigns an incrementing `sequenceNumber`. When a client reconnects, it sends `Last-Event-ID: <seq>`. If a gap is detected:
1. The server replays missed events from a rolling Redis ring buffer (TTL: 10 minutes).
2. If the gap exceeds buffer retention, the client receives a `RESYNC_REQUIRED` signal and fetches state via standard REST endpoints (`GET /orders/my-orders`).

### 3.2 Deduplication Keys
Clients and server handlers cache processed `eventId` keys in memory / Redis for 10 minutes. If a retransmitted event arrives, it is safely dropped.

### 3.3 Heartbeats & Liveness
The server issues periodic ping frames every 30 seconds. If an ack frame is not received within 10 seconds, the socket is recycled and client auto-reconnect initiates with exponential backoff.

---

## 4. Production Transport Strategy

```
               [React Web Client (Phase 15)]
                            │
              WSS / HTTPS (Sticky Sessions)
                            ▼
              [Reverse Proxy / Nginx / ALB]
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
      [Node Instance A]           [Node Instance B]
              │                           │
              └─────────────┬─────────────┘
                            ▼
                [Redis Pub/Sub Event Bus]
```

- **Transport**: WebSockets (`ws`) as primary interactive transport, with Server-Sent Events (`SSE`) as fallback for restrictive campus proxy firewalls.
- **Horizontal Scaling**: Cluster coordination via Redis Pub/Sub channels to broadcast messages across multiple backend Node.js worker nodes.
