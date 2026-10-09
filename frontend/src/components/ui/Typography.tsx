import React from "react";
import { cn } from "@/lib/utils/cn";

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
}

const headingStyles: Record<number, string> = {
  1: "text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.15]",
  2: "text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)] leading-tight",
  3: "text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)] leading-snug",
  4: "text-lg sm:text-xl font-semibold text-[var(--text-primary)]",
  5: "text-base font-semibold text-[var(--text-primary)]",
  6: "text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider",
};

export function Heading({
  level = 1,
  as,
  className,
  children,
  ...props
}: HeadingProps) {
  const Tag = as || (`h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6");
  return (
    <Tag className={cn(headingStyles[level], className)} {...props}>
      {children}
    </Tag>
  );
}

export interface TextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  variant?: "body" | "lead" | "muted" | "small" | "caption";
  as?: "p" | "span" | "div";
}

const textStyles: Record<string, string> = {
  body: "text-base text-[var(--text-primary)] leading-relaxed",
  lead: "text-lg sm:text-xl text-[var(--text-secondary)] leading-relaxed font-normal",
  muted: "text-sm text-[var(--text-secondary)] leading-normal",
  small: "text-xs text-[var(--text-secondary)] leading-normal",
  caption: "text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] font-semibold",
};

export function Text({
  variant = "body",
  as: Tag = "p",
  className,
  children,
  ...props
}: TextProps) {
  return (
    <Tag className={cn(textStyles[variant], className)} {...props}>
      {children}
    </Tag>
  );
}

export function Lead({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <Text variant="lead" className={className} {...props} />;
}

export function Muted({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <Text variant="muted" className={className} {...props} />;
}

export function Caption({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return <Text variant="caption" as="span" className={className} {...props} />;
}
