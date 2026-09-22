import type { JSX } from 'react';
import { Icon, type IconName } from '../../ui/Icon';
import type { ThemePreference } from '../../shared/types';

const OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

export function ThemePicker({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (next: ThemePreference) => void;
}): JSX.Element {
  return (
    <div className="setting">
      <div className="setting__text">
        <p className="setting__title">Appearance</p>
        <p className="setting__description">Applies to the popup and this dashboard.</p>
      </div>
      <div className="segmented" role="radiogroup" aria-label="Theme">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className="segmented__item"
            data-selected={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <Icon name={option.icon} size={15} />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
