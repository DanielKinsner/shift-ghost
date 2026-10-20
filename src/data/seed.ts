/**
 * Seed data for the Nightjar Kitchens demo.
 *
 * The base entities (company, stores, people, rules) are declared directly.
 * The nine nights of history are *replayed* through the same commands the app
 * uses — capture → extraction → review → publish → next-morning follow-up — so
 * every seeded issue, task, mention and audit event is something the real
 * engine produced. `buildSeed()` is deterministic: same input, same IDs.
 */
import type {
  Channel,
  CloseoutQuestion,
  Connector,
  DemoDB,
  EscalationRule,
  ID,
  Location,
  NotificationPrefs,
  ShiftTemplate,
  User,
} from "@/domain/types";
import {
  acknowledge,
  addComment,
  askPreviousShift,
  claimTask,
  confirmItem,
  createHandoff,
  correctItem,
  ensureShiftInstance,
  processHandoff,
  publishHandoff,
  resolveIssue,
  resolveTask,
  type Command,
  type Ctx,
} from "@/domain/commands";
import { addDays, addMinutes, at } from "@/domain/time";
import { SEED_TRANSCRIPTS } from "./transcripts";

export const SCHEMA_VERSION = 7;
export const DEMO_ANCHOR = "2026-10-20T22:40:00Z";
export const MORNING_ANCHOR = "2026-10-21T06:15:00Z";
export const SEED_DATES = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"];

const ORG = "org-nightjar";

const prefs = (briefing: Channel[], critical: Channel[], quiet: NotificationPrefs["quietHours"] = null): NotificationPrefs => ({
  briefingReady: briefing,
  critical,
  mentions: ["push"],
  quietHours: quiet,
});

function user(
  id: ID,
  name: string,
  role: User["role"],
  title: string,
  locationIds: ID[],
  appUser = true,
  notifications: NotificationPrefs = prefs(["push"], ["sms", "push"]),
): User {
  const parts = name.split(" ");
  return {
    id,
    orgId: ORG,
    name,
    firstName: parts[0],
    initials: parts.map((p) => p[0]).join("").slice(0, 2).toUpperCase(),
    role,
    title,
    locationIds,
    appUser,
    inviteStatus: appUser ? "active" : undefined,
    notifications,
  };
}

const PARS = (overrides: Partial<Record<string, number>> = {}): Location["pars"] => {
  const base: Record<string, [number, string]> = {
    avocado: [4, "case"],
    "cups-large": [6, "sleeve"],
    lids: [6, "sleeve"],
    chicken: [6, "case"],
    tortillas: [4, "case"],
    limes: [2, "case"],
    cilantro: [2, "case"],
    rice: [4, "bag"],
    "to-go-bags": [3, "case"],
    napkins: [3, "case"],
    queso: [6, "bag"],
    "sour-cream": [3, "case"],
    "fryer-oil": [4, "jug"],
  };
  return Object.fromEntries(
    Object.entries(base).map(([k, [qty, unit]]) => [k, { qty: overrides[k] ?? qty, unit }]),
  );
};

function baseDB(): DemoDB {
  const locations: Location[] = [
    { id: "loc-dtn", orgId: ORG, name: "Downtown", code: "DTN", address: "211 Mercer Ave, Ridgeport", doorsOpen: "10:30", lunchRush: "11:30", pars: PARS() },
    { id: "loc-ngt", orgId: ORG, name: "Northgate", code: "NGT", address: "4400 Northgate Blvd, Ridgeport", doorsOpen: "10:30", lunchRush: "11:30", pars: PARS({ "cups-large": 5 }) },
    { id: "loc-cyp", orgId: ORG, name: "Canyon Plaza", code: "CYP", address: "89 Canyon Plaza Dr, Ridgeport", doorsOpen: "11:00", lunchRush: "11:45", pars: PARS({ avocado: 3 }) },
  ];
  const users: User[] = [
    user("u-maya", "Maya Chen", "closing_manager", "Closing manager", ["loc-dtn"], true, prefs(["push"], ["sms", "push"], { start: "00:30", end: "09:00" })),
    user("u-luis", "Luis Ortega", "opening_manager", "Opening manager", ["loc-dtn"], true, prefs(["push", "sms"], ["sms", "push"], { start: "21:00", end: "05:30" })),
    user("u-bri", "Bri Ellis", "kitchen_lead", "Kitchen lead", ["loc-dtn"], true, prefs(["push"], ["push"])),
    user("u-jordan", "Jordan Cole", "area_manager", "Area manager", ["loc-dtn", "loc-ngt", "loc-cyp"], true, prefs(["email"], ["sms", "push"])),
    user("u-dev", "Dev Patel", "closing_manager", "Closing manager", ["loc-ngt"]),
    user("u-sam", "Sam Okafor", "opening_manager", "Opening manager", ["loc-ngt"]),
    user("u-renee", "Renée Alvarez", "closing_manager", "Closing manager", ["loc-cyp"]),
    user("u-kofi", "Kofi Mensah", "opening_manager", "Opening manager", ["loc-cyp"]),
    user("c-tasha", "Tasha Reed", "crew", "Dishwasher", ["loc-dtn"], false),
    user("c-marco", "Marco Diaz", "crew", "Line cook", ["loc-dtn"], false),
    user("c-priya", "Priya Nair", "crew", "Cashier", ["loc-ngt"], false),
    user("c-jess", "Jess Kowalski", "crew", "Line cook", ["loc-ngt"], false),
    user("c-eli", "Eli Brooks", "crew", "Prep cook", ["loc-cyp"], false),
  ];
  const templates: ShiftTemplate[] = locations.flatMap((l) => [
    { id: `st-${l.code.toLowerCase()}-open`, locationId: l.id, name: "Open", kind: "open" as const, start: "06:00", end: "14:30", handoffAt: "06:00" },
    { id: `st-${l.code.toLowerCase()}-close`, locationId: l.id, name: "Close", kind: "close" as const, start: "14:30", end: "23:00", handoffAt: "22:45" },
  ]);
  const questions: CloseoutQuestion[] = [
    { id: "q-broke", orgId: ORG, prompt: "What broke, failed, or behaved unusually?", hint: "Equipment, doors, alarms, anything that acted up.", order: 0, active: true },
    { id: "q-low", orgId: ORG, prompt: "What ran low or needs to be ordered?", hint: "Counts help: “one case left”.", order: 1, active: true },
    { id: "q-customer", orgId: ORG, prompt: "Which customer issue is still open?", hint: "Refunds, call-backs, catering promises.", order: 2, active: true },
    { id: "q-rush", orgId: ORG, prompt: "What must happen before the next rush?", hint: "Prep, training, set-up the morning can't skip.", order: 3, active: true },
    { id: "q-angry", orgId: ORG, prompt: "Is there anything the next manager will be angry not to know?", hint: "The thing you'd text them about at midnight.", order: 4, active: true },
    { id: "q-lib-waste", orgId: ORG, prompt: "What did we throw away tonight, and why?", hint: "Waste and spoilage.", order: 10, active: false, library: true },
    { id: "q-lib-safety", orgId: ORG, prompt: "Did anyone get hurt or nearly get hurt?", hint: "Cuts, burns, slips, near misses.", order: 11, active: false, library: true },
    { id: "q-lib-staff", orgId: ORG, prompt: "Who needs coverage or a follow-up tomorrow?", hint: "Call-outs, late arrivals, coaching.", order: 12, active: false, library: true },
    { id: "q-lib-deliveries", orgId: ORG, prompt: "Which deliveries were short, late, or wrong?", hint: "Vendor and invoice problems.", order: 13, active: false, library: true },
    { id: "q-lib-guest", orgId: ORG, prompt: "What did guests praise or complain about?", hint: "Patterns the owner should hear.", order: 14, active: false, library: true },
  ];
  const t0 = "2026-10-01T09:00:00Z";
  const rules: EscalationRule[] = [
    { id: "rl-refrigeration", orgId: ORG, name: "Refrigeration is critical", enabled: true, condition: { type: "mentions", topic: "refrigeration" }, actions: [{ type: "set_severity", severity: "critical" }, { type: "notify", role: "area_manager", channel: "sms" }], locationIds: "all", createdById: "u-jordan", updatedAt: t0 },
    { id: "rl-below-par", orgId: ORG, name: "Below par becomes order prep", enabled: true, condition: { type: "below_par", itemKey: "any" }, actions: [{ type: "create_task", template: "order_prep" }], locationIds: "all", createdById: "u-jordan", updatedAt: t0 },
    { id: "rl-refund-9am", orgId: ORG, name: "Open refunds escalate at 9 AM", enabled: true, condition: { type: "open_at", subject: "refund", time: "09:00" }, actions: [{ type: "escalate", role: "area_manager" }], locationIds: "all", createdById: "u-jordan", updatedAt: t0 },
    { id: "rl-injury", orgId: ORG, name: "Injuries go to the area manager", enabled: true, condition: { type: "mentions", topic: "safety" }, actions: [{ type: "set_severity", severity: "critical" }, { type: "notify", role: "area_manager", channel: "sms" }], locationIds: "all", createdById: "u-jordan", updatedAt: t0 },
    { id: "rl-cooking", orgId: ORG, name: "Cooking equipment pings the kitchen lead", enabled: false, condition: { type: "mentions", topic: "cooking" }, actions: [{ type: "notify", role: "kitchen_lead", channel: "push" }], locationIds: ["loc-dtn"], createdById: "u-jordan", updatedAt: t0 },
  ];
  const connectors: Connector[] = [
    { id: "cx-chat", kind: "team_chat", name: "Team chat", description: "Post each opening brief and every critical item to a store channel.", status: "connected", target: "#downtown-ops", deliveries: [] },
    { id: "cx-schedule", kind: "scheduling", name: "Scheduling", description: "Read who is opening tomorrow so briefs go to the right manager.", status: "connected", target: "Shift schedule (CSV sync)", deliveries: [] },
    { id: "cx-inventory", kind: "inventory", name: "Inventory & ordering", description: "Turn order-prep tasks into draft purchase orders.", status: "available", target: "Vendor ordering portal", deliveries: [] },
    { id: "cx-maintenance", kind: "maintenance", name: "Maintenance tickets", description: "Open a ticket with the evidence trail when equipment keeps failing.", status: "available", target: "Facilities ticket queue", deliveries: [] },
  ];

  const byId = <T extends { id: ID }>(list: T[]) => Object.fromEntries(list.map((x) => [x.id, x]));
  return {
    schemaVersion: SCHEMA_VERSION,
    seq: 0,
    organization: { id: ORG, name: "Nightjar Kitchens", industry: "Fast-casual restaurants", timezoneLabel: "Ridgeport local time", createdAt: "2026-10-01T09:00:00Z" },
    locations: byId(locations),
    users: byId(users),
    shiftTemplates: byId(templates),
    shiftInstances: {},
    questions: byId(questions),
    handoffs: {},
    evidence: {},
    items: {},
    issues: {},
    tasks: {},
    incidents: {},
    inventoryFlags: {},
    rules: byId(rules),
    acknowledgments: {},
    comments: {},
    audit: {},
    notifications: {},
    briefings: {},
    connectors: byId(connectors),
    settings: {
      retention: { audioDays: 30, transcriptDays: 365 },
      thresholds: { escalateUnackedCriticalMinutes: 15, patternMinMentions: 3, patternWindowDays: 14, lowStockPercentOfPar: 50 },
    },
    setup: { step: 0, completedAt: null, skipped: false, startedAt: null },
    demo: {
      clockAnchor: DEMO_ANCHOR,
      clockSetAtMs: 0,
      clockFrozen: false,
      currentUserId: "u-maya",
      currentLocationId: "loc-dtn",
      network: "online",
      outbox: [],
      simulateConflictNext: false,
      failNextExtraction: false,
      firedTimers: [],
      seenTransform: [],
      guide: { configure: null, submit: null, confirm: null, switch: null, claim: null, pattern: null, explainer: null },
    },
  };
}

function run<I>(db: DemoDB, cmd: Command<I>, input: I, ctx: Ctx) {
  return cmd(db, input, ctx);
}

const OPENER: Record<ID, ID> = { "loc-dtn": "u-luis", "loc-ngt": "u-sam", "loc-cyp": "u-kofi" };

/** Canned morning resolutions, keyed by task kind. */
const RESOLUTION: Record<string, string> = {
  service: "Ran fine at open. Watching it.",
  call: "Called the guest, sorted.",
  order_prep: "Order placed with the supplier.",
  training: "Walked through it before lunch.",
  follow_up: "Checked and logged.",
  staffing: "Covered by the mid shift.",
};

/** Tasks that stay open on purpose so the briefing and patterns have carried-over work. */
function keepOpen(db: DemoDB, taskId: ID, date: string): boolean {
  const t = db.tasks[taskId];
  const issue = t.issueId ? db.issues[t.issueId] : null;
  if (issue?.subjectKey === "asset:fryer-2") return true; // Northgate fryer: open, claimed by Sam
  if (issue?.subjectKey === "asset:card-reader") return true; // Canyon card reader waits on a vendor
  if (issue?.subjectKey === "asset:hood-fan" && t.locationId === "loc-cyp") return true;
  if (issue?.subjectKey === "asset:mop-sink" && date < "2026-10-19") return true; // plumber booked
  return false;
}

function replayHistory(db: DemoDB) {
  const transcripts = [...SEED_TRANSCRIPTS].sort((a, b) => (a.date + a.submittedAt).localeCompare(b.date + b.submittedAt));
  const dates = Array.from(new Set(transcripts.map((t) => t.date)));

  for (const date of dates) {
    // ── Morning: the opener works the brief from last night's closeout.
    for (const locationId of ["loc-dtn", "loc-ngt", "loc-cyp"]) {
      const opener = OPENER[locationId];
      ensureShiftInstance(db, locationId, date, "open");
      const briefing = Object.values(db.briefings).find((b) => b.locationId === locationId && b.date === date);
      if (!briefing) continue;
      let t = at(date, "06:12");
      run(db, acknowledge, { entityType: "briefing", entityId: briefing.id }, { now: t, actorId: opener });
      const fromLastNight = Object.values(db.tasks).filter((x) => x.locationId === locationId && x.status !== "done");
      for (const task of fromLastNight) {
        t = addMinutes(t, 7);
        if (keepOpen(db, task.id, date)) {
          if (!task.claimedById) run(db, claimTask, { taskId: task.id }, { now: t, actorId: opener });
          continue;
        }
        const issue = task.issueId ? db.issues[task.issueId] : null;
        const note =
          issue?.subjectKey === "customer:table-12"
            ? "Refund re-submitted in POS. Processor says 5 to 7 business days."
            : issue?.subjectKey === "customer:table-4"
              ? "Called back. 20 bowls confirmed for Friday pickup."
              : issue?.subjectKey === "asset:mop-sink"
                ? "Plumber replaced the trap."
                : issue?.subjectKey === "asset:ice-machine"
                  ? "Ran fine at open, bin full. Watching it."
                  : RESOLUTION[task.kind] ?? "Done.";
        run(db, claimTask, { taskId: task.id }, { now: t, actorId: opener });
        run(
          db,
          resolveTask,
          { taskId: task.id, note, issueOutcome: task.kind === "service" ? "monitoring" : task.kind === "order_prep" ? "keep" : "resolved" },
          { now: addMinutes(t, 3), actorId: opener },
        );
      }
    }

    // ── Night: closeouts come in.
    for (const tr of transcripts.filter((x) => x.date === date)) {
      const now = at(date, tr.submittedAt);
      const words = tr.text.split(/\s+/).length;
      run(
        db,
        createHandoff,
        {
          id: tr.id,
          locationId: tr.locationId,
          authorId: tr.authorId,
          mode: "free",
          answers: [{ questionId: null, prompt: "Free closeout", text: tr.text, durationSec: Math.round(words / 2.4), source: "seeded" }],
          hasRecording: true,
          shiftDate: date,
        },
        { now, actorId: tr.authorId },
      );
      run(db, processHandoff, { handoffId: tr.id }, { now: addMinutes(now, 1), actorId: null });
      const items = Object.values(db.items).filter((i) => i.handoffId === tr.id);
      for (const item of items) {
        if (item.status !== "proposed") continue;
        if (item.confidence !== "high" || item.ruleEffects.requireConfirmation) {
          if (item.subjectKey === "asset:walk-in" && tr.id === "ho-cyp-1015") {
            run(db, correctItem, { itemId: item.id, severity: "critical", note: "Alarm is real until someone checks the probe." }, { now: addMinutes(now, 2), actorId: tr.authorId });
          } else {
            run(db, confirmItem, { itemId: item.id }, { now: addMinutes(now, 2), actorId: tr.authorId });
          }
        }
      }
      run(db, publishHandoff, { handoffId: tr.id }, { now: addMinutes(now, 3), actorId: tr.authorId });
    }
  }

  scriptedStory(db);
}

/** Specific beats: the false alarm, the contradictory fryer reports, the conversation threads. */
function scriptedStory(db: DemoDB) {
  const issueBy = (loc: ID, key: string) => Object.values(db.issues).find((i) => i.locationId === loc && i.subjectKey === key);

  // Canyon Plaza walk-in alarm on the 15th was a false alarm (probe unplugged).
  const walkIn = issueBy("loc-cyp", "asset:walk-in");
  const alarmItem = walkIn && walkIn.itemIds.map((id) => db.items[id]).find((i) => i.handoffId === "ho-cyp-1015");
  if (alarmItem) {
    alarmItem.fields.falseAlarm = { byId: "u-kofi", at: "2026-10-16T06:40:00Z", note: "Probe was unplugged during cleaning. Walk-in held 36°F all night." };
    db.audit[`ae-fa-${alarmItem.id}`] = {
      id: `ae-fa-${alarmItem.id}`,
      at: "2026-10-16T06:40:00Z",
      actorId: "u-kofi",
      action: "item.false_alarm",
      entityType: "item",
      entityId: alarmItem.id,
      locationId: "loc-cyp",
      summary: "Marked the walk-in alarm from Oct 15 as a false alarm",
      detail: "Probe was unplugged during cleaning. Walk-in held 36°F all night.",
    };
  }

  // Northgate fryer 2: Sam asked Dev about the contradictory readings; Jordan requested a quote.
  const fryer = issueBy("loc-ngt", "asset:fryer-2");
  if (fryer) {
    const t = Object.values(db.tasks).find((x) => x.issueId === fryer.id && x.status !== "done");
    run(db, askPreviousShift, { entityType: "issue", entityId: fryer.id, body: "Last night says it held 350. Did you check it with the probe thermometer or the dial?" }, { now: "2026-10-18T06:31:00Z", actorId: "u-sam" });
    run(db, addComment, { entityType: "issue", entityId: fryer.id, body: "Dial only. Sam, the probe read 378 when I checked on Friday.", kind: "reply", toUserId: "u-sam", authorId: "u-dev" }, { now: "2026-10-18T07:02:00Z", actorId: "u-dev" });
    run(db, addComment, { entityType: "issue", entityId: fryer.id, body: "Requested a thermostat quote from the equipment vendor. Keep logging probe readings.", kind: "note" }, { now: "2026-10-19T10:14:00Z", actorId: "u-jordan" });
    void t;
  }

  // Canyon card reader: vendor ticket in flight.
  const reader = issueBy("loc-cyp", "asset:card-reader");
  if (reader) {
    run(db, addComment, { entityType: "issue", entityId: reader.id, body: "Processor support case #88213 open. They're shipping a replacement reader.", kind: "note" }, { now: "2026-10-17T09:20:00Z", actorId: "u-kofi" });
  }

  // Ice machine: Luis has been resetting it every morning.
  const ice = issueBy("loc-dtn", "asset:ice-machine");
  if (ice) {
    run(db, addComment, { entityType: "issue", entityId: ice.id, body: "Reset it again this morning. Fine at open, but this is the third week of this.", kind: "note" }, { now: "2026-10-19T06:44:00Z", actorId: "u-luis" });
  }

  // Everything that happened before tonight has been read.
  for (const n of Object.values(db.notifications)) n.readAt = addMinutes(n.at, 20);
}

export function buildSeed(): DemoDB {
  const db = baseDB();
  replayHistory(db);
  // Tonight's shift instances exist so the capture flow has somewhere to land.
  ensureShiftInstance(db, "loc-dtn", "2026-10-20", "close");
  ensureShiftInstance(db, "loc-dtn", addDays("2026-10-20", 1), "open");
  return db;
}

export function freshSeed(nowMs: number): DemoDB {
  const db = buildSeed();
  db.demo.clockSetAtMs = nowMs;
  return db;
}

void resolveIssue;
