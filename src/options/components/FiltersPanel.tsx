import { useEffect, useState, type JSX } from 'react';
import { Button } from '../../ui/Button';
import { Toggle } from '../../ui/Toggle';
import { isSafeSelector } from '../../shared/storage';
import type { ExtensionSettings, RulesetId, RulesetInfo } from '../../shared/types';

/** Which settings flag controls which bundled ruleset. `ads` is the baseline and always on. */
const RULESET_CONTROL: Record<RulesetId, keyof ExtensionSettings | null> = {
  ads: null,
  trackers: 'trackerBlockingEnabled',
  annoyances: 'annoyanceBlockingEnabled',
};

export function FiltersPanel({
  rulesets,
  settings,
  onToggleRuleset,
  onSaveSelectors,
  onRefresh,
  saving,
}: {
  rulesets: RulesetInfo[] | null;
  settings: ExtensionSettings;
  onToggleRuleset: (key: keyof ExtensionSettings, value: boolean) => void;
  onSaveSelectors: (selectors: string[]) => void;
  onRefresh: () => void;
  saving: boolean;
}): JSX.Element {
  const [draft, setDraft] = useState(settings.customCosmeticSelectors.join('\n'));
  const [invalid, setInvalid] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setDraft(settings.customCosmeticSelectors.join('\n'));
  }, [settings.customCosmeticSelectors]);

  const save = (): void => {
    const lines = draft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const bad = lines.filter((line) => !isSafeSelector(line));
    setInvalid(bad);
    if (bad.length > 0) return;
    onSaveSelectors(lines);
    setSavedAt(Date.now());
  };

  return (
    <section className="panel" aria-labelledby="filters-heading">
      <header className="panel__header">
        <h2 id="filters-heading" className="panel__title">
          Filters
        </h2>
        <p className="panel__subtitle">
          Filter lists ship inside the extension and are never downloaded at runtime — Chrome’s
          policy forbids remotely hosted code, and it also means ClearBlock works offline.
        </p>
      </header>

      {rulesets === null ? (
        <div className="cb-skeleton panel__skeleton" aria-hidden="true" />
      ) : (
        <ul className="ruleset__list">
          {rulesets.map((ruleset) => {
            const control = RULESET_CONTROL[ruleset.id];
            const locked = control === null;
            const checked = locked
              ? settings.enabled
              : Boolean(settings[control] as boolean) && settings.enabled;
            return (
              <li key={ruleset.id} className="ruleset">
                <div className="ruleset__text">
                  <p className="ruleset__name">{ruleset.id}</p>
                  <p className="ruleset__description">{ruleset.description}</p>
                  <p className="ruleset__meta">
                    {ruleset.ruleCount.toLocaleString()} rules · updated {ruleset.updatedAt} ·{' '}
                    {ruleset.enabled ? 'loaded' : 'not loaded'}
                  </p>
                </div>
                <Toggle
                  checked={checked}
                  disabled={locked || saving || !settings.enabled}
                  label={`Enable the ${ruleset.id} filter list`}
                  onChange={(next) => {
                    if (control) onToggleRuleset(control, next);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}

      <Button variant="secondary" icon="refresh" onClick={onRefresh} disabled={saving}>
        Reload filter lists
      </Button>

      <div className="panel__divider" />

      <h3 className="panel__subheading">Custom cosmetic filters</h3>
      <p className="panel__subtitle">
        One CSS selector per line, applied on every site in addition to the built-in list. Selectors
        only hide elements; they cannot run code, so <code>{'{'}</code>, <code>@</code> and comments
        are rejected.
      </p>
      <label className="cb-visually-hidden" htmlFor="custom-selectors">
        Custom cosmetic selectors
      </label>
      <textarea
        id="custom-selectors"
        className="textarea"
        rows={6}
        spellCheck={false}
        value={draft}
        aria-invalid={invalid.length > 0}
        placeholder={'.sponsored-banner\n#promo-rail'}
        onChange={(event) => {
          setDraft(event.target.value);
          if (invalid.length > 0) setInvalid([]);
          if (savedAt) setSavedAt(null);
        }}
      />
      {invalid.length > 0 ? (
        <p className="panel__error" role="alert">
          Not a valid selector: {invalid.slice(0, 3).join(', ')}
          {invalid.length > 3 ? ` (+${invalid.length - 3} more)` : ''}
        </p>
      ) : null}
      <div className="panel__row">
        <Button variant="primary" icon="check" onClick={save} disabled={saving}>
          Save selectors
        </Button>
        {savedAt ? (
          <span className="panel__saved" role="status">
            Saved
          </span>
        ) : null}
      </div>
    </section>
  );
}
