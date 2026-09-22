# Chrome Web Store submission checklist

Work through this top to bottom before every upload. Anything unticked is a likely
rejection or a likely bad review.

## 1. Build integrity

- [ ] `pnpm verify` passes: typecheck (3 tsconfigs), ESLint, 215 unit/component tests,
      production build, rule validation, manifest validation.
- [ ] `pnpm test:e2e` passes against the freshly built `dist/`.
- [ ] `version` bumped in `package.json` (the manifest version is derived from it at build
      time — do not edit it by hand).
- [ ] `pnpm release` produced `release/clearblock-v<version>.zip`.
- [ ] The ZIP contains only build output: no `src/`, no `node_modules/`, no `_metadata/`,
      no `.DS_Store`, no source maps.

## 2. Manifest

- [ ] `manifest_version` is 3.
- [ ] `description` is ≤ 132 characters and describes what the extension actually does.
- [ ] Every file the manifest references exists in the ZIP (`validate-manifest.mjs` checks
      this).
- [ ] Icons present at 16, 32, 48 and 128 px, and legible at 16 px on both light and dark
      toolbars.
- [ ] No permission is declared that the code does not use (`validate-manifest.mjs` fails
      the build on this).
- [ ] `declarativeNetRequestFeedback` stays in `optional_permissions` — never promote it to
      `permissions`, it carries a browsing-history warning.

## 3. Code policy

- [ ] No `eval`, no `new Function`, no inline `<script>` (checked by
      `validate-manifest.mjs` across all built JS).
- [ ] No remotely hosted code: no script or filter list fetched at runtime, no CDN assets,
      no webfonts.
- [ ] No obfuscation or minification that hides intent — the build minifies, it does not
      obfuscate.
- [ ] No Manifest V2 APIs; `chrome.webRequest` appears nowhere.
- [ ] No undeclared API usage.
- [ ] Source is available for reviewers if requested (public repository).

## 4. Functionality and honesty

- [ ] Every feature in the listing exists, and every feature that exists is in the listing.
- [ ] The listing does **not** claim ClearBlock blocks all ads, or all YouTube ads.
- [ ] Blocked counts are labelled as sampled where they are sampled; no fabricated numbers
      anywhere in the UI.
- [ ] No ad injection, no affiliate links, no search-engine change, no homepage change, no
      new-tab takeover.
- [ ] No hidden functionality of any kind.
- [ ] The extension works with no network connection.

## 5. Branding

- [ ] The name "ClearBlock" and the icon do not imply affiliation with Google, YouTube,
      Chrome or any blocked ad network.
- [ ] No Google, YouTube or Chrome logo, wordmark or colour identity is used anywhere.
- [ ] Listing text states that ClearBlock is an independent project.
- [ ] Screenshots do not show third-party logos as if endorsing the extension.

## 6. Privacy declarations (Developer Dashboard → Privacy practices)

- [ ] Single purpose is stated as: _block advertising and advertising-tracker requests, and
      hide leftover ad elements on web pages._
- [ ] Data collection: **"This extension does not collect or use user data."**
- [ ] The certification checkboxes are ticked: - does not sell or transfer user data to third parties outside approved use cases; - does not use or transfer user data for purposes unrelated to the single purpose; - does not use or transfer user data to determine creditworthiness or for lending.
- [ ] Privacy policy URL points at a published copy of `PRIVACY.md`.

### Permission justifications (copy/paste)

- **`storage`** — Stores the user's own settings and allowlist locally on the device.
  Nothing is synced or transmitted.
- **`activeTab`** — Lets the popup show the hostname of the tab the user is looking at and
  read Chrome's matched-rule records for that tab to display a blocked count. Granted only
  on user interaction.
- **`declarativeNetRequest`** — The blocking engine. Rules are declared in advance and
  evaluated by Chrome; the extension never observes request URLs.
- **`alarms`** — Schedules periodic local clean-up of per-tab counters for closed tabs.
- **Host permission `<all_urls>`** — Advertising and ad trackers can appear on any website,
  and there is no way to know in advance which sites those will be, so an ad blocker must be
  able to apply its filter rules and cosmetic stylesheet wherever the user browses. The
  access is used solely to apply blocking rules and to hide ad elements locally. No page
  content is read and no data is transmitted; the extension makes no network requests of its
  own.
- **`declarativeNetRequestFeedback` (optional)** — Requested only when the user explicitly
  enables the "Continuous counting" setting, so Chrome can report which of the extension's
  own rules matched. Revoked automatically when the setting is turned off.

## 7. Store listing assets

- [ ] Small promo tile 440×280 PNG.
- [ ] At least one screenshot at 1280×800 or 640×400 (5 recommended: popup active, popup
      paused, dashboard General, dashboard Allowlist, dashboard Privacy).
- [ ] Screenshots show the real UI — no mock-ups, no fabricated statistics.
- [ ] Category: **Productivity** (or Privacy & Security).
- [ ] Short description matches the manifest `description`.

## 8. Manual smoke test on a clean profile

Install the ZIP into a fresh Chrome profile and confirm:

- [ ] The popup opens, shows the current hostname, and shows a status of active or paused.
- [ ] **Pause on this site** switches the state and offers a Reload button (it must not
      reload on its own).
- [ ] After reloading, ads reappear on the paused site.
- [ ] **Enable on this site** restores blocking after a reload.
- [ ] The dashboard opens from the popup; every panel renders.
- [ ] Every switch persists across a browser restart.
- [ ] Theme switching works, including "System".
- [ ] Adding an invalid domain to the allowlist shows an error and saves nothing.
- [ ] `fixtures/test-page.html` served over http: red boxes disappear, green boxes stay.
- [ ] YouTube: a video plays normally; controls, fullscreen, captions, the miniplayer and
      playlists all work; feed and sidebar ads are gone.
- [ ] `chrome://extensions` shows no errors on the extension card.
- [ ] `chrome://extensions` → service worker console shows no errors during normal browsing.
- [ ] The popup opens without error on `chrome://newtab`, the Web Store and a PDF viewer tab
      (it should show "Nothing to protect here").
- [ ] Uninstalling removes all stored data.

## 9. Post-submission

- [ ] Tag the release in git and attach the ZIP.
- [ ] Record the exact commit the ZIP was built from.
- [ ] Watch the review queue; be ready to supply the `<all_urls>` justification again.
- [ ] Monitor reviews for site breakage reports and keep the domain lists conservative.
