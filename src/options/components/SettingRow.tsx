import type { JSX, ReactNode } from 'react';
import { Toggle } from '../../ui/Toggle';

export function SettingRow({
  id,
  title,
  description,
  checked,
  onChange,
  disabled = false,
  children,
}: {
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  children?: ReactNode;
}): JSX.Element {
  return (
    <div className="setting">
      <div className="setting__text">
        <label className="setting__title" htmlFor={id}>
          {title}
        </label>
        <p className="setting__description" id={`${id}-description`}>
          {description}
        </p>
        {children}
      </div>
      <Toggle
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        label={title}
        description={description}
      />
    </div>
  );
}
