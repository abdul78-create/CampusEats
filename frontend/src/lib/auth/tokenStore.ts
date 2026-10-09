/**
 * CampusEats — In-memory access token store + localStorage refresh token.
 *
 * Access token: held in a module-level closure — never written to localStorage,
 * never exposed to the DOM, never sent as a cookie.
 *
 * Refresh token: persisted in localStorage under config.auth.refreshTokenKey.
 * This matches AUTHENTICATION.md §7 (browser client without HttpOnly cookies).
 * When the backend upgrades to HttpOnly cookies, this module is the only place
 * that needs to change.
 */

import { config } from "@/config";

let _accessToken: string | null = null;

export const tokenStore = {
  getAccessToken(): string | null {
    return _accessToken;
  },

  getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(config.auth.refreshTokenKey);
  },

  setTokens(accessToken: string, refreshToken: string): void {
    _accessToken = accessToken;
    if (typeof window !== "undefined") {
      localStorage.setItem(config.auth.refreshTokenKey, refreshToken);
    }
  },

  setAccessToken(accessToken: string): void {
    _accessToken = accessToken;
  },

  clearTokens(): void {
    _accessToken = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem(config.auth.refreshTokenKey);
    }
  },

  hasRefreshToken(): boolean {
    return !!this.getRefreshToken();
  },
};
