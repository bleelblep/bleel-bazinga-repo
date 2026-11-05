/**
 * Pronouns in calls: a small pill on each person's call tile. With no video it sits under the
 * avatar; with video on it sits just above the name.
 *
 * Found in the 352.2 bundle (2026-11-05, Hermes disassembly). Every component is compiled twice
 * (React Compiler and plain), both with the same function name; none of the names below is used
 * by anything else.
 * - `modules/voice_panel/native/card/VoicePanelCard.tsx`: default export `memo(VoicePanelCard)`.
 *   With no video it renders `memo(AnimatedUserCardInner)` (not exported), props
 *   `{ avatarURI, userId, guildId, ... }`, which returns an Animated.View whose last child is the
 *   avatar. With video it renders the video instead, so this only ever shows without video.
 * - `modules/voice_panel/native/card/VoicePanelCardFloatingControls.tsx`: default export
 *   `memo(FloatingControls)`, which returns a Fragment whose first child is
 *   `memo(FloatingParticipantLabel)` (not exported), props `{ label, participant, ... }`. That
 *   returns one absolute, centred View holding the name pill. `participant.hasVideo &&
 *   participant.canRenderVideo` is the check VoicePanelCard uses for video.
 *
 * The two inner components aren't exported, so their elements are swapped, in the parents'
 * output, for wrappers that render the original and add the pill. A wrapper is made once per
 * original, so React keeps the same component (and its state) across renders. Discord's elements
 * are copied, never changed: the React Compiler variant hands back the same cached objects.
 *
 * The pill is drawn here, with its own Text, so the name's font and Nitro styles never reach it
 * (1.0.4 added the pronouns to the name's text). Discord's own tag component ignores a `text` prop
 * (Staff Tags only gets one in by repainting it), so it can't be used (1.0.5 drew nothing).
 *
 * Lookups: call tiles are people you're in a call with, so a missing profile is fetched the same
 * paced way chat does it (`prime`).
 */

import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { createFilterGenerator } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'
import { badgeColor, textOn } from '../lib/color'
import { onProfileChange } from '../lib/discord'
import { shownFor } from '../lib/filter'
import { onResolved } from '../lib/pronounDB'
import { prime, resolve } from '../lib/resolve'
import { onUpdate, settings } from '../lib/state'
import type { DiscordModules } from '@valenced/discord/types'
import type { PluginApi } from '@valenced/plugins/types'
import type { ReactNode } from 'react'
import type { PronounsStorage } from '../lib/state'

const TAG = '[Pronouns]'

/** Discord's default tag colour (the chat badge's, when no colour is picked). */
const DEFAULT_BADGE = '#5865F2'

type Cleanup = PluginApi<{ jsonStorage: PronounsStorage }>['cleanup']
type Render = (props: any, ...rest: unknown[]) => ReactNode
interface Memo {
	type?: Render & { name?: string }
}

interface ChannelStore {
	getChannel(id: string): { guild_id?: string | null } | undefined
}

interface SelectedChannelStore {
	getVoiceChannelId(): string | null | undefined
}

/** The server of the call you're in, for guild pronouns; undefined in DM calls. */
function callGuildId(): string | undefined {
	try {
		const selected =
			Stores.SelectedChannelStore as unknown as SelectedChannelStore
		const id = selected?.getVoiceChannelId?.()
		if (!id) return undefined
		const channels =
			Stores.ChannelStore as DiscordModules.Flux.Store<ChannelStore>
		return channels.getChannel(id)?.guild_id ?? undefined
	} catch {
		return undefined
	}
}

/** The pronouns to show for [userId] on a call tile, or undefined. */
function pronounsFor(
	userId: string,
	guildId: string | undefined,
): string | undefined {
	const s = settings()
	if (!s.showInCalls || !shownFor(userId)) return undefined
	prime(userId, guildId)
	return resolve(userId, guildId)?.text
}

/**
 * Re-renders the calling component when settings, a profile or a PronounDB answer change. A hook:
 * called unconditionally, once per render.
 */
function useRefresh() {
	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		const offs = [
			onUpdate(bump),
			onProfileChange(bump),
			onResolved(() => bump()),
		]
		return () => {
			for (const off of offs) off()
		}
	}, [])
}

/** The pronouns as a small pill like chat's badge, in the badge colour. */
function Pill(props: { text: string; userId: string; guildId?: string }) {
	const { View } = ReactNative
	const { Text } = Design
	const background = badgeColor(props.userId, props.guildId) ?? DEFAULT_BADGE
	return (
		<View
			pointerEvents="none"
			style={{
				backgroundColor: background,
				borderRadius: 4,
				paddingHorizontal: 5,
				paddingVertical: 1,
				alignSelf: 'center',
			}}
		>
			<Text
				variant="text-xs/semibold"
				style={{ color: textOn(background) }}
				numberOfLines={1}
			>
				{props.text}
			</Text>
		</View>
	)
}

/** The memo'd function's name, for elements whose type is `memo(fn)`. */
function memoName(node: unknown): string | undefined {
	const type = (node as { type?: Memo } | null)?.type
	return typeof type?.type === 'function' ? type.type.name : undefined
}

/** [node] with its children replaced; Discord's element is left as it was. */
function withChildren(
	node: React.ReactElement,
	children: ReactNode,
): ReactNode {
	return {
		...node,
		props: { ...(node.props as object), children },
	} as ReactNode
}

/** One wrapper per original memo, so React keeps the component's identity across renders. */
const wrappers = new WeakMap<object, React.ComponentType<any>>()

function wrapperFor(
	memo: Memo,
	make: (inner: Render) => React.ComponentType<any>,
): React.ComponentType<any> | undefined {
	const inner = memo.type
	if (typeof inner !== 'function') return undefined
	let wrapper = wrappers.get(memo)
	if (!wrapper) {
		wrapper = make(inner)
		wrappers.set(memo, wrapper)
	}
	return wrapper
}

/** [rendered] with the element whose memo is named [name] swapped for [wrapper]'s. */
function swapChild(
	rendered: ReactNode,
	name: string,
	make: (inner: Render) => React.ComponentType<any>,
	depth = 0,
): ReactNode {
	if (depth > 6 || !React.isValidElement(rendered)) return rendered
	if (memoName(rendered) === name) {
		const Wrapper = wrapperFor(rendered.type as Memo, make)
		if (!Wrapper) return rendered
		return { ...rendered, type: Wrapper } as ReactNode
	}
	const children = (rendered.props as { children?: ReactNode }).children
	if (children == null || typeof children !== 'object') return rendered
	if (Array.isArray(children)) {
		let changed = false
		const next = children.map(child => {
			const out = swapChild(child, name, make, depth + 1)
			if (out !== child) changed = true
			return out
		})
		return changed ? withChildren(rendered, next) : rendered
	}
	const next = swapChild(children, name, make, depth + 1)
	return next === children ? rendered : withChildren(rendered, next)
}

/** No video: the pill hangs under the avatar, so the avatar stays where Discord put it. */
function makeAvatarCard(inner: Render) {
	return function PronounsAvatarCard(props: any) {
		useRefresh()
		const rendered = inner(props)
		try {
			const userId = props?.userId ? String(props.userId) : undefined
			if (!userId || !React.isValidElement(rendered)) return rendered
			const guildId = props?.guildId ?? callGuildId()
			const text = pronounsFor(userId, guildId)
			if (!text) return rendered
			const children = (rendered.props as { children?: ReactNode }).children
			const list = Array.isArray(children) ? children : [children]
			const last = list.length - 1
			const avatar = list[last]
			if (!React.isValidElement(avatar)) return rendered
			const { View } = ReactNative
			const withPill = (
				<View key="bleelblep-pronouns-avatar" style={{ alignItems: 'center' }}>
					{avatar}
					<View
						pointerEvents="none"
						style={{ position: 'absolute', top: '100%', marginTop: 6 }}
					>
						<Pill text={text} userId={userId} guildId={guildId} />
					</View>
				</View>
			)
			const next = list.slice()
			next[last] = withPill
			return withChildren(rendered, Array.isArray(children) ? next : withPill)
		} catch (error) {
			reportError(`${TAG} call avatar failed:`, error)
			return rendered
		}
	}
}

/** Video on: the pill sits just above the name, in the name's centred column. */
function makeNameLabel(inner: Render) {
	return function PronounsNameLabel(props: any) {
		useRefresh()
		const rendered = inner(props)
		try {
			const participant = props?.participant
			if (!participant?.hasVideo || !participant?.canRenderVideo)
				return rendered
			const id = participant?.user?.id
			if (!id || !React.isValidElement(rendered)) return rendered
			const userId = String(id)
			const guildId = callGuildId()
			const text = pronounsFor(userId, guildId)
			if (!text) return rendered
			const children = (rendered.props as { children?: ReactNode }).children
			return withChildren(rendered, [
				<View4 key="bleelblep-pronouns-name">
					<Pill text={text} userId={userId} guildId={guildId} />
				</View4>,
				...React.Children.toArray(children),
			])
		} catch (error) {
			reportError(`${TAG} call name failed:`, error)
			return rendered
		}
	}
}

/** A gap under the pill, above the name. */
function View4(props: { children?: ReactNode }) {
	const { View } = ReactNative
	return (
		<View pointerEvents="none" style={{ marginBottom: 4 }}>
			{props.children}
		</View>
	)
}

/** Patches a `memo(fn)` default export whose function is named [name]; [transform] edits its output. */
function patchMemo(
	cleanup: Cleanup,
	name: string,
	transform: (rendered: ReactNode) => ReactNode,
) {
	// `withName` can't see through `React.memo`; the wrapped function on `type` still has its name.
	// Built here, not at module scope (coding rule 1).
	const withMemoName = createFilterGenerator<[name: string]>(
		([wanted], _id, exports) =>
			(exports as Memo | undefined)?.type?.name === wanted,
		([wanted]) => `bleelblep.pronouns.memoName(${wanted})`,
	)
	cleanup(
		getModules(withMemoName(name), exports => {
			// A bare engine job when the module is already loaded: an uncaught throw can close the app.
			try {
				const memo = exports as unknown as Memo
				if (typeof memo?.type !== 'function') return
				cleanup(
					instead(memo as { type: Render }, 'type', function (args, original) {
						// Rendered exactly once, so Discord's hooks run in the same order every time.
						const rendered = Reflect.apply(original, this, args)
						try {
							if (!settings().showInCalls) return rendered
							return transform(rendered)
						} catch (error) {
							reportError(`${TAG} ${name} failed:`, error)
							return rendered
						}
					}),
				)
			} catch (error) {
				reportError(`${TAG} could not patch ${name}:`, error)
			}
		}),
	)
}

export default function patchCalls(cleanup: Cleanup) {
	patchMemo(cleanup, 'VoicePanelCard', rendered =>
		swapChild(rendered, 'AnimatedUserCardInner', makeAvatarCard),
	)
	patchMemo(cleanup, 'FloatingControls', rendered =>
		swapChild(rendered, 'FloatingParticipantLabel', makeNameLabel),
	)
}
