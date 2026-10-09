import type { DomainEventEnvelope, DomainEventType } from "@/types/api";

export type ConnectionStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "ERROR";

export type RealtimeEventListener = (event: DomainEventEnvelope) => void;

export interface RealtimeContextValue {
  status: ConnectionStatus;
  lastEventId: string | null;
  lastEvent: DomainEventEnvelope | null;
  subscribe: (
    eventType: DomainEventType | "*" | string,
    callback: RealtimeEventListener
  ) => () => void;
  reconnect: () => void;
}
