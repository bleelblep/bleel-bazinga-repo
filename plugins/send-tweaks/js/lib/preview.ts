import {
	greetingsUnlocked,
	hasGreetingTarget,
	replacementFor,
	ruleScopeMatches,
	wagonAllowsRule,
} from './greetings'
import { renderMarkdown } from './markdown'
import { captureRandom, sendWithPreviewRandom } from './random'
import { makeSilent } from './silent'
import { settings, TAG } from './state'
import { expandSnippets } from './templateSyntax'
import { validateTemplate } from './templateValidation'
import { compileRule } from './textReplace'
import { transform } from './transform'

/**
 * Preview: a Discord dialog showing the draft as the message it would become, with Send and Close.
 * Nothing is sent or added to the chat until Send.
 *
 * It runs the same steps as the send hook (`patches/outgoing.ts`): link cleaning, link rules and
 * text rules (`transform`), then @silent when Silent messages is on. So the preview is what would
 * actually leave, not just what was typed.
 *
 * ## Drawing the message
 *
 * Your avatar and name, then the text with Discord's markdown (`lib/markdown.tsx`), in a scroll
 * view capped at about half the screen so a long message can be read to the end.
 *
 * 0.5.x borrowed the delete dialog's `LongPressMessageChatItemPreview` instead. Discord only loads
 * that with the message long-press menu, so until a message had been long-pressed the dialog fell
 * back to plain unformatted text ("sometimes not showing"); it also caps its own height, so a long
 * draft was cut off with no way to scroll. Drawing it here behaves the same every time.
 *
 * The idea is nexpid's Message Preview (Vendetta); this is written for Send Tweaks and shares no
 * code with it. Text only: attachments waiting to upload are not shown.
 */

import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'
import { showToast } from './toast'
import type { DiscordModules } from '@valenced/discord/types'
import type { ReactElement, ReactNode } from 'react'

const ALERT_KEY = 'SendTweaksPreview'

/** The signed-in user, as the preview draws them. */
interface CurrentUser {
	id: string
	avatar?: string | null
	username: string
	globalName?: string | null
	global_name?: string | null
	getAvatarURL?(guildId?: string, size?: number, animated?: boolean): unknown
}

type UserStore = DiscordModules.Flux.Store<{
	getCurrentUser?(): CurrentUser | undefined
}>
const LIMIT = 2000

function toast(content: string) {
	showToast(content, { key: 'SendTweaksPreviewToast' })
}

/** The text a send would carry right now, as Send Tweaks would change it. */
export function previewText(draft: string): string {
	let text = transform(draft).text
	if (settings().silentMessages) text = makeSilent(text)
	return text
}

function avatarUrl(me: CurrentUser): string | undefined {
	try {
		const url = me.getAvatarURL?.(undefined, 64, false)
		if (typeof url === 'string') return url
	} catch {
		/* the default avatar below */
	}
	return me.avatar
		? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`
		: 'https://cdn.discordapp.com/embed/avatars/0.png'
}

/** The message as it would appear: who it's from, then the formatted text, scrollable. */
function previewMessage(
	content: string,
	warnings: string[] = [],
): ReactElement {
	const { Image, ScrollView, View, Dimensions } = ReactNative
	const { Text } = Design
	const me = (Stores.UserStore as UserStore | undefined)?.getCurrentUser?.()

	let body: ReactNode
	try {
		body = renderMarkdown(content)
	} catch (error) {
		reportError(
			`${TAG} preview: markdown failed, showing the text as typed:`,
			error,
		)
		body = React.createElement(
			Text,
			{ variant: 'text-md/normal', color: 'text-default', selectable: true },
			content,
		)
	}

	const author = me
		? React.createElement(
				View,
				{
					style: {
						flexDirection: 'row',
						alignItems: 'center',
						marginBottom: 8,
					},
				},
				React.createElement(Image, {
					source: { uri: avatarUrl(me) },
					style: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
				}),
				React.createElement(
					Text,
					{ variant: 'text-md/semibold', color: 'text-default' },
					me.globalName ?? me.global_name ?? me.username,
				),
			)
		: null

	return React.createElement(
		ScrollView,
		{
			style: { maxHeight: Math.round(Dimensions.get('window').height * 0.5) },
			// Inside the alert, the scroll view has to claim the drag or the dialog eats it.
			nestedScrollEnabled: true,
			keyboardShouldPersistTaps: 'handled',
		},
		author,
		body,
		...warnings.map(warning =>
			React.createElement(
				Text,
				{
					key: warning,
					variant: 'text-sm/normal',
					color: 'text-feedback-warning',
					style: { marginTop: 8 },
				},
				warning,
			),
		),
	)
}

/**
 * Opens the preview for the send button's live composer text. [send] is its own `onPress`;
 * without it the dialog only has Close. Returns false if there was nothing to preview.
 */
export function showPreview(
	draft: string | undefined,
	send?: () => void,
): boolean {
	if (draft === undefined) {
		toast("Couldn't read the message box yet — reopen the chat and try again")
		return false
	}
	if (!draft.trim()) {
		toast('Nothing to preview yet')
		return false
	}

	const { result: content, choices } = captureRandom(() => previewText(draft))
	const warnings: string[] = []
	if (greetingsUnlocked()) {
		const s = settings()
		for (const rule of s.textReplace ? s.rules : []) {
			if (
				!rule.enabled ||
				!ruleScopeMatches(rule.scope) ||
				!wagonAllowsRule(replacementFor(rule)) ||
				!compileRule(rule).pattern?.test(draft)
			)
				continue
			const expanded = expandSnippets(replacementFor(rule), s.snippets ?? [])
			warnings.push(
				...validateTemplate(expanded, content, s.snippets ?? [], Infinity),
			)
			if (/\{mention\}/.test(expanded) && !hasGreetingTarget())
				warnings.push(
					'No recipient found for {mention}. Reply to someone or provide a fallback.',
				)
		}
		// Account limits can vary by Discord entitlement/experiment: use a conservative advisory.
		if (content.length > LIMIT)
			warnings.push(
				`Output has ${content.length} characters. Check your account's message-length limit before sending.`,
			)
	}
	const { AlertModal, AlertActionButton } = Design
	const alerts = AlertActionCreators
	const close = () => alerts.dismissAlert(ALERT_KEY)

	try {
		alerts.openAlert(
			ALERT_KEY,
			React.createElement(AlertModal, {
				title: 'Preview',
				extraContent: previewMessage(content, [...new Set(warnings)]),
				actions: React.createElement(
					React.Fragment,
					null,
					typeof send === 'function'
						? React.createElement(AlertActionButton, {
								text: 'Send',
								variant: 'primary',
								onPress: () => {
									close()
									sendWithPreviewRandom(draft, choices, send)
								},
							})
						: null,
					React.createElement(AlertActionButton, {
						text: 'Close',
						variant: 'secondary',
						onPress: close,
					}),
				),
			}),
		)
		return true
	} catch (error) {
		reportError(`${TAG} preview failed:`, error)
		toast("Couldn't show a preview here")
		return false
	}
}
