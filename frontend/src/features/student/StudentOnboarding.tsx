"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileText,
  Camera,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { DocumentUpload } from "@/features/verification/DocumentUpload";
import { LivenessVerification } from "@/features/liveness/LivenessVerification";
import { VerificationStatusCard } from "@/features/verification/VerificationStatusCard";
import { Button } from "@/components/ui/Button";
import { Heading, Lead } from "@/components/ui/Typography";

type OnboardingTab = "document" | "liveness" | "status";

export function StudentOnboarding() {
  const [activeTab, setActiveTab] = useState<OnboardingTab>("document");
  const [docCompleted, setDocCompleted] = useState(false);
  const [livenessCompleted, setLivenessCompleted] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Onboarding Header */}
      <div className="text-center space-y-2">
        <Heading level={1} className="text-2xl sm:text-4xl">
          Student Verification Onboarding
        </Heading>
        <Lead>
          Complete the two verification steps below to activate campus dining and scheduled pickup ordering.
        </Lead>
      </div>

      {/* Step Progress Bar */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setActiveTab("document")}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeTab === "document"
              ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
              : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center">
              1
            </span>
            <FileText className="w-4 h-4" />
          </div>
          <div className="text-xs font-bold text-[var(--text-primary)]">
            Identity Document
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            {docCompleted ? "Uploaded" : "Pending upload"}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("liveness")}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeTab === "liveness"
              ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
              : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center">
              2
            </span>
            <Camera className="w-4 h-4" />
          </div>
          <div className="text-xs font-bold text-[var(--text-primary)]">
            Liveness Challenge
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            {livenessCompleted ? "Passed" : "Anti-spoofing check"}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("status")}
          className={`p-3.5 rounded-2xl border text-left transition-all ${
            activeTab === "status"
              ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
              : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center">
              3
            </span>
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="text-xs font-bold text-[var(--text-primary)]">
            Activation State
          </div>
          <div className="text-[11px] text-[var(--text-secondary)]">
            Authoritative status
          </div>
        </button>
      </div>

      {/* Active Tab Step Content */}
      <div className="pt-2">
        {activeTab === "document" && (
          <div className="space-y-4">
            <DocumentUpload
              onSuccess={() => {
                setDocCompleted(true);
                setActiveTab("liveness");
              }}
            />
            {docCompleted && (
              <div className="flex justify-end">
                <Button
                  onClick={() => setActiveTab("liveness")}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Proceed to Liveness Challenge
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === "liveness" && (
          <div className="space-y-4">
            <LivenessVerification
              onSuccess={() => {
                setLivenessCompleted(true);
                setActiveTab("status");
              }}
            />
            {livenessCompleted && (
              <div className="flex justify-end">
                <Button
                  onClick={() => setActiveTab("status")}
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  View Activation Status
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === "status" && (
          <div className="space-y-6">
            <VerificationStatusCard />
            <div className="p-4 rounded-2xl bg-[var(--brand-50)] dark:bg-[var(--brand-900)]/30 border border-[var(--brand-200)] text-xs text-[var(--brand-800)] dark:text-[var(--brand-200)] leading-relaxed">
              <strong>Administrative Invariant:</strong> In accordance with campus security policies, liveness verification and identity document submission must both be approved by university administrators before ordering eligibility is granted.
            </div>
            <div className="flex justify-between items-center">
              <Link href="/student/profile">
                <Button variant="outline">View Profile Overview</Button>
              </Link>
              <Link href="/">
                <Button variant="primary" rightIcon={<ArrowRight className="w-4 h-4" />}>
                  Explore Campus Stalls
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
