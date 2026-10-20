import { describe, expect, it } from "vitest";
import { applyRules, evaluateOpenAt, summarizeRule, toEvaluable } from "./evaluate";
import { extractTranscript } from "../extraction/extract";
import { buildSeed } from "@/data/seed";
import { DOWNTOWN_CTX, publishPrimary } from "@/test/fixtures";
import type { EscalationRule } from "../types";

const seedRules = () => Object.values(buildSeed().rules);
const draft = (text: string) => {
  const item = extractTranscript(text, DOWNTOWN_CTX()).items[0];
  return toEvaluable(item, item.evidence.map((e) => e.text));
};

describe("rule evaluation", () => {
  it("refrigeration mentions become critical and notify the area manager by text", () => {
    const out = applyRules(seedRules(), draft("Ice machine started making that grinding noise again around eight twenty."), "loc-dtn");
    expect(out.severity).toBe("critical");
    expect(out.notify).toEqual([{ role: "area_manager", channel: "sms", ruleId: "rl-refrigeration" }]);
    expect(out.hits[0].matched.toLowerCase()).toBe("ice machine");
  });

  it("below-par stock creates an order-prep task", () => {
    const out = applyRules(seedRules(), draft("We have one case of avocado left."), "loc-dtn");
    expect(out.tasks).toEqual([{ template: "order_prep", ruleId: "rl-below-par" }]);
    expect(out.hits[0].matched).toBe("1 of 4 cases");
  });

  it("stock at or above par does not fire", () => {
    const out = applyRules(seedRules(), draft("Avocados are at five cases."), "loc-dtn");
    expect(out.tasks).toEqual([]);
  });

  it("ignores disabled rules and respects location scope", () => {
    const rules = seedRules();
    const fryer = draft("Fryer one was running hot around seven.");
    expect(applyRules(rules, fryer, "loc-dtn").notify).toEqual([]); // cooking rule is off
    const on = rules.map((r) => (r.id === "rl-cooking" ? { ...r, enabled: true } : r));
    expect(applyRules(on, fryer, "loc-dtn").notify[0]).toMatchObject({ role: "kitchen_lead" });
    expect(applyRules(on, fryer, "loc-ngt").notify).toEqual([]); // scoped to Downtown
  });

  it("injuries are critical", () => {
    const out = applyRules(seedRules(), draft("Jess cut her finger on the mandoline, first aid done."), "loc-ngt");
    expect(out.severity).toBe("critical");
  });

  it("summarizes rules in plain language", () => {
    const rules = Object.fromEntries(seedRules().map((r) => [r.id, r]));
    expect(summarizeRule(rules["rl-refrigeration"])).toBe("If refrigeration is mentioned, mark it critical and notify the area manager by text.");
    expect(summarizeRule(rules["rl-below-par"])).toBe("If an item is below par, create an order-prep task.");
    expect(summarizeRule(rules["rl-refund-9am"])).toBe("If a customer refund is still open at 9 AM, escalate to the area manager.");
    expect(summarizeRule(rules["rl-cooking"], { "loc-dtn": "Downtown" })).toBe(
      "If cooking equipment is mentioned at Downtown, notify the kitchen lead.",
    );
  });
});

describe("time-based rules", () => {
  it("watches the open refund and fires at 9 AM, not before", () => {
    const { db } = publishPrimary();
    const refundTask = Object.values(db.tasks).find((t) => t.title === "Call Table 12 about the Friday refund")!;
    const rules = Object.values(db.rules);
    const at = (iso: string) => evaluateOpenAt(rules, Object.values(db.tasks), db.issues, db.items, iso).find((t) => t.taskId === refundTask.id);
    expect(at("2026-10-21T06:15:00Z")).toMatchObject({ dueAt: "2026-10-21T09:00:00Z", fired: false });
    expect(at("2026-10-21T09:00:00Z")?.fired).toBe(true);
  });

  it("does not watch resolved refunds", () => {
    const { db } = publishPrimary();
    const refundTask = Object.values(db.tasks).find((t) => t.title === "Call Table 12 about the Friday refund")!;
    refundTask.status = "done";
    const timers = evaluateOpenAt(Object.values(db.rules), Object.values(db.tasks), db.issues, db.items, "2026-10-21T09:30:00Z");
    expect(timers.find((t) => t.taskId === refundTask.id)).toBeUndefined();
  });

  it("only refund tasks match a refund rule", () => {
    const { db } = publishPrimary();
    const rule: EscalationRule = Object.values(db.rules).find((r) => r.condition.type === "open_at")!;
    const watched = evaluateOpenAt([rule], Object.values(db.tasks), db.issues, db.items, "2026-10-21T09:30:00Z");
    expect(watched.map((w) => db.tasks[w.taskId].title)).toEqual(["Call Table 12 about the Friday refund"]);
  });
});
