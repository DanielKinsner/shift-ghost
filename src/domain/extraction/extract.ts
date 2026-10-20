import type {
  Confidence,
  Inference,
  ItemFields,
  ItemKind,
  ItemSubtype,
  Location,
  Severity,
  TextSpan,
  Topic,
  TranscriptAnswer,
} from "../types";
import { at, addDays } from "../time";
import {
  AGAIN,
  ASSETS,
  CONTEXT_ONLY,
  CUSTOMER,
  DAY_REF,
  DUE_PHRASES,
  FAILURE,
  HANDLED,
  HEDGES,
  KUDOS,
  LOCATION_NAMES,
  OK_REPORT,
  RECOVERY,
  SAFETY,
  SECURITY_GENERIC,
  STAFFING,
  STOCK,
  STOCK_SIGNAL,
  TABLE,
  TRAINING,
  UNIT_RE,
  type AssetDef,
} from "./lexicon";
import { NUMBER_WORD, parseCompound, parseDurationMinutes, parseReading, parseTimeOfDay, wordToNumber } from "./numbers";
import { questionForOffset, segmentClauses, segmentSentences } from "./segment";

export interface RosterEntry {
  id: string;
  firstName: string;
}

export interface ExtractionContext {
  locationId: string;
  location: Pick<Location, "doorsOpen" | "lunchRush" | "pars" | "name">;
  shiftKind: "open" | "mid" | "close";
  shiftDate: string;
  /** Date the next shift opens; due phrases resolve against it. */
  nextOpenDate: string;
  roster: RosterEntry[];
  answers: TranscriptAnswer[];
  /** Index of the "before the next rush" question, used to infer due times. */
  rushQuestionId?: string | null;
}

export interface DraftEvidence extends TextSpan {
  questionId: string | null;
  role: "primary" | "context" | "action" | "handled";
}

export interface TaskProposal {
  title: string;
  detail: string;
  kind: "call" | "service" | "order_prep" | "training" | "follow_up" | "staffing";
  ownerId: string | null;
  dueAt: string | null;
  dueLabel: string | null;
}

export interface DraftItem {
  key: string;
  kind: ItemKind;
  subtype: ItemSubtype;
  topic: Topic;
  subjectKey: string;
  title: string;
  facts: string[];
  severity: Severity;
  confidence: Confidence;
  confidenceReason: string;
  inferences: Inference[];
  mergedKinds: ItemKind[];
  fields: ItemFields;
  evidence: DraftEvidence[];
  hedge: string | null;
  task: TaskProposal | null;
}

export interface ExtractionResult {
  items: DraftItem[];
  unmapped: TextSpan[];
  context: TextSpan[];
  crewNotes: TextSpan[];
  /** Sentence-level merges, surfaced in review as "merged to avoid a duplicate". */
  merges: { text: string; into: string; also: ItemKind }[];
}

/** The seam an LLM-backed extractor would implement. */
export interface Extractor {
  extract(transcript: string, ctx: ExtractionContext): ExtractionResult;
}

const PRONOUN = /\b(?:it|its|it's|they|them|that|this|those)\b/i;

const SEVERITY_ORDER: Severity[] = ["watch", "normal", "high", "critical"];
export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}
const CONF_ORDER: Confidence[] = ["uncertain", "review", "high"];
export function minConfidence(a: Confidence, b: Confidence): Confidence {
  return CONF_ORDER.indexOf(a) <= CONF_ORDER.indexOf(b) ? a : b;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function plural(n: number, unit: string): string {
  if (n === 1) return `1 ${unit}`;
  if (n === 0.5) return `half a ${unit}`;
  return `${n} ${unit.endsWith("ch") ? unit + "es" : unit + "s"}`;
}

function minutesToHHMM(m: number): string {
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function findPerson(text: string, roster: RosterEntry[]): RosterEntry | null {
  for (const r of roster) {
    const re = new RegExp(`\\b${r.firstName.normalize("NFD").replace(/[̀-ͯ]/g, "")}\\b`, "i");
    if (re.test(text.normalize("NFD").replace(/[̀-ͯ]/g, ""))) return r;
  }
  return null;
}

function resolveDue(text: string, ctx: ExtractionContext): { dueAt: string; label: string; reason: string } | null {
  const lower = text.toLowerCase();
  for (const d of DUE_PHRASES) {
    if (!d.re.test(lower)) continue;
    const day = ctx.nextOpenDate;
    switch (d.resolve) {
      case "lunch":
        return { dueAt: at(day, ctx.location.lunchRush), label: d.label, reason: `“${d.label}” → ${ctx.location.lunchRush}, when ${ctx.location.name}'s lunch rush starts` };
      case "open":
        return { dueAt: at(day, ctx.location.doorsOpen), label: d.label, reason: `“${d.label}” → doors open at ${ctx.location.doorsOpen}` };
      case "first":
        return { dueAt: at(day, "07:00"), label: d.label, reason: "“first thing” → 7:00 AM, one hour into the opening shift" };
      case "noon":
        return { dueAt: at(day, "12:00"), label: d.label, reason: "“by noon” → 12:00 PM" };
      default:
        break;
    }
  }
  const t = lower.match(new RegExp(`\\bby (${NUMBER_WORD})(?:\\s*(am|pm))?\\b`));
  if (t) {
    const h = wordToNumber(t[1]);
    if (h && h >= 1 && h <= 12) {
      const hour = t[2] === "pm" && h < 12 ? h + 12 : h;
      const hhmm = minutesToHHMM(hour * 60);
      return { dueAt: at(ctx.nextOpenDate, hhmm), label: `by ${h}${t[2] ? " " + t[2].toUpperCase() : ""}`, reason: `“by ${t[1]}” → ${hhmm} tomorrow` };
    }
  }
  if (/\bbefore the weekend\b/.test(lower)) {
    return { dueAt: at(ctx.nextOpenDate, ctx.location.doorsOpen), label: "before the weekend", reason: "“before the weekend” → next opening, so there is time to order" };
  }
  return null;
}

interface Builder {
  item: DraftItem;
  sentenceIndex: number;
}

/**
 * Deterministic closeout extractor. Reads one transcript and proposes items,
 * each tied to the exact sentences that justify it.
 */
export function extractTranscript(transcript: string, ctx: ExtractionContext): ExtractionResult {
  const sentences = segmentSentences(transcript);
  const result: ExtractionResult = { items: [], unmapped: [], context: [], crewNotes: [], merges: [] };
  const builders: Builder[] = [];
  let keySeq = 0;

  const ev = (span: TextSpan, role: DraftEvidence["role"]): DraftEvidence => ({
    ...span,
    questionId: questionForOffset(ctx.answers, span.start),
    role,
  });

  const newItem = (partial: Omit<DraftItem, "key" | "confidence" | "confidenceReason" | "mergedKinds" | "inferences" | "facts" | "hedge" | "task"> & Partial<DraftItem>, sentenceIndex: number) => {
    const item: DraftItem = {
      key: `d${++keySeq}`,
      confidence: "high",
      confidenceReason: "Stated directly.",
      mergedKinds: [],
      inferences: [],
      facts: [],
      hedge: null,
      task: null,
      ...partial,
    };
    builders.push({ item, sentenceIndex });
    return item;
  };

  sentences.forEach((s, si) => {
    const text = s.text;
    const lower = text.toLowerCase();
    const hedgeMatch = text.match(HEDGES);
    const hedge = hedgeMatch ? hedgeMatch[0] : null;
    const produced: DraftItem[] = [];

    if (CONTEXT_ONLY.test(text.trim())) {
      result.context.push(s);
      return;
    }
    if (KUDOS.test(text)) result.crewNotes.push(s);

    // 1 · Equipment & security assets (the first one named is the subject)
    const assetHits: { def: AssetDef; match: RegExpMatchArray }[] = [];
    for (const def of ASSETS) {
      const m = text.match(def.re);
      if (m) assetHits.push({ def, match: m });
    }
    assetHits.sort((a, b) => (a.match.index ?? 0) - (b.match.index ?? 0));
    for (const { def, match } of assetHits.slice(0, 1)) {
      let key = def.key;
      let label = def.label;
      if (def.numbered && match[1]) {
        const n = wordToNumber(match[1]);
        key = `${def.key}-${n}`;
        label = `${def.label} ${n}`;
      }
      const reading = parseReading(text);
      const negated = /\bno (?:drift|issues|problems|leaks?)\b/i.test(text);
      let failure = negated ? undefined : FAILURE.find((f) => f.re.test(text));
      if (!failure && reading?.setpoint && reading.value - reading.setpoint >= 15) failure = FAILURE.find((f) => f.phrase === "running hot");
      const fixed = /\bfixed\b/i.test(text);
      const ok = !failure && (OK_REPORT.test(text) || negated);
      const isSecurity = def.topic === "security";
      const time = parseTimeOfDay(text, ctx.shiftKind);
      const again = AGAIN.test(text);
      const facts: string[] = [];
      const inferences: Inference[] = [];
      if (time) facts.push(`${time.trigger === "after" ? "After " : time.approximate ? "Around " : "At "}${fmt12(time.minutes)}`);
      if (reading) facts.push(`Reading ${reading.value}°F${reading.setpoint ? ` against a ${reading.setpoint}°F setpoint` : ""}`);
      const countMatch = lower.match(/\b(once|twice|three times)\b/);
      const alertVerb = lower.match(/\b(flashed|chirped|beeped|went off)\b/)?.[1];
      const titleVerb = ok
        ? fixed
          ? "fixed"
          : "held normal"
        : (failure?.phrase === "flashed" || failure?.phrase === "alarm") && alertVerb
          ? `${failure.phrase === "alarm" && alertVerb === "went off" ? "alarm went off" : alertVerb}${countMatch ? " " + countMatch[1] : ""}`
          : failure?.phrase ?? "needs a look";
      const title = `${label} ${titleVerb}${again && !ok ? " again" : ""}`;
      const duration = parseDurationMinutes(text);
      const fields: ItemFields = {
        assetKey: key,
        assetLabel: label,
        occurredAt: time ? at(ctx.shiftDate, minutesToHHMM(time.minutes)) : null,
        assertion: ok ? "ok" : "fault",
        again,
        laborMinutes: duration?.minutes ?? null,
        reading: reading ? { value: reading.value, setpoint: reading.setpoint, unit: "°F" } : null,
      };
      if (duration) facts.push(`${duration.minutes} min of crew time`);
      if (/\bprobe was unplugged\b/i.test(text)) facts.push("Probe was unplugged");
      const moved = text.match(/\bmoved the (\w+)/i);
      if (moved) facts.push(`Moved the ${moved[1]} to another cooler`);
      if (HANDLED.test(text) || (RECOVERY.test(text) && isSecurity)) {
        fields.handled = true;
        fields.handledNote = capitalize(text.replace(/[.]$/, ""));
      }
      if (/\b(?:booked|scheduled)\b/i.test(lower)) facts.push("Service already booked");
      if (/\brebooted\b/i.test(lower)) facts.push("Rebooted by closing crew");
      const item = newItem(
        {
          kind: isSecurity ? "incident" : "maintenance",
          subtype: isSecurity ? "security" : "equipment",
          topic: def.topic,
          subjectKey: `asset:${key}`,
          title,
          severity: ok ? "watch" : isSecurity ? "high" : def.topic === "refrigeration" ? "high" : "normal",
          fields,
          facts,
          inferences,
          evidence: [ev(s, "primary")],
        },
        si,
      );
      if (ok) item.confidenceReason = "A status report that the equipment is working normally.";
      if (isSecurity && !ok && failure?.short === "alerts") {
        item.confidence = "review";
        item.confidenceReason = "Sensor alerts can be faults or real events. Confirm which this was.";
      }
      produced.push(item);
    }

    // 2 · Stock
    const stockHits = STOCK.map((def) => ({ def, m: text.match(def.re) })).filter((x) => x.m) as {
      def: (typeof STOCK)[number];
      m: RegExpMatchArray;
    }[];
    const sentenceHasStockSignal = STOCK_SIGNAL.test(text);
    if (stockHits.length && (sentenceHasStockSignal || UNIT_RE.test(text))) {
      const clauses = stockHits.length > 1 ? segmentClauses(s) : [s];
      for (const { def, m } of stockHits) {
        // fryer oil should not double as a fryer asset; asset regex already excludes "fryer oil"
        const absIdx = s.start + (m.index ?? 0);
        const clause = clauses.find((c) => absIdx >= c.start && absIdx < c.end) ?? s;
        const c = clause.text.toLowerCase();
        const scope = STOCK_SIGNAL.test(c) || UNIT_RE.test(c) ? c : lower;
        const facts: string[] = [];
        const inferences: Inference[] = [];
        let qty: number | null = null;
        let state: ItemFields["stockState"] = "low";
        let transfer: ItemFields["transfer"] = null;
        const unitDefault = def.unit;
        const item = def.label.toLowerCase();
        const numUnit = scope.match(
          new RegExp(`\\b(${NUMBER_WORD}|half a|a|an)\\s+(case|sleeve|bag|box|jug|bunch)(?:e?s)?\\s+(?:of\\s+)?(?:[\\w-]+\\s+)?${def.re.source.replace(/\\b/g, "")}`, "i"),
        );
        const atUnit = scope.match(new RegExp(`\\b(?:at|down to)\\s+(${NUMBER_WORD})\\s+(case|sleeve|bag|box|jug)s?\\b`, "i"));
        const leftUnit = scope.match(new RegExp(`\\b(${NUMBER_WORD})\\s+(case|sleeve|bag|box|jug)s?\\s+left\\b`, "i"));
        const short = scope.match(new RegExp(`\\bshort\\s+(${NUMBER_WORD})\\s+(case|sleeve|bag|box|jug)s?\\b`, "i"));
        const lastUnit = /\blast (case|sleeve|bag|box)\b/i.exec(scope);
        const borrowedBy = LOCATION_NAMES.find((l) => new RegExp(`${l.re.source}\\s+borrowed\\b`, "i").test(scope));
        const borrowedFrom = /\bborrowed\b/i.test(scope)
          ? LOCATION_NAMES.find((l) => new RegExp(`\\bfrom\\s+${l.re.source}`, "i").test(scope))
          : undefined;
        const qtyFrom = (w: string) => (w === "half a" ? 0.5 : w === "a" || w === "an" ? 1 : wordToNumber(w));

        const borrowedQty = numUnit ? qtyFrom(numUnit[1]) : /\ba (?:sleeve|case|bag)\b/i.test(scope) ? 1 : lastUnit ? 1 : null;
        const isOut =
          !/\balmost out\b/i.test(scope) &&
          (/\b(?:out of|ran out|run out|86(?:'?d)?)\b/i.test(scope) || new RegExp(`${def.re.source}[^.]*\\bout\\b|^out\\b`, "i").test(scope));

        if (short) {
          state = "low";
          facts.push(`Delivery short ${plural(qtyFrom(short[1]) ?? 1, short[2])}`);
        } else if (isOut) {
          state = "out";
          qty = 0;
        } else if (/\balmost out\b/i.test(scope)) {
          state = "low";
        } else if (borrowedBy) {
          if (lastUnit) {
            state = "out";
            qty = 0;
            inferences.push({ field: "On hand", value: "0", reason: `“${lastUnit[0]}” was lent out, so none are left`, material: true });
          } else {
            state = "ok";
          }
        } else if (borrowedFrom) {
          state = "low";
          inferences.push({ field: "Stock", value: "low", reason: "Borrowing implies the store was short", material: false });
        } else if (/\brestocked\b/i.test(scope)) {
          state = "ok";
        } else if (/\b(?:need to order|order more|order)\b/i.test(scope) && !numUnit && !atUnit) {
          state = "order";
        }
        if (qty === null && state !== "out" && !borrowedBy && !borrowedFrom && !short) {
          const q = numUnit ?? atUnit ?? leftUnit;
          if (q) {
            const n = qtyFrom(q[1]);
            if (n !== null) qty = n;
          }
        }
        const par = ctx.location.pars[def.key]?.qty ?? null;
        if (qty !== null && qty > 0 && state !== "order" && state !== "ok") {
          state = par !== null && qty >= par ? "ok" : "low";
        }
        if (borrowedBy) {
          transfer = { direction: "out", locationId: borrowedBy.id, qty: borrowedQty };
          facts.push(`Lent ${borrowedQty ? plural(borrowedQty, unitDefault) + " " : ""}to ${locName(borrowedBy.id)}`);
        } else if (borrowedFrom) {
          transfer = { direction: "in", locationId: borrowedFrom.id, qty: borrowedQty };
          facts.push(`Borrowed ${borrowedQty ? plural(borrowedQty, unitDefault) + " " : ""}from ${locName(borrowedFrom.id)}`);
        }
        if (qty !== null) facts.unshift(`${plural(qty, unitDefault)} on hand${par !== null ? ` (par ${par})` : ""}`);
        else if (state === "low" && par !== null) facts.push(`Par is ${plural(par, unitDefault)}`);
        const titleText =
          state === "out"
            ? `${def.label} out${transfer?.direction === "out" ? `, lent to ${locName(transfer.locationId)}` : ""}`
            : transfer?.direction === "in"
              ? `${def.label} borrowed from ${locName(transfer.locationId)}`
              : transfer?.direction === "out"
                ? `${def.label}: lent ${transfer.qty ? plural(transfer.qty, unitDefault) + " " : ""}to ${locName(transfer.locationId)}`
                : state === "ok"
                ? `${def.label} restocked`
                : state === "order"
                  ? `Order ${item}`
                  : qty !== null
                    ? `${def.label} down to ${plural(qty, unitDefault)}`
                    : `${def.label} running low${AGAIN.test(c) ? " again" : ""}`;
        const time = parseTimeOfDay(scope, ctx.shiftKind);
        const draft = newItem(
          {
            kind: "inventory",
            subtype: state === "order" ? "order" : "stock",
            topic: "stock",
            subjectKey: `stock:${def.key}`,
            title: titleText,
            severity: state === "out" ? "high" : state === "ok" ? "watch" : "normal",
            facts,
            inferences,
            fields: {
              itemKey: def.key,
              itemLabel: def.label,
              qty,
              unit: unitDefault,
              par,
              stockState: state,
              transfer,
              occurredAt: time ? at(ctx.shiftDate, minutesToHHMM(time.minutes)) : null,
            },
            evidence: [ev(clause, "primary")],
          },
          si,
        );
        produced.push(draft);
      }
    }

    // 3 · Customers
    const tableMatch = text.match(TABLE);
    if (CUSTOMER.test(text) || (tableMatch && /\b(?:says|wants|asked|called)\b/i.test(text))) {
      const num = tableMatch ? wordToNumber(tableMatch[1]) : null;
      const ref = num !== null ? `Table ${num}` : "Guest";
      const subtype: ItemSubtype = /\b(?:refund|charged twice|overcharged)\b/i.test(text)
        ? "refund"
        : /\b(?:complain|hair in|wrong order)\b/i.test(text)
          ? "complaint"
          : "callback";
      const dayRef = text.match(DAY_REF)?.[1];
      const handled = /\b(?:confirmed|sorted|taken care of|resolved|we comped|comped it|apologized)\b/i.test(text);
      const still = /\bstill\b/i.test(text);
      const topicLabel =
        subtype === "refund" ? `${dayRef ? capitalize(dayRef) + " " : ""}refund` : subtype === "complaint" ? "complaint" : /catering/i.test(text) ? "catering order" : "callback";
      const title =
        subtype === "refund"
          ? `${ref} refund ${still ? "still not received" : /started/i.test(text) ? "started" : "open"}`
          : subtype === "complaint"
            ? `${ref} complaint${handled ? " handled on the spot" : ""}`
            : `${ref} ${topicLabel}${handled ? " confirmed" : " needs a call back"}`;
      const facts: string[] = [];
      if (dayRef) facts.push(`Refund from ${capitalize(dayRef)}`);
      if (/\bcharged twice\b/i.test(text)) facts.push("Charged twice");
      if (/\bstarted a refund\b/i.test(text)) facts.push("Refund started by closing crew");
      if (still) facts.push("Guest says it still hasn't arrived");
      const item = newItem(
        {
          kind: "customer",
          subtype,
          topic: subtype === "refund" ? "customer_money" : "people",
          subjectKey: `customer:${num !== null ? `table-${num}` : `${subtype}-${si}`}`,
          title,
          severity: handled ? "watch" : subtype === "callback" ? "normal" : "high",
          facts,
          fields: { customerRef: ref, topicLabel, handled, handledNote: handled ? capitalize(text.replace(/[.]$/, "")) : undefined, again: still },
          evidence: [ev(s, "primary")],
        },
        si,
      );
      produced.push(item);
    }

    // 4 · Training
    const training = text.match(TRAINING);
    if (training) {
      const person = findPerson(text, ctx.roster);
      const topicText = `${training[1]} ${training[2]}`.toLowerCase();
      const name = person?.firstName ?? "A new hire";
      produced.push(
        newItem(
          {
            kind: "task",
            subtype: "training",
            topic: "people",
            subjectKey: `training:${slug(name)}-${slug(training[1])}`,
            title: `${name} needs the ${topicText}`,
            severity: "normal",
            facts: [],
            fields: { personName: name, topicLabel: topicText },
            evidence: [ev(s, "primary")],
          },
          si,
        ),
      );
    }

    // 5 · Staffing
    const staffing = text.match(STAFFING);
    if (staffing) {
      const person = findPerson(text, ctx.roster);
      produced.push(
        newItem(
          {
            kind: "task",
            subtype: "staffing",
            topic: "people",
            subjectKey: `staffing:${slug(person?.firstName ?? "crew")}-${ctx.shiftDate}`,
            title: `${person?.firstName ?? "A crew member"} ${staffing[1].toLowerCase() === "short one" ? "was out; line ran short" : "called out"}`,
            severity: "normal",
            facts: /short one|short-staffed|short staffed/i.test(text) ? ["Line ran one person short"] : [],
            fields: { personName: person?.firstName },
            evidence: [ev(s, "primary")],
          },
          si,
        ),
      );
    }

    // 6 · Safety
    if (SAFETY.test(text)) {
      const person = findPerson(text, ctx.roster);
      produced.push(
        newItem(
          {
            kind: "incident",
            subtype: "safety",
            topic: "safety",
            subjectKey: `safety:${slug(person?.firstName ?? "crew")}-${ctx.shiftDate}`,
            title: `${person?.firstName ?? "Crew member"} injured on shift`,
            severity: "high",
            facts: /first aid/i.test(text) ? ["First aid given"] : [],
            fields: { personName: person?.firstName, handled: /first aid|finished the shift/i.test(text) },
            evidence: [ev(s, "primary")],
          },
          si,
        ),
      );
    }

    // 7 · Owner / due phrases ("Luis needs to call them before lunch")
    const actionMatch =
      text.match(/\b([A-Z][a-zé]+)\s+(?:needs|has|is going|will need|should)\s+to\s+([^.]+)/) ??
      text.match(/\b(?:we|someone)\s+(?:need|needs|have|has)\s+to\s+([^.]+)/i);
    const owner = actionMatch && actionMatch.length === 3 ? ctx.roster.find((r) => r.firstName.toLowerCase() === actionMatch[1].toLowerCase()) ?? null : null;
    const due = resolveDue(text, ctx);
    const prev = builders[builders.length - 1];
    const prevItem = prev && prev.sentenceIndex >= si - 1 ? prev.item : null;

    if (produced.length === 0 && (actionMatch || due) && prevItem && PRONOUN.test(text)) {
      // Same sentence would also be a next-shift task; merge it into the item it refers to.
      prevItem.evidence.push(ev(s, "action"));
      prev.sentenceIndex = si;
      if (owner) prevItem.fields.ownerId = owner.id;
      if (due) {
        prevItem.fields.dueAt = due.dueAt;
        prevItem.fields.dueLabel = due.label;
        prevItem.inferences.push({ field: "Due", value: due.label, reason: due.reason, material: false });
      }
      if (!prevItem.mergedKinds.includes("task") && prevItem.kind !== "task") prevItem.mergedKinds.push("task");
      result.merges.push({ text, into: prevItem.title, also: "task" });
      if (actionMatch) {
        const verb = (actionMatch[2] ?? actionMatch[1]).replace(/\b(?:before|by)\b.*$/i, "").trim();
        prevItem.facts.push(`${owner ? owner.firstName + " to " : "To "}${verb.replace(/\bthem\b/i, "the guest")}${due ? " " + due.label : ""}`);
      }
      return;
    }

    if (produced.length > 0) {
      for (const p of produced) {
        if (hedge) {
          p.hedge = hedge;
          p.confidence = "uncertain";
          p.confidenceReason = `The closer hedged (“${hedge}”). Confirm before anyone acts on it.`;
        }
        if (owner && !p.fields.ownerId) p.fields.ownerId = owner.id;
        if (due && !p.fields.dueAt) {
          p.fields.dueAt = due.dueAt;
          p.fields.dueLabel = due.label;
          p.inferences.push({ field: "Due", value: due.label, reason: due.reason, material: false });
        }
        if (actionMatch && p.kind !== "task" && !p.mergedKinds.includes("task")) {
          p.mergedKinds.push("task");
          result.merges.push({ text, into: p.title, also: "task" });
        }
      }
      // A single sentence matching both a customer and stock category stays two items only if
      // their subjects differ; same-subject duplicates are folded by dedupeDrafts below.
      return;
    }

    // 8 · Continuations ("Bri shut it down for ten minutes and it came back…")
    if (prevItem && (PRONOUN.test(text) || relatesTo(prevItem, lower))) {
      const facts = prevItem.facts;
      const duration = parseDurationMinutes(text);
      let role: DraftEvidence["role"] = "context";
      if (duration) {
        prevItem.fields.laborMinutes = (prevItem.fields.laborMinutes ?? 0) + duration.minutes;
        facts.push(/shut (?:it )?down/i.test(text) ? `Shut down ${duration.minutes} min` : `${duration.minutes} min of crew time`);
      }
      if (RECOVERY.test(text) || /\bheld\b/i.test(text)) {
        prevItem.fields.recovery = "temporary";
        facts.push(/came back/i.test(text) ? "Came back after restart (temporary)" : /held/i.test(text) ? "Held after adjustment" : /plugged it back in/i.test(text) ? "Probe plugged back in" : "Restarted");
      }
      const bin = lower.match(/\b(bin|bucket|hopper)\b[^.]*\b(half|quarter|mostly)\s+(full|empty)\b/);
      if (bin) facts.push(`${capitalize(bin[1])} only ${bin[2]} ${bin[3]}`);
      const temp = lower.match(new RegExp(`\\btemp(?:erature)? was (${NUMBER_WORD}(?:\\s+${NUMBER_WORD})?)`));
      if (temp) {
        const v = parseCompound(temp[1].split(/\s+/));
        if (v) facts.push(`Actual temp ${v.value}°F`);
      }
      if (/\bprobe was unplugged\b/i.test(text)) facts.push("Probe was unplugged");
      if (HANDLED.test(text) || /\blocked\b/i.test(text)) {
        prevItem.fields.handled = true;
        prevItem.fields.handledNote = capitalize(text.replace(/[.]$/, ""));
        facts.push(/locked/i.test(text) ? "Door manually confirmed locked" : "Handled by closing crew");
        role = "handled";
        if (prevItem.subtype === "security") prevItem.severity = "watch";
      }
      prevItem.evidence.push(ev(s, role));
      prev.sentenceIndex = si;
      return;
    }

    if (KUDOS.test(text)) return; // kept as a crew note
    result.unmapped.push(s);
  });

  // Finalize: confidence from material inferences, task proposals, dedupe.
  for (const { item } of builders) {
    if (item.confidence === "high" && item.inferences.some((i) => i.material)) {
      item.confidence = "review";
      item.confidenceReason = item.inferences.find((i) => i.material)!.reason + ". Confirm the number.";
    }
    if (item.fields.handled && item.subtype === "security") item.severity = "watch";
    item.task = proposeTask(item, ctx);
  }

  result.items = dedupeDrafts(builders.map((b) => b.item));
  return result;
}

function relatesTo(item: DraftItem, lower: string): boolean {
  if (item.topic === "refrigeration" || item.topic === "cooking") return /\b(?:temp|reading|probe|bin|thermostat)\b/.test(lower);
  if (item.subtype === "security") return /\b(?:door|lock|locked)\b/.test(lower) || SECURITY_GENERIC.test(lower);
  if (item.kind === "customer") return /\b(?:refund|call|guest)\b/.test(lower);
  return false;
}

function locName(id: string): string {
  return id === "loc-dtn" ? "Downtown" : id === "loc-ngt" ? "Northgate" : id === "loc-cyp" ? "Canyon Plaza" : "another store";
}

function fmt12(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** One proposed next-shift task per item, worded for the person who has to do it. */
export function proposeTask(item: DraftItem, ctx: ExtractionContext): TaskProposal | null {
  const f = item.fields;
  const dueAt = f.dueAt ?? null;
  const dueLabel = f.dueLabel ?? null;
  const fromRushQuestion = ctx.rushQuestionId && item.evidence.some((e) => e.questionId === ctx.rushQuestionId);
  if (item.kind === "maintenance") {
    if (f.assertion === "ok" || f.handled) return null;
    const failure = FAILURE.find((x) => item.title.toLowerCase().includes(x.phrase));
    return {
      title: `Check ${f.assetLabel?.toLowerCase()} before open; book service if ${failure?.ifPhrase ?? "it acts up again"}`,
      detail: item.facts.join(" · "),
      kind: "service",
      ownerId: f.ownerId ?? null,
      dueAt: dueAt ?? at(ctx.nextOpenDate, ctx.location.doorsOpen),
      dueLabel: dueLabel ?? "before opening",
    };
  }
  if (item.kind === "customer") {
    if (f.handled) return null;
    const ref = f.customerRef ?? "the guest";
    const title =
      item.subtype === "refund"
        ? `Call ${ref} about the ${f.topicLabel ?? "refund"}`
        : item.subtype === "complaint"
          ? `Follow up with ${ref} about their complaint`
          : `Call ${ref} back about the ${f.topicLabel ?? "request"}`;
    return {
      title,
      detail: item.facts.join(" · "),
      kind: "call",
      ownerId: f.ownerId ?? null,
      dueAt: dueAt ?? at(ctx.nextOpenDate, ctx.location.lunchRush),
      dueLabel: dueLabel ?? "before lunch",
    };
  }
  if (item.subtype === "training") {
    const topic = (f.topicLabel ?? "training").replace(/\s+walkthrough$/, "");
    return {
      title: `Walk ${f.personName} through the ${topic}`,
      detail: "Answered under “before the next rush”.",
      kind: "training",
      ownerId: f.ownerId ?? null,
      dueAt: dueAt ?? at(ctx.nextOpenDate, fromRushQuestion ? ctx.location.lunchRush : ctx.location.doorsOpen),
      dueLabel: dueLabel ?? (fromRushQuestion ? "before lunch" : "before opening"),
    };
  }
  if (item.subtype === "staffing") {
    return {
      title: `Confirm coverage for ${f.personName ?? "the open shift"}`,
      detail: item.facts.join(" · "),
      kind: "staffing",
      ownerId: f.ownerId ?? null,
      dueAt: dueAt ?? at(ctx.nextOpenDate, "07:00"),
      dueLabel: dueLabel ?? "first thing",
    };
  }
  if (item.kind === "incident" && item.subtype === "security") {
    if (f.handled) return null;
    return {
      title: `Test the ${f.assetLabel?.toLowerCase() ?? "door"} and log the result`,
      detail: item.facts.join(" · "),
      kind: "follow_up",
      ownerId: f.ownerId ?? null,
      dueAt: dueAt ?? at(ctx.nextOpenDate, ctx.location.doorsOpen),
      dueLabel: dueLabel ?? "before opening",
    };
  }
  // Inventory tasks come from the "below par → order-prep" rule, aggregated per store.
  return null;
}

/**
 * Fold drafts that describe the same subject within one closeout
 * (e.g. "ice machine" mentioned in two answers) into one item.
 */
export function dedupeDrafts(items: DraftItem[]): DraftItem[] {
  const out: DraftItem[] = [];
  const bySubject = new Map<string, DraftItem>();
  for (const item of items) {
    const existing = bySubject.get(item.subjectKey);
    if (!existing) {
      bySubject.set(item.subjectKey, item);
      out.push(item);
      continue;
    }
    for (const e of item.evidence) {
      if (!existing.evidence.some((x) => x.start === e.start && x.end === e.end)) existing.evidence.push({ ...e, role: e.role === "primary" ? "context" : e.role });
    }
    existing.facts.push(...item.facts.filter((f) => !existing.facts.includes(f)));
    existing.inferences.push(...item.inferences);
    existing.severity = maxSeverity(existing.severity, item.severity);
    existing.confidence = minConfidence(existing.confidence, item.confidence);
    if (!existing.mergedKinds.includes(item.kind) && item.kind !== existing.kind) existing.mergedKinds.push(item.kind);
    const merged: ItemFields = { ...existing.fields };
    for (const [k, v] of Object.entries(item.fields) as [keyof ItemFields, ItemFields[keyof ItemFields]][]) {
      if (v === undefined || v === null) continue;
      if (k === "laborMinutes") continue;
      if (merged[k] === undefined || merged[k] === null) (merged as Record<string, unknown>)[k] = v;
    }
    if (item.fields.laborMinutes) merged.laborMinutes = (existing.fields.laborMinutes ?? 0) + item.fields.laborMinutes;
    existing.fields = merged;
  }
  return out;
}

export const ruleBasedExtractor: Extractor = { extract: extractTranscript };

export { addDays };
