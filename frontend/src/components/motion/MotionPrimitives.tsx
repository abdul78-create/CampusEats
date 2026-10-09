"use client";
/**
 * CampusEats — Reusable Motion Primitives
 *
 * Thin wrappers around framer-motion that apply the centralized variants.
 * Import these instead of using motion.div directly to keep animation
 * values consistent across the codebase.
 */
import {
  motion,
  AnimatePresence,
  type HTMLMotionProps,
  type Variants,
} from "framer-motion";
import {
  fadeIn,
  fadeUp,
  scaleIn,
  staggerContainer,
  staggerItem,
  pageVariants,
} from "./variants";

// --- Page wrapper -------------------------------------------------------------

export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
    >
      {children}
    </motion.div>
  );
}

// --- Fade primitives ----------------------------------------------------------

interface MotionProps extends HTMLMotionProps<"div"> {
  children?: React.ReactNode;
  className?: string;
  delay?: number;
}

export function FadeIn({ children, className, delay, ...rest }: MotionProps) {
  const v: Variants = delay
    ? { ...fadeIn, animate: { ...fadeIn.animate as object, transition: { duration: 0.25, delay } } }
    : fadeIn;
  return (
    <motion.div variants={v} initial="initial" animate="animate" exit="exit" className={className} {...rest}>
      {children}
    </motion.div>
  );
}

export function FadeUp({ children, className, delay, ...rest }: MotionProps) {
  const v: Variants = delay
    ? { ...fadeUp, animate: { ...fadeUp.animate as object, transition: { duration: 0.3, delay } } }
    : fadeUp;
  return (
    <motion.div variants={v} initial="initial" animate="animate" exit="exit" className={className} {...rest}>
      {children}
    </motion.div>
  );
}

export function ScaleIn({ children, className, ...rest }: MotionProps) {
  return (
    <motion.div variants={scaleIn} initial="initial" animate="animate" exit="exit" className={className} {...rest}>
      {children}
    </motion.div>
  );
}

// --- Stagger containers -------------------------------------------------------

export function StaggerContainer({ children, className, ...rest }: MotionProps) {
  return (
    <motion.div variants={staggerContainer} initial="initial" animate="animate" className={className} {...rest}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className, ...rest }: MotionProps) {
  return (
    <motion.div variants={staggerItem} className={className} {...rest}>
      {children}
    </motion.div>
  );
}

// Re-export AnimatePresence for convenience
export { AnimatePresence };
