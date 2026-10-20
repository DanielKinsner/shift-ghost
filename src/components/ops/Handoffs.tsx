"use client";

import Link from "next/link";
import { useState } from "react";
import { Mic } from "lucide-react";
import { useCurrentUser, useDb } from "@/store/hooks";
import { itemNeedsReview } from "@/domain/commands";
import { can } from "@/domain/permissions";
import { fmtDay, fmtElapsed, fmtTime } from "@/domain/time";
import { Avatar, Button, Mono, StatusLight } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/states";

export function Handoffs() {
  const db = useDb();
  const me = useCurrentUser();
  const all = can(me, "view_all_locations");
  const [store, setStore] = useState<string>(all ? "all" : me.locationIds[0]);
  const list = Object.values(db.handoffs)
    .filter((h) => store === "all" || h.locationId === store)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-[2.4rem] font-bold leading-none tracking-wide sm:text-6xl">Handoffs</h1>
          <p className="mt-3 text-steel-300">Every closeout, with its original transcript. Nothing extracted ever replaces what was said.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {all && (
            <Segmented label="Store" value={store} onChange={setStore} options={[{ value: "all", label: "All" }, ...Object.values(db.locations).map((l) => ({ value: l.id, label: l.name }))]} size="sm" />
          )}
          {can(me, "capture") && (
            <Link href="/capture">
              <Button variant="primary" icon={<Mic size={15} />}>
                New closeout
              </Button>
            </Link>
          )}
        </div>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No closeouts yet" body="The first one appears here as soon as a closer submits it." />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((h) => {
            const items = Object.values(db.items).filter((i) => i.handoffId === h.id && i.status !== "dismissed");
            const needs = items.filter(itemNeedsReview).length;
            const critical = items.filter((i) => i.severity === "critical").length;
            const author = db.users[h.authorId];
            const status =
              h.error ? { tone: "critical" as const, label: "Extraction failed" } : h.status === "published" ? { tone: "ok" as const, label: "Published" } : h.status === "review" ? { tone: "amber" as const, label: needs ? `${needs} to confirm` : "Ready to publish" } : h.status === "queued" ? { tone: "amber" as const, label: "Waiting to sync" } : { tone: "amber" as const, label: "Processing" };
            return (
              <li key={h.id}>
                <Link href={`/handoffs/${h.id}`} className="panel grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors hover:border-steel-500 sm:grid-cols-[9rem_1fr_auto_auto]">
                  <span className="font-mono text-sm text-steel-300">
                    {fmtDay(h.createdAt)} <span className="text-steel-500">{fmtTime(h.submittedAt ?? h.createdAt)}</span>
                  </span>
                  <span className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
                    <Avatar user={author} size={22} />
                    <span className="truncate text-paper-100">
                      {db.locations[h.locationId].name} · {author?.name}
                    </span>
                  </span>
                  <span className="text-sm text-steel-400">
                    {items.length} items{critical ? ` · ${critical} critical` : ""} · <Mono>{fmtElapsed(h.audio.durationSec)}</Mono>
                  </span>
                  <span className="flex items-center gap-2 justify-self-end text-sm text-steel-100">
                    <StatusLight tone={status.tone} size={8} /> {status.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
