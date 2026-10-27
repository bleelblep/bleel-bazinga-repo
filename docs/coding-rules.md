# Coding rules

**Mandatory companion:** read [Account safety](account-safety.md) before plugin work. AS-01–AS-08
and its release gate apply alongside the technical rules below. Compatibility workarounds must not
bypass authentication, capability checks or the host sending/error contract. Existing examples and
upstream plugins are not account-safety approval.

Rules for writing and debugging plugin code in this repository. Read them before you change a
plugin. Each one cost at least one crash on a real device to find, and none of them is documented
upstream.

They were traced through [revenge-bundle-next](https://github.com/revenge-mod/revenge-bundle-next)'s
source and checked against [PalmDevs](https://github.com/PalmDevs)' working plugins. Valenced is
Revenge Next under a new name with the same plugin APIs, so every rule still applies. The live API
is written with its Valenced names (`valenced.*`, `@valenced/*`). Source paths, commits and
classic-Revenge comparisons are kept, because that is where each rule was found.

Some examples come from plugins that haven't been ported here yet (Screenshot Redactor, Hide
Servers, Staff Tags). Their files are in
[bleelblep/revenge-next-plugins](https://github.com/bleelblep/revenge-next-plugins).

Code comments cite these rules by number ("coding rule 3"). Don't renumber them.

| # | Rule |
| --- | --- |
| 1 | [Import from `@valenced/*`, and never use those imports at module scope](#1-import-from-valenced-and-never-use-those-imports-at-module-scope) |
| 2 | [The patcher's hook contracts differ from classic Revenge](#2-the-patchers-hook-contracts-differ-from-classic-revenge) |
| 3 | [Module lookups](#3-module-lookups) |
| 4 | [APIs that don't exist](#4-apis-that-dont-exist) |
| 5 | [Read the app instead of guessing](#5-read-the-app-instead-of-guessing) |
| 6 | [`jsonStorage.set()` merges, so it can never delete a key](#6-jsonstorageset-merges-so-it-can-never-delete-a-key) |
| 7 | [Use the official types, not guesses](#7-use-the-official-types-not-guesses) |
| 8 | [A filtered store getter can feed Discord's write path](#8-a-filtered-store-getter-can-feed-discords-write-path) |
| 9 | [Errors go to `plugin.reportError`; debug code sits behind `DEBUG`](#9-errors-go-to-pluginreporterror-debug-code-sits-behind-debug) |

## 1. Import from `@valenced/*`, and never use those imports at module scope

This is the most important rule here. Breaking it is what made "a plugin's settings page crashes
the whole Settings screen", a bug this repository misdiagnosed for a long time.

### Write imports, not the global

```ts
import { after } from '@valenced/patcher'
import { Design } from '@valenced/discord/design'
import * as ReactNative from 'react-native'
```

This is a community repository rule (2026-10-13). The plugin CLI (`inlineImportsPlugin` in
`@valenced/plugin-cli/src/build.ts`) rewrites each use of an imported name into the global path
where it is used, so `after(...)` becomes `valenced.patcher.after(...)`. It also follows top-level
aliases like `const { X } = Design`.

So importing costs nothing at preInit, but **using** an import at module scope (calling it, or
reading a property from it into a value) still runs at preInit, and everything below applies.

- Module ids and the globals they map to: `@valenced/types/modules.importmap.json` and
  `modules.hidden.importmap.json`.
- Files that use `@valenced/plugins/_` need `/// <reference types="@valenced/types/hidden" />`.

The examples below show the global path, because that is what the bundle contains after inlining.

### Why module scope is dangerous

An external plugin's whole bundle runs during **preInit**, long before Discord's UI modules
exist. revenge-bundle-next's `createOptionsFactory`
(`lib/plugins/src/_internal/external-plugins.ts`) runs it through
`new Function('valenced', 'plugin', 'return ' + script)`, reached from `preinit.ts` →
`preInitPlugin` → `resolvePluginOptions`.

`valenced.discord.design.Design` and `valenced.discord.flux.Stores` are lazy proxies backed by
`lookupModule`. When a full-scope lookup misses, `lookupModule` calls `cacheFilterNotFound(key)`
(`lib/modules/src/finders/lookup.ts`), and every later lookup of that key returns NotFound
straight away. Design's key is the **shared** `'valenced.discord.design.Design'`, the same one
Valenced's own settings UI uses. So one line like this:

```ts
const { TableRowGroup } = valenced.discord.design.Design   // ❌ runs at preInit
```

breaks Design for the whole app, not just for the plugin. That's why the entire Settings screen
went down instead of one page.

It also **survives restarts**. `cacheFilterNotFound` writes into `cache.finds`, and the next
unrelated `cacheFilterResultForId` flushes that to the native on-disk module cache. The bad entry
stays until the cache version changes.

### What to do instead

Read these values inside render functions or lifecycle callbacks (as PalmDevs' plugins do), or
behind a memoised `lazy()` or `once()` wrapper:

```ts
export default function Settings({ api }) {
    const { TableRowGroup } = valenced.discord.design.Design   // ✅ runs at render
    ...
}
```

`valenced.react.ReactNative` and `valenced.assets` are ESM live bindings that are still
`undefined` at preInit. Destructuring them at module scope captures `undefined` for good.

### Searching for `const … = valenced.` isn't enough

Hide Servers had three module-scope mistakes with no `valenced.` on the line at all:

- **`getAssetIdByName("FolderIcon")` called at module scope.** `valenced.assets` is a plain object
  and safe to read early, but the asset registry is empty at preInit. The result was `undefined`,
  frozen in a `const` for the whole session.
- **`React.memo(Component)` at module scope.** `valenced.react.React` may still be `undefined` at
  preInit, so this throws inside `optionsFactory()` and fails the whole plugin before `start()`
  runs. This almost certainly bootlooped the app. Build the memo on first render into a
  module-level holder instead, so the component type is stable from the second render on and
  memoisation still works.
- **`StyleSheet.create({…})` at module scope.** React Native accepts plain style objects; use one.

In general: anything **derived from** a `valenced.*` value at module scope is suspect, not just a
destructure.

The one safe exception is `valenced.modules.finders.getModules` at module scope. It only looks at
modules that are already initialised, and `cacheFilterNotFound` only fires on full-scope lookups.
It still leaks a subscription that is never cleaned up on stop, so avoid it anyway.

### Notes

- **This rule is for external plugins only.** PalmDevs'
  [revenge-next-plugins](https://github.com/PalmDevs/revenge-next-plugins) read `Design` at module
  scope safely because they are **internal** plugins: compiled into the bundle with
  `registerInternalPlugin` and loaded as ordinary Metro modules when needed. Ours are loaded from a
  zip and run through `new Function` at preInit. Same code, different moment, so don't copy their
  module-scope patterns.
- **It explains an old false fix.** Removing `SettingsComponent` once seemed to fix Staff Tags.
  Really, dropping `import Settings from "./ui/pages/Settings"` let Rollup tree-shake the file
  out, taking its module-scope destructures with it. The settings API was never the problem.
- **Confirmed on a device.** Moving these reads into render functions restored the settings pages
  of all five affected plugins, with no change to how `SettingsComponent` is registered.

**If you're testing a build that already hit this, clear Valenced's module cache first.** The bad
entry is probably still on disk, and a correct build will look just as broken until it's gone.

## 2. The patcher's hook contracts differ from classic Revenge

Don't assume classic Revenge or Vendetta behaviour. Check each contract against `lib/patcher/src/`.

- **A `before` hook must return the args array.** `applyHooks` (`lib/patcher/src/_internal.ts`)
  does `arg = hook(arg)` with no `?? arg` fallback. Returning nothing sets the args to `undefined`
  for every later hook on that method.

  In Custom Timestamps this passed `undefined` to an `instead` hook on the same method. Its
  `original(...args)` threw `TypeError: Cannot convert undefined value to object` from Hermes'
  `arraySpread` and took down the whole chat view. Return the args **outside** your `try`, so they
  survive a throw in the hook body.
- **An `after` hook only receives the return value**, not the original args. Code written for the
  classic `(args, ret)` signature needs `instead` plus a call to the original. The return value is
  assigned unconditionally too, so return the result on every path.
- **When patching a prototype method, forward `this`.** Use a plain `function`, not an arrow, and
  `Reflect.apply(original, this, args)`, not `original(...args)`:

  ```ts
  valenced.patcher.instead(RowManager.prototype, "generate", function (this: any, args, original) {
      const ret = Reflect.apply(original, this, args)   // ✅ receiver preserved
      ...
  })
  ```

  The patcher calls your hook with `Reflect.apply(hook, receiver, [args, original])`, so you do
  get the right receiver; an arrow function just throws it away. Getting this wrong ran Discord's
  `RowManager.generate` with `this === undefined`. It showed up as
  `TypeError: Cannot read property 'options' of undefined`, thrown from Discord's own code several
  frames below ours.
- **Never assume a captured `original` is callable.** A `getModules` match can fire on
  half-populated exports. Guard with `typeof original !== "function"`.
- **`onFluxEventDispatched` is a patch, not a listener: return the payload.** Whatever the handler
  returns becomes the dispatched payload, and a falsy return **cancels the event**. To just
  observe an event, `return payload`. A `CONNECTION_OPEN` handler that returned nothing silently
  swallowed the event and would have broken Discord's own connection handling. Like `before`,
  these APIs are transformers that look like callbacks.
- **Only one `instead` hook per method, across the whole repository.** A second one can recurse
  forever, depending on what else is patched. This is an upstream bug; see below.

When a patch throws about spreading `undefined`, or a missing property on `this`, suspect a
**sibling** hook on the same method before the hook that threw.

### The two-`instead` recursion bug

`hooks/instead.ts` records each hook's fallback target when the hook is added:

```js
const target = parent[key]   // the PROXY, if any patch already exists
hookNode.target = target
```

`patchedFunctionProxyHandler.apply` correctly falls back to `state.target` (the real original), so
a single `instead` hook is fine. But `insteadHookProxyHandler.apply`, which only runs when one hook
is reached through another's `next.proxy` (so only with two or more hooks), falls back to
`hookNode.target`. For a hook added after a proxy already existed, that target **is** the proxy,
so the end of the chain calls back into the start:

| Step | Result |
| --- | --- |
| Plugin A `before()` | creates `proxy1`, `state1.target = origFn` |
| Plugin A `instead()` | records `hookNodeA.target = proxy1` ⚠️ |
| Plugin B `instead()` | becomes the head of the chain; A becomes the tail |
| call | `proxy1` → B's hook → `hookNodeA.proxy` → A's hook → `hookNodeA.target` = `proxy1` → ∞ |

The symptom is `RangeError: Maximum call stack size exceeded`, with the stack alternating between
two plugin frames and two different `apply (Revenge:…)` offsets.

**It needs more than two `instead` hooks.** At equal priority a new hook becomes the head, so the
tail is the first `instead` registered, and only the tail's recorded target is ever used. Two
`instead` hooks on their own are fine, because the first was added while `parent[key]` was still
the raw function. The bug needs that first `instead` to be added to an **already-proxied**
function, meaning a `before` or `after` hook came first (which is exactly what Custom Timestamps
does). A later `instead` with lower priority that sorts to the tail triggers it too.

That condition is easy to lose track of across plugins, so the rule stays absolute: one `instead`
per method, repository-wide.

`before` and `after` chains are plain linked lists with no per-hook target, so any number of them
can coexist safely. When a method already has an `instead` hook somewhere in this repository, use
`before` plus `after`: save what you need from the args in `before` and use it in `after`.
`generate` is never re-entered, so one module-level "pending" slot between the two is safe.
`plugins/show-tag/js/patches/rowManager.ts` does exactly this, because Custom Timestamps owns the
`instead` on `RowManager.prototype.generate`.

Worth reporting upstream. Not fixed as of revenge-bundle-next `0f75551`.

### Two `instead` hooks on one method no longer recurse (since 2026-10-24)

Until revenge-bundle-next fa6cb81 (2026-10-24), a second `instead` on a method that already had a
`before` or `after` captured the patcher's proxy as its "original", and the chain's tail called
back into its own head: "Maximum call stack size exceeded" on save for anyone running Fake Nitro
or Zipline next to a plugin with a `before` on `sendMessage`. The fix points the new node at the
real target (`hooks/instead.ts`, "Point to the actual target, not the proxy"). Valenced pulled it
the same day, and every Valenced release (1.0.1, 1.1.0, 1.1.1) has it, which was checked against
the tags on 2026-10-27.

So in Valenced, ordinary `before`/`after`/`instead` hooks are safe in any start order, and that is
what Send Tweaks uses from 1.0.11. `shared/wrapMethod.ts` and Custom Timestamps' plain wrapper were
written for the old behaviour and are no longer needed for it; they are not wrong, but new code
should use the patcher like PalmDevs' plugins do.

## 3. Module lookups

- **`lookupModule` and `lookupModules` only look once.** They see only modules that are
  initialised when they run, and a chat or member-list module often isn't, even in `start()`.
  Pair them with `waitForModules`, or use `getModules` (but read the `max` section below first).

  A miss is cached permanently only for **full-scope** filters: `cacheFilterNotFound` sits behind
  `if (includeAll)` in `lib/modules/src/finders/lookup.ts`. `withProps` and `withName` default to
  `FilterScopes.Initialized` and never reach it. `withDependencies` and the keyed lazy proxies from
  rule 1 do, and that's where rule 1's poisoning comes from.
- **A hand-built filter needs a `.scope(...)` method**, not just a `.scopes` property. `getModules`
  and `lookupModule` call it as a function, and a filter without it throws immediately, silently,
  every time.
- **`filters.withName` can't match `React.memo()` components.** Memo wrappers have no `.name` of
  their own. Staff Tags' member-list patch needed a hand-built filter to catch `UserRow` for this
  reason.

### The export is usually on `default`

`withProps('getName')` matches a module, but `mod.getName` is `undefined`: the function is at
`mod.default.getName`. A probe on Discord 340.9 shows it plainly:

```
1214.getName: exports=undefined default.getName=function
```

Always check both:

```ts
const host = typeof mod?.[key] === "function" ? mod : mod?.default
if (typeof host?.[key] !== "function") return
```

This is the most expensive bug in this repository's history. From 0.3.0, Screenshot Redactor
claimed to hook seven name resolvers and hooked exactly one: its own module, caught by a different
finder that does check `.default`. Six attempts at the DM header, plus the member list and profile
sheets, were all debugging a hook that never existed. The plugin's Diagnostics page said the
resolvers were patched the whole time, because it recorded what was attempted, not what happened.

(`@mentions` were on that list for fifteen releases and didn't belong there: they are row data,
not resolved names. See "A working finder is not a fix" below.)

**Log whether a hook worked, not that it was attempted.** One `console.log` on successful
registration would have caught this long before a settings page that said "patched".

Fixing this didn't make the hook install, because the **finder** was also wrong (see the next
section). Both bugs looked the same from outside ("the resolver list is empty"), so the first fix
looked like it had failed, when really it had uncovered the next problem.

### `getModules` shares one `max` between looking up and subscribing

This was filed for two releases as "`getModules` and `lookupModules` disagree, unresolved". They
agree. What happened was:

```
lookupModules(withProps('getName'))            -> 26 modules
getModules(withProps('getName'), cb, {max:25}) -> the module we wanted never arrives
```

`getModules` (`lib/modules/src/finders/get.ts`) looks up the modules already initialised, then
calls `waitForModules` for the rest, and **one `max` counter covers both**:

```js
for (const [exports, id] of lookupModules(lookupFilter, options)) {
    handleModule(exports, id)
    if (!--max) return noop          // ← subscription never created
}
const unsub = waitForModules(filter, (exports, id) => { … }, options)
```

`getName` is a common export name. 26 initialised modules already had one at `start()`, so the
lookup used up all 25 slots and returned before subscribing. The callback **did** run 25 times, on
modules whose `getName` isn't a function, and returned silently each time, which looked exactly
like a callback that never ran.

So:

- **`max` is a budget for the whole call, not a cap on the subscription.** Raising it makes this
  more likely: a bigger budget means more junk is used up before the wait is set up.
- **Log what happens inside the callback, not just at registration.** Otherwise "called and
  skipped" looks the same as "never called". It's the same lesson as the section above, one level
  down, and it cost the same plugin another two releases.
- **When you need every match, call `lookupModules` and `waitForModules` yourself.** That's what
  `getModules` does, without the shared counter:

  ```ts
  for (const [exports, id] of lookupModules(withProps(key))) onModule(exports, id)
  const unsub = waitForModules(withProps(key), onModule)
  ```

  This is safe from the permanent-miss cache: `withProps` and `withName` default to
  `FilterScopes.Initialized`, and `cacheFilterNotFound` only runs for `FilterScopes.All`.

### Better: find the module by its source path

`valenced.discord.utils.modules.finders.getModuleWithImportedPath(path, cb)`, and its
`lookupModuleWith…` and `waitForModuleWith…` siblings, find a module by the file path Discord's own
bundle records:

```ts
valenced.discord.utils.modules.finders.getModuleWithImportedPath('utils/UserUtils.tsx', (exports, id) => { … })
```

It's a `Map<path, id>` lookup plus a `fileFinishedImporting` subscription
(`lib/discord/src/utils/modules/finders.ts`). There's no filter, no result cache, no `max` and no
`cacheFilterNotFound`. It returns the whole namespace instead of unwrapping `default`, and it
unsubscribes itself, because paths are unique.

Use it whenever the target is a Discord source file rather than a shape. Paths appear in the
Hermes bundle as the argument to `fileFinishedImporting` at the end of each module factory (see
rule 5), so finding one takes the same disassembly you'd do anyway, and you get an exact name
instead of a guessed property. Screenshot Redactor reaches `utils/UserUtils.tsx` (every display-name
resolver) and `utils/AvatarUtils.tsx` (every avatar URL) this way. The second one closed a DM-header
avatar leak that five releases of `withProps` guessing hadn't.

The short path `valenced.discord.utils.finders` doesn't exist; it throws and falls back to a full
sweep. Use `discord.utils.modules.finders` as shown (`shared/modules.ts` wraps it).

Paths change less often than module ids, and much less often than export shapes, but they do
change. Keep a property search behind it as a fallback, and log which one answered.

### A working finder is not a fix

Screenshot Redactor spent fifteen releases hooking name resolvers to hide inline `@mentions`. It
hit both bugs above, fixed both, and mentions still showed real names, because a mention in a
rendered message is row data and never calls a resolver. Finding the module was the easy half.
Confirm the screen you care about actually goes through what you hooked, ideally before hooking
it. One search of the native `$$serializer` for the field would have settled it in an afternoon.

### Native modules aren't reachable through `valenced.react.ReactNative`

`valenced.react.ReactNative.NativeModules.DCDChatManager` returns nothing, at `start()` and on
every retry, even though Discord's own code calls plain `NativeModules.DCDChatManager`.
`globalThis.nativeModuleProxy` and `__turboModuleProxy` are empty too, and
`getModules(withProps('DCDChatManager'))` doesn't match. Still unsolved; it's why Screenshot
Redactor's message-list repaint doesn't run.

Hide Servers' `lib/reload.ts` reaches `BundleUpdaterManager` the same way, so the access pattern
isn't wrong in general.

## 4. APIs that don't exist

These were guessed from classic Revenge and are confirmed missing from revenge-bundle-next:

| Guessed | Reality |
| --- | --- |
| `valenced.discord.common.chroma` | Doesn't exist. Use a self-contained brightness calculation. |
| `valenced.discord.common.moment` | Doesn't exist. Custom Timestamps has its own date formatter (`plugins/custom-timestamps/js/lib/renderTimestamp.ts`). |
| `valenced.utils.react.findInReactTree` | Doesn't exist. Use a local copy (there is one in `shared/themes/lib/findInReactTree.ts`). |
| `filters.withStoreName` / `withTypeName` / `withPredicate` | Don't exist. Flux stores come from the `valenced.discord.flux.Stores` proxy. |
| `valenced.discord.design.RawColors` | Doesn't exist. `@valenced/discord/design` exports only `Design` and `FormSwitch`. Colours come from `valenced.discord.common.tokens.Tokens` through the `token()` helper ([settings design guide §3.5](./settings-design-guide.md#35-colour-follows-the-users-theme)), with the old hex as fallback. |
| `valenced.discord.design.Tokens` / `valenced.discord.common.Tokens` | Wrong path. It's `valenced.discord.common.tokens.Tokens` (lower-case `tokens`), typed `any`. The capital-T path fails silently behind `?.`. |
| `valenced.discord.haptics` | Doesn't exist. No haptics API is exposed to plugins. |
| `valenced.discord.common.Constants.Permissions` | Doesn't exist. Hard-code the permission bits. |

The last three were found by switching to the official types (rule 7), not on a device. Each had
been hidden behind `?.` and a fallback, silently doing nothing.

### `Constants.Permissions` is the warning example

It broke Staff Tags in a way that looked like a **partial** failure, which is why it lasted so
long. The code computed a correct permission bitmask, then mapped it against
`valenced.discord.common.Constants?.Permissions ?? {}` (an empty object), which produced no
permission names. Every permission-based tag (ADMIN, STAFF, MOD, VC Mod, Chat Mod) quietly
disappeared, while OWNER and WEBHOOK kept working because they're the only two driven by a
`condition` instead of a permission.

- **`?.` plus `?? {}` turns a missing API into a silent wrong answer.** The plugin couldn't
  complain: an empty permission list looks the same as "this user has no permissions". Fail
  loudly, or log once when a lookup that should always work doesn't.
- **Don't ask Discord for values that are part of its public API.** Permission bits can't change
  without breaking every bot on the platform, so Staff Tags hard-codes the twelve it needs in
  `PERMISSION_BITS` (`lib/getTag.ts`). No lookup, nothing to go stale.

It was found by logging one line to `adb logcat` (see rule 5).

## 5. Read the app instead of guessing

### Start offline: the APK answers most "which module, what shape" questions

Added after the DM header took six on-device attempts over as many releases, then was answered in
one sitting with no device attached. Try these **before** writing another probe.

**Native side.** [molangning/reversing-discord](https://github.com/molangning/reversing-discord) is
a jadx decompile of the APK, browsable with `gh api repos/…/contents/<path>` under
`apk/extracted/_base.apk/sources/`. Anything sent across the JS/native bridge has a kotlinx
`$$serializer`, whose `pluginGeneratedSerialDescriptor…("field", …)` calls list **every JSON field
name**. `com/discord/chat/bridge/Message$$serializer` gave Screenshot Redactor the full message
schema at once. Its row dumps had been finding fields one at a time and missing the rest, because a
dump only shows fields that happen to be filled on the row you dumped.

**JS side.** Pull the APK from the device so the version matches what you're debugging. The copy in
`Documents/android` was three releases behind the installed build, which is enough for function ids
to move.

```sh
adb shell pm path app.valenced        # Discord, repackaged by Valenced
adb pull <path>/base.apk
unzip -o base.apk assets/index.android.bundle
```

The bundle is Hermes bytecode (v96). `pip install hermes-dec` parses it:

```py
r = HBCReader(); r.read_whole_file(open(bundle, "rb"))   # ~17s, 126k functions
r.strings.index("BaseChannelName")                        # does this name exist at all?
r.strings[fh.functionName] for fh in r.function_headers   # 69k named functions — a real index
parse_hbc_bytecode(r.function_headers[fid], r)            # disassembly, with strings resolved
```

Keep the file open: the reader seeks lazily, and a closed file throws.

The function-name index is the most useful thing here. Searching it for `Header` found
`PrivateChannelHeader` and `DMChannelName` straight away. Disassembling `DMChannelName` showed that
the DM header calls `RelationshipStore.getNickname(userId)` and renders it with `LegacyText`. It
never touches a channel title, which is why four attempts at `renderChannelTitle` and
`computeChannelName` all "fired" and changed nothing.

### The decompile and the device answer different questions

The native `$$serializer` classes list every field the native side will **accept**. That isn't
the same as what JS actually **puts on the object**, and mixing them up produced a wrong fix. The
schema listed server-tag fields `tagText`, `tagType` and `connectionsRoleTag`, and an `avatarURLs`
that no real row has. The fields actually filled were `clanTag`, `clanTagGuildId` and
`clanBadgeUrl`, which a row dump had already found.

Use the deserializer for the bridge protocol, and a `console.log` row dump for what actually
carries someone's identity. The decompile is the authority on the bridge and on component
internals, not on the shape of a live JS object.

### On the device, when you need runtime state

`console.log` reaches `adb logcat` under the `ReactNativeJS` tag. It's by far the fastest way to
answer "which module is it, what are these arguments, what's on this object". It was underused for
a long time in favour of showing one fact at a time on a plugin's settings page.

```sh
adb logcat -c                       # clear first; this device writes ~8k lines/minute
adb logcat -G 32M                   # the default buffer rotates in under a minute
adb logcat -s ReactNativeJS:I       # filter by tag at the source
adb reverse tcp:8087 tcp:8087       # let the phone reach a local server over USB
adb push dist/<id>.zip /sdcard/Download/
```

Two traps, both hit in practice:

- **Filter by tag, not by searching for your prefix.** A multi-line `console.log` continues on
  lines that don't repeat the tag, so `| grep MyPlugin` drops everything after the first line.
- **Capture continuously; don't dump afterwards.** The buffer rotates fast enough to lose output
  between reproducing a bug and reading the log. `adb reverse` also disappears when the device
  drops off USB, and the repository URL then just fails to load.

For a live JS console instead of logcat, use the DevTools server (see
[Building and releasing](./building-and-releasing.md#device-logs)).

Worth building into a plugin while investigating:

- **A Metro sweep** that walks initialised module ids and prints exports matching a pattern
  (Screenshot Redactor's `lib/probe.ts`). That's how `useName`, `renderChannelTitle` and the
  channel-name helpers were found after several releases of guessing.
- **A shape dump** of the object you're rewriting, logging key names and types but never values.
  That's how Screenshot Redactor found the `clanTag` and `clanBadgeUrl` fields it had been leaking.
  A check for fields you already know about can never find those.

## 6. `jsonStorage.set()` merges, so it can never delete a key

`set(value: DeepPartial<T>)` **merges** into storage recursively; it doesn't replace it. A merge
can add or overwrite a key, but it can't remove one: a key missing from the patch looks the same
as a key nobody touched, so leaving it out does nothing.

(There is a `replace: true` overload, but it needs the whole top-level shape and only works at the
top level, not for one nested key.)

This broke Hide Servers 1.3.2 in a way that looked believable for a while. Hiding a server saved
correctly, but un-hiding one didn't survive a restart. The code rebuilt its
`hidden: Record<string, true>` object from an in-memory `Set` on every write and simply left
un-hidden ids out. With merging, that did nothing: the old `true` entry stayed in storage and came
back on every reload. Hiding worked because adding a key is what merging is good at. Removing was
always going to fail, because it's the one thing this API can't express by leaving something out.

The fix (Hide Servers' `lib/hidden.ts`): never rely on leaving a key out. Send an explicit `false`
for a removed key, and treat `false` as "deleted" when reading (check `=== true`, not "key
exists"). Any plugin that stores a collection you can remove things from (a set of ids, a list of
entries) needs the same treatment. A plain object keyed by presence will only ever grow.

## 7. Use the official types, not guesses

Types come from the **`@valenced/types`** package (see `tsconfig.json`). `types/globals.d.ts`
declares the two globals an external plugin gets, `plugin()` and `valenced`, plus two shorthand
types, `ValencedPluginStartApi` and `ValencedJsonStorageApi`.

In the original Revenge repository the official types replaced a hand-written `types/revenge.d.ts`.
The switch immediately found the three missing APIs in rule 4, plus a real hidden crash:
`jsonStorage.cache` and `use()` can both be `undefined`, because `load: true` calls `get()`
**without awaiting it**. Every read now falls back to that plugin's exported `DEFAULTS`.

Some things really are untyped and need `as any`: Discord's own Flux store methods
(`Stores.GuildStore.getGuild`), and finder results where `returnNamespace` isn't inferred. Cast
once where you destructure, not at every use.

Run `bun run lint:types` before committing.

## 8. A filtered store getter can feed Discord's write path

Hide Servers scrambled the account's server order everywhere, desktop and web included, without
ever writing to a Discord store. Traced through the 337.10 bundle with hermes-dec (rule 5):

- **Reordering itself was fine.** Drag-to-reorder ends in `performMove` →
  `GuildActionCreators.moveById(sourceId, targetId, …)` → `GUILD_MOVE_BY_ID` →
  `SortedGuildStore.handleMoveById`. That resolves both ids against the store's **internal** tree
  (`tree.getNode`) and calls `moveNextTo`, `convertToFolder` or `moveInto`. It works by id, on
  complete data, so an `after` filter on the public getters never touches it.
- **Saving was the problem.** The save that follows is `persistAndAnnounce()` →
  `saveGuildFolders(SortedGuildStore.getCompatibleGuildFolders())` →
  `PreloadedUserSettingsActionCreators.updateAsync("guildFolders", …)`. The plugin filtered
  `getCompatibleGuildFolders`, so the saved snapshot was missing every hidden server and folder.
  `guildFolders` controls both folder membership and order, so hidden servers dropped out and were
  put back as unsorted on every device. `updateFolder` (renaming or recolouring a folder) does the
  same through `getGuildFolders().map(...)`.

So before you patch a store getter, find **every** caller. A getter whose result ends up in a save
must stay untouched. For the server list:

| Safe to filter (display) | Never filter (saving) |
| --- | --- |
| `getFastListGuildFolders`, `getFlattenedGuildFolderList`, `getGuildsTree` | `getCompatibleGuildFolders`, `getGuildFolders` |

If the save goes through a single exported function, you can guard it directly. Hide Servers also
`before`-hooks `saveGuildFolders` (`patches/saveGuildFolders.ts`) and puts hidden entries back into
the outgoing array, so an incomplete order can never be sent, even if a future build routes a save
through a filtered getter. Give up (return the original args) whenever anything **not hidden** is
missing from the payload: a caller that sends a partial list on purpose isn't yours to fix.

## 9. Errors go to `plugin.reportError`; debug code sits behind `DEBUG`

Community repository rules, adopted 2026-10-13 across every active plugin.

**Errors**

- Use `reportError(context, error)` from `shared/report.ts`, never `console.error`.
- Each plugin's `start()` calls `setReporter(plugin)`, and clears it on cleanup.
- The helper reports each distinct error once per session, because Valenced's `plugin.errors`
  list is never trimmed and a failure in a hot path would grow it forever. Errors raised before
  `start()` are queued and reported when it runs.
- Users see these in the plugin's options sheet and under the "has errors" filter, so report real
  failures, not chatter.

**Debug code**

- Put `const DEBUG: boolean = false` after the imports of each file that has debug code, and wrap
  that code in `if (DEBUG) …` or `{DEBUG && …}`.
- That covers `console.log`, `console.info` and `console.debug`, `console.warn` without an error,
  start-up probes, and Debug pages: `...(DEBUG ? [page(DEBUG_ROUTE, …)] : [])` in `ui/routes.tsx`,
  plus the row that opens them.
- The CLI minifies with dead-code removal, so none of it reaches the zip.
- Set a file's `DEBUG` to `true` locally to get its Debug page back. Never commit it as `true`.
