"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { useStore } from "@/store/store";
import { useCurrentUser, useDb, useNow } from "@/store/hooks";
import { updateLocation, updateShiftTemplate } from "@/domain/commands";
import { LocationFormSchema, fieldErrors } from "@/domain/schemas";
import { can, ROLE_TITLE } from "@/domain/permissions";
import { dayKey, fmtHHMM, fmtTime, hhmmToMinutes } from "@/domain/time";
import type { Location } from "@/domain/types";
import { Avatar, Button, Mono, StatusLight } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { PermissionDenied } from "@/components/ui/states";

export function Locations() {
  const db = useDb();
  const me = useCurrentUser();
  const now = useNow();
  const [editing, setEditing] = useState<Location | null>(null);
  if (!can(me, "view_locations")) return <PermissionDenied permission="edit_locations" what="Stores and shift templates" role={ROLE_TITLE[me.role]} />;
  const editable = can(me, "edit_locations");
  const tonight = dayKey(now) < "2026-10-21" || now.slice(11, 13) >= "14" ? dayKey(now) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="font-display text-[2.4rem] font-bold leading-none tracking-wide sm:text-6xl">Stores and shifts</h1>
        <p className="mt-3 text-steel-300">When each store opens, when the closeout is due, and when the brief lands. The brief plans every deadline around these times.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {Object.values(db.locations).map((l) => {
          const tpls = Object.values(db.shiftTemplates).filter((t) => t.locationId === l.id).sort((a, b) => a.start.localeCompare(b.start));
          const crew = Object.values(db.users).filter((u) => u.locationIds.includes(l.id) && u.role !== "area_manager");
          const last = Object.values(db.handoffs)
            .filter((h) => h.locationId === l.id)
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
          const inTonight = tonight && last && db.shiftInstances[last.shiftInstanceId]?.date === tonight;
          return (
            <article key={l.id} className="panel plate flex flex-col px-5 pb-5 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-steel-500">{l.code}</p>
                  <h2 className="font-display text-3xl font-semibold tracking-wide">{l.name}</h2>
                  <p className="text-sm text-steel-400">{l.address}</p>
                </div>
                {editable && (
                  <Button size="sm" icon={<Pencil size={14} />} onClick={() => setEditing(l)}>
                    Edit
                  </Button>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-night-600 bg-night-900/60 px-3 py-2 text-sm">
                <StatusLight tone={inTonight ? (last.status === "published" ? "ok" : "amber") : "normal"} off={!inTonight} size={9} />
                {inTonight ? (
                  <span className="text-steel-100">
                    Tonight&apos;s closeout {last.status === "published" ? "published" : last.status === "review" ? "in review" : last.status} at {fmtTime(last.submittedAt ?? last.createdAt)}
                  </span>
                ) : (
                  <span className="text-steel-400">No closeout yet tonight</span>
                )}
              </div>
              <ShiftBar location={l} tpls={tpls} />
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                {tpls.map((t) => (
                  <div key={t.id}>
                    <dt className="text-steel-400">{t.name} shift</dt>
                    <dd className="text-paper-100">
                      <Mono>
                        {t.start}–{t.end}
                      </Mono>
                    </dd>
                    <dd className="text-xs text-steel-500">{t.kind === "close" ? `Closeout due ${fmtHHMM(t.handoffAt)}` : `Brief at ${fmtHHMM(t.handoffAt)}`}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-steel-400">Doors open</dt>
                  <dd className="text-paper-100">
                    <Mono>{l.doorsOpen}</Mono>
                  </dd>
                </div>
                <div>
                  <dt className="text-steel-400">Lunch rush</dt>
                  <dd className="text-paper-100">
                    <Mono>{l.lunchRush}</Mono>
                  </dd>
                </div>
              </dl>
              <div className="mt-4 flex items-center gap-2 border-t border-night-600 pt-4">
                <div className="flex -space-x-1.5">
                  {crew.filter((u) => u.appUser).map((u) => (
                    <Avatar key={u.id} user={u} size={26} />
                  ))}
                </div>
                <span className="text-sm text-steel-400">{crew.filter((u) => u.appUser).length} on Shift Ghost · {crew.filter((u) => !u.appUser).length} crew named in closeouts</span>
              </div>
              <Link href="/team" className="mt-2 text-sm font-semibold text-safety hover:underline">
                Manage team
              </Link>
            </article>
          );
        })}
      </div>
      {!editable && <p className="text-sm text-steel-500">Only the area manager can change store details and shift times.</p>}
      {editing && <EditLocation location={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ShiftBar({ location, tpls }: { location: Location; tpls: { id: string; kind: string; start: string; end: string; handoffAt: string }[] }) {
  const p = (t: string) => (hhmmToMinutes(t) / 1440) * 100;
  return (
    <div className="relative mt-4 h-9" role="img" aria-label={`Shifts at ${location.name}`}>
      <div className="absolute inset-x-0 top-3 h-3 rounded bg-night-700" />
      {tpls.map((t) => (
        <div key={t.id} className={t.kind === "open" ? "absolute top-3 h-3 rounded bg-go/50" : "absolute top-3 h-3 rounded bg-safety/50"} style={{ left: `${p(t.start)}%`, width: `${p(t.end) - p(t.start)}%` }} />
      ))}
      <div className="absolute top-1 h-7 w-0.5 bg-paper-100" style={{ left: `${p(location.doorsOpen)}%` }} title="Doors open" />
      <span className="absolute -bottom-1.5 font-mono text-[0.62rem] text-steel-500" style={{ left: 0 }}>
        00
      </span>
      <span className="absolute -bottom-1.5 -translate-x-1/2 font-mono text-[0.62rem] text-steel-500" style={{ left: "50%" }}>
        12
      </span>
      <span className="absolute -bottom-1.5 right-0 font-mono text-[0.62rem] text-steel-500">24</span>
    </div>
  );
}

function EditLocation({ location, onClose }: { location: Location; onClose: () => void }) {
  const db = useDb();
  const dispatch = useStore((s) => s.dispatch);
  const tpls = Object.values(db.shiftTemplates).filter((t) => t.locationId === location.id);
  const close = tpls.find((t) => t.kind === "close")!;
  const open = tpls.find((t) => t.kind === "open")!;
  const [form, setForm] = useState({ name: location.name, address: location.address, doorsOpen: location.doorsOpen, lunchRush: location.lunchRush, closeoutDue: close.handoffAt, briefAt: open.handoffAt });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = () => {
    const r = LocationFormSchema.safeParse(form);
    if (!r.success) return setErrors(fieldErrors(r.error));
    dispatch(updateLocation, { locationId: location.id, patch: r.data }, { toastMessage: `${r.data.name} saved` });
    if (form.closeoutDue !== close.handoffAt) dispatch(updateShiftTemplate, { templateId: close.id, patch: { handoffAt: form.closeoutDue } }, { silent: true });
    if (form.briefAt !== open.handoffAt) dispatch(updateShiftTemplate, { templateId: open.id, patch: { handoffAt: form.briefAt } }, { silent: true });
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Edit ${location.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save store
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="el-name" error={errors.name}>
          <Input id="el-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Address" htmlFor="el-addr" error={errors.address}>
          <Input id="el-addr" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Field label="Doors open" htmlFor="el-doors" error={errors.doorsOpen}>
          <Input id="el-doors" type="time" value={form.doorsOpen} onChange={(e) => setForm({ ...form, doorsOpen: e.target.value })} />
        </Field>
        <Field label="Lunch rush" htmlFor="el-lunch" error={errors.lunchRush}>
          <Input id="el-lunch" type="time" value={form.lunchRush} onChange={(e) => setForm({ ...form, lunchRush: e.target.value })} />
        </Field>
        <Field label="Closeout due" htmlFor="el-due">
          <Input id="el-due" type="time" value={form.closeoutDue} onChange={(e) => setForm({ ...form, closeoutDue: e.target.value })} />
        </Field>
        <Field label="Brief delivered" htmlFor="el-brief">
          <Input id="el-brief" type="time" value={form.briefAt} onChange={(e) => setForm({ ...form, briefAt: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  );
}
