import { useMemo, useState, type FormEvent, type JSX } from 'react';
import { normalizeDomain } from '../../shared/domain';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

export function AllowlistPanel({
  domains,
  onChange,
  saving,
}: {
  domains: readonly string[];
  onChange: (next: string[]) => void;
  saving: boolean;
}): JSX.Element {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return domains;
    return domains.filter((domain) => domain.includes(needle));
  }, [domains, query]);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    const normalized = normalizeDomain(draft);
    if (!normalized) {
      setError('Enter a valid domain, for example example.com');
      return;
    }
    if (domains.includes(normalized)) {
      setError(`${normalized} is already on the allowlist`);
      return;
    }
    setError(null);
    setDraft('');
    onChange([...domains, normalized]);
  };

  return (
    <section className="panel" aria-labelledby="allowlist-heading">
      <header className="panel__header">
        <h2 id="allowlist-heading" className="panel__title">
          Allowlist
        </h2>
        <p className="panel__subtitle">
          ClearBlock does no network or cosmetic filtering on these sites. Subdomains are covered
          automatically, so <code>example.com</code> also covers <code>shop.example.com</code>.
        </p>
      </header>

      <form className="allowlist__add" onSubmit={submit} noValidate>
        <label className="cb-visually-hidden" htmlFor="allowlist-input">
          Domain to allow
        </label>
        <input
          id="allowlist-input"
          className="input"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="example.com"
          value={draft}
          aria-invalid={error !== null}
          aria-describedby={error ? 'allowlist-error' : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
        />
        <Button variant="primary" icon="plus" type="submit" disabled={saving}>
          Add
        </Button>
      </form>
      {error ? (
        <p className="panel__error" id="allowlist-error" role="alert">
          {error}
        </p>
      ) : null}

      {domains.length > 0 ? (
        <div className="allowlist__search">
          <Icon name="search" size={16} />
          <label className="cb-visually-hidden" htmlFor="allowlist-search">
            Search allowlist
          </label>
          <input
            id="allowlist-search"
            className="input input--bare"
            type="search"
            placeholder={`Search ${domains.length} domain${domains.length === 1 ? '' : 's'}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      ) : null}

      {domains.length === 0 ? (
        <p className="panel__empty">
          No sites are allowlisted. Use “Pause on this site” in the popup to add one.
        </p>
      ) : filtered.length === 0 ? (
        <p className="panel__empty">No domain matches “{query}”.</p>
      ) : (
        <ul className="allowlist__list">
          {filtered.map((domain) => (
            <li key={domain} className="allowlist__item">
              <span className="allowlist__domain">{domain}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${domain} from the allowlist`}
                disabled={saving}
                onClick={() => onChange(domains.filter((entry) => entry !== domain))}
              >
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
