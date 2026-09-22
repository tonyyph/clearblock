# ClearBlock privacy policy

**Last updated:** 2026-09-22
**Applies to:** ClearBlock browser extension, all versions.

## Summary

ClearBlock does not collect, store, transmit, sell or share any personal data. It has no
backend, no account system, no analytics and no network requests of its own. Everything it
stores stays in `chrome.storage.local` on your own device.

## What ClearBlock does not do

- It does not collect your browsing history.
- It does not send any URL, page content, search query, form input or identifier anywhere.
- It does not use analytics, telemetry, crash reporting, or any third-party SDK.
- It does not create a user ID, fingerprint your device, or track you across sites.
- It does not inject advertising, affiliate links or sponsored content.
- It does not change your search engine, homepage or new-tab page.
- It does not download or execute remote code. Filter lists are bundled inside the
  extension package and updated only when you install a new version.
- It does not sell, rent, share or transfer data to anyone, because it does not have any.

## What is stored, and where

Everything below is stored locally via `chrome.storage.local`. It is never synced to a
Google account, never uploaded, and it is deleted when you uninstall the extension.

| Data                      | Purpose                         | Contains                                                                                   |
| ------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| Settings                  | Remember your preferences       | Protection switches, theme, counting mode                                                  |
| Allowlist                 | Remember which sites you paused | Domain names you added yourself, e.g. `example.com`                                        |
| Custom cosmetic selectors | Apply filters you wrote         | CSS selectors you typed                                                                    |
| Counters                  | Show "blocked" numbers          | Two integers (lifetime total, per-tab count). No URLs, no domains, no timestamps of visits |

The per-tab counters are keyed by Chrome's internal tab ID, contain only a number, are
deleted when the tab navigates or closes, and are pruned hourly.

Note that the allowlist necessarily contains domain names you chose to add. That list never
leaves your device and exists only so ClearBlock knows where not to filter.

## How blocking works, and why ClearBlock cannot see your traffic

ClearBlock uses Chrome's `declarativeNetRequest` API. Filter rules are handed to Chrome in
advance and Chrome evaluates them internally. The extension is **not** told which URLs your
browser requested — Manifest V3 removed that capability, which is precisely why it is a
better foundation for a privacy-respecting blocker.

The one exception is the counting feature, which reads
`chrome.declarativeNetRequest.getMatchedRules()`. That returns _which of ClearBlock's own
rules matched_, plus a tab ID and a timestamp. It does not return URLs. ClearBlock reduces
that information to counters and discards the rest; nothing is transmitted.

## Permissions

| Permission                                 | What it is used for                                                                                                                                                                                                         |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                  | Saving the settings, allowlist and counters described above, locally                                                                                                                                                        |
| `activeTab`                                | Reading the address of the tab you are looking at when you open the popup, so it can show the site name and its count                                                                                                       |
| `declarativeNetRequest`                    | Supplying blocking rules to Chrome                                                                                                                                                                                          |
| `alarms`                                   | Periodic local clean-up of counters for closed tabs                                                                                                                                                                         |
| `<all_urls>` host permission               | Applying filter rules and the cosmetic stylesheet on whichever sites you visit. Ads can appear anywhere, so there is no narrower set of hosts that would work. ClearBlock reads no page content and sends nothing anywhere. |
| `declarativeNetRequestFeedback` (optional) | Requested only if you enable _Continuous counting_, and revoked when you disable it. Lets Chrome report which rules matched so counts are exact.                                                                            |

## Content scripts

ClearBlock injects a content script into http and https pages. It does two things: inject a
stylesheet that hides ad elements, and — on YouTube — watch for ad surfaces and the Skip
button. It does not read page text, form fields, credentials or cookies, and it has no way
to send anything off the device.

## Children's privacy

ClearBlock collects no data from anyone, including children under 13.

## Third parties

There are none. No SDKs, no hosted services, no CDNs, no fonts loaded from the network.

## Changes to this policy

Any change will be published in this file in the extension's repository, with the
"Last updated" date above revised. Because ClearBlock collects nothing, a change that
introduced any data collection would require a new extension version and a new permission
prompt.

## Contact

Questions or concerns: open an issue at
<https://github.com/clearblock/clearblock/issues>.
