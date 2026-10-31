/**
 * Every square the plugin knows how to round, each behind its own setting. A target is a list of
 * component module paths plus the rule for their views (lib/rounder.ts). Adding a square = one
 * entry here. Paths from the 350.4 bundle; the server-bar and You-bar ones date from 349.5 and
 * survived 350.x.
 *
 * Server icons are the exception: Discord's `GuildIcon` (modules/guild/native/GuildIcon.tsx) is a
 * size table where every size's corner is size / 3 (48 dp -> 16; read from the 350.2 bundle), and
 * it gets a `selected` prop. So the rule there depends on the setting: classic = a circle unless
 * selected (Discord's own rounded square stays for the selected one, as pre-redesign Discord did),
 * round = always a circle. The selection frame behind it is `GuildsBarAnimatedItemWrapper`, which
 * still has its pre-redesign `circle` prop; patches/selectionFrame.ts sets it.
 */

import { createElement } from 'react'
import { View } from 'react-native'
import { hookRender } from './hook'
import { type Rule, rules } from './rounder'
import { overrideToken, roundCorners, stockCorners } from './tokens'
import { type SquaresStorage, settings } from './settings'

export interface Target {
	id: keyof SquaresStorage
	label: string
	description: string
	components: Array<{ path: string; export?: string }>
	rule: Rule
	/** When the target's hook should run; default = its own setting. */
	gate?: (s: SquaresStorage) => boolean
	/** Extra facts about this render for the rule, read from the output tree (merged into the props it sees). */
	classify?: (tree: any, props: any) => Record<string, unknown> | undefined
	/** Reach into unexported inner components too (wraps them). Off unless a target needs it. */
	deep?: boolean
	/** Extra patches beyond render hooks (token overrides); returns a cleanup. Gated by the setting inside. */
	install?: () => () => void
}

const YOU_BAR = 'modules/main_tabs_v2/native/you_bar/'
const CHAT = 'modules/chat_input/native/'

export const TARGETS: Target[] = [
	{
		id: 'serverIcons',
		label: 'Server icons',
		description: 'Every server picture and initials icon, in the server list and wherever else one shows.',
		components: [{ path: 'modules/guild/native/GuildIcon.tsx' }],
		rule: ({ width, height, radius }, props) => {
			if (width === undefined || height === undefined || Math.abs(width - height) >= 1) return undefined
			if (settings().selected === 'classic' && props?.selected) return undefined
			return radius < width / 2 ? width / 2 : undefined
		},
	},
	{
		id: 'serverBarButtons',
		label: 'Server bar buttons',
		description: 'Home, Create and Discover, round like the servers next to them.',
		components: [
			{ path: 'modules/guilds_bar/native/GuildsBarDirectMessage.tsx' },
			{ path: 'modules/guilds_bar/native/GuildsBarCreateJoinButton.tsx' },
			{ path: 'modules/guilds_bar/native/GuildsBarMessages.tsx' },
		],
		rule: rules.circleIfSquare(56),
	},
	{
		id: 'youBar',
		label: 'You bar',
		description: 'The bar at the bottom becomes a pill, its buttons circles, including the taller Quests / Shop / Settings bar it turns into on the You tab.',
		// The bar and its backgrounds read the YOU_BAR_BORDER_RADIUS token (28 without experiments, 16
		// under the redesign's), so that is overridden (lib/tokens.ts). The buttons' corner is in
		// YouBarButtonContainer's style with no size, so it is made fully round rather than measured.
		components: [
			...['YouBar', 'YouBarButton', 'YouBarNotificationsButton', 'YouBarICYMIButton', 'YouBarAvatar'].map(name => ({ path: `${YOU_BAR}${name}.tsx` })),
			{ path: `${YOU_BAR}YouBarButton.tsx`, export: 'YouBarButtonContainer' },
			{ path: `${YOU_BAR}YouBarButton.tsx`, export: 'YouBarButtonIcon' },
		],
		rule: rules.fullRoundIf(8),
		install: () => {
			// 9999, not 28: on the You tab the bar grows into the taller Quests/Shop/Settings bar (same
			// token), where 28 is only a rounded rectangle. React Native clamps 9999 to a pill at any height.
			const token = overrideToken('YOU_BAR_BORDER_RADIUS', () => settings().youBar, () => 9999)
			// YouBarBackground still drew its own shape beside the avatar on 352.6 (2026-10-28): a square
			// top-left corner and a faint circle cut-out, out of line with the pill. With it not drawn the
			// bar looked right on the phone (found by accident: a DevTools capture hook returned nothing).
			// Hidden, not removed: it has to keep rendering. Discord loads its MaskedView and
			// LinearGradient modules only when something first draws them (YouBarMaskedBackground does),
			// and other plugins look those up at startup. Returning null left them unloaded and Server
			// Drawer threw "native carousel mask is unavailable" (1.3.6 and 1.3.7).
			const background = hookRender(`${YOU_BAR}YouBarBackground.tsx`, 'default', tree =>
				settings().youBar && tree ? createElement(View, { style: { display: 'none' } }, tree) : tree,
			)
			return () => {
				background()
				token()
			}
		},
	},
	{
		id: 'chatButtons',
		label: 'Chat bar buttons',
		description: "Send, emoji, media, gift and apps buttons as circles. The redesign draws them as rounded squares (corner 8, Discord's radii.sm).",
		// ChatInputActionButton draws every chat-bar button, the send button included.
		components: [
			{ path: `${CHAT}action_buttons/ChatInputActionButton.tsx` },
			{ path: `${CHAT}accessories/ChatInputExpressionButton.tsx` },
			// A named export, not default (352.2 / 352.6 bundles).
			{ path: `${CHAT}EmojiSuggestionChatButton.tsx`, export: 'EmojiSuggestionChatButton' },
		],
		rule: rules.circleIfSquare(44),
	},
	{
		id: 'chatInput',
		label: 'Message box',
		description: 'The text box in the chat bar as a pill (corner 24; Discord draws 20, or 8 on the older layout).',
		// The box's plain styles say 0; its rounding and fill are a Reanimated animated style fed by
		// the CHAT_INPUT_FLOATING_BORDER_RADIUS / CHAT_INPUT_BORDER_RADIUS tokens (live, 351.3). So only
		// the tokens change: no render hooks here (wrapping its animated views stripped the box bare).
		components: [],
		rule: () => undefined,
		install: () => {
			const undo = [
				overrideToken('CHAT_INPUT_FLOATING_BORDER_RADIUS', () => settings().chatInput, stock => Math.max(stock, 24)),
				overrideToken('CHAT_INPUT_BORDER_RADIUS', () => settings().chatInput, stock => Math.max(stock, 24)),
			]
			return () => undo.forEach(u => u())
		},
	},
	{
		id: 'otherCorners',
		label: 'Everything else',
		description: 'Small things fully round: server folders, channel rows and their icons, search bars, segmented controls, the media keyboard, voice pills, the quest dock, buttons. Text boxes get rounder corners without cutting off their text. Big containers (cards, settings rows, voice tiles, keyboard tops, the channel drawer) get their pre-redesign corners instead of pills.',
		components: [],
		rule: () => undefined,
		install: () => {
			const active = () => settings().otherCorners
			// Fully round: controls and list items, where a pill or circle reads as intended.
			const round = roundCorners(
				[
					'GUILD_FOLDER_BACKGROUND_RADIUS',
					'CHANNEL_ITEM_RADIUS',
					'CHANNEL_NAME_CHANNEL_ICON_RADIUS',
					'INPUT_FIELD_ROUND_RADIUS',
					'SEGMENTED_CONTROL_BORDER_RADIUS',
					'MEDIA_KEYBOARD_BAR_BORDER_RADIUS',
					'MEDIA_KEYBOARD_BUTTON_BORDER_RADIUS',
					'VOICE_MESSAGE_RECORDING_PILL_BORDER_RADIUS',
					'VOICE_PANEL_CONTROLS_BORDER_RADIUS',
					'QUEST_DOCK_BORDER_RADIUS',
					'button.BORDER_RADIUS',
					'button.BORDER_RADIUS_LG',
				],
				active,
			)
			// Containers: back to their pre-redesign corner (a pill-shaped card or row looks broken).
			const stock = stockCorners(
				[
					'TABLE_ROW_BORDER_RADIUS',
					'CARD_DEFAULT_RADIUS',
					'CHANNEL_DRAWER_CORNER_RADIUS',
					'CONTROL_CHECKBOX_BORDER_RADIUS',
					'MOBILE_KEYBOARD_TOP_BORDER_RADIUS',
					'MOBILE_MEDIA_KEYBOARD_TOP_BORDER_RADIUS',
					'VOICE_TILE_BORDER_RADIUS',
					'BOUNTY_TILE_BORDER_RADIUS',
				],
				active,
			)
			// Text fields: corner 24, not a pill. One token serves single- and multi-line fields alike,
			// and a fully round multi-line box (the profile Bio) curved over its own text (352.6,
			// 2026-10-28). A ~48 dp single-line field is still a pill at 24, like the message box.
			const fields: Array<() => void> = []
			for (const name of ['INPUT_FIELD_RADIUS_LG', 'INPUT_FIELD_RADIUS_MD', 'INPUT_FIELD_RADIUS_SM']) {
				try {
					fields.push(overrideToken(name, active, stock => Math.max(stock, 24)))
				} catch {
					/* not on this build */
				}
			}
			return () => {
				round.cleanup()
				stock.cleanup()
				fields.forEach(undo => undo())
			}
		},
	},
	{
		id: 'youNav',
		label: 'Quests / Shop / Settings bar',
		description: 'The floating bar on the You tab as a pill, its buttons round.',
		// The bar is laid out by YouBannerDecorations (the three entries, their icons, the nav-icon
		// measurer and getFloatingNavBottomMargin; container corner radii.lg = 16, 350.2 bundle).
		components: [
			{ path: 'modules/main_tabs_v2/native/tabs/you/YouBannerDecorations.tsx' },
			{ path: 'modules/main_tabs_v2/native/tabs/you/YouScreenNavIcon.tsx' },
		],
		rule: rules.fullRoundIf(12),
	},
]
