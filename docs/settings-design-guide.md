# Settings design guide

How every plugin's settings should look and behave, so they feel like one family instead of
unrelated tools. Use it whenever you build or change a settings page. It covers what to do and
why.

Code comments cite these sections by number ("settings design guide §3.6"). Don't renumber them;
add new sections at the end of their part.

Some reference examples are in plugins that haven't been ported to Valenced yet (Ghost Log,
ReviewDB, Hide Servers, AI Core). Their code is in
[bleelblep/revenge-next-plugins](https://github.com/bleelblep/revenge-next-plugins).

---

## 1) Principles

### 1.1 Useful, not decorative

People open settings to change something, check a status or run one action, then leave.

- Build pages from `TableRowGroup` with rows, switches and radio groups.
- Avoid custom decorative layouts unless they fix a real usability problem.

### 1.2 Calm and plain

Plugins often touch risky or confusing things: message logging, side effects of patches, platform
limits. Write plainly and without drama.

- Labels are short and say what the control does.
- Sub-labels explain the effect, the limits and the scope.
- Warn clearly when the risk is real, and only then.

### 1.3 Easy to scan on a phone

Everything is read on a phone, in a narrow column.

- Clear boundaries between groups.
- Predictable spacing.
- Advanced and debug tools kept apart from normal controls.

---

## 2) Page structure

Pick one of these two layouts per plugin.

## 2.1 One page (small plugins)

For a plugin with a few low-risk settings.

1. One or more `TableRowGroup`s.
2. An optional short notice row or card.
3. No index page.

Example in this repo: Hide Call Buttons.

## 2.2 Index page with sub-pages (default for medium and large plugins)

For a plugin with several areas: behaviour, a log or history, look, backup, debug, licence.

The main page is an index, not a page holding every control. In order:

1. A context card (a warning, or a neutral note).
2. One muted sentence on scope or limits.
3. The main data page (log, history) in its own group, if the plugin has one.
4. Rows leading to each settings page.
5. Developer and Debug in their own group, if present.

Examples in this repo: Catch Up, TL;DR and Second Thoughts. The original reference is Ghost Log
Native Beta.

---

## 3) Visual rules

## 3.1 Spacing

- Use `<Stack spacing={24}>` between blocks on a page with several blocks.
- Use `useBottomPadding()` (`shared/ui/safeArea.ts`) on scrolling pages, so the gesture bar doesn't
  cover the last rows.
- Let `Page` handle the side padding. Don't add extra wrappers unless you need them.

Why: the same rhythm on every plugin, and no cramped or mismatched insets.

## 3.2 Which components to use

In order of preference:

1. `TableRowGroup`
2. `TableRow`, `TableSwitchRow`, `TableRadioGroup`
3. `Card`, only for context blocks (the intro, warning and notice cards in §4)

Text fields, sliders and steppers are **not** cards: they go inside a row (§3.6).

Why: rows already match Discord's and Valenced's own settings, so plugins don't drift from them.

## 3.3 Wording

- **Labels:** a direct action or a noun (`Backup location`, `Toast when caught`).
- **Sub-labels:** one line on the effect or the limit.
- **Explanations:** muted text (`text-muted`, a small variant).
- Avoid jargon, unless how the plugin behaves depends on it.

Why: people should understand the effect without reading the code or the docs.

## 3.4 Icons

- Use the `rowIcon(...)` helper (`shared/ui/icon.tsx`) for every row's leading icon.
- Match icons to meaning: a lock for security, a bin for deleting, a bug for debug.
- Give fallback names where an icon's name differs between Discord builds. `rowIcon` takes several
  names and tries each one.

Why: icons that always render, and that help people scan.

## 3.5 Colour follows the user's theme

Discord has Ash, Dark, Onyx and Light themes, and people add custom themes on top. A hard-coded hex
colour looks right on exactly one of them. Anything a plugin draws itself (a custom button, a
header, a floating control, a native dialog) must take its colours from Discord's theme at runtime.

**In JS**, prefer components that already follow the theme: Design `Text` with a `color` token,
`TableRow`, `Card`. Use `text-default` and `text-muted`; never `text-normal`, which renders black on
mobile.

When a plain React Native `View` or `Text` needs a colour, resolve a token with a `token()` helper
(each plugin keeps its own copy in `js/ui/theme.ts`; none of the plugins in this repo needs one
yet, and the reference copy is Hide Servers'):

```ts
token('CONTROL_SECONDARY_BACKGROUND_DEFAULT', '#2b2f36') // token name, dark-theme fallback
```

- It reads `valenced.discord.common.tokens.Tokens` (`RawColor` and `SemanticColor`) and resolves
  semantic names through `ThemeStore`'s current theme.
- Call it while rendering, never at module scope ([coding rule 1](./coding-rules.md#1-import-from-valenced-and-never-use-those-imports-at-module-scope)).
- The fallback is the hex it replaced, so a renamed token costs one wrong shade, not an invisible
  control.
- Before using a new token name, check it exists: search the APK's `index.android.bundle` for it.

Useful tokens:

| Token | For |
| --- | --- |
| `TEXT_DEFAULT`, `TEXT_MUTED` | Text |
| `BORDER_SUBTLE` | Borders |
| `BACKGROUND_MOD_SUBTLE` | Light backgrounds |
| `CONTROL_SECONDARY_BACKGROUND_DEFAULT`, `CONTROL_SECONDARY_TEXT_DEFAULT` | Neutral buttons |
| `CONTROL_CRITICAL_PRIMARY_BACKGROUND_DEFAULT`, `CONTROL_CRITICAL_PRIMARY_TEXT_DEFAULT` | Destructive buttons |
| `BACKGROUND_BRAND` | Brand colour |

**In Kotlin** (native plugins, none in this repo yet), native views such as dialogs and custom
toasts read the same theme from `com.discord.theme.ThemeManager.INSTANCE.getEffectiveTheme()`, by
reflection through `activity.classLoader`.

- The plugin isn't compiled against Discord, so if reflection fails it must fall back to the dark
  palette, not throw.
- The getters are the JS token names in camel case: `getBackgroundSurfaceHigh`,
  `getMobileTextHeadingPrimary`, `getTextMuted`, `getInputBackgroundDefault`,
  `getInputBorderActive`, `getControlPrimaryBackgroundDefault`,
  `getControlCriticalPrimaryBackgroundDefault`, `getControlSecondaryTextDefault` and so on. The full
  list is `DiscordThemeObject` in a jadx decompile.
- The font is Discord's gg sans:
  `Typeface.createFromAsset(activity.assets, "fonts/ggsans-<Normal|Medium|Semibold|Bold|ExtraBold>.ttf")`,
  with the system font as fallback.

The reference native dialog is `discordDialog` in AI Core's `AiCore.kt`: a centred heading and
body, a filled rounded input, and full-width pill buttons with the action above Cancel (red when
destructive). Copy its shape for any native dialog instead of using `AlertDialog`, whose Material
style looks out of place in Discord.

Keep a dialog native when it protects something. A confirmation that guards other plugins (raising
AI Core's spending cap, removing it) must not be drawn in JS, because any plugin can draw, or skip,
a JS dialog.

**Fixed colours that are fine:**

- Colours the user picked or Discord assigns (role and tag colours).
- White text or icons on a strong colour (badges, the red armed switch).
- Faint washes of a warning colour that read on every theme (the yellow warning card in §4.1,
  message highlights).

A fixed dark-grey background or a fixed light-grey text colour is never fine.

## 3.6 Text fields and sliders sit in a row

A text field or slider goes inside a real settings row, so it has the same background, corners and
spacing as the rows around it. Use `FieldGroup` or `FieldRow` (`shared/ui/fieldGroup.tsx`,
re-exported from each plugin's `js/ui/fieldGroup.tsx`):

```tsx
<FieldGroup
	title="Encryption"                       // optional group heading
	label="Passphrase"                       // the row's label: names the field
	description="Backups are encrypted with it on this phone…"   // muted text, inside the row
>
	<TextInput placeholder="Choose a passphrase" value={…} onChange={…} />
</FieldGroup>
```

- The field is passed as the row's `subLabel` (typed `ReactNode`), so the row paints its background.
- Don't also give the `TextInput` a `label` or `description`; `FieldGroup` has them. Error text
  stays on the `TextInput` (`status` and `errorMessage`), and `trailingText`, `isClearable` and so on
  are unchanged.
- Several related fields share one group: `<TableRowGroup title="Endpoint">` with a `FieldRow` for
  each (same props as `FieldGroup`, without `title`).
- Buttons or rows that act on the field (Add, Generate, Import) go in a group straight after it.
- **Two exceptions, left bare:** a search or filter box at the top of a list, and a field inside an
  alert dialog (`AlertModal`'s `extraContent`), which already has the dialog's background.

**Sliders** go in the same kind of row. The row's label names the setting and shows its current
value. The explanation is muted text above the slider, inside the row. Step labels, if any, go
underneath.

```tsx
<TableRowGroup>
	<FieldRow label={`Torch size — ${size} dp`}>
		<Text color="text-muted" variant="text-sm/normal">How far the torch's light reaches.</Text>
		<Slider step={10} value={size} minimumValue={50} maximumValue={260} onValueChange={…} />
	</FieldRow>
</TableRowGroup>
```

- The value goes in the row label, not the group title. A group title is only for a heading shared
  by several rows ("Adjust" over Dim and Blur).
- Related sliders share one group, with one `FieldRow` each.
- If the steps have names (Off · Subtle · Normal · Strong, or Rare · Sometimes · Often), show them as
  a line of `text-xs` labels under the slider: the selected one `text-default` semibold, the rest
  `text-muted`. Prefer named steps when the raw number means nothing to people.
- A slider that replaces an on/off switch puts **Off** at its first step and keeps the old
  true/false setting behind it, so saved settings and other plugins that read it still work.
- Never wrap a slider in a bare `View` or a `Card`. Catch Up's message-count slider follows this.

Why (confirmed on the phone for text fields on 2026-09-30 and for sliders on 2026-10-06):

- A plain `View` inside a `TableRowGroup` has no background at all, because the group paints nothing
  and each `TableRow` paints itself.
- A `Card` matched on Discord's own themes but turned a different shade under custom themes, which
  recolour rows and cards with different tokens.
- A row is the only background that always matches.

## 3.7 Use Discord's own component before drawing one

Anything a plugin shows outside a settings list (a review row, a composer bar, a profile card, an
avatar, a tag) uses the component Discord itself uses for that job, if there is one. Only draw a
`View` by hand when Discord has no JS component for it (message reactions, for example, are drawn
natively, so there's none).

Besides the Design namespace (`Button`, `IconButton`, `TextInput`, `TextArea`, `ActionSheet`,
`AlertModal`, …), these are useful:

| Job | Module path (Discord 348.5) | Props |
| --- | --- | --- |
| Avatar | `design/void/Avatar/native/Avatar.tsx` (`default`, `AvatarSizes`) | `user` or `source`, `size` (an `AvatarSizes` value), `guildId`, `animate` |
| Overlapping avatars | `design/components/Pile/native/AvatarPile.native.tsx` (`AvatarPile`) | `size`, `totalCount`, `names`, avatars as children |
| APP / SYSTEM tag | `modules/applications/native/BotTag.tsx` (`default`, `Types`) | `type` (a `Types` value), `verified` |
| Empty list | `design/void/EmptyState/native/EmptyState.tsx` | `title`, `body`, `style` |

Rules:

- **Read the props; don't guess them.** Find the module's path in the APK's `index.android.bundle`
  and disassemble it with `hermes-dec` (`HBCReader` and `parse_hbc_bytecode`). The component reads
  its props as `GetById` on parameter 1, and the module's exports are the `PutByIdStrict` names.
  Props aren't typed, so a wrong guess fails silently: a blank or a crash.
- **Look the module up while rendering, never at module scope**
  ([coding rule 1](./coding-rules.md#1-import-from-valenced-and-never-use-those-imports-at-module-scope)),
  with the imported-path finder (`discord.utils.modules.finders`, wrapped by `shared/modules.ts`).
  It only finds modules Discord has already loaded.
- **Always keep a hand-drawn version as the fallback**, and wrap Discord's component in an error
  boundary that renders it. Then a missing module, a missing enum value or a crash only costs the
  look, never the screen. The reference is ReviewDB's `js/ui/native.tsx` (`Native`, `UserAvatar`,
  `ReviewerPile`, `Tag`, `Empty`). Copy its shape.
- Icons for `IconButton` are asset ids (`valenced.assets.getAssetIdByName`). Use the fallback when
  one comes back `undefined`.

Why: requested for ReviewDB 0.1.8 (2026-10-02). Discord's own components get the theme, avatar
decorations, accessibility labels and future redesigns for free. A hand-drawn copy falls behind the
first time Discord changes its look.

## 3.8 Destructive rows: red text and a red icon

A row that deletes, clears, removes, resets saved data or signs out is a danger row. Give it
`variant="danger"`, and use `dangerIcon(...)` for its icon (`shared/ui/icon.tsx`, re-exported from
each plugin's `js/ui/icon.tsx`), never `rowIcon(...)`.

```tsx
<TableRow label="Delete review" variant="danger" icon={dangerIcon('TrashIcon')} onPress={confirmDelete} />
```

- `variant="danger"` only turns the row's label and sub-label red (`text-feedback-critical`). It
  doesn't change the background and never reaches the icon. Discord colours the icon separately:
  `icon={<TableRow.Icon IconComponent={X} variant="danger" />}` (348.5, for example
  ModeratorActionRow). A `rowIcon` on a danger row renders white next to red text.
- `dangerIcon` passes both `source` and `IconComponent` and lets `TableRow.Icon` use the component.
  That matters for size: a `source` icon is sized by variant (MEDIUM for `default`, but the smaller
  REFRESH_SMALL_16 for `danger`), while an `IconComponent` always gets the normal `md` size. No size
  is set anywhere in `shared/ui/icon.tsx`; Discord picks it.
- The action still asks first (§9, item 6): Discord's alert with a `destructive` button.
- Not danger rows: switches that just turn something off ("Remove tracking from links"),
  renumbering or refresh actions that lose nothing, and resets on a Developer or Debug page.

Why: ReviewDB's Report and Delete rows showed white icons next to red labels (2026-10-02). That was
reported as a bug, and an audit found the same on every plugin's destructive rows. The first red
icons then came out a third smaller than normal ones (2026-10-03), for the `source` reason above.

## 3.9 Every plugin has a changelog

Every plugin shows its changelog in the same place, with `shared/changelog.tsx`:

- A clock icon at the top right of the plugin's main settings page opens a page listing every
  version, newest first, with the installed one marked.
- After an update, the first visit to the settings page shows a "What's new" dialog with what
  changed since the last version the user saw. Nothing pops up when the app starts.

To use it:

1. Keep the entries in `js/changelog.ts`, newest first. Every version users got has an entry.
2. Call `setupChangelog(api, CHANGELOG)` in `start()`.
3. Call `useChangelog()` at the top of the main settings page. A page that sets its own
   `headerRight` renders `<ChangelogButton />` there instead and calls
   `useChangelog({ header: false })`.
4. The plugin needs `jsonStorage` (an empty default is enough): the last-seen version is stored
   there under `changelogSeenVersion`.

Write entries for users, not developers: a short title, and changes that say what's different for
them.

## 3.10 Settings that need a reload use the stock prompt

When a change only takes effect after a reload, call `plugin.requireReload()`. Valenced then shows
its own reload prompt. Don't build a custom alert for it. Catch Up does this when it's started late
or stopped.

---

## 4) Context cards: warning or neutral

Only add a context card when the page needs framing.

## 4.1 Warning card (yellow tint)

For real risks, such as message loggers. It says:

- that this is a warning, in the title
- why the risk exists
- what is stored, and who can see it

## 4.2 Neutral notice card

For behaviour that isn't dangerous but is easy to misread. It says:

- what the limit is
- what is and isn't covered

Why two kinds: the warning style only keeps its meaning if it's rare. Overusing it wears down
trust.

---

## 5) Where controls go

## 5.1 Normal pages

Only the controls people use regularly:

- behaviour switches
- notifications
- look and style
- browsing data and history
- backup and restore

## 5.2 Developer and Debug page

Everything for diagnosing or testing:

- generating test data
- internal paths and status
- self-test switches
- experimental or temporary tools

Put it on its own page, in its own group on the main page, behind `DEBUG`
([coding rule 9](./coding-rules.md#9-errors-go-to-pluginreporterror-debug-code-sits-behind-debug)),
so it never ships in a normal build.

Why: maintenance tools don't belong in the everyday settings.

---

## 6) Interaction

- Destructive actions ask for confirmation first (`Clear log`, resets).
- Important actions that take time show a toast on success or failure, saying what happened.
- A disabled action says why in its sub-label.
- If Android limits the choices (alerts can only have a few buttons), use a picker or a sequence of
  pop-ups instead.

Why: fewer accidents, more trust, and behaviour people can follow on the phone.

---

## 7) Data and rendering

- Read storage with the defaults merged in, on every render:
  `{ ...DEFAULTS, ...(storage?.use() ?? {}) }`. Storage can be `undefined` while it loads
  ([coding rule 7](./coding-rules.md#7-use-the-official-types-not-guesses)).
- Never read `valenced.*` at module scope
  ([coding rule 1](./coding-rules.md#1-import-from-valenced-and-never-use-those-imports-at-module-scope)).
- Sub-pages that don't get the `api` prop use the plugin's shared storage handle (`getStorage()`).
- Keep each page to one job. Don't put unrelated controls on the same screen.

Why: no crashes from load timing, and pages that hold up while settings are still loading.

---

## 8) Names and navigation

- Page titles are plain nouns: `Settings`, `Backup`, `Visual style`, `Debug`, `Licence`.
- A row on the main page uses the same words as the title of the page it opens.
- Log and history pages are full pages of their own, not actions tucked away in a menu.
- The manifest `description` is one sentence of about 60 to 100 characters, saying what the plugin
  does. Features and details belong in the settings and the README.

Why: predictable navigation is easier to follow across every plugin.

---

## 9) Checklist for every plugin

Before shipping a plugin's settings, check:

1. The layout (one page, or index and sub-pages) fits how much the plugin does.
2. A multi-page plugin's main page has context, then a scope note, then the main data page, then
   the settings rows.
3. Debug tools are kept apart from user settings.
4. Warnings and notes match the real risk and what's actually stored.
5. Spacing and bottom padding match the rest of the repository.
6. Destructive actions ask for confirmation.
7. Actions that take time show clear toasts.
8. Labels and sub-labels explain the behaviour plainly.
9. Nothing the plugin draws itself uses a fixed background or text colour; it looks right on Light
   as well as Dark (§3.5).
10. Every text field (except search boxes and fields in dialogs) and every slider sits in a
    `FieldGroup` or `FieldRow`, never a bare `View` or a `Card` (§3.6).
11. Avatars, tags, inputs and empty states use Discord's own component, with a hand-drawn fallback
    (§3.7).
12. Every destructive row has `variant="danger"` and a `dangerIcon(...)` icon (§3.8).
13. The plugin has a changelog with an entry for this version (§3.9).
14. Settings that need a reload use `plugin.requireReload()` (§3.10).
15. The manifest description is one short sentence (§8).

---

## 10) Plugin-specific settings docs

This guide applies to every plugin in this repository. A plugin can have its own settings doc with
stricter rules, such as [Second Thoughts settings](./second-thoughts-settings.md). Those docs can
add to this guide, but they must not contradict it unless the exception is written down on purpose.
