# ClearBlock

A privacy-first ad and tracker blocker for Chrome, built on Manifest V3.

ClearBlock blocks ad and ad-tracker requests with Chrome's own `declarativeNetRequest`
engine, hides the ad slots that survive network blocking, reduces ad surfaces on YouTube,
and lets you pause protection per site. It has no backend, makes no network requests of its
own, and never sends anything about your browsing anywhere.

---

## Contents

1. [Features](#features)
2. [Screenshots](#screenshots)
3. [Tech stack](#tech-stack)
4. [Project structure](#project-structure)
5. [Install dependencies](#install-dependencies)
6. [Development](#development)
7. [Production build](#production-build)
8. [Load the extension in Chrome](#load-the-extension-in-chrome)
9. [Testing](#testing)
10. [Adding filter rules](#adding-filter-rules)
11. [The icon](#the-icon)
12. [Managing the allowlist](#managing-the-allowlist)
13. [Permissions and why each one is needed](#permissions-and-why-each-one-is-needed)
14. [Privacy](#privacy)
15. [How blocked counts are measured](#how-blocked-counts-are-measured)
16. [YouTube: what works and what cannot](#youtube-what-works-and-what-cannot)
17. [Manifest V3 limitations](#manifest-v3-limitations)
18. [Packaging for the Chrome Web Store](#packaging-for-the-chrome-web-store)
19. [Release checklist](#release-checklist)

---

## Features

- **Network blocking** — 133 bundled `declarativeNetRequest` rules across three lists:
  ad networks and exchanges (70), advertising trackers and identity graphs (45), and
  push/popup annoyances (18). Chrome applies the rules itself, so the extension never
  observes the requests.
- **Cosmetic filtering** — a single injected stylesheet hides ad slots, banners, sticky
  ads, overlays and sponsored containers at `document_start`, before first paint. No
  substring class matching, so `header`, `shadow`, `adapter` and friends are safe.
- **YouTube module** — hides feed, sidebar, masthead and in-player overlay ads, and presses
  the real **Skip** button when it appears. See
  [the limitations](#youtube-what-works-and-what-cannot) before you expect more.
- **Per-site control** — pause or resume protection for the site you are on, straight from
  the popup. Allowlist entries cover subdomains.
- **Blocked-request counts** — per tab and lifetime, honestly labelled as sampled or
  continuous (see [how they are measured](#how-blocked-counts-are-measured)).
- **Dashboard** — protection switches, theme (light / dark / system), allowlist management,
  per-ruleset toggles with rule counts, custom cosmetic selectors, and a full permission
  breakdown.
- **Offline by design** — no webfonts, no CDN assets, no remote filter lists, no telemetry.

## Screenshots

> Placeholders — replace before submitting to the Web Store. The recommended sizes are
> 1280×800 or 640×400.

| View                        | Image                                                    |
| --------------------------- | -------------------------------------------------------- |
| Popup — protection active   | `docs/screenshots/popup-active.png` _(placeholder)_      |
| Popup — paused on this site | `docs/screenshots/popup-paused.png` _(placeholder)_      |
| Dashboard — General         | `docs/screenshots/options-general.png` _(placeholder)_   |
| Dashboard — Allowlist       | `docs/screenshots/options-allowlist.png` _(placeholder)_ |
| Dashboard — Privacy         | `docs/screenshots/options-privacy.png` _(placeholder)_   |

## Tech stack

| Area               | Choice                                                                |
| ------------------ | --------------------------------------------------------------------- |
| Extension platform | Manifest V3, `declarativeNetRequest`, module service worker           |
| Language           | TypeScript 5.9 in `strict` mode, `noUncheckedIndexedAccess`, no `any` |
| UI                 | React 19 (popup + options), plain CSS with design tokens              |
| Build              | Vite 8 — two passes: ESM for pages + worker, IIFE for content scripts |
| Tests              | Vitest + Testing Library (unit + component), Playwright (end-to-end)  |
| Quality            | ESLint 10 flat config, Prettier, custom manifest and rule validators  |
| Package manager    | pnpm (npm works too)                                                  |

## Project structure

```text
clearblock/
├── manifest.json               MV3 manifest (version is synced from package.json at build)
├── popup.html / options.html   Vite HTML entry points
├── public/icons/               Generated PNG icons (16/32/48/128)
├── fixtures/
│   ├── test-page.html          Cosmetic filtering demo + false-positive traps
│   └── youtube-ad.html         Stand-in for YouTube's ad DOM, used by the unit tests
├── scripts/
│   ├── generate-rules.mjs      Curated domain lists -> DNR rulesets + metadata
│   ├── icon-artwork.mjs        The mark's geometry — single source of truth
│   ├── generate-icons.mjs      Artwork -> icon.svg, logo.svg, PNG set, UI constants
│   ├── build-static.mjs        Copies manifest + rules into dist, syncs the version
│   ├── validate-rules.mjs      Schema, unique IDs, over-broad rule detection
│   ├── validate-manifest.mjs   Built-output audit: files, banned APIs, unused permissions
│   └── package-zip.mjs         release/clearblock-v<version>.zip
├── e2e/run.mjs                 Playwright: loads dist/ unpacked and drives real Chrome
└── src/
    ├── background/
    │   ├── service-worker.ts       Lifecycle, message routing, badge, alarms
    │   ├── rule-manager.ts         Static ruleset enable/disable
    │   ├── allowlist-manager.ts    Dynamic allowAllRequests rules
    │   ├── statistics-manager.ts   Matched-rule sampling and de-duplication
    │   └── badge.ts                Toolbar badge
    ├── content/
    │   ├── index.ts                Entry: reads settings, applies, stays in sync
    │   ├── cosmetic-filter.ts      Observer orchestration, batching, budgets
    │   ├── element-hider.ts        Stylesheet injection, scroll-lock release
    │   ├── selectors.ts            Generic / placeholder / domain-specific selectors
    │   └── youtube/
    │       ├── youtube-controller.ts   Ad state machine, skip throttle
    │       ├── youtube-selectors.ts    All YouTube selectors, in one place
    │       ├── youtube-observer.ts     Bounded, batched MutationObserver
    │       └── youtube-navigation.ts   SPA navigation tracking
    ├── assets/
    │   ├── icon-source.png         Supplied reference artwork (kept for provenance)
    │   └── icon.svg / logo.svg     Generated vector mark — do not hand-edit
    ├── popup/                      Popup UI, components and hooks
    ├── options/                    Dashboard UI and panels
    ├── rules/                      Generated DNR rulesets + metadata.json
    ├── shared/                     types, constants, storage, domain, messaging, logger
    ├── ui/                         Primitives shared by popup and options
    │   └── icon-artwork.ts         Generated mark geometry used by the React UI
    └── styles/                     Design tokens and shared component styles
```

## Install dependencies

```bash
pnpm install     # or: npm install
```

Node 20.11+ is required (the build scripts use `import.meta.dirname`).

## Development

```bash
pnpm dev         # vite build --watch; rebuilds dist/ on every change
```

Then load `dist/` as an unpacked extension (below) and press the reload button on the
extension card after a rebuild. Content-script and service-worker changes need that reload;
popup and options changes only need the page to be reopened.

Useful individual commands:

```bash
pnpm typecheck   # three tsconfigs: src, tests, build scripts
pnpm lint        # ESLint
pnpm format      # Prettier --write
pnpm test        # Vitest unit + component tests
pnpm rules       # Regenerate src/rules/*.json from the curated domain lists
pnpm icons       # Regenerate every icon asset from scripts/icon-artwork.mjs
```

## Production build

```bash
pnpm build       # clean -> pages+worker -> content script -> manifest & rules
pnpm validate    # rule schema + built manifest audit
```

The build runs in three passes because MV3 content scripts are classic scripts and cannot
use ESM imports, so they need their own single-file IIFE bundle:

1. `vite build` — `popup.html`, `options.html` and `service-worker.js` as ES modules.
2. `vite build --config vite.content.config.ts` — `content.js` as a self-contained IIFE.
3. `node scripts/build-static.mjs` — copies `manifest.json` and `src/rules/*.json` into
   `dist/`, rewriting the manifest version from `package.json`.

Output: **`dist/`** — the directory to load unpacked, and the exact contents of the
uploaded ZIP.

## Load the extension in Chrome

1. Run `pnpm build`.
2. Open `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select the `dist/` directory.
6. Pin ClearBlock to the toolbar and open `fixtures/test-page.html` over http to see it work
   (a `file://` URL will not work — content scripts only run on http/https).

To serve the fixture quickly:

```bash
npx --yes http-server fixtures -p 8080   # then open http://127.0.0.1:8080/test-page.html
```

## Testing

```bash
pnpm test        # 215 unit + component tests (Vitest, jsdom)
pnpm test:e2e    # Playwright: loads dist/ in real Chromium and drives the UI
pnpm verify      # typecheck + lint + test + build + validate, in that order
```

What is covered:

| Suite                             | What it proves                                                               |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `tests/domain.test.ts`            | Hostname parsing, normalisation, subdomain matching, system-page detection   |
| `tests/storage.test.ts`           | Settings validation, schema migration, corrupt-record recovery, storage caps |
| `tests/messaging.test.ts`         | Message validation, response envelope, closed-port handling                  |
| `tests/allowlist-manager.test.ts` | Dynamic rule shape, ID ranges, toggle semantics                              |
| `tests/rule-manager.test.ts`      | Which rulesets are enabled for which settings, diffed updates                |
| `tests/statistics.test.ts`        | De-duplication across polls, tab lifecycle, reset semantics                  |
| `tests/cosmetic-filter.test.ts`   | Ads hidden, look-alikes untouched, dynamic insertions, teardown              |
| `tests/youtube.test.ts`           | Skip cooldown, click gating, "playback untouched", stale selectors           |
| `tests/popup.test.tsx`            | Popup states, keyboard operation, reload prompt, estimate labelling          |
| `tests/options.test.tsx`          | Every panel, domain validation, selector validation, permission copy         |
| `e2e/run.mjs`                     | Real Chromium: blocking, allowlist, popup, settings persistence              |

The cosmetic and YouTube suites load the same fixture files a human can open in a browser,
so the demo page and the tests cannot drift apart.

**Automated tests never depend on real YouTube ads.** Ad delivery is non-deterministic;
a test that waits for one is a test that fails for unrelated reasons. `fixtures/youtube-ad.html`
reproduces the ad DOM instead.

## Adding filter rules

Network rules are generated, not hand-edited:

1. Add the domain to the right list in `scripts/generate-rules.mjs`
   (`AD_DOMAINS`, `TRACKER_DOMAINS`, `ANNOYANCE_DOMAINS`), or add a precise URL rule to
   `TRACKER_URL_RULES` when a domain also serves non-advertising functionality.
2. Run `pnpm rules` — this rewrites `src/rules/*.json` and `src/rules/metadata.json`.
3. Run `pnpm validate:rules`.

Conventions the generator and validator enforce:

- ID ranges are fixed per list: ads `1000–1999`, trackers `2000–2999`, annoyances
  `3000–3999`. Dynamic allowlist rules start at `100000`, so the two spaces cannot collide.
- Every rule has a unique `id`, a `priority`, an `action` and a `condition`.
- `requestDomains` is preferred over `urlFilter`: it matches the domain and its subdomains,
  and it is both faster and harder to get wrong.
- **Block rules never target `main_frame`.** Blocking a top-level navigation replaces a page
  the user deliberately clicked with a Chrome error page.
- A rule with neither `requestDomains` nor a specific `urlFilter` is rejected as too broad.
- General analytics (Google Analytics, Plausible, …) is **not** blocked. That is not ad
  blocking, and blanket-blocking it breaks sites. Use custom cosmetic filters or your own
  rules if you want more.
- Consent-management platforms are **not** blocked either: blocking a CMP usually leaves a
  half-rendered banner and can stop a site loading entirely.

Cosmetic selectors live in `src/content/selectors.ts` (generic + domain-specific) and
`src/content/youtube/youtube-selectors.ts`. The hard rule: **never substring-match a class
or id**. CSS class selectors are token-exact, which is why `.ad` is safe while
`[class*="ad"]` is not.

## The icon

Every icon asset comes from one definition, `scripts/icon-artwork.mjs`:

```bash
pnpm icons
```

That regenerates, in order:

| Output                                       | Used by                                                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/assets/icon.svg`, `src/assets/logo.svg` | docs, store listing (generated — do not hand-edit)                                                   |
| `public/icons/icon-{16,32,48,128}.png`       | the manifest's `icons` and `action.default_icon`                                                     |
| `src/ui/icon-artwork.ts`                     | the React `Logo` and the shield glyphs, so the on-screen mark can never drift from the packaged PNGs |

The mark is a vector trace of `src/assets/icon-source.png`, the supplied reference artwork,
which is kept in the repo. The geometry — shield bounding box, the fold down the centre, and
the prohibition ring's centre, radius, stroke width and 45-degree slash — was measured from
that file's pixels and matches it to within about one pixel at 256px. Rendering from vector
rather than downsampling the 1254px source keeps the 16px and 32px icons crisp and drops the
reference's drop shadow, which only becomes a muddy halo at toolbar sizes.

The 16px PNG gets one deliberate optical adjustment: a thinner, slightly larger ring, because
at that size the ring's counter otherwise fills in and the "prohibited" reading is lost. The
silhouette and colours are identical at every size. Colours are the brand pair,
`#F97316` and `#EA580C`, which is also what the reference image samples to.

## Managing the allowlist

From the popup: **Pause on this site** / **Enable on this site**, or the switch.
From the dashboard: **Allowlist**, where you can add, search and remove domains.

Behaviour:

- Input is normalised: `https://WWW.Example.com/path` and `example.com:8443` both become
  `example.com`. Invalid input is rejected with a message, never silently saved.
- Entries cover subdomains: `example.com` also covers `shop.example.com`.
- Re-enabling a subdomain also removes a parent entry that would otherwise keep it paused.
- An allowlisted domain gets a dynamic `allowAllRequests` rule at a priority above every
  blocking rule, and the content script skips cosmetic filtering for that page — including
  inside third-party frames, which are judged by the **top-level** page's hostname.
- Changing the setting takes effect immediately for new requests. The popup then offers a
  **Reload** button; ClearBlock never reloads a tab behind your back.

## Permissions and why each one is needed

| Permission                                     | Why                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`                                      | Stores settings, allowlist and counters in `chrome.storage.local` on this device. Nothing is synced or uploaded.                                                                                                                                                                                                                     |
| `activeTab`                                    | Lets the popup read the address of the tab you are looking at, and read Chrome's matched-rule records for that tab so it can show a count. Granted only while you interact with the extension.                                                                                                                                       |
| `declarativeNetRequest`                        | The blocking engine. Chrome evaluates the rules internally; the extension is never told which URLs were requested.                                                                                                                                                                                                                   |
| `alarms`                                       | Periodic clean-up of per-tab counters for tabs that have been closed, and the 1-minute poll used by optional continuous counting.                                                                                                                                                                                                    |
| `<all_urls>` (host permission)                 | **Why an ad blocker needs it:** ads and trackers can appear on any site, and there is no way to know in advance which. The host permission is what lets the filter rules and the cosmetic stylesheet apply wherever you browse. ClearBlock uses this access for nothing else — it reads no page content, and sends nothing anywhere. |
| `declarativeNetRequestFeedback` (**optional**) | Requested only if you turn on _Continuous counting_ in the dashboard, and revoked when you turn it off. It lets Chrome report which rules matched so totals can be exact.                                                                                                                                                            |

ClearBlock does **not** request `tabs`, `webNavigation`, `scripting`, `cookies`, `history`
or `management`. `scripts/validate-manifest.mjs` fails the build if a declared permission is
not actually used anywhere in `src/`.

## Privacy

Full text in [PRIVACY.md](./PRIVACY.md). In short:

- No browsing history is collected.
- No URL, page content or identifier is ever transmitted. There is no server to transmit to.
- No analytics, telemetry or crash reporting.
- No data is sold or shared.
- Settings and counters stay in `chrome.storage.local` on this device.
- Filter lists are bundled in the extension; nothing is downloaded at runtime, and no
  remote code is loaded or executed.

## How blocked counts are measured

This is the part most ad blockers are vague about, so here is exactly what happens.

Manifest V3 removed blocking `webRequest`, and `declarativeNetRequest` has no "a request was
blocked" event. The only supported way to learn what was blocked is
`chrome.declarativeNetRequest.getMatchedRules()`, which has two hard constraints:

1. Chrome only retains matched-rule records for a short window (5 minutes at time of
   writing).
2. Without the `declarativeNetRequestFeedback` permission, the call is limited to a tab the
   extension has `activeTab` access to, and calls outside a user gesture are quota-limited
   to 20 per 10 minutes.

ClearBlock therefore has two modes and always tells you which one produced a number:

| Mode                    | How it works                                                                                                                                                                                               | What the number means                                                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sampled** (default)   | Opening the popup is a user gesture, which grants `activeTab`. The service worker reads matched rules for that tab, de-duplicates them against what it has already counted, and adds them to the counters. | A real measurement of real blocked requests, but only of activity inside the retention window while you had the popup open. Totals **under-count**. The UI marks these numbers `est.` and says so in plain words. |
| **Continuous** (opt-in) | You grant `declarativeNetRequestFeedback` in the dashboard. A 1-minute alarm then polls every tab — well inside the 5-minute retention window, so nothing is missed.                                       | An exact count of every request the rules blocked while the extension was running.                                                                                                                                |

De-duplication is exact: the newest record timestamp is persisted along with the keys of any
records sharing that exact millisecond, so a service-worker restart cannot cause
double-counting. Per-tab counters are dropped when a tab navigates or closes, capped at 200
tabs, and pruned hourly.

**Numbers are never synthesised.** If ClearBlock did not observe it, it does not count it.
The toolbar badge shows a count only in continuous mode; in sampled mode it shows nothing
rather than a stale number, and it shows `off` when protection is paused for that tab.

## YouTube: what works and what cannot

**ClearBlock does not block 100% of YouTube ads, and nothing built on Manifest V3 can
honestly claim to.**

What the module does:

- Hides ad surfaces outside the player: feed ads, sidebar ads, masthead ads, promoted
  shelves, and the empty layout boxes they leave behind.
- Hides overlay ads drawn on top of the video.
- Presses the real **Skip** button once it exists, is visible and is enabled — with an
  800 ms cooldown, a cap of 3 presses per ad break and a hard ceiling of 20 per minute, so a
  click loop is impossible.
- Tracks SPA navigation (`yt-navigate-finish`, `yt-page-data-updated`, `popstate`,
  `hashchange`) with no polling, and re-points its observer at the new player.

What it deliberately does **not** do:

- No change to playback rate, no muting, no seeking.
- No tampering with, decoding or rewriting YouTube's media streams.
- No Premium spoofing.
- Nothing that touches playback controls, fullscreen, captions, the miniplayer, playlists,
  Shorts or live streams.

Why in-stream ads still play:

- YouTube serves in-stream ad segments from the **same endpoints and often the same
  manifests** as the video itself. A network rule that blocked them would block the video.
- Ads without a Skip button cannot be skipped — there is nothing legitimate to press.
- YouTube changes its DOM frequently. When a selector stops matching, the module does
  nothing and logs at debug level in development builds; it never throws into the page.

If YouTube protection ever interferes with playback, turn it off in the dashboard or pause
ClearBlock for `youtube.com` and please open an issue.

## Manifest V3 limitations

Things that are simply not possible under MV3, and how ClearBlock handles them:

| Limitation                          | Consequence                                                   | What ClearBlock does                                                                    |
| ----------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| No blocking `webRequest`            | Cannot inspect or cancel requests in JavaScript               | Uses `declarativeNetRequest` exclusively                                                |
| No per-request blocked event        | Cannot count blocks in real time for free                     | Two clearly-labelled counting modes (above)                                             |
| Static rules cannot be downloaded   | No live-updating filter lists                                 | Lists are bundled; updates ship with an extension update                                |
| No remote code                      | No scriptlets / no remote filter engines                      | All logic is in the bundle; CSP-safe, no `eval`, no `new Function`                      |
| Service worker is suspended         | Module-level state disappears                                 | `chrome.storage` is the source of truth; the worker rebuilds its state on every wake-up |
| Content scripts are classic scripts | No ESM imports in `content.js`                                | Separate IIFE build pass                                                                |
| Chrome pages are off-limits         | No protection on `chrome://`, the Web Store, the new-tab page | The popup shows an explanatory state instead of a broken toggle                         |

### Things ClearBlock does not promise

- 100% of ads on every site. No blocker achieves that, and anti-adblock systems change daily.
- 100% of YouTube ads — see above.
- Blocking first-party ads served from the site's own domain, which are indistinguishable
  from site content at the network layer. Cosmetic filtering catches some of these.
- Anti-adblock circumvention.
- Blocking every tracker. The tracker list targets _advertising_ trackers; general analytics
  is intentionally left alone.

## Packaging for the Chrome Web Store

```bash
pnpm release     # verify (typecheck, lint, test, build, validate) then zip
```

This produces **`release/clearblock-v<version>.zip`** from `dist/` only — no sources, no
`node_modules`, no `_metadata/` directory (Chrome writes that into an unpacked extension
directory when it loads one; the packaging script removes and excludes it).

To bump the version, edit `version` in `package.json`; `scripts/build-static.mjs` writes it
into the manifest at build time, so the two cannot disagree.

## Release checklist

The full pre-submission checklist is in
[CHROME_WEB_STORE_CHECKLIST.md](./CHROME_WEB_STORE_CHECKLIST.md). The short version:

- [ ] `pnpm verify` passes with no errors.
- [ ] `pnpm test:e2e` passes against the freshly built `dist/`.
- [ ] Version bumped in `package.json`.
- [ ] Real screenshots replace the placeholders above.
- [ ] Store listing description matches what the extension actually does — no "blocks all
      YouTube ads" claim.
- [ ] Privacy practices in the Developer Dashboard declare **no** data collection.
- [ ] `<all_urls>` justification submitted (text is in the checklist).
- [ ] `release/clearblock-v<version>.zip` installed from scratch and smoke-tested.

## Licence

MIT — see [LICENSE](./LICENSE).

ClearBlock is an independent project. It is not affiliated with, endorsed by, or connected
to Google LLC or YouTube in any way.
