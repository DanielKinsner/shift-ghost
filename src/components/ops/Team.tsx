"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useStore } from "@/store/store";
import { useCurrentUser, useDb } from "@/store/hooks";
import { inviteUser, updateNotificationPrefs } from "@/domain/commands";
import { InviteSchema, fieldErrors } from "@/domain/schemas";
import { can, ROLE_TITLE } from "@/domain/permissions";
import type { Channel, NotificationPrefs, Role } from "@/domain/types";
import { Avatar, Button, SectionHeading, StatusLight, cx } from "@/components/ui/primitives";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { Dialog } from "@/components/ui/overlay";
import { PermissionDenied } from "@/components/ui/states";

const CHANNELS: { id: Channel; label: string }[] = [
  { id: "push", label: "Push" },
  { id: "sms", label: "Text" },
  { id: "email", label: "Email" },
  { id: "team_chat", label: "Team chat" },
];

const EVENTS: { key: keyof Omit<NotificationPrefs, "quietHours">; label: string; hint: string }[] = [
  { key: "briefingReady", label: "Opening brief is ready", hint: "At the brief time for your store" },
  { key: "critical", label: "Critical items and escalations", hint: "Overrides quiet hours" },
  { key: "mentions", label: "Questions and replies", hint: "When someone asks you about your shift" },
];

export function Team() {
  const db = useDb();
  const me = useCurrentUser();
  const dispatch = useStore((s) => s.dispatch);
  const [inviting, setInviting] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(me.notifications);
  const [prefsFor, setPrefsFor] = useState(me.id);
  if (prefsFor !== me.id) {
    setPrefsFor(me.id);
    setPrefs(me.notifications);
  }
  if (!can(me, "view_team")) return <PermissionDenied permission="manage_team" what="The team list" role={ROLE_TITLE[me.role]} />;
  const manage = can(me, "manage_team");
  const dirty = JSON.stringify(prefs) !== JSON.stringify(me.notifications);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-[2.4rem] font-bold leading-none tracking-wide sm:text-6xl">Team and notifications</h1>
          <p className="mt-3 text-steel-300">Who gets each brief, how they hear about critical items, and the crew names Shift Ghost listens for in closeouts.</p>
        </div>
        {manage && (
          <Button variant="primary" icon={<UserPlus size={16} />} onClick={() => setInviting(true)}>
            Invite someone
          </Button>
        )}
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="people" className="flex flex-col gap-5">
          {Object.values(db.locations).map((l) => {
            const people = Object.values(db.users).filter((u) => u.locationIds.includes(l.id) && (u.role !== "area_manager" || l.id === "loc-dtn"));
            return (
              <div key={l.id}>
                <SectionHeading>{l.name}</SectionHeading>
                <ul className="mt-2 flex flex-col divide-y divide-night-700 rounded-xl border border-night-600 bg-night-850">
                  {people.map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <Avatar user={u} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-paper-100">
                          {u.name} {u.id === me.id && <span className="text-xs font-normal text-safety">(you)</span>}
                        </p>
                        <p className="text-sm text-steel-400">
                          {u.appUser ? ROLE_TITLE[u.role] : u.title}
                          {u.role === "area_manager" && " · all stores"}
                        </p>
                      </div>
                      {u.appUser ? (
                        <span className="flex items-center gap-2 text-xs text-steel-400">
                          <StatusLight tone={u.inviteStatus === "invited" ? "amber" : "ok"} size={8} />
                          {u.inviteStatus === "invited" ? "Invite sent" : `Brief by ${u.notifications.briefingReady.map((c) => CHANNELS.find((x) => x.id === c)?.label.toLowerCase()).join(" + ") || "app only"}`}
                        </span>
                      ) : (
                        <span className="text-xs text-steel-500">Named in closeouts, no login</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <section aria-labelledby="mine" className="panel h-fit p-5">
          <h2 id="mine" className="font-display text-2xl font-semibold tracking-wide">
            Your notifications
          </h2>
          <p className="mt-1 text-sm text-steel-400">{me.name}</p>
          <div className="mt-5 flex flex-col gap-5">
            {EVENTS.map((ev) => (
              <fieldset key={ev.key}>
                <legend className="text-[0.95rem] font-medium text-paper-100">{ev.label}</legend>
                <p className="text-sm text-steel-500">{ev.hint}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CHANNELS.map((c) => {
                    const on = prefs[ev.key].includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPrefs({ ...prefs, [ev.key]: on ? prefs[ev.key].filter((x) => x !== c.id) : [...prefs[ev.key], c.id] })}
                        className={cx("rounded-full border px-3 py-1.5 text-sm", on ? "border-safety bg-safety-900/60 text-paper-100" : "border-night-500 text-steel-400 hover:text-paper-100")}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <div className="flex flex-col gap-3 border-t border-night-600 pt-4">
              <Switch
                checked={Boolean(prefs.quietHours)}
                onChange={(v) => setPrefs({ ...prefs, quietHours: v ? { start: "22:00", end: "06:00" } : null })}
                label="Quiet hours"
                description="Hold everything except critical items."
              />
              {prefs.quietHours && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From" htmlFor="qh-from">
                    <Input id="qh-from" type="time" value={prefs.quietHours.start} onChange={(e) => setPrefs({ ...prefs, quietHours: { ...prefs.quietHours!, start: e.target.value } })} />
                  </Field>
                  <Field label="Until" htmlFor="qh-to">
                    <Input id="qh-to" type="time" value={prefs.quietHours.end} onChange={(e) => setPrefs({ ...prefs, quietHours: { ...prefs.quietHours!, end: e.target.value } })} />
                  </Field>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={!dirty} onClick={() => setPrefs(me.notifications)}>
                Discard
              </Button>
              <Button variant="primary" disabled={!dirty} onClick={() => dispatch(updateNotificationPrefs, { userId: me.id, prefs }, { undoable: true, label: "Update notifications" })}>
                Save preferences
              </Button>
            </div>
          </div>
        </section>
      </div>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </div>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const db = useDb();
  const dispatch = useStore((s) => s.dispatch);
  const [form, setForm] = useState({ name: "", role: "opening_manager" as Role, locationId: "loc-dtn", contact: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Invite someone"
      description="They get a link to sign in and start receiving the brief for their store. (Simulated: nothing is sent.)"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const r = InviteSchema.safeParse(form);
              if (!r.success) return setErrors(fieldErrors(r.error));
              dispatch(inviteUser, { name: r.data.name, role: r.data.role, locationIds: [r.data.locationId], contact: r.data.contact });
              onClose();
            }}
          >
            Send invite
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="iv-name" error={errors.name}>
          <Input id="iv-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sam Rivera" />
        </Field>
        <Field label="Email or mobile" htmlFor="iv-contact" error={errors.contact}>
          <Input id="iv-contact" value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="+1 555 201 7788" />
        </Field>
        <Field label="Role" htmlFor="iv-role">
          <Select id="iv-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {(["opening_manager", "closing_manager", "kitchen_lead", "area_manager"] as Role[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_TITLE[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Store" htmlFor="iv-loc">
          <Select id="iv-loc" value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>
            {Object.values(db.locations).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-sm text-steel-400 sm:col-span-2">They start getting their store&apos;s opening brief by push. They can change that in their own notification settings.</p>
      </div>
    </Dialog>
  );
}
