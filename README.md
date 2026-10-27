# Bazinga-Plugins

An unofficial plugin repository for [Valenced](https://valenced.app), by bleelblep. It isn't
affiliated with or reviewed by the Valenced team.

## Why this exists

I have a lot of plugins, and I'd rather not flood the
[Valenced community repository](https://github.com/Valenced/valenced-community-plugins) with ones
that aren't ready. So this is the stop gap:

1. **Here first.** Plugins land here once they work and are safe to use.
2. **Polished next.** I keep improving them: code quality, settings and testing.
3. **Community repo last.** When a plugin meets the community repository's standard, I submit it
   there, and that becomes the version to use.

That means plugins here work, but they can be rougher and change more often than community ones.

## Plugins

None yet. They'll be added a few at a time.

Plugins with native Android code only work on Android. Everything else works on Android and iOS.

## Account safety

Every plugin is checked against [these account-safety rules](docs/account-safety.md) before it's
listed here. In short, no plugin reads your Discord token, sends requests on your account behind
Discord's back, retries after Discord refuses something, or does things on your account without you
asking. No rules can promise Discord will never flag an account, but these remove the known risky
behaviour.

## Development

```
plugins/<name>/
├── manifest.json            # id, version, dist.script / dist.android
├── tsconfig.json            # { "extends": "../../tsconfig.base.json" }
├── js/index.ts              # JS entry -> index.js
└── src/main/kotlin/...      # only for native plugins -> plugin.jar
themes/<name>/               # theme plugins, same shape
shared/                      # code shared between plugins, bundled into each one
types/                       # globals the Valenced host injects
tests/                       # bun test preload and mocks
```

```sh
bun install
./gradlew packageAllPlugins     # every plugin -> build/dist/<id>@<version>.zip
bun run serve --host <wifi-ip>  # serves build/dist for a phone on the same Wi-Fi
```

See [Building and releasing](docs/building-and-releasing.md) and the
[coding rules](docs/coding-rules.md).

## License

GPL-3.0 (see `LICENSE`), except where a plugin says otherwise. Third-party code and credits are
listed in [Licenses and credits](docs/licenses-and-credits.md).
