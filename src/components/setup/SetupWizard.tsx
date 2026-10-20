"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Plus, X } from "lucide-react";
import { useStore } from "@/store/store";
import { useDb, useCan } from "@/store/hooks";
import { Wordmark } from "@/components/ui/brand";
import { Avatar, Button, Mono, Stamp, StatusLight, cx } from "@/components/ui/primitives";
import { Checkbox, Field, Input, Select, Switch } from "@/components/ui/form";
import { ShiftLine } from "@/components/ui/ShiftLine";
import { BriefReceipt } from "@/components/briefing/BriefReceipt";
import { PermissionDenied } from "@/components/ui/states";
import {
  activeQuestions,
  completeSetup,
  inviteUser,
  saveSetupStep,
  setDemo,
  setQuestions,
  toggleRule,
  updateLocation,
  updateNotificationPrefs,
  updateOrganization,
  updateSettings,
  updateShiftTemplate,
} from "@/domain/commands";
import { CompanySchema, InviteSchema, LocationFormSchema, QuestionsSchema, ShiftFormSchema, ThresholdsSchema, fieldErrors } from "@/domain/schemas";
import { summarizeRule } from "@/domain/rules/evaluate";
import { composeBriefing } from "@/domain/briefing";
import { ROLE_TITLE } from "@/domain/permissions";
import { fmtHHMM, hhmmToMinutes } from "@/domain/time";
import type { Channel, Role } from "@/domain/types";

const STEPS = [
  { title: "Company and stores", short: "Company" },
  { title: "Shifts and handoff times", short: "Shifts" },
  { title: "The five closeout questions", short: "Questions" },
  { title: "Escalation and severity", short: "Escalation" },
  { title: "Recipients and first brief", short: "Recipients" },
];

const INDUSTRIES = ["Fast-casual restaurants", "Full-service restaurants", "Retail stores", "Warehouse and distribution", "Fabrication shop", "Field-service depot"];

export function SetupWizard() {
  const db = useDb();
  const canSetup = useCan("run_setup");
  const router = useRouter();
  const dispatch = useStore((s) => s.dispatch);
  const [step, setStep] = useState(() => Math.min(db.setup.step, 4));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [resumedAt] = useState(() => (db.setup.step > 0 && !db.setup.completedAt ? db.setup.step : null));

  // Drafts are initialised once from the store; nothing is written until a step validates.
  const [company, setCompany] = useState({ name: db.organization.name, industry: db.organization.industry });
  const [stores, setStores] = useState(() => Object.values(db.locations).map((l) => ({ id: l.id, name: l.name, address: l.address, doorsOpen: l.doorsOpen, lunchRush: l.lunchRush })));
  const tpl = (kind: "open" | "close") => Object.values(db.shiftTemplates).find((t) => t.locationId === "loc-dtn" && t.kind === kind)!;
  const [shift, setShift] = useState({ openStart: tpl("open").start, openEnd: tpl("open").end, closeStart: tpl("close").start, closeEnd: tpl("close").end, closeoutDue: tpl("close").handoffAt, briefAt: tpl("open").handoffAt });
  const [questions, setQs] = useState(() => activeQuestions(db).map((q) => ({ prompt: q.prompt, hint: q.hint })));
  const [custom, setCustom] = useState("");
  const [thresholds, setThresholds] = useState(db.settings.thresholds);
  const [ruleOn, setRuleOn] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.values(db.rules).map((r) => [r.id, r.enabled])));
  const recipients = Object.values(db.users).filter((u) => u.appUser && u.locationIds.includes("loc-dtn") && u.role !== "closing_manager");
  const [gets, setGets] = useState<Record<string, boolean>>(() => Object.fromEntries(recipients.map((u) => [u.id, u.notifications.briefingReady.length > 0])));
  const [invite, setInvite] = useState({ name: "", role: "opening_manager" as Role, locationId: "loc-dtn", contact: "" });
  const [invited, setInvited] = useState<string[]>([]);

  const preview = useMemo(() => composeBriefing(db, "loc-dtn", "2026-10-16T06:15:00Z"), [db]);

  if (!canSetup) return <PermissionDenied permission="run_setup" what="Workspace setup" role={ROLE_TITLE[db.users[db.demo.currentUserId].role]} />;

  const validate = (): boolean => {
    let result;
    if (step === 0) {
      const c = CompanySchema.safeParse(company);
      const errs: Record<string, string> = c.success ? {} : fieldErrors(c.error);
      stores.forEach((s, i) => {
        const r = LocationFormSchema.safeParse(s);
        if (!r.success) for (const [k, v] of Object.entries(fieldErrors(r.error))) errs[`stores.${i}.${k}`] = v;
      });
      setErrors(errs);
      return Object.keys(errs).length === 0;
    }
    if (step === 1) {
      result = ShiftFormSchema.safeParse(shift);
      const errs: Record<string, string> = result.success ? {} : fieldErrors(result.error);
      stores.forEach((s, i) => {
        const r = LocationFormSchema.safeParse(s);
        if (!r.success) for (const [k, v] of Object.entries(fieldErrors(r.error))) errs[`stores.${i}.${k}`] = v;
      });
      setErrors(errs);
      return Object.keys(errs).length === 0;
    }
    if (step === 2) result = QuestionsSchema.safeParse(questions);
    if (step === 3) result = ThresholdsSchema.safeParse(thresholds);
    if (!result) return true;
    setErrors(result.success ? {} : fieldErrors(result.error));
    return result.success;
  };

  const commit = () => {
    const opts = { silent: true };
    if (step === 0) {
      dispatch(updateOrganization, company, opts);
      stores.forEach((s) => dispatch(updateLocation, { locationId: s.id, patch: { name: s.name.trim(), address: s.address.trim() } }, opts));
    }
    if (step === 1) {
      for (const t of Object.values(db.shiftTemplates)) {
        dispatch(updateShiftTemplate, { templateId: t.id, patch: t.kind === "open" ? { start: shift.openStart, end: shift.openEnd, handoffAt: shift.briefAt } : { start: shift.closeStart, end: shift.closeEnd, handoffAt: shift.closeoutDue } }, opts);
      }
      stores.forEach((s) => dispatch(updateLocation, { locationId: s.id, patch: { doorsOpen: s.doorsOpen, lunchRush: s.lunchRush } }, opts));
    }
    if (step === 2) dispatch(setQuestions, { questions }, opts);
    if (step === 3) {
      dispatch(updateSettings, { settings: { ...db.settings, thresholds: ThresholdsSchema.parse(thresholds) } }, opts);
      for (const r of Object.values(db.rules)) if (r.enabled !== ruleOn[r.id]) dispatch(toggleRule, { ruleId: r.id }, opts);
    }
    if (step === 4) {
      for (const u of recipients) {
        const want = gets[u.id];
        const has = u.notifications.briefingReady.length > 0;
        if (want !== has) dispatch(updateNotificationPrefs, { userId: u.id, prefs: { ...u.notifications, briefingReady: want ? (["push"] as Channel[]) : [] } }, opts);
      }
    }
    dispatch(saveSetupStep, { step: step + 1 }, { ...opts, local: true });
  };

  const next = () => {
    if (!validate()) return;
    commit();
    if (step < 4) {
      setStep(step + 1);
      setErrors({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      dispatch(completeSetup, { skipped: false }, { toastMessage: `${company.name} is set up` });
      dispatch(setDemo, { currentUserId: "u-maya", currentLocationId: "loc-dtn" }, { silent: true, local: true });
      router.push("/capture");
    }
  };

  const skip = () => {
    dispatch(completeSetup, { skipped: true }, { toastMessage: "Skipped setup. Nightjar defaults are in place." });
    dispatch(setDemo, { currentUserId: "u-maya", currentLocationId: "loc-dtn" }, { silent: true, local: true });
    router.push("/capture");
  };

  const sendInvite = () => {
    const r = InviteSchema.safeParse(invite);
    if (!r.success) {
      setErrors(Object.fromEntries(Object.entries(fieldErrors(r.error)).map(([k, v]) => [`invite.${k}`, v])));
      return;
    }
    dispatch(inviteUser, { name: r.data.name, role: r.data.role, locationIds: [r.data.locationId], contact: r.data.contact });
    setInvited((x) => [...x, r.data.name]);
    setInvite({ name: "", role: "opening_manager", locationId: "loc-dtn", contact: "" });
    setErrors({});
  };

  const focus = (["all", "all", "close", "ghost", "open"] as const)[step];

  return (
    <div className="min-h-dvh pb-28">
      <header className="sticky top-0 z-30 border-b border-night-700 bg-night-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-8">
          <Link href="/" aria-label="Back to demo home">
            <Wordmark size="sm" />
          </Link>
          <span className="hidden text-sm text-steel-400 sm:inline">Workspace setup</span>
          <button type="button" onClick={skip} className="ml-auto text-sm text-steel-300 underline-offset-4 hover:text-paper-100 hover:underline">
            Skip setup, use Nightjar defaults
          </button>
        </div>
        <ol className="mx-auto grid max-w-6xl grid-cols-5 gap-1.5 px-4 pb-3 sm:px-8" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s.short} aria-current={i === step ? "step" : undefined}>
              <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step} className="flex w-full flex-col gap-1.5 text-left disabled:cursor-default">
                <span className={cx("h-1.5 rounded-full", i < step ? "bg-steel-300" : i === step ? "bg-safety" : "bg-night-600")} />
                <span className={cx("truncate text-xs", i === step ? "text-paper-100" : "text-steel-500")}>
                  <span className="font-mono">{i + 1}</span> <span className="hidden sm:inline">{s.short}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pt-8 sm:px-8">
        {resumedAt !== null && step === resumedAt && (
          <p className="mb-5 inline-flex items-center gap-2 rounded-md border border-night-600 bg-night-800 px-3 py-1.5 text-sm text-steel-300">
            <StatusLight tone="amber" size={8} /> Picked up where you left off: step {step + 1} of 5.
          </p>
        )}
        <ShiftLine
          focus={focus}
          closeTime={`${fmtHHMM(shift.closeoutDue)} closeout`}
          openTime={`${fmtHHMM(shift.briefAt)} brief`}
          className="mb-14"
        />

        <AnimatePresence mode="wait">
          <motion.section
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            aria-labelledby="step-title"
          >
            <p className="font-mono text-sm text-steel-500">Step {step + 1} of 5</p>
            <h1 id="step-title" className="mb-6 mt-1 font-display text-4xl font-semibold tracking-wide sm:text-5xl">
              {STEPS[step].title}
            </h1>

            {step === 0 && (
              <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
                <div className="flex flex-col gap-4">
                  <Field label="Company name" htmlFor="co-name" error={errors.name}>
                    <Input id="co-name" value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} aria-invalid={Boolean(errors.name)} />
                  </Field>
                  <Field label="What kind of operation is it?" htmlFor="co-ind" hint="Shift Ghost tunes its vocabulary to the work: fryers and walk-ins here, forklifts and dock doors in a warehouse.">
                    <Select id="co-ind" value={company.industry} onChange={(e) => setCompany({ ...company, industry: e.target.value })}>
                      {INDUSTRIES.map((i) => (
                        <option key={i}>{i}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-medium text-steel-100">Stores</p>
                  {stores.map((s, i) => (
                    <div key={s.id} className="panel grid gap-3 p-4 sm:grid-cols-[0.8fr_1.2fr]">
                      <Field label="Store name" htmlFor={`st-n-${i}`} error={errors[`stores.${i}.name`]}>
                        <Input id={`st-n-${i}`} value={s.name} onChange={(e) => setStores(stores.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                      </Field>
                      <Field label="Address" htmlFor={`st-a-${i}`} error={errors[`stores.${i}.address`]}>
                        <Input id={`st-a-${i}`} value={s.address} onChange={(e) => setStores(stores.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))} />
                      </Field>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
                <div className="flex flex-col gap-5">
                  <DayRail shift={shift} />
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Opening shift starts" htmlFor="sh-os" error={errors.openStart}>
                      <Input id="sh-os" type="time" value={shift.openStart} onChange={(e) => setShift({ ...shift, openStart: e.target.value })} />
                    </Field>
                    <Field label="Opening shift ends" htmlFor="sh-oe" error={errors.openEnd}>
                      <Input id="sh-oe" type="time" value={shift.openEnd} onChange={(e) => setShift({ ...shift, openEnd: e.target.value })} />
                    </Field>
                    <Field label="Closing shift starts" htmlFor="sh-cs" error={errors.closeStart}>
                      <Input id="sh-cs" type="time" value={shift.closeStart} onChange={(e) => setShift({ ...shift, closeStart: e.target.value })} />
                    </Field>
                    <Field label="Closing shift ends" htmlFor="sh-ce" error={errors.closeEnd}>
                      <Input id="sh-ce" type="time" value={shift.closeEnd} onChange={(e) => setShift({ ...shift, closeEnd: e.target.value })} />
                    </Field>
                    <Field label="Closeout due" htmlFor="sh-cd" error={errors.closeoutDue} hint="We nudge the closer 15 minutes before.">
                      <Input id="sh-cd" type="time" value={shift.closeoutDue} onChange={(e) => setShift({ ...shift, closeoutDue: e.target.value })} />
                    </Field>
                    <Field label="Brief delivered" htmlFor="sh-ba" error={errors.briefAt} hint="To the opening manager's phone.">
                      <Input id="sh-ba" type="time" value={shift.briefAt} onChange={(e) => setShift({ ...shift, briefAt: e.target.value })} />
                    </Field>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-medium text-steel-100">Per-store times the brief plans around</p>
                  {stores.map((s, i) => (
                    <div key={s.id} className="panel grid grid-cols-[1fr_auto_auto] items-end gap-3 p-4">
                      <p className="self-center font-display text-lg font-semibold tracking-wide">{s.name}</p>
                      <Field label="Doors open" htmlFor={`d-${i}`} error={errors[`stores.${i}.doorsOpen`]}>
                        <Input id={`d-${i}`} type="time" className="w-32" value={s.doorsOpen} onChange={(e) => setStores(stores.map((x, j) => (j === i ? { ...x, doorsOpen: e.target.value } : x)))} />
                      </Field>
                      <Field label="Lunch rush" htmlFor={`l-${i}`} error={errors[`stores.${i}.lunchRush`]}>
                        <Input id={`l-${i}`} type="time" className="w-32" value={s.lunchRush} onChange={(e) => setStores(stores.map((x, j) => (j === i ? { ...x, lunchRush: e.target.value } : x)))} />
                      </Field>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
                <div>
                  <div className="mb-3 flex items-baseline justify-between">
                    <p className="text-sm font-medium text-steel-100">Asked in this order at every close</p>
                    <Mono className={cx("text-sm", questions.length === 5 ? "text-go" : "text-amber")}>{questions.length} of 5</Mono>
                  </div>
                  <ol className="flex flex-col gap-2">
                    {questions.map((q, i) => (
                      <li key={q.prompt} className="panel flex items-center gap-3 px-3 py-3">
                        <span className="grid h-8 w-8 flex-none place-items-center rounded-md bg-night-600 font-mono text-sm text-paper-100">{i + 1}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-paper-100">{q.prompt}</span>
                          {q.hint && <span className="block text-sm text-steel-500">{q.hint}</span>}
                        </span>
                        <span className="flex flex-none">
                          <button type="button" className="grid h-8 w-8 place-items-center rounded text-steel-400 hover:bg-night-600 hover:text-paper-100 disabled:opacity-30" aria-label={`Move “${q.prompt}” up`} disabled={i === 0} onClick={() => setQs(swap(questions, i, i - 1))}>
                            <ArrowUp size={15} />
                          </button>
                          <button type="button" className="grid h-8 w-8 place-items-center rounded text-steel-400 hover:bg-night-600 hover:text-paper-100 disabled:opacity-30" aria-label={`Move “${q.prompt}” down`} disabled={i === questions.length - 1} onClick={() => setQs(swap(questions, i, i + 1))}>
                            <ArrowDown size={15} />
                          </button>
                          <button type="button" className="grid h-8 w-8 place-items-center rounded text-steel-400 hover:bg-night-600 hover:text-signal" aria-label={`Remove “${q.prompt}”`} onClick={() => setQs(questions.filter((_, j) => j !== i))}>
                            <X size={15} />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                  {errors._ && (
                    <p role="alert" className="mt-3 text-sm text-signal">
                      {errors._}
                    </p>
                  )}
                  <p className="mt-4 text-sm text-steel-400">Five answers take a tired closer about two minutes. The last question is the safety net: it catches what the others miss.</p>
                </div>
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-medium text-steel-100">Swap in a question</p>
                  {Object.values(db.questions)
                    .filter((q) => !questions.some((x) => x.prompt === q.prompt))
                    .map((q) => (
                      <div key={q.id} className="flex items-center gap-3 rounded-lg border border-night-600 px-3 py-2.5">
                        <span className="min-w-0 flex-1 text-[0.95rem] text-steel-100">{q.prompt}</span>
                        <Button size="sm" disabled={questions.length >= 5} onClick={() => setQs([...questions, { prompt: q.prompt, hint: q.hint }])} icon={<Plus size={14} />}>
                          Add
                        </Button>
                      </div>
                    ))}
                  <Field label="Or write your own" htmlFor="q-custom" hint={questions.length >= 5 ? "Remove one first. Five is the limit." : "Phrase it the way your closers talk."}>
                    <div className="flex gap-2">
                      <Input id="q-custom" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Which prep is behind for tomorrow?" />
                      <Button
                        disabled={questions.length >= 5 || custom.trim().length < 8}
                        onClick={() => {
                          setQs([...questions, { prompt: custom.trim().replace(/([^?])$/, "$1?"), hint: "" }]);
                          setCustom("");
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  </Field>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-medium text-steel-100">Rules that run on every closeout</p>
                  {Object.values(db.rules).map((r) => (
                    <div key={r.id} className="panel px-4 py-3">
                      <Switch checked={ruleOn[r.id]} onChange={(v) => setRuleOn({ ...ruleOn, [r.id]: v })} label={r.name} description={summarizeRule(r, Object.fromEntries(Object.values(db.locations).map((l) => [l.id, l.name])))} />
                    </div>
                  ))}
                  <p className="text-sm text-steel-400">
                    Build your own on the <Link href="/rules" className="text-safety underline-offset-4 hover:underline">Rules</Link> page after setup, with a test panel that runs them against sample closeouts.
                  </p>
                </div>
                <div className="flex flex-col gap-4">
                  <p className="text-sm font-medium text-steel-100">Thresholds</p>
                  <Field label="Escalate an unacknowledged critical item after" htmlFor="th-ack" error={errors.escalateUnackedCriticalMinutes}>
                    <UnitInput id="th-ack" value={thresholds.escalateUnackedCriticalMinutes} unit="minutes" onChange={(v) => setThresholds({ ...thresholds, escalateUnackedCriticalMinutes: v })} />
                  </Field>
                  <Field label="Call something a pattern after" htmlFor="th-min" error={errors.patternMinMentions}>
                    <UnitInput id="th-min" value={thresholds.patternMinMentions} unit="mentions" onChange={(v) => setThresholds({ ...thresholds, patternMinMentions: v })} />
                  </Field>
                  <Field label="Look back over" htmlFor="th-win" error={errors.patternWindowDays}>
                    <UnitInput id="th-win" value={thresholds.patternWindowDays} unit="days" onChange={(v) => setThresholds({ ...thresholds, patternWindowDays: v })} />
                  </Field>
                  <Field label="Flag stock as low under" htmlFor="th-par" error={errors.lowStockPercentOfPar}>
                    <UnitInput id="th-par" value={thresholds.lowStockPercentOfPar} unit="% of par" onChange={(v) => setThresholds({ ...thresholds, lowStockPercentOfPar: v })} />
                  </Field>
                  <div className="rounded-lg border border-night-600 bg-night-850 p-4 text-sm text-steel-300">
                    <p className="mb-2 font-medium text-paper-100">Severity, in plain words</p>
                    <ul className="flex flex-col gap-1.5">
                      <li className="flex items-center gap-2"><StatusLight tone="critical" size={9} /> Critical: can close the store or hurt someone. Needs a person to confirm before it pages anyone.</li>
                      <li className="flex items-center gap-2"><StatusLight tone="high" size={9} /> High: will hurt today if nobody acts.</li>
                      <li className="flex items-center gap-2"><StatusLight tone="normal" size={9} /> Normal: part of a good morning.</li>
                      <li className="flex items-center gap-2"><StatusLight tone="watch" size={9} /> Watch: handled, but worth seeing again.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
                <div className="flex flex-col gap-5">
                  <div>
                    <p className="mb-3 text-sm font-medium text-steel-100">Who gets the Downtown opening brief</p>
                    <div className="flex flex-col gap-2">
                      {recipients.map((u) => (
                        <div key={u.id} className="panel flex items-center gap-3 px-3 py-3">
                          <Avatar user={u} size={34} />
                          <div className="min-w-0 flex-1">
                            <Checkbox checked={gets[u.id]} onChange={(v) => setGets({ ...gets, [u.id]: v })} label={u.name} description={`${ROLE_TITLE[u.role]} · ${u.role === "area_manager" ? "email digest" : "push at " + fmtHHMM(shift.briefAt)}`} />
                          </div>
                        </div>
                      ))}
                      {invited.map((name) => (
                        <p key={name} className="flex items-center gap-2 px-1 text-sm text-steel-300">
                          <Check size={14} className="text-go" /> Invite sent to {name}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="panel flex flex-col gap-3 p-4">
                    <p className="font-medium text-paper-100">Invite someone else</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Full name" htmlFor="inv-name" error={errors["invite.name"]}>
                        <Input id="inv-name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} placeholder="Sam Rivera" />
                      </Field>
                      <Field label="Email or mobile" htmlFor="inv-contact" error={errors["invite.contact"]}>
                        <Input id="inv-contact" value={invite.contact} onChange={(e) => setInvite({ ...invite, contact: e.target.value })} placeholder="sam@nightjar.example" />
                      </Field>
                      <Field label="Role" htmlFor="inv-role">
                        <Select id="inv-role" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}>
                          {(["opening_manager", "closing_manager", "kitchen_lead", "area_manager"] as Role[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLE_TITLE[r]}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Store" htmlFor="inv-loc">
                        <Select id="inv-loc" value={invite.locationId} onChange={(e) => setInvite({ ...invite, locationId: e.target.value })}>
                          {Object.values(db.locations).map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <Button onClick={sendInvite} className="self-start" icon={<Plus size={15} />}>
                      Send invite
                    </Button>
                    <p className="text-xs text-steel-500">Invites are simulated in this demo. Nothing is sent.</p>
                  </div>
                </div>
                <div>
                  <p className="mb-3 text-sm font-medium text-steel-100">Preview: a recent Downtown brief</p>
                  <div className="relative">
                    <BriefReceipt view={preview} compact />
                    <span className="absolute -top-3 right-4">
                      <Stamp size="xs" rotate={4} className="bg-night-900">
                        Preview
                      </Stamp>
                    </span>
                  </div>
                  <p className="mt-4 text-sm text-steel-400">Friday's brief, built from Luis's closeout the night before. Tomorrow's will look like this, with your questions and rules applied.</p>
                </div>
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-night-700 bg-night-900/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-8">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)} icon={<ArrowLeft size={16} />}>
            Back
          </Button>
          <span className="hidden text-sm text-steel-500 sm:inline">Progress saves after each step.</span>
          <Button variant="primary" size="lg" className="ml-auto flex-row-reverse" onClick={next} icon={step === 4 ? <Check size={17} /> : <ArrowRight size={17} />}>
            {step === 4 ? "Finish setup" : `Continue to ${STEPS[step + 1].short.toLowerCase()}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const copy = [...arr];
  [copy[a], copy[b]] = [copy[b], copy[a]];
  return copy;
}

function UnitInput({ id, value, unit, onChange }: { id: string; value: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 flex-none">
        <Input id={id} type="number" inputMode="numeric" className="font-mono" value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(Number(e.target.value))} />
      </div>
      <span className="whitespace-nowrap text-sm text-steel-400">{unit}</span>
    </div>
  );
}

/** A 24-hour rail showing both shifts, the closeout and the brief. */
function DayRail({ shift }: { shift: { openStart: string; openEnd: string; closeStart: string; closeEnd: string; closeoutDue: string; briefAt: string } }) {
  const p = (t: string) => (hhmmToMinutes(t) / 1440) * 100;
  return (
    <div className="panel px-4 pb-4 pt-5" role="img" aria-label={`Opening ${shift.openStart} to ${shift.openEnd}, closing ${shift.closeStart} to ${shift.closeEnd}, closeout due ${shift.closeoutDue}, brief at ${shift.briefAt}`}>
      <div className="relative h-16">
        <div className="absolute top-6 h-6 rounded bg-go/25 ring-1 ring-go/50" style={{ left: `${p(shift.openStart)}%`, width: `${Math.max(0, p(shift.openEnd) - p(shift.openStart))}%` }}>
          <span className="absolute -top-5 left-0 font-display text-xs font-semibold uppercase tracking-wider text-go">Open</span>
        </div>
        <div className="absolute top-6 h-6 rounded bg-safety/20 ring-1 ring-safety/50" style={{ left: `${p(shift.closeStart)}%`, width: `${Math.max(0, p(shift.closeEnd) - p(shift.closeStart))}%` }}>
          <span className="absolute -top-5 right-0 font-display text-xs font-semibold uppercase tracking-wider text-safety">Close</span>
        </div>
        <Marker at={p(shift.closeoutDue)} label="Closeout" tone="high" />
        <Marker at={p(shift.briefAt)} label="Brief" tone="ok" />
      </div>
      <div className="relative mt-1 h-4">
        {[0, 6, 12, 18, 24].map((h) => (
          <span key={h} className="absolute -translate-x-1/2 font-mono text-[0.68rem] text-steel-500" style={{ left: `${(h / 24) * 100}%` }}>
            {String(h).padStart(2, "0")}:00
          </span>
        ))}
      </div>
    </div>
  );
}

function Marker({ at, label, tone }: { at: number; label: string; tone: "high" | "ok" }) {
  return (
    <div className="absolute top-4 flex -translate-x-1/2 flex-col items-center" style={{ left: `${at}%` }}>
      <span className="h-10 w-0.5 bg-paper-100/70" />
      <span className="mt-1 flex items-center gap-1 whitespace-nowrap text-[0.7rem] text-paper-100">
        <StatusLight tone={tone} size={8} /> {label}
      </span>
    </div>
  );
}
