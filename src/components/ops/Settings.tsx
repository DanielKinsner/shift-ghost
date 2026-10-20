"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Braces, Plug, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store/store";
import { useBriefing, useCurrentUser, useDb, useNow } from "@/store/hooks";
import { activeQuestions, restartOnboarding, sendTestDelivery, setConnector, updateSettings } from "@/domain/commands";
import { RetentionSchema, fieldErrors } from "@/domain/schemas";
import { can } from "@/domain/permissions";
import { fmtDateTime, fmtRelative } from "@/domain/time";
import type { Connector } from "@/domain/types";
import { Button, Mono, SectionHeading, StatusLight, cx } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";

export function Settings() {
  const db = useDb();
  const me = useCurrentUser();
  const now = useNow();
  const router = useRouter();
  const dispatch = useStore((s) => s.dispatch);
  const editable = can(me, "edit_settings");
  const [retention, setRetention] = useState({ audioDays: String(db.settings.retention.audioDays), transcriptDays: String(db.settings.retention.transcriptDays) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const recordings = Object.values(db.handoffs).filter((h) => h.audio.hasRecording);
  const deleted = Object.values(db.handoffs).filter((h) => h.audio.deletedAt);

  return (
    <div className="flex flex-col gap-10">
      <div className="max-w-2xl">
        <h1 className="font-display text-[2.4rem] font-bold leading-none tracking-wide sm:text-6xl">Settings</h1>
        <p className="mt-3 text-steel-300">Data retention, where briefs get sent, and the questions crews answer at close.</p>
        {!editable && <p className="mt-2 text-sm text-amber">You can read these. Only the area manager can change them.</p>}
      </div>

      <section aria-labelledby="retention" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <SectionHeading id="retention">Recordings and retention</SectionHeading>
          <p className="mt-2 text-steel-300">
            Audio is the most sensitive thing Shift Ghost holds, so it expires first. Transcripts and evidence stay longer because patterns and the audit trail depend on them.
          </p>
          <ul className="mt-4 flex flex-col gap-2 text-sm text-steel-300">
            <li className="flex items-center gap-2">
              <StatusLight tone="ok" size={8} /> <Mono>{recordings.length}</Mono> recordings stored
            </li>
            <li className="flex items-center gap-2">
              <StatusLight tone="normal" size={8} /> <Mono>{deleted.length}</Mono> deleted by a person before expiry
            </li>
            <li className="flex items-center gap-2">
              <StatusLight tone="normal" size={8} /> Delete any single recording from its closeout page. The transcript stays.
            </li>
          </ul>
        </div>
        <form
          className="panel flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            const r = RetentionSchema.safeParse(retention);
            if (!r.success) return setErrors(fieldErrors(r.error));
            setErrors({});
            dispatch(updateSettings, { settings: { ...db.settings, retention: r.data } }, { undoable: true, label: "Update retention" });
          }}
        >
          <Field label="Keep audio recordings for" htmlFor="rt-audio" error={errors.audioDays} hint="Then they're deleted automatically.">
            <div className="flex items-center gap-2">
              <div className="w-28">
                <Input id="rt-audio" type="number" inputMode="numeric" className="font-mono" disabled={!editable} value={retention.audioDays} onChange={(e) => setRetention({ ...retention, audioDays: e.target.value })} />
              </div>
              <span className="text-sm text-steel-400">days</span>
            </div>
          </Field>
          <Field label="Keep transcripts and evidence for" htmlFor="rt-tx" error={errors.transcriptDays}>
            <div className="flex items-center gap-2">
              <div className="w-28">
                <Input id="rt-tx" type="number" inputMode="numeric" className="font-mono" disabled={!editable} value={retention.transcriptDays} onChange={(e) => setRetention({ ...retention, transcriptDays: e.target.value })} />
              </div>
              <span className="text-sm text-steel-400">days</span>
            </div>
          </Field>
          {editable && (
            <Button type="submit" variant="primary" className="self-start">
              Save retention
            </Button>
          )}
        </form>
      </section>

      <section id="integrations" aria-labelledby="int-h" className="scroll-mt-24">
        <SectionHeading id="int-h">Where briefs and tickets go</SectionHeading>
        <p className="mt-2 max-w-3xl text-steel-300">
          Shift Ghost sends into the tools managers already use. In this demo the connectors are simulated: you can see exactly what would be sent, and sending writes to a delivery log instead of a real system.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {Object.values(db.connectors).map((c) => (
            <ConnectorCard key={c.id} c={c} editable={editable} now={now} />
          ))}
        </div>
      </section>

      <section aria-labelledby="qs" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <SectionHeading id="qs">Closeout questions</SectionHeading>
          <ol className="mt-3 flex flex-col gap-2">
            {activeQuestions(db).map((q, i) => (
              <li key={q.id} className="flex gap-3 text-steel-100">
                <Mono className="text-steel-500">{i + 1}</Mono> {q.prompt}
              </li>
            ))}
          </ol>
        </div>
        <div className="panel flex flex-col items-start gap-3 p-5">
          <p className="text-steel-300">
            Change the questions, shift times, rules and recipients in setup. Your history stays; new closeouts use the new setup.
          </p>
          <p className="text-sm text-steel-500">Setup {db.setup.completedAt ? `${db.setup.skipped ? "skipped" : "completed"} ${fmtDateTime(db.setup.completedAt)}` : `in progress, step ${db.setup.step + 1} of 5`}.</p>
          {editable && (
            <Button
              icon={<RotateCcw size={15} />}
              onClick={() => {
                dispatch(restartOnboarding, {}, { silent: true, local: true });
                router.push("/setup");
              }}
            >
              Run setup again
            </Button>
          )}
          <Link href="/rules" className="text-sm font-semibold text-safety hover:underline">
            Edit rules
          </Link>
        </div>
      </section>
    </div>
  );
}

function ConnectorCard({ c, editable, now }: { c: Connector; editable: boolean; now: string }) {
  const db = useDb();
  const dispatch = useStore((s) => s.dispatch);
  const view = useBriefing("loc-dtn");
  const [payloadOpen, setPayloadOpen] = useState(false);
  const payload = useMemo(() => buildPayload(c, view, db.organization.name), [c, view, db.organization.name]);
  const connected = c.status === "connected";
  return (
    <article className={cx("panel flex flex-col p-5", !connected && "border-dashed")}>
      <div className="flex items-start gap-3">
        <span className={cx("grid h-10 w-10 flex-none place-items-center rounded-lg", connected ? "bg-night-600 text-safety" : "bg-night-800 text-steel-500")}>
          <Plug size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-paper-100">{c.name}</p>
          <p className="text-sm text-steel-400">{c.description}</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-steel-300">
          <StatusLight tone={connected ? "ok" : "normal"} off={!connected} size={8} />
          {connected ? "Connected" : "Not connected"}
        </span>
      </div>
      {connected && <p className="mt-3 text-sm text-steel-300">Sends to <span className="font-medium text-paper-100">{c.target}</span></p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" icon={<Braces size={14} />} onClick={() => setPayloadOpen(true)}>
          Preview payload
        </Button>
        {connected && (
          <Button size="sm" icon={<Send size={14} />} onClick={() => dispatch(sendTestDelivery, { connectorId: c.id, summary: payload.summary })}>
            Send test
          </Button>
        )}
        {editable && (
          <Button size="sm" variant={connected ? "ghost" : "primary"} className="ml-auto" onClick={() => dispatch(setConnector, { connectorId: c.id, status: connected ? "available" : "connected" })}>
            {connected ? "Disconnect" : "Connect"}
          </Button>
        )}
      </div>
      {c.deliveries.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1 border-t border-night-600 pt-3 text-sm">
          {c.deliveries.slice(0, 3).map((d) => (
            <li key={d.id} className="flex gap-2 text-steel-300">
              <StatusLight tone="ok" size={7} className="mt-1.5" />
              <span className="min-w-0 flex-1 truncate">{d.summary}</span>
              <Mono className="text-xs text-steel-500">{fmtRelative(d.at, now)}</Mono>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={payloadOpen} onOpenChange={setPayloadOpen} title={`${c.name} payload`} description="What Shift Ghost would send, built from the current Downtown brief." wide>
        <pre className="max-h-[50vh] overflow-auto rounded-lg border border-night-600 bg-night-950 p-4 font-mono text-xs leading-relaxed text-steel-100">{JSON.stringify(payload.body, null, 2)}</pre>
      </Dialog>
    </article>
  );
}

function buildPayload(c: Connector, view: ReturnType<typeof useBriefing>, org: string) {
  const risks = view.risks.map((r) => ({ severity: r.severity, title: r.title, task: r.task?.title ?? null, due: r.task?.dueAt ?? null, owner: r.task?.claimedById ?? r.task?.ownerId ?? null, evidence: r.item ? `handoff:${r.item.handoffId}` : null }));
  if (c.kind === "team_chat") {
    return {
      summary: `Opening brief for ${view.location.name}, ${risks.length} risks`,
      body: { channel: c.target, text: `Opening brief · ${view.location.name}`, blocks: risks.map((r) => ({ type: "section", text: `*${r.severity.toUpperCase()}* ${r.title}${r.task ? `\n→ ${r.task}` : ""}` })) },
    };
  }
  if (c.kind === "maintenance") {
    const eq = view.risks.find((r) => r.item?.kind === "maintenance");
    return {
      summary: `Ticket: ${eq?.title ?? "equipment issue"}`,
      body: { queue: c.target, priority: eq?.severity === "critical" ? "P1" : "P3", site: `${org} · ${view.location.name}`, subject: eq?.title ?? null, evidence: eq?.item ? [eq.item.facts.join("; ")] : [], source: "shift-ghost" },
    };
  }
  if (c.kind === "inventory") {
    const order = [...view.risks, ...view.mustDo].find((r) => r.task?.kind === "order_prep");
    return { summary: `Draft order from ${order?.task?.title ?? "order prep"}`, body: { vendorPortal: c.target, store: view.location.code, lines: order?.task?.detail.split(" · ") ?? [], status: "draft" } };
  }
  return { summary: `Schedule sync for ${view.location.name}`, body: { source: c.target, reads: ["opening manager", "closing manager"], date: view.openingDate } };
}
