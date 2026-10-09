/**
 * CampusEats Frontend — Centralized Configuration
 */

export const config = {
  app: {
    name: process.env.NEXT_PUBLIC_APP_NAME ?? "CampusEats",
    version: "1.0.0",
    env: process.env.NEXT_PUBLIC_APP_ENV ?? "development",
  },

  api: {
    baseUrl: "/api/v1",
    timeout: 15_000,
  },

  auth: {
    refreshTokenKey: "ce_rt",
    accessTokenTtlMs: 14 * 60 * 1000,
  },

  payment: {
    advancePercentageOptions: [50, 60, 70, 80, 90, 100] as const,
  },

  realtime: {
    heartbeatIntervalMs: 30_000,
    reconnectBaseDelayMs: 1_000,
    reconnectMaxDelayMs: 30_000,
    reconnectMaxAttempts: 10,
    eventDeduplicationWindowMs: 10 * 60 * 1000,
  },

  query: {
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
    retryCount: 2,
  },
} as const;

export type AdvancePercentage =
  (typeof config.payment.advancePercentageOptions)[number];
