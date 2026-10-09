"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Mail, Phone, ArrowRight } from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { VerificationStatusCard } from "@/features/verification/VerificationStatusCard";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import type { StudentProfile } from "@/types/api";

interface ExtendedStudentProfile extends StudentProfile {
  user?: {
    email: string;
    phoneNumber: string;
    role: string;
  };
}

export function StudentProfileView() {
  const { data: profile, isLoading } = useQuery<ExtendedStudentProfile>({
    queryKey: ["student", "profile"],
    queryFn: () => apiGet<ExtendedStudentProfile>("/student/profile"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Profile Overview Card */}
      <Card className="shadow-[var(--shadow-md)]">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center text-xl font-bold border border-[var(--brand-200)] shadow-sm">
                {profile?.fullName ? profile.fullName.charAt(0).toUpperCase() : "S"}
              </div>
              <div>
                <CardTitle className="text-2xl">{profile?.fullName || "Student Account"}</CardTitle>
                <CardDescription className="flex items-center gap-2 mt-1">
                  <GraduationCap className="w-4 h-4" />
                  <span>{profile?.universityRegNumber || "No Reg Number"}</span>
                </CardDescription>
              </div>
            </div>

            {profile && (
              <VerificationStatusBadge status={profile.accountStatus} size="md" />
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center gap-3">
              <Mail className="w-4 h-4 text-[var(--text-tertiary)]" />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold">
                  University Email
                </div>
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  {profile?.user?.email || "—"}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] flex items-center gap-3">
              <Phone className="w-4 h-4 text-[var(--text-tertiary)]" />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold">
                  Phone Number
                </div>
                <div className="text-sm font-medium text-[var(--text-primary)]">
                  {profile?.user?.phoneNumber || "—"}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Verification State Breakdown */}
      <VerificationStatusCard />

      {/* Action shortcuts */}
      <div className="flex justify-end">
        <Link href="/">
          <Button variant="outline" rightIcon={<ArrowRight className="w-4 h-4" />}>
            Back to CampusEats Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
