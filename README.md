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

- Calendar ("Today at 2:05 PM", or a date like 10/28/2026 for older messages), relative
  ("5 minutes ago"), ISO 8601 (in UTC), or your own format string.
- Custom formats use moment.js-style letters (`dddd, MMMM Do YYYY, h:mm:ss a`). There is no way to
  mark text as literal, so letters such as `a`, `d` or `h` inside words get swapped for time parts.
- Times are worked out when a message row is drawn, so a relative time doesn't count up while you
  watch.
- A 24-hour switch for Calendar ("Today at 14:05"). Custom formats pick their own with `H` or `HH`.
- Optionally shows the name, avatar and time on every message instead of grouping them.

Credit: based on Custom Timestamps by Fiery.

### Hide Servers

Hide servers, folders and channels you don't want to see. Hiding only changes what your device shows:
you stay in the server, and your server order on other devices isn't touched.

- Hide a server from its long-press menu in the server bar ("Hide server"), and a channel or
  category from its long-press menu ("Hide channel"). Folders are hidden from settings.
- A list in settings to bring anything back.

Credit: with blerp; one file adapted from kmmiio99o's ServerDrawer.

### New Members

A sprout next to the names of people who joined the server in the last week, like on desktop.

- Choose the badge: an emoji, a recoloured icon, or Discord's own.
- Pick the icon colour, or reset it to green.
- If someone's role already has an icon, show the badge in its place (default) or keep the role icon
  and add 🌱 after the name.

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

Tidies your messages as you send them. Link cleaning, polish and your rules never touch code blocks.

- **Clean links:** strips tracking tags from links (YouTube, Spotify, X, Instagram, Amazon and more),
  plus the ClearURLs community rules, which update about once a week.
- **Polish (off by default):** capitalise sentences, add apostrophes, and optionally end with a full stop.
- **Your own rules:** find-and-replace for text or links (for example, X links to fxtwitter). Pick
  from ready-made rules, or import and export them. A rule can also apply as you type. Anything
  typing skipped is caught when you send.
- **Shortcuts in any message:** `{timestamp}` becomes the current time, shown in each reader's own
  time zone. `{rainbow:text}` becomes rainbow-coloured text. Colour codes written into ` ```ansi `
  blocks are fixed up so the colours show.
- **Silent messages (off by default):** send every new message without notifying anyone.
- **Reply pings (opt-in):** start replies with the @ mention switched off. You can still turn it back on.
- **Hold and swipe the send button:** let go halfway to preview the finished message before
  sending, or swipe all the way up to send it exactly as typed. You can also make a plain tap open
  the preview.
- **Edits:** cleaning and rules apply to edited messages too (you can turn this off). An old
  message is tidied as soon as you open it for editing, so you see the result before saving.

Credit: with Rosie and WarFade.

### Timezones

See someone's local time next to their messages.

- Set a timezone for anyone, by searching places or from a list of zones.
- Shows their time (and optionally their day) beside their message timestamps, in 12- or 24-hour time.
- Reads the shared timezone list other clients use, so people who've added themselves show up
  automatically. You can turn this off.
- Can also read Equicord's timezone list (off by default, read only).
- "Their time" is in the message long-press menu, at the bottom: tap it to set or change their zone.

Credit: a port of Aliucord's Timezones by aniimalz.

## Outside services

A few plugins talk to services other than Discord. None of them sends your Discord login.

| Plugin | Service | What it sends |
| --- | --- | --- |
| ReviewDB | ReviewDB (`manti.vendicated.dev`) | The profile or server you're viewing, your reviews and votes, and ReviewDB's own sign-in token |
| Send Tweaks | ClearURLs rules (`rules2.clearurls.xyz`, GitLab) | Nothing: it downloads the rule list at most once a week. On by default; can be turned off |
| Timezones | Shared timezone list (`timezonedb.catvibers.me`) | The user IDs of people shown in chat whose timezone you haven't set. On by default; can be turned off |
| Timezones | Open-Meteo place search | The place name you type. On by default; can be turned off |
| Timezones | Equicord's timezone list (`timezone.creations.works`) | Nothing about you: it downloads the whole list, about once an hour. Off by default |

## Building

```sh
bun install
./gradlew packageAllPlugins     # every plugin -> build/dist/<id>@<version>.zip
bun run serve --host <wifi-ip>  # serves build/dist to a phone on the same Wi-Fi
```

## License

GPL-3.0 (see `LICENSE`), except where a plugin says otherwise. Plugins built on other people's work
carry a `NOTICE.md` with the credits and licence details.
