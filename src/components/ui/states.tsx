"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Lock, TriangleAlert, WifiOff } from "lucide-react";
import { Button, Skeleton, StatusLight, cx } from "./primitives";
import { whoCanGrant, type Permission } from "@/domain/permissions";

export function EmptyState({ title, body, action, icon, className }: { title: string; body: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <div className={cx("panel plate flex flex-col items-start gap-3 px-5 py-8 sm:px-8", className)}>
      {icon && <div className="text-steel-500">{icon}</div>}
      <h2 className="font-display text-2xl font-semibold tracking-wide">{title}</h2>
      <div className="max-w-prose text-[0.95rem] leading-relaxed text-steel-300">{body}</div>
      {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function PermissionDenied({ permission, what, role }: { permission: Permission; what: string; role: string }) {
  return (
    <div className="mx-auto max-w-xl py-10">
      <div className="panel plate overflow-hidden">
        <div className="tape rounded-none" role="presentation" />
        <div className="flex flex-col gap-3 px-6 py-8">
          <span className="inline-flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-safety">
            <Lock size={15} /> Restricted area
          </span>
          <h1 className="font-display text-3xl font-semibold tracking-wide">{what} is managed by {whoCanGrant(permission)}</h1>
          <p className="text-steel-300">
            You're signed in as a {role.toLowerCase()}. You can still see your opening brief and act on your tasks. Ask {whoCanGrant(permission)} if you need access here.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href="/briefing">
              <Button variant="primary">Go to the opening brief</Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorState({ title, body, onRetry, retryLabel = "Try again" }: { title: string; body: ReactNode; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="panel flex flex-col items-start gap-3 border-signal/50 px-5 py-6">
      <span className="inline-flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-signal">
        <TriangleAlert size={15} /> Something failed
      </span>
      <h2 className="font-display text-2xl font-semibold tracking-wide">{title}</h2>
      <div className="max-w-prose text-steel-300">{body}</div>
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export function OfflineBanner({ queued }: { queued: number }) {
  return (
    <div role="status" className="flex items-center gap-3 border-b border-amber/40 bg-amber-900/70 px-4 py-2 text-sm text-paper-100">
      <WifiOff size={16} className="flex-none text-amber" />
      <span className="min-w-0">
        <strong className="font-semibold">Offline.</strong> Captures and changes save on this device
        {queued ? (
          <>
            {" "}· <span className="font-mono">{queued}</span> waiting to sync
          </>
        ) : null}
        .
      </span>
      <StatusLight tone="amber" pulse size={9} className="ml-auto" />
    </div>
  );
}

/** Skeleton shaped like a page header + three rows, sized to match the real content. */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-2/3 max-w-md" />
      <Skeleton className="h-20 w-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}
