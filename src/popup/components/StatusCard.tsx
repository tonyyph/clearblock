import type { JSX } from 'react';
import { Icon } from '../../ui/Icon';

export type ProtectionState = 'active' | 'paused' | 'unsupported' | 'error';

const COPY: Record<ProtectionState, { title: string; body: string }> = {
  active: { title: 'Protection is active', body: 'Ads and ad trackers are being blocked.' },
  paused: { title: 'Protection is paused', body: 'ClearBlock is not filtering this site.' },
  unsupported: {
    title: 'Nothing to protect here',
    body: 'Chrome does not let extensions run on browser pages.',
  },
  error: { title: 'Status unavailable', body: 'ClearBlock could not read this tab.' },
};

export function StatusCard({
  state,
  hostname,
}: {
  state: ProtectionState;
  hostname: string | null;
}): JSX.Element {
  const copy = COPY[state];
  return (
    <section className="status" data-state={state} aria-live="polite">
      <span className="status__badge" aria-hidden="true">
        <Icon name={state === 'active' ? 'shield' : 'shield-off'} size={22} />
      </span>
      <div className="status__text">
        <h2 className="status__title">{copy.title}</h2>
        <p className="status__body">{copy.body}</p>
        {hostname ? <p className="status__host">{hostname}</p> : null}
      </div>
    </section>
  );
}
