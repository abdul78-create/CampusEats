"use client";

import { useEffect, useRef } from "react";
import { useRealtimeContext } from "./RealtimeContext";
import type { DomainEventEnvelope, DomainEventType } from "@/types/api";
import type { RealtimeEventListener } from "./realtimeTypes";

export function useRealtime() {
  return useRealtimeContext();
}

/**
 * Convenience hook that safely subscribes to a specific domain event type,
 * ensuring automatic cleanup on unmount or dependency changes.
 */
export function useRealtimeSubscription(
  eventType: DomainEventType | "*" | string,
  handler: RealtimeEventListener
) {
  const { subscribe } = useRealtime();
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    const unsubscribe = subscribe(eventType, (ev: DomainEventEnvelope) => {
      handlerRef.current(ev);
    });
    return unsubscribe;
  }, [eventType, subscribe]);
}
