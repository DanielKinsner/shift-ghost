"use client";

import { useMemo, useSyncExternalStore } from "react";
import { demoNow, useStore } from "./store";
import type { DemoDB, User } from "@/domain/types";
import { detectPatterns } from "@/domain/patterns";
import { composeBriefing } from "@/domain/briefing";
import { can, type Permission } from "@/domain/permissions";

/** The hydrated database. Only call inside <Hydrated>; the gate guarantees it's loaded. */
export function useDb(): DemoDB {
  const db = useStore((s) => s.db);
  if (!db) throw new Error("useDb() called before hydration");
  return db;
}

let tick = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribeTick(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      tick++;
      listeners.forEach((l) => l());
    }, 15_000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Demo-clock "now", re-rendering every 15 seconds. */
export function useNow(): string {
  const demo = useStore((s) => s.db?.demo);
  const t = useSyncExternalStore(subscribeTick, () => tick, () => 0);
  return useMemo(() => (demo ? demoNow(demo) : "2026-10-20T22:40:00Z"), [demo, t]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useCurrentUser(): User {
  const db = useDb();
  return db.users[db.demo.currentUserId];
}

export function useCan(permission: Permission): boolean {
  return can(useCurrentUser(), permission);
}

export function usePatterns() {
  const db = useDb();
  const now = useNow();
  return useMemo(() => detectPatterns(db, now), [db, now]);
}

export function useBriefing(locationId: string) {
  const db = useDb();
  const now = useNow();
  const patterns = usePatterns();
  return useMemo(() => composeBriefing(db, locationId, now, patterns), [db, locationId, now, patterns]);
}

export function useReducedMotionPref(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
