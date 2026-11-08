/** The settings. Every tweak starts off: a tweaks plugin must not change anything until asked. */

/** What a gesture does (lib/actions.ts). */
export type SwipeAction =
	| 'stock'
	| 'reply'
	| 'edit'
	| 'react'
	| 'react2'
	| 'copy'
	| 'link'
	| 'userId'
	| 'roleColor'
	| 'quote'
	| 'mention'
	| 'pin'
	| 'forward'
	| 'thread'
	| 'profile'
	| 'menu'
	| 'unread'
	| 'delete'
	| 'nothing'

/** A button in the "+" menu by the message box (patches/mediaButtons.ts). */
export type MediaButton = 'apps' | 'thread' | 'polls' | 'files' | 'photos'

export interface UITweaksStorage {
	/** An "Edit menu" row at the end of the message long-press sheet (patches/sheetEdit.tsx). */
	sheetEditRow: boolean
	/** Hide the emoji row at the top of the message long-press sheet. */
	hideSheetEmojiRow: boolean
	/** Long-press sheet rows hidden by label; `null` is an unhidden row's tombstone. */
	hiddenSheetRows: Record<string, true | null>
	/** Long-press sheet sections hidden by position ("1" = top) or `plugin:` key; `null` is a tombstone. */
	hiddenSheetGroups: Record<string, true | null>
	/** Discord settings sections hidden by id (see lib/layout.ts); `null` is a tombstone. */
	hiddenSettingsSections: Record<string, true | null>
	/** Discord settings items hidden by key (e.g. "APP_ICONS"); `null` is a tombstone. */
	hiddenSettingsItems: Record<string, true | null>
	/**
	 * What the sheet and the settings page looked like when last seen, as JSON strings (a string,
	 * not arrays, so jsonStorage's merge can't splice old and new lists together). Listed on the
	 * settings pages so there is something to hide before the user has seen everything this session.
	 */
	sheetLayout: string
	settingsLayout: string
	/**
	 * The long-press sheet's order, as JSON `{ sections: string[], rows: string[] }` (a string for the
	 * same reason as sheetLayout). Section ids as in hiddenSheetGroups, rows by rowKey. Only relative
	 * order counts: rows are compared with rows of their own section, sections with each other, and
	 * anything not listed keeps Discord's place.
	 */
	sheetOrder: string
	/** Discord settings' order, as JSON `{ sections: string[], items: string[] }`, the same way as sheetOrder. */
	settingsOrder: string
	/** A floating Edit button on Discord's settings page, to hide, show and move items there. */
	settingsEditButton: boolean

	/** Expression picker tabs. */
	hidePickerGifs: boolean
	hidePickerStickers: boolean
	/** Keep the picker open after sending a GIF (patches/gifPicker.ts). */
	keepGifPickerOpen: boolean

	/** Hide the quick emoji/actions bar a message tap shows. */
	hideReactionBar: boolean
	/** What double-tapping your own message does (patches/doubleTap.tsx; `stock` = Discord's double-tap reaction). */
	doubleTapOwn: SwipeAction
	/** What double-tapping someone else's message does. */
	doubleTapOthers: SwipeAction
	/** "+" menu buttons hidden by id; `false`/`null` means shown (coding rule 6). */
	hiddenMediaButtons: Partial<Record<MediaButton, boolean | null>>
	/** Items of the + button's long-press menu hidden by label; `null` is a tombstone (patches/plusMenu.tsx). */
	hiddenPlusMenuItems: Record<string, true | null>
	/** The labels seen in that menu, as a JSON array, for its settings page. */
	plusMenuLayout: string
	/** Hide Quests surfaces: quest bar, You tab button, embeds, activity button, settings row (patches/quests.ts). */
	hideQuests: boolean
	/** Hide the Message Requests section in the DM list. */
	hideMessageRequests: boolean

	/** What a short swipe does (patches/swipe.ts; `stock` = Discord's reply), per author. */
	swipeShortOwn: SwipeAction
	swipeShortOthers: SwipeAction
	/** What the further swipe does (`stock` = Discord's edit on your messages, reply on others'), per author. */
	swipeLongOwn: SwipeAction
	swipeLongOthers: SwipeAction
	/** Give every message the further-swipe stage, not just your own. */
	swipeAllMessages: boolean
	/** The emoji the React action uses; empty = your Discord double-tap emoji. */
	swipeEmoji: string
	/** The emoji the second React action uses; empty = your Discord double-tap emoji. */
	swipeEmoji2: string

	/** Older shapes, folded into the current ones on start (lib/migrate.ts). */
	/** 0.1.x-0.4.x's double-tap switch: reply on others' messages, edit your own. */
	doubleTapReply?: boolean
	/** 0.4.x-0.5.x's swipes, one setting for every author (split per author in 0.6.0). */
	swipeShort?: SwipeAction
	swipeLong?: SwipeAction
	hideForwardRow?: boolean
	hideMentionRow?: boolean
	/** 0.3.0's per-menu shapes (rolled back in 0.3.1). */
	hiddenSheetItems?: Record<string, true | null>
	sheetLayouts?: string
}

// Also the fallback for every read: `load: true` starts the storage read without awaiting it.
export const DEFAULTS: UITweaksStorage = {
	// The one tweak that starts on: it is how the menu is edited, and it only adds a row.
	sheetEditRow: true,
	hideSheetEmojiRow: false,
	hiddenSheetRows: {},
	hiddenSheetGroups: {},
	hiddenSettingsSections: {},
	hiddenSettingsItems: {},
	sheetLayout: '',
	sheetOrder: '',
	settingsOrder: '',
	settingsEditButton: true,
	settingsLayout: '',
	hidePickerGifs: false,
	hidePickerStickers: false,
	keepGifPickerOpen: false,
	hideReactionBar: false,
	doubleTapOwn: 'stock',
	doubleTapOthers: 'stock',
	hideMessageRequests: false,
	hideQuests: false,
	hiddenMediaButtons: {},
	hiddenPlusMenuItems: {},
	plusMenuLayout: '',
	swipeShortOwn: 'stock',
	swipeShortOthers: 'stock',
	swipeLongOwn: 'stock',
	swipeLongOthers: 'stock',
	swipeAllMessages: false,
	swipeEmoji: '',
	swipeEmoji2: '',
}
