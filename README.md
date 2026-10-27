# Bazinga Plugins

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

## Install

In Valenced, add this repository:

```
https://bleelblep.github.io/bleel-bazinga-repo/index.json
```

Then install the plugins you want from it.

## Account safety

Every plugin is checked before it's listed here. No plugin reads your Discord token, sends its own
requests to Discord on your behalf, retries after Discord refuses something, or does things on your
account without you asking. Messages are only ever sent by Discord's own send button, and sign-ins
only go through Discord's own Authorize screen. No rules can promise Discord will never flag an
account, but these remove the known risky behaviour.

## Plugins

All of these are JavaScript only, so they work on Android and iOS.

### Custom Timestamps

Choose how the time next to each message looks.

- Calendar ("Today at 14:05"), relative ("5 minutes ago"), ISO 8601, or your own format string.
- Optionally shows the name, avatar and time on every message instead of grouping them.

Credit: based on Custom Timestamps by Fiery.

### Hide Servers

Hide servers, folders and channels you don't want to see. Hiding only changes what your device shows:
you stay in the server, and your server order on other devices isn't touched.

- Hide or show servers, whole folders and single channels from their long-press menus.
- A list in settings to bring anything back.

Credit: with blerp; one file adapted from kmmiio99o's ServerDrawer.

### New Members

A sprout next to the names of people who joined the server in the last week, like on desktop.

- Choose the badge: an emoji, a recoloured icon, or Discord's own.
- Pick the icon colour, or reset it to green.

### No Dividers

Removes the thin lines between rows in settings and other lists. Nothing to set up: turn it off to
bring the lines back.

### ReviewDB

Read and write reviews on people's profiles and on servers, from [ReviewDB](https://reviewdb.mantikafasi.dev).

- Reviews on user profiles and in server menus.
- Write, vote on, delete and report reviews.
- Block people whose reviews you don't want to see, and hide warnings or timestamps.
- Notifications about new reviews of you.
- Sign in with Discord's own Authorize screen (the "identify" scope only: ReviewDB sees your
  username and avatar, not your messages or servers).

Credit: a port of Vencord's ReviewDB by mantikafasi and Vendicated (GPL-3.0).

### Send Tweaks

Tidies your messages as you send them.

- **Clean links:** strips tracking tags from links (YouTube, Spotify, X, Instagram, Amazon and more),
  plus the ClearURLs community rules.
- **Polish:** capitalise sentences, add apostrophes, end with a full stop.
- **Your own rules:** find-and-replace for text or links (for example, X links to fxtwitter),
  optionally applied as you type.
- **Templates:** dates, times and snippets inside your replacements.
- **Silent messages:** send without pinging anyone, always or for one message.
- **One-off sends:** hold the send button and swipe up to send one message silently, with
  notifications, or exactly as typed.
- Also applies to edits if you want, and rules can be imported and exported.

Credit: with Rosie and WarFade.

### Timezones

See someone's local time next to their messages.

- Set a timezone for anyone, by searching places or from a list of zones.
- Shows their time (and optionally their day) beside their message timestamps, in 12- or 24-hour time.
- Reads the shared timezone list other clients use, so people who've added themselves show up
  automatically. You can turn this off.

Credit: a port of Aliucord's Timezones by aniimalz.

## Outside services

A few plugins talk to services other than Discord. None of them sends your Discord login.

| Plugin | Service | What it sends |
| --- | --- | --- |
| ReviewDB | ReviewDB (`manti.vendicated.dev`) | The profile or server you're viewing, your reviews and votes, and ReviewDB's own sign-in token |
| Send Tweaks | ClearURLs rules (`rules2.clearurls.xyz`, GitLab) | Nothing: it downloads the rule list at most once a week. On by default; can be turned off |
| Timezones | Shared timezone list (`timezonedb.catvibers.me`) | The user IDs of people shown in chat whose timezone you haven't set. On by default; can be turned off |
| Timezones | Open-Meteo place search | The place name you type. On by default; can be turned off |

## Building

```sh
bun install
./gradlew packageAllPlugins     # every plugin -> build/dist/<id>@<version>.zip
bun run serve --host <wifi-ip>  # serves build/dist to a phone on the same Wi-Fi
```

## License

GPL-3.0 (see `LICENSE`), except where a plugin says otherwise. Plugins built on other people's work
carry a `NOTICE.md` with the credits and licence details.
