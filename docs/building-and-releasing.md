# Building and releasing

This repository follows the official
[Valenced plugin template](https://github.com/Valenced/valenced-plugin-template). Its README and
the [Valenced docs](https://valenced.app/docs/plugin-development) are the reference for the
manifest, version ordering, channels and the pool; this page only records what is specific to this
repository.

## Layout

```
plugins/<name>/
├── manifest.json            # id, version, dist.script, dist.android
├── tsconfig.json            # { "extends": "../../tsconfig.base.json" }
├── js/index.ts              # JS entry -> index.js
└── src/main/kotlin/...      # native plugins only -> plugin.jar
themes/<name>/               # theme plugins, same shape
shared/                      # code shared between plugins, bundled into each one
types/                       # globals the Valenced host injects (valenced, plugin())
```

JS-only plugins and native plugins live side by side. A plugin with a `src/main` folder is native
and runs only on Android; one without it is JS-only and runs on Android and iOS.

## Prerequisites

- Bun.
- For native plugins: a JDK, the Android SDK (`sdk.dir` in the gitignored `local.properties`) and
  the Valenced API in `~/.m2` (see the workspace `CLAUDE.md`).

## Build

```sh
bun install
./gradlew packageAllPlugins                    # every plugin -> build/dist/<id>@<version>.zip
bun run lint:types                             # type check
bun test
```

Always package with `packageAllPlugins`. Every package task runs `cleanDist` first, so a single
`packageX` deletes every other plugin's ZIP.

## Test on a device

Complete the [account-safety review gate](account-safety.md#required-review-before-merge-or-distribution)
before distributing test builds. Exercise failures with fake transports/host actions first; never
use a real account to probe spam detection or reproduce account warnings.

```sh
bun run serve --host <wifi-ip>                 # http://<wifi-ip>:8080
```

Add the printed URL as a repository in Valenced.

## Releasing

Every distributed plugin needs a completed [account-safety review](account-safety-review-template.md)
for its source revision and packaged artifact. Local servers and private ZIPs count as distribution.
BLOCKED or UNREVIEWED builds must not ship. Inspect bundles, ZIPs and served indexes for retired code;
deleting source does not withdraw old artifacts or installed copies.

Not set up yet: this repository has no release workflow or `gh-pages` pool. The template's
workflow (see [Publishing your plugin](https://valenced.app/docs/plugin-development/getting-started/publishing-your-plugin))
is the starting point. Until then:

- **Bump the manifest version** for every change you want users to get.
- **A version may never go below the newest published version of that plugin id.**

### Version numbers

Use SemVer meaning — `MAJOR.MINOR.PATCH` — inside Valenced's stricter format:

| Change | Bump | Example |
| --- | --- | --- |
| Bug fix, no behaviour or settings change | PATCH | `1.2.4` → `1.2.5` |
| New feature or setting, old data still loads | MINOR | `1.2.5` → `1.3.0` |
| Breaking: storage/backup format change, removed setting, needs a reinstall | MAJOR | `1.3.0` → `2.0.0` |
| Test build on the way to a release | `-betaN` on the **upcoming** version | `0.6.0-beta1`, `0.6.0-beta2`, … |

Rules that are Valenced's, not SemVer's:

- **Exactly one label, lowercase letters and digits only.** `1.2.0-beta3` is valid;
  SemVer's dotted `1.2.0-beta.3` and `1.2.0-rc.1` are **rejected** by the index generator.
- Digit runs in a label compare numerically, so `beta10` > `beta9`. No zero-padding needed.
- A labeled version sorts **below** its bare version: `0.6.0-beta4` < `0.6.0`, so promoting a beta
  to stable is just dropping the label.
- **Never reuse or lower a number** — not even for a build you only side-loaded from a local zip.
  A phone that has `0.5.0-beta2` installed will never be offered `0.5.0-beta1`, and two different
  builds sharing one number can't be told apart in a bug report. Check what's installed on test
  devices before picking the next number.
- `0.x` means "still unstable"; move a plugin to `1.0.0` once its settings and storage format are
  something you're prepared to keep compatible.

Each plugin's version continues from its Revenge Next version (one patch bump for the port), so the
numbers line up with the changelogs.

## Device logs

```sh
adb logcat -s ReactNativeJS:V
```

For a live JS console, run the devtools server and point Valenced's DevTools setting at
`ws://<lan-ip>:7864`. There are no Valenced DevTools packages yet, so it is still the Revenge one:

```sh
bun x @revenge-mod/devtools-server --mcp       # also serves MCP at http://localhost:7864/mcp
```

Keep it in a terminal you can type into: an MCP `eval` waits for an "Allow?" answer there. See [coding rule 5](./coding-rules.md#5-read-the-app-instead-of-guessing) for the full
debugging workflow.
