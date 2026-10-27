# Second Thoughts settings

The source of truth for how Second Thoughts' settings look and behave. If this doc and the code
disagree, fix one of them straight away so they match.

It follows the [Settings design guide](./settings-design-guide.md) and doesn't contradict it.

Covers Second Thoughts `0.3.10`: its settings pages in `plugins/second-thoughts/js/ui/` and the
hold dialog. AI Core's settings were documented here too; AI Core hasn't been ported to Valenced
yet, so they're summarised in §10 for when it is.

## 1) What the plugin should feel like

- **Free first.** The pattern checks are the product. They need no key, no network and no other
  plugin. Every page says this before it mentions AI.
- **Quiet.** The plugin does nothing visible on almost every message. The settings should feel the
  same: no nagging, and no pushing toward the optional AI half.
- **Honest about what leaves the phone.** It's the first thing a sensible person asks about a
  plugin that reads everything they type, so it gets its own page.

## 2) Pages

Routes are in `js/ui/routes.tsx`.

| Page | Route | What's on it |
| --- | --- | --- |
| Checks | `CHECKS_ROUTE` | Where to check, every check switch, and sensitivity |
| Try a draft | `TRY_ROUTE` | Test a message without sending it |
| What leaves the device | `PRIVACY_ROUTE` | What is and isn't sent |
| Debug | `DEBUG_ROUTE` | Developer tools, only in `DEBUG` builds |

The main page (`js/ui/pages/Settings.tsx`), from top to bottom:

1. A neutral card: "Patterns are free. Judgement is optional." It explains that credentials, keys
   and card numbers are matched on the phone with nothing sent, while anger, drunk-posting and
   oversharing need AI Core, and only after a free local check has flagged the draft.
2. A muted line: "Nothing is ever held silently. Every hold asks first, and doing nothing sends
   nothing."
3. The **Enabled** switch ("Turn the whole guard off without losing your settings"). When the AI
   checks are hushed, a row underneath says for how many minutes, and tapping it resumes them.
4. Rows for **Checks** (its sub-label summarises which checks are on), **Try a draft** and **What
   leaves the device**.
5. A **Developer** group with **Debug**, shown only when `DEBUG` is on
   ([coding rule 9](./coding-rules.md#9-errors-go-to-pluginreporterror-debug-code-sits-behind-debug)).

The card is **neutral, not yellow**. Second Thoughts stores and logs nothing, and keeping the yellow
warning style for real risk is what keeps it meaningful
([design guide §4](./settings-design-guide.md#4-context-cards-warning-or-neutral)).

## 3) AI Core is optional

Second Thoughts lists AI Core in its manifest as optional:
`"bleelblep.ai-core": { "version": ">=1 <3", "optional": true }`. This is the most important fact
about how the two fit together.

- `api.ai` is `undefined` whenever AI Core isn't installed, is turned off, or failed to start. All
  three are normal, not errors.
- `aiStatus()` in `js/lib/state.ts` returns `absent`, `unconfigured`, `exhausted` or `ready`.
  **Everything about the AI checks must be shown from this, not from a yes/no.** "Not installed",
  "no key set" and "daily limit used up" are three problems with three fixes. Lumping them together
  as "unavailable" leaves the user no way to fix it.
- The AI check switches stay **on** by default. When the status isn't `ready` they're shown
  disabled, with the reason in a muted line under the group. They're not hidden: a control that
  only appears after installing something else is worse than one that says plainly what it needs.

## 4) Wording rules

- Never call it an AI plugin. It's a pattern matcher with an optional second opinion, and the main
  card says that first.
- Never suggest the pattern checks send anything. They can't, and saying so plainly is the whole
  reason to trust the plugin.
- Mention the reaching-out exception wherever the checks are explained. A draft that reads as the
  writer reaching out about their own wellbeing passes before every other check, and is never held
  or sent anywhere. This is fixed behaviour, not a setting, and is never presented as one.

## 5) Each page

### 5.1 Checks (`Checks.tsx`)

In this order:

1. **Where:** `Skip DMs`. Never check messages in DMs and group DMs, not even for credentials.
   Servers are still checked.
2. **Patterns — free, nothing else needed:** `Credentials`, `Personal details` (off by default,
   because people usually share these on purpose) and `Personal details in DMs too`, which is
   disabled unless `Personal details` is on.
3. **Judgement — needs AI Core:** `Hostile`, `Drunk or half asleep` and `Oversharing`. Disabled
   unless AI Core is `ready`.
4. A muted line explaining the current AI Core status.
5. **Sensitivity**, a slider from 1 to 8 in its own row. The row label shows the value
   (`Sensitivity — 3`), with an explanation above the slider: how suspicious a draft must look on the
   phone before it's worth asking the AI. Lower catches more and costs more.

The pattern and AI groups are deliberately unequal: the free checks come first.

### 5.2 Try a draft (`TryDraft.tsx`)

A message box in a `FieldGroup`, plus a "Try one of these" group of examples to tap.

It must use the same `scanPatterns`, `scoreDraft` and `isReachingOut` as the send path, and never
re-implement them.

The result, checked in this order:

| Result | When |
| --- | --- |
| **Held immediately** | The pattern checks catch it, as currently set. |
| **Would be held, but the switch is off** | Only caught with every check on. The scan runs a second time with everything enabled and names the switch to turn on. Without this, a correctly detected address looked undetectable, which cost real debugging time. |
| **Always passes** | It reads as reaching out. |
| **Sends straight out** | AI Core isn't `ready` (says which status), no AI checks are on, or the draft is shorter than `minLength`. |
| **Would cost one AI call** or **Sends straight out, free** | The local score against the threshold, with the signals that fired. |

Drafts are always scored as if you were in a server, and the page says so.

### 5.3 What leaves the device (`Privacy.tsx`)

Information only, no switches. Two groups:

- **Never leaves this device:** anything the patterns catch, every message that passes, and
  anything that reads as reaching out.
- **Sent, when it happens:** one flagged draft on its own (only the text you typed, nothing else),
  and **Where it goes**, which reads `aiStatus()` so it can say "Nowhere" when AI Core isn't there.

### 5.4 Debug (`Debug.tsx`, `DEBUG` builds only)

- **Debug logging** switch (gate scores, signals and verdicts to logcat under `ReactNativeJS`).
- **Send hook:** whether the `instead` hook actually installed, and on which module id.
- **AI Core:** the full `aiStatus()` line.
- **Draft restore:** which of `saveDraft`, `dispatch` or `clipboard` worked last time.

These show **what happened, not what was attempted**
([coding rule 3](./coding-rules.md#the-export-is-usually-on-default)). A page saying "patched" while
nothing was patched is how this repository lost six releases on Screenshot Redactor.

## 6) The hold dialog (`HoldAlert.tsx`)

- The buttons are **Let me edit**, **Send anyway**, and, only for AI holds, **Send, and hush for
  an hour**.
- **Let me edit** is the default, and tapping outside the dialog does the same. The safe result must
  be the one you get by doing nothing.
- `onDismiss` fires for button presses as well as tapping outside, so the dialog tracks whether a
  button was chosen. Otherwise "Send anyway" would also restore the draft.
- **Hush** is offered only for AI holds, never for credentials or personal details. Nobody ever
  wants to silence the credential check.

## 7) Reading settings

- Always read storage with the defaults merged in: `{ ...DEFAULTS, ...(storage?.use() ?? {}) }`.
- Never read `valenced.*` at module scope
  ([coding rule 1](./coding-rules.md#1-import-from-valenced-and-never-use-those-imports-at-module-scope)).
- Sub-pages don't get the `api` prop, so they use `getStorage()` from `lib/state`.

## 8) Known quirks

- **The message box is already empty when `sendMessage` is called.** Discord clears its chat input
  in its own submit handler, so by the time a message is held, the text is gone from the screen.
  `lib/draft.ts` puts it back through three routes, in order, and records which one worked. The
  clipboard route always works, so text is never lost. If Debug shows `clipboard`, the first two
  routes missed on that Discord build.
- **One `instead` per method, across the repository.** Second Thoughts owns the one on
  `sendMessage`. Anything else here that needs that method must use `before` and `after`
  ([coding rule 2](./coding-rules.md#2-the-patchers-hook-contracts-differ-from-classic-revenge)).

## 9) Where things live

| What | File |
| --- | --- |
| Pattern checks | `plugins/second-thoughts/js/lib/secrets.ts` |
| Local gate (the score) | `plugins/second-thoughts/js/lib/gate.ts` |
| Typo detection | `plugins/second-thoughts/js/lib/typos.ts` |
| Deciding, and the AI prompt | `plugins/second-thoughts/js/lib/judge.ts` |
| Restoring the draft | `plugins/second-thoughts/js/lib/draft.ts` |
| Catching the send | `plugins/second-thoughts/js/patches/sendMessage.ts` |
| Hold dialog | `plugins/second-thoughts/js/ui/components/HoldAlert.tsx` |
| AI Core status | `plugins/second-thoughts/js/lib/state.ts` (`aiStatus()`) |

## 10) AI Core (not ported yet)

These are AI Core's settings, kept from the Revenge version for when it's ported. Check them
against its code at that point.

- **Feel:** infrastructure. It does nothing on its own, and its main page says so in the first card.
- **Main page:** a neutral card ("does nothing on its own"), a muted note on how the key is stored,
  the page rows, then a Developer group.
- **Provider:** key, base URL, model and timeout.
- **Usage and limits:** a daily cap slider (0 to 200, steps of 5; 0 turns it off), today's calls and
  tokens, a **Reset the count** row that asks for confirmation, and calls per plugin, showing only
  plugins with a count above zero.
- **Debug:** logging, a connection test and the settled configuration.
- **Storage:** `usageByPlugin` is a collection that items get removed from. When the day rolls over,
  it writes an explicit `0` for every known plugin instead of leaving them out, because a merge
  can't delete a key ([coding rule 6](./coding-rules.md#6-jsonstorageset-merges-so-it-can-never-delete-a-key)).
  Readers only show counts above zero.
