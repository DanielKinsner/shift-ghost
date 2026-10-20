"use client";

import type { Pattern, PatternMention } from "@/domain/patterns";
import { addDays, dayKey, fmtShortWeekday, minutesOfDay } from "@/domain/time";

const TOP = 12 * 60; // noon
const BOTTOM = 24 * 60;

/**
 * Day × time-of-day evidence grid. Each mention is a lamp at the time it was
 * reported; all-clear reports are hollow, false alarms are crossed out.
 */
export function DayTimeGrid({ pattern, end, days = 9, onSelect, selected }: { pattern: Pattern; end: string; days?: number; onSelect?: (m: PatternMention) => void; selected?: string | null }) {
  const lastDay = dayKey(end);
  const columns = Array.from({ length: days }, (_, i) => addDays(lastDay, i - days + 1));
  const W = 640;
  const H = 250;
  const padL = 52;
  const padB = 34;
  const untimedY = H - padB - 6;
  const colW = (W - padL) / days;
  const y = (min: number) => 8 + ((Math.max(TOP, Math.min(BOTTOM, min)) - TOP) / (BOTTOM - TOP)) * (H - padB - 40);
  const hasUntimed = [...pattern.mentions, ...pattern.okReports, ...pattern.falseAlarms].some((m) => !m.timed);
  const all: (PatternMention & { kind: "fault" | "ok" | "fa" })[] = [
    ...pattern.mentions.map((m) => ({ ...m, kind: "fault" as const })),
    ...pattern.okReports.map((m) => ({ ...m, kind: "ok" as const })),
    ...pattern.falseAlarms.map((m) => ({ ...m, kind: "fa" as const })),
  ].filter((m) => columns.includes(dayKey(m.at)));
  const eightPm = y(20 * 60);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${pattern.label}: ${pattern.count} mentions plotted by day and time of day`}>
      <defs>
        <radialGradient id="lampRed" cx="38%" cy="32%">
          <stop offset="0" stopColor="#ffd0cb" />
          <stop offset=".45" stopColor="#ff4a3d" />
          <stop offset="1" stopColor="#8a1d16" />
        </radialGradient>
        <radialGradient id="lampOrange" cx="38%" cy="32%">
          <stop offset="0" stopColor="#ffe0cc" />
          <stop offset=".45" stopColor="#ff6b1a" />
          <stop offset="1" stopColor="#8a3606" />
        </radialGradient>
        <filter id="glow" x="-1" y="-1" width="3" height="3">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      {/* night zone */}
      <rect x={padL} y={eightPm} width={W - padL} height={H - padB - eightPm - 8} fill="rgba(255,74,61,0.05)" />
      {hasUntimed && (
        <g>
          <line x1={padL} x2={W} y1={untimedY} y2={untimedY} stroke="#273343" strokeDasharray="2 4" />
          <text x={padL - 8} y={untimedY + 4} textAnchor="end" fontSize="9" fill="#8c97a4" fontFamily="var(--font-plex-sans)">
            no time
          </text>
        </g>
      )}
      {[12, 15, 18, 21, 24].map((h) => (
        <g key={h}>
          <line x1={padL} x2={W} y1={y(h * 60)} y2={y(h * 60)} stroke="#273343" strokeWidth="1" />
          <text x={padL - 8} y={y(h * 60) + 4} textAnchor="end" fontSize="10" fill="#8c97a4" fontFamily="var(--font-plex-mono)">
            {h === 24 ? "00:00" : `${h}:00`}
          </text>
        </g>
      ))}
      {pattern.afterHour && (
        <g>
          <line x1={padL} x2={W} y1={eightPm} y2={eightPm} stroke="#ff6b1a" strokeDasharray="4 4" strokeWidth="1.2" />
          <text x={padL + 6} y={eightPm - 6} fontSize="11" fill="#ff6b1a" fontFamily="var(--font-archivo-narrow)" fontWeight="700" letterSpacing="1">
            AFTER 8 PM
          </text>
        </g>
      )}
      {columns.map((d, i) => (
        <g key={d}>
          {i > 0 && <line x1={padL + i * colW} x2={padL + i * colW} y1={8} y2={H - padB} stroke="#1c2633" />}
          <text x={padL + i * colW + colW / 2} y={H - padB + 12} textAnchor="middle" fontSize="10" fill="#a2acb7" fontFamily="var(--font-plex-sans)">
            {fmtShortWeekday(`${d}T12:00:00Z`)}
          </text>
          <text x={padL + i * colW + colW / 2} y={H - padB + 25} textAnchor="middle" fontSize="10" fill="#8c97a4" fontFamily="var(--font-plex-mono)">
            {Number(d.slice(8))}
          </text>
        </g>
      ))}
      {all.map((m) => {
        const col = columns.indexOf(dayKey(m.at));
        const sameDay = all.filter((x) => dayKey(x.at) === dayKey(m.at) && x.locationId !== m.locationId);
        const offset = pattern.scope === "cross-location" && sameDay.length ? (["loc-dtn", "loc-ngt", "loc-cyp"].indexOf(m.locationId) - 1) * 10 : 0;
        const cx = padL + col * colW + colW / 2 + offset;
        const cy = m.timed ? y(minutesOfDay(m.at)) : untimedY;
        const sel = selected === m.itemId;
        return (
          <g key={m.itemId} onClick={() => onSelect?.(m)} style={{ cursor: onSelect ? "pointer" : undefined }}>
            <title>{`${m.title} — ${m.sentence}`}</title>
            {m.kind === "fault" && <circle cx={cx} cy={cy} r={11} fill={pattern.severity === "critical" ? "#ff4a3d" : "#ff6b1a"} opacity=".45" filter="url(#glow)" />}
            <circle cx={cx} cy={cy} r={sel ? 9 : 7} fill={m.kind === "fault" ? `url(#${pattern.severity === "critical" ? "lampRed" : "lampOrange"})` : "#0b1017"} stroke={m.kind === "ok" ? "#39d98a" : m.kind === "fa" ? "#8c97a4" : "#05070a"} strokeWidth={m.kind === "fault" ? 2 : 2} strokeDasharray={m.kind === "fa" ? "2 2" : undefined} />
            {m.kind === "fa" && <path d={`M${cx - 4} ${cy - 4} L${cx + 4} ${cy + 4} M${cx + 4} ${cy - 4} L${cx - 4} ${cy + 4}`} stroke="#8c97a4" strokeWidth="1.5" />}
            {sel && <circle cx={cx} cy={cy} r={13} fill="none" stroke="#e9e4d6" strokeWidth="1.5" />}
          </g>
        );
      })}
    </svg>
  );
}

/** Store × subject matrix with lamp counts. Small on purpose. */
export function StoreMatrix({ rows, stores }: { rows: { label: string; counts: Record<string, number>; href: string }[]; stores: { id: string; name: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr className="text-left text-steel-500">
            <th className="py-1 pr-3 font-medium">Subject</th>
            {stores.map((s) => (
              <th key={s.id} className="px-2 py-1 text-center font-medium">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="bg-night-850">
              <td className="rounded-l-md py-2 pl-3 pr-3 text-paper-100">
                <a href={r.href} className="hover:underline">
                  {r.label}
                </a>
              </td>
              {stores.map((s, i) => {
                const n = r.counts[s.id] ?? 0;
                return (
                  <td key={s.id} className={i === stores.length - 1 ? "rounded-r-md px-2 py-2 text-center" : "px-2 py-2 text-center"}>
                    {n === 0 ? (
                      <span className="text-steel-500">·</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 font-mono text-paper-100">
                        <span className="lamp" data-tone={n >= 5 ? "critical" : n >= 3 ? "high" : "normal"} style={{ ["--lamp-size" as string]: "9px" }} aria-hidden />
                        {n}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
