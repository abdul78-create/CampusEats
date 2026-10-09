"use client";
/**
 * CampusEats - Root client-side providers
 *
 * Composes all global context providers in one place:
 *   1. TanStack Query (server-state)
 *   2. Framer Motion config (reduced-motion)
 *   3. Authentication Provider (session lifecycle)
 *   4. Cart Provider (tray state & multi-stall grouping)
 *   5. Sonner toast container
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { Toaster } from "sonner";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { queryClient } from "@/lib/query/queryClient";
import { AuthProvider } from "@/features/auth/AuthContext";
import { RealtimeProvider } from "@/features/realtime/RealtimeContext";
import { NotificationsProvider } from "@/features/notifications/NotificationsContext";
import { CartProvider } from "@/features/cart/CartContext";

export function Providers({ children }: { children: React.ReactNode }) {
  const reducedMotion = useReducedMotion();

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion={reducedMotion ? "always" : "never"}>
        <AuthProvider>
          <RealtimeProvider>
            <NotificationsProvider>
              <CartProvider>
                {children}
                <Toaster
                  position="top-right"
                  richColors
                  closeButton
                  toastOptions={{
                    duration: 4000,
                    classNames: {
                      toast: "font-sans text-sm",
                    },
                  }}
                />
              </CartProvider>
            </NotificationsProvider>
          </RealtimeProvider>
        </AuthProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
