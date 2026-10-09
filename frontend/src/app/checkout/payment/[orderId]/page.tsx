"use client";

import React, { use } from "react";
import { Navbar } from "@/components/ui/Navbar";
import { PaymentView } from "@/features/payments/PaymentView";
import { FadeUp } from "@/components/motion/MotionPrimitives";

interface PaymentPageProps {
  params: Promise<{ orderId: string }>;
}

export default function PaymentPage({ params }: PaymentPageProps) {
  const { orderId } = use(params);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />

      <main
        id="main-content"
        className="flex-1 flex items-center justify-center p-4 sm:p-8"
      >
        <FadeUp className="w-full max-w-md">
          <PaymentView orderId={orderId} />
        </FadeUp>
      </main>
    </div>
  );
}
