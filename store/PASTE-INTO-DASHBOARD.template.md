# ClearBlock — copy-paste sheet for the Chrome Web Store dashboard

Everything below is ready to paste. Fields are in the order the dashboard asks for them.

Upload file: **`{{ZIP_NAME}}`** (in this folder)
Built from: version **{{VERSION}}**, {{RULE_COUNT}} bundled filter rules.

---

## Store listing

**Name** (75 char limit)

```
ClearBlock - Ad and tracker blocker
```

Alternatives, measured: `ClearBlock - Block Ads and Trackers` (35), `ClearBlock - Ad Blocker & Privacy` (33).

**Summary** (132 char limit). Recommended — leads with the engine and the privacy claim:

```
Block ads and ad trackers with Chrome's own engine. Pause per site. No account, no analytics - nothing leaves your device.
```

Alternatives, all measured and within the limit:

- `[127]` Ad and tracker blocking that runs entirely on your device. Pause on any site in one click. No account, no analytics, no server.
- `[121]` Blocks ads and ad trackers using Chrome's own engine. Per-site pause, bundled filter lists, and nothing is ever uploaded.
- `[120]` Stop ads and ad trackers. Filter lists ship inside the extension, so ClearBlock works offline and uploads nothing, ever.

**Category:** Productivity → Workflow & Planning
_(Privacy & Security also fits; Productivity gets more traffic.)_

**Language:** English

**Description** ({{DESCRIPTION_CHARS}} of 16,000 chars — same text as `DESCRIPTION.txt`)

```
{{DESCRIPTION}}
```

---

## Privacy practices tab

**Single purpose**

```
Block advertising and advertising-tracker requests, and hide the ad elements that remain on the page.
```

**Privacy policy URL**

```
{{REPO_URL}}/blob/main/PRIVACY.md
```

### Permission justifications

**storage**

```
Stores the user's own settings and allowlist locally via chrome.storage.local: which protection layers are on, the theme, the list of sites they paused, and two integers for the blocked counters. No page content, no URL and no identifier is written. storage.sync is deliberately not used, so nothing is uploaded to a Google account.
```

**activeTab**

```
Lets the popup read the address of the tab the user is looking at, so it can show the site name and offer the per-site pause switch. It is also what allows chrome.declarativeNetRequest.getMatchedRules() to report how many requests were blocked in that tab. activeTab is granted only when the user interacts with the extension, so ClearBlock has no standing access to any site through it.
```

**declarativeNetRequest**

```
The blocking engine itself. ClearBlock ships three static rulesets ({{RULE_COUNT}} rules total) that Chrome evaluates internally, plus dynamic allowAllRequests rules generated from the user's allowlist. Because the matching is done by Chrome, the extension is never told which URLs the browser requested - this is the API that replaced blocking webRequest in Manifest V3, and it is the reason ClearBlock cannot observe browsing even in principle.
```

**alarms**

```
Schedules two local maintenance tasks: an hourly prune of per-tab blocked counters belonging to tabs that have been closed, and - only if the user turns on the optional continuous counting - a one-minute poll of Chrome's matched-rule records. No alarm performs any network activity.
```

**scripting**

```
Registers a single bundled script on youtube.com so it runs in the page's own JavaScript world. That script deletes the ad-scheduling fields from YouTube's player response before the player reads them, which is how in-stream video ads are blocked; a network rule cannot do it, because YouTube serves ad media and video media from the same endpoints.

Registration is dynamic precisely so the user stays in control: when "YouTube protection" is switched off, or youtube.com is paused from the popup, the service worker unregisters the script rather than leaving it running. No code is ever fetched or generated at runtime, and nothing is injected into any site other than YouTube. Source: {{REPO_URL}}/blob/main/src/content/youtube/ad-pruner.ts
```

**declarativeNetRequestFeedback (optional)**

```
Requested only when the user explicitly enables "Continuous counting" in the dashboard, and revoked automatically when they turn it off. It lets Chrome report which of the extension's own rules matched, so the blocked total can be exact instead of sampled. It returns rule IDs, a tab ID and a timestamp - not URLs - and ClearBlock reduces that to counters and discards the rest. The extension works fully without it.
```

**Host permission `<all_urls>`**

```
Advertising and advertising trackers can appear on any website, and there is no way to know in advance which sites those will be, so an ad blocker must be able to apply its filter rules and its cosmetic stylesheet wherever the user browses. No narrower set of hosts would work.

The access is used for exactly two things: supplying blocking rules to Chrome, and hiding ad elements locally in the page. The content script injects one stylesheet and, on YouTube, watches for ad surfaces; it does not read page text, form fields, credentials or cookies. The extension has no server and makes no network request of its own, so there is nowhere for data to go. Source: {{REPO_URL}}
```

### Data usage disclosure

Tick **none** of the data-collection categories, then confirm all three certifications:

- Does not sell or transfer user data to third parties beyond approved use cases
- Does not use or transfer user data for purposes unrelated to the single purpose
- Does not use or transfer user data to determine creditworthiness or for lending

---

## Screenshots

Upload from `screenshots/` — all are 1280×800. The Chrome Web Store accepts up to five, so
upload 1–5 in this order and keep 6 as a spare:

1. `store-1-popup-active.png` — the popup over a real article, protection active
2. `store-2-before-after.png` — the same page with and without ClearBlock
3. `store-3-popup-paused.png` — paused on the site, with the reload prompt
4. `store-4-dashboard.png` — the dashboard's protection switches
5. `store-5-privacy.png` — the privacy panel and permission reasons
6. `store-6-allowlist.png` — allowlist management _(spare)_

**Store icon:** `store-icon-128.png` (128×128)
**Small promo tile:** `promo-small-440x280.png` (440×280)
**Marquee promo tile:** `promo-marquee-1400x560.png` (1400×560) — only used if Google features
the extension; upload it now so the listing is eligible.

### A note on what the screenshots show

Every pixel of extension UI is a real capture of this exact build running in Chromium with
`unpacked-chrome/` loaded. The web page underneath is `fixtures/demo-article.html`, a
fictional publication — a listing image should not carry a real newspaper's masthead or
articles, and a fixture makes the before/after an exact like-for-like comparison.

The blocked counters read **0** in the popup screenshots, and that is the honest result: an
automated capture cannot grant `activeTab` the way clicking the toolbar icon does, so Chrome
declines to report matched rules. If you would rather show real numbers, open the popup by
clicking the toolbar icon on an ad-heavy site and re-capture `store-1` yourself. Do not edit
the numbers in an image editor — the listing must not show statistics the extension did not
produce.

---

## What to expect after submitting

ClearBlock requests `<all_urls>`, which routes the review to a human. Plan for days rather
than hours. The three things reviewers look at hardest for a blocker are: that no remote code
is loaded, that the host permission is justified, and that the listing does not overclaim.
All three are addressed in the description above.

Tip: set visibility to **Unlisted** for the first submission. It still gets a full review, but
it stays out of search until you have installed it from the store link and checked it
yourself. Switching to Public afterwards needs no new review.

Do not claim anywhere in the listing, the screenshots or the support site that ClearBlock
blocks all YouTube ads. It does not, the description says so, and a listing that contradicts
the product is a rejection.

---

## Verification before you upload

Run in the repository:

```bash
npm run verify     # typecheck, lint, tests, build, manifest + rule validation
npm run test:e2e   # loads dist/ in real Chromium and drives the UI
```

Then install `{{ZIP_NAME}}` into a clean Chrome profile and work through
`CHROME_WEB_STORE_CHECKLIST.md` in the repository — section 8 is the manual smoke test.

---

## Microsoft Edge (separate, free)

https://partner.microsoft.com/dashboard/microsoftedge — the same ZIP works, and everything
above can be reused. Edge does not require a separate build: the manifest uses no
Chrome-only API beyond declarativeNetRequest, which Edge also implements.
