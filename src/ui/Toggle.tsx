/**
 * Accessible switch.
 *
 * Implemented as a real <button role="switch"> so it is reachable by Tab, operable with
 * Space/Enter, announced correctly by screen readers, and has visible hover/focus/active/
 * disabled states.
 */
import type { JSX } from 'react';

export type ToggleProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id?: string;
};

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
}: ToggleProps): JSX.Element {
  const descriptionId = description && id ? `${id}-description` : undefined;
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={descriptionId}
      disabled={disabled}
      className="cb-toggle"
      data-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="cb-toggle__track" aria-hidden="true">
        <span className="cb-toggle__thumb" />
      </span>
    </button>
  );
}
