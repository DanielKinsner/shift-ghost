"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowUpRight, CircleCheck, Eye, MessageSquare, RotateCcw, ShieldX } from "lucide-react";
import { useStore } from "@/store/store";
import { useCurrentUser, useDb, useNow, usePatterns } from "@/store/hooks";
import { addComment, markFalseAlarm, resolveIssue } from "@/domain/commands";
import { patternForIssue } from "@/domain/patterns";
import { can } from "@/domain/permissions";
import { addDays, dayKey, fmtDateTime, fmtDay, fmtRelative, fmtTime, toMs } from "@/domain/time";
import type { ExtractedItem, IssueStatus } from "@/domain/types";
import { Avatar, Button, ConfidenceTag, Mono, SectionHeading, SeverityTag, Stamp, StatusLight, Tape, cx } from "@/components/ui/primitives";
import { Field, Textarea, Input } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { EmptyState } from "@/components/ui/states";
import { TimeRail } from "@/components/ui/TimeRail";
import { TaskActions } from "@/components/briefing/TaskActions";

const STATUS: Record<IssueStatus, { label: string; tone: "critical" | "amber" | "ok" | "watch" }> = {
  open: { label: "Open", tone: "critical" },
  monitoring: { label: "Monitoring", tone: "amber" },
  resolved: { label: "Resolved", tone: "ok" },
  false_alarm: { label: "False alarm", tone: "watch" },
};

export function IssueDetail({ issueId }: { issueId: string }) {
  const db = useDb();
  const me = useCurrentUser();
  const now = useNow();
  const patterns = usePatterns();
  const dispatch = useStore((s) => s.dispatch);
  const [note, setNote] = useState("");
  const [faItem, setFaItem] = useState<ExtractedItem | null>(null);
  const [faNote, setFaNote] = useState("");
  const issue = db.issues[issueId];

  if (!issue) {
    return <EmptyState title="That issue isn't here" body="It may have been removed when the demo was reset." action={<Link href="/patterns"><Button>Back to patterns</Button></Link>} />;
  }

  const location = db.locations[issue.locationId];
  const mentions = issue.itemIds
    .map((id) => db.items[id])
    .filter(Boolean)
    .sort((a, b) => toMs(when(db, b)) - toMs(when(db, a)));
  const tasks = Object.values(db.tasks)
    .filter((t) => t.issueId === issue.id)
    .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
  const openTask = tasks.find((t) => t.status !== "done") ?? null;
  const latest = mentions[0] ?? null;
  const pattern = patternForIssue(patterns, issue.id);
  const comments = Object.values(db.comments)
    .filter((c) => c.entityId === issue.id || tasks.some((t) => t.id === c.entityId))
    .sort((a, b) => toMs(a.at) - toMs(b.at));
  const events = Object.values(db.audit)
    .filter((e) => e.entityId === issue.id || tasks.some((t) => t.id === e.entityId) || issue.itemIds.includes(e.entityId))
    .sort((a, b) => toMs(b.at) - toMs(a.at));
  const status = STATUS[issue.status];
  const railStart = addDays(dayKey(issue.firstSeenAt < addDays(dayKey(now), -9) ? addDays(dayKey(now), -9) : issue.firstSeenAt), 0) + "T00:00:00Z";
  const railEnd = addDays(dayKey(now), 1) + "T00:00:00Z";
  const canAct = can(me, "act_on_tasks");

  return (
    <div className="flex flex-col gap-6">
      <Link href={pattern ? `/patterns#${pattern.id}` : "/briefing"} className="inline-flex items-center gap-1.5 self-start text-sm text-steel-400 hover:text-paper-100">
        <ArrowLeft size={15} /> {pattern ? "Patterns" : "Opening brief"}
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <SeverityTag severity={issue.severity} pulse={issue.status === "open"} />
            <span className="inline-flex items-center gap-2 rounded-full border border-night-500 bg-night-800 px-2.5 py-1 text-xs font-medium text-steel-100">
              <StatusLight tone={status.tone} size={8} /> {status.label}
            </span>
            {issue.escalatedAt && <Stamp tone="red" size="xs">Escalated · {db.users[issue.escalatedToId ?? ""]?.firstName}</Stamp>}
          </div>
          <h1 className="mt-3 font-display text-[2.3rem] font-bold leading-[1.02] tracking-wide sm:text-5xl">{issue.title}</h1>
          <p className="mt-2 text-steel-300">
            {location.name} · first mentioned {fmtDay(issue.firstSeenAt)} · {mentions.length} {mentions.length === 1 ? "mention" : "mentions"} · last {fmtRelative(issue.lastSeenAt, now)}
          </p>
        </div>
        {canAct && (
          <div className="flex flex-wrap gap-2">
            {issue.status !== "resolved" && (
              <Button icon={<CircleCheck size={15} />} onClick={() => dispatch(resolveIssue, { issueId, outcome: "resolved", note: "Closed from the issue page" }, { undoable: true, label: "Resolve issue" })}>
                Mark resolved
              </Button>
            )}
            {issue.status === "open" && (
              <Button variant="ghost" icon={<Eye size={15} />} onClick={() => dispatch(resolveIssue, { issueId, outcome: "monitoring" }, { undoable: true, label: "Monitor issue" })}>
                Monitor
              </Button>
            )}
            {(issue.status === "resolved" || issue.status === "false_alarm") && (
              <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={() => dispatch(resolveIssue, { issueId, outcome: "open" }, { undoable: true, label: "Reopen issue" })}>
                Reopen
              </Button>
            )}
          </div>
        )}
      </div>

      {pattern && !pattern.belowThreshold && (
        <Link href={`/patterns#${pattern.id}`} className="panel group flex flex-wrap items-center gap-3 border-signal/40 px-4 py-3">
          <StatusLight tone="critical" pulse size={10} />
          <span className="font-medium text-paper-100">{pattern.headline}.</span>
          <span className="text-sm text-steel-300">{pattern.observation}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-safety group-hover:underline">
            See pattern <ArrowUpRight size={14} />
          </span>
        </Link>
      )}

      {/* Evidence timeline */}
      <section aria-labelledby="timeline" className="panel px-4 pb-4 pt-4 sm:px-5">
        <SectionHeading id="timeline" aside={<span className="text-xs text-steel-500">Every mention, in the words used</span>}>
          Evidence timeline
        </SectionHeading>
        <TimeRail
          className="mt-4"
          start={railStart}
          end={railEnd}
          now={now}
          markers={mentions.map((m) => ({
            id: m.id,
            at: when(db, m),
            label: `${fmtDay(when(db, m)).split(", ")[1]} ${fmtTime(when(db, m))}`,
            tone: m.fields.falseAlarm ? "watch" : m.fields.assertion === "ok" ? "ok" : m.severity === "critical" ? "critical" : m.severity === "high" ? "high" : "normal",
            done: Boolean(m.fields.falseAlarm),
          }))}
          label="Mentions over time"
          dense
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section aria-labelledby="mentions" className="flex flex-col gap-3">
          <SectionHeading id="mentions">Mentions</SectionHeading>
          <ol className="relative flex flex-col gap-3 border-l-2 border-night-600 pl-5">
            {mentions.map((m) => {
              const h = db.handoffs[m.handoffId];
              const u = db.users[h?.authorId ?? ""];
              const fa = m.fields.falseAlarm;
              return (
                <li key={m.id} className="relative">
                  <span className="absolute -left-[27px] top-4">
                    <StatusLight tone={fa ? "watch" : m.fields.assertion === "ok" ? "ok" : m.severity} off={Boolean(fa)} size={11} />
                  </span>
                  <article className={cx("panel px-4 py-3.5", fa && "opacity-70")}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Mono className="text-xs text-steel-400">{fmtDateTime(when(db, m))}</Mono>
                      <span className="inline-flex items-center gap-1.5 text-sm text-steel-300">
                        <Avatar user={u} size={18} /> {u?.name}
                      </span>
                      <ConfidenceTag confidence={m.confidence} className="ml-auto" />
                    </div>
                    <p className={cx("mt-1.5 font-semibold text-paper-100", fa && "line-through")}>{m.title}</p>
                    {m.evidenceIds.map((eid) => (
                      <Link key={eid} href={`/handoffs/${m.handoffId}`} className="mt-1.5 block border-l-2 border-safety/50 pl-3 text-[0.95rem] text-steel-100 hover:border-safety">
                        “{db.evidence[eid]?.text}”
                      </Link>
                    ))}
                    {m.facts.length > 0 && <p className="mt-1.5 text-sm text-steel-400">{m.facts.join(" · ")}</p>}
                    {fa ? (
                      <p className="mt-2 flex items-start gap-2 text-sm text-steel-300">
                        <ShieldX size={15} className="mt-0.5 flex-none" /> False alarm, marked by {db.users[fa.byId]?.name ?? "a manager"} {fmtDateTime(fa.at)}: {fa.note}
                        {canAct && (
                          <button type="button" className="ml-auto flex-none text-xs font-semibold text-safety hover:underline" onClick={() => dispatch(markFalseAlarm, { itemId: m.id, note: "", undo: true }, { undoable: true, label: "Count it again" })}>
                            Count it again
                          </button>
                        )}
                      </p>
                    ) : (
                      canAct &&
                      m.fields.assertion !== "ok" && (
                        <button type="button" className="mt-2 text-xs font-semibold text-steel-400 hover:text-paper-100" onClick={() => setFaItem(m)}>
                          Mark as false alarm
                        </button>
                      )
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="tasks" className="flex flex-col gap-3">
            <SectionHeading id="tasks">Tasks</SectionHeading>
            {openTask ? (
              <div className="panel px-4 py-3.5">
                <p className="font-semibold text-paper-100">{openTask.title}</p>
                <p className="mt-0.5 text-sm text-steel-400">
                  {openTask.claimedById ? `Claimed by ${db.users[openTask.claimedById]?.name} ${fmtRelative(openTask.claimedAt!, now)}` : "Unclaimed"}
                  {openTask.dueAt ? ` · due ${fmtTime(openTask.dueAt)}` : ""}
                </p>
                <div className="mt-3">
                  <TaskActions task={openTask} issue={issue} item={latest} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-steel-400">No open task. A new mention creates one.</p>
            )}
            {tasks
              .filter((t) => t.status === "done")
              .map((t) => (
                <div key={t.id} className="flex items-start gap-3 rounded-lg border border-night-700 px-3 py-2.5">
                  <CircleCheck size={16} className="mt-0.5 flex-none text-go" />
                  <div className="min-w-0 text-sm">
                    <p className="text-steel-100">{t.title}</p>
                    <p className="text-steel-500">
                      {db.users[t.resolvedById ?? ""]?.firstName} · {fmtDateTime(t.resolvedAt!)}
                      {t.resolutionNote ? ` · “${t.resolutionNote}”` : ""}
                    </p>
                  </div>
                </div>
              ))}
          </section>

          <section aria-labelledby="talk" className="flex flex-col gap-3">
            <SectionHeading id="talk">Conversation</SectionHeading>
            {comments.length === 0 && <p className="text-sm text-steel-400">No questions or notes yet.</p>}
            <ul className="flex flex-col gap-3">
              {comments.map((c) => {
                const u = db.users[c.authorId];
                return (
                  <li key={c.id} className="flex gap-3">
                    <Avatar user={u} size={28} />
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold text-paper-100">{u?.firstName}</span> <span className="text-steel-500">{c.kind === "question" ? "asked" : c.kind === "reply" ? "replied" : "noted"} · {fmtRelative(c.at, now)}</span>
                      </p>
                      <p className="text-steel-100">{c.body}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {canAct && (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim().length < 2) return;
                  dispatch(addComment, { entityType: "issue", entityId: issue.id, body: note, kind: "note" }, { toastMessage: "Note added" });
                  setNote("");
                }}
              >
                <label htmlFor="issue-note" className="sr-only">
                  Add a note
                </label>
                <Textarea id="issue-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the next shift" className="min-h-16" />
                <Button type="submit" size="sm" className="self-end" icon={<MessageSquare size={14} />} disabled={note.trim().length < 2}>
                  Add note
                </Button>
              </form>
            )}
          </section>

          <section aria-labelledby="history" className="flex flex-col gap-2">
            <SectionHeading id="history" aside={<Link href={`/audit?entity=${issue.id}`} className="text-sm text-safety hover:underline">Full audit</Link>}>
              History
            </SectionHeading>
            <ol className="flex flex-col">
              {events.slice(0, 10).map((e) => (
                <li key={e.id} className="grid grid-cols-[6.5rem_1fr] gap-3 border-b border-night-700 py-2 text-sm last:border-0">
                  <Mono className="text-xs text-steel-500">{fmtDay(e.at).split(", ")[1]} {fmtTime(e.at)}</Mono>
                  <span className="text-steel-300">
                    <span className="text-paper-100">{e.actorId ? db.users[e.actorId]?.firstName : "Shift Ghost"}</span> {e.summary.charAt(0).toLowerCase() + e.summary.slice(1)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>

      <Tape thin />

      <Dialog
        open={Boolean(faItem)}
        onOpenChange={(o) => !o && setFaItem(null)}
        title="Mark this mention as a false alarm?"
        description="It stays in the timeline, struck through, and stops counting toward patterns. Anyone can count it again."
        footer={
          <>
            <Button onClick={() => setFaItem(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={faNote.trim().length < 3}
              onClick={() => {
                if (faItem) dispatch(markFalseAlarm, { itemId: faItem.id, note: faNote }, { undoable: true, label: "Mark false alarm" });
                setFaItem(null);
                setFaNote("");
              }}
            >
              Mark false alarm
            </Button>
          </>
        }
      >
        <Field label="What did you find?" htmlFor="fa-note" hint="Required, so the pattern page can explain why it isn't counted.">
          <Input id="fa-note" value={faNote} onChange={(e) => setFaNote(e.target.value)} placeholder="Probe was unplugged during cleaning" />
        </Field>
      </Dialog>
    </div>
  );
}

function when(db: ReturnType<typeof useDb>, item: ExtractedItem): string {
  const h = db.handoffs[item.handoffId];
  return item.fields.occurredAt ?? h?.submittedAt ?? h?.createdAt ?? "2026-10-20T22:00:00Z";
}
