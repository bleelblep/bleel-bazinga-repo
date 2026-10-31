## Third-party code

This plugin is a Revenge Next port of **Show Tag** by
[Cynosphere](https://github.com/Cynosphere) (Discord ID `150745989836308480`), originally a
Vendetta plugin published at `cynosphere.github.io/VendettaPlugins/ShowTag/`.

The original source repository is no longer online. This port was written against the built
`index.js` still mirrored in
[vd-plugins/proxy](https://github.com/vd-plugins/proxy/tree/trunk/cynosphere.github.io/VendettaPlugins/ShowTag),
so it is a **derivative work**, not an independent implementation — the header/reply rewriting
logic, the display rules for both the legacy `#discriminator` and current `@username` account
systems, and the zero-width-space trick in "only show usernames" mode are all Cynosphere's.

### Licence — resolved: Unlicense

Cynosphere's own repository and its GitHub Pages site are both gone, and the mirrored build ships
no licence header, so this was unresolved for a while. It is now settled: a surviving clone at
[Martinz64/Cynosphere-VendettaPlugins](https://github.com/Martinz64/Cynosphere-VendettaPlugins)
kept the original commit history intact, and its root `LICENSE` is the **Unlicense**.

The evidence that this really is upstream's licence and not a mirrorer's addition:

- The `LICENSE` file was added in that repository's **initial commit**
  (`ae40dc194c52fde11faafe32ac95e464df69b085`, 2023-03-21), not later by whoever cloned it.
- That commit is authored by **Cynthia Foxwell** — GitHub login `Cynosphere`, the plugin's author.
  The whole history is theirs; the clone added no commits of its own to the licence.
- `plugins/ShowTag/` sits in the same repository, under that root `LICENSE`.

The Unlicense is a public domain dedication, so there is no licence obligation here and this
plugin is fine to publish. The attribution above is courtesy, and worth keeping.
