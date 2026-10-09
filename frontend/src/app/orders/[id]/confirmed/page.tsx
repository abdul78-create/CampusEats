"use client";

import React, { use } from "react";
import { Navbar } from "@/components/ui/Navbar";
import { OrderConfirmation } from "@/features/orders/OrderConfirmation";
import { FadeUp } from "@/components/motion/MotionPrimitives";

interface OrderConfirmedPageProps {
  params: Promise<{ id: string }>;
}

export default function OrderConfirmedPage({ params }: OrderConfirmedPageProps) {
  const { id } = use(params);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />

      <main id="main-content" className="flex-1 p-4 sm:p-8 max-w-4xl mx-auto w-full">
        <FadeUp>
          <OrderConfirmation orderId={id} />
        </FadeUp>
      </main>
    </div>
  );
}
