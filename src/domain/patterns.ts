/**
 * Recurring-problem intelligence. Groups mentions across shifts (and, for stock,
 * across stores) and describes what co-occurs. Copy is deliberately about
 * correlation: "mentioned", "clusters after", "followed by" — never "caused by".
 */
import type { DemoDB, ExtractedItem, ID, ISO, Severity } from "./types";
import { dayKey, minutesOfDay, toMs } from "./time";

export interface PatternMention {
  itemId: ID;
  issueId: ID | null;
  handoffId: ID;
  locationId: ID;
  at: ISO;
  timed: boolean;
  title: string;
  sentence: string;
  authorId: ID;
  state: "fault" | "ok" | "false_alarm" | "handled" | "transfer";
  laborMinutes: number | null;
  falseAlarmNote?: string;
}

export interface Pattern {
  id: string;
  subjectKey: string;
  label: string;
  scope: "location" | "cross-location";
  topic: ExtractedItem["topic"];
  locationIds: ID[];
  mentions: PatternMention[];
  okReports: PatternMention[];
  falseAlarms: PatternMention[];
  contradictions: { fault: PatternMention; ok: PatternMention }[];
  count: number;
  firstAt: ISO;
  lastAt: ISO;
  spanDays: number;
  afterHour: { hour: number; count: number; of: number } | null;
  laborMinutes: number;
  laborStated: number;
  transfers: { from: ID; to: ID; at: ISO; itemId: ID }[];
  severity: Severity;
  headline: string;
  observation: string;
  caution: string;
  nextSteps: string[];
  issueIds: ID[];
  belowThreshold: boolean;
}

const LOCATION_NAME = (db: DemoDB, id: ID) => db.locations[id]?.name ?? id;

function mentionFrom(db: DemoDB, item: ExtractedItem): PatternMention | null {
  const h = db.handoffs[item.handoffId];
  if (!h || h.status !== "published" || item.status === "dismissed") return null;
  const primary = item.evidenceIds.map((id) => db.evidence[id]).find((e) => e?.role === "primary") ?? db.evidence[item.evidenceIds[0]];
  const f = item.fields;
  const state: PatternMention["state"] = f.falseAlarm
    ? "false_alarm"
    : f.assertion === "ok"
      ? "ok"
      : f.stockState === "out" || f.stockState === "low"
        ? "fault"
        : f.transfer
          ? "transfer"
          : f.stockState === "ok"
            ? "ok"
            : f.handled
              ? "handled"
              : "fault";
  return {
    itemId: item.id,
    issueId: item.issueId,
    handoffId: h.id,
    locationId: item.locationId,
    at: f.occurredAt ?? h.submittedAt ?? h.createdAt,
    timed: Boolean(f.occurredAt),
    title: item.title,
    sentence: primary?.text ?? "",
    authorId: h.authorId,
    state,
    laborMinutes: f.laborMinutes ?? null,
    falseAlarmNote: f.falseAlarm?.note,
  };
}

function daysBetween(a: ISO, b: ISO): number {
  return Math.round((Date.parse(`${dayKey(b)}T12:00:00Z`) - Date.parse(`${dayKey(a)}T12:00:00Z`)) / 86_400_000) + 1;
}

function fmtHour(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? "PM" : "AM"}`;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const TIMES = ["", "once", "twice"];
const times = (n: number) => TIMES[n] ?? `${n} times`;

export function detectPatterns(db: DemoDB, now: ISO): Pattern[] {
  const { patternMinMentions: min, patternWindowDays: windowDays } = db.settings.thresholds;
  const since = toMs(now) - windowDays * 86_400_000;
  const groups = new Map<string, { scope: Pattern["scope"]; mentions: PatternMention[]; items: ExtractedItem[] }>();

  for (const item of Object.values(db.items)) {
    // Equipment threads are per store; stock is compared across stores. Guests are not patterns.
    if (!item.subjectKey.startsWith("asset:") && !item.subjectKey.startsWith("stock:")) continue;
    const m = mentionFrom(db, item);
    if (!m || toMs(m.at) < since || toMs(m.at) > toMs(now) + 86_400_000) continue;
    const cross = item.subjectKey.startsWith("stock:");
    const key = cross ? item.subjectKey : `${item.subjectKey}@${item.locationId}`;
    const g = groups.get(key) ?? { scope: cross ? "cross-location" : "location", mentions: [], items: [] };
    g.mentions.push(m);
    g.items.push(item);
    groups.set(key, g);
  }

  const patterns: Pattern[] = [];
  for (const [key, g] of groups) {
    g.mentions.sort((a, b) => toMs(a.at) - toMs(b.at));
    const counted = g.mentions.filter((m) => m.state === "fault" || m.state === "handled" || (g.scope === "cross-location" && m.state === "transfer"));
    const okReports = g.mentions.filter((m) => m.state === "ok");
    const falseAlarms = g.mentions.filter((m) => m.state === "false_alarm");
    if (counted.length + falseAlarms.length < 2) continue;

    const sample = g.items[0];
    const label = sample.fields.assetLabel ?? sample.fields.itemLabel ?? sample.fields.customerRef ?? sample.title;
    const locationIds = Array.from(new Set(g.mentions.map((m) => m.locationId)));
    const first = counted[0] ?? g.mentions[0];
    const last = counted[counted.length - 1] ?? g.mentions[g.mentions.length - 1];
    const spanDays = daysBetween(first.at, last.at);

    const timed = counted.filter((m) => m.timed);
    const late = timed.filter((m) => minutesOfDay(m.at) >= 20 * 60);
    const afterHour = timed.length >= 3 && late.length / timed.length >= 0.66 ? { hour: 20, count: late.length, of: counted.length } : null;

    const labor = counted.reduce((s, m) => s + (m.laborMinutes ?? 0), 0);
    const laborStated = counted.filter((m) => m.laborMinutes != null).length;

    const contradictions: Pattern["contradictions"] = [];
    for (const ok of okReports) {
      const near = counted
        .filter((f) => Math.abs(toMs(f.at) - toMs(ok.at)) <= 48 * 3_600_000)
        .sort((a, b) => Math.abs(toMs(a.at) - toMs(ok.at)) - Math.abs(toMs(b.at) - toMs(ok.at)))[0];
      if (near) contradictions.push({ fault: near, ok });
    }

    const transfers = g.items
      .filter((i) => i.fields.transfer)
      .map((i) => {
        const t = i.fields.transfer!;
        const at = g.mentions.find((m) => m.itemId === i.id)!.at;
        return t.direction === "in" ? { from: t.locationId, to: i.locationId, at, itemId: i.id } : { from: i.locationId, to: t.locationId, at, itemId: i.id };
      })
      // the same transfer is often reported by both stores; keep one per day and pair
      .filter((t, idx, arr) => arr.findIndex((x) => x.from === t.from && x.to === t.to && dayKey(x.at) === dayKey(t.at)) === idx);

    const severity: Severity = g.items.some((i) => i.severity === "critical" && !i.fields.falseAlarm)
      ? "critical"
      : counted.length >= min + 2
        ? "high"
        : "normal";

    const multiStore = g.scope === "cross-location" && locationIds.length > 1;
    const headline = multiStore
      ? `${label} came up ${times(counted.length)} in ${spanDays} days across ${plural(locationIds.length, "store")}`
      : `${LOCATION_NAME(db, locationIds[0])} ${label.toLowerCase()} ${g.scope === "cross-location" ? "flagged" : "mentioned"} ${times(counted.length)} in ${spanDays} days`;

    const obs: string[] = [];
    if (afterHour) obs.push(`${afterHour.count} of ${afterHour.of} mentions were after ${fmtHour(afterHour.hour)}.`);
    if (labor > 0) obs.push(`Crews reported about ${Math.round((labor / 60) * 10) / 10} labor hours dealing with it.`);
    if (contradictions.length) obs.push(`${plural(okReports.length, "report")} said it was fine within two days of a fault report.`);
    if (falseAlarms.length) obs.push(`${plural(falseAlarms.length, "alert")} turned out to be a false alarm and ${falseAlarms.length === 1 ? "is" : "are"} not counted.`);
    if (transfers.length) {
      const borrowers = new Map<ID, number>();
      transfers.forEach((t) => borrowers.set(t.to, (borrowers.get(t.to) ?? 0) + 1));
      const [topBorrower, n] = Array.from(borrowers.entries()).sort((a, b) => b[1] - a[1])[0];
      obs.push(`${LOCATION_NAME(db, topBorrower)} borrowed from another store ${times(n)}.`);
      const lenders = Array.from(new Set(transfers.filter((t) => t.to === topBorrower).map((t) => t.from)));
      for (const lender of lenders) {
        const firstLend = transfers.filter((t) => t.from === lender).sort((a, b) => toMs(a.at) - toMs(b.at))[0];
        const afterShort = counted.filter((m) => m.locationId === lender && m.state === "fault" && toMs(m.at) > toMs(firstLend.at)).length;
        if (afterShort) obs.push(`${LOCATION_NAME(db, lender)} reported its own shortage ${times(afterShort)} after lending.`);
      }
    }

    const caution =
      g.scope === "cross-location"
        ? "Transfers keep each night running but can hide an ordering gap. This shows what happened together, not why."
        : afterHour
          ? "Reports show when it happened, not why. Treat the timing as a lead to test, not a diagnosis."
          : "This counts what crews said. It doesn't confirm a cause.";

    const nextSteps =
      sample.topic === "refrigeration"
        ? ["Book a technician and send this evidence trail with the ticket.", `Log the ${label.toLowerCase()} condition at 8 PM for three nights to test the timing.`]
        : sample.topic === "cooking"
          ? ["Log probe-thermometer readings at 6 PM and at close for a week.", "Ask the equipment vendor to check the thermostat."]
          : g.scope === "cross-location"
            ? [`Review ${LOCATION_NAME(db, transfers[0]?.to ?? locationIds[0])}'s par for ${label.toLowerCase()}.`, `Add ${label.toLowerCase()} to the next order for every store.`]
            : ["Assign an owner and a date to close this out."];

    patterns.push({
      id: key.replace(/[:@]/g, "_"),
      subjectKey: sample.subjectKey,
      label,
      scope: g.scope,
      topic: sample.topic,
      locationIds,
      mentions: counted,
      okReports,
      falseAlarms,
      contradictions,
      count: counted.length,
      firstAt: first.at,
      lastAt: last.at,
      spanDays,
      afterHour,
      laborMinutes: labor,
      laborStated,
      transfers,
      severity,
      headline,
      observation: obs.join(" "),
      caution,
      nextSteps,
      issueIds: Array.from(new Set(g.items.map((i) => i.issueId).filter(Boolean) as ID[])),
      belowThreshold: counted.length < min,
    });
  }

  const rank: Record<Severity, number> = { critical: 3, high: 2, normal: 1, watch: 0 };
  return patterns.sort((a, b) => Number(a.belowThreshold) - Number(b.belowThreshold) || rank[b.severity] - rank[a.severity] || b.count - a.count);
}

export function patternForIssue(patterns: Pattern[], issueId: ID): Pattern | undefined {
  return patterns.find((p) => p.issueIds.includes(issueId) && !p.belowThreshold) ?? patterns.find((p) => p.issueIds.includes(issueId));
}
