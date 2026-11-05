## Third-party code

This plugin is a Revenge Next port of **Picture Links** by
[redstonekasi](https://github.com/redstonekasi), from
[redstonekasi/vendetta-plugins](https://github.com/redstonekasi/vendetta-plugins)
(`plugins/picture-links`), as updated by [Rico040](https://github.com/Rico040) in
[Rico040/bunny-plugins](https://github.com/Rico040/bunny-plugins) (`plugins/picture-links`).

Taken from them: opening an avatar or banner in Discord's own media viewer (`openMediaModal`),
asking for the 4096px image, and the long-press that switches between the server avatar and the
main one.

### Licences

- redstonekasi's original: **BSD-3-Clause**, text in
  [THIRD_PARTY_LICENSES/BSD-3-Clause-redstonekasi.txt](./THIRD_PARTY_LICENSES/BSD-3-Clause-redstonekasi.txt).
  Its copyright notice and conditions are kept with this port as the licence requires.
- Rico040's fork: **CC0-1.0**.
- This port's own code: CC0-1.0, like the rest of this repository.

### What changed for Discord 348+

Current Discord already opens the avatar when you tap it on a profile
(`OpenableUserProfileAvatar` → `openUserProfileAvatarMediaViewer`), but with saving and sharing
turned off, at a reduced size. So instead of wrapping the avatar in a new button, this port adjusts
the options of that viewer as it opens. The banner has no viewer at all (static banners do nothing
on tap, animated ones only pause), so it gets one, as in the original.
