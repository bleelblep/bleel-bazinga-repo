## Third-party code — GPL-3.0

This plugin is a Revenge Next port of **ReviewDB** by
[mantikafasi](https://github.com/mantikafasi) and [Vendicated](https://github.com/Vendicated), from
[Vendicated/Vencord](https://github.com/Vendicated/Vencord) (`src/plugins/reviewDB`).

It is a close derivative work: the API client, the entity types, the permission rules (who can
delete, block or report a review), the vote arithmetic, the startup notice handling and the
settings all follow the original. The UI is new, since the desktop one is DOM and CSS.

The mobile sign-in follows [ra1ncord/rain](https://github.com/ra1ncord/rain)'s
`plugins/reviewdb/lib/showAuthModal.ts` (MPL-2.0): Discord's own `OAuth2AuthorizeModal` pushed with
`pushModal`, and `clientMod=vendetta`, which is the value ReviewDB accepts from mobile clients.
No code was copied from it.

> ### ⚠️ This plugin is GPL-3.0, unlike the rest of this repository
>
> Vencord is licensed [GPL-3.0](./THIRD_PARTY_LICENSES/GPL-3.0.txt), which is copyleft, so this
> port is GPL-3.0 too. Anything that copies code *out* of this directory inherits GPL-3.0.

### Differences from desktop

- **Where it shows:** a "User Reviews" card on the profile's main tab (desktop: the profile popout
  and DM sidebar), and a "Server Reviews" row in the server long-press sheet (desktop: the guild
  context menus).
- **Review text** is shown as plain text; desktop renders it with Discord's markdown parser.
- **The composer** is a plain text field, not Discord's chat input.
