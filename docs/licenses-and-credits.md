# Licenses and credits

The repository uses CC0-1.0 by default. Ported plugins retain their upstream terms. Check the
plugin's `NOTICE.md` and `THIRD_PARTY_LICENSES/` directory before copying its code.

| Plugin | License or attribution |
| --- | --- |
| Custom Timestamps | Unlicense; original work by Fiery |
| Show Tag | Unlicense; original work by Cynosphere |
| Hide Call Buttons | BSD-3-Clause; original work by John (`janisslsm`) |
| Picture Links | CC0-1.0; original by redstonekasi under BSD-3-Clause (licence kept in `THIRD_PARTY_LICENSES/`), updated by Rico040 under CC0-1.0 |
| Timezones | GPL-3.0; port of Timezones by aniimalz from Aliucord/plugins. Zone data from the IANA tz database (public domain) |
| Second Thoughts | CC0-1.0 |
| Character Counter | CC0-1.0 |
| No Dividers | CC0-1.0 |
| Fuck Squares (`round-icons`) | CC0-1.0 |
| New Members | CC0-1.0 |
| Screenshot Redactor | CC0-1.0 |
| Hide Servers (`hide-servers-drawer`) | CC0-1.0, except `js/patches/createElementIntercept.ts`, which is GPL-3.0, adapted from kmmiio99o's ServerDrawer (licence in `THIRD_PARTY_LICENSES/`) |
| ReviewDB (`review-db`) | GPL-3.0; port of ReviewDB by mantikafasi and Vendicated from Vencord (licence in `THIRD_PARTY_LICENSES/`). The mobile sign-in follows ra1ncord/rain (MPL-2.0); no code was copied |
| Staff Tags | CC0-1.0; original work by Fiery and シグマ siguma |
| Send Tweaks | CC0-1.0; with contributions from Rosie and WarFade |
| Plugin Hub | CC0-1.0 |
| Pronouns | CC0-1.0 |
| Translate | CC0-1.0 |
| Veil | CC0-1.0 |
| Theme Backgrounds | CC0-1.0, but it bundles `shared/themes/` (see below), so the built plugin includes GPL-3.0 code |
| VodkaXMartini Themes (`vodka-themes`) | Theme data from [VodkaXMartini/VendettaTheme](https://github.com/VodkaXMartini/VendettaTheme) (`2e65925`), which has **no licence**: bundled at the user's request, so this plugin must stay private. It also bundles `shared/themes/` (GPL-3.0 parts). |

`shared/themes/` is the Themes plugin's theme engine, copied so VodkaXMartini Themes and Theme
Backgrounds still build without porting Themes. Its parts keep their own licences: the classic
Revenge engine under BSD-3-Clause, `lib/rawAliases.ts` from Themeify under GPL-3.0 and
`lib/plusColor.ts` adapted from nexpid's Themes+. Details are in
[`shared/themes/NOTICE.md`](../shared/themes/NOTICE.md), and the licence texts are in
`shared/themes/THIRD_PARTY_LICENSES/`.

Show Tag's original repository and website are no longer available. Its Unlicense status was
recovered from a surviving clone whose history contains the license in Cynosphere's initial
commit. The evidence is recorded in
[`plugins/show-tag/NOTICE.md`](../plugins/show-tag/NOTICE.md).
