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
10. [Filter lists](#filter-lists)
11. [The icon](#the-icon)
12. [Managing the allowlist](#managing-the-allowlist)
13. [Permissions and why each one is needed](#permissions-and-why-each-one-is-needed)
14. [Privacy](#privacy)
15. [How blocked counts are measured](#how-blocked-counts-are-measured)
16. [YouTube: how the video ads are blocked](#youtube-how-the-video-ads-are-blocked)
17. [Manifest V3 limitations](#manifest-v3-limitations)
18. [Packaging for the Chrome Web Store](#packaging-for-the-chrome-web-store)
19. [Store submission folder](#store-submission-folder)
20. [Release checklist](#release-checklist)

---

## Features

- **Network blocking** — 28,999 bundled `declarativeNetRequest` rules compiled from the
  community filter lists: EasyList (17,738), EasyPrivacy (10,872), ABPVN for Vietnamese
  sites (371) and ClearBlock's own annoyance list (18). Chrome applies the rules itself, so
  the extension never observes the requests.
- **Cosmetic filtering** — a single injected stylesheet hides ad slots, banners, sticky
  ads, overlays and sponsored containers at `document_start`, before first paint. No
  substring class matching, so `header`, `shadow`, `adapter` and friends are safe.
- **YouTube module** — removes the ad schedule from YouTube's player response in the page's
  own JavaScript world, so in-stream video ads are never scheduled; also hides feed,
  sidebar, masthead and overlay ads and presses a real **Skip** button if one appears.
  See [how it works and what it cannot promise](#youtube-how-the-video-ads-are-blocked).
- **Per-site control** — pause or resume protection for the site you are on, straight from
  the popup. Allowlist entries cover subdomains.
- **Blocked-request counts** — per tab and lifetime, honestly labelled as sampled or
  continuous (see [how they are measured](#how-blocked-counts-are-measured)).
- **Dashboard** — protection switches, theme (light / dark / system), allowlist management,
  per-ruleset toggles with rule counts, custom cosmetic selectors, and a full permission
  breakdown.
- **Offline by design** — no webfonts, no CDN assets, no remote filter lists, no telemetry.

## Screenshots

Generated from the built extension with `npm run screenshots` — every pixel of UI is a real
capture, not a mock-up. They live in `docs/screenshots/` at the 1280x800 the Chrome Web Store
requires.

| View                                             | File                                        |
| ------------------------------------------------ | ------------------------------------------- |
| Popup, protection active, over an article        | `docs/screenshots/store-1-popup-active.png` |
| The same page with and without ClearBlock        | `docs/screenshots/store-2-before-after.png` |
| Popup paused on the site, with the reload prompt | `docs/screenshots/store-3-popup-paused.png` |
| Dashboard — protection switches                  | `docs/screenshots/store-4-dashboard.png`    |
| Dashboard — privacy and permissions              | `docs/screenshots/store-5-privacy.png`      |
| Dashboard — allowlist                            | `docs/screenshots/store-6-allowlist.png`    |

The page underneath is `fixtures/demo-article.html`, a fictional publication: a listing image
should not carry a real newspaper's masthead, and a fixture makes the before/after an exact
like-for-like comparison. It also embeds genuine ad-network tags, so it exercises network
blocking as well as cosmetic filtering.

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
│   ├── demo-article.html       Fictional publication used for the store screenshots
│   └── youtube-ad.html         Stand-in for YouTube's ad DOM, used by the unit tests
├── store/
│   ├── DESCRIPTION.txt         Listing description (tracked, copied into the store folder)
│   └── PASTE-INTO-DASHBOARD.template.md  Filled in at build time with version + counts
├── scripts/
│   ├── generate-rules.mjs      Curated domain lists -> DNR rulesets + metadata
│   ├── fetch-filters.mjs       Downloads the upstream lists (build time only)
│   ├── compile-filters.mjs     Adblock Plus syntax -> DNR rulesets + cosmetic table
│   ├── lib/abp-parser.mjs      The converter, with its own unit tests
│   ├── lib/curated-filters.mjs ClearBlock's own vetted domain lists
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

## Filter lists

Network rules are **compiled from the community filter lists**, not hand-written:

```bash
npm run filters          # fetch + compile + validate
npm run filters:fetch    # download the lists into filters/ (build time only)
npm run filters:compile  # Adblock Plus syntax -> declarativeNetRequest
```

This matters more than it sounds. A hand-curated list of "known ad companies" cannot block
real advertising: the networks rotate, and regional sites buy from private ad servers that
no generic list will ever name. The community lists do name them.

| Ruleset       | Source                    | Rules  |
| ------------- | ------------------------- | ------ |
| `ads`         | EasyList                  | 17,738 |
| `trackers`    | EasyPrivacy               | 10,872 |
| `regional-vi` | ABPVN (Vietnamese sites)  | 371    |
| `annoyances`  | ClearBlock's curated list | 18     |

The lists are downloaded **at build time only** and are git-ignored; what ships is the
compiled output. The extension makes no network request of its own, which is both a Chrome
Web Store requirement and why ClearBlock works offline. Attribution and licence terms for
the bundled data are in [NOTICE.md](./NOTICE.md).

### The 30,000-rule ceiling

Chrome guarantees an extension only 30,000 _enabled_ static rules. The lists convert to
about 112,000, so roughly three quarters have to be left out. `scripts/compile-filters.mjs`
therefore ranks rules by blocking power per slot rather than truncating in file order:

1. exception rules — dropping one turns a working site into a broken one;
2. whole-domain blocks (`||adserver.example^`) — the broadest rule there is;
3. rules scoped to named sites via `$domain=`;
4. loose path and substring patterns.

Regional lists are small and disproportionately useful, so `regional-vi` and `annoyances`
are reserved in full and never trimmed.

### What the converter refuses to convert

Filters that DNR cannot express are counted and dropped, never approximated — a wrong rule
breaks a site, while a missing rule merely fails to block one thing. `npm run filters:compile`
prints the tally. The main categories are `$redirect` / `$csp` / `$removeparam` rewriting,
regex filters (DNR uses RE2 and would reject many of them), `$popup` on its own (DNR cannot
cancel a `window.open`; the popunder _script_ gets blocked instead), and anything blocking a
top-level navigation, which would replace a page the user clicked with a Chrome error.

### Adding your own rules

Edit the curated lists in `scripts/lib/curated-filters.mjs` — they are merged into the
compiled rulesets first, so they survive trimming — then run `npm run filters:compile` and
`npm run validate:rules`.

Conventions the compiler and validator enforce:

- IDs are allocated per ruleset in millions (`ads` 1,000,000+, `trackers` 2,000,000+,
  `annoyances` 3,000,000+, `regional-vi` 4,000,000+). Dynamic allowlist rules sit at
  100,000, so the two spaces cannot collide.
- **Block rules never target `main_frame`.**
- `requestDomains` is preferred over `urlFilter`: faster, and harder to get wrong.
- A `urlFilter` beginning with `||` must be followed by a hostname. `||*.example.com/x` is
  legal Adblock Plus but malformed for DNR, and Chrome does not reject it — **it hangs
  while indexing and never finishes starting**. One such rule among 29,000 was enough to
  stop Chrome launching at all. The compiler normalises it and the validator rejects it.
- General analytics and consent-management platforms are not in ClearBlock's own curated
  lists. The upstream lists make their own call, which is why EasyPrivacy blocks Google
  Analytics.

Cosmetic selectors live in `src/content/selectors.ts` and
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

ClearBlock does **not** request `tabs`, `webNavigation`, `cookies`, `history` or
`management`. `scripts/validate-manifest.mjs` fails the build if a declared permission is
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

## YouTube: how the video ads are blocked

ClearBlock blocks YouTube's in-stream video ads. It does it the same way uBlock Origin,
uBlock Origin Lite and AdBlock do, and it is worth understanding the mechanism because the
obvious approach genuinely does not work.

### Why a network rule cannot do it

The media segments for an ad and the media segments for the video both come from
`googlevideo.com`, frequently through the same manifest. There is no URL-level signal that
separates them, so a blocking rule that catches the ad also catches the video.

### What does work: removing the schedule, not the media

YouTube's player does not decide on its own when to show an ad. It reads a **player
response** object, and the ad breaks are listed in four fields on it:

```text
adPlacements   playerAds   adSlots   adBreakHeartbeatParams
```

Delete those before the player reads them and there is no ad break to play. The media is
untouched; the schedule simply no longer contains any ads.

That object reaches the player by two routes, and both are covered:

1. **inline**, assigned to `window.ytInitialPlayerResponse` by a script in the watch page —
   intercepted with a property setter installed at `document_start`;
2. **as JSON** from `youtubei/v1/player` on every in-page navigation after that —
   intercepted by hooking `JSON.parse` and `Response.prototype.json`.

### Why this needs a MAIN-world content script

An ordinary content script runs in an isolated world and cannot see, let alone patch,
`window.ytInitialPlayerResponse` or the page's `JSON.parse`. Manifest V3 supports
`"world": "MAIN"` for exactly this, and `src/content/youtube/ad-pruner.ts` is registered
that way — dynamically, by the service worker, so that the YouTube toggle and the per-site
pause genuinely unregister it instead of leaving it running.

The pruner touches nothing else. `streamingData`, `playabilityStatus`, `videoDetails`,
`captions` and `playerConfig` are all left exactly as they arrived; the unit tests in
`tests/youtube-pruner.test.ts` assert this, because removing any of them would break
playback rather than advertising.

### The rest of the YouTube module

- Hides feed, sidebar, masthead and in-player overlay ads, and collapses the gaps they leave.
- Presses the real **Skip** button when one appears — with an 800 ms cooldown, three presses
  per break and a hard ceiling of twenty per minute, so a click loop is impossible.
- Follows YouTube's single-page navigation without polling.
- Never changes playback rate, mutes, seeks, tampers with media streams, spoofs Premium, or
  interferes with playback controls, fullscreen, captions, the miniplayer, playlists, Shorts
  or live streams.

### What this does not guarantee

This is an arms race, and honesty about that matters more than a marketing claim:

- **YouTube changes these shapes.** When a field is renamed or moved, ads return until the
  pruner is updated. That is true of every blocker, including the big ones.
- **Server-side ad insertion would defeat it.** If YouTube ever stitches ads into the media
  stream itself, the schedule disappears as a separate thing to remove and no extension —
  this one or any other — can help.
- **YouTube may detect it.** Anti-adblock prompts are a moving target and ClearBlock does
  not attempt to defeat them.

If YouTube playback ever misbehaves, turn YouTube protection off in the dashboard or pause
ClearBlock for `youtube.com`, and please open an issue.

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
- That YouTube ad blocking keeps working forever — see above.
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

## Store submission folder

```bash
npm run store
```

That runs the whole chain — build, zip, screenshots, promo tiles — and assembles
**`../clearblock-store/`**, ready to upload:

```text
clearblock-store/
├── clearblock-1.0.0-chrome.zip     the file you upload
├── unpacked-chrome/                the same build, unzipped, for "Load unpacked"
├── PASTE-INTO-DASHBOARD.md         every dashboard field, ready to paste
├── DESCRIPTION.txt                 the listing description on its own
├── PRIVACY.md                      publish this somewhere and link it in the dashboard
├── CHROME_WEB_STORE_CHECKLIST.md   the pre-submission checklist
├── store-icon-128.png              128x128
├── promo-small-440x280.png         the listing tile
├── promo-marquee-1400x560.png      only used if Google features the extension
└── screenshots/                    six 1280x800 captures
```

The assembler verifies the exact pixel dimensions of every image and the character counts of
the listing text before it writes anything, because the dashboard only rejects a wrong-sized
asset after you have filled in the entire form. It also deletes the `_metadata/` directory
Chrome writes into an unpacked extension folder, which must never reach a reviewer.

The individual steps can be run on their own:

```bash
npm run screenshots   # captures and composes the six store images
npm run promo         # renders both promo tiles
node scripts/build-store-folder.mjs [target-dir]
```

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
