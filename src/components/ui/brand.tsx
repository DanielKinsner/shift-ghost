import { cx } from "./primitives";

/** The Shift Ghost mark: a ghost whose hem is a waveform, with two LED eye slits. */
export function GhostMark({ size = 28, className, eyes = "#0b1017" }: { size?: number; className?: string; eyes?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        d="M6 27.5V14.5a10 10 0 0 1 20 0v13l-2.5-2.6-2.5 3.6-2.5-5.2-2.5 6-2.5-6-2.5 5.2-2.5-3.6z"
        fill="#ff6b1a"
      />
      <path d="M6 14.5a10 10 0 0 1 20 0" fill="none" stroke="#ffd2b8" strokeOpacity=".55" strokeWidth="1" />
      <rect x="10.6" y="12.2" width="4" height="2.6" rx=".6" fill={eyes} />
      <rect x="17.4" y="12.2" width="4" height="2.6" rx=".6" fill={eyes} />
    </svg>
  );
}

export function Wordmark({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const text = { sm: "text-base", md: "text-lg", lg: "text-3xl", xl: "text-5xl sm:text-6xl" }[size];
  const mark = { sm: 20, md: 24, lg: 40, xl: 64 }[size];
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <GhostMark size={mark} />
      <span className={cx("font-display font-bold uppercase leading-none tracking-[0.06em] text-paper-100", text)}>Shift Ghost</span>
    </span>
  );
}
