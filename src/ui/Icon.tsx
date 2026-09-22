/**
 * Inline SVG icon set.
 *
 * Icons are drawn here rather than pulled from an icon package or a CDN: the UI must work
 * with no network access, and bundling one small set keeps the extension payload tiny.
 * Emoji are never used as icons.
 */
import type { JSX, SVGProps } from 'react';
import {
  ARTWORK_TO_ICON_SCALE,
  MARK,
  MARK_COLOR,
  SHIELD_DARK,
  SHIELD_LIGHT,
  SHIELD_PATH,
  SHIELD_RIGHT_PATH,
  GLYPH_STROKE,
  STRIKE_LINE,
} from './icon-artwork';

export type IconName =
  | 'shield'
  | 'shield-off'
  | 'pause'
  | 'play'
  | 'settings'
  | 'filter'
  | 'flag'
  | 'check'
  | 'close'
  | 'search'
  | 'trash'
  | 'plus'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'refresh'
  | 'info'
  | 'external';

const PATHS: Record<IconName, JSX.Element> = {
  // The two shield glyphs are the brand silhouette itself, scaled from the 512 artwork box
  // onto the 24-unit icon grid, so the status badge matches the toolbar icon exactly.
  shield: (
    <g transform={`scale(${ARTWORK_TO_ICON_SCALE})`}>
      <path d={SHIELD_PATH} />
    </g>
  ),
  'shield-off': (
    <g
      transform={`scale(${ARTWORK_TO_ICON_SCALE})`}
      strokeWidth={GLYPH_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={SHIELD_PATH} />
      <path d={STRIKE_LINE} />
    </g>
  ),
  pause: (
    <>
      <path d="M9 5v14" strokeWidth="2.4" />
      <path d="M15 5v14" strokeWidth="2.4" />
    </>
  ),
  play: <path d="M7 4.8 19 12 7 19.2V4.8Z" />,
  settings: (
    <>
      <path d="M3.5 8h11M18.5 8h2M3.5 16h5M12.5 16h8" strokeWidth="1.8" />
      <circle cx="16.5" cy="8" r="2.4" />
      <circle cx="10.5" cy="16" r="2.4" />
    </>
  ),
  filter: <path d="M3.5 5.5h17l-6.6 7.6V19l-3.8-2.2v-3.7L3.5 5.5Z" strokeWidth="1.8" />,
  flag: (
    <>
      <path d="M5 21V4" strokeWidth="2" />
      <path d="M5 4.8h10.5l-1.6 3.4 1.6 3.4H5" />
    </>
  ),
  check: <path d="m5 12.6 4.6 4.4L19 7" strokeWidth="2.4" />,
  close: <path d="M6 6 18 18M18 6 6 18" strokeWidth="2.2" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m15.6 15.6 4 4" strokeWidth="2.2" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 7h15" strokeWidth="2" />
      <path d="M9.5 7V4.8h5V7" />
      <path d="M6.5 7l.9 12.2h9.2L17.5 7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" strokeWidth="2.2" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />,
  monitor: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.3" strokeWidth="2" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" strokeWidth="2" />
      <path d="M18 14.5V20H4V6h5.5" />
    </>
  ),
};

/** Icons that are drawn as a filled shape instead of a stroke. */
const FILLED: ReadonlySet<IconName> = new Set(['shield', 'play', 'moon']);

export type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
  title?: string;
};

export function Icon({ name, size = 18, title, ...rest }: IconProps): JSX.Element {
  const filled = FILLED.has(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}

/** The ClearBlock mark: the same artwork the packaged PNG icons are generated from. */
export function Logo({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <path d={SHIELD_PATH} fill={SHIELD_LIGHT} />
      <path d={SHIELD_RIGHT_PATH} fill={SHIELD_DARK} />
      <g stroke={MARK_COLOR} fill="none">
        <circle cx={MARK.cx} cy={MARK.cy} r={MARK.radius} strokeWidth={MARK.ringStroke} />
        <path d={`M${MARK.x1} ${MARK.y1} L${MARK.x2} ${MARK.y2}`} strokeWidth={MARK.slashStroke} />
      </g>
    </svg>
  );
}
