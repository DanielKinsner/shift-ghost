"use client";

import { useStore } from "@/store/store";
import { Dialog } from "@/components/ui/overlay";
import { Avatar, Button } from "@/components/ui/primitives";
import { fmtTime } from "@/domain/time";

/** Shown when two managers edit the same task: the second change is held, never silently applied. */
export function ConflictDialog() {
  const conflict = useStore((s) => s.conflict);
  const clear = useStore((s) => s.clearConflict);
  const db = useStore((s) => s.db);
  const by = conflict?.byUserId ? db?.users[conflict.byUserId] : null;
  return (
    <Dialog
      open={Boolean(conflict)}
      onOpenChange={(o) => !o && clear()}
      title="Someone else just changed this task"
      description={
        conflict ? (
          <>
            {by?.name ?? "Another manager"} {conflict.theirChange} at {fmtTime(conflict.at)}, while you had it open. Your change was not applied.
          </>
        ) : null
      }
      footer={
        <>
          <Button variant="secondary" onClick={clear}>
            Keep {by?.firstName ?? "their"}'s change
          </Button>
          <Button variant="primary" onClick={() => conflict?.retry()}>
            Apply mine anyway
          </Button>
        </>
      }
    >
      {conflict && (
        <div className="flex items-center gap-3 rounded-lg border border-night-500 bg-night-900 p-3">
          <Avatar user={by} size={36} />
          <div className="min-w-0">
            <p className="truncate font-medium text-paper-100">{conflict.taskTitle}</p>
            <p className="text-sm text-steel-400">Latest version from {by?.firstName ?? "a teammate"}'s phone</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
