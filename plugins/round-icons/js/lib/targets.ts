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

import { clearButtonFill, maskedBackground, pillNameplate } from './youBar'
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
			// The bar's fill is YouBarBackground -> YouBarMaskedBackground: a MaskedView whose mask leaves
			// out the bottom-left strip under the avatar, with a straight 8 dp fade (352.6, read live
			// 2026-11-05). Beside a round avatar that straight cut reads as a sharp corner, so the mask is
			// made whole: the pill runs under the avatar. 1.3.6-1.3.12 hid the layer instead, which
			// dropped the bar's fill (see-through). The MaskedView itself still renders: other plugins
			// need its module loaded (Server Drawer, 1.3.6/1.3.7).
			// With a nameplate, Discord fills the bar with MOBILE_FLOATINGBAR_BACKGROUND_NAMEPLATE, which
			// most themes don't set (stock grey on a themed bar), so the plain floating bar colour is used.
			const background = hookRender(`${YOU_BAR}YouBarBackground.tsx`, 'default', tree =>
				settings().youBar && tree && typeof tree.type === 'function' ? { ...tree, type: maskedBackground(tree.type) } : tree,
			)
			// With a nameplate, its art is a separate layer (YouBarNameplate) that starts right of the
			// avatar (left = avatarSize) with square left corners, built to meet the cut-out above. With
			// the cut-out gone it showed as a square edge beside the round avatar (352.6, read live
			// 2026-11-05), so it spans the whole pill. Its animated style only moves the top-right corner.
			const nameplate = hookRender(`${YOU_BAR}YouBarNameplate.tsx`, 'default', (tree, props) =>
				settings().youBar ? pillNameplate(tree, props) : tree,
			)
			// "Just icons": no fill behind the buttons, with or without the round shape.
			const iconsOnly = hookRender(`${YOU_BAR}YouBarButton.tsx`, 'YouBarButtonContainer', tree =>
				settings().youBarIconsOnly ? clearButtonFill(tree) : tree,
			)
			return () => {
				iconsOnly()
				nameplate()
				background()
				token()
			}
		},
	},
	{
		id: 'chatButtons',
		label: 'Chat bar buttons',
		description: "Send, emoji, media, gift and apps buttons as circles, instead of the redesign's rounded squares.",
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
		description: 'The text box in the chat bar as a pill.',
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
		description: 'Small things fully round: server folders, channel rows and their icons, search bars, segmented controls, the media keyboard, voice pills, the quest dock, buttons. Text boxes get rounder corners without cutting off their text.',
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
					'button.BORDER_RADIUS',
					'button.BORDER_RADIUS_LG',
				],
				active,
			)
			// Text fields: corner 24, not a pill. One token serves single- and multi-line fields alike,
			// and a fully round multi-line box (the profile Bio) curved over its own text (352.6,
			// 2026-10-28). A ~48 dp single-line field is still a pill at 24, like the message box.
			const fields: Array<() => void> = []
			// The quest dock: corner 28, not a pill. The same token shapes the dock when it opens into the
			// tall "Quest completed!" panel, which fully round turned into a giant half-circle (352.6,
			// 2026-11-04). 28 still makes the small dock a pill.
			try {
				fields.push(overrideToken('QUEST_DOCK_BORDER_RADIUS', active, stock => Math.max(stock, 28)))
			} catch {
				/* not on this build */
			}
			// The call controls: corner 28, not a pill, for the same reason. Pulled up, the bar opens into
			// the tall call menu, which fully round drew as a giant half-circle (reported 2026-11-06).
			// 28 still makes the bar a pill.
			try {
				fields.push(overrideToken('VOICE_PANEL_CONTROLS_BORDER_RADIUS', active, stock => Math.max(stock, 28)))
			} catch {
				/* not on this build */
			}
			for (const name of ['INPUT_FIELD_RADIUS_LG', 'INPUT_FIELD_RADIUS_MD', 'INPUT_FIELD_RADIUS_SM']) {
				try {
					fields.push(overrideToken(name, active, stock => Math.max(stock, 24)))
				} catch {
					/* not on this build */
				}
			}
			return () => {
				round.cleanup()
				fields.forEach(undo => undo())
			}
		},
	},
	{
		// Was part of "Everything else" until 1.3.10; split out on request, for the pre-redesign
		// containers without everything else going round. Its setting follows otherCorners until set.
		id: 'containerCorners',
		label: 'Big containers',
		description: 'Cards, settings rows, checkboxes, voice tiles, keyboard tops and the channel drawer get their pre-redesign corners, instead of the rounder new ones.',
		components: [],
		rule: () => undefined,
		install: () => {
			// Back to their pre-redesign corner (a pill-shaped card or row looks broken).
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
				() => settings().containerCorners === true,
			)
			return () => stock.cleanup()
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
