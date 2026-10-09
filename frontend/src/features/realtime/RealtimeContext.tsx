"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "@/lib/api/client";
import { useAuth } from "@/features/auth/useAuth";
import type { DomainEventEnvelope, DomainEventType } from "@/types/api";
import type {
  ConnectionStatus,
  RealtimeEventListener,
  RealtimeContextValue,
} from "./realtimeTypes";

const LAST_EVENT_ID_KEY = "ce_last_event_id";
const MAX_SEEN_EVENTS = 500;

const ALL_DOMAIN_EVENTS: DomainEventType[] = [
  "ORDER_PAYMENT_CONFIRMED",
  "BALANCE_PAYMENT_CONFIRMED",
  "PAYMENT_FAILED",
  "PAYMENT_EXPIRED",
  "REFUND_PROCESSED",
  "SUBORDER_CONFIRMED",
  "SUBORDER_PREPARING",
  "SUBORDER_READY",
  "SUBORDER_COLLECTED",
  "SUBORDER_REJECTED",
  "KITCHEN_ORDER_INCOMING",
  "KITCHEN_SURGE_ALERT",
  "PICKUP_GRACE_WARNING",
  "PICKUP_GRACE_EXPIRED",
  "RESYNC_REQUIRED",
  "SESSION_TERMINATED",
];

const RealtimeContext = createContext<RealtimeContextValue | undefined>(undefined);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<ConnectionStatus>("DISCONNECTED");
  const [lastEventId, setLastEventId] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<DomainEventEnvelope | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const listenersRef = useRef<Map<string, Set<RealtimeEventListener>>>(new Map());
  const connectRef = useRef<() => void>(() => {});

  // Load lastEventId from localStorage safely on client mount
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = localStorage.getItem(LAST_EVENT_ID_KEY);
        if (stored) {
          setLastEventId(stored);
        }
      } catch {
        // Ignore localStorage errors
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const dispatchEvent = useCallback(
    (event: DomainEventEnvelope) => {
      // 1. Deduplication check
      if (event.eventId && seenEventIdsRef.current.has(event.eventId)) {
        return;
      }
      if (event.eventId) {
        seenEventIdsRef.current.add(event.eventId);
        if (seenEventIdsRef.current.size > MAX_SEEN_EVENTS) {
          const first = seenEventIdsRef.current.values().next().value;
          if (first) seenEventIdsRef.current.delete(first);
        }
      }

      // 2. Update last event pointer
      if (event.eventId) {
        setLastEventId(event.eventId);
        try {
          localStorage.setItem(LAST_EVENT_ID_KEY, event.eventId);
        } catch {
          // Ignore storage write error
        }
      }
      setLastEvent(event);

      // 3. Invalidate TanStack query cache for authoritative data sync
      if (event.eventType === "RESYNC_REQUIRED") {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        queryClient.invalidateQueries({ queryKey: ["payment"] });
        queryClient.invalidateQueries({ queryKey: ["kitchen-queue"] });
      } else if (
        event.eventType.startsWith("SUBORDER_") ||
        event.eventType.startsWith("ORDER_")
      ) {
        queryClient.invalidateQueries({ queryKey: ["orders"] });
        if (event.aggregateId) {
          queryClient.invalidateQueries({ queryKey: ["order", event.aggregateId] });
        }
      }

      // 4. Notify type-specific listeners
      const typeListeners = listenersRef.current.get(event.eventType);
      if (typeListeners) {
        typeListeners.forEach((listener) => {
          try {
            listener(event);
          } catch (err) {
            console.error("Error in realtime event listener:", err);
          }
        });
      }

      // 5. Notify wildcard "*" listeners
      const wildcardListeners = listenersRef.current.get("*");
      if (wildcardListeners) {
        wildcardListeners.forEach((listener) => {
          try {
            listener(event);
          } catch (err) {
            console.error("Error in wildcard realtime listener:", err);
          }
        });
      }
    },
    [queryClient]
  );

  const connect = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setStatus("DISCONNECTED");
      return;
    }

    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      setStatus(retryCountRef.current > 0 ? "RECONNECTING" : "CONNECTING");

      // 1. Request short-lived single-use ticket (30s) from backend
      const res = await apiPost<{ ticket: string; expiresInSeconds: number }>(
        "/events/ticket"
      );
      const ticket = res.ticket;

      // 2. Build EventSource URL
      let url = `/api/v1/events/stream?ticket=${encodeURIComponent(ticket)}`;
      const currentLastId = localStorage.getItem(LAST_EVENT_ID_KEY);
      if (currentLastId) {
        url += `&lastEventId=${encodeURIComponent(currentLastId)}`;
      }

      // 3. Instantiate browser EventSource
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        setStatus("CONNECTED");
        retryCountRef.current = 0;
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        setStatus("RECONNECTING");

        // Exponential backoff reconnect: 1.5s, 3s, 6s, 12s, max 15s
        const delay = Math.min(
          1500 * Math.pow(2, retryCountRef.current),
          15000
        );
        retryCountRef.current += 1;

        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = setTimeout(() => {
          connectRef.current();
        }, delay);
      };

      // 4. Attach handlers for all domain events
      const handleGenericEvent = (e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data) as DomainEventEnvelope;
          if (parsed && parsed.eventType) {
            dispatchEvent(parsed);
          }
        } catch (parseErr) {
          console.warn("Failed to parse realtime event data:", parseErr);
        }
      };

      es.onmessage = handleGenericEvent;

      ALL_DOMAIN_EVENTS.forEach((evType) => {
        es.addEventListener(evType, handleGenericEvent);
      });
    } catch {
      setStatus("ERROR");
      const delay = Math.min(
        2000 * Math.pow(2, retryCountRef.current),
        15000
      );
      retryCountRef.current += 1;

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = setTimeout(() => {
        connectRef.current();
      }, delay);
    }
  }, [isAuthenticated, user, dispatchEvent]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    let mounted = true;
    let timer: NodeJS.Timeout | null = null;

    if (isAuthenticated) {
      timer = setTimeout(() => {
        if (mounted) {
          connect();
        }
      }, 0);
    } else {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      timer = setTimeout(() => {
        if (mounted) {
          setStatus("DISCONNECTED");
        }
      }, 0);
    }

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [isAuthenticated, connect]);

  const subscribe = useCallback(
    (
      eventType: DomainEventType | "*" | string,
      callback: RealtimeEventListener
    ) => {
      if (!listenersRef.current.has(eventType)) {
        listenersRef.current.set(eventType, new Set());
      }
      listenersRef.current.get(eventType)!.add(callback);

      return () => {
        const set = listenersRef.current.get(eventType);
        if (set) {
          set.delete(callback);
          if (set.size === 0) {
            listenersRef.current.delete(eventType);
          }
        }
      };
    },
    []
  );

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    connect();
  }, [connect]);

  return (
    <RealtimeContext.Provider
      value={{
        status,
        lastEventId,
        lastEvent,
        subscribe,
        reconnect,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtimeContext(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtimeContext must be used within a RealtimeProvider");
  }
  return ctx;
}
