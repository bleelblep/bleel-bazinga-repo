# Plugin technical notes

## Valenced port

These 13 plugins were ported from Revenge Next on 2026-10-26 by following the
[migration guide](https://valenced.app/docs/plugin-development/migrating-from-revenge/):

- `@revenge-mod/*` imports became `@valenced/*`. The DevTools packages keep their Revenge names.
- Manifests depend on `valenced.api` (`>=1 <2`) instead of `revenge.api`.
- The `revenge` global in `types/globals.d.ts` became `valenced`, and the local type aliases
  became `ValencedPluginStartApi` and `ValencedJsonStorageApi`.
- The shared chat-floater key became `__valencedChatFloaters`.
- Each plugin got a patch version bump and a changelog entry.

All 13 build with the Valenced CLI and pass the type check. None has been tried on a device yet.

## Discord 348

Checked against 348.0 (versioncode 348200) by comparing its Hermes bundle and a jadx decompile with
343.11:

- The native message-row schema only gained fields (`forceRevealSpoilers`, `secondaryCtaButton`,
  and three inside embeds and links). Nothing was removed or renamed, so the plugins that rewrite
  rows (Show Tag, Custom Timestamps) need no schema changes.
- `DCDChatManager.updateRows` / `clearRows` and the chat module's React methods are unchanged.
- `SparklesIcon` was removed and there is no standalone sparkle icon left (`SparkleIcon` only
  exists inside `PencilSparkleIcon` and `ImageSparkleIcon`). Catch Up uses `MagicWandIcon` instead.

## Patch interactions

Show Tag and Custom Timestamps patch `RowManager.prototype.generate`. Custom Timestamps owns the
only `instead` hook used on that method. Show Tag uses `before` or `after` hooks to avoid the
patcher's multi-`instead` recursion bug. Screenshot Redactor (not ported yet) also patches it with
`before`/`after`, and its result can depend on patch order with Show Tag, since both modify
`generated.username`.

See [coding rule 2](./coding-rules.md#2-the-patchers-hook-contracts-differ-from-classic-revenge)
for the hook contracts and recursion analysis.

## Historical fixes

### Settings and module scope

Settings pages previously failed because external plugins read `valenced.*` (then `revenge.*`)
APIs at module scope, before Discord's UI modules existed. The complete rule is documented in
[coding rule 1](./coding-rules.md#1-import-from-valenced-and-never-use-those-imports-at-module-scope).

### Module lookup failures

Three separate lookup problems were found while building Screenshot Redactor:

1. Matching functions often live on a module's `default` export rather than its namespace.
2. `getModules` shares its `max` budget between initialized lookups and future subscriptions.
3. Successfully finding a resolver does not prove the target UI surface uses that resolver.

Prefer `valenced.discord.utils.modules.finders.getModuleWithImportedPath` when the Discord source
path is known. See [coding rule 3](./coding-rules.md#3-module-lookups).
