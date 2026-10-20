"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { useCurrentUser, useDb } from "@/store/hooks";
import { can, ROLE_TITLE } from "@/domain/permissions";
import { dayKey, fmtDay, fmtTime } from "@/domain/time";
import type { AuditEvent } from "@/domain/types";
import { Avatar, Button, Mono, cx } from "@/components/ui/primitives";
import { Input, Select } from "@/components/ui/form";
import { EmptyState, PermissionDenied } from "@/components/ui/states";
import { GhostMark } from "@/components/ui/brand";

const GROUPS: Record<string, string> = {
  all: "Everything",
  handoff: "Closeouts",
  item: "Review decisions",
  task: "Tasks",
  issue: "Issues",
  rule: "Rules",
  other: "Settings and people",
};

function groupOf(e: AuditEvent): string {
  if (["handoff", "item", "task", "issue", "rule"].includes(e.entityType)) return e.entityType;
  return "other";
}

export function Audit() {
  const db = useDb();
  const me = useCurrentUser();
  const params = useSearchParams();
  const entity = params.get("entity");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const [actor, setActor] = useState("all");
  const [store, setStore] = useState(can(me, "view_all_locations") ? "all" : me.locationIds[0]);
  const [limit, setLimit] = useState(80);

  const events = useMemo(() => {
    const issue = entity ? db.issues[entity] : null;
    const related = issue ? new Set([issue.id, ...issue.itemIds, ...Object.values(db.tasks).filter((t) => t.issueId === issue.id).map((t) => t.id)]) : null;
    return Object.values(db.audit)
      .filter((e) => !related || related.has(e.entityId))
      .filter((e) => group === "all" || groupOf(e) === group)
      .filter((e) => actor === "all" || (actor === "system" ? !e.actorId : e.actorId === actor))
      .filter((e) => store === "all" || e.locationId === store || e.locationId === null)
      .filter((e) => !q.trim() || `${e.summary} ${e.detail ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id));
  }, [db, entity, group, actor, store, q]);

  if (!can(me, "view_audit")) return <PermissionDenied permission="view_audit" what="The audit trail" role={ROLE_TITLE[me.role]} />;

  const shown = events.slice(0, limit);
  const byDay = shown.reduce<Record<string, AuditEvent[]>>((acc, e) => {
    (acc[dayKey(e.at)] ??= []).push(e);
    return acc;
  }, {});

  const exportCsv = () => {
    const rows = [["time", "actor", "action", "store", "summary", "detail"], ...events.map((e) => [e.at, e.actorId ? db.users[e.actorId]?.name ?? e.actorId : "Shift Ghost", e.action, e.locationId ? db.locations[e.locationId]?.name ?? "" : "", e.summary, e.detail ?? ""])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `shift-ghost-audit-${dayKey(new Date().toISOString())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actors = Object.values(db.users).filter((u) => u.appUser);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-[2.4rem] font-bold leading-none tracking-wide sm:text-6xl">Audit trail</h1>
          <p className="mt-3 text-steel-300">Every capture, extraction, review decision, claim, escalation and setting change, with who did it and when. Append-only: undo adds an entry, it never erases one.</p>
        </div>
        <Button icon={<Download size={15} />} onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      {entity && db.issues[entity] && (
        <p className="text-sm text-steel-300">
          Showing history for <span className="font-semibold text-paper-100">{db.issues[entity].title}</span>.{" "}
          <Link href="/audit" className="text-safety hover:underline">
            Show everything
          </Link>
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <label className="relative">
          <span className="sr-only">Search</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-steel-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events" className="pl-9" />
        </label>
        <Select aria-label="Event type" value={group} onChange={(e) => setGroup(e.target.value)}>
          {Object.entries(GROUPS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select aria-label="Who" value={actor} onChange={(e) => setActor(e.target.value)}>
          <option value="all">Anyone</option>
          <option value="system">Shift Ghost (automatic)</option>
          {actors.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select aria-label="Store" value={store} onChange={(e) => setStore(e.target.value)} disabled={!can(me, "view_all_locations")}>
          <option value="all">All stores</option>
          {Object.values(db.locations).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </div>

      <p className="text-sm text-steel-500">
        <Mono>{events.length}</Mono> events
      </p>

      {events.length === 0 ? (
        <EmptyState title="No events match" body="Try a different filter, or clear the search." action={<Button onClick={() => { setQ(""); setGroup("all"); setActor("all"); }}>Clear filters</Button>} />
      ) : (
        <div className="flex flex-col gap-6">
          {Object.entries(byDay).map(([day, list]) => (
            <section key={day} aria-label={fmtDay(`${day}T12:00:00Z`)}>
              <h2 className="sticky top-14 z-10 -mx-1 bg-night-900/90 px-1 py-1.5 font-display text-sm font-semibold uppercase tracking-[0.14em] text-steel-400 backdrop-blur">{fmtDay(`${day}T12:00:00Z`)}</h2>
              <ol className="mt-1 flex flex-col">
                {list.map((e) => {
                  const u = e.actorId ? db.users[e.actorId] : null;
                  return (
                    <li key={e.id} className="grid grid-cols-[4.2rem_auto_1fr] items-start gap-x-3 border-b border-night-700 py-2.5">
                      <Mono className="pt-0.5 text-xs text-steel-500">{fmtTime(e.at)}</Mono>
                      {u ? <Avatar user={u} size={24} /> : <span className="grid h-6 w-6 place-items-center"><GhostMark size={18} /></span>}
                      <div className="min-w-0">
                        <p className="text-[0.95rem] text-steel-100">
                          <span className={cx("font-semibold", u ? "text-paper-100" : "text-safety")}>{u?.name ?? "Shift Ghost"}</span> · {e.summary}
                        </p>
                        {e.detail && <p className="text-sm text-steel-400">{e.detail}</p>}
                        <p className="font-mono text-[0.68rem] text-steel-500">
                          {e.action}
                          {e.locationId ? ` · ${db.locations[e.locationId]?.name}` : ""}
                          {e.entityType === "issue" && db.issues[e.entityId] && (
                            <>
                              {" · "}
                              <Link href={`/issues/${e.entityId}`} className="text-safety hover:underline">
                                open
                              </Link>
                            </>
                          )}
                          {e.entityType === "handoff" && db.handoffs[e.entityId] && (
                            <>
                              {" · "}
                              <Link href={`/handoffs/${e.entityId}`} className="text-safety hover:underline">
                                open
                              </Link>
                            </>
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {events.length > limit && (
            <Button className="self-center" onClick={() => setLimit(limit + 120)}>
              Show older events
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
