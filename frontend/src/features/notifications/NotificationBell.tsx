"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCheck,
  Trash2,
  Package,
  CreditCard,
  Clock,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { useNotifications } from "./NotificationsContext";
import type { NotificationCategory } from "./notificationTypes";

function getCategoryIcon(cat: NotificationCategory) {
  switch (cat) {
    case "ORDER":
      return <Package className="w-4 h-4 text-[var(--accent)]" />;
    case "PAYMENT":
      return <CreditCard className="w-4 h-4 text-emerald-500" />;
    case "OPERATIONAL":
      return <Clock className="w-4 h-4 text-amber-500" />;
    default:
      return <Bell className="w-4 h-4 text-[var(--text-tertiary)]" />;
  }
}

function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | NotificationCategory>("ALL");
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } =
    useNotifications();
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const filteredNotifications = notifications.filter((n) => {
    if (filter === "ALL") return true;
    return n.category === filter;
  });

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={isOpen}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center shadow-sm animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Flyout Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[var(--text-primary)]">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-[var(--accent-subtle)] text-[var(--accent-text)]">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="p-1.5 rounded-lg text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors flex items-center gap-1"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline text-[11px]">Mark read</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--danger)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors"
                  title="Clear all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="px-3 py-2 border-b border-[var(--border-subtle)] flex items-center gap-1 bg-[var(--bg-base)] text-xs overflow-x-auto">
            {(["ALL", "ORDER", "PAYMENT", "OPERATIONAL"] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilter(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                    filter === cat
                      ? "bg-[var(--accent)] text-white shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-200)] dark:hover:bg-[var(--neutral-700)]"
                  }`}
                >
                  {cat === "ALL"
                    ? "All"
                    : cat.charAt(0) + cat.slice(1).toLowerCase()}
                </button>
              )
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-subtle)]">
            {filteredNotifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--text-secondary)] space-y-1">
                <Sparkles className="w-6 h-6 mx-auto text-[var(--text-tertiary)]" />
                <p className="font-semibold text-[var(--text-primary)]">
                  All caught up!
                </p>
                <p className="text-[11px]">No notifications right now.</p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => {
                    markAsRead(notif.id);
                    if (notif.actionUrl) {
                      setIsOpen(false);
                      router.push(notif.actionUrl);
                    }
                  }}
                  className={`p-3.5 flex items-start gap-3 hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] cursor-pointer transition-colors ${
                    !notif.read ? "bg-[var(--accent-subtle)]/30" : ""
                  }`}
                >
                  <div className="mt-0.5 w-7 h-7 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                    {getCategoryIcon(notif.category)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p
                        className={`text-xs truncate ${
                          !notif.read
                            ? "font-bold text-[var(--text-primary)]"
                            : "font-medium text-[var(--text-secondary)]"
                        }`}
                      >
                        {notif.title}
                      </p>
                      <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">
                        {formatTimestamp(notif.timestamp)}
                      </span>
                    </div>

                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 line-clamp-2 leading-relaxed">
                      {notif.message}
                    </p>

                    {notif.actionUrl && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-[var(--accent)] hover:underline">
                        <span>View Order</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>

                  {!notif.read && (
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0 mt-1.5" />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-2.5 border-t border-[var(--border-subtle)] bg-[var(--bg-base)] text-center">
            <Link
              href="/orders"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-[var(--accent)] hover:underline"
            >
              View Active Orders & History →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
