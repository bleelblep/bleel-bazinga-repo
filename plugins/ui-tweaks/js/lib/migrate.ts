/**
 * Folds older settings into the current message-sheet shape (`hiddenSheetRows`,
 * `hiddenSheetGroups`, `hideSheetEmojiRow`, `sheetLayout`):
 *
 * - 0.1.x: `hideForwardRow` / `hideMentionRow` switches;
 * - 0.3.0 (rolled back in 0.3.1): per-menu `hiddenSheetItems` keyed `<menu>|<what>` and
 *   `sheetLayouts`. The message menu's rows, plugin sections and emoji row come back; other
 *   menus' entries are dropped, since only the message menu is hideable again;
 * - 0.2.x-0.3.1 numbered Discord's sections by position, which pointed at different sections
 *   on different messages: numbered switches and position-based layouts are dropped (0.3.2).
 *
 * Also folds 0.4.x's `doubleTapReply` switch into the per-author double-tap actions (0.5.0), and
 * 0.5.x's single `swipeShort` / `swipeLong` into the per-author swipe actions (0.6.0).
 *
 * Runs once the storage has loaded; old keys are cleared so it only happens once.
 */

import { SHEET_LAYOUT_VERSION } from './layout'
import { settings, update } from './state'

const MESSAGE_MENU = 'MessageLongPressActionSheet'

/** The old switch meant edit your own, reply to others'; the actions only change if still untouched. */
function migrateDoubleTap() {
	const s = settings()
	if (s.doubleTapReply !== true) return
	update({
		...(s.doubleTapOwn === 'stock' ? { doubleTapOwn: 'edit' } : {}),
		...(s.doubleTapOthers === 'stock' ? { doubleTapOthers: 'reply' } : {}),
		doubleTapReply: false,
	})
}

/** 0.5.x had one action per swipe stage for every author: it becomes both authors' action. */
function migrateSwipes() {
	const s = settings()
	const patch: Partial<typeof s> = {}
	if (s.swipeShort && s.swipeShort !== 'stock') {
		if (s.swipeShortOwn === 'stock') patch.swipeShortOwn = s.swipeShort
		if (s.swipeShortOthers === 'stock') patch.swipeShortOthers = s.swipeShort
	}
	if (s.swipeLong && s.swipeLong !== 'stock') {
		if (s.swipeLongOwn === 'stock') patch.swipeLongOwn = s.swipeLong
		if (s.swipeLongOthers === 'stock') patch.swipeLongOthers = s.swipeLong
	}
	if (s.swipeShort === undefined && s.swipeLong === undefined) return
	// Rule 6: set() merges, so the old keys are parked on 'stock' (read as "nothing to migrate").
	update({ ...patch, swipeShort: 'stock', swipeLong: 'stock' })
}

export function migrate() {
	migrateDoubleTap()
	migrateSwipes()
	const s = settings()
	const rows: Record<string, true> = {}
	const groups: Record<string, true | null> = {}
	let emojiRow = false
	let found = false

	if (s.hideForwardRow) rows.Forward = true
	if (s.hideMentionRow) rows.Mention = true
	if (s.hideForwardRow || s.hideMentionRow) found = true

	for (const [key, value] of Object.entries(s.hiddenSheetItems ?? {})) {
		// Tombstones (null) left by an earlier run don't count, or this would run on every start.
		if (value !== true) continue
		found = true
		if (!key.startsWith(`${MESSAGE_MENU}|`)) continue
		const what = key.slice(MESSAGE_MENU.length + 1)
		if (what === 'header') emojiRow = true
		// Numbered sections were positional (see below); only plugin sections carry over.
		else if (/^#\d+$/.test(what)) continue
		else if (what.startsWith('plugin:')) groups[what] = true
		else rows[what] = true
	}

	let sheetLayout: string | undefined
	// 0.3.0's layouts were positional too; the message menu's is rediscovered on the next long-press.
	if (s.sheetLayouts) found = true

	// 0.3.2: sections are keyed by content; numbers saved by position meant other sections.
	// Their layout is rediscovered (lib/layout.ts), and the numbered switches are cleared.
	const numbered = Object.entries(s.hiddenSheetGroups ?? {}).filter(([id, value]) => value === true && /^\d+$/.test(id))
	let positional = false
	try {
		positional = !!s.sheetLayout && JSON.parse(s.sheetLayout)?.v !== SHEET_LAYOUT_VERSION
	} catch {
		positional = !!s.sheetLayout
	}
	if (positional) {
		found = true
		sheetLayout = ''
		for (const [id] of numbered) groups[id] = null as any
		for (const key of Object.keys(groups)) if (/^\d+$/.test(key) && groups[key] === true) groups[key] = null as any
	}

	if (!found) return
	update({
		hiddenSheetRows: { ...s.hiddenSheetRows, ...rows },
		hiddenSheetGroups: { ...s.hiddenSheetGroups, ...groups },
		...(emojiRow ? { hideSheetEmojiRow: true } : {}),
		...(sheetLayout !== undefined ? { sheetLayout } : {}),
		hideForwardRow: false,
		hideMentionRow: false,
		hiddenSheetItems: Object.fromEntries(Object.keys(s.hiddenSheetItems ?? {}).map(key => [key, null])),
		sheetLayouts: '',
	})
}
