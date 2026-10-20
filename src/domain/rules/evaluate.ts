import type {
  EscalationRule,
  ExtractedItem,
  Issue,
  Role,
  RuleAction,
  RuleCondition,
  Severity,
  Task,
} from "../types";
import { RULE_TOPICS } from "../extraction/lexicon";
import type { DraftItem } from "../extraction/extract";
import { maxSeverity } from "../extraction/extract";
import { hhmmToMinutes, minutesOfDay, dayKey, toMs } from "../time";

type Evaluable = Pick<DraftItem | ExtractedItem, "kind" | "subtype" | "topic" | "confidence" | "fields" | "severity"> & {
  evidenceText: string[];
};

export interface ItemRuleMatch {
  ruleId: string;
  matched: string;
}

export const ROLE_LABEL: Record<Role, string> = {
  closing_manager: "closing manager",
  opening_manager: "opening manager",
  kitchen_lead: "kitchen lead",
  area_manager: "area manager",
  crew: "crew",
};

function inScope(rule: EscalationRule, locationId: string): boolean {
  return rule.locationIds === "all" || rule.locationIds.includes(locationId);
}

/** Does this rule's condition fire for this item? Returns the words that matched, for the evidence UI. */
export function matchCondition(condition: RuleCondition, item: Evaluable): string | null {
  switch (condition.type) {
    case "mentions": {
      const t = RULE_TOPICS[condition.topic];
      const wordFromEvidence = () => {
        for (const text of item.evidenceText) {
          const m = text.match(t.re);
          if (m) return m[0];
        }
        return null;
      };
      if (t.topics.includes(item.topic)) return wordFromEvidence() ?? item.fields.assetLabel ?? t.label;
      // Equipment and incident sentences can mention a topic outside their own (a soda fountain "leaking").
      if (item.kind === "maintenance" || item.kind === "incident") return wordFromEvidence();
      return null;
    }
    case "below_par": {
      if (item.kind !== "inventory") return null;
      const f = item.fields;
      if (condition.itemKey !== "any" && f.itemKey !== condition.itemKey) return null;
      const below =
        f.stockState === "out" ||
        f.stockState === "low" ||
        f.stockState === "order" ||
        (f.qty != null && f.par != null && f.qty < f.par);
      if (!below) return null;
      return f.qty != null && f.par != null ? `${f.qty} of ${f.par} ${f.unit}s` : f.stockState === "order" ? `order ${f.itemLabel?.toLowerCase()}` : `${f.itemLabel} ${f.stockState}`;
    }
    case "uncertain":
      return item.confidence === "uncertain" ? "uncertain" : null;
    case "open_at":
      return null; // time-based; see evaluateOpenAt
  }
}

export function toEvaluable(item: DraftItem | ExtractedItem, evidenceText: string[]): Evaluable {
  return { ...item, evidenceText };
}

export interface ItemRuleOutcome {
  severity: Severity;
  hits: { ruleId: string; summary: string; matched: string }[];
  notify: { role: Role; channel: string; ruleId: string }[];
  tasks: { template: "order_prep" | "service_call" | "callback"; ruleId: string }[];
  escalate: { role: Role; ruleId: string }[];
  requireConfirmation: boolean;
}

/** Apply all enabled rules to one item. Pure: callers decide what to persist. */
export function applyRules(rules: EscalationRule[], item: Evaluable, locationId: string): ItemRuleOutcome {
  const out: ItemRuleOutcome = { severity: item.severity, hits: [], notify: [], tasks: [], escalate: [], requireConfirmation: false };
  for (const rule of rules) {
    if (!rule.enabled || !inScope(rule, locationId)) continue;
    const matched = matchCondition(rule.condition, item);
    if (!matched) continue;
    out.hits.push({ ruleId: rule.id, summary: summarizeRule(rule), matched });
    for (const a of rule.actions) {
      if (a.type === "set_severity") out.severity = maxSeverity(out.severity, a.severity);
      if (a.type === "notify") out.notify.push({ role: a.role, channel: a.channel, ruleId: rule.id });
      if (a.type === "create_task") out.tasks.push({ template: a.template, ruleId: rule.id });
      if (a.type === "escalate") out.escalate.push({ role: a.role, ruleId: rule.id });
      if (a.type === "require_confirmation") out.requireConfirmation = true;
    }
  }
  return out;
}

export interface TimedEscalation {
  ruleId: string;
  taskId: string;
  role: Role;
  dueAt: string;
  fired: boolean;
}

/**
 * Time-based rules ("if a customer refund remains open at 9 AM, escalate").
 * Returns every task the rule is watching, and whether it has fired by `now`.
 */
export function evaluateOpenAt(
  rules: EscalationRule[],
  tasks: Task[],
  issues: Record<string, Issue>,
  items: Record<string, ExtractedItem>,
  now: string,
): TimedEscalation[] {
  const out: TimedEscalation[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.condition.type !== "open_at") continue;
    const cond = rule.condition;
    const role = (rule.actions.find((a) => a.type === "escalate" || a.type === "notify") as Extract<RuleAction, { role: Role }> | undefined)?.role ?? "area_manager";
    for (const task of tasks) {
      if (task.status === "done" || !inScope(rule, task.locationId)) continue;
      const linkedItems = task.itemIds.map((id) => items[id]).filter(Boolean);
      const isRefund = linkedItems.some((i) => i.subtype === "refund");
      const isCustomer = linkedItems.some((i) => i.kind === "customer");
      if (cond.subject === "refund" && !isRefund) continue;
      if (cond.subject === "customer" && !isCustomer) continue;
      // The watch starts the morning after the task was created.
      const watchDay = dayKey(task.createdAt) === dayKey(now) && minutesOfDay(task.createdAt) < hhmmToMinutes(cond.time) ? dayKey(now) : nextDay(task.createdAt);
      const dueAt = `${watchDay}T${cond.time}:00Z`;
      out.push({ ruleId: rule.id, taskId: task.id, role, dueAt, fired: toMs(now) >= toMs(dueAt) });
      void issues;
    }
  }
  return out;
}

function nextDay(iso: string): string {
  return new Date(Date.parse(iso) + 86_400_000).toISOString().slice(0, 10);
}

const TOPIC_PHRASE: Record<string, string> = Object.fromEntries(
  Object.entries(RULE_TOPICS).map(([k, v]) => [k, v.label]),
);

export function describeCondition(c: RuleCondition): string {
  switch (c.type) {
    case "mentions":
      return `${capitalizeFirst(TOPIC_PHRASE[c.topic])} is mentioned`;
    case "below_par":
      return c.itemKey === "any" ? "An item is below par" : `${labelForStock(c.itemKey)} is below par`;
    case "open_at":
      return `${c.subject === "refund" ? "A customer refund" : c.subject === "customer" ? "A customer follow-up" : "Any task"} is still open at ${fmt12(c.time)}`;
    case "uncertain":
      return "The closer sounds unsure";
  }
}

export function describeAction(a: RuleAction): string {
  switch (a.type) {
    case "set_severity":
      return `mark it ${a.severity}`;
    case "notify":
      return `notify the ${ROLE_LABEL[a.role]}${a.channel === "sms" ? " by text" : a.channel === "team_chat" ? " in team chat" : a.channel === "email" ? " by email" : ""}`;
    case "create_task":
      return a.template === "order_prep" ? "create an order-prep task" : a.template === "service_call" ? "create a service-call task" : "create a call-back task";
    case "escalate":
      return `escalate to the ${ROLE_LABEL[a.role]}`;
    case "require_confirmation":
      return "require a manager to confirm it";
  }
}

/** Plain-language summary shown on every rule: "If refrigeration is mentioned, mark it critical and notify the area manager by text." */
export function summarizeRule(rule: Pick<EscalationRule, "condition" | "actions" | "locationIds">, locationNames?: Record<string, string>): string {
  const cond = describeCondition(rule.condition);
  const condLower = cond.charAt(0).toLowerCase() + cond.slice(1);
  const acts = rule.actions.map(describeAction);
  const actText = acts.length === 0 ? "do nothing yet" : acts.length === 1 ? acts[0] : `${acts.slice(0, -1).join(", ")} and ${acts[acts.length - 1]}`;
  const scope =
    rule.locationIds === "all" || !locationNames
      ? ""
      : ` at ${rule.locationIds.map((id) => locationNames[id] ?? id).join(" and ")}`;
  return `If ${condLower}${scope}, ${actText}.`;
}

function capitalizeFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h >= 12 ? "PM" : "AM"}`;
}

function labelForStock(key: string): string {
  return key.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
