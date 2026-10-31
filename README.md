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

What each plugin does, what's coming next, and a place to ask for features:
https://bleelblep.github.io/bazinga/

## Account safety

Every plugin is checked before it's listed here. No plugin reads your Discord token, sends its own
requests to Discord on your behalf, retries after Discord refuses something, or does things on your
account without you asking. Messages are only ever sent by Discord's own send button, and sign-ins
only go through Discord's own Authorize screen. No rules can promise Discord will never flag an
account, but these remove the known risky behaviour.

## Plugins

Most are JavaScript only, so they work on Android and iOS. Live Markdown, Pocket Browser, Sharp
Corners and Text Animation have native Android code, so they are Android only.

### Character Counter

Counts your message's characters in a small square above the message box, and sends long ones as
several messages.

- Characters typed, characters left, or typed out of the limit; always or only near the limit.
- Past the limit it turns red and says how far over you are.
- Past the limit, Send sends the message as several, cut at a blank line, a line break or the end
  of a sentence, one after another, each after Discord confirms the one before. A sheet shows the
  progress with a Stop button; a setting can show the parts first instead. The square is a button
  that shows the parts too.

### Custom Timestamps

Choose how the time next to each message looks.

- Calendar ("Today at 2:05 PM", or a date like 10/28/2026 for older messages), relative
  ("5 minutes ago"), ISO 8601 (in UTC), or your own format string.
- Custom formats use moment.js-style letters (`dddd, MMMM Do YYYY, h:mm:ss a`). Put words in
  `[brackets]` to keep them as written, or letters such as `a`, `d` or `h` get swapped for time parts.
- Custom can use a second format for messages sent today, such as `h:mm A` for just the time.
  `{day}` says "Today" or "Yesterday" (the weekday on other days); with it, `{day} [at] h:mm A` covers
  yesterday too.
- With Custom picked, settings list every format letter with an example, and ready-made formats
  you can tap to use.
- Times are worked out when a message row is drawn, so a relative time doesn't count up while you
  watch.
- A 24-hour switch for Calendar ("Today at 14:05"). Custom formats pick their own with `H` or `HH`.
- Optionally shows the name, avatar and time on every message instead of grouping them.

Credit: based on Custom Timestamps by Fiery.

### Hide Call Buttons

Hides the call and video buttons you never use. Each switch hides one button in one place; calls
still work from everywhere else.

- The call button on someone's profile.
- The call and video buttons at the top of a DM or group DM.
- The call button at the end of each row in the friends list.
- The camera button in the voice channel controls.

Credit: a port of John's (janisslsm) Hide call buttons for Vendetta (BSD-3-Clause, see `NOTICE.md`).

### Hide Servers

Hide servers, folders and channels you don't want to see. Hiding only changes what your device shows:
you stay in the server, and your server order on other devices isn't touched.

- Hide a server from its long-press menu in the server bar ("Hide server"), and a channel or
  category from its long-press menu ("Hide channel").
- Or tap the eye at the bottom of the server bar: every server shows, hidden ones darkened, and a
  tap hides or shows one; the small eye on a folder's corner hides the whole folder. Tap the tick to finish. Also in a server's long-press menu.
  The eye button can be turned off in settings.
- A list in settings to bring anything back.

Credit: with blerp; one file adapted from kmmiio99o's ServerDrawer.

### Live Markdown

Shows bold, italics, code, spoilers and more styled as you type a message, instead of the raw
`**symbols**`. Android only.

- Headings grow and `-#` subtext shrinks like in chat (can be turned off).
- Fades the markdown symbols so the text reads clean while you type.
- Code in a monospace font.
- Select text in the message box to get Bold, Italic and the rest next to Copy and Paste; tap one
  again to undo it.

### New Members

A sprout next to the names of people who joined the server in the last week, like on desktop.

- Choose the badge: an emoji, a recoloured icon, or Discord's own.
- Pick the icon colour, or reset it to green.
- If someone's role already has an icon, show the badge in its place (default) or keep the role icon
  and add 🌱 after the name.

### No Dividers

Removes the thin lines between rows in settings and other lists. Nothing to set up: turn it off to
bring the lines back.

### Pocket Browser

A web browser inside Discord, in a new tab of the emoji picker. Android only.

- Tabs, history, bookmarks and a speed dial. Tabs can survive closing Discord.
- Search with DuckDuckGo (default), Google, Bing, Brave or Startpage.
- Open links from chat in it instead of leaving Discord, and pop videos out into a floating or
  picture-in-picture player that keeps playing when closed.
- Dark pages, desktop sites, text size, JavaScript and third-party cookies, each with a switch;
  clear history or site data any time.

### Pronouns

People's pronouns as a small tag next to their name in chat.

- Read from their Discord profile (the server profile first), and optionally from
  [PronounDB](https://pronoundb.org).
- "Only real pronouns" keeps just the pronoun sets from a profile field (“he/him 🌈 | 19” shows
  “he/him”) and hides fields with none. Neopronouns included; any/all can be counted or not, and
  you can add words of your own.
- Choose who gets a badge: everyone, everyone except people you hide, or only people you pick.
- Set someone's pronouns yourself from the long-press menu on their message, or by user ID.
- One badge colour for everyone, each person's role colour, or a colour per person.

### ReviewDB

Read and write reviews on people's profiles and on servers, from [ReviewDB](https://reviewdb.mantikafasi.dev).

- Reviews on user profiles and in server menus.
- Write, vote on, delete and report reviews.
- Block people whose reviews you don't want to see, and hide warnings or timestamps.
- Notifications about new reviews of you.
- Sign in with Discord's own Authorize screen (the "identify" scope only: ReviewDB sees your
  username and avatar, not your messages or servers).

Credit: a port of Vencord's ReviewDB by mantikafasi and Vendicated (GPL-3.0).

### Round Corners

Undoes the redesign's squares.

- Servers, Home, Create and Discover round again; the selected server can stay round or use the
  classic selection shape.
- Send, emoji, media, gift and apps buttons as circles; the message box as a pill.
- The bottom bar and the You tab's floating bar as pills.
- Small things fully round: folders, channel rows, search bars, segmented controls.
- Each group of shapes has its own switch.

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

### Sharp Corners

Every corner in Discord sharp: buttons, the message box, the You bar, menus, cards, sheets, server
icons and pictures. Android only, because chat messages are drawn natively.

- "Circles too" also squares avatars, status dots and round buttons.
- Can't run together with Round Corners; it says so if both are on.

### Show Tag

Shows usernames next to display names in chat, including in replies. `Display Name (@username)`,
or just the username with a switch.

Credit: a port of Cynosphere's Show Tag for Vendetta.

### Staff Tags

Extra tags next to staff in chat, the member list and on profiles: OWNER, ADMIN, STAFF, MOD,
VC Mod, Chat Mod and WEBHOOK, worked out from the person's permissions in that server.

- Tap a tag in settings to hide it, rename it, give it a colour or a two-colour gradient, add an
  icon (Discord's own or your own SVG) or show the icon alone, and reset it.
- Optionally use the person's top role colour as the tag background.

Credit: a port of Staff Tags for Revenge by Fiery and シグマ siguma.

### Text Animation

Animates letters as you type and delete, with a smooth gliding cursor. Android only.

- Typing: letters fade in, slide up, unblur, pop or tilt, with the speed, slide distance and pop and tilt strength you choose.
- Deleting: letters fall away or turn to dust, or nothing.
- The cursor glides between positions, optionally with a stretchy trail.
- The message box only, or every text field (never password fields). Try it out in settings.

### Timezones

See someone's local time next to their messages.

- Set a timezone for anyone, by searching places or from a list of zones.
- Shows their time (and optionally their day) beside their message timestamps, in 12- or 24-hour time.
- Reads the shared timezone list other clients use, so people who've added themselves show up
  automatically. You can turn this off.
- Can also read Equicord's timezone list (off by default, read only).
- Set or change someone's zone from the ⋯ menu on their profile, or from the bottom of the message
  long-press menu (that one can be switched off).

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
| Pronouns | PronounDB (`pronoundb.org`) | The user IDs of people shown in chat, in batches, to look up their pronouns. On by default; can be turned off |
| Pocket Browser | Whatever sites you open, and your chosen search engine (DuckDuckGo by default) | What any browser sends: the page you ask for and what you type into it. Nothing from Discord |

## Building

```sh
bun install
./gradlew packageAllPlugins     # every plugin -> build/dist/<id>@<version>.zip
bun run serve --host <wifi-ip>  # serves build/dist to a phone on the same Wi-Fi
```

## License

GPL-3.0 (see `LICENSE`), except where a plugin says otherwise. Plugins built on other people's work
carry a `NOTICE.md` with the credits and licence details.
