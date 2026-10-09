"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { useCart } from "@/features/cart/useCart";
import { scaleIn } from "@/components/motion/variants";

export function FloatingCartButton() {
  const { itemCount, advanceAmount, setIsCartOpen } = useCart();

  return (
    <AnimatePresence>
      {itemCount > 0 && (
        <motion.div
          variants={scaleIn}
          initial="initial"
          animate="animate"
          exit="exit"
          className="fixed bottom-6 right-6 z-40"
        >
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            aria-label="View tray and proceed to checkout"
            className="flex items-center gap-3 px-5 py-3.5 rounded-full bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-xl shadow-[var(--brand-500)]/30 border border-white/20 transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
          >
            <div className="relative">
              <ShoppingBag className="w-5 h-5" />
              <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white text-[var(--accent)] text-[11px] font-extrabold flex items-center justify-center shadow-xs">
                {itemCount}
              </span>
            </div>

            <div className="text-left font-bold text-sm">
              <span>View Tray</span>
              <span className="ml-2 font-medium opacity-90 text-xs">
                (₹{advanceAmount.toFixed(2)})
              </span>
            </div>

            <ArrowRight className="w-4 h-4 ml-1" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
