"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Switch as RSwitch } from "radix-ui";
import { cx } from "./primitives";

const control =
  "w-full rounded-lg border border-night-500 bg-night-900 px-3 text-paper-100 placeholder:text-steel-500 transition-colors focus:border-safety focus:outline-none aria-[invalid=true]:border-signal";

export function Field({ label, hint, error, children, htmlFor, className }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-steel-100">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-signal">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-steel-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(control, "h-10", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(control, "min-h-24 py-2 leading-relaxed [field-sizing:content]", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={cx(
        control,
        "h-10 appearance-none bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%23b7bfc8' stroke-width='1.6'/></svg>\")] bg-[length:12px_8px] bg-[right_12px_center] bg-no-repeat pr-9",
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[0.95rem] font-medium text-paper-100">
          {label}
        </label>
        {description && <p className="mt-0.5 text-sm text-steel-500">{description}</p>}
      </div>
      <RSwitch.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="relative mt-0.5 h-6 w-11 flex-none rounded-full border border-night-500 bg-night-900 transition-colors data-[state=checked]:border-safety data-[state=checked]:bg-safety-900 disabled:opacity-50"
      >
        <RSwitch.Thumb className="block h-4 w-4 translate-x-1 rounded-full bg-steel-500 shadow transition-transform data-[state=checked]:translate-x-6 data-[state=checked]:bg-safety" />
      </RSwitch.Root>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, size = "md" }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; size?: "sm" | "md" }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-night-500 bg-night-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            value === o.value ? "bg-night-600 text-paper-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-steel-400 hover:text-paper-100",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 flex-none accent-[#ff6b1a]" />
      <span>
        <span className="text-[0.95rem] text-paper-100">{label}</span>
        {description && <span className="block text-sm text-steel-500">{description}</span>}
      </span>
    </label>
  );
}
