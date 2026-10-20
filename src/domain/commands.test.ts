import { describe, expect, it } from "vitest";
import { buildSeed, MORNING_ANCHOR } from "@/data/seed";
import {
  claimTask,
  CommandError,
  ConflictError,
  confirmItem,
  createHandoff,
  processHandoff,
  publishHandoff,
  publishPreview,
  remoteEdit,
  resolveTask,
  runCommand,
  undoTouched,
} from "./commands";
import { composeBriefing } from "./briefing";
import { detectPatterns } from "./patterns";
import { MAYA, publishPrimary, submitPrimary } from "@/test/fixtures";

const LUIS = { now: MORNING_ANCHOR, actorId: "u-luis" };

describe("seed", () => {
  it("is deterministic and covers nine nights across three stores", () => {
    const a = buildSeed();
    const b = buildSeed();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const published = Object.values(a.handoffs).filter((h) => h.status === "published");
    expect(published).toHaveLength(26);
    expect(new Set(published.map((h) => h.locationId)).size).toBe(3);
  });
});

describe("review gate", () => {
  it("blocks publishing until review items are confirmed", () => {
    const { db, handoffId } = submitPrimary();
    const preview = publishPreview(db, handoffId);
    expect(preview.blocking.map((i) => i.title)).toEqual(["Large cups out, lent to Northgate", "Back door sensor flashed twice"]);
    expect(() => publishHandoff(db, { handoffId }, MAYA)).toThrow(CommandError);
  });

  it("names who a critical escalation will reach before publishing", () => {
    const { db, handoffId } = submitPrimary();
    const preview = publishPreview(db, handoffId);
    expect(preview.critical.map((c) => [c.item.title, c.recipients.map((u) => u.name), c.channel])).toEqual([
      ["Ice machine grinding again", ["Jordan Cole"], "sms"],
    ]);
  });

  it("refuses an empty closeout", () => {
    const db = buildSeed();
    expect(() => createHandoff(db, { locationId: "loc-dtn", authorId: "u-maya", mode: "guided", hasRecording: false, answers: [] }, MAYA)).toThrow(CommandError);
  });
});

describe("publishing", () => {
  it("creates one task per issue, aggregates order prep, and notifies the area manager", () => {
    const { db } = publishPrimary();
    const open = Object.values(db.tasks).filter((t) => t.locationId === "loc-dtn" && t.status !== "done");
    expect(open.map((t) => t.title).sort()).toEqual([
      "Call Table 12 about the Friday refund",
      "Check ice machine before open; book service if the grinding returns",
      "Prep order: Avocado, large cups",
      "Walk Tasha through the chemical test",
    ]);
    const refund = open.find((t) => t.kind === "call")!;
    expect(refund.ownerId).toBe("u-luis");
    const sms = Object.values(db.notifications).filter((n) => n.userId === "u-jordan" && !n.readAt);
    expect(sms.map((n) => n.title)).toContain("Critical · Ice machine grinding again");
  });

  it("attaches tonight's ice machine mention to the existing thread", () => {
    const { db } = publishPrimary();
    const ice = Object.values(db.issues).find((i) => i.locationId === "loc-dtn" && i.subjectKey === "asset:ice-machine")!;
    expect(ice.itemIds).toHaveLength(6);
    expect(ice.status).toBe("open");
  });

  it("reopens the refund thread that was marked resolved", () => {
    const { db } = publishPrimary();
    const refund = Object.values(db.issues).find((i) => i.subjectKey === "customer:table-12")!;
    expect(refund.status).toBe("open");
    expect(Object.values(db.audit).some((a) => a.entityId === refund.id && a.action === "issue.recurred")).toBe(true);
  });

  it("merges a repeat mention into an open task instead of duplicating it", () => {
    const { db } = publishPrimary();
    const iceTask = Object.values(db.tasks).find((t) => t.kind === "service" && t.locationId === "loc-dtn" && t.status !== "done")!;
    const r = createHandoff(db, { locationId: "loc-dtn", authorId: "u-luis", mode: "free", hasRecording: false, answers: [{ questionId: null, prompt: "Free", text: "Ice machine grinding again around eleven.", durationSec: 4, source: "typed" }] }, { now: "2026-10-20T23:10:00Z", actorId: "u-luis" });
    processHandoff(db, { handoffId: r.data!.handoffId as string }, MAYA);
    publishHandoff(db, { handoffId: r.data!.handoffId as string }, MAYA);
    const iceTasks = Object.values(db.tasks).filter((t) => t.issueId === iceTask.issueId && t.status !== "done");
    expect(iceTasks).toHaveLength(1);
    expect(iceTasks[0].itemIds).toHaveLength(2);
  });
});

describe("briefing actions", () => {
  it("claims with optimistic versioning and detects a teammate's concurrent edit", () => {
    const { db } = publishPrimary();
    const task = Object.values(db.tasks).find((t) => t.kind === "service" && t.locationId === "loc-dtn" && t.status !== "done")!;
    const seenVersion = task.version;
    remoteEdit(db, { taskId: task.id, userId: "u-bri" }, { now: MORNING_ANCHOR, actorId: "u-bri" });
    try {
      claimTask(db, { taskId: task.id, expectedVersion: seenVersion }, LUIS);
      throw new Error("expected a conflict");
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictError);
      expect((e as ConflictError).info).toMatchObject({ byUserId: "u-bri", theirChange: "claimed it" });
    }
  });

  it("undo restores the task and keeps the audit trail append-only", () => {
    const { db } = publishPrimary();
    const task = Object.values(db.tasks).find((t) => t.kind === "call" && t.status !== "done")!;
    const { db: after, result } = runCommand(db, claimTask, { taskId: task.id, expectedVersion: task.version }, LUIS);
    expect(after.tasks[task.id].claimedById).toBe("u-luis");
    const undone = undoTouched(after, db, result.touched, LUIS, "Claim");
    expect(undone.tasks[task.id].claimedById).toBeNull();
    expect(undone.tasks[task.id].version).toBe(after.tasks[task.id].version + 1);
    expect(Object.keys(undone.audit).length).toBe(Object.keys(after.audit).length + 1);
  });

  it("resolving an order-prep task closes the stock threads it covered", () => {
    const { db } = publishPrimary();
    const prep = Object.values(db.tasks).find((t) => t.kind === "order_prep" && t.locationId === "loc-dtn" && t.status !== "done")!;
    resolveTask(db, { taskId: prep.id, note: "Ordered" }, LUIS);
    const cups = Object.values(db.issues).find((i) => i.locationId === "loc-dtn" && i.subjectKey === "stock:cups-large")!;
    expect(cups.status).toBe("resolved");
  });
});

describe("opening brief", () => {
  it("waits for tonight's closeout before it has content", () => {
    const db = buildSeed();
    const b = composeBriefing(db, "loc-dtn", MORNING_ANCHOR);
    expect(b.state).toBe("awaiting");
    expect(b.closeoutDueAt).toBe("2026-10-20T22:45:00Z");
  });

  it("answers the four questions for Luis", () => {
    const { db } = publishPrimary();
    const b = composeBriefing(db, "loc-dtn", MORNING_ANCHOR);
    expect(b.state).toBe("ready");
    expect(b.risks.map((r) => r.title)).toEqual(["Ice machine grinding again", "Large cups out, lent to Northgate", "Table 12 refund still not received"]);
    expect(b.risks[0].recurring).toMatchObject({ count: 6, spanDays: 9 });
    expect(b.risks[2].timer).toMatchObject({ dueAt: "2026-10-21T09:00:00Z", fired: false });
    expect(b.mustDo.map((m) => m.title)).toEqual(["Walk Tasha through the chemical test"]);
    expect(b.changed.find((c) => c.kind === "returned")?.title).toBe("Table 12 refund still not received");
    expect(b.handled.map((h) => h.title)).toEqual(["Ice machine: kept running overnight", "Back door sensor flashed twice"]);
  });
});

describe("pattern intelligence", () => {
  it("reveals the Downtown ice machine: six mentions in nine days, mostly after 8 PM, ~3.5 labor hours", () => {
    const { db } = publishPrimary();
    const ice = detectPatterns(db, MORNING_ANCHOR).find((p) => p.subjectKey === "asset:ice-machine")!;
    expect(ice.headline).toBe("Downtown ice machine mentioned 6 times in 9 days");
    expect(ice.afterHour).toEqual({ hour: 20, count: 5, of: 6 });
    expect(ice.laborMinutes).toBe(210);
    expect(ice.observation).toContain("about 3.5 labor hours");
  });

  it("before tonight's closeout the ice machine is a smaller pattern", () => {
    const ice = detectPatterns(buildSeed(), "2026-10-20T22:40:00Z").find((p) => p.subjectKey === "asset:ice-machine")!;
    expect(ice.count).toBe(5);
  });

  it("excludes the false alarm and flags the contradictory fryer reports", () => {
    const patterns = detectPatterns(buildSeed(), MORNING_ANCHOR);
    const walkIn = patterns.find((p) => p.subjectKey === "asset:walk-in")!;
    expect(walkIn.falseAlarms).toHaveLength(1);
    expect(walkIn.count).toBe(2);
    expect(walkIn.belowThreshold).toBe(true);
    const fryer = patterns.find((p) => p.subjectKey === "asset:fryer-2")!;
    expect(fryer.okReports.length).toBeGreaterThan(0);
    expect(fryer.contradictions.length).toBeGreaterThan(0);
  });

  it("never claims a cause", () => {
    const { db } = publishPrimary();
    for (const p of detectPatterns(db, MORNING_ANCHOR)) {
      expect(`${p.headline} ${p.observation} ${p.caution}`).not.toMatch(/\b(caused by|because of|due to|is causing|the cause is)\b/i);
    }
  });
});

describe("item review", () => {
  it("confirming records who reviewed it", () => {
    const { db, handoffId } = submitPrimary();
    const cups = Object.values(db.items).find((i) => i.handoffId === handoffId && i.subjectKey === "stock:cups-large")!;
    confirmItem(db, { itemId: cups.id }, MAYA);
    expect(db.items[cups.id]).toMatchObject({ status: "confirmed", reviewedById: "u-maya" });
  });
});
