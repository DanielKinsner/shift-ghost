"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { Bell, Ellipsis } from "lucide-react";
import { Popover } from "radix-ui";
import { NAV } from "./nav";
import { useStore } from "@/store/store";
import { useCurrentUser, useDb, useNow } from "@/store/hooks";
import { can, ROLE_TITLE } from "@/domain/permissions";
import { GhostMark } from "@/components/ui/brand";
import { Avatar, Mono, StatusLight, cx } from "@/components/ui/primitives";
import { OfflineBanner, PageSkeleton } from "@/components/ui/states";
import { Hydrated } from "./Providers";
import { Sheet } from "@/components/ui/overlay";
import { fmtDay, fmtRelative, fmtTime } from "@/domain/time";
import { markNotificationsRead, setDemo } from "@/domain/commands";
import { openDemoDrawer } from "@/components/demo/DemoDrawer";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:pl-[92px]">
      <Hydrated fallback={<RailSkeleton />}>
        <Suspense fallback={<RailSkeleton />}>
          <NavRail />
        </Suspense>
      </Hydrated>
      <Hydrated fallback={<div className="h-14 border-b border-night-700 bg-night-900/80" />}>
        <TopBar />
        <OfflineStrip />
      </Hydrated>
      <main id="main" className="mx-auto w-full max-w-[1480px] px-4 pb-32 pt-5 sm:px-6 lg:px-10 lg:pb-16 lg:pt-8">
        <Hydrated fallback={<PageSkeleton />}>{children}</Hydrated>
      </main>
      <Hydrated fallback={null}>
        <Suspense fallback={null}>
          <BottomTabs />
        </Suspense>
      </Hydrated>
    </div>
  );
}

function RailSkeleton() {
  return <aside className="fixed inset-y-0 left-0 z-40 hidden w-[92px] border-r border-night-700 bg-night-950 lg:block" aria-hidden />;
}

function useActive() {
  const pathname = usePathname();
  return (href: string) => pathname === href || pathname.startsWith(href + "/") || (href === "/handoffs" && pathname.startsWith("/handoffs"));
}

function NavRail() {
  const user = useCurrentUser();
  const isActive = useActive();
  const items = NAV.filter((n) => can(user, n.permission));
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[92px] flex-col items-center border-r border-night-700 bg-night-950/95 py-4 lg:flex" aria-label="Primary">
      <Link href="/" className="mb-5 grid h-12 w-12 place-items-center rounded-xl hover:bg-night-800" aria-label="Shift Ghost demo home">
        <GhostMark size={32} />
      </Link>
      <nav className="flex w-full flex-1 flex-col items-center gap-1">
        {(["shift", "ops"] as const).map((g) => (
          <div key={g} className={cx("flex w-full flex-col items-center gap-1", g === "ops" && "mt-4 border-t border-night-700 pt-4")}>
            {items
              .filter((i) => i.group === g)
              .map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group relative flex w-[76px] flex-col items-center gap-1 rounded-lg py-2 text-[0.72rem] font-medium transition-colors",
                      active ? "bg-night-800 text-paper-100" : "text-steel-400 hover:bg-night-850 hover:text-paper-100",
                    )}
                  >
                    {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-safety" aria-hidden />}
                    <Icon size={20} strokeWidth={1.8} className={active ? "text-safety" : undefined} />
                    {item.label}
                  </Link>
                );
              })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function BottomTabs() {
  const user = useCurrentUser();
  const isActive = useActive();
  const [more, setMore] = useState(false);
  const primary = ["/briefing", "/capture", "/patterns"]
    .map((h) => NAV.find((n) => n.href === h)!)
    .filter((n) => can(user, n.permission));
  const rest = NAV.filter((n) => !primary.includes(n) && can(user, n.permission));
  return (
    <>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-night-600 bg-night-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-around">
          {primary.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            const isCapture = item.href === "/capture";
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx("flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.72rem] font-medium", active ? "text-paper-100" : "text-steel-400")}
              >
                {isCapture ? (
                  <span className={cx("-mt-6 grid h-12 w-12 place-items-center rounded-full border-4 border-night-950 bg-safety text-night-950 shadow-[0_6px_18px_-6px_rgba(255,107,26,0.8)]")}>
                    <Icon size={22} strokeWidth={2} />
                  </span>
                ) : (
                  <Icon size={21} strokeWidth={1.8} className={active ? "text-safety" : undefined} />
                )}
                {item.label}
              </Link>
            );
          })}
          {rest.length > 0 && (
            <button type="button" onClick={() => setMore(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.72rem] font-medium text-steel-400">
              <Ellipsis size={21} />
              More
            </button>
          )}
        </div>
      </nav>
      <Sheet open={more} onOpenChange={setMore} title="More">
        <div className="grid grid-cols-2 gap-2 pb-4">
          {rest.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setMore(false)} className="panel flex items-center gap-3 px-4 py-4 text-paper-100">
                <Icon size={20} className="text-safety" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}

function OfflineStrip() {
  const db = useDb();
  if (db.demo.network !== "offline") return null;
  const queued = db.demo.outbox.length + Object.values(db.handoffs).filter((h) => h.status === "queued").length;
  return <OfflineBanner queued={queued} />;
}

function TopBar() {
  const db = useDb();
  const user = useCurrentUser();
  const now = useNow();
  const syncing = useStore((s) => s.syncing);
  const dispatch = useStore((s) => s.dispatch);
  const offline = db.demo.network === "offline";
  const location = db.locations[db.demo.currentLocationId];
  const multi = user.locationIds.length > 1;

  return (
    <header className="sticky top-0 z-30 border-b border-night-700 bg-night-900/85 backdrop-blur supports-[backdrop-filter]:bg-night-900/70">
      <div className="mx-auto flex h-14 max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label="Shift Ghost demo home">
          <GhostMark size={26} />
        </Link>
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden truncate font-display text-[0.95rem] font-semibold tracking-wide text-steel-300 sm:inline">{db.organization.name}</span>
          <span className="hidden text-night-500 sm:inline" aria-hidden>
            /
          </span>
          {multi ? (
            <label className="relative">
              <span className="sr-only">Store</span>
              <select
                value={location.id}
                onChange={(e) => dispatch(setDemo, { currentLocationId: e.target.value }, { silent: true, local: true })}
                className="h-8 appearance-none rounded-md border border-night-500 bg-night-800 pl-2.5 pr-7 font-display text-[0.95rem] font-semibold tracking-wide text-paper-100"
              >
                {user.locationIds.map((id) => (
                  <option key={id} value={id}>
                    {db.locations[id].name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-steel-400" aria-hidden>
                ▾
              </span>
            </label>
          ) : (
            <span className="font-display text-[0.95rem] font-semibold tracking-wide text-paper-100">{location.name}</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <button type="button" onClick={() => openDemoDrawer("clock")} className="hidden items-center gap-2 rounded-md px-2 py-1 text-steel-300 hover:bg-night-800 sm:flex" title="Demo clock">
            <Mono className="text-[0.8rem] uppercase">{fmtDay(now)}</Mono>
            <Mono className="text-[0.95rem] text-paper-100">{fmtTime(now)}</Mono>
          </button>
          <button type="button" onClick={() => openDemoDrawer("clock")} className="sm:hidden" aria-label={`Demo time ${fmtTime(now)}`}>
            <Mono className="text-[0.85rem] text-paper-100">{fmtTime(now)}</Mono>
          </button>
          <div className="flex items-center gap-2 rounded-md px-2 py-1" role="status" aria-live="polite">
            <StatusLight tone={offline ? "amber" : syncing ? "amber" : "ok"} pulse={offline} size={9} />
            <span className="hidden text-xs text-steel-400 md:inline">{offline ? "Offline" : syncing ? "Saving" : "Synced"}</span>
          </div>
          <Notifications />
          <button type="button" onClick={() => openDemoDrawer("users")} className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-night-800" aria-label={`Signed in as ${user.name}. Switch user`}>
            <Avatar user={user} size={30} />
            <span className="hidden text-left leading-tight xl:block">
              <span className="block text-sm font-medium text-paper-100">{user.name}</span>
              <span className="block text-xs text-steel-400">{ROLE_TITLE[user.role]}</span>
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

function Notifications() {
  const db = useDb();
  const now = useNow();
  const dispatch = useStore((s) => s.dispatch);
  const userId = db.demo.currentUserId;
  const mine = Object.values(db.notifications)
    .filter((n) => n.userId === userId)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 12);
  const unread = mine.filter((n) => !n.readAt).length;
  return (
    <Popover.Root onOpenChange={(open) => !open && unread && dispatch(markNotificationsRead, { userId }, { silent: true, local: true })}>
      <Popover.Trigger className="relative grid h-10 w-10 place-items-center rounded-lg text-steel-300 hover:bg-night-800 hover:text-paper-100" aria-label={`Notifications, ${unread} unread`}>
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-safety px-1 font-mono text-[0.65rem] font-semibold text-night-950">{unread}</span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="panel-raised z-[65] w-[min(380px,calc(100vw-1.5rem))] p-2">
          <p className="px-2 pb-2 pt-1 font-display text-sm font-semibold uppercase tracking-widest text-steel-400">Notifications</p>
          {mine.length === 0 ? (
            <p className="px-2 pb-3 text-sm text-steel-400">Nothing yet. Escalations, replies and brief-ready alerts land here.</p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto">
              {mine.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} className="flex gap-3 rounded-lg px-2 py-2.5 hover:bg-night-600">
                    <StatusLight tone={n.severity === "critical" ? "critical" : n.severity === "high" ? "high" : "normal"} off={Boolean(n.readAt)} size={9} className="mt-1.5" />
                    <span className="min-w-0">
                      <span className={cx("block text-sm", n.readAt ? "text-steel-300" : "font-medium text-paper-100")}>{n.title}</span>
                      <span className="line-clamp-2 block text-xs text-steel-400">{n.body}</span>
                      <span className="mt-0.5 block font-mono text-[0.68rem] text-steel-500">
                        {fmtRelative(n.at, now)} · {n.channel === "sms" ? "text" : n.channel.replace("_", " ")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
