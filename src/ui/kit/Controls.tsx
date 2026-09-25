/**
 * Button (docs/design-book/components/Button) and Input (…/Input).
 *
 * Buttons are square and bordered at control-sm / md / lg. Default is for
 * everything; primary (accent-500, on-accent label) is the one action in a pane
 * that writes; danger keeps the default ground with a red border and label.
 * Uppercase for a command that changes state, sentence case for navigation —
 * callers write the copy that way.
 *
 * Fields are 26px insets on surface-400 holding a value in mono; a unit sits at
 * the right edge in ink-300. Select shows ▾; the checkbox is a 13px square that
 * fills accent-500 with a ✕ in on-accent.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "default" | "primary" | "danger";
export type ControlSize = "sm" | "md" | "lg";

export function Button({ variant = "default", size = "md", className, type, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ControlSize }) {
  return <button type={type ?? "button"} className={cx("btn", variant !== "default" && `btn-${variant}`, size !== "md" && `btn-${size}`, className)} {...rest} />;
}

export function TextField({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input type="text" className={cx("input", className)} aria-invalid={invalid || undefined} {...rest} />;
}

/** A number with its unit pushed to the field's right edge, so a column stays aligned on its digits. */
export function NumberField({
  value,
  onValue,
  unit,
  className,
  invalid,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & { value: number | undefined; onValue: (v: number | undefined) => void; unit?: ReactNode; invalid?: boolean }) {
  return (
    <span className={cx("input-wrap", className)} aria-invalid={invalid || undefined}>
      <input
        type="number"
        className="input num"
        value={value === undefined || !Number.isFinite(value) ? "" : value}
        onChange={(e) => onValue(e.target.value === "" ? undefined : Number(e.target.value))}
        {...rest}
      />
      {unit !== undefined && unit !== "" && <span className="unit">{unit}</span>}
    </span>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={cx("select", className)}>
      <select {...rest}>{children}</select>
    </span>
  );
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("input", "textarea", className)} {...rest} />;
}

export function Checkbox({ checked, onChange, label, title, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; title?: string; disabled?: boolean }) {
  return (
    <label className={cx("check", disabled && "is-disabled")} title={title}>
      {/* The native input stays for keyboard and forms; the box beside it is what is drawn. */}
      <input type="checkbox" className="check-input" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="check-box" aria-hidden />
      {label !== undefined && <span className="check-label">{label}</span>}
    </label>
  );
}

/** The reason beneath an invalid field, beginning with the word VIOLATION. */
export function FieldMessage({ children }: { children: ReactNode }) {
  return <div className="field-msg">VIOLATION — {children}</div>;
}
