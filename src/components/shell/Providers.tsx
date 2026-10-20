"use client";

import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { MotionConfig } from "motion/react";
import { useStore, runClockRules, demoNow } from "@/store/store";
import { evaluateOpenAt } from "@/domain/rules/evaluate";
import { ConflictDialog } from "@/components/briefing/ConflictDialog";

export function Providers({ children }: { children: ReactNode }) {
  const hydrate = useStore((s) => s.hydrate);
  const setOnline = useStore((s) => s.setOnline);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Real connectivity changes drive the same offline mode the demo drawer simulates.
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [setOnline]);

  // Time-based rules ("refund still open at 9 AM") fire as the demo clock passes them.
  useEffect(() => {
    const check = () => {
      const db = useStore.getState().db;
      if (!db) return;
      const now = demoNow(db.demo);
      const due = evaluateOpenAt(Object.values(db.rules), Object.values(db.tasks), db.issues, db.items, now).some(
        (t) => t.fired && !db.demo.firedTimers.includes(`${t.ruleId}:${t.taskId}`),
      );
      if (due) runClockRules();
    };
    const id = setInterval(check, 5000);
    const unsub = useStore.subscribe((s, p) => {
      if (s.db?.demo.clockAnchor !== p.db?.demo.clockAnchor) check();
    });
    return () => {
      clearInterval(id);
      unsub();
    };
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      {children}
      <ConflictDialog />
      <Toaster position="bottom-center" offset={{ bottom: 96 }} mobileOffset={{ bottom: 92 }} toastOptions={{ duration: 4000 }} />
    </MotionConfig>
  );
}

/** Renders children only after local data has loaded; shows a matching skeleton before. */
export function Hydrated({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);
  return <>{hydrated ? children : fallback}</>;
}
