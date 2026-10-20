import type { ISO } from "./types";

/**
 * Demo times are wall-clock values stored as UTC. Every formatter pins
 * `timeZone: "UTC"` so 10:40 PM reads as 10:40 PM on any machine.
 */

const MIN = 60_000;

export function toMs(iso: ISO): number {
  return Date.parse(iso);
}

export function fromMs(ms: number): ISO {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

export function addMinutes(iso: ISO, minutes: number): ISO {
  return fromMs(toMs(iso) + minutes * MIN);
}

export function diffMinutes(later: ISO, earlier: ISO): number {
  return Math.round((toMs(later) - toMs(earlier)) / MIN);
}

/** "2026-10-20" */
export function dayKey(iso: ISO): string {
  return iso.slice(0, 10);
}

export function addDays(day: string, n: number): string {
  return dayKey(fromMs(Date.parse(`${day}T12:00:00Z`) + n * 1440 * MIN));
}

/** Combine a YYYY-MM-DD day with an "HH:MM" wall-clock time. */
export function at(day: string, hhmm: string): ISO {
  return `${day}T${hhmm.padStart(5, "0")}:00Z`;
}

export function minutesOfDay(iso: ISO): number {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});
const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const weekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
const shortWeekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

/** "10:40 PM" */
export function fmtTime(iso: ISO): string {
  return timeFmt.format(new Date(iso));
}

/** "10:40" (24h, for mono rails) */
export function fmtClock(iso: ISO): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** "Tue, Oct 20" */
export function fmtDay(iso: ISO): string {
  return dayFmt.format(new Date(iso));
}

export function fmtWeekday(iso: ISO): string {
  return weekdayFmt.format(new Date(iso));
}

export function fmtShortWeekday(iso: ISO): string {
  return shortWeekdayFmt.format(new Date(iso));
}

/** "Tue, Oct 20, 10:40 PM" */
export function fmtDateTime(iso: ISO): string {
  return `${fmtDay(iso)}, ${fmtTime(iso)}`;
}

export function fmtHHMM(hhmm: string): string {
  return fmtTime(at("2026-01-01", hhmm));
}

/** "4h 15m" / "35m" */
export function fmtDuration(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

/** "3 min ago", "in 4h 15m", "yesterday 10:47 PM" */
export function fmtRelative(iso: ISO, now: ISO): string {
  const delta = diffMinutes(iso, now);
  if (Math.abs(delta) < 1) return "just now";
  if (delta > 0) return `in ${fmtDuration(delta)}`;
  const ago = -delta;
  if (ago < 60) return `${ago} min ago`;
  if (ago < 12 * 60) return `${fmtDuration(ago)} ago`;
  if (dayKey(iso) === dayKey(addMinutes(now, -1440))) return `yesterday ${fmtTime(iso)}`;
  return fmtDateTime(iso);
}

/** mm:ss for recorders. */
export function fmtElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
