"use client";

import { useMemo, useState } from "react";
import { FlaskConical, Pencil, Plus, Trash2, X } from "lucide-react";
import { useStore } from "@/store/store";
import { useCurrentUser, useDb } from "@/store/hooks";
import { buildExtractionContext, deleteRule, saveRule, toggleRule } from "@/domain/commands";
import { applyRules, summarizeRule, toEvaluable, ROLE_LABEL } from "@/domain/rules/evaluate";
import { ruleBasedExtractor, type DraftItem } from "@/domain/extraction/extract";
import { joinAnswers } from "@/domain/extraction/segment";
import { RULE_TOPICS, STOCK } from "@/domain/extraction/lexicon";
import { RuleFormSchema, fieldErrors } from "@/domain/schemas";
import { can, ROLE_TITLE } from "@/domain/permissions";
import { PRIMARY_TRANSCRIPT, SAMPLE_TRANSCRIPTS } from "@/data/transcripts";
import type { EscalationRule, Role, RuleAction, RuleCondition, RuleTopic, Severity } from "@/domain/types";
import { Button, SectionHeading, SeverityTag, StatusLight, cx } from "@/components/ui/primitives";
import { Field, Input, Select, Switch, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { PermissionDenied } from "@/components/ui/states";
import { fmtDateTime } from "@/domain/time";

type Draft = { id?: string; name: string; condition: RuleCondition; actions: RuleAction[]; locationIds: string[] | "all"; enabled: boolean };

const BLANK: Draft = { name: "", condition: { type: "mentions", topic: "refrigeration" }, actions: [{ type: "set_severity", severity: "high" }], locationIds: "all", enabled: true };

const SAMPLES = [
  { id: "primary", label: "Tonight's Downtown closeout", locationId: "loc-dtn", text: PRIMARY_TRANSCRIPT },
  ...SAMPLE_TRANSCRIPTS.map((s) => ({ id: s.id, label: s.label, locationId: s.locationId, text: s.text })),
  { id: "custom", label: "Write your own", locationId: "loc-dtn", text: "" },
];

export function RuleBuilder() {
  const db = useDb();
  const me = useCurrentUser();
  const dispatch = useStore((s) => s.dispatch);
  const editable = can(me, "edit_rules");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<EscalationRule | null>(null);
  const names = Object.fromEntries(Object.values(db.locations).map((l) => [l.id, l.name]));
  const rules = Object.values(db.rules).sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));

  if (!can(me, "view_rules")) return <PermissionDenied permission="edit_rules" what="Escalation rules" role={ROLE_TITLE[me.role]} />;

  const save = () => {
    if (!draft) return;
    const r = RuleFormSchema.safeParse(draft);
    if (!r.success) return setErrors(fieldErrors(r.error));
    dispatch(saveRule, { rule: { ...(r.data as Omit<EscalationRule, "orgId" | "createdById" | "updatedAt" | "id">), id: draft.id } }, { undoable: true, label: `Save rule “${r.data.name}”` });
    setDraft(null);
    setErrors({});
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-[2.4rem] font-bold leading-none tracking-wide sm:text-6xl">Rules and escalation</h1>
          <p className="mt-3 text-steel-300">Plain-language rules that run on every closeout before anyone reads it. Test them against real closeouts before you turn them on.</p>
        </div>
        {editable ? (
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => {
              setDraft({ ...BLANK });
              setErrors({});
            }}
          >
            New rule
          </Button>
        ) : (
          <p className="text-sm text-steel-400">Only the area manager can change rules. You can test them.</p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section aria-labelledby="rules-list" className="flex flex-col gap-3">
          <SectionHeading id="rules-list" aside={<span className="text-sm text-steel-400">{rules.filter((r) => r.enabled).length} on</span>}>
            Active rules
          </SectionHeading>
          {rules.map((r) => (
            <article key={r.id} className={cx("panel px-4 py-3.5", !r.enabled && "opacity-70", draft?.id === r.id && "border-safety/70")}>
              <div className="flex items-start gap-3">
                <StatusLight tone={r.enabled ? "ok" : "normal"} off={!r.enabled} size={10} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-paper-100">{r.name}</p>
                  <p className="mt-0.5 text-[0.95rem] text-steel-300">{summarizeRule(r, names)}</p>
                  <p className="mt-1 text-xs text-steel-500">Updated {fmtDateTime(r.updatedAt)} by {db.users[r.createdById]?.name ?? "Jordan Cole"}</p>
                </div>
              </div>
              {editable && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-night-600 pt-3">
                  <Switch checked={r.enabled} onChange={() => dispatch(toggleRule, { ruleId: r.id }, { undoable: true, label: `Toggle “${r.name}”` })} label={<span className="text-sm">{r.enabled ? "On" : "Off"}</span>} />
                  <span className="ml-auto flex gap-2">
                    <Button
                      size="sm"
                      icon={<Pencil size={14} />}
                      onClick={() => {
                        setDraft({ id: r.id, name: r.name, condition: structuredClone(r.condition), actions: structuredClone(r.actions), locationIds: r.locationIds === "all" ? "all" : [...r.locationIds], enabled: r.enabled });
                        setErrors({});
                      }}
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(r)} aria-label={`Delete ${r.name}`}>
                      Delete
                    </Button>
                  </span>
                </div>
              )}
            </article>
          ))}
        </section>

        <div className="flex flex-col gap-6">
          {draft && editable && (
            <section aria-labelledby="builder" className="panel-raised p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 id="builder" className="font-display text-2xl font-semibold tracking-wide">
                  {draft.id ? "Edit rule" : "New rule"}
                </h2>
                <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-steel-400 hover:bg-night-600" onClick={() => setDraft(null)} aria-label="Close builder">
                  <X size={18} />
                </button>
              </div>
              <Builder draft={draft} setDraft={setDraft} errors={errors} />
              <p className="mt-5 rounded-lg border border-night-500 bg-night-900 px-4 py-3 font-display text-xl leading-snug tracking-wide text-paper-50" aria-live="polite">
                {summarizeRule(draft, names)}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button onClick={() => setDraft(null)}>Cancel</Button>
                <Button variant="primary" onClick={save}>
                  {draft.id ? "Save rule" : "Create rule"}
                </Button>
              </div>
            </section>
          )}
          <TestPanel draft={draft} />
        </div>
      </div>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="Closeouts already processed keep the severity and tasks this rule gave them. New closeouts won't use it."
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Keep rule</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleting) dispatch(deleteRule, { ruleId: deleting.id }, { undoable: true, label: `Delete “${deleting.name}”` });
                setDeleting(null);
              }}
            >
              Delete rule
            </Button>
          </>
        }
      />
    </div>
  );
}

function Builder({ draft, setDraft, errors }: { draft: Draft; setDraft: (d: Draft) => void; errors: Record<string, string> }) {
  const db = useDb();
  const c = draft.condition;
  const setCondType = (type: RuleCondition["type"]) => {
    const next: RuleCondition = type === "mentions" ? { type, topic: "refrigeration" } : type === "below_par" ? { type, itemKey: "any" } : type === "open_at" ? { type, subject: "refund", time: "09:00" } : { type };
    setDraft({ ...draft, condition: next });
  };
  const setAction = (i: number, a: RuleAction) => setDraft({ ...draft, actions: draft.actions.map((x, j) => (j === i ? a : x)) });
  return (
    <div className="flex flex-col gap-5">
      <Field label="Rule name" htmlFor="rb-name" error={errors.name}>
        <Input id="rb-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Walk-in temperature is critical" />
      </Field>

      <fieldset className="rounded-lg border border-night-500 p-3.5">
        <legend className="px-1.5 font-display text-sm font-bold uppercase tracking-[0.14em] text-safety">When</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Something happens" htmlFor="rb-ct">
            <Select id="rb-ct" value={c.type} onChange={(e) => setCondType(e.target.value as RuleCondition["type"])}>
              <option value="mentions">A topic is mentioned</option>
              <option value="below_par">Stock is below par</option>
              <option value="open_at">Something is still open at a time</option>
              <option value="uncertain">The closer sounds unsure</option>
            </Select>
          </Field>
          {c.type === "mentions" && (
            <Field label="Topic" htmlFor="rb-topic">
              <Select id="rb-topic" value={c.topic} onChange={(e) => setDraft({ ...draft, condition: { type: "mentions", topic: e.target.value as RuleTopic } })}>
                {Object.entries(RULE_TOPICS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {c.type === "below_par" && (
            <Field label="Item" htmlFor="rb-item">
              <Select id="rb-item" value={c.itemKey} onChange={(e) => setDraft({ ...draft, condition: { type: "below_par", itemKey: e.target.value } })}>
                <option value="any">Any item</option>
                {STOCK.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {c.type === "open_at" && (
            <>
              <Field label="What" htmlFor="rb-subj">
                <Select id="rb-subj" value={c.subject} onChange={(e) => setDraft({ ...draft, condition: { ...c, subject: e.target.value as "refund" | "customer" | "any_task" } })}>
                  <option value="refund">A customer refund</option>
                  <option value="customer">Any customer follow-up</option>
                  <option value="any_task">Any task</option>
                </Select>
              </Field>
              <Field label="Still open at" htmlFor="rb-time" error={errors["condition.time"]}>
                <Input id="rb-time" type="time" value={c.time} onChange={(e) => setDraft({ ...draft, condition: { ...c, time: e.target.value } })} />
              </Field>
            </>
          )}
        </div>
        <div className="mt-3">
          <Field label="At" htmlFor="rb-scope" error={errors.locationIds}>
            <Select
              id="rb-scope"
              value={draft.locationIds === "all" ? "all" : draft.locationIds[0]}
              onChange={(e) => setDraft({ ...draft, locationIds: e.target.value === "all" ? "all" : [e.target.value] })}
            >
              <option value="all">Every store</option>
              {Object.values(db.locations).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} only
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </fieldset>

      <fieldset className="rounded-lg border border-night-500 p-3.5">
        <legend className="px-1.5 font-display text-sm font-bold uppercase tracking-[0.14em] text-safety">Then</legend>
        <ol className="flex flex-col gap-3">
          {draft.actions.map((a, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <Field label={i === 0 ? "Do this" : "And"} htmlFor={`rb-a-${i}`} className="min-w-44 flex-1">
                <Select
                  id={`rb-a-${i}`}
                  value={a.type}
                  onChange={(e) => {
                    const t = e.target.value as RuleAction["type"];
                    setAction(i, t === "set_severity" ? { type: t, severity: "critical" } : t === "notify" ? { type: t, role: "area_manager", channel: "sms" } : t === "create_task" ? { type: t, template: "order_prep" } : t === "escalate" ? { type: t, role: "area_manager" } : { type: t });
                  }}
                >
                  <option value="set_severity">Set severity</option>
                  <option value="notify">Notify someone</option>
                  <option value="escalate">Escalate</option>
                  <option value="create_task">Create a task</option>
                  <option value="require_confirmation">Require a person to confirm</option>
                </Select>
              </Field>
              {a.type === "set_severity" && (
                <Select aria-label="Severity" className="w-36" value={a.severity} onChange={(e) => setAction(i, { ...a, severity: e.target.value as Severity })}>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="watch">Watch</option>
                </Select>
              )}
              {(a.type === "notify" || a.type === "escalate") && (
                <Select aria-label="Who" className="w-44" value={a.role} onChange={(e) => setAction(i, { ...a, role: e.target.value as Role })}>
                  {(["area_manager", "opening_manager", "closing_manager", "kitchen_lead"] as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r].replace(/^./, (x) => x.toUpperCase())}
                    </option>
                  ))}
                </Select>
              )}
              {a.type === "notify" && (
                <Select aria-label="How" className="w-36" value={a.channel} onChange={(e) => setAction(i, { ...a, channel: e.target.value as "sms" })}>
                  <option value="sms">By text</option>
                  <option value="push">By push</option>
                  <option value="team_chat">In team chat</option>
                  <option value="email">By email</option>
                </Select>
              )}
              {a.type === "create_task" && (
                <Select aria-label="Task" className="w-44" value={a.template} onChange={(e) => setAction(i, { ...a, template: e.target.value as "order_prep" })}>
                  <option value="order_prep">Order prep</option>
                  <option value="service_call">Service call</option>
                  <option value="callback">Call-back</option>
                </Select>
              )}
              <button type="button" className="grid h-10 w-10 place-items-center rounded-lg text-steel-400 hover:bg-night-600 hover:text-signal disabled:opacity-30" disabled={draft.actions.length === 1} onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, j) => j !== i) })} aria-label="Remove this action">
                <X size={16} />
              </button>
            </li>
          ))}
        </ol>
        {errors.actions && <p className="mt-2 text-sm text-signal">{errors.actions}</p>}
        <Button size="sm" variant="ghost" className="mt-3" icon={<Plus size={14} />} onClick={() => setDraft({ ...draft, actions: [...draft.actions, { type: "notify", role: "area_manager", channel: "sms" }] })} disabled={draft.actions.length >= 4}>
          Add another action
        </Button>
      </fieldset>
    </div>
  );
}

function TestPanel({ draft }: { draft: Draft | null }) {
  const db = useDb();
  const [sample, setSample] = useState("primary");
  const [custom, setCustom] = useState("Walk-in cooler reading forty two around ten. Jess cut her finger on the slicer, first aid done.");
  const [compareAll, setCompareAll] = useState(draft === null);
  const s = SAMPLES.find((x) => x.id === sample)!;
  const text = sample === "custom" ? custom : s.text;
  const names = Object.fromEntries(Object.values(db.locations).map((l) => [l.id, l.name]));

  const result = useMemo(() => {
    if (!text.trim()) return null;
    const handoffLike = { id: "test", locationId: s.locationId, shiftInstanceId: "", createdAt: "2026-10-20T22:40:00Z", answers: joinAnswers([{ questionId: null, prompt: "Test", text, durationSec: 0, source: "typed" }]).answers } as never;
    const ctx = { ...buildExtractionContext(db, handoffLike), shiftKind: "close" as const, shiftDate: "2026-10-20", nextOpenDate: "2026-10-21" };
    const extracted = ruleBasedExtractor.extract(text, ctx);
    const draftRule: EscalationRule | null = draft ? { ...draft, id: draft.id ?? "draft", orgId: "", createdById: "", updatedAt: "", enabled: true } : null;
    const rules = [...(compareAll || !draftRule ? Object.values(db.rules).filter((r) => r.id !== draftRule?.id) : []), ...(draftRule ? [draftRule] : [])];
    return {
      rules,
      draftRule,
      rows: extracted.items.map((item: DraftItem) => ({ item, outcome: applyRules(rules, toEvaluable(item, item.evidence.map((e) => e.text)), s.locationId) })),
    };
  }, [db, text, s.locationId, draft, compareAll]);

  const timed = result?.rules.filter((r) => r.condition.type === "open_at") ?? [];

  return (
    <section aria-labelledby="test" className="panel p-4 sm:p-5">
      <h2 id="test" className="flex items-center gap-2 font-display text-2xl font-semibold tracking-wide">
        <FlaskConical size={20} className="text-safety" /> Test panel
      </h2>
      <p className="mt-1 text-sm text-steel-400">{draft ? "Runs the rule you're editing against a sample closeout. Nothing is saved." : "Runs every active rule against a sample closeout. Nothing is saved."}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Sample closeout" htmlFor="tp-sample">
          <Select id="tp-sample" value={sample} onChange={(e) => setSample(e.target.value)}>
            {SAMPLES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </Select>
        </Field>
        {draft && <Switch checked={compareAll} onChange={setCompareAll} label={<span className="text-sm">Include other rules</span>} />}
      </div>
      {sample === "custom" ? (
        <Textarea aria-label="Your sample closeout" value={custom} onChange={(e) => setCustom(e.target.value)} className="mt-3 min-h-24" />
      ) : (
        <blockquote tabIndex={0} aria-label="Sample closeout text" className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-night-600 bg-night-900 px-3 py-2.5 text-sm leading-relaxed text-steel-300">{text}</blockquote>
      )}
      {result && (
        <ul className="mt-4 flex flex-col gap-2">
          {result.rows.map(({ item, outcome }) => {
            const fired = outcome.hits.length > 0;
            return (
              <li key={item.key} className={cx("rounded-lg border px-3 py-2.5", fired ? "border-safety/50 bg-safety-900/30" : "border-night-600")}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium text-paper-100">{item.title}</span>
                  {outcome.severity !== item.severity ? (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <SeverityTag severity={item.severity} className="opacity-60" /> → <SeverityTag severity={outcome.severity} />
                    </span>
                  ) : (
                    <SeverityTag severity={item.severity} />
                  )}
                </div>
                {fired ? (
                  <ul className="mt-1 text-sm text-steel-300">
                    {outcome.hits.map((h) => (
                      <li key={h.ruleId}>
                        <span className={cx("font-semibold", h.ruleId === result.draftRule?.id ? "text-safety" : "text-paper-100")}>{result.rules.find((r) => r.id === h.ruleId)?.name || "This rule"}</span> fires on “{h.matched}”
                        {outcome.notify.length > 0 && h.ruleId === outcome.notify[0]?.ruleId && ` · notifies the ${ROLE_LABEL[outcome.notify[0].role]}`}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-sm text-steel-500">No rule fires.</p>
                )}
                <p className="mt-1 truncate font-mono text-[0.7rem] text-steel-500">“{item.evidence[0]?.text}”</p>
              </li>
            );
          })}
          {timed.map((r) => (
            <li key={r.id} className="rounded-lg border border-dashed border-amber/50 px-3 py-2.5 text-sm text-steel-300">
              <span className="font-semibold text-amber">{r.name}</span> watches tasks over time. {summarizeRule(r, names)}{" "}
              {result.rows.some((x) => x.item.subtype === "refund") ? "With this closeout it would watch the refund call and escalate at that time if nobody resolves it." : "Nothing in this closeout would be watched."}
            </li>
          ))}
          {result.rows.length === 0 && <li className="text-sm text-steel-400">Nothing extracted from this text, so no rule can fire.</li>}
        </ul>
      )}
    </section>
  );
}
