# Known issues

Environment and build-level problems that aren't fixable by changing plugin logic. For bugs
you can introduce in plugin code, see [Coding rules](./coding-rules.md).

## AI checks need AI Core

Second Thoughts lists `bleelblep.ai-core`, a native Android plugin that hasn't been ported to
Valenced yet, as **optional**: its pattern checks work without it, and only the AI checks are
disabled. Ask AI, Catch Up and TL;DR require AI Core.

## Settings don't carry over from Revenge

Valenced keeps its files in `files/valenced/` and doesn't import Revenge's `files/revenge/`. Every
plugin starts with default settings after the switch. Each plugin's changelog says so in its
Valenced entry.

## JSX runtime is read eagerly

The template's build (`valenced-plugin build`) passes the JSX runtime in as an argument of the
bundle's wrapper function, which emits:

```js
})({}, valenced.react.ReactJSXRuntime);
```

The JSX runtime is therefore read **once, as an IIFE argument, at preInit** — structurally the
same mistake as [coding rule 1](./coding-rules.md#1-import-from-valenced-and-never-use-those-imports-at-module-scope), at the
build-config level. It works today only because Metro initializes React's JSX runtime before
plugins pre-init.

PalmDevs' builds don't rely on that. They wrap it so it resolves per call:

```js
function jsx(...a) { return valenced.react.ReactJSXRuntime.jsx(...a) }
```

Not currently biting anything. Worth switching to a shim module if JSX ever breaks at boot.

## Clearing the module cache

Valenced persists module-lookup results (including negative ones) to a native on-disk cache.
A build that once triggered the poisoning in
[coding rule 1](./coding-rules.md#1-import-from-valenced-and-never-use-those-imports-at-module-scope) can leave a bad entry behind
that survives restarts, making a *fixed* build look identical to the broken one.

Clear the module cache before trusting any test result in that situation.
