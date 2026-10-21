"use client";

import Link, { type LinkProps } from "next/link";
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";
import type { Confidence, Severity, User } from "@/domain/types";

export const cx = clsx;

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "paper" | "paperOutline";
type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-safety text-night-950 hover:bg-[#ff7d35] active:bg-safety-600 shadow-[inset_0_-2px_0_rgba(0,0,0,0.25),0_1px_0_rgba(0,0,0,0.5)] font-semibold",
  secondary:
    "bg-night-700 text-paper-100 border border-night-500 hover:bg-night-600 hover:border-steel-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
  ghost: "text-steel-300 hover:text-paper-100 hover:bg-night-700",
  danger: "bg-signal text-night-950 hover:bg-[#ff6257] font-semibold",
  paper: "bg-ink text-paper-100 hover:bg-[#2b2a25] font-semibold",
  paperOutline: "border border-ink/30 text-ink hover:bg-ink/10 hover:border-ink/50",
};
const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-md",
  md: "h-10 px-4 text-[0.95rem] gap-2 rounded-lg",
  lg: "h-12 px-5 text-base gap-2 rounded-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}

export function buttonClassName({ variant = "secondary", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cx(
    "inline-flex select-none items-center justify-center whitespace-nowrap transition-[transform,color,background-color,border-color,box-shadow] duration-150 motion-safe:hover:-translate-y-px motion-safe:active:translate-y-0 disabled:pointer-events-none disabled:opacity-45",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName({ variant, size, className })}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

type ButtonLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: ReactNode;
  };

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = "secondary", size = "md", icon, className, children, ...rest },
  ref,
) {
  return (
    <Link ref={ref} className={buttonClassName({ variant, size, className })} {...rest}>
      {icon}
      {children}
    </Link>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx("inline-grid h-10 w-10 place-items-center rounded-lg text-steel-300 transition-colors hover:bg-night-700 hover:text-paper-100", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export type LampTone = "critical" | "high" | "review" | "amber" | "normal" | "watch" | "ok";

export function StatusLight({ tone, pulse, off, size = 12, label, className }: { tone: LampTone; pulse?: boolean; off?: boolean; size?: number; label?: string; className?: string }) {
  return (
    <span
      className={cx("lamp", className)}
      data-tone={tone}
      data-pulse={pulse ? "true" : undefined}
      data-off={off ? "true" : undefined}
      style={{ "--lamp-size": `${size}px` } as CSSProperties}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

export const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", normal: "Normal", watch: "Watch" };

export function SeverityTag({ severity, pulse, className }: { severity: Severity; pulse?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-display text-sm font-semibold tracking-wide", severityText(severity), className)}>
      <StatusLight tone={severity} pulse={pulse && severity === "critical"} size={10} />
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function severityText(s: Severity): string {
  return s === "critical" ? "text-signal" : s === "high" ? "text-safety" : s === "normal" ? "text-steel-300" : "text-steel-400";
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: "High confidence", review: "Needs review", uncertain: "Uncertain" };

/** Confidence as language and shape, never as a fake percentage. */
export function ConfidenceTag({ confidence, className, onPaper }: { confidence: Confidence; className?: string; onPaper?: boolean }) {
  const shape =
    confidence === "high" ? (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="1" y="1" width="12" height="12" rx="2" fill="currentColor" /></svg>
    ) : confidence === "review" ? (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" /><rect x="1.5" y="7" width="11" height="5.5" fill="currentColor" /></svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><rect x="1.5" y="1.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.5 2" /></svg>
    );
  const tone = onPaper
    ? confidence === "high" ? "text-ink-soft" : confidence === "review" ? "text-[#8a5a00]" : "text-paper-red"
    : confidence === "high" ? "text-steel-300" : confidence === "review" ? "text-amber" : "text-signal";
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-xs font-medium", tone, className)}>
      {shape}
      {CONFIDENCE_LABEL[confidence]}
    </span>
  );
}

export function Stamp({ children, tone = "safety", rotate = -1.5, className, size = "sm" }: { children: ReactNode; tone?: "safety" | "steel" | "ink" | "red" | "go"; rotate?: number; className?: string; size?: "xs" | "sm" | "md" | "lg" }) {
  const color = { safety: "text-safety", steel: "text-steel-300", ink: "text-ink", red: "text-paper-red", go: "text-go" }[tone];
  const sz = { xs: "text-[0.66rem]", sm: "text-xs", md: "text-sm", lg: "text-lg" }[size];
  return (
    <span className={cx("stamp", color, sz, className)} style={{ "--stamp-rotate": `${rotate}deg` } as CSSProperties}>
      {children}
    </span>
  );
}

export function Tape({ thin, className }: { thin?: boolean; className?: string }) {
  return <div role="presentation" className={cx("tape", thin && "tape-thin", className)} />;
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={cx("skeleton", className)} style={style} />;
}

const HUES: Record<string, string> = {
  "u-maya": "#ff6b1a",
  "u-luis": "#39d98a",
  "u-bri": "#ffb020",
  "u-jordan": "#8fb4ff",
};

export function Avatar({ user, size = 32, className }: { user: Pick<User, "id" | "initials" | "name"> | null | undefined; size?: number; className?: string }) {
  if (!user) return null;
  const hue = HUES[user.id] ?? "#b7bfc8";
  return (
    <span
      className={cx("inline-grid flex-none place-items-center rounded-full font-display font-bold text-night-950", className)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${hue} 70%, white), ${hue})`, boxShadow: "0 0 0 2px #0b1017, 0 0 0 3px #3a4859" }}
      title={user.name}
      aria-hidden
    >
      {user.initials}
    </span>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("font-mono tabular-nums", className)}>{children}</span>;
}

export function SectionHeading({ children, aside, id, className }: { children: ReactNode; aside?: ReactNode; id?: string; className?: string }) {
  return (
    <div className={cx("flex items-end justify-between gap-3", className)}>
      <h2 id={id} className="font-display text-xl font-semibold tracking-wide text-paper-100 sm:text-[1.35rem]">
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-night-500 bg-night-800 px-1.5 py-0.5 font-mono text-[0.7rem] text-steel-300">{children}</kbd>;
}
