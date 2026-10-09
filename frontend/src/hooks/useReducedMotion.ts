"use client";
/**
 * Returns true if the user has enabled the prefers-reduced-motion
 * accessibility setting. Used to collapse animations at the MotionConfig level.
 *
 * Implemented with useSyncExternalStore to guarantee tearing-free reads,
 * clean SSR hydration, and zero cascading re-renders.
 */
import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
