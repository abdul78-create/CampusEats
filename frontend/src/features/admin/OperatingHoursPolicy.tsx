"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Save,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/Skeleton";
import type { Stall } from "@/types/api";
import type { AdminOperatingHourItem } from "./adminTypes";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DEFAULT_HOURS: AdminOperatingHourItem[] = [
  { dayOfWeek: 0, openTime: "08:00", closeTime: "22:00" },
  { dayOfWeek: 1, openTime: "08:00", closeTime: "22:00" },
  { dayOfWeek: 2, openTime: "08:00", closeTime: "22:00" },
  { dayOfWeek: 3, openTime: "08:00", closeTime: "22:00" },
  { dayOfWeek: 4, openTime: "08:00", closeTime: "22:00" },
  { dayOfWeek: 5, openTime: "08:00", closeTime: "22:00" },
  { dayOfWeek: 6, openTime: "08:00", closeTime: "22:00" },
];

export function OperatingHoursPolicy() {
  const [selectedStallId, setSelectedStallId] = useState<string>("");
  const [hours, setHours] = useState<AdminOperatingHourItem[]>(DEFAULT_HOURS);
  const [isSaving, setIsSaving] = useState(false);

  // 1. Fetch Stalls
  const { data: stalls, isLoading: isLoadingStalls } = useQuery<Stall[]>({
    queryKey: ["stalls"],
    queryFn: () => apiGet<Stall[]>("/stalls"),
  });

  // Auto-select first stall
  useEffect(() => {
    if (stalls && stalls.length > 0 && !selectedStallId) {
      const timer = setTimeout(() => {
        setSelectedStallId(stalls[0].id);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [stalls, selectedStallId]);

  const handleTimeChange = (
    dayIndex: number,
    field: "openTime" | "closeTime",
    val: string
  ) => {
    setHours((prev) =>
      prev.map((h) => (h.dayOfWeek === dayIndex ? { ...h, [field]: val } : h))
    );
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStallId) {
      toastError("Please select a campus stall first.");
      return;
    }

    setIsSaving(true);
    try {
      await apiPost("/admin/operating-hours", {
        stallId: selectedStallId,
        hours,
      });
      toastSuccess(
        "Operating Hours Updated",
        "Official schedule deployed to stall policy."
      );
    } catch (err) {
      toastError(err, "Failed to update operating hours schedule");
    } finally {
      setIsSaving(false);
    }
  };

  const selectedStall = (stalls || []).find((s) => s.id === selectedStallId);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Admin Command
            </Link>
            <span className="text-[var(--text-tertiary)]">/</span>
            <span className="text-xs font-semibold text-[var(--accent-text)]">
              Operating Hours
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight mt-1">
            Official Operating Hours Schedule
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Define official operational schedules per stall. Stall owners are blocked from opening outside these bounds.
          </p>
        </div>
      </div>

      {isLoadingStalls ? (
        <CardSkeleton />
      ) : (
        <form onSubmit={handleSaveSchedule} className="space-y-6">
          {/* Stall Selector Card */}
          <Card className="p-5">
            <label className="block text-xs font-bold text-[var(--text-primary)] mb-2">
              Select Campus Food Stall
            </label>
            <select
              value={selectedStallId}
              onChange={(e) => setSelectedStallId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] font-semibold"
            >
              {(stalls || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.campusBlock || "Main Complex"})
                </option>
              ))}
            </select>
            {selectedStall && (
              <div className="text-xs text-[var(--text-secondary)] mt-2">
                Configuring official operating policy for <strong className="text-[var(--text-primary)]">{selectedStall.name}</strong>.
              </div>
            )}
          </Card>

          {/* 7-Day Schedule Grid */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">7-Day Weekly Schedule (HH:MM)</CardTitle>
              <CardDescription>
                Configure permissible daily opening and closing hours for this stall.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {DAY_NAMES.map((dayName, idx) => {
                const hourEntry = hours.find((h) => h.dayOfWeek === idx) || {
                  dayOfWeek: idx,
                  openTime: "08:00",
                  closeTime: "22:00",
                };

                return (
                  <div
                    key={dayName}
                    className="p-3 sm:p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="w-28 font-bold text-xs text-[var(--text-primary)]">
                      {dayName}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[var(--text-secondary)]">Opens:</span>
                        <input
                          type="time"
                          value={hourEntry.openTime}
                          onChange={(e) => handleTimeChange(idx, "openTime", e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono"
                          required
                        />
                      </div>

                      <span className="text-[var(--text-tertiary)]">&ndash;</span>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-[var(--text-secondary)]">Closes:</span>
                        <input
                          type="time"
                          value={hourEntry.closeTime}
                          onChange={(e) => handleTimeChange(idx, "closeTime", e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] font-mono"
                          required
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>

            <CardFooter className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={isSaving}
                leftIcon={<Save className="w-4 h-4" />}
              >
                Deploy Operating Policy
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
    </div>
  );
}
