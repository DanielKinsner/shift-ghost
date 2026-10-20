"use client";

import type { ReactNode } from "react";
import { Dialog as RDialog, VisuallyHidden } from "radix-ui";
import { X } from "lucide-react";
import { cx } from "./primitives";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  tone = "default",
  wide,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "critical";
  wide?: boolean;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[70] bg-night-950/75 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <RDialog.Content
          className={cx(
            "panel-raised fixed left-1/2 top-1/2 z-[71] max-h-[88dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 sm:p-6",
            wide ? "max-w-2xl" : "max-w-lg",
            tone === "critical" && "border-signal/70 shadow-[0_0_0_1px_rgba(255,74,61,0.25),0_30px_60px_-20px_rgba(0,0,0,0.9)]",
          )}
        >
          {tone === "critical" && <div className="tape -mx-5 -mt-5 mb-5 rounded-none sm:-mx-6 sm:-mt-6" role="presentation" />}
          <div className="flex items-start justify-between gap-4">
            <RDialog.Title className="font-display text-2xl font-semibold leading-tight tracking-wide text-paper-100">{title}</RDialog.Title>
            <RDialog.Close className="-mr-2 -mt-1 grid h-9 w-9 flex-none place-items-center rounded-lg text-steel-400 hover:bg-night-600 hover:text-paper-100" aria-label="Close">
              <X size={18} />
            </RDialog.Close>
          </div>
          {description ? (
            <RDialog.Description className="mt-2 text-[0.95rem] leading-relaxed text-steel-300">{description}</RDialog.Description>
          ) : (
            <VisuallyHidden.Root>
              <RDialog.Description>{typeof title === "string" ? title : "Dialog"}</RDialog.Description>
            </VisuallyHidden.Root>
          )}
          {children && <div className="mt-5">{children}</div>}
          {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/** Bottom sheet on phones, side drawer on desktop. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = "right",
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  side?: "right" | "left";
  footer?: ReactNode;
}) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-[70] bg-night-950/70" />
        <RDialog.Content
          className={cx(
            "fixed z-[71] flex flex-col border-night-500 bg-night-800 shadow-2xl",
            "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t",
            side === "right" ? "md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[440px] md:rounded-none md:border-l md:border-t-0" : "md:inset-y-0 md:left-0 md:right-auto md:max-h-none md:w-[400px] md:rounded-none md:border-r md:border-t-0",
          )}
        >
          <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-night-500 md:hidden" aria-hidden />
          <div className="flex items-start justify-between gap-4 border-b border-night-600 px-5 py-4">
            <div>
              <RDialog.Title className="font-display text-xl font-semibold tracking-wide">{title}</RDialog.Title>
              {description ? (
                <RDialog.Description className="mt-1 text-sm text-steel-400">{description}</RDialog.Description>
              ) : (
                <VisuallyHidden.Root>
                  <RDialog.Description>{typeof title === "string" ? title : "Panel"}</RDialog.Description>
                </VisuallyHidden.Root>
              )}
            </div>
            <RDialog.Close className="-mr-2 grid h-9 w-9 flex-none place-items-center rounded-lg text-steel-400 hover:bg-night-600 hover:text-paper-100" aria-label="Close">
              <X size={18} />
            </RDialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="border-t border-night-600 px-5 py-3">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
