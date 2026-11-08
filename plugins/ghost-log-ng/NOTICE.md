## Third-party code

The visual indicator for deleted messages (the `__vml_deleted` flag and the
`RowManager.prototype.generate` styling) comes from **redstonekasi's message-logger** in
[redstonekasi/vendetta-plugins](https://github.com/redstonekasi/vendetta-plugins/tree/main/plugins/message-logger),
licensed **BSD-3-Clause** (see [`THIRD_PARTY_LICENSES/BSD-3-Clause.txt`](./THIRD_PARTY_LICENSES/BSD-3-Clause.txt)).

Deletes are kept by blocking `MESSAGE_DELETE` and redrawing the row from a copied record with a
zero-width space added, an approach learned from **kmmiio99o's Message Tweaks**
([kmmiio99o/revenge-next-plugins](https://git.gay/kmmiio99o/revenge-next-plugins)). No code was
copied from it; the implementation is its own.

The broader plugin architecture (delete interception, jsonStorage persistence, settings pages)
is adapted from bleelblep's own **Ghost Log** and **Anti Ghost Ping**, both CC0-1.0.

Ghost Log NG is a ground-up rewrite of **Ghost Log Native Beta** (also CC0-1.0, bleelblep); its
storage engine follows the same on-disk format so existing backups and bundles import unchanged.

Ghost Log NG is **CC0-1.0**, except the visual indicator approach retained from redstonekasi's
work under BSD-3-Clause above.
