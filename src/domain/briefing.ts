/**
 * Composes the opening brief. It answers four questions, in this order:
 * what can hurt today, what must be done before opening, what changed since
 * yesterday, and what the prior crew already handled.
 */
import type { DemoDB, ExtractedItem, Handoff, ID, ISO, Issue, Location, Severity, Task, User } from "./types";
import { addDays, at, dayKey, minutesOfDay, toMs } from "./time";
import { evaluateOpenAt, type TimedEscalation } from "./rules/evaluate";
import { detectPatterns, type Pattern } from "./patterns";

export interface BriefEntry {
  key: string;
  title: string;
  severity: Severity;
  why: string;
  task: Task | null;
  issue: Issue | null;
  item: ExtractedItem | null;
  dueAt: ISO | null;
  carriedOver: boolean;
  recurring: { count: number; spanDays: number; patternId: string } | null;
  timer: TimedEscalation | null;
}

export interface ChangeEntry {
  key: string;
  kind: "new" | "again" | "returned" | "resolved" | "quiet";
  title: string;
  detail: string;
  href: string | null;
}

export interface HandledEntry {
  key: string;
  title: string;
  detail: string;
  item: ExtractedItem;
}

export interface BriefingView {
  state: "awaiting" | "ready";
  location: Location;
  openingDate: string;
  readyAt: ISO;
  doorsOpenAt: ISO;
  lunchAt: ISO;
  handoff: Handoff | null;
  pendingHandoff: Handoff | null;
  author: User | null;
  risks: BriefEntry[];
  mustDo: BriefEntry[];
  changed: ChangeEntry[];
  handled: HandledEntry[];
  crewNotes: string[];
  acks: { user: User; at: ISO }[];
  briefingId: ID | null;
  closeoutDueAt: ISO;
  itemCount: number;
}

/** The opening shift the brief is for: today before 2 PM, otherwise tomorrow. */
export function openingDateFor(now: ISO): string {
  return minutesOfDay(now) < 14 * 60 ? dayKey(now) : addDays(dayKey(now), 1);
}

const RANK: Record<Severity, number> = { critical: 3, high: 2, normal: 1, watch: 0 };

export function composeBriefing(db: DemoDB, locationId: ID, now: ISO, patterns: Pattern[] = detectPatterns(db, now)): BriefingView {
  const location = db.locations[locationId];
  const openingDate = openingDateFor(now);
  const closeDate = addDays(openingDate, -1);
  const closeTemplate = Object.values(db.shiftTemplates).find((t) => t.locationId === locationId && t.kind === "close");
  const handoffsLastNight = Object.values(db.handoffs)
    .filter((h) => h.locationId === locationId && db.shiftInstances[h.shiftInstanceId]?.date === closeDate)
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  const handoff = handoffsLastNight.find((h) => h.status === "published") ?? null;
  const pending = handoffsLastNight.find((h) => h.status !== "published") ?? null;
  const briefing = Object.values(db.briefings).find((b) => b.locationId === locationId && b.date === openingDate) ?? null;

  const base = {
    location,
    openingDate,
    readyAt: at(openingDate, "06:00"),
    doorsOpenAt: at(openingDate, location.doorsOpen),
    lunchAt: at(openingDate, location.lunchRush),
    closeoutDueAt: at(closeDate, closeTemplate?.handoffAt ?? "22:45"),
    pendingHandoff: pending,
    briefingId: briefing?.id ?? null,
  };

  if (!handoff) {
    return { ...base, state: "awaiting", handoff: null, author: null, risks: [], mustDo: [], changed: [], handled: [], crewNotes: [], acks: [], itemCount: 0 };
  }

  const items = Object.values(db.items).filter((i) => i.handoffId === handoff.id && i.status !== "dismissed");
  const tasks = Object.values(db.tasks).filter((t) => t.locationId === locationId);
  const openTasks = tasks.filter((t) => t.status !== "done" || (t.resolvedAt && dayKey(t.resolvedAt) === openingDate && toMs(t.resolvedAt) >= toMs(handoff.publishedAt ?? handoff.createdAt)));
  const timers = evaluateOpenAt(Object.values(db.rules), openTasks, db.issues, db.items, now);

  const taskForItem = (item: ExtractedItem): Task | null =>
    openTasks.find((t) => t.itemIds.includes(item.id)) ?? (item.issueId ? openTasks.find((t) => t.issueId === item.issueId) ?? null : null);

  const recurringFor = (issue: Issue | null) => {
    if (!issue) return null;
    const p = patterns.find((x) => x.issueIds.includes(issue.id) && !x.belowThreshold);
    return p ? { count: p.count, spanDays: p.spanDays, patternId: p.id } : null;
  };

  const used = new Set<ID>();
  const risks: BriefEntry[] = [];
  for (const item of items) {
    const isFault = item.fields.assertion !== "ok" && !item.fields.handled && item.fields.stockState !== "ok" && !(item.fields.transfer?.direction === "out" && item.fields.stockState !== "out");
    if (!isFault || RANK[item.severity] < RANK.high) continue;
    const task = taskForItem(item);
    const issue = item.issueId ? db.issues[item.issueId] : null;
    if (task) used.add(task.id);
    risks.push({
      key: `risk-${item.id}`,
      title: item.title,
      severity: item.severity,
      why: whyItHurts(item, location),
      task,
      issue,
      item,
      dueAt: task?.dueAt ?? null,
      carriedOver: false,
      recurring: recurringFor(issue),
      timer: task ? timers.find((t) => t.taskId === task.id) ?? null : null,
    });
  }
  risks.sort((a, b) => RANK[b.severity] - RANK[a.severity] || toMs(a.dueAt ?? a.item?.fields.occurredAt ?? now) - toMs(b.dueAt ?? now));

  const mustDo: BriefEntry[] = openTasks
    .filter((t) => !used.has(t.id))
    .filter((t) => !t.dueAt || dayKey(t.dueAt) <= openingDate)
    .map((t) => {
      const item = t.itemIds.map((id) => db.items[id]).filter(Boolean).sort((a, b) => toMs(db.handoffs[b.handoffId]?.createdAt ?? now) - toMs(db.handoffs[a.handoffId]?.createdAt ?? now))[0] ?? null;
      const issue = t.issueId ? db.issues[t.issueId] : null;
      const carriedOver = !t.itemIds.some((id) => db.items[id]?.handoffId === handoff.id);
      return {
        key: `task-${t.id}`,
        title: t.title,
        severity: item?.severity ?? "normal",
        why: carriedOver ? `Carried over since ${fmtShortDate(t.createdAt)}` : t.detail,
        task: t,
        issue,
        item,
        dueAt: t.dueAt,
        carriedOver,
        recurring: recurringFor(issue),
        timer: timers.find((x) => x.taskId === t.id) ?? null,
      };
    })
    .sort((a, b) => Number(a.carriedOver) - Number(b.carriedOver) || toMs(a.dueAt ?? now) - toMs(b.dueAt ?? now));

  // What changed since yesterday
  const changed: ChangeEntry[] = [];
  for (const item of items) {
    const issue = item.issueId ? db.issues[item.issueId] : null;
    if (!issue) continue;
    const priorMentions = issue.itemIds.filter((id) => id !== item.id && db.items[id] && toMs(db.handoffs[db.items[id].handoffId]?.createdAt ?? now) < toMs(handoff.createdAt));
    const returned = item.kind !== "inventory" && Object.values(db.audit).some((a) => a.entityId === issue.id && a.action === "issue.recurred" && toMs(a.at) >= toMs(handoff.createdAt));
    const rec = recurringFor(issue);
    if (returned) {
      const prevResolution = Object.values(db.audit)
        .filter((a) => a.entityType === "task" && a.action === "task.resolved" && tasks.find((t) => t.id === a.entityId)?.issueId === issue.id)
        .sort((a, b) => toMs(b.at) - toMs(a.at))[0];
      changed.push({ key: `chg-${item.id}`, kind: "returned", title: item.title, detail: prevResolution ? `Marked resolved ${fmtShortDate(prevResolution.at)}: ${prevResolution.detail ?? prevResolution.summary}` : "Was marked resolved before last night", href: `/issues/${issue.id}` });
    } else if (priorMentions.length === 0) {
      changed.push({ key: `chg-${item.id}`, kind: "new", title: item.title, detail: "First mention", href: `/issues/${issue.id}` });
    } else if (rec) {
      changed.push({ key: `chg-${item.id}`, kind: "again", title: item.title, detail: `${ordinal(rec.count)} mention in ${rec.spanDays} days`, href: `/patterns#${rec.patternId}` });
    } else {
      changed.push({ key: `chg-${item.id}`, kind: "again", title: item.title, detail: `${item.kind === "inventory" ? "Also flagged" : "Also mentioned"} ${fmtShortDate(db.handoffs[db.items[priorMentions[priorMentions.length - 1]].handoffId]?.createdAt ?? now)}`, href: `/issues/${issue.id}` });
    }
  }
  const prevHandoff = Object.values(db.handoffs)
    .filter((h) => h.locationId === locationId && h.status === "published" && toMs(h.createdAt) < toMs(handoff.createdAt))
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))[0];
  if (prevHandoff) {
    for (const t of tasks) {
      if (t.status === "done" && t.resolvedAt && toMs(t.resolvedAt) > toMs(prevHandoff.publishedAt ?? prevHandoff.createdAt) && toMs(t.resolvedAt) < toMs(handoff.createdAt)) {
        changed.push({ key: `chg-res-${t.id}`, kind: "resolved", title: t.title, detail: `${db.users[t.resolvedById ?? ""]?.firstName ?? "Someone"}: ${t.resolutionNote ?? "done"}`, href: t.issueId ? `/issues/${t.issueId}` : null });
      }
    }
  }
  const order = { returned: 0, again: 1, new: 2, resolved: 3, quiet: 4 } as const;
  changed.sort((a, b) => order[a.kind] - order[b.kind]);

  // What the prior crew already handled
  const handled: HandledEntry[] = [];
  for (const item of items) {
    if (item.fields.handled) {
      handled.push({ key: `hd-${item.id}`, title: item.title, detail: item.facts.find((f) => /confirmed|handled|comped/i.test(f)) ?? item.fields.handledNote ?? "Handled on shift", item });
    } else if (item.fields.recovery) {
      const fact = item.facts.filter((f) => /shut down|came back|restart|held/i.test(f)).join(", ");
      handled.push({ key: `hd-${item.id}`, title: `${item.fields.assetLabel ?? item.title}: kept running overnight`, detail: fact || "Recovered on shift", item });
    } else if (item.fields.assertion === "ok") {
      handled.push({ key: `hd-${item.id}`, title: item.title, detail: "Status check from the closing crew", item });
    }
  }

  const acks = Object.values(db.acknowledgments)
    .filter((a) => a.entityType === "briefing" && briefing && a.entityId === briefing.id)
    .map((a) => ({ user: db.users[a.userId], at: a.at }))
    .filter((a) => a.user);

  return {
    ...base,
    state: "ready",
    handoff,
    author: db.users[handoff.authorId] ?? null,
    risks,
    mustDo,
    changed,
    handled,
    crewNotes: handoff.crewNotes.map((c) => c.text),
    acks,
    itemCount: items.length,
  };
}

function whyItHurts(item: ExtractedItem, location: Location): string {
  const f = item.fields;
  if (item.kind === "inventory" && f.stockState === "out") return `None on hand before the ${location.lunchRush} lunch rush.`;
  if (item.kind === "customer" && item.subtype === "refund") return "A guest is waiting on money. Rules escalate open refunds at 9 AM.";
  if (item.kind === "customer") return "A guest is waiting on a call back.";
  if (item.topic === "refrigeration") {
    const bin = item.facts.find((x) => /\bbin\b/i.test(x));
    return bin ? `${bin}. Lunch service needs a full bin.` : "Cold holding is a food-safety risk.";
  }
  if (item.subtype === "safety") return "Someone was hurt on shift.";
  if (item.subtype === "security") return "The building may not have been secure.";
  return item.facts[0] ?? "Flagged by the closing crew.";
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function fmtShortDate(iso: ISO): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso));
}
