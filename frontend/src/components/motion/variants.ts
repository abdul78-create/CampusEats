/**
 * CampusEats — Centralized Motion Variant System
 *
 * All animation variants are defined here.  Components import from this file
 * and never scatter magic duration/easing values inline.
 *
 * Philosophy:
 *  - ease-out for entrances
 *  - spring for physical interactions
 *  - short durations for micro-interactions (<= 200ms)
 *  - slightly longer for page-level changes (300-400ms)
 *  - prefers-reduced-motion: all variants collapse to instant opacity fades
 */
import type { Variants } from "framer-motion";

// --- Shared easing tokens -----------------------------------------------------

export const ease = {
  out: [0.0, 0.0, 0.2, 1.0] as const,
  in: [0.4, 0.0, 1.0, 1.0] as const,
  inOut: [0.4, 0.0, 0.2, 1.0] as const,
  spring: { type: "spring", stiffness: 400, damping: 30 } as const,
  springSmooth: { type: "spring", stiffness: 260, damping: 24 } as const,
} as const;

// --- Page transitions ---------------------------------------------------------

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: ease.out } },
  exit:    { opacity: 0, y: -8,  transition: { duration: 0.2,  ease: ease.in  } },
};

// --- Fade primitives ---------------------------------------------------------

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.25, ease: ease.out } },
  exit:    { opacity: 0, transition: { duration: 0.15 } },
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: ease.out } },
  exit:    { opacity: 0, y: 10, transition: { duration: 0.18 } },
};

export const fadeDown: Variants = {
  initial: { opacity: 0, y: -16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: ease.out } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

// --- Scale primitives ---------------------------------------------------------

export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 1, scale: 1, transition: ease.springSmooth },
  exit:    { opacity: 0, scale: 0.96, transition: { duration: 0.15 } },
};

// --- Stagger containers -------------------------------------------------------

export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.28, ease: ease.out } },
};

export const staggerFast: Variants = {
  animate: { transition: { staggerChildren: 0.035 } },
};

// --- Modal / Drawer -----------------------------------------------------------

export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit:    { opacity: 0, transition: { duration: 0.18 } },
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 16 },
  animate: { opacity: 1, scale: 1,    y: 0,  transition: ease.springSmooth },
  exit:    { opacity: 0, scale: 0.96, y: 8,  transition: { duration: 0.18 } },
};

export const drawerRight: Variants = {
  initial: { x: "100%", opacity: 0 },
  animate: { x: 0, opacity: 1, transition: ease.springSmooth },
  exit:    { x: "100%", opacity: 0, transition: { duration: 0.22, ease: ease.in } },
};

export const drawerBottom: Variants = {
  initial: { y: "100%", opacity: 0 },
  animate: { y: 0, opacity: 1, transition: ease.springSmooth },
  exit:    { y: "100%", opacity: 0, transition: { duration: 0.22, ease: ease.in } },
};

// --- Card / List interactions -------------------------------------------------

export const cardHover = {
  whileHover: { y: -2, transition: ease.spring },
  whileTap:   { scale: 0.98, transition: ease.spring },
};

export const buttonPress = {
  whileHover: { scale: 1.02, transition: ease.spring },
  whileTap:   { scale: 0.96, transition: ease.spring },
};

export const listItem: Variants = {
  initial: { opacity: 0, x: -12 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.22, ease: ease.out } },
  exit:    { opacity: 0, x: 12, transition: { duration: 0.15 } },
};

// --- Status / number transitions ---------------------------------------------

export const statusTransition: Variants = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1, transition: ease.spring },
  exit:    { opacity: 0, scale: 0.9, transition: { duration: 0.12 } },
};

// --- Reduced-motion override -------------------------------------------------
// Applied at the provider level via MotionConfig; exported for reference.
export const reducedMotionTransition = { duration: 0.01 };
