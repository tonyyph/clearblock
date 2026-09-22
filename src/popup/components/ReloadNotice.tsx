import type { JSX } from 'react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

/**
 * Network rules only affect requests a page has not made yet, so a change needs a reload
 * to fully apply. ClearBlock never reloads a tab silently — it asks.
 */
export function ReloadNotice({ onReload }: { onReload: () => void }): JSX.Element {
  return (
    <div className="notice" role="status">
      <Icon name="info" size={16} />
      <span className="notice__text">Reload the page to apply this change.</span>
      <Button variant="primary" icon="refresh" onClick={onReload}>
        Reload
      </Button>
    </div>
  );
}
