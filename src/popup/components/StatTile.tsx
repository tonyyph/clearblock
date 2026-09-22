import type { JSX } from 'react';

export function StatTile({
  label,
  value,
  hint,
  estimate = false,
}: {
  label: string;
  value: number | null;
  hint?: string;
  estimate?: boolean;
}): JSX.Element {
  return (
    <div className="stat cb-card">
      <p className="stat__label">
        {label}
        {/* The UI always says when a number is a sample rather than a full count. */}
        {estimate ? (
          <span className="stat__chip" title="Sampled while the popup was open">
            est.
          </span>
        ) : null}
      </p>
      {value === null ? (
        <div className="cb-skeleton stat__skeleton" aria-hidden="true" />
      ) : (
        <p className="stat__value">{value.toLocaleString()}</p>
      )}
      {hint ? <p className="stat__hint">{hint}</p> : null}
    </div>
  );
}
