"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, CheckCheck, CircleCheck, FileText, MessageSquare, Moon, RotateCcw, Sparkle, TriangleAlert } from "lucide-react";
import { useStore } from "@/store/store";
import { useBriefing, useCurrentUser, useDb, useNow, usePatterns } from "@/store/hooks";
import { acknowledge, setClock, setDemo } from "@/domain/commands";
import type { BriefEntry, BriefingView, ChangeEntry } from "@/domain/briefing";
import type { DemoDB, Severity } from "@/domain/types";
import { can, ROLE_TITLE } from "@/domain/permissions";
import { diffMinutes, fmtDay, fmtDuration, fmtRelative, fmtTime, toMs, addMinutes } from "@/domain/time";
import { MORNING_ANCHOR } from "@/data/seed";
import { Avatar, Button, ButtonLink, Mono, Stamp, StatusLight, Tape, cx } from "@/components/ui/primitives";
import { TimeRail, type RailMarker } from "@/components/ui/TimeRail";
import { EmptyState, PermissionDenied } from "@/components/ui/states";
import { TaskActions } from "./TaskActions";

const SEV_INK: Record<Severity, string> = { critical: "text-paper-red", high: "text-[#9a4300]", normal: "text-ink-soft", watch: "text-ink-soft" };

export function Briefing() {
  const db = useDb();
  const me = useCurrentUser();
  const now = useNow();
  const locationId = db.demo.currentLocationId;
  const view = useBriefing(locationId);
  const patterns = usePatterns();

  if (!can(me, "view_briefing")) return <PermissionDenied permission="view_briefing" what="The opening brief" role={ROLE_TITLE[me.role]} />;
  if (view.state === "awaiting") return <Awaiting view={view} />;

  const acked = view.acks.some((a) => a.user.id === me.id);
  const doorsIn = diffMinutes(view.doorsOpenAt, now);
  const markers: RailMarker[] = [];
  const seen = new Set<string>();
  for (const e of [...view.risks, ...view.mustDo]) {
    if (!e.task?.dueAt || seen.has(e.task.id)) continue;
    seen.add(e.task.id);
    markers.push({ id: e.task.id, at: e.task.dueAt, label: shortTitle(e.task.title), tone: e.severity === "critical" ? "critical" : e.severity === "high" ? "high" : "normal", done: e.task.status === "done" });
    if (e.timer && !e.timer.fired) markers.push({ id: `${e.task.id}-timer`, at: e.timer.dueAt, label: "Refund rule check", tone: "amber", hollow: true });
  }
  const icePattern = patterns.find((p) => p.subjectKey === "asset:ice-machine" && p.locationIds.includes(locationId) && !p.belowThreshold);
  const preview = toMs(now) < toMs(view.readyAt);
  const conversations = Object.values(db.comments)
    .filter((c) => {
      const entity = c.entityType === "issue" ? db.issues[c.entityId] : c.entityType === "task" ? db.tasks[c.entityId] : null;
      return entity && entity.locationId === locationId && toMs(c.at) >= toMs(view.handoff?.createdAt ?? now);
    })
    .sort((a, b) => toMs(a.at) - toMs(b.at));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <Stamp size="xs" rotate={-1.5} tone="go">
            Open · {view.location.code} · {fmtDay(view.readyAt)}
          </Stamp>
          <h1 className="mt-3 font-display text-[2.4rem] font-bold leading-none tracking-wide sm:text-6xl">Opening brief</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-steel-300">
            <span className="inline-flex items-center gap-2">
              <Avatar user={view.author} size={22} /> From {view.author?.name}&apos;s closeout at {fmtTime(view.handoff!.submittedAt ?? view.handoff!.createdAt)}
            </span>
            <span className="text-night-500">/</span>
            <Link href={`/handoffs/${view.handoff!.id}`} className="inline-flex items-center gap-1 text-safety hover:underline">
              <FileText size={14} /> Original transcript
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <p className="text-xs uppercase tracking-widest text-steel-500">{doorsIn > 0 ? "Doors open in" : "Doors opened"}</p>
            <Mono className={cx("text-3xl leading-tight", doorsIn > 0 && doorsIn < 60 ? "text-safety" : "text-paper-100")}>{doorsIn > 0 ? fmtDuration(doorsIn) : fmtTime(view.doorsOpenAt)}</Mono>
          </div>
          <AckButton view={view} acked={acked} />
        </div>
      </div>

      {preview && (
        <div className="panel flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <Moon size={16} className="text-steel-400" />
          <span className="text-steel-300">Preview. The opening crew gets this at {fmtTime(view.readyAt)}.</span>
          <PreviewJump />
        </div>
      )}

      <div className="panel px-4 pb-3 pt-4 sm:px-5">
        <TimeRail
          start={addMinutes(view.readyAt, 0)}
          end={addMinutes(view.lunchAt, 30)}
          now={toMs(now) >= toMs(view.readyAt) ? now : undefined}
          markers={markers}
          bands={[
            { id: "doors", at: view.doorsOpenAt, label: "Doors", strong: true },
            { id: "lunch", at: view.lunchAt, label: "Lunch rush" },
          ]}
          label="Today's deadlines"
          dense
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* The printout */}
        <div className="thermal rounded-t-lg px-4 pt-5 sm:px-7 sm:pt-7">
          <div className="flex items-baseline justify-between gap-3 font-mono text-[0.72rem] uppercase tracking-wider text-ink-soft">
            <span>Nightjar Kitchens · {view.location.name}</span>
            <span>{view.itemCount} items · printed {fmtTime(view.readyAt)}</span>
          </div>
          <hr className="thermal-rule my-4" />

          <BriefSection n={1} question="What can hurt today?" count={view.risks.length}>
            {view.risks.length === 0 ? (
              <p className="text-ink-soft">Nothing from last night is likely to hurt service today.</p>
            ) : (
              view.risks.map((e) => <EntryCard key={e.key} db={db} entry={e} now={now} />)
            )}
          </BriefSection>

          <BriefSection n={2} question="What must be done before opening?" count={view.mustDo.length}>
            {view.mustDo.length === 0 ? (
              <p className="text-ink-soft">Every task is covered above.</p>
            ) : (
              view.mustDo.map((e) => <EntryCard key={e.key} db={db} entry={e} now={now} />)
            )}
          </BriefSection>

          <BriefSection n={3} question="What changed since yesterday?" count={view.changed.length}>
            <ul className="flex flex-col divide-y divide-ink/10">
              {view.changed.map((c) => (
                <ChangeRow key={c.key} c={c} />
              ))}
            </ul>
          </BriefSection>

          <BriefSection n={4} question="What did the prior crew already handle?" count={view.handled.length} last>
            <ul className="flex flex-col gap-2.5">
              {view.handled.map((h) => (
                <li key={h.key} className="flex items-start gap-2.5">
                  <CircleCheck size={17} className="mt-0.5 flex-none text-[#2f6b47]" />
                  <span>
                    <span className="font-semibold text-ink">{h.title}</span>
                    <span className="block text-sm text-ink-soft">{h.detail}</span>
                  </span>
                </li>
              ))}
              {view.crewNotes.map((n) => (
                <li key={n} className="flex items-start gap-2.5">
                  <Sparkle size={16} className="mt-0.5 flex-none text-ink-soft" />
                  <span className="text-sm text-ink-soft">
                    Crew note: “{n}”
                  </span>
                </li>
              ))}
            </ul>
          </BriefSection>
        </div>

        {/* Side rail */}
        <aside className="flex flex-col gap-4">
          {icePattern && (
            <Link href={`/patterns#${icePattern.id}`} className="panel plate group block px-5 pb-5 pt-6 transition-colors hover:border-steel-500">
              <p className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.12em] text-signal">
                <TriangleAlert size={15} /> Recurring
              </p>
              <p className="mt-2 font-display text-2xl font-semibold leading-tight tracking-wide text-paper-50">{icePattern.headline}</p>
              <MiniStrip db={db} mentions={icePattern.mentions.map((m) => m.at)} end={now} />
              <p className="mt-3 text-sm text-steel-300">{icePattern.observation}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-safety group-hover:underline">
                See the evidence <ArrowUpRight size={15} />
              </span>
            </Link>
          )}
          <div className="panel px-5 py-4">
            <p className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-[0.12em] text-steel-400">
              <MessageSquare size={14} /> With the previous shift
            </p>
            {conversations.length === 0 ? (
              <p className="mt-2 text-sm text-steel-400">Questions you ask {view.author?.firstName} show up here with the answer.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {conversations.map((c) => {
                  const u = db.users[c.authorId];
                  return (
                    <li key={c.id} className="flex gap-2.5">
                      <Avatar user={u} size={24} className="mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm text-paper-100">{c.body}</p>
                        <p className="font-mono text-[0.68rem] text-steel-500">
                          {u?.firstName} · {fmtRelative(c.at, now)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="panel px-5 py-4">
            <p className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-steel-400">Acknowledged by</p>
            {view.acks.length === 0 ? (
              <p className="mt-2 text-sm text-steel-400">Nobody yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {view.acks.map((a) => (
                  <li key={a.user.id} className="flex items-center gap-2 text-sm text-paper-100">
                    <Avatar user={a.user} size={22} /> {a.user.name} <Mono className="ml-auto text-xs text-steel-500">{fmtTime(a.at)}</Mono>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function shortTitle(t: string) {
  return t.replace(/ before open; book service if .*/, "").replace(/^Check /, "Check ").replace(/^Prep order: .*/, "Order prep").replace(/^Call (Table \d+).*/, "Call $1").replace(/^Walk (\w+) through.*/, "$1 training");
}

function BriefSection({ n, question, count, children, last }: { n: number; question: string; count: number; children: React.ReactNode; last?: boolean }) {
  return (
    <section aria-labelledby={`bq-${n}`} className={cx("pb-6", !last && "mb-6 border-b border-dashed border-ink/25")}>
      <h2 id={`bq-${n}`} className="mb-4 flex items-baseline gap-3 font-display text-[1.45rem] font-bold leading-tight tracking-wide text-ink sm:text-[1.7rem]">
        <span className="font-mono text-base font-normal text-ink-soft">{n}</span>
        {question}
        <span className="ml-auto font-mono text-sm font-normal text-ink-soft">{count}</span>
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function EntryCard({ db, entry, now }: { db: DemoDB; entry: BriefEntry; now: string }) {
  const { task, item, issue } = entry;
  const evidence = item ? db.evidence[item.evidenceIds[0]] : null;
  const author = item ? db.users[db.handoffs[item.handoffId]?.authorId ?? ""] : null;
  const claimer = task?.claimedById ? db.users[task.claimedById] : null;
  const resolver = task?.resolvedById ? db.users[task.resolvedById] : null;
  const done = task?.status === "done";
  const replies = Object.values(db.comments).filter((c) => (issue && c.entityId === issue.id) || (task && c.entityId === task.id)).filter((c) => toMs(c.at) >= toMs(db.handoffs[item?.handoffId ?? ""]?.createdAt ?? now));
  return (
    <motion.article layout="position" aria-label={entry.title} className={cx("relative rounded-md border bg-paper-50/60 px-3.5 py-3.5 sm:px-4", entry.severity === "critical" && !done ? "border-paper-red/50" : "border-ink/15", done && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <motion.span key={entry.severity} initial={{ scale: 1.6 }} animate={{ scale: 1 }} className="inline-flex">
          <StatusLight tone={entry.severity} size={10} pulse={entry.severity === "critical" && !task?.claimedById && !done} />
        </motion.span>
        <span className={cx("font-display text-sm font-bold uppercase tracking-wider", SEV_INK[entry.severity])}>{entry.severity}</span>
        {entry.recurring && (
          <Link href={`/patterns#${entry.recurring.patternId}`} className="inline-flex items-center gap-1 rounded-sm bg-paper-red/10 px-1.5 py-0.5 text-xs font-semibold text-paper-red hover:underline">
            {ordinal(entry.recurring.count)} mention in {entry.recurring.spanDays} days <ArrowUpRight size={12} />
          </Link>
        )}
        {entry.carriedOver && <span className="rounded-sm bg-ink/10 px-1.5 py-0.5 text-xs font-semibold text-ink-soft">Carried over</span>}
        {issue?.escalatedAt && (
          <span className="rounded-sm bg-paper-red/10 px-1.5 py-0.5 text-xs font-semibold text-paper-red">Escalated to {db.users[issue.escalatedToId ?? ""]?.firstName ?? "area manager"}</span>
        )}
        {task?.dueAt && (
          <Mono className={cx("ml-auto text-xs", !done && toMs(task.dueAt) < toMs(now) ? "font-semibold text-paper-red" : "text-ink-soft")}>
            Due {fmtTime(task.dueAt)} · {task.dueLabel}
          </Mono>
        )}
      </div>
      <h3 className={cx("mt-2 font-display text-[1.35rem] font-bold leading-snug tracking-wide text-ink", done && "line-through decoration-ink/40")}>{entry.title}</h3>
      {entry.why && <p className="mt-0.5 text-[0.95rem] text-ink-soft">{entry.why}</p>}
      {evidence && (
        <Link href={`/handoffs/${item!.handoffId}`} className="mt-2 block border-l-2 border-ink/25 pl-3 font-mono text-[0.78rem] leading-relaxed text-ink-soft hover:border-ink/60">
          “{evidence.text}” <span className="whitespace-nowrap">— {author?.firstName}</span>
        </Link>
      )}
      {task && task.title !== entry.title && (
        <p className="mt-2 text-[0.95rem] text-ink">
          <span className="font-semibold">Task:</span> {task.title}
          {task.ownerId && !task.claimedById && <span className="text-ink-soft"> · assigned to {db.users[task.ownerId]?.firstName}</span>}
        </p>
      )}
      {entry.timer && !done && (
        <p className={cx("mt-1.5 text-sm", entry.timer.fired ? "font-semibold text-paper-red" : "text-ink-soft")}>
          {entry.timer.fired ? `Rule fired at ${fmtTime(entry.timer.dueAt)}: escalated to the area manager.` : `Rule: escalates to the area manager at ${fmtTime(entry.timer.dueAt)} unless resolved (${fmtRelative(entry.timer.dueAt, now)}).`}
        </p>
      )}
      {replies.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2 rounded-md bg-ink/5 px-3 py-2.5">
          {replies.map((r) => (
            <li key={r.id} className="text-sm">
              <span className="font-semibold text-ink">{db.users[r.authorId]?.firstName}:</span> <span className="text-ink-soft">{r.body}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <TaskActions task={task} issue={issue} item={item} onPaper />
        <AnimatePresence>
          {(claimer || done) && (
            <motion.span
              key={done ? "done" : claimer?.id}
              initial={{ scale: 1.8, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: -4 }}
              transition={{ type: "spring", stiffness: 420, damping: 18 }}
              className="ml-auto"
            >
              <Stamp tone={done ? "go" : "red"} size="xs" rotate={-4}>
                {done ? `Done · ${resolver?.firstName ?? ""} ${fmtTime(task!.resolvedAt!)}` : `Claimed · ${claimer!.firstName} ${fmtTime(task!.claimedAt!)}`}
              </Stamp>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {done && task?.resolutionNote && <p className="mt-2 text-sm text-ink-soft">“{task.resolutionNote}”</p>}
    </motion.article>
  );
}

function ChangeRow({ c }: { c: ChangeEntry }) {
  const label = { new: "New", again: "Again", returned: "Came back", resolved: "Resolved", quiet: "Quiet" }[c.kind];
  const tone = { new: "bg-ink text-paper-100", again: "bg-[#9a4300] text-paper-50", returned: "bg-paper-red text-paper-50", resolved: "bg-[#2f6b47] text-paper-50", quiet: "bg-ink/20 text-ink" }[c.kind];
  const body = (
    <span className="flex items-start gap-3 py-2.5">
      <span className={cx("mt-0.5 w-[5.5rem] flex-none rounded-sm px-1.5 py-0.5 text-center font-display text-xs font-bold uppercase tracking-wider", tone)}>{label}</span>
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{c.title}</span>
        <span className="block text-sm text-ink-soft">{c.detail}</span>
      </span>
      {c.href && <ArrowUpRight size={15} className="ml-auto mt-1 flex-none text-ink-soft" />}
    </span>
  );
  return <li>{c.href ? <Link href={c.href} className="block hover:bg-ink/5">{body}</Link> : body}</li>;
}

function AckButton({ view, acked }: { view: BriefingView; acked: boolean }) {
  const dispatch = useStore((s) => s.dispatch);
  const me = useCurrentUser();
  if (!view.briefingId) return null;
  const myAck = view.acks.find((a) => a.user.id === me.id);
  return (
    <AnimatePresence mode="wait">
      {acked && myAck ? (
        <motion.span key="stamp" initial={{ scale: 2, opacity: 0, rotate: -14 }} animate={{ scale: 1, opacity: 1, rotate: -5 }} transition={{ type: "spring", stiffness: 380, damping: 16 }}>
          <Stamp tone="go" size="md" rotate={-5}>
            <CheckCheck size={16} /> Acknowledged · {me.firstName} {fmtTime(myAck.at)}
          </Stamp>
        </motion.span>
      ) : (
        <motion.span key="btn" exit={{ opacity: 0 }}>
          <Button variant="primary" size="lg" icon={<Check size={18} />} onClick={() => dispatch(acknowledge, { entityType: "briefing", entityId: view.briefingId! }, { undoable: true, label: "Acknowledge brief", toastMessage: "Brief acknowledged" })}>
            Acknowledge brief
          </Button>
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function PreviewJump() {
  const dispatch = useStore((s) => s.dispatch);
  return (
    <button type="button" className="ml-auto font-semibold text-safety hover:underline" onClick={() => dispatch(setClock, { iso: MORNING_ANCHOR, nowMs: Date.now() }, { local: true, toastMessage: "Advanced to Wed 6:15 AM" })}>
      Advance to 6:15 AM
    </button>
  );
}

function MiniStrip({ mentions, end }: { db: DemoDB; mentions: string[]; end: string }) {
  const days = Array.from({ length: 9 }, (_, i) => new Date(Date.parse(end) - (8 - i) * 86_400_000).toISOString().slice(0, 10));
  return (
    <div className="mt-3 grid grid-cols-9 gap-1" role="img" aria-label={`${mentions.length} mentions over the last nine days`}>
      {days.map((d) => {
        const n = mentions.filter((m) => m.startsWith(d)).length;
        return (
          <div key={d} className="flex flex-col items-center gap-1">
            <StatusLight tone="critical" off={n === 0} size={10} />
            <span className="font-mono text-[0.6rem] text-steel-500">{new Date(d + "T12:00:00Z").getUTCDate()}</span>
          </div>
        );
      })}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function Awaiting({ view }: { view: BriefingView }) {
  const db = useDb();
  const me = useCurrentUser();
  const now = useNow();
  const router = useRouter();
  const dispatch = useStore((s) => s.dispatch);
  const closer = Object.values(db.users).find((u) => u.role === "closing_manager" && u.locationIds.includes(view.location.id));
  const pending = view.pendingHandoff;
  const late = toMs(now) > toMs(view.closeoutDueAt);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Stamp size="xs" rotate={-1.5} tone="steel">
          Open · {view.location.code} · {fmtDay(view.readyAt)}
        </Stamp>
        <h1 className="mt-3 font-display text-[2.4rem] font-bold leading-none tracking-wide sm:text-6xl">Opening brief</h1>
      </div>
      <EmptyState
        icon={<Moon size={28} />}
        title={pending ? (pending.status === "queued" ? "Tonight's closeout is on a phone with no signal" : `${db.users[pending.authorId]?.firstName ?? "The closer"} is reviewing tonight's closeout`) : "Tonight's closeout isn't in yet"}
        body={
          pending ? (
            <>It becomes this brief as soon as it&apos;s published. {pending.status === "review" ? "A couple of items need confirming first." : "It syncs automatically when the phone reconnects."}</>
          ) : (
            <>
              {closer?.name ?? "The closing manager"}&apos;s closeout is due at {fmtTime(view.closeoutDueAt)}
              {late ? `, ${fmtDuration(diffMinutes(now, view.closeoutDueAt))} ago` : ""}. The brief builds itself from it and lands on {view.location.name}&apos;s opening phones at {fmtTime(view.readyAt)}.
            </>
          )
        }
        action={
          <>
            {pending ? (
              <ButtonLink href={`/handoffs/${pending.id}`} variant="primary">Open the closeout</ButtonLink>
            ) : (
              <>
                {closer && closer.id !== me.id && (
                  <Button
                    onClick={() => {
                      dispatch(setDemo, { currentUserId: closer.id }, { silent: true, local: true });
                      router.push("/capture");
                    }}
                    variant="primary"
                  >
                    Record it as {closer.firstName}
                  </Button>
                )}
                {closer?.id === me.id && (
                  <ButtonLink href="/capture" variant="primary">Record tonight&apos;s closeout</ButtonLink>
                )}
              </>
            )}
            <ButtonLink href="/handoffs" icon={<RotateCcw size={15} />}>Past handoffs</ButtonLink>
          </>
        }
      />
      <Tape thin />
      <p className="text-sm text-steel-500">Signed in as {me.name}, {ROLE_TITLE[me.role].toLowerCase()}.</p>
    </div>
  );
}
