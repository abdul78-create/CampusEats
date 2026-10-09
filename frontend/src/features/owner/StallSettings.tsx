"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Sliders,
  AlertCircle,
  Save,
  Calendar,
} from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { Input } from "@/components/ui/Input";
import { StallStatusBadge } from "@/components/ui/StatusBadge";
import type { StallStatus } from "@/types/api";
import type { OwnerStallData } from "./ownerTypes";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function StallSettings() {
  const {
    data: stall,
    isLoading,
    isError,
    refetch,
  } = useQuery<OwnerStallData>({
    queryKey: ["owner-stall"],
    queryFn: () => apiGet<OwnerStallData>("/owner/stall"),
  });

  // Capacity Form State
  const [maxActiveOrders, setMaxActiveOrders] = useState("20");
  const [parallelPrep, setParallelPrep] = useState("3");
  const [bufferMinutes, setBufferMinutes] = useState("2");
  const [pickupInterval, setPickupInterval] = useState("10");
  const [isSavingCapacity, setIsSavingCapacity] = useState(false);

  // Status Switcher
  const [isSavingStatus, setIsSavingStatus] = useState(false);

  useEffect(() => {
    if (stall?.capacity) {
      const cap = stall.capacity;
      const timer = setTimeout(() => {
        setMaxActiveOrders(String(cap.maxActiveOrders || 20));
        setParallelPrep(String(cap.parallelPreparationLimit || 3));
        setBufferMinutes(String(cap.operationalBufferMinutes || 2));
        setPickupInterval(String(cap.pickupIntervalMinutes || 10));
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [stall]);

  const handleUpdateStatus = async (status: StallStatus) => {
    setIsSavingStatus(true);
    try {
      await apiPatch("/owner/stall/status", { status });
      toastSuccess("Status updated", `Stall is now ${status}`);
      refetch();
    } catch (err) {
      toastError(err, "Failed to update stall status");
    } finally {
      setIsSavingStatus(false);
    }
  };

  const handleSaveCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingCapacity(true);
    try {
      await apiPatch("/owner/stall/capacity", {
        maxActiveOrders: parseInt(maxActiveOrders, 10) || 20,
        parallelPreparationLimit: parseInt(parallelPrep, 10) || 3,
        operationalBufferMinutes: parseInt(bufferMinutes, 10) || 2,
        pickupIntervalMinutes: parseInt(pickupInterval, 10) || 10,
      });
      toastSuccess("Capacity model updated", "Queue engine parameters reconfigured.");
      refetch();
    } catch (err) {
      toastError(err, "Failed to save capacity settings");
    } finally {
      setIsSavingCapacity(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError || !stall) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-[var(--danger)] mx-auto" />
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Failed to load stall settings
        </h2>
        <Button size="sm" variant="primary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight">
            Stall Settings & Capacity
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Configure live operational mode and parallel kitchen line throughput.
          </p>
        </div>

        <Link href="/owner">
          <Button size="sm" variant="outline">
            ← Dashboard
          </Button>
        </Link>
      </div>

      {/* Operational Live Status Card */}
      <Card className="border-[var(--border-subtle)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-[var(--text-primary)]">
                Live Operational Status
              </CardTitle>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Current status dictates whether students can browse menus and place orders.
              </p>
            </div>
            <StallStatusBadge status={stall.liveStatus} />
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(["OPEN", "BUSY", "TEMPORARILY_PAUSED", "CLOSED"] as const).map((st) => (
              <button
                key={st}
                type="button"
                disabled={isSavingStatus}
                onClick={() => handleUpdateStatus(st)}
                className={`p-3 rounded-xl border text-xs font-bold text-center transition-all ${
                  stall.liveStatus === st
                    ? st === "OPEN"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : st === "BUSY"
                      ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : st === "TEMPORARILY_PAUSED"
                      ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "border-neutral-500 bg-neutral-500/10 text-neutral-600 dark:text-neutral-400"
                    : "border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--border-default)]"
                }`}
              >
                {st === "TEMPORARILY_PAUSED" ? "PAUSED" : st}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Capacity Model Configuration Form */}
      <form onSubmit={handleSaveCapacity}>
        <Card className="border-[var(--border-subtle)]">
          <CardHeader>
            <CardTitle className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[var(--accent)]" />
              <span>Kitchen Queue & Capacity Model</span>
            </CardTitle>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              The backend kitchen queue engine uses these parameters to calculate feasible pickup slots and avoid kitchen surges.
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Maximum Active Orders"
                type="number"
                helperText="Ceiling on simultaneous active orders before surge is triggered"
                value={maxActiveOrders}
                onChange={(e) => setMaxActiveOrders(e.target.value)}
              />

              <Input
                label="Parallel Preparation Lines"
                type="number"
                helperText="Number of dishes the kitchen can actively cook at the exact same time"
                value={parallelPrep}
                onChange={(e) => setParallelPrep(e.target.value)}
              />

              <Input
                label="Operational Buffer (Minutes)"
                type="number"
                helperText="Safety minutes added between back-to-back prep batches"
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(e.target.value)}
              />

              <Input
                label="Pickup Interval Spacing (Minutes)"
                type="number"
                helperText="Feasible pickup time slot granularity presented to students"
                value={pickupInterval}
                onChange={(e) => setPickupInterval(e.target.value)}
              />
            </div>
          </CardContent>

          <CardFooter className="pt-2 flex justify-end">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isSavingCapacity}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Save Capacity Model
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* Operating Hours View */}
      <Card className="border-[var(--border-subtle)]">
        <CardHeader>
          <CardTitle className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            <span>Official Operating Hours</span>
          </CardTitle>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Administered campus dining schedule. Stalls cannot be opened outside these hours.
          </p>
        </CardHeader>

        <CardContent>
          {stall.operatingHours && stall.operatingHours.length > 0 ? (
            <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden text-xs">
              {stall.operatingHours.map((oh) => (
                <div key={oh.dayOfWeek} className="p-3 flex items-center justify-between bg-[var(--bg-surface)]">
                  <span className="font-bold text-[var(--text-primary)]">
                    {DAY_NAMES[oh.dayOfWeek] || `Day ${oh.dayOfWeek}`}
                  </span>
                  <span className="font-mono text-[var(--text-secondary)]">
                    {oh.openTime} — {oh.closeTime}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-[var(--text-secondary)] bg-[var(--bg-base)] rounded-xl">
              Standard campus hours (08:00 — 21:00) active.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
