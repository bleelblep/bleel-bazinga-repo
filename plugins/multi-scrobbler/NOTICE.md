## Third-party code

This plugin is a Valenced port of **Multi Scrobbler** (1.2.0) by **kmmiio99o**, from
[kmmiio99o/revenge-next-plugins](https://github.com/kmmiio99o/revenge-next-plugins)
(`plugins/multi-scrobbler`, commit `05fc16e`), ported with the author's permission.

Upstream is released under the **GPL-3.0**, and so is this port: full text in
`THIRD_PARTY_LICENSES/GPL-3.0.txt`.

Changes from upstream:

- `@revenge-mod/*` imports and `revenge.*` globals renamed to their Valenced names.
- The kmmiio Library plugin (`dev.kmmiio99o.lib`) is no longer needed: the five Discord modules
  it supplied are looked up directly in `js/lib/modules.ts`, with the same filters.
- The Media Session source is rebuilt (1.3.0) without kmmiio's library or their companion app:
  this plugin's own native half (`src/main`) receives songs pushed by bleelblep's Music Bridge app
  (released on bleelblep/bleel-bazinga-repo, forked from kmmiio's CC0 MediaSession Bridge companion). Upstream's
  companion was pulled through a content provider, which Discord can't see on Android 11+.
  The iTunes artwork lookup (`js/lib/artwork.ts`) is upstream's.
