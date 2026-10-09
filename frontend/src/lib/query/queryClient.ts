/**
 * CampusEats — TanStack Query client
 *
 * Centralised query client configuration.
 * Retry logic excludes 4xx responses (they are not transient).
 */
import { QueryClient } from "@tanstack/react-query";
import axios from "axios";
import { config } from "@/config";

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    // Never retry 4xx — these are deterministic failures
    if (status && status >= 400 && status < 500) return false;
  }
  return failureCount < config.query.retryCount;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: config.query.staleTime,
      gcTime: config.query.gcTime,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});
