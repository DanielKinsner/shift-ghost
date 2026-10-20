"use client";

import { useState } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, Ellipsis, Eye, Hand, MessageCircleQuestion, RotateCcw, Siren } from "lucide-react";
import { useStore } from "@/store/store";
import { useCurrentUser, useDb } from "@/store/hooks";
import { acknowledge, addComment, askPreviousShift, claimTask, escalate, reopenTask, resolveTask, unclaimTask } from "@/domain/commands";
import { AskSchema, EscalateSchema, ResolveSchema, fieldErrors } from "@/domain/schemas";
import { can, ROLE_TITLE } from "@/domain/permissions";
import { cannedReply } from "@/data/replies";
import type { Channel, ExtractedItem, Issue, Task } from "@/domain/types";
import { Button, cx } from "@/components/ui/primitives";
import { Dialog, Sheet } from "@/components/ui/overlay";
import { Field, Select, Textarea } from "@/components/ui/form";

/**
 * Acknowledge, Claim, Resolve, Escalate and Ask previous shift, for one task/issue.
 * Every action is optimistic with undo; task writes carry the version the UI saw.
 */
export function TaskActions({ task, issue, item, onPaper, compact }: { task: Task | null; issue: Issue | null; item: ExtractedItem | null; onPaper?: boolean; compact?: boolean }) {
  const db = useDb();
  const me = useCurrentUser();
  const dispatch = useStore((s) => s.dispatch);
  const dispatchTask = useStore((s) => s.dispatchTask);
  const [resolving, setResolving] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [asking, setAsking] = useState(false);
  const canAct = can(me, "act_on_tasks");
  const canEscalate = can(me, "escalate");
  const acked = Object.values(db.acknowledgments).some((a) => a.userId === me.id && ((task && a.entityType === "task" && a.entityId === task.id) || (issue && a.entityType === "issue" && a.entityId === issue.id)));
  const done = task?.status === "done";
  const mine = task?.claimedById === me.id;
  const author = item ? db.users[db.handoffs[item.handoffId]?.authorId ?? ""] : null;

  const quiet = onPaper ? ("paperOutline" as const) : ("secondary" as const);

  const claim = () => task && dispatchTask(claimTask, { taskId: task.id, expectedVersion: task.version }, { undoable: true, label: `Claim “${task.title}”`, toastMessage: "Claimed. It's yours." });
  const release = () => task && dispatchTask(unclaimTask, { taskId: task.id, expectedVersion: task.version }, { undoable: true, label: `Release “${task.title}”` });
  const ack = () => dispatch(acknowledge, { entityType: task ? "task" : "issue", entityId: (task?.id ?? issue?.id)! }, { undoable: true, label: "Acknowledge", toastMessage: "Acknowledged" });

  const primary = done ? (
    <Button size="sm" variant={quiet} onClick={() => task && dispatchTask(reopenTask, { taskId: task.id, expectedVersion: task.version }, { undoable: true, label: "Reopen", toastMessage: "Reopened" })} icon={<RotateCcw size={14} />} disabled={!canAct}>
      Reopen
    </Button>
  ) : task && !task.claimedById ? (
    <Button size="sm" variant={onPaper ? "paper" : "primary"} onClick={claim} icon={<Hand size={14} />} disabled={!canAct}>
      Claim
    </Button>
  ) : task && mine ? (
    <Button size="sm" variant={onPaper ? "paper" : "primary"} onClick={() => setResolving(true)} icon={<Check size={14} />} disabled={!canAct}>
      Resolve
    </Button>
  ) : task ? (
    <Button size="sm" variant={quiet} onClick={claim} icon={<Hand size={14} />} disabled={!canAct}>
      Take over
    </Button>
  ) : null;

  const secondary = (
    <>
      {task && !done && !mine && task.claimedById === null && (
        <Button size="sm" variant={quiet} onClick={() => setResolving(true)} icon={<Check size={14} />} disabled={!canAct}>
          Resolve
        </Button>
      )}
      {!acked && !done && (
        <Button size="sm" variant={quiet} onClick={ack} icon={<Eye size={14} />}>
          Acknowledge
        </Button>
      )}
      {issue && canEscalate && !done && (
        <Button size="sm" className={cx(onPaper && "text-paper-red")} variant={quiet} onClick={() => setEscalating(true)} icon={<Siren size={14} />}>
          Escalate
        </Button>
      )}
      {author && !done && (
        <Button size="sm" variant={quiet} onClick={() => setAsking(true)} icon={<MessageCircleQuestion size={14} />}>
          Ask {author.firstName}
        </Button>
      )}
      {mine && !done && (
        <Button size="sm" variant={onPaper ? "paperOutline" : "ghost"} className={cx(onPaper && "border-transparent")} onClick={release}>
          Release
        </Button>
      )}
    </>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {primary}
      {!compact && <span className="hidden sm:contents">{secondary}</span>}
      <span className={compact ? "contents" : "contents sm:hidden"}>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button type="button" className={cx("grid h-8 w-8 place-items-center rounded-md", onPaper ? "border border-ink/25 text-ink" : "border border-night-500 text-steel-300")} aria-label="More actions">
              <Ellipsis size={16} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="start" sideOffset={6} className="panel-raised z-[65] min-w-48 p-1">
              {task && !done && !mine && (
                <MenuItem onSelect={() => setResolving(true)}>
                  <Check size={14} /> Resolve
                </MenuItem>
              )}
              {!acked && !done && (
                <MenuItem onSelect={ack}>
                  <Eye size={14} /> Acknowledge
                </MenuItem>
              )}
              {issue && canEscalate && !done && (
                <MenuItem onSelect={() => setEscalating(true)}>
                  <Siren size={14} /> Escalate
                </MenuItem>
              )}
              {author && !done && (
                <MenuItem onSelect={() => setAsking(true)}>
                  <MessageCircleQuestion size={14} /> Ask {author.firstName}
                </MenuItem>
              )}
              {mine && !done && <MenuItem onSelect={release}>Release task</MenuItem>}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </span>

      {task && resolving && <ResolveDialog onClose={() => setResolving(false)} task={task} issue={issue} />}
      {issue && <EscalateDialog open={escalating} onClose={() => setEscalating(false)} issue={issue} task={task} />}
      {author && <AskSheet open={asking} onClose={() => setAsking(false)} task={task} issue={issue} item={item} authorName={author.firstName} authorId={author.id} />}
      <span className="sr-only">{ROLE_TITLE[me.role]}</span>
    </div>
  );
}

function MenuItem({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <DropdownMenu.Item onSelect={onSelect} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-paper-100 outline-none data-[highlighted]:bg-night-600">
      {children}
    </DropdownMenu.Item>
  );
}

function ResolveDialog({ onClose, task, issue }: { onClose: () => void; task: Task; issue: Issue | null }) {
  const dispatchTask = useStore((s) => s.dispatchTask);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<"resolved" | "monitoring" | "keep">(task.kind === "service" ? "monitoring" : "resolved");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Resolve this task"
      description={task.title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={<Check size={15} />}
            onClick={() => {
              const r = ResolveSchema.safeParse({ note });
              if (!r.success) return setError(r.error.issues[0].message);
              dispatchTask(resolveTask, { taskId: task.id, expectedVersion: task.version, note: r.data.note, issueOutcome: issue ? outcome : "keep" }, { undoable: true, label: `Resolve “${task.title}”`, toastMessage: "Resolved" });
              onClose();
            }}
          >
            Mark resolved
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="What did you do? (optional)" htmlFor="rs-note" error={error} hint="The closing crew sees this tonight.">
          <Textarea id="rs-note" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20" placeholder={task.kind === "call" ? "Called at 9:40, refund confirmed by the processor." : "Checked at 6:30, running clean."} />
        </Field>
        {issue && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-steel-100">And the underlying issue?</legend>
            {(
              [
                ["resolved", "Fixed. Close the issue.", "A new mention will reopen it."],
                ["monitoring", "Handled for today. Keep watching.", "Stays on the patterns page."],
                ["keep", "Still a problem.", "Leaves the issue open with no owner."],
              ] as const
            ).map(([v, label, hint]) => (
              <label key={v} className={cx("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5", outcome === v ? "border-safety/70 bg-night-800" : "border-night-600")}>
                <input type="radio" name="outcome" className="mt-1 accent-[#ff6b1a]" checked={outcome === v} onChange={() => setOutcome(v)} />
                <span>
                  <span className="block text-paper-100">{label}</span>
                  <span className="block text-sm text-steel-500">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </div>
    </Dialog>
  );
}

function EscalateDialog({ open, onClose, issue, task }: { open: boolean; onClose: () => void; issue: Issue; task: Task | null }) {
  const db = useDb();
  const me = useCurrentUser();
  const dispatch = useStore((s) => s.dispatch);
  const targets = Object.values(db.users).filter((u) => u.appUser && u.id !== me.id && (u.role === "area_manager" || (u.locationIds.includes(issue.locationId) && u.role !== "crew")));
  const [form, setForm] = useState({ toUserId: targets.find((t) => t.role === "area_manager")?.id ?? targets[0]?.id ?? "", channel: "sms" as Channel, note: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const critical = issue.severity === "critical";
  const to = db.users[form.toUserId];
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      tone={critical ? "critical" : "default"}
      title={critical ? "Escalate a critical issue?" : "Escalate this issue"}
      description={critical ? `This sends a ${form.channel === "sms" ? "text" : form.channel.replace("_", " ")} to ${to?.name ?? "someone"} right now and marks the issue escalated for everyone.` : issue.title}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={critical ? "danger" : "primary"}
            icon={<Siren size={15} />}
            onClick={() => {
              const r = EscalateSchema.safeParse(form);
              if (!r.success) return setErrors(fieldErrors(r.error));
              dispatch(escalate, { issueId: issue.id, taskId: task?.id, ...r.data }, { undoable: true, label: `Escalate “${issue.title}”` });
              onClose();
            }}
          >
            {critical ? `Yes, escalate to ${to?.firstName ?? "them"}` : "Escalate"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {critical && <p className="rounded-lg border border-night-600 bg-night-900 px-3 py-2 font-medium text-paper-100">{issue.title}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="To" htmlFor="es-to" error={errors.toUserId}>
            <Select id="es-to" value={form.toUserId} onChange={(e) => setForm({ ...form, toUserId: e.target.value })}>
              {targets.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {ROLE_TITLE[u.role]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How" htmlFor="es-ch">
            <Select id="es-ch" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as Channel })}>
              <option value="sms">Text message</option>
              <option value="push">Push notification</option>
              <option value="team_chat">Team chat</option>
              <option value="email">Email</option>
            </Select>
          </Field>
        </div>
        <Field label="Note" htmlFor="es-note" error={errors.note} hint="Say what you need from them.">
          <Textarea id="es-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="min-h-20" placeholder="Need a service call approved before lunch." />
        </Field>
      </div>
    </Dialog>
  );
}

const SUGGESTIONS: Record<string, string[]> = {
  maintenance: ["Is it still making the noise?", "Did anyone call service?", "Where did you leave the backup?"],
  inventory: ["Is that count from the walk-in or dry storage too?", "Are they sending any back?"],
  customer: ["Do you have the receipt number?", "Did you promise them a time?"],
  task: ["What does she still need to learn?", "Who should walk her through it?"],
  incident: ["What time exactly?", "Did anything look tampered with?"],
};

function AskSheet({ open, onClose, task, issue, item, authorName, authorId }: { open: boolean; onClose: () => void; task: Task | null; issue: Issue | null; item: ExtractedItem | null; authorName: string; authorId: string }) {
  const db = useDb();
  const dispatch = useStore((s) => s.dispatch);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const entityType = issue ? "issue" : "task";
  const entityId = (issue?.id ?? task?.id)!;
  const send = () => {
    const r = AskSchema.safeParse({ body });
    if (!r.success) return setError(r.error.issues[0].message);
    const res = dispatch(askPreviousShift, { entityType, entityId, body: r.data.body }, { toastMessage: `Sent to ${authorName}` });
    if (res && db.demo.network === "online") {
      // Demo: the closer answers from home a few seconds later.
      const asker = db.demo.currentUserId;
      setTimeout(() => {
        useStore.getState().dispatch(addComment, { entityType, entityId, body: cannedReply(item), kind: "reply", toUserId: asker, authorId }, { toastMessage: `${authorName} replied`, actorId: authorId });
      }, 4200);
    }
    setBody("");
    setError(null);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Ask ${authorName} about last night`}
      description={item ? `About: ${item.title}` : undefined}
      footer={
        <Button variant="primary" className="w-full" onClick={send} icon={<MessageCircleQuestion size={16} />}>
          Send to {authorName}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {item && (
          <blockquote className="rounded-lg border border-night-600 bg-night-900 px-3 py-2 text-sm text-steel-300">“{db.evidence[item.evidenceIds[0]]?.text}”</blockquote>
        )}
        <Field label="Your question" htmlFor="ask-body" error={error} hint={`${authorName} gets a push. Replies land on this item and in your notifications.`}>
          <Textarea id="ask-body" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-24" />
        </Field>
        <div className="flex flex-wrap gap-2">
          {(SUGGESTIONS[item?.kind ?? "maintenance"] ?? []).map((s) => (
            <button key={s} type="button" onClick={() => setBody(s)} className="rounded-full border border-night-500 px-3 py-1.5 text-sm text-steel-300 hover:border-steel-500 hover:text-paper-100">
              {s}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
