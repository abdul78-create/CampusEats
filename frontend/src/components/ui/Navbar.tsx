"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Utensils,
  Menu,
  Compass,
  Palette,
  User,
  LogOut,
  ShieldCheck,
  LogIn,
  Store,
  ShoppingBag,
  Package,
  ChefHat,
  Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Drawer } from "./Drawer";
import { Dropdown } from "./Dropdown";
import { Button } from "./Button";
import { useAuth } from "@/features/auth/useAuth";
import { useCart } from "@/features/cart/useCart";
import { CartDrawer } from "@/features/cart/CartDrawer";
import { NotificationBell } from "@/features/notifications/NotificationBell";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const { itemCount, setIsCartOpen } = useCart();

  const navLinks = [
    { href: "/", label: "Home", icon: Compass },
    { href: "/stalls", label: "Stalls", icon: Store },
    { href: "/design-system", label: "Design System", icon: Palette },
  ];

  if (isAuthenticated && user?.role === "STUDENT") {
    navLinks.push({
      href: "/orders",
      label: "My Orders",
      icon: Package,
    });
    navLinks.push({
      href: "/student/profile",
      label: "My Profile",
      icon: User,
    });
    navLinks.push({
      href: "/student/onboarding",
      label: "Verification",
      icon: ShieldCheck,
    });
  } else if (isAuthenticated && user?.role === "ADMIN") {
    navLinks.push({
      href: "/admin",
      label: "Admin Portal",
      icon: ShieldCheck,
    });
  } else if (isAuthenticated && user?.role === "STALL_OWNER") {
    navLinks.push({
      href: "/owner",
      label: "Owner Portal",
      icon: ChefHat,
    });
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/85 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-lg p-1"
        >
          <div className="w-9 h-9 rounded-xl bg-[var(--accent)] flex items-center justify-center text-white shadow-sm shadow-[var(--brand-500)]/20 group-hover:scale-105 transition-transform duration-150">
            <Utensils className="w-5 h-5" aria-hidden="true" />
          </div>
          <span className="font-bold text-lg tracking-tight text-[var(--text-primary)]">
            Campus<span className="text-[var(--accent)]">Eats</span>
          </span>
        </Link>

        {/* Desktop Links */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] font-semibold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)]"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Auth Actions / User Dropdown */}
        <div className="hidden md:flex items-center gap-2.5">
          {/* Realtime Notifications Bell */}
          {isAuthenticated && <NotificationBell />}

          {/* Food Tray / Cart Trigger */}
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="relative p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            aria-label={`Open Food Tray with ${itemCount} items`}
          >
            <ShoppingBag className="w-5 h-5" />
            {itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </button>

          {isAuthenticated && user ? (
            <Dropdown
              trigger={
                <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border-default)] bg-[var(--bg-surface)] transition-colors">
                  <div className="w-7 h-7 rounded-lg bg-[var(--accent)] text-white flex items-center justify-center text-xs font-bold">
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="text-left text-xs">
                    <div className="font-semibold text-[var(--text-primary)] truncate max-w-[120px]">
                      {user.studentProfile?.fullName || user.email.split("@")[0]}
                    </div>
                    <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">
                      {user.role}
                    </div>
                  </div>
                </div>
              }
              items={[
                ...(user.role === "STUDENT"
                  ? [
                      {
                        label: "My Orders",
                        icon: <Package className="w-4 h-4" />,
                        onClick: () => {
                          router.push("/orders");
                        },
                      },
                      {
                        label: "Student Profile",
                        icon: <User className="w-4 h-4" />,
                        onClick: () => {
                          router.push("/student/profile");
                        },
                      },
                      {
                        label: "Verification Status",
                        icon: <ShieldCheck className="w-4 h-4" />,
                        onClick: () => {
                          router.push("/student/onboarding");
                        },
                      },
                    ]
                  : user.role === "ADMIN"
                  ? [
                      {
                        label: "Admin Command",
                        icon: <ShieldCheck className="w-4 h-4" />,
                        onClick: () => {
                          router.push("/admin");
                        },
                      },
                      {
                        label: "Verification Queue",
                        icon: <User className="w-4 h-4" />,
                        onClick: () => {
                          router.push("/admin/verifications");
                        },
                      },
                      {
                        label: "Audit Ledger",
                        icon: <Sliders className="w-4 h-4" />,
                        onClick: () => {
                          router.push("/admin/audit");
                        },
                      },
                      {
                        label: "Operating Hours",
                        icon: <Store className="w-4 h-4" />,
                        onClick: () => {
                          router.push("/admin/operating-hours");
                        },
                      },
                      {
                        label: "Refund Console",
                        icon: <Package className="w-4 h-4" />,
                        onClick: () => {
                          router.push("/admin/refunds");
                        },
                      },
                    ]
                  : [
                      {
                        label: "Stall Dashboard",
                        icon: <Store className="w-4 h-4" />,
                        onClick: () => {
                          router.push("/owner");
                        },
                      },
                      {
                        label: "Kitchen Queue",
                        icon: <ChefHat className="w-4 h-4" />,
                        onClick: () => {
                          router.push("/owner/orders");
                        },
                      },
                      {
                        label: "Menu & Inventory",
                        icon: <Utensils className="w-4 h-4" />,
                        onClick: () => {
                          router.push("/owner/menu");
                        },
                      },
                      {
                        label: "Stall Settings",
                        icon: <Sliders className="w-4 h-4" />,
                        onClick: () => {
                          router.push("/owner/settings");
                        },
                      },
                    ]),
                "divider",
                {
                  label: "Sign Out",
                  icon: <LogOut className="w-4 h-4" />,
                  danger: true,
                  onClick: () => logout(),
                },
              ]}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button size="sm" variant="ghost" leftIcon={<LogIn className="w-4 h-4" />}>
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button size="sm" variant="primary">
                  Register
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Actions: Notifications, Cart & Menu Trigger */}
        <div className="md:hidden flex items-center gap-1.5">
          {isAuthenticated && <NotificationBell />}
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="relative p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors"
            aria-label={`Open Food Tray with ${itemCount} items`}
          >
            <ShoppingBag className="w-5 h-5" />
            {itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[9px] font-bold flex items-center justify-center">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      <Drawer
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        position="right"
        title="Navigation"
        description="CampusEats Mobile Menu"
      >
        <div className="flex flex-col gap-2">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                  isActive
                    ? "bg-[var(--accent-subtle)] text-[var(--accent-text)] font-semibold"
                    : "text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)]"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{link.label}</span>
              </Link>
            );
          })}

          <div className="mt-6 pt-6 border-t border-[var(--border-subtle)] space-y-3">
            {isAuthenticated && user ? (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] text-xs">
                  <div className="font-semibold text-[var(--text-primary)]">
                    {user.email}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-[var(--accent)] mt-0.5">
                    Role: {user.role}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                  leftIcon={<LogOut className="w-4 h-4" />}
                  onClick={() => {
                    setMobileOpen(false);
                    logout();
                  }}
                >
                  Sign Out
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link href="/login" onClick={() => setMobileOpen(false)}>
                  <Button variant="outline" className="w-full justify-center" size="sm">
                    Sign In
                  </Button>
                </Link>
                <Link href="/register" onClick={() => setMobileOpen(false)}>
                  <Button variant="primary" className="w-full justify-center" size="sm">
                    Create Account
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </Drawer>

      {/* Slide-over Food Tray Drawer */}
      <CartDrawer />
    </header>
  );
}
