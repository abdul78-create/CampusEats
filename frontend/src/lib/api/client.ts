/**
 * CampusEats — Typed HTTP client
 *
 * Wraps axios with:
 * - Bearer token injection
 * - Silent 401 -> refresh -> retry
 * - Structured error normalisation
 * - Request-ID header on every request
 * - Idempotency-Key on mutating requests
 */
import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { config } from "@/config";
import { tokenStore } from "@/lib/auth/tokenStore";
import type { ApiError, ApiSuccess } from "@/types/api";

let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

function drainQueue(token: string) {
  refreshQueue.forEach((cb) => cb(token));
  refreshQueue = [];
}

export const httpClient: AxiosInstance = axios.create({
  baseURL: config.api.baseUrl,
  timeout: config.api.timeout,
  headers: { "Content-Type": "application/json" },
  withCredentials: false, // refresh token sent in body, not cookie
});

// -- Request interceptor: inject auth + tracing headers ---------------------
httpClient.interceptors.request.use((req: InternalAxiosRequestConfig) => {
  const token = tokenStore.getAccessToken();
  if (token) {
    req.headers.set("Authorization", `Bearer ${token}`);
  }

  // Unique trace ID per request
  req.headers.set("X-Request-ID", crypto.randomUUID());

  // Idempotency key on state-mutating methods
  if (req.method && ["post", "put", "patch", "delete"].includes(req.method)) {
    if (!req.headers.get("Idempotency-Key")) {
      req.headers.set("Idempotency-Key", crypto.randomUUID());
    }
  }

  return req;
});

// -- Response interceptor: 401 silent refresh + retry -----------------------
httpClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retried?: boolean;
    };

    if (
      error.response?.status === 401 &&
      !originalRequest._retried &&
      !originalRequest.url?.includes("/auth/")
    ) {
      if (isRefreshing) {
        // Queue this request until the in-flight refresh completes
        return new Promise<string>((resolve) => {
          refreshQueue.push(resolve);
        }).then((newToken) => {
          originalRequest.headers.set("Authorization", `Bearer ${newToken}`);
          return httpClient(originalRequest);
        });
      }

      originalRequest._retried = true;
      isRefreshing = true;

      try {
        const rt = tokenStore.getRefreshToken();
        if (!rt) throw new Error("No refresh token available");

        const { data } = await axios.post<ApiSuccess<{ tokens: { accessToken: string; refreshToken: string } }>>(
          `${config.api.baseUrl}/auth/refresh`,
          { refreshToken: rt },
          { timeout: config.api.timeout }
        );

        const { accessToken, refreshToken } = data.data.tokens;
        tokenStore.setTokens(accessToken, refreshToken);
        drainQueue(accessToken);
        originalRequest.headers.set("Authorization", `Bearer ${accessToken}`);
        return httpClient(originalRequest);
      } catch {
        tokenStore.clearTokens();
        drainQueue("");
        // Broadcast session-expired so any listener can redirect to /login
        window.dispatchEvent(new CustomEvent("ce:session-expired"));
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// -- Typed helpers ----------------------------------------------------------

/**
 * Extracts the typed `data` field from a successful ApiSuccess envelope.
 * Throws a normalised ApiError object on HTTP errors.
 */
export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await httpClient.get<ApiSuccess<T>>(url, { params });
  return res.data.data;
}

export async function apiPost<T>(
  url: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<T> {
  const res = await httpClient.post<ApiSuccess<T>>(url, body, { headers });
  return res.data.data;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await httpClient.patch<ApiSuccess<T>>(url, body);
  return res.data.data;
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  const res = await httpClient.put<ApiSuccess<T>>(url, body);
  return res.data.data;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await httpClient.delete<ApiSuccess<T>>(url);
  return res.data.data;
}

// -- Error normalisation ---------------------------------------------------

export function normaliseApiError(err: unknown): ApiError["error"] {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as Partial<ApiError> | undefined;
    if (body?.error) return body.error;
    return {
      code: `HTTP_${err.response?.status ?? "NETWORK"}`,
      message: err.message ?? "Network error",
      requestId: undefined,
    };
  }
  return {
    code: "UNKNOWN",
    message: err instanceof Error ? err.message : "Unknown error",
    requestId: undefined,
  };
}
