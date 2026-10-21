"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ClipboardCopy, Info, Plus, Scale, Ticket } from "lucide-react";
import { useStore } from "@/store/store";
import { useCurrentUser, useDb, useNow, usePatterns } from "@/store/hooks";
import { createTask, fileTicket, markGuide } from "@/domain/commands";
import type { Pattern, PatternMention } from "@/domain/patterns";
import { can, ROLE_TITLE } from "@/domain/permissions";
import { addDays, at, dayKey, fmtDateTime, fmtShortWeekday, fmtTime } from "@/domain/time";
import { Avatar, Button, ButtonLink, Mono, SectionHeading, StatusLight, Tape, cx } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/form";
import { EmptyState, PermissionDenied } from "@/components/ui/states";
import { DayTimeGrid, StoreMatrix } from "./PatternViz";

export function Patterns() {
  const db = useDb();
  const me = useCurrentUser();
  const now = useNow();
  const all = usePatterns();
  const dispatch = useStore((s) => s.dispatch);
  const allStores = can(me, "view_all_locations");
  const [scope, setScope] = useState<string>(allStores ? "all" : me.locationIds[0]);
  const visible = all.filter((p) => scope === "all" || p.locationIds.includes(scope));
  const strong = visible.filter((p) => !p.belowThreshold);
  const watch = visible.filter((p) => p.belowThreshold);

  // Step 6 of the demo story: the ice machine pattern has been seen.
  const ice = all.find((p) => p.subjectKey === "asset:ice-machine" && p.count >= 6);
  useEffect(() => {
    if (ice && !db.demo.guide.pattern) dispatch(markGuide, { step: "pattern" }, { silent: true, local: true });
  }, [ice, db.demo.guide.pattern, dispatch]);

  // Jump to #anchor after render
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);

  const stores = (allStores ? Object.values(db.locations) : Object.values(db.locations).filter((l) => me.locationIds.includes(l.id))).map((l) => ({ id: l.id, name: l.name }));
  const matrix = useMemo(
    () =>
      all
        .filter((p) => p.count >= 2)
        .slice(0, 7)
        .map((p) => {
          const counts: Record<string, number> = {};
          p.mentions.forEach((m) => (counts[m.locationId] = (counts[m.locationId] ?? 0) + 1));
          return { label: p.label, counts, href: `#${p.id}` };
        }),
    [all],
  );

  if (!can(me, "view_patterns")) return <PermissionDenied permission="view_patterns" what="Pattern intelligence" role={ROLE_TITLE[me.role]} />;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="font-mono text-sm text-steel-500">Last {db.settings.thresholds.patternWindowDays} days · {Object.values(db.handoffs).filter((h) => h.status === "published").length} closeouts read</p>
          <h1 className="mt-1 font-display text-[2.4rem] font-bold leading-none tracking-wide sm:text-6xl">What keeps coming back</h1>
          <p className="mt-3 text-steel-300">
            Shift Ghost counts what crews said at close, across nights and stores. It shows when things happen and what happens together. It doesn&apos;t claim to know why.
          </p>
        </div>
        {allStores && (
          <Segmented
            label="Stores"
            value={scope}
            onChange={setScope}
            options={[{ value: "all", label: "All stores" }, ...Object.values(db.locations).map((l) => ({ value: l.id, label: l.name }))]}
          />
        )}
      </div>

      {strong.length === 0 ? (
        <EmptyState title="Nothing repeating yet" body={`A subject becomes a pattern after ${db.settings.thresholds.patternMinMentions} mentions in ${db.settings.thresholds.patternWindowDays} days. Keep closing out; this fills in on its own.`} />
      ) : (
        <div className="flex flex-col gap-6">
          {strong.map((p) => (
            <PatternCard key={p.id} pattern={p} now={now} />
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        {watch.length > 0 && (
          <section aria-labelledby="watch">
            <SectionHeading id="watch">Below the threshold</SectionHeading>
            <p className="mb-3 mt-1 text-sm text-steel-400">Mentioned more than once, but not {db.settings.thresholds.patternMinMentions} times yet. Change the threshold in setup.</p>
            <ul className="flex flex-col gap-2">
              {watch.map((p) => (
                <li key={p.id} id={p.id} className="panel flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <StatusLight tone={p.falseAlarms.length ? "watch" : "normal"} size={10} />
                  <span className="min-w-0 flex-1 text-paper-100">{p.headline}</span>
                  {p.falseAlarms.length > 0 && <span className="text-sm text-steel-400">+{p.falseAlarms.length} false alarm, not counted</span>}
                  {p.issueIds[0] && (
                    <Link href={`/issues/${p.issueIds[0]}`} className="text-sm font-semibold text-safety hover:underline">
                      Open thread
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {allStores && matrix.length > 0 && (
          <section aria-labelledby="matrix">
            <SectionHeading id="matrix">Across stores</SectionHeading>
            <p className="mb-3 mt-1 text-sm text-steel-400">Mentions in the window, by store.</p>
            <StoreMatrix rows={matrix} stores={stores} />
          </section>
        )}
      </div>
    </div>
  );
}

function PatternCard({ pattern: p, now }: { pattern: Pattern; now: string }) {
  const db = useDb();
  const me = useCurrentUser();
  const dispatch = useStore((s) => s.dispatch);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const days = Math.max(9, Math.min(14, p.spanDays + 1));
  const trail = [...p.mentions, ...p.okReports, ...p.falseAlarms].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const shown = showAll ? trail : trail.slice(0, 4);
  const maint = db.connectors["cx-maintenance"];
  const issueId = p.issueIds[0];
  const loc = db.locations[p.locationIds[0]];
  const opener = Object.values(db.users).find((u) => u.role === "opening_manager" && u.locationIds.includes(loc.id));

  const copyTrail = async () => {
    const text = [p.headline, p.observation, p.caution, "", ...trail.map((m) => `${fmtDateTime(m.at)} · ${db.locations[m.locationId].name} · ${db.users[m.authorId]?.name}: “${m.sentence}”`)].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      dispatch(markGuide, { step: "pattern" }, { local: true, toastMessage: "Evidence trail copied" });
    } catch {
      dispatch(markGuide, { step: "pattern" }, { local: true, toastMessage: "Copy blocked by the browser. Select the trail below instead." });
    }
  };

  return (
    <article id={p.id} className="panel scroll-mt-24 overflow-hidden" aria-labelledby={`${p.id}-h`}>
      {p.severity === "critical" && <Tape thin className="rounded-none" />}
      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusLight tone={p.severity === "critical" ? "critical" : p.severity === "high" ? "high" : "normal"} pulse={p.severity === "critical"} size={11} />
            <span className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-steel-400">
              {p.scope === "cross-location" ? "Across stores" : db.locations[p.locationIds[0]].name} · {p.label}
            </span>
          </div>
          <h2 id={`${p.id}-h`} className="mt-2 font-display text-3xl font-bold leading-tight tracking-wide text-paper-50 sm:text-[2.3rem]">
            {p.headline}
          </h2>
          <div className="mt-4 rounded-lg border border-night-600 bg-night-900/60 px-2 pb-2 pt-3">
            <DayTimeGrid pattern={p} end={p.lastAt > now ? p.lastAt : now} days={days} selected={selected} onSelect={(m) => setSelected(m.itemId)} />
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 px-2 text-xs text-steel-400">
              <span className="inline-flex items-center gap-1.5">
                <StatusLight tone={p.severity === "critical" ? "critical" : "high"} size={8} /> Fault reported
              </span>
              {p.okReports.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-go" /> Said it was fine
                </span>
              )}
              {p.falseAlarms.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-steel-500" /> False alarm (not counted)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3">
            <Stat label="Mentions" value={`${p.count}`} sub={`in ${p.spanDays} days`} />
            {p.afterHour ? <Stat label="After 8 PM" value={`${p.afterHour.count} of ${p.afterHour.of}`} sub="when it was reported" /> : <Stat label="Stores" value={`${p.locationIds.length}`} sub={p.locationIds.map((id) => db.locations[id].code).join(" · ")} />}
            {p.laborMinutes > 0 && <Stat label="Crew time" value={`≈${Math.round((p.laborMinutes / 60) * 10) / 10} h`} sub={`crew-reported, ${p.laborStated} of ${p.count} mentions`} />}
            {p.transfers.length > 0 && <Stat label="Store-to-store transfers" value={`${p.transfers.length}`} sub="borrowed to cover a night" />}
            {p.contradictions.length > 0 && <Stat label="Reports disagree" value={`${p.okReports.length}`} sub="said it was fine" />}
          </dl>
          <p className="text-steel-100">{p.observation}</p>
          <p className="flex gap-2 rounded-lg border border-night-600 bg-night-900/60 px-3 py-2.5 text-sm text-steel-300">
            <Info size={16} className="mt-0.5 flex-none text-steel-400" />
            {p.caution}
          </p>
          {p.contradictions.length > 0 && <Contradiction p={p} />}
          <div>
            <p className="mb-2 text-sm font-medium text-steel-100">Worth trying next</p>
            <ul className="mb-3 list-inside list-disc text-sm text-steel-300">
              {p.nextSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              {can(me, "act_on_tasks") && p.scope === "location" && (
                <Button
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={() =>
                    dispatch(
                      createTask,
                      {
                        locationId: loc.id,
                        title: p.topic === "refrigeration" || p.topic === "cooking" ? `Book a technician for the ${p.label.toLowerCase()}` : `Follow up on ${p.label.toLowerCase()}`,
                        detail: p.headline,
                        kind: "service",
                        ownerId: opener?.id ?? null,
                        dueAt: at(addDays(dayKey(now), now.slice(11, 13) < "14" ? 0 : 1), "12:00"),
                        dueLabel: "by noon",
                        issueId: issueId ?? null,
                      },
                      { undoable: true, label: "Create service task", toastMessage: `Task created for ${opener?.firstName ?? "the opening manager"}` },
                    )
                  }
                >
                  Create a service task
                </Button>
              )}
              {issueId &&
                p.topic !== "stock" &&
                (maint.status === "connected" ? (
                  <Button size="sm" icon={<Ticket size={14} />} onClick={() => dispatch(fileTicket, { connectorId: maint.id, issueId, summary: `${p.headline} (${p.count} quotes attached)` })}>
                    Send to {maint.name.toLowerCase()}
                  </Button>
                ) : (
                  <ButtonLink href="/settings#integrations" size="sm" icon={<Ticket size={14} />}>
                    Connect maintenance tickets
                  </ButtonLink>
                ))}
              <Button size="sm" variant="ghost" icon={<ClipboardCopy size={14} />} onClick={copyTrail}>
                Copy evidence trail
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-night-600 px-5 py-4 lg:px-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold uppercase tracking-[0.12em] text-steel-400">Evidence trail</h3>
          {issueId && (
            <Link href={`/issues/${issueId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-safety hover:underline">
              Open the full thread <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
        <ol className="flex flex-col">
          {shown.map((m) => (
            <TrailRow key={m.itemId} m={m} active={selected === m.itemId} onSelect={() => setSelected(m.itemId)} />
          ))}
        </ol>
        {trail.length > 4 && (
          <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 text-sm font-semibold text-steel-300 hover:text-paper-100">
            {showAll ? "Show fewer" : `Show all ${trail.length}`}
          </button>
        )}
      </div>
    </article>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-night-600 bg-night-850 px-3 py-2.5">
      <dt className="text-xs text-steel-400">{label}</dt>
      <dd>
        <Mono className="text-2xl text-paper-50">{value}</Mono>
        <span className="block text-xs text-steel-500">{sub}</span>
      </dd>
    </div>
  );
}

function TrailRow({ m, active, onSelect }: { m: PatternMention; active: boolean; onSelect: () => void }) {
  const db = useDb();
  const u = db.users[m.authorId];
  const label = { fault: null, ok: "Said it was fine", false_alarm: "False alarm", handled: "Handled on shift", transfer: "Transfer" }[m.state];
  return (
    <li className={cx("grid grid-cols-[auto_1fr] gap-x-3 border-b border-night-700 py-2.5 last:border-0 sm:grid-cols-[7.5rem_auto_1fr]", active && "bg-night-700/40")}>
      <button type="button" onClick={onSelect} className="col-span-2 text-left font-mono text-xs text-steel-400 sm:col-span-1 sm:pt-0.5">
        {fmtShortWeekday(m.at)} {m.at.slice(8, 10)} · {m.timed ? fmtTime(m.at) : "no time"}
      </button>
      <Avatar user={u} size={22} className="mt-0.5" />
      <div className="min-w-0">
        <Link href={`/handoffs/${m.handoffId}`} className="text-[0.95rem] text-steel-100 hover:underline">
          “{m.sentence}”
        </Link>
        <p className="text-xs text-steel-500">
          {u?.name} · {db.locations[m.locationId].name}
          {label && <span className={cx("ml-2 font-semibold", m.state === "ok" ? "text-go" : m.state === "false_alarm" ? "text-steel-300" : "text-steel-400")}>{label}</span>}
          {m.falseAlarmNote && <span className="text-steel-400"> · {m.falseAlarmNote}</span>}
        </p>
      </div>
    </li>
  );
}

function Contradiction({ p }: { p: Pattern }) {
  const db = useDb();
  const c = p.contradictions[p.contradictions.length - 1];
  const side = (m: PatternMention, tone: "fault" | "ok") => (
    <div className={cx("rounded-lg border px-3 py-2.5", tone === "fault" ? "border-safety/40" : "border-go/40")}>
      <p className="font-mono text-[0.7rem] text-steel-400">
        {fmtDateTime(m.at)} · {db.users[m.authorId]?.firstName}
      </p>
      <p className="mt-1 text-sm text-steel-100">“{m.sentence}”</p>
    </div>
  );
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-steel-100">
        <Scale size={15} className="text-amber" /> Reports disagree. Shift Ghost doesn&apos;t pick a side.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {side(c.fault, "fault")}
        {side(c.ok, "ok")}
      </div>
    </div>
  );
}
