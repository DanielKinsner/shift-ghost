/**
 * Every state change in Shift Ghost is a command: a function that mutates a
 * *draft copy* of the DemoDB and reports which records it touched. The store
 * clones before calling, so commands read like plain mutations while the app
 * keeps immutable snapshots for undo and cross-tab sync.
 *
 * Each command maps 1:1 to a future API mutation (see DECISIONS D-31).
 */
import type {
  AuditEvent,
  Channel,
  CloseoutQuestion,
  DemoDB,
  EscalationRule,
  ExtractedItem,
  GuideStep,
  Handoff,
  ID,
  ISO,
  Issue,
  ItemKind,
  Location,
  NotificationPrefs,
  OrgSettings,
  Role,
  Severity,
  ShiftTemplate,
  TableName,
  Task,
  TextSpan,
  TranscriptAnswer,
  User,
} from "./types";
import { ruleBasedExtractor, type DraftItem, type ExtractionContext } from "./extraction/extract";
import { joinAnswers } from "./extraction/segment";
import { applyRules, evaluateOpenAt, summarizeRule, toEvaluable } from "./rules/evaluate";
import { addDays, at, dayKey, fmtTime, toMs } from "./time";

export interface Ctx {
  now: ISO;
  actorId: ID | null;
}

export interface Touched {
  table: TableName;
  id: ID;
}

export interface CommandResult {
  touched: Touched[];
  message?: string;
  data?: Record<string, unknown>;
}

export interface ConflictInfo {
  taskId: ID;
  taskTitle: string;
  byUserId: ID | null;
  at: ISO;
  theirChange: string;
}

export class ConflictError extends Error {
  constructor(public info: ConflictInfo) {
    super("conflict");
  }
}

export class CommandError extends Error {}

export type Command<I> = (db: DemoDB, input: I, ctx: Ctx) => CommandResult;

// ───────────────────────────────── helpers

export function nextId(db: DemoDB, prefix: string): ID {
  db.seq += 1;
  return `${prefix}-${db.seq.toString(36).padStart(3, "0")}`;
}

export function audit(db: DemoDB, ctx: Ctx, e: Omit<AuditEvent, "id" | "at" | "actorId"> & { actorId?: ID | null }): void {
  const id = nextId(db, "ae");
  db.audit[id] = { id, at: ctx.now, actorId: e.actorId === undefined ? ctx.actorId : e.actorId, ...e };
}

function notify(
  db: DemoDB,
  ctx: Ctx,
  n: { userId: ID; title: string; body: string; href: string; severity: Severity; channel: Channel },
): void {
  const id = nextId(db, "nt");
  db.notifications[id] = { id, at: ctx.now, readAt: null, ...n };
}

function userName(db: DemoDB, id: ID | null | undefined): string {
  return (id && db.users[id]?.name) || "Someone";
}

function usersWithRole(db: DemoDB, role: Role, locationId: ID): User[] {
  return Object.values(db.users).filter((u) => u.role === role && u.appUser && (u.locationIds.includes(locationId) || role === "area_manager"));
}

export function activeQuestions(db: DemoDB): CloseoutQuestion[] {
  return Object.values(db.questions)
    .filter((q) => q.active)
    .sort((a, b) => a.order - b.order);
}

export function evidenceText(db: DemoDB, item: ExtractedItem): string[] {
  return item.evidenceIds.map((id) => db.evidence[id]?.text ?? "");
}

export function buildExtractionContext(db: DemoDB, handoff: Handoff): ExtractionContext {
  const location = db.locations[handoff.locationId];
  const shift = db.shiftInstances[handoff.shiftInstanceId];
  const roster = Object.values(db.users).map((u) => ({ id: u.id, firstName: u.firstName }));
  const rushQ = activeQuestions(db).find((q) => /before the next rush/i.test(q.prompt));
  return {
    locationId: location.id,
    location,
    shiftKind: shift?.kind ?? "close",
    shiftDate: shift?.date ?? dayKey(handoff.createdAt),
    nextOpenDate: shift?.kind === "open" ? shift.date : addDays(shift?.date ?? dayKey(handoff.createdAt), 1),
    roster,
    answers: handoff.answers,
    rushQuestionId: rushQ?.id ?? null,
  };
}

/** Find or create tonight's closing shift instance for a location. */
export function ensureShiftInstance(db: DemoDB, locationId: ID, date: string, kind: "open" | "close"): ID {
  const existing = Object.values(db.shiftInstances).find((s) => s.locationId === locationId && s.date === date && s.kind === kind);
  if (existing) return existing.id;
  const template = Object.values(db.shiftTemplates).find((t) => t.locationId === locationId && t.kind === kind);
  const id = `si-${locationId.slice(4)}-${date.slice(5).replace("-", "")}-${kind}`;
  db.shiftInstances[id] = {
    id,
    templateId: template?.id ?? "",
    locationId,
    date,
    kind,
    managerId: null,
    startsAt: at(date, template?.start ?? (kind === "open" ? "06:00" : "14:30")),
    endsAt: at(date, template?.end ?? (kind === "open" ? "14:30" : "23:00")),
  };
  return id;
}

// ───────────────────────────────── capture

export interface CreateHandoffInput {
  locationId: ID;
  authorId: ID;
  mode: "guided" | "free";
  answers: Omit<TranscriptAnswer, "start" | "end">[];
  hasRecording: boolean;
  /** Queue instead of processing (offline capture). */
  queued?: boolean;
  shiftDate?: string;
  id?: ID;
}

export const createHandoff: Command<CreateHandoffInput> = (db, input, ctx) => {
  const { transcript, answers } = joinAnswers(input.answers);
  if (!transcript.trim()) throw new CommandError("Record or type at least one answer before submitting.");
  const date = input.shiftDate ?? dayKey(ctx.now);
  const shiftInstanceId = ensureShiftInstance(db, input.locationId, date, "close");
  const id = input.id ?? nextId(db, "ho");
  const durationSec = answers.reduce((s, a) => s + a.durationSec, 0);
  db.handoffs[id] = {
    id,
    orgId: db.organization.id,
    locationId: input.locationId,
    shiftInstanceId,
    authorId: input.authorId,
    createdAt: ctx.now,
    submittedAt: ctx.now,
    publishedAt: null,
    publishedById: null,
    status: input.queued ? "queued" : "processing",
    mode: input.mode,
    answers,
    transcript,
    audio: {
      durationSec,
      hasRecording: input.hasRecording,
      retainedUntil: input.hasRecording ? fromDays(ctx.now, db.settings.retention.audioDays) : null,
      deletedAt: null,
      deletedById: null,
    },
    unmapped: [],
    crewNotes: [],
    merges: [],
    error: null,
  };
  audit(db, ctx, {
    action: input.queued ? "handoff.queued" : "handoff.submitted",
    entityType: "handoff",
    entityId: id,
    locationId: input.locationId,
    summary: input.queued
      ? `Saved a closeout on this device while offline (${answers.length} answers)`
      : `Submitted ${db.locations[input.locationId].name} closeout (${answers.length} answers, ${Math.round(durationSec)}s)`,
  });
  return { touched: [{ table: "handoffs", id }], data: { handoffId: id } };
};

function fromDays(iso: ISO, days: number): ISO {
  return new Date(toMs(iso) + days * 86_400_000).toISOString().replace(".000Z", "Z");
}

export const processHandoff: Command<{ handoffId: ID }> = (db, { handoffId }, ctx) => {
  const h = db.handoffs[handoffId];
  if (!h) throw new CommandError("That closeout no longer exists.");
  if (db.demo.failNextExtraction) {
    db.demo.failNextExtraction = false;
    h.status = "processing";
    h.error = "Extraction timed out after 30 seconds. The recording and transcript are saved on this device.";
    audit(db, ctx, { action: "handoff.failed", entityType: "handoff", entityId: h.id, locationId: h.locationId, summary: "Extraction failed; transcript kept" });
    return { touched: [{ table: "handoffs", id: h.id }] };
  }
  // Re-running replaces earlier proposals for this handoff.
  for (const item of Object.values(db.items)) {
    if (item.handoffId === h.id) {
      item.evidenceIds.forEach((e) => delete db.evidence[e]);
      delete db.items[item.id];
    }
  }
  const ectx = buildExtractionContext(db, h);
  const result = ruleBasedExtractor.extract(h.transcript, ectx);
  const rules = Object.values(db.rules);
  const touched: Touched[] = [{ table: "handoffs", id: h.id }];
  let needsReview = 0;
  for (const draft of result.items) {
    const item = draftToItem(db, h, draft, rules);
    if (item.confidence !== "high") needsReview++;
    touched.push({ table: "items", id: item.id });
  }
  h.unmapped = result.unmapped;
  h.crewNotes = result.crewNotes;
  h.merges = result.merges;
  h.status = "review";
  h.error = null;
  audit(db, ctx, {
    action: "handoff.extracted",
    entityType: "handoff",
    entityId: h.id,
    locationId: h.locationId,
    actorId: null,
    summary: `Shift Ghost extracted ${result.items.length} items; ${needsReview} need a person to confirm`,
    detail: result.unmapped.length ? `${result.unmapped.length} sentence(s) kept as unmapped notes` : undefined,
  });
  return { touched, data: { itemCount: result.items.length, needsReview } };
};

function draftToItem(db: DemoDB, h: Handoff, draft: DraftItem, rules: EscalationRule[]): ExtractedItem {
  const id = nextId(db, "it");
  const evidenceIds = draft.evidence.map((e) => {
    const eid = nextId(db, "ev");
    db.evidence[eid] = { id: eid, handoffId: h.id, start: e.start, end: e.end, text: e.text, questionId: e.questionId, role: e.role };
    return eid;
  });
  const outcome = applyRules(rules, toEvaluable(draft, draft.evidence.map((e) => e.text)), h.locationId);
  const item: ExtractedItem = {
    id,
    handoffId: h.id,
    locationId: h.locationId,
    issueId: null,
    kind: draft.kind,
    subtype: draft.subtype,
    topic: draft.topic,
    subjectKey: draft.subjectKey,
    title: draft.title,
    facts: draft.facts,
    severity: outcome.severity,
    confidence: draft.confidence,
    confidenceReason: draft.confidenceReason,
    status: "proposed",
    evidenceIds,
    inferences: draft.inferences,
    mergedKinds: draft.mergedKinds,
    fields: draft.fields,
    ruleHits: outcome.hits,
    ruleEffects: {
      notify: outcome.notify.map((n) => ({ ...n, channel: n.channel as Channel })),
      tasks: outcome.tasks,
      escalate: outcome.escalate,
      requireConfirmation: outcome.requireConfirmation,
    },
    proposedTask: draft.task,
    hedge: draft.hedge,
    reviewedById: null,
    reviewedAt: null,
  };
  db.items[id] = item;
  return item;
}

// ───────────────────────────────── review

export function itemNeedsReview(item: ExtractedItem): boolean {
  return item.status === "proposed" && (item.confidence !== "high" || item.ruleEffects.requireConfirmation);
}

export const confirmItem: Command<{ itemId: ID }> = (db, { itemId }, ctx) => {
  const item = db.items[itemId];
  item.status = "confirmed";
  item.reviewedById = ctx.actorId;
  item.reviewedAt = ctx.now;
  audit(db, ctx, { action: "item.confirmed", entityType: "item", entityId: itemId, locationId: item.locationId, summary: `Confirmed “${item.title}”`, detail: item.confidence !== "high" ? `Was marked ${item.confidence}: ${item.confidenceReason}` : undefined });
  return { touched: [{ table: "items", id: itemId }], message: "Confirmed" };
};

export interface CorrectItemInput {
  itemId: ID;
  title?: string;
  severity?: Severity;
  qty?: number | null;
  ownerId?: ID | null;
  kind?: ItemKind;
  note?: string;
}

export const correctItem: Command<CorrectItemInput> = (db, input, ctx) => {
  const item = db.items[input.itemId];
  const before = `${item.title} (${item.severity})`;
  if (input.qty !== undefined && item.kind === "inventory") {
    const f = item.fields;
    f.qty = input.qty;
    f.stockState = input.qty === 0 ? "out" : f.par != null && input.qty != null && input.qty >= f.par ? "ok" : "low";
    item.inferences = item.inferences.filter((i) => i.field !== "On hand");
    item.facts = item.facts.filter((x) => !/on hand/.test(x));
    if (input.qty != null) item.facts.unshift(`${input.qty} ${f.unit}${input.qty === 1 ? "" : "s"} on hand${f.par != null ? ` (par ${f.par})` : ""} · corrected`);
    if (!input.title) {
      item.title =
        f.stockState === "out"
          ? `${f.itemLabel} out${f.transfer?.direction === "out" ? `, lent to ${db.locations[f.transfer.locationId]?.name}` : ""}`
          : `${f.itemLabel} down to ${input.qty} ${f.unit}${input.qty === 1 ? "" : "s"}`;
    }
    item.severity = f.stockState === "out" ? "high" : "normal";
  }
  if (input.title) item.title = input.title.trim();
  if (input.severity) item.severity = input.severity;
  if (input.ownerId !== undefined) {
    item.fields.ownerId = input.ownerId;
    if (item.proposedTask) item.proposedTask.ownerId = input.ownerId;
  }
  if (input.kind && input.kind !== item.kind) {
    item.kind = input.kind;
    item.subtype = "general";
  }
  item.status = "corrected";
  item.correctionNote = input.note?.trim() || undefined;
  item.reviewedById = ctx.actorId;
  item.reviewedAt = ctx.now;
  audit(db, ctx, { action: "item.corrected", entityType: "item", entityId: item.id, locationId: item.locationId, summary: `Corrected “${before}” → “${item.title} (${item.severity})”`, detail: input.note });
  return { touched: [{ table: "items", id: item.id }], message: "Correction saved" };
};

export const dismissItem: Command<{ itemId: ID; reason: string }> = (db, { itemId, reason }, ctx) => {
  const item = db.items[itemId];
  item.status = "dismissed";
  item.correctionNote = reason;
  item.reviewedById = ctx.actorId;
  item.reviewedAt = ctx.now;
  audit(db, ctx, { action: "item.dismissed", entityType: "item", entityId: itemId, locationId: item.locationId, summary: `Dismissed “${item.title}”`, detail: reason });
  return { touched: [{ table: "items", id: itemId }], message: "Dismissed" };
};

export const restoreItem: Command<{ itemId: ID }> = (db, { itemId }, ctx) => {
  const item = db.items[itemId];
  item.status = "proposed";
  item.reviewedById = null;
  item.reviewedAt = null;
  audit(db, ctx, { action: "item.restored", entityType: "item", entityId: itemId, locationId: item.locationId, summary: `Restored “${item.title}” for review` });
  return { touched: [{ table: "items", id: itemId }] };
};

export const createItemFromSpan: Command<{ handoffId: ID; span: TextSpan; kind: ItemKind; title: string }> = (db, input, ctx) => {
  const h = db.handoffs[input.handoffId];
  const id = nextId(db, "it");
  const eid = nextId(db, "ev");
  db.evidence[eid] = { id: eid, handoffId: h.id, ...input.span, questionId: h.answers.find((a) => input.span.start >= a.start && input.span.start < a.end)?.questionId ?? null, role: "primary" };
  db.items[id] = {
    id,
    handoffId: h.id,
    locationId: h.locationId,
    issueId: null,
    kind: input.kind,
    subtype: "general",
    topic: "people",
    subjectKey: `note:${id}`,
    title: input.title.trim(),
    facts: [],
    severity: "normal",
    confidence: "high",
    confidenceReason: "Added by a reviewer from a sentence Shift Ghost couldn't classify.",
    status: "confirmed",
    evidenceIds: [eid],
    inferences: [],
    mergedKinds: [],
    fields: {},
    ruleHits: [],
    ruleEffects: { notify: [], tasks: [], escalate: [], requireConfirmation: false },
    proposedTask:
      input.kind === "task"
        ? { title: input.title.trim(), detail: "Added during review", kind: "follow_up", ownerId: null, dueAt: at(addDays(dayKey(h.createdAt), 1), db.locations[h.locationId].doorsOpen), dueLabel: "before opening" }
        : null,
    hedge: null,
    reviewedById: ctx.actorId,
    reviewedAt: ctx.now,
  };
  h.unmapped = h.unmapped.filter((u) => u.start !== input.span.start);
  audit(db, ctx, { action: "item.created", entityType: "item", entityId: id, locationId: h.locationId, summary: `Added “${input.title}” from an unmapped sentence` });
  return { touched: [{ table: "items", id }, { table: "handoffs", id: h.id }] };
};

export interface PublishPreview {
  blocking: ExtractedItem[];
  critical: { item: ExtractedItem; recipients: User[]; channel: Channel }[];
  items: ExtractedItem[];
}

export function publishPreview(db: DemoDB, handoffId: ID): PublishPreview {
  const items = Object.values(db.items).filter((i) => i.handoffId === handoffId && i.status !== "dismissed");
  const blocking = items.filter(itemNeedsReview);
  const critical: PublishPreview["critical"] = [];
  const h = db.handoffs[handoffId];
  for (const item of items) {
    for (const n of item.ruleEffects.notify) {
      if (item.severity !== "critical") continue;
      critical.push({ item, recipients: usersWithRole(db, n.role, h.locationId), channel: n.channel });
    }
  }
  return { blocking, critical, items };
}

export const publishHandoff: Command<{ handoffId: ID }> = (db, { handoffId }, ctx) => {
  const h = db.handoffs[handoffId];
  const preview = publishPreview(db, handoffId);
  if (preview.blocking.length) throw new CommandError(`${preview.blocking.length} item(s) still need a person to confirm.`);
  const ectx = buildExtractionContext(db, h);
  const touched: Touched[] = [{ table: "handoffs", id: h.id }];
  const orderPrep: ExtractedItem[] = [];
  let tasksCreated = 0;
  let tasksMerged = 0;

  for (const item of preview.items) {
    if (item.status === "proposed") {
      item.status = "confirmed";
      item.reviewedById = ctx.actorId;
      item.reviewedAt = ctx.now;
    }
    const issue = upsertIssue(db, item, h, ctx);
    touched.push({ table: "items", id: item.id }, { table: "issues", id: issue.id });
    materializeRecord(db, item, h, issue, ctx);

    if (item.proposedTask) {
      const r = upsertTask(db, item, issue, ctx);
      if (r.created) tasksCreated++;
      else tasksMerged++;
      touched.push({ table: "tasks", id: r.task.id });
    }
    if (item.ruleEffects.tasks.some((t) => t.template === "order_prep")) orderPrep.push(item);

    for (const n of item.ruleEffects.notify) {
      for (const u of usersWithRole(db, n.role, h.locationId)) {
        notify(db, ctx, {
          userId: u.id,
          title: `${item.severity === "critical" ? "Critical · " : ""}${item.title}`,
          body: `${db.locations[h.locationId].name} closeout from ${userName(db, h.authorId)}. ${summarizeRule(db.rules[n.ruleId])}`,
          href: `/issues/${issue.id}`,
          severity: item.severity,
          channel: n.channel,
        });
        audit(db, ctx, {
          action: "rule.notified",
          entityType: "issue",
          entityId: issue.id,
          locationId: h.locationId,
          actorId: null,
          summary: `Rule “${db.rules[n.ruleId]?.name}” notified ${u.name} by ${n.channel === "sms" ? "text" : n.channel.replace("_", " ")}`,
        });
      }
    }
  }

  if (orderPrep.length) {
    const t = upsertOrderPrep(db, h.locationId, orderPrep, ectx.nextOpenDate, ctx);
    touched.push({ table: "tasks", id: t.id });
  }

  h.status = "published";
  h.publishedAt = ctx.now;
  h.publishedById = ctx.actorId;
  const briefingId = `br-${h.locationId.slice(4)}-${ectx.nextOpenDate.slice(5).replace("-", "")}`;
  db.briefings[briefingId] = { id: briefingId, locationId: h.locationId, date: ectx.nextOpenDate, handoffId: h.id, readyAt: at(ectx.nextOpenDate, "06:00") };
  touched.push({ table: "briefings", id: briefingId });

  for (const u of [...usersWithRole(db, "opening_manager", h.locationId), ...usersWithRole(db, "kitchen_lead", h.locationId)]) {
    notify(db, ctx, {
      userId: u.id,
      title: `Opening brief ready for ${db.locations[h.locationId].name}`,
      body: `${preview.items.length} items from ${userName(db, h.authorId)}'s closeout at ${fmtTime(h.submittedAt ?? ctx.now)}.`,
      href: "/briefing",
      severity: "normal",
      channel: "push",
    });
  }

  audit(db, ctx, {
    action: "handoff.published",
    entityType: "handoff",
    entityId: h.id,
    locationId: h.locationId,
    summary: `Published ${db.locations[h.locationId].name} closeout to the opening crew`,
    detail: `${preview.items.length} items · ${tasksCreated} new tasks · ${tasksMerged} merged into open tasks`,
  });
  return { touched, message: "Published to the opening crew", data: { tasksCreated, tasksMerged } };
};

function itemTime(item: ExtractedItem, h: Handoff): ISO {
  return item.fields.occurredAt ?? h.submittedAt ?? h.createdAt;
}

type MentionState = "fault" | "handled" | "ok";

function mentionState(item: ExtractedItem): MentionState {
  if (item.fields.falseAlarm) return "ok";
  if (item.fields.assertion === "ok" || item.fields.stockState === "ok") return "ok";
  if (item.fields.handled) return "handled";
  return "fault";
}

function upsertIssue(db: DemoDB, item: ExtractedItem, h: Handoff, ctx: Ctx): Issue {
  const seenAt = itemTime(item, h);
  const state = mentionState(item);
  const existing = Object.values(db.issues).find((i) => i.locationId === item.locationId && i.subjectKey === item.subjectKey);
  if (existing) {
    existing.itemIds.push(item.id);
    if (toMs(seenAt) >= toMs(existing.lastSeenAt)) existing.lastSeenAt = seenAt;
    if (state === "fault") {
      // An "all clear" report never renames the thread; a new fault does.
      existing.title = item.title;
      existing.severity = item.severity;
      if (existing.status === "resolved" || existing.status === "false_alarm") {
        existing.status = "open";
        existing.resolvedAt = null;
        existing.resolvedById = null;
        audit(db, ctx, { action: "issue.recurred", entityType: "issue", entityId: existing.id, locationId: existing.locationId, actorId: null, summary: `\u201c${existing.title}\u201d came back after being marked resolved`, detail: existing.resolutionNote ? `Previous resolution: ${existing.resolutionNote}` : undefined });
      } else {
        existing.status = "open";
        audit(db, ctx, { action: "issue.mentioned", entityType: "issue", entityId: existing.id, locationId: existing.locationId, actorId: null, summary: `Mentioned again: \u201c${item.title}\u201d (${existing.itemIds.length} mentions)` });
      }
    } else if (state === "handled") {
      if (item.kind === "customer") {
        existing.status = "resolved";
        existing.resolvedAt = ctx.now;
        existing.resolutionNote = item.fields.handledNote ?? item.title;
      } else if (existing.status === "open") existing.status = "monitoring";
      audit(db, ctx, { action: "issue.mentioned", entityType: "issue", entityId: existing.id, locationId: existing.locationId, actorId: null, summary: `Handled on shift: \u201c${item.title}\u201d` });
    } else {
      if (item.kind === "inventory") {
        existing.status = "resolved";
        existing.resolvedAt = ctx.now;
        existing.resolutionNote = item.title;
      } else if (existing.status === "open") existing.status = "monitoring";
      audit(db, ctx, { action: "issue.mentioned", entityType: "issue", entityId: existing.id, locationId: existing.locationId, actorId: null, summary: `Status report: \u201c${item.title}\u201d` });
    }
    item.issueId = existing.id;
    return existing;
  }
  const id = nextId(db, "is");
  db.issues[id] = {
    id,
    orgId: db.organization.id,
    locationId: item.locationId,
    subjectKey: item.subjectKey,
    kind: item.kind,
    topic: item.topic,
    title: item.title,
    severity: item.severity,
    status: state === "fault" ? "open" : state === "handled" ? (item.kind === "customer" ? "resolved" : "monitoring") : item.kind === "inventory" ? "resolved" : "monitoring",
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
    itemIds: [item.id],
    ownerId: item.fields.ownerId ?? null,
    resolvedAt: null,
    resolvedById: null,
    resolutionNote: null,
    escalatedAt: null,
    escalatedToId: null,
  };
  item.issueId = id;
  audit(db, ctx, { action: "issue.opened", entityType: "issue", entityId: id, locationId: item.locationId, actorId: null, summary: `New issue: \u201c${item.title}\u201d` });
  return db.issues[id];
}

function materializeRecord(db: DemoDB, item: ExtractedItem, h: Handoff, issue: Issue, ctx: Ctx): void {
  if (item.kind === "maintenance" || item.kind === "incident") {
    const id = `inc-${item.id}`;
    db.incidents[id] = {
      id,
      locationId: item.locationId,
      issueId: issue.id,
      itemId: item.id,
      handoffId: h.id,
      category: item.kind === "maintenance" ? "maintenance" : item.subtype === "security" ? "security" : item.subtype === "safety" ? "safety" : "general",
      severity: item.severity,
      occurredAt: item.fields.occurredAt ?? null,
      handled: Boolean(item.fields.handled),
      laborMinutes: item.fields.laborMinutes ?? null,
      assertion: item.fields.assertion ?? "fault",
    };
  }
  if (item.kind === "inventory") {
    const f = item.fields;
    for (const flag of Object.values(db.inventoryFlags)) {
      if (flag.locationId === item.locationId && flag.itemKey === f.itemKey && !flag.clearedAt) flag.clearedAt = ctx.now;
    }
    const id = `inv-${item.id}`;
    db.inventoryFlags[id] = {
      id,
      locationId: item.locationId,
      itemId: item.id,
      handoffId: h.id,
      itemKey: f.itemKey ?? "unknown",
      label: f.itemLabel ?? item.title,
      onHand: f.qty ?? null,
      unit: f.unit ?? "unit",
      par: f.par ?? null,
      state: f.stockState ?? "low",
      transfer: f.transfer ?? null,
      raisedAt: itemTime(item, h),
      clearedAt: f.stockState === "ok" ? ctx.now : null,
    };
  }
}

/** One open task per issue: a repeat mention updates the open task instead of creating a duplicate. */
export function upsertTask(db: DemoDB, item: ExtractedItem, issue: Issue, ctx: Ctx): { task: Task; created: boolean } {
  const p = item.proposedTask!;
  const open = Object.values(db.tasks).find((t) => t.issueId === issue.id && t.status !== "done");
  if (open) {
    if (!open.itemIds.includes(item.id)) open.itemIds.push(item.id);
    if (p.dueAt && (!open.dueAt || toMs(p.dueAt) < toMs(open.dueAt))) {
      open.dueAt = p.dueAt;
      open.dueLabel = p.dueLabel;
    }
    if (p.ownerId && !open.ownerId) open.ownerId = p.ownerId;
    open.version += 1;
    open.updatedAt = ctx.now;
    open.updatedById = ctx.actorId;
    audit(db, ctx, { action: "task.merged", entityType: "task", entityId: open.id, locationId: open.locationId, actorId: null, summary: `Merged a repeat mention into “${open.title}” instead of creating a duplicate` });
    return { task: open, created: false };
  }
  const id = nextId(db, "tk");
  db.tasks[id] = {
    id,
    orgId: db.organization.id,
    locationId: item.locationId,
    issueId: issue.id,
    itemIds: [item.id],
    title: p.title,
    detail: p.detail,
    kind: p.kind,
    ownerId: p.ownerId,
    claimedById: null,
    claimedAt: null,
    status: "open",
    dueAt: p.dueAt,
    dueLabel: p.dueLabel,
    createdAt: ctx.now,
    createdBy: "extraction",
    ruleId: null,
    resolvedAt: null,
    resolvedById: null,
    resolutionNote: null,
    version: 1,
    updatedAt: ctx.now,
    updatedById: ctx.actorId,
  };
  audit(db, ctx, { action: "task.created", entityType: "task", entityId: id, locationId: item.locationId, actorId: null, summary: `Created task “${p.title}”${p.ownerId ? ` for ${userName(db, p.ownerId)}` : ""}` });
  return { task: db.tasks[id], created: true };
}

function upsertOrderPrep(db: DemoDB, locationId: ID, items: ExtractedItem[], openDate: string, ctx: Ctx): Task {
  const lines = (list: ExtractedItem[]) =>
    list.map((i) => {
      const f = i.fields;
      const qty = f.qty != null && f.par != null ? `${f.qty} of ${f.par} ${f.unit}s` : f.stockState === "order" ? "reorder" : `${f.stockState}`;
      const t = f.transfer?.direction === "out" ? ` (lent to ${db.locations[f.transfer.locationId]?.name})` : "";
      return `${f.itemLabel}: ${qty}${t}`;
    });
  const existing = Object.values(db.tasks).find((t) => t.locationId === locationId && t.kind === "order_prep" && t.status !== "done");
  const ruleId = items[0].ruleEffects.tasks.find((t) => t.template === "order_prep")?.ruleId ?? null;
  if (existing) {
    const fresh = items.filter((i) => !existing.itemIds.includes(i.id));
    const keys = new Set(existing.itemIds.map((id) => db.items[id]?.fields.itemKey));
    existing.itemIds.push(...fresh.map((i) => i.id));
    const labels = Array.from(new Set(existing.itemIds.map((id) => db.items[id]?.fields.itemLabel).filter(Boolean)));
    existing.title = `Prep order: ${labels.join(", ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}`;
    existing.detail = [existing.detail, ...lines(fresh.filter((i) => !keys.has(i.fields.itemKey)))].filter(Boolean).join(" · ");
    existing.version += 1;
    existing.updatedAt = ctx.now;
    audit(db, ctx, { action: "task.merged", entityType: "task", entityId: existing.id, locationId, actorId: null, summary: `Added ${fresh.length} item(s) to the open order-prep task instead of creating another` });
    return existing;
  }
  const id = nextId(db, "tk");
  const labels = Array.from(new Set(items.map((i) => i.fields.itemLabel)));
  db.tasks[id] = {
    id,
    orgId: db.organization.id,
    locationId,
    issueId: null,
    itemIds: items.map((i) => i.id),
    title: `Prep order: ${labels.join(", ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}`,
    detail: lines(items).join(" · "),
    kind: "order_prep",
    ownerId: null,
    claimedById: null,
    claimedAt: null,
    status: "open",
    dueAt: at(openDate, db.locations[locationId].doorsOpen),
    dueLabel: "before opening",
    createdAt: ctx.now,
    createdBy: "rule",
    ruleId,
    resolvedAt: null,
    resolvedById: null,
    resolutionNote: null,
    version: 1,
    updatedAt: ctx.now,
    updatedById: null,
  };
  audit(db, ctx, { action: "task.created", entityType: "task", entityId: id, locationId, actorId: null, summary: `Rule “${ruleId ? db.rules[ruleId]?.name : "Below par"}” created “${db.tasks[id].title}”` });
  return db.tasks[id];
}

// ───────────────────────────────── briefing actions

function guardVersion(db: DemoDB, taskId: ID, expectedVersion: number | undefined): Task {
  const task = db.tasks[taskId];
  if (!task) throw new CommandError("That task no longer exists.");
  if (expectedVersion !== undefined && task.version !== expectedVersion) {
    throw new ConflictError({
      taskId,
      taskTitle: task.title,
      byUserId: task.updatedById,
      at: task.updatedAt,
      theirChange:
        task.status === "done"
          ? `resolved it${task.resolutionNote ? `: “${task.resolutionNote}”` : ""}`
          : task.claimedById
            ? `claimed it`
            : "changed it",
    });
  }
  return task;
}

function bump(task: Task, ctx: Ctx) {
  task.version += 1;
  task.updatedAt = ctx.now;
  task.updatedById = ctx.actorId;
}

function ensureAck(db: DemoDB, entityType: "briefing" | "task" | "issue", entityId: ID, ctx: Ctx): ID | null {
  if (!ctx.actorId) return null;
  const exists = Object.values(db.acknowledgments).find((a) => a.entityType === entityType && a.entityId === entityId && a.userId === ctx.actorId);
  if (exists) return null;
  const id = nextId(db, "ak");
  db.acknowledgments[id] = { id, entityType, entityId, userId: ctx.actorId, at: ctx.now };
  return id;
}

export const acknowledge: Command<{ entityType: "briefing" | "task" | "issue"; entityId: ID }> = (db, input, ctx) => {
  const id = ensureAck(db, input.entityType, input.entityId, ctx);
  const locationId =
    input.entityType === "briefing" ? db.briefings[input.entityId]?.locationId : input.entityType === "task" ? db.tasks[input.entityId]?.locationId : db.issues[input.entityId]?.locationId;
  const label =
    input.entityType === "briefing"
      ? `the ${db.locations[locationId ?? ""]?.name ?? ""} opening brief`
      : input.entityType === "task"
        ? `“${db.tasks[input.entityId]?.title}”`
        : `“${db.issues[input.entityId]?.title}”`;
  audit(db, ctx, { action: `${input.entityType}.acknowledged`, entityType: input.entityType, entityId: input.entityId, locationId: locationId ?? null, summary: `Acknowledged ${label}` });
  return { touched: id ? [{ table: "acknowledgments", id }] : [], message: "Acknowledged" };
};

export const claimTask: Command<{ taskId: ID; expectedVersion?: number }> = (db, { taskId, expectedVersion }, ctx) => {
  const task = guardVersion(db, taskId, expectedVersion);
  if (task.status === "done") throw new CommandError("This task is already resolved.");
  task.claimedById = ctx.actorId;
  task.claimedAt = ctx.now;
  task.ownerId = ctx.actorId;
  task.status = "claimed";
  bump(task, ctx);
  const ack = ensureAck(db, "task", taskId, ctx);
  audit(db, ctx, { action: "task.claimed", entityType: "task", entityId: taskId, locationId: task.locationId, summary: `Claimed “${task.title}”` });
  return { touched: [{ table: "tasks", id: taskId }, ...(ack ? [{ table: "acknowledgments" as const, id: ack }] : [])], message: "Claimed" };
};

export const unclaimTask: Command<{ taskId: ID; expectedVersion?: number }> = (db, { taskId, expectedVersion }, ctx) => {
  const task = guardVersion(db, taskId, expectedVersion);
  task.claimedById = null;
  task.claimedAt = null;
  task.status = "open";
  bump(task, ctx);
  audit(db, ctx, { action: "task.released", entityType: "task", entityId: taskId, locationId: task.locationId, summary: `Released “${task.title}”` });
  return { touched: [{ table: "tasks", id: taskId }], message: "Released" };
};

export const resolveTask: Command<{ taskId: ID; expectedVersion?: number; note?: string; issueOutcome?: "resolved" | "monitoring" | "keep" }> = (db, input, ctx) => {
  const task = guardVersion(db, input.taskId, input.expectedVersion);
  task.status = "done";
  task.resolvedAt = ctx.now;
  task.resolvedById = ctx.actorId;
  task.resolutionNote = input.note?.trim() || null;
  if (!task.claimedById) {
    task.claimedById = ctx.actorId;
    task.claimedAt = ctx.now;
  }
  bump(task, ctx);
  const touched: Touched[] = [{ table: "tasks", id: task.id }];
  if (task.kind === "order_prep") {
    // Placing the order closes the stock threads it covered.
    for (const itemId of task.itemIds) {
      const issueId = db.items[itemId]?.issueId;
      const issue = issueId ? db.issues[issueId] : null;
      if (issue && issue.status === "open") {
        issue.status = "resolved";
        issue.resolvedAt = ctx.now;
        issue.resolvedById = ctx.actorId;
        issue.resolutionNote = task.resolutionNote ?? "Ordered";
        touched.push({ table: "issues", id: issue.id });
      }
    }
  }
  if (task.issueId && input.issueOutcome && input.issueOutcome !== "keep") {
    const issue = db.issues[task.issueId];
    issue.status = input.issueOutcome;
    if (input.issueOutcome === "resolved") {
      issue.resolvedAt = ctx.now;
      issue.resolvedById = ctx.actorId;
      issue.resolutionNote = task.resolutionNote;
    }
    touched.push({ table: "issues", id: issue.id });
  }
  audit(db, ctx, { action: "task.resolved", entityType: "task", entityId: task.id, locationId: task.locationId, summary: `Resolved “${task.title}”`, detail: task.resolutionNote ?? undefined });
  return { touched, message: "Resolved" };
};

export const reopenTask: Command<{ taskId: ID; expectedVersion?: number }> = (db, { taskId, expectedVersion }, ctx) => {
  const task = guardVersion(db, taskId, expectedVersion);
  task.status = task.claimedById ? "claimed" : "open";
  task.resolvedAt = null;
  task.resolvedById = null;
  bump(task, ctx);
  audit(db, ctx, { action: "task.reopened", entityType: "task", entityId: taskId, locationId: task.locationId, summary: `Reopened “${task.title}”` });
  return { touched: [{ table: "tasks", id: taskId }] };
};

export const escalate: Command<{ issueId: ID; taskId?: ID; toUserId: ID; channel: Channel; note: string }> = (db, input, ctx) => {
  const issue = db.issues[input.issueId];
  issue.escalatedAt = ctx.now;
  issue.escalatedToId = input.toUserId;
  if (issue.severity !== "critical" && issue.severity !== "high") issue.severity = "high";
  const to = db.users[input.toUserId];
  notify(db, ctx, {
    userId: input.toUserId,
    title: `Escalated: ${issue.title}`,
    body: `${userName(db, ctx.actorId)} at ${db.locations[issue.locationId].name}: ${input.note || "Needs your call."}`,
    href: `/issues/${issue.id}`,
    severity: issue.severity,
    channel: input.channel,
  });
  const cid = nextId(db, "cm");
  db.comments[cid] = { id: cid, entityType: "issue", entityId: issue.id, authorId: ctx.actorId ?? "", toUserId: input.toUserId, kind: "note", body: `Escalated to ${to?.name}${input.note ? `: ${input.note}` : ""}`, at: ctx.now };
  audit(db, ctx, { action: "issue.escalated", entityType: "issue", entityId: issue.id, locationId: issue.locationId, summary: `Escalated “${issue.title}” to ${to?.name} by ${input.channel === "sms" ? "text" : input.channel.replace("_", " ")}`, detail: input.note || undefined });
  return { touched: [{ table: "issues", id: issue.id }, { table: "comments", id: cid }], message: `Escalated to ${to?.firstName ?? "area manager"}` };
};

export const askPreviousShift: Command<{ entityType: "task" | "issue"; entityId: ID; body: string }> = (db, input, ctx) => {
  const issueId = input.entityType === "issue" ? input.entityId : db.tasks[input.entityId]?.issueId;
  const issue = issueId ? db.issues[issueId] : null;
  const lastItem = issue ? db.items[issue.itemIds[issue.itemIds.length - 1]] : null;
  const author = lastItem ? db.handoffs[lastItem.handoffId]?.authorId : null;
  const id = nextId(db, "cm");
  db.comments[id] = { id, entityType: input.entityType, entityId: input.entityId, authorId: ctx.actorId ?? "", toUserId: author ?? null, kind: "question", body: input.body.trim(), at: ctx.now };
  if (author) {
    notify(db, ctx, {
      userId: author,
      title: `${userName(db, ctx.actorId)} asked about last night`,
      body: input.body.trim(),
      href: issue ? `/issues/${issue.id}` : "/briefing",
      severity: "normal",
      channel: "push",
    });
  }
  audit(db, ctx, { action: "comment.asked", entityType: input.entityType, entityId: input.entityId, locationId: issue?.locationId ?? null, summary: `Asked ${userName(db, author)}: “${input.body.trim()}”` });
  return { touched: [{ table: "comments", id }], message: `Sent to ${db.users[author ?? ""]?.firstName ?? "the previous shift"}`, data: { toUserId: author } };
};

export const addComment: Command<{ entityType: "task" | "issue" | "item"; entityId: ID; body: string; kind: "reply" | "note"; toUserId?: ID | null; authorId?: ID }> = (db, input, ctx) => {
  const id = nextId(db, "cm");
  const authorId = input.authorId ?? ctx.actorId ?? "";
  db.comments[id] = { id, entityType: input.entityType, entityId: input.entityId, authorId, toUserId: input.toUserId ?? null, kind: input.kind, body: input.body.trim(), at: ctx.now };
  if (input.toUserId) {
    notify(db, ctx, { userId: input.toUserId, title: `${userName(db, authorId)} replied`, body: input.body.trim(), href: input.entityType === "issue" ? `/issues/${input.entityId}` : "/briefing", severity: "normal", channel: "push" });
  }
  audit(db, { ...ctx, actorId: authorId }, { action: input.kind === "reply" ? "comment.replied" : "comment.added", entityType: input.entityType, entityId: input.entityId, locationId: null, summary: `${input.kind === "reply" ? "Replied" : "Noted"}: “${input.body.trim()}”` });
  return { touched: [{ table: "comments", id }] };
};

export const resolveIssue: Command<{ issueId: ID; outcome: "resolved" | "false_alarm" | "monitoring" | "open"; note?: string }> = (db, input, ctx) => {
  const issue = db.issues[input.issueId];
  issue.status = input.outcome;
  if (input.outcome === "resolved" || input.outcome === "false_alarm") {
    issue.resolvedAt = ctx.now;
    issue.resolvedById = ctx.actorId;
    issue.resolutionNote = input.note?.trim() || null;
  } else {
    issue.resolvedAt = null;
    issue.resolvedById = null;
  }
  const label = { resolved: "Resolved", false_alarm: "Marked as a false alarm", monitoring: "Set to monitoring", open: "Reopened" }[input.outcome];
  audit(db, ctx, { action: `issue.${input.outcome}`, entityType: "issue", entityId: issue.id, locationId: issue.locationId, summary: `${label}: “${issue.title}”`, detail: input.note });
  return { touched: [{ table: "issues", id: issue.id }], message: label };
};

export const markFalseAlarm: Command<{ itemId: ID; note: string; undo?: boolean }> = (db, input, ctx) => {
  const item = db.items[input.itemId];
  item.fields.falseAlarm = input.undo ? null : { byId: ctx.actorId ?? "", at: ctx.now, note: input.note.trim() };
  audit(db, ctx, {
    action: input.undo ? "item.false_alarm_cleared" : "item.false_alarm",
    entityType: "item",
    entityId: item.id,
    locationId: item.locationId,
    summary: input.undo ? `Cleared the false-alarm mark on “${item.title}”` : `Marked “${item.title}” as a false alarm`,
    detail: input.note || undefined,
  });
  return { touched: [{ table: "items", id: item.id }], message: input.undo ? "Counted again" : "Marked as false alarm" };
};

/** Demo: a teammate edits the same task from another phone. */
export const remoteEdit: Command<{ taskId: ID; userId: ID }> = (db, { taskId, userId }, ctx) => {
  const task = db.tasks[taskId];
  task.claimedById = userId;
  task.claimedAt = ctx.now;
  task.ownerId = userId;
  task.status = "claimed";
  task.version += 1;
  task.updatedAt = ctx.now;
  task.updatedById = userId;
  audit(db, { ...ctx, actorId: userId }, { action: "task.claimed", entityType: "task", entityId: taskId, locationId: task.locationId, summary: `Claimed “${task.title}” (from another device)` });
  return { touched: [{ table: "tasks", id: taskId }] };
};

/** Fire time-based rules ("refund still open at 9 AM → escalate"). Idempotent. */
export const runTimedRules: Command<Record<string, never>> = (db, _input, ctx) => {
  const timers = evaluateOpenAt(Object.values(db.rules), Object.values(db.tasks), db.issues, db.items, ctx.now);
  const touched: Touched[] = [];
  for (const t of timers) {
    const key = `${t.ruleId}:${t.taskId}`;
    if (!t.fired || db.demo.firedTimers.includes(key)) continue;
    db.demo.firedTimers.push(key);
    const task = db.tasks[t.taskId];
    const rule = db.rules[t.ruleId];
    for (const u of usersWithRole(db, t.role, task.locationId)) {
      notify(db, ctx, { userId: u.id, title: `Still open at ${fmtTime(t.dueAt)}: ${task.title}`, body: `${summarizeRule(rule)} ${db.locations[task.locationId].name}.`, href: task.issueId ? `/issues/${task.issueId}` : "/briefing", severity: "high", channel: "sms" });
    }
    if (task.issueId) {
      const issue = db.issues[task.issueId];
      issue.escalatedAt = ctx.now;
      issue.escalatedToId = usersWithRole(db, t.role, task.locationId)[0]?.id ?? null;
      touched.push({ table: "issues", id: issue.id });
    }
    audit(db, ctx, { action: "rule.escalated", entityType: "task", entityId: task.id, locationId: task.locationId, actorId: null, summary: `Rule “${rule.name}” escalated “${task.title}” (still open at ${fmtTime(t.dueAt)})` });
  }
  return { touched };
};

// ───────────────────────────────── configuration

export const saveRule: Command<{ rule: Omit<EscalationRule, "orgId" | "createdById" | "updatedAt"> & { id?: ID } }> = (db, { rule }, ctx) => {
  const id = rule.id ?? nextId(db, "rl");
  const existed = Boolean(db.rules[id]);
  db.rules[id] = { ...rule, id, orgId: db.organization.id, createdById: db.rules[id]?.createdById ?? ctx.actorId ?? "", updatedAt: ctx.now };
  audit(db, ctx, { action: existed ? "rule.updated" : "rule.created", entityType: "rule", entityId: id, locationId: null, summary: `${existed ? "Updated" : "Created"} rule “${rule.name}”`, detail: summarizeRule(db.rules[id]) });
  return { touched: [{ table: "rules", id }], message: existed ? "Rule saved" : "Rule created", data: { ruleId: id } };
};

export const toggleRule: Command<{ ruleId: ID }> = (db, { ruleId }, ctx) => {
  const r = db.rules[ruleId];
  r.enabled = !r.enabled;
  r.updatedAt = ctx.now;
  audit(db, ctx, { action: r.enabled ? "rule.enabled" : "rule.disabled", entityType: "rule", entityId: ruleId, locationId: null, summary: `${r.enabled ? "Turned on" : "Turned off"} rule “${r.name}”` });
  return { touched: [{ table: "rules", id: ruleId }], message: r.enabled ? "Rule on" : "Rule off" };
};

export const deleteRule: Command<{ ruleId: ID }> = (db, { ruleId }, ctx) => {
  const r = db.rules[ruleId];
  delete db.rules[ruleId];
  audit(db, ctx, { action: "rule.deleted", entityType: "rule", entityId: ruleId, locationId: null, summary: `Deleted rule “${r?.name}”` });
  return { touched: [{ table: "rules", id: ruleId }], message: "Rule deleted" };
};

export const updateLocation: Command<{ locationId: ID; patch: Partial<Pick<Location, "name" | "address" | "doorsOpen" | "lunchRush">> }> = (db, { locationId, patch }, ctx) => {
  Object.assign(db.locations[locationId], patch);
  audit(db, ctx, { action: "location.updated", entityType: "location", entityId: locationId, locationId, summary: `Updated ${db.locations[locationId].name} details` });
  return { touched: [{ table: "locations", id: locationId }], message: "Saved" };
};

export const updateShiftTemplate: Command<{ templateId: ID; patch: Partial<Pick<ShiftTemplate, "start" | "end" | "handoffAt" | "name">> }> = (db, { templateId, patch }, ctx) => {
  Object.assign(db.shiftTemplates[templateId], patch);
  const t = db.shiftTemplates[templateId];
  audit(db, ctx, { action: "shift.updated", entityType: "shift_template", entityId: templateId, locationId: t.locationId, summary: `Updated ${db.locations[t.locationId].name} ${t.name} shift (${t.start}–${t.end}, handoff ${t.handoffAt})` });
  return { touched: [{ table: "shiftTemplates", id: templateId }], message: "Shift saved" };
};

export const setQuestions: Command<{ questions: { id?: ID; prompt: string; hint: string }[] }> = (db, { questions }, ctx) => {
  const touched: Touched[] = [];
  for (const q of Object.values(db.questions)) {
    if (q.active) {
      q.active = false;
      touched.push({ table: "questions", id: q.id });
    }
  }
  questions.forEach((q, i) => {
    const existing = q.id ? db.questions[q.id] : Object.values(db.questions).find((x) => x.prompt === q.prompt);
    if (existing) {
      existing.active = true;
      existing.order = i;
      existing.prompt = q.prompt;
      existing.hint = q.hint;
      touched.push({ table: "questions", id: existing.id });
    } else {
      const id = nextId(db, "q");
      db.questions[id] = { id, orgId: db.organization.id, prompt: q.prompt, hint: q.hint, order: i, active: true, library: false };
      touched.push({ table: "questions", id });
    }
  });
  audit(db, ctx, { action: "questions.updated", entityType: "questions", entityId: "closeout", locationId: null, summary: `Set the ${questions.length} closeout questions`, detail: questions.map((q, i) => `${i + 1}. ${q.prompt}`).join(" ") });
  return { touched, message: "Questions saved" };
};

export const updateNotificationPrefs: Command<{ userId: ID; prefs: NotificationPrefs }> = (db, { userId, prefs }, ctx) => {
  db.users[userId].notifications = prefs;
  audit(db, ctx, { action: "user.notifications", entityType: "user", entityId: userId, locationId: null, summary: `Updated notification preferences for ${db.users[userId].name}` });
  return { touched: [{ table: "users", id: userId }], message: "Preferences saved" };
};

export const inviteUser: Command<{ name: string; role: Role; locationIds: ID[]; contact: string }> = (db, input, ctx) => {
  const id = nextId(db, "u");
  const first = input.name.trim().split(/\s+/)[0];
  db.users[id] = {
    id,
    orgId: db.organization.id,
    name: input.name.trim(),
    firstName: first,
    initials: input.name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
    role: input.role,
    title: input.role.replace("_", " ").replace(/^./, (c) => c.toUpperCase()),
    locationIds: input.locationIds,
    appUser: true,
    invitedAt: ctx.now,
    inviteStatus: "invited",
    notifications: { briefingReady: ["push"], critical: ["sms"], mentions: ["push"], quietHours: null },
  };
  audit(db, ctx, { action: "user.invited", entityType: "user", entityId: id, locationId: input.locationIds[0] ?? null, summary: `Invited ${input.name.trim()} as ${input.role.replace("_", " ")}`, detail: `Invite sent to ${input.contact} (simulated)` });
  return { touched: [{ table: "users", id }], message: `Invite sent to ${first}` };
};

export const updateSettings: Command<{ settings: OrgSettings }> = (db, { settings }, ctx) => {
  const before = db.settings;
  db.settings = settings;
  audit(db, ctx, { action: "settings.updated", entityType: "settings", entityId: "org", locationId: null, summary: `Updated retention and thresholds (audio ${before.retention.audioDays}→${settings.retention.audioDays} days)` });
  return { touched: [] , message: "Settings saved" };
};

export const deleteRecording: Command<{ handoffId: ID }> = (db, { handoffId }, ctx) => {
  const h = db.handoffs[handoffId];
  h.audio.hasRecording = false;
  h.audio.deletedAt = ctx.now;
  h.audio.deletedById = ctx.actorId;
  audit(db, ctx, { action: "recording.deleted", entityType: "handoff", entityId: handoffId, locationId: h.locationId, summary: `Deleted the audio recording for the ${fmtTime(h.createdAt)} ${db.locations[h.locationId].name} closeout`, detail: "Transcript and evidence links kept" });
  return { touched: [{ table: "handoffs", id: handoffId }], message: "Recording deleted" };
};

export const setConnector: Command<{ connectorId: ID; status: "connected" | "available" }> = (db, input, ctx) => {
  const c = db.connectors[input.connectorId];
  c.status = input.status;
  audit(db, ctx, { action: input.status === "connected" ? "connector.connected" : "connector.disconnected", entityType: "connector", entityId: c.id, locationId: null, summary: `${input.status === "connected" ? "Connected" : "Disconnected"} ${c.name} (simulated)` });
  return { touched: [{ table: "connectors", id: c.id }], message: input.status === "connected" ? `${c.name} connected` : `${c.name} disconnected` };
};

export const sendTestDelivery: Command<{ connectorId: ID; summary: string }> = (db, input, ctx) => {
  const c = db.connectors[input.connectorId];
  const id = nextId(db, "dl");
  c.deliveries.unshift({ id, at: ctx.now, summary: input.summary, ok: true });
  audit(db, ctx, { action: "connector.test", entityType: "connector", entityId: c.id, locationId: null, summary: `Sent a test briefing to ${c.name} (simulated)` });
  return { touched: [{ table: "connectors", id: c.id }], message: `Test sent to ${c.target}` };
};

// ───────────────────────────────── setup & demo

export const saveSetupStep: Command<{ step: number }> = (db, { step }, ctx) => {
  db.setup.step = Math.max(db.setup.step, step);
  db.setup.startedAt = db.setup.startedAt ?? ctx.now;
  return { touched: [] };
};

export const completeSetup: Command<{ skipped: boolean }> = (db, { skipped }, ctx) => {
  db.setup.completedAt = ctx.now;
  db.setup.skipped = skipped;
  db.setup.step = 4;
  audit(db, ctx, { action: skipped ? "setup.skipped" : "setup.completed", entityType: "organization", entityId: db.organization.id, locationId: null, summary: skipped ? "Skipped setup and kept Nightjar defaults" : `Finished setting up ${db.organization.name}` });
  return { touched: [], message: skipped ? "Using Nightjar defaults" : "Setup complete" };
};

export const restartOnboarding: Command<Record<string, never>> = (db, _i, ctx) => {
  db.setup = { step: 0, completedAt: null, skipped: false, startedAt: null };
  audit(db, ctx, { action: "setup.restarted", entityType: "organization", entityId: db.organization.id, locationId: null, summary: "Restarted onboarding" });
  return { touched: [] };
};

export const updateOrganization: Command<{ name: string; industry: string }> = (db, input, ctx) => {
  db.organization.name = input.name.trim();
  db.organization.industry = input.industry;
  audit(db, ctx, { action: "organization.updated", entityType: "organization", entityId: db.organization.id, locationId: null, summary: `Company set to ${input.name.trim()}` });
  return { touched: [] };
};

export const markGuide: Command<{ step: GuideStep }> = (db, { step }, ctx) => {
  if (!db.demo.guide[step]) db.demo.guide[step] = ctx.now;
  return { touched: [] };
};

export const markNotificationsRead: Command<{ userId: ID }> = (db, { userId }, ctx) => {
  for (const n of Object.values(db.notifications)) if (n.userId === userId && !n.readAt) n.readAt = ctx.now;
  return { touched: [] };
};

export const flushQueuedHandoffs: Command<Record<string, never>> = (db, _i, ctx) => {
  const touched: Touched[] = [];
  for (const h of Object.values(db.handoffs)) {
    if (h.status === "queued") {
      h.status = "processing";
      audit(db, ctx, { action: "handoff.synced", entityType: "handoff", entityId: h.id, locationId: h.locationId, summary: "Synced a closeout that was captured offline" });
      touched.push({ table: "handoffs", id: h.id });
    }
  }
  db.demo.outbox = [];
  return { touched, data: { ids: touched.map((t) => t.id) } };
};

export const setDemo: Command<Partial<Pick<DemoDB["demo"], "currentUserId" | "currentLocationId" | "network" | "simulateConflictNext" | "failNextExtraction" | "clockFrozen">>> = (db, patch) => {
  Object.assign(db.demo, patch);
  return { touched: [] };
};

export const setClock: Command<{ iso: ISO; nowMs: number }> = (db, { iso, nowMs }) => {
  db.demo.clockAnchor = iso;
  db.demo.clockSetAtMs = nowMs;
  return { touched: [] };
};

// ───────────────────────────────── runner

export function runCommand<I>(db: DemoDB, cmd: Command<I>, input: I, ctx: Ctx): { db: DemoDB; result: CommandResult } {
  const draft = structuredClone(db);
  const result = cmd(draft, input, ctx);
  return { db: draft, result };
}

/** Undo by restoring the touched records from the previous snapshot. Audit stays append-only. */
export function undoTouched(current: DemoDB, previous: DemoDB, touched: Touched[], ctx: Ctx, label: string): DemoDB {
  const draft = structuredClone(current);
  for (const t of touched) {
    const table = draft[t.table] as Record<ID, unknown>;
    const prevTable = previous[t.table] as Record<ID, unknown>;
    if (prevTable[t.id] === undefined) delete table[t.id];
    else {
      const restored = structuredClone(prevTable[t.id]) as Record<string, unknown>;
      if (t.table === "tasks") restored.version = ((table[t.id] as Task | undefined)?.version ?? 0) + 1;
      table[t.id] = restored;
    }
  }
  audit(draft, ctx, { action: "undo", entityType: touched[0]?.table ?? "record", entityId: touched[0]?.id ?? "", locationId: null, summary: `Undid: ${label}` });
  return draft;
}
