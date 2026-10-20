"use client";

import { motion } from "motion/react";
import { Moon, Sunrise } from "lucide-react";
import { GhostMark } from "./brand";
import { cx } from "./primitives";

/**
 * Closing crew → extraction → morning crew. Used on the demo entry page and in
 * the setup wizard, where `focus` lights the part of the line being configured.
 */
export function ShiftLine({
  closeLabel = "Closing crew",
  closeTime = "10:45 PM closeout",
  openLabel = "Morning crew",
  openTime = "6:00 AM brief",
  focus,
  className,
}: {
  closeLabel?: string;
  closeTime?: string;
  openLabel?: string;
  openTime?: string;
  focus?: "close" | "ghost" | "open" | "all";
  className?: string;
}) {
  const lit = (part: "close" | "ghost" | "open") => !focus || focus === "all" || focus === part;
  return (
    <div className={cx("relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4", className)} role="img" aria-label={`${closeLabel} at ${closeTime}, through Shift Ghost extraction, to ${openLabel} at ${openTime}`}>
      <Node icon={<Moon size={18} />} title={closeLabel} time={closeTime} lit={lit("close")} align="left" />
      <div className={cx("relative grid h-16 w-16 place-items-center rounded-2xl border bg-night-800 sm:h-20 sm:w-20", lit("ghost") ? "border-safety/70 shadow-[0_0_30px_-6px_rgba(255,107,26,0.6)]" : "border-night-500")}>
        <GhostMark size={40} />
        <span className="absolute -bottom-6 whitespace-nowrap font-display text-[0.7rem] font-semibold uppercase tracking-widest text-steel-400">Extract · verify</span>
      </div>
      <Node icon={<Sunrise size={18} />} title={openLabel} time={openTime} lit={lit("open")} align="right" />
      {/* the rail */}
      <div className="pointer-events-none absolute left-[18%] right-[18%] top-1/2 -z-10 h-[3px] -translate-y-1/2 overflow-hidden rounded bg-night-600">
        {/* Same markup on server and client; reduced motion hides the pulses in CSS. */}
        {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute top-0 h-full w-10 rounded bg-gradient-to-r from-transparent via-safety to-transparent motion-reduce:hidden"
              initial={{ left: "-10%" }}
              animate={{ left: "110%" }}
              transition={{ duration: 2.8, repeat: Infinity, delay: i * 0.93, ease: "linear" }}
            />
          ))}
      </div>
    </div>
  );
}

function Node({ icon, title, time, lit, align }: { icon: React.ReactNode; title: string; time: string; lit: boolean; align: "left" | "right" }) {
  return (
    <div className={cx("panel flex min-w-0 items-center gap-2 px-2.5 py-3 sm:gap-3 sm:px-4", align === "right" && "flex-row-reverse text-right", lit ? "border-steel-500/70" : "opacity-55")}>
      <span className={cx("hidden h-9 w-9 flex-none place-items-center rounded-lg xs:grid", lit ? "bg-night-600 text-paper-100" : "bg-night-700 text-steel-500")}>{icon}</span>
      <span className="min-w-0">
        <span className="block font-display text-[0.9rem] font-semibold leading-tight tracking-wide text-paper-100 sm:text-base">{title}</span>
        <span className="block font-mono text-[0.68rem] leading-tight text-steel-400 sm:text-[0.72rem]">{time}</span>
      </span>
    </div>
  );
}
