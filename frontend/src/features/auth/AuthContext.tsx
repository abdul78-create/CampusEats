"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { tokenStore } from "@/lib/auth/tokenStore";
import { apiGet, apiPost } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import type { AuthUser, TokenPair } from "@/types/api";

export interface RegisterPayload {
  fullName: string;
  universityRegNumber: string;
  email: string;
  phoneNumber: string;
  password: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const refreshUser = useCallback(async () => {
    try {
      const userData = await apiGet<AuthUser>("/auth/me");
      setUser(userData);
    } catch {
      setUser(null);
    }
  }, []);

  // Initialize session on mount
  useEffect(() => {
    async function initAuth() {
      try {
        if (tokenStore.hasRefreshToken()) {
          const rt = tokenStore.getRefreshToken();
          const { tokens } = await apiPost<{ tokens: TokenPair }>(
            "/auth/refresh",
            { refreshToken: rt }
          );
          tokenStore.setTokens(tokens.accessToken, tokens.refreshToken);
          await refreshUser();
        }
      } catch {
        tokenStore.clearTokens();
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();

    // Listen for session expiry event dispatched by HTTP client
    const handleExpired = () => {
      setUser(null);
      tokenStore.clearTokens();
      toastError("Your session has expired. Please sign in again.");
      router.push("/login");
    };

    window.addEventListener("ce:session-expired", handleExpired);
    return () => {
      window.removeEventListener("ce:session-expired", handleExpired);
    };
  }, [refreshUser, router]);

  const login = async (identifier: string, password: string) => {
    setIsLoading(true);
    try {
      const data = await apiPost<{ user: AuthUser; tokens: TokenPair }>(
        "/auth/login",
        { identifier, password }
      );
      tokenStore.setTokens(data.tokens.accessToken, data.tokens.refreshToken);
      setUser(data.user);
      toastSuccess("Welcome back", `Signed in as ${data.user.email}`);

      // Route based on role
      if (data.user.role === "STUDENT") {
        const studentStatus = data.user.studentProfile?.accountStatus;
        if (studentStatus === "PENDING_VERIFICATION") {
          router.push("/student/onboarding");
        } else {
          router.push("/student/profile");
        }
      } else {
        router.push("/");
      }
    } catch (err) {
      toastError(err, "Sign-in failed. Please check your credentials.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (payload: RegisterPayload) => {
    setIsLoading(true);
    try {
      const data = await apiPost<{ user: AuthUser; tokens: TokenPair }>(
        "/auth/register",
        payload
      );
      tokenStore.setTokens(data.tokens.accessToken, data.tokens.refreshToken);
      setUser(data.user);
      toastSuccess("Account created", "Welcome to CampusEats!");
      router.push("/student/onboarding");
    } catch (err) {
      toastError(err, "Registration failed. Please check your details.");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      const rt = tokenStore.getRefreshToken();
      await apiPost("/auth/logout", { refreshToken: rt }).catch(() => {});
    } finally {
      tokenStore.clearTokens();
      setUser(null);
      toastSuccess("Signed out", "You have been safely signed out.");
      router.push("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
