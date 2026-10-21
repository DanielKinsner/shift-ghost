"use client";

import { cx, type LampTone, StatusLight } from "./primitives";
import { fmtClock, fmtShortWeekday, toMs } from "@/domain/time";

export interface RailMarker {
  id: string;
  at: string;
  label: string;
  tone: LampTone;
  /** Hollow markers are scheduled rule checks rather than due tasks. */
  hollow?: boolean;
  done?: boolean;
}

export interface RailBand {
  id: string;
  at: string;
  label: string;
  strong?: boolean;
}

/**
 * A horizontal time rail running through the interface: hour ticks, labelled
 * bands (doors open, lunch rush), markers for anything due, and a needle for now.
 */
export function TimeRail({
  start,
  end,
  now,
  markers = [],
  bands = [],
  className,
  label = "Time rail",
  dense,
}: {
  start: string;
  end: string;
  now?: string;
  markers?: RailMarker[];
  bands?: RailBand[];
  className?: string;
  label?: string;
  dense?: boolean;
}) {
  const s = toMs(start);
  const e = toMs(end);
  const pct = (iso: string) => Math.min(100, Math.max(0, ((toMs(iso) - s) / (e - s)) * 100));
  const totalHours = Math.round((e - s) / 3_600_000);
  // Hourly ticks for a shift, daily ticks for a multi-day thread.
  const stepH = totalHours > 48 ? 24 : 1;
  const hours = Math.round(totalHours / stepH);
  const ticks = Array.from({ length: hours + 1 }, (_, i) => new Date(s + i * stepH * 3_600_000).toISOString());
  const tickLabel = (iso: string) => (stepH === 24 ? `${fmtShortWeekday(iso)} ${Number(iso.slice(8, 10))}` : fmtClock(iso));
  const nowPct = now ? pct(now) : null;

  // Stack markers that land close together.
  const sorted = [...markers].sort((a, b) => toMs(a.at) - toMs(b.at));
  const lanes: number[] = [];
  const placed = sorted.map((m) => {
    const p = pct(m.at);
    let lane = 0;
    // Dense briefing labels are surprisingly wide relative to a six-hour rail.
    // Give them enough room to remain readable instead of technically non-overlapping.
    while (lanes[lane] !== undefined && p - lanes[lane] < (dense ? 18 : 14)) lane++;
    lanes[lane] = p;
    return { ...m, p, lane };
  });
  const laneCount = Math.max(1, ...placed.map((m) => m.lane + 1));

  return (
    <div className={cx("relative select-none overflow-hidden", className)} role="img" aria-label={`${label}: ${markers.map((m) => `${m.label} at ${fmtClock(m.at)}`).join("; ")}`}>
      <div className="relative" style={{ height: 34 + laneCount * 26 }}>
        {/* bands */}
        {bands.map((b) => (
          <div key={b.id} className="absolute top-0 bottom-0" style={{ left: `${pct(b.at)}%` }}>
            <div className={cx("absolute top-0 bottom-5 w-px", b.strong ? "bg-safety" : "bg-steel-500/60")} />
            <span className={cx("absolute -top-0.5 whitespace-nowrap font-display text-[0.7rem] font-semibold uppercase tracking-wider", pct(b.at) > 72 ? "right-1.5" : "left-1.5", b.strong ? "text-safety" : "text-steel-400", dense && !b.strong && "hidden sm:inline")}>
              {b.label}
            </span>
          </div>
        ))}
        {/* markers */}
        {placed.map((m) => (
          <div key={m.id} className="absolute" style={{ left: `${m.p}%`, top: 18 + m.lane * 26 }}>
            <div className={cx("flex -translate-x-1.5 items-center gap-1.5 whitespace-nowrap", m.p > 78 && "-translate-x-[calc(100%-6px)] flex-row-reverse")}>
              {m.hollow ? (
                <span className="h-3 w-3 flex-none rounded-full border-2 border-dashed border-amber" aria-hidden />
              ) : (
                <StatusLight tone={m.tone} off={m.done} size={11} />
              )}
              <span className={cx("max-w-[11rem] truncate text-xs", dense && "hidden lg:inline", m.done ? "text-steel-500 line-through" : "text-steel-100")}>{m.label}</span>
            </div>
          </div>
        ))}
      </div>
      {/* track */}
      <div className="rail-track relative h-6" style={{ ["--ticks" as string]: hours }}>
        {nowPct !== null && (
          <div className="absolute -top-1 bottom-0 z-10 w-0.5 bg-safety shadow-[0_0_8px_rgba(255,107,26,0.8)]" style={{ left: `${nowPct}%` }}>
            <span className="absolute -top-0.5 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-safety" aria-hidden />
          </div>
        )}
      </div>
      <div className="relative mt-1 h-4">
        {ticks.map((t, i) => (
          <span
            key={t}
            className={cx("absolute font-mono text-[0.68rem] text-steel-500", i === 0 ? "translate-x-0" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2", dense && i % 2 === 1 && "hidden sm:inline")}
            style={{ left: `${(i / hours) * 100}%` }}
          >
            {tickLabel(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
