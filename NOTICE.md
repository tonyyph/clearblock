# Third-party notices

ClearBlock's own source code is MIT licensed (see [LICENSE](./LICENSE)).

The **filter data** it ships is different. The rules in `src/rules/` and `dist/rules/` are
compiled from community filter lists and are therefore an adaptation of those lists. They
carry the upstream licences, not ClearBlock's.

## Bundled filter lists

| Ruleset       | Compiled from                 | Upstream             | Licence               |
| ------------- | ----------------------------- | -------------------- | --------------------- |
| `ads`         | EasyList                      | https://easylist.to/ | GPLv3 or CC BY-SA 3.0 |
| `trackers`    | EasyPrivacy                   | https://easylist.to/ | GPLv3 or CC BY-SA 3.0 |
| `regional-vi` | ABPVN                         | https://abpvn.com/   | CC BY-SA 3.0          |
| `annoyances`  | ClearBlock's own curated list | —                    | MIT                   |

The lists themselves are **not** redistributed from this repository. `npm run filters:fetch`
downloads them at build time into `filters/`, which is git-ignored. What ships is the
compiled `declarativeNetRequest` output.

## What this means in practice

- **Attribution is required.** Each ruleset's source, homepage and licence are shown inside
  the extension, in Dashboard → Filters, and are listed here.
- **Share-alike applies to the filter data.** Under CC BY-SA 3.0, the compiled rules — being
  an adaptation — must be distributed under CC BY-SA 3.0 or a compatible licence. ClearBlock
  distributes them on that basis. The extension's own code remains MIT.
- **Nothing is downloaded at runtime.** Compilation happens on a developer machine, so the
  packaged extension contains no remote code, which is both a Chrome Web Store requirement
  and the reason ClearBlock works offline.

EasyList and EasyPrivacy are maintained by the EasyList authors. ABPVN is maintained by the
ABPVN project. ClearBlock is not affiliated with either, and neither endorses it.

## If you would rather not ship third-party lists

Remove the entries from `SOURCES` in `scripts/fetch-filters.mjs` and re-run
`npm run filters:compile`. The build falls back to ClearBlock's curated lists alone, which
are MIT and carry no attribution obligation — but understand what you are giving up: the
curated lists cover roughly 140 well-known ad domains, which is not enough to block real
advertising on most of the web.
