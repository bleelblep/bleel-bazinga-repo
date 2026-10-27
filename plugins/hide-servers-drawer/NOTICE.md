## Third-party code

This plugin is a Revenge Next port of `bleelblep/revengeplugins`' `hide-servers-drawer`
(CC0, same as the rest of this repository), with one exception carried over unchanged:

- `src/patches/createElementIntercept.ts` is adapted from
  [kmmiio99o/vd-plugins](https://github.com/kmmiio99o/vd-plugins)'s **ServerDrawer** plugin
  (`plugins/ServerDrawer/src/patches/createElementIntercept.ts`), which is licensed
  [GPL-3.0](https://github.com/kmmiio99o/vd-plugins/blob/main/LICENSE). That file is a close
  structural port, not an independent implementation, so it is licensed GPL-3.0 here too --
  see the header comment in the file itself and `THIRD_PARTY_LICENSES/GPL-3.0.txt` for the
  full license text. It is the one GPL-3.0 file in an otherwise CC0 repository.

Two other pieces of this plugin were designed after studying ServerDrawer's approach, but are
independent implementations (different structure, no code copied) rather than derivative
works, so they carry no license obligation beyond the courtesy of a mention:

- The overall fix for the scroll-jump bug -- replacing GuildsBar with a non-virtualized render
  instead of nulling individual rows inside Discord's FastList -- follows the same strategy as
  ServerDrawer's `patches/hideGuildsBar.tsx`.
- `getGuildsBarGuildMenuItems` + the native long-press action sheet lookup were located using
  the same lookup heuristic ServerDrawer's `GuildItem.tsx` uses.
