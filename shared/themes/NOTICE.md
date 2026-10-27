> **Copied into Valence-Plugins (2026-10-26).** This folder holds only part of the Themes plugin
> from `bleelblep/revenge-next-plugins`: its theme engine (`lib/compile.ts` and what it imports,
> `lib/color.ts`, `lib/findInReactTree.ts`, `types.ts`), shared by VodkaXMartini Themes and Theme
> Backgrounds. Themes itself isn't ported. The notice below is the Themes plugin's own, kept whole
> for its licence and attribution details. Paths in it like `js/lib/x.ts` are `lib/x.ts` here, and
> the parts it describes that aren't in this folder (icon and emoji packs, the refresh code) don't
> apply.

## Third-party code

This plugin is a Revenge Next port of the colour-theme engine in classic **Revenge**
([revenge-mod/revenge-bundle](https://github.com/revenge-mod/revenge-bundle), `src/lib/addons/themes/`,
read at `1b1d297`), itself descended from Vendetta and Bunny.

It is a **derivative work**: the theme formats it reads (Vendetta spec 2, Bunny spec 3), the
spec-2 semantic fallback map, the Android alpha keys and the chat background patch follow the
original. How a theme is applied is new, because classic's way crashes Discord 348: classic
registered the theme under a name of its own, and 348's `resolveSemanticColor` rejects any theme
name it doesn't know (`Invalid theme`). This port writes the colours into Discord's own four
themes instead and puts them back afterwards, so Discord's theme name never changes.

The upstream repository is licensed **BSD-3-Clause**, retained here in full at
[`THIRD_PARTY_LICENSES/BSD-3-Clause.txt`](./THIRD_PARTY_LICENSES/BSD-3-Clause.txt):

```
Copyright (c) 2023, Team Vendetta
Copyright (c) 2024, pylixonly
Copyright (c) 2024, Team Revenge
```

BSD-3-Clause is permissive, so this port may be redistributed provided that copyright notice,
the license text, and its disclaimer are retained, which the file above does. Its third clause
also forbids using the original authors' names to endorse this port; nothing here does.

---

## GPL-3.0 part: the grey-ramp table

`js/lib/rawAliases.ts` is copied from **Themeify** in
[everestmcarthur/revenge-next-plugs-dev](https://github.com/everestmcarthur/revenge-next-plugs-dev)
(`plugins/themeify/src/lib/parser.ts` at `a43f367`: the `RAW_COLOR_ALIASES` table and the loop that
fills raw colours from it), by Themeify's authors (the manifest names Rosie; commits are by "Ally
Founder"). That repository is licensed
[GPL-3.0](https://github.com/everestmcarthur/revenge-next-plugs-dev/blob/main/LICENSE). The table
is unchanged and the loop keeps the same logic, so that file is licensed **GPL-3.0** here too. The
full license text is in [`THIRD_PARTY_LICENSES/GPL-3.0.txt`](./THIRD_PARTY_LICENSES/GPL-3.0.txt),
and the file carries an SPDX header.

What that means in practice:

- The built plugin bundles that file, so a distributed build of Themes is a combined work that
  must be offered under GPL-3.0 terms, with its source available. The rest of the plugin stays
  CC0 (and the classic Revenge parts BSD-3-Clause, which is GPL-compatible) when taken on its own.
- The light/dark check around that table, which decides whether a filled colour is used, is in
  `js/lib/legacy.ts` and is not part of the copied code.

Themeify was also read for comparison (`docs/debugging/themeify-vs-themes.md`). No other code was
taken from it.

---

## CC-BY-4.0 part: icon packs, after Themes+

Icon pack support (`js/lib/icons.ts`, `js/ui/pages/Icons.tsx`, `js/ui/pages/IconPack.tsx`) is
adapted from **Themes+** by **nexpid**: the plugin in
[nexpid/RevengePlugins](https://github.com/nexpid/RevengePlugins) (`src/plugins/themes-plus/`, read at
`e10e86e`) and its pack list and docs in [nexpid/ThemesPlus](https://github.com/nexpid/ThemesPlus)
(read at `f1d20ad`). nexpid/RevengePlugins, the code this was adapted from, is licensed
**CC-BY-4.0**; the full text is in
[`THIRD_PARTY_LICENSES/CC-BY-4.0.txt`](./THIRD_PARTY_LICENSES/CC-BY-4.0.txt). nexpid/ThemesPlus
has no licence of its own (checked 2026-10-09). Nothing from it is bundled: the plugin follows the
pack format it documents and downloads its lists at runtime, the same way it downloads the packs.

What was taken: the icon pack format (`id`, `name`, `description`, `credits`, `suffix`, `load`,
`config`), the rule for where an icon sits in a pack (the asset's `httpServerLocation` without
`/assets/`, then `name + suffix + '.' + type`, with a leading `../` written `_/`), and the use of
nexpid's published pack list and per-pack file lists (`iconpacks/list.json` and the
`iconpack-trees` branch), which the plugin downloads when the Icons screen opens.

What changed: the code is written anew for Revenge Next and swaps icons through Revenge's
`addAssetOverride` rather than by replacing React Native's `Image`; it measures each pack's image
scale; and a pack added by link may name its own file list (`tree`).

Since 0.5.0, Themes+ themes (a theme's `plus` section) are read too: `js/lib/plus.ts`,
`js/lib/plusColor.ts` and `js/patches/mentionLine.ts`. Taken from Themes+: the `plus` format, its
colour values (one colour, or dark/light/midnight, or `RC_`/`SC_` names; `resolveColor.ts`), and
the idea of colouring the mention bar through `createBackgroundHighlight`'s `gutterColor`
(`mentionLineColor.ts`). Changed: icon colours are applied in this plugin's own icon patch on
Discord's icon components rather than by replacing `Image`; the unread badge colour goes into raw
`RED_400`, as Themes+'s docs ask; the theme's icon pack is put back to the user's own when the theme
is switched off; custom icon overlays are not included.

CC-BY-4.0 asks for credit, a link to the licence, and a note that changes were made, which this
section and the Licence page give. It doesn't restrict the rest of the plugin's licence. nexpid
doesn't endorse this plugin.

The packs themselves are not part of this plugin: they're downloaded from their authors' links,
and each keeps its own authors' terms. Fonts work the same way; nothing from a font is bundled.

## GPL-3.0 part: changes without a reload, after Revenge's Themes API

`js/lib/refresh.ts` is adapted from Revenge's **Themes API**
([revenge-mod/revenge-community-plugins](https://github.com/revenge-mod/revenge-community-plugins)
`plugins/api.themes/js/colors.ts`, commit `f3aadb9`, "reloadless colors + icon packs", 2026-10-16):
wrapping Discord's `RootThemeContextProvider` and adding a key to its `enabledExperiments` that
changes on every refresh, so every themed component resolves its colours and icons again. That
repository is licensed **GPL-3.0** (text in `THIRD_PARTY_LICENSES/GPL-3.0.txt`), so that file is
GPL-3.0 here too and carries an SPDX header. Changed: our own key prefix, our module lookup and error
reporting, and it falls back to asking for a reload when the provider can't be wrapped.

## Aliucord themes

`js/lib/aliucord.ts` converts themes made for **Themer**, the Aliucord plugin by Vendicated
([Vendicated/AliucordPlugins](https://github.com/Vendicated/AliucordPlugins) `Themer/`,
Apache-2.0). No code is taken from it: the converter reads Themer's documented file format, and its
lists of which old colour names each "simple" colour sets (`Constants.kt`). Which job each old
colour name did comes from Aliucord's theme docs
([Aliucord/documentation](https://github.com/Aliucord/documentation) `theme-dev/README.md`, no
licence stated), used as facts only; none of their text is copied.

## GPL-3.0 part: emoji packs, after System Emoji

The emoji drawing in `src/main/kotlin/com/bleelblep/themes/Emoji.kt` (the message, reaction and
emoji-picker hooks, and the drawable and span classes that draw one emoji) is adapted from
**System Emoji** by **contrabags**, in
[contrabag/revenge-next-plugins](https://github.com/contrabag/revenge-next-plugins)
(`plugins/system-emoji/src/main/kotlin/contrabag/systememoji/SystemEmojiPlugin.kt`, read at
`784a147`), licensed [GPL-3.0](./THIRD_PARTY_LICENSES/GPL-3.0.txt). That file is GPL-3.0 here too
and carries an SPDX header.

What changed: it draws with a downloaded emoji pack's font instead of the system font, scales
message emoji to a chosen size, and adds the pack as a fallback font on Discord's typefaces. The
download, the pack list and the settings pages are new.

The packs come from [PoomSmart/EmojiFonts](https://github.com/PoomSmart/EmojiFonts) releases (its
scripts are MIT) and download from there; none is bundled. A hand-picked
few older and other looks come from [zFont's host repository](https://github.com/zFont/Host)
(`Font/Emoji`), which has no licence; they download from there too. The SerenityOS pack is
**bundled**: `assets/emoji/serenityos.ttf` is a bitmap (CBDT) font built by
`tools/build_serenity_emoji.py` from [SerenityOS](https://github.com/SerenityOS/serenity)'s
`Base/res/emoji` PNGs, Copyright (c) 2018-2026, the SerenityOS developers, BSD 2-Clause. Its licence
ships next to it as `assets/emoji/serenityos-LICENSE.txt`. The idea came from
[linusg/serenityos-emoji-font](https://github.com/linusg/serenityos-emoji-font) (BSD 2-Clause), whose
COLRv1 font only Android 13+ draws; none of its code is used. Each pack's artwork keeps its maker's
terms: Twemoji CC-BY 4.0, Noto Apache 2.0 / OFL, Blobmoji Apache 2.0, OpenMoji CC-BY-SA 4.0. Apple,
Samsung and WhatsApp artwork is their makers' own, and the plugin says so on those packs.

The font support writes Revenge's own `fonts.json` format and relies on RevengeXposed's font
loader (`tweaks/legacy/appearance/Fonts.kt`, 1.6.3) to use it; no code was copied from it.

## Colour-name history: Themelings (read, not copied)

Where old colour names should go (`js/lib/legacy.ts`, from 0.3.0) was worked out with the help of
[nexpid/Themelings](https://github.com/nexpid/Themelings), which recorded Discord's colour tables for
versions 229 to 341. That repository has no licence (checked 2026-10-09), so it is only read by a
development script (`docs/debugging/scripts/legacy_map.py`) and nothing from it is included in
Themes. The table itself is our own choice of where each name goes. Thanks to nexpid for keeping it.

The themes in `tests/fixtures/` are test inputs only and are never part of a build; their sources
and licences are listed in `tests/fixtures/SOURCES.md`.
