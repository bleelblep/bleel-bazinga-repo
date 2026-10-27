/**
 * Discord's own components, used in place of hand-drawn views where the app has one: `Avatar`,
 * `AvatarPile`, `BotTag`, `EmptyState`, and the Design `TextInput` / `IconButton`. Module paths and
 * prop names were read from the 348.5 bundle (Hermes disassembly), not guessed.
 *
 * Each is looked up when first rendered (never at module scope) and only found if Discord has
 * already loaded it. Every use goes through `Native`, which renders the hand-drawn `fallback`
 * instead when the component is missing or throws, so a renamed prop costs the look, not the screen.
 */

import { defaultAvatar, TAG } from '../lib/discord'
import { getAssetIdByName } from '@valenced/assets'
import { Stores } from '@valenced/discord/flux'
import * as finders from '@valenced/discord/utils/modules/finders'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'

function byPath(path: string): any {
	try {
		return (finders as any).lookupModuleWithImportedPath(path)?.[0]
	} catch {
		return undefined
	}
}

const cache: Record<string, any> = {}
function cached(key: string, find: () => any): any {
	if (!cache[key]) cache[key] = find()
	return cache[key]
}

/** `{ default: Avatar, AvatarSizes }` from design/void/Avatar. */
function avatarModule(): any {
	return cached('avatar', () => byPath('design/void/Avatar/native/Avatar.tsx'))
}

/** `{ default: BotTag, Types }` from modules/applications. */
function botTagModule(): any {
	return cached('botTag', () => byPath('modules/applications/native/BotTag.tsx'))
}

function pileComponent(): any {
	return cached('pile', () => byPath('design/components/Pile/native/AvatarPile.native.tsx')?.AvatarPile)
}

function emptyStateComponent(): any {
	return cached('empty', () => {
		const mod = byPath('design/void/EmptyState/native/EmptyState.tsx')
		return mod?.default ?? mod?.EmptyState
	})
}

export function assetId(name: string): number | undefined {
	try {
		const id = getAssetIdByName(name)
		return typeof id === 'number' ? id : undefined
	} catch {
		return undefined
	}
}

let Boundary: any
/** Renders `fallback` if the children throw while rendering. Built on first use (coding rule 1). */
function boundary(): any {
	if (Boundary) return Boundary
	Boundary = class extends React.Component<{ name: string; fallback: any; children?: any }, { failed: boolean }> {
		state = { failed: false }
		static getDerivedStateFromError() {
			return { failed: true }
		}
		componentDidCatch(error: unknown) {
			reportError(`${TAG} Discord's ${this.props.name} failed; using the plain version:`, error)
		}
		render() {
			return this.state.failed ? this.props.fallback : this.props.children
		}
	}
	return Boundary
}

/** Discord's component when `available`, guarded; otherwise the fallback. */
export function Native({ name, available, fallback, children }: { name: string; available: boolean; fallback: any; children: any }) {
	if (!available) return fallback
	const B = boundary()
	return (
		<B name={name} fallback={fallback}>
			{children}
		</B>
	)
}

function userRecord(userId: string): any {
	try {
		return (Stores as any).UserStore?.getUser?.(userId)
	} catch {
		return undefined
	}
}

export function isBotUser(userId: string): boolean {
	return !!userRecord(userId)?.bot
}

type AvatarSize = 'XSMALL' | 'SMALL' | 'NORMAL' | 'LARGE'
const PIXELS: Record<AvatarSize, number> = { XSMALL: 24, SMALL: 32, NORMAL: 40, LARGE: 48 }

/**
 * Discord's avatar. A user Discord already has loaded is passed as the record, so decorations and
 * the animated avatar come with it; anyone else is drawn from ReviewDB's photo URL.
 */
export function UserAvatar({ userId, photo, size = 'NORMAL' }: { userId: string; photo?: string; size?: AvatarSize }) {
	const { Image } = ReactNative
	const [failed, setFailed] = React.useState(false)
	const px = PIXELS[size]
	const uri = !failed && photo ? photo : defaultAvatar(userId)
	const fallback = (
		<Image source={{ uri }} onError={() => setFailed(true)} style={{ width: px, height: px, borderRadius: px / 2 }} />
	)

	const mod = avatarModule()
	const Avatar = mod?.default
	const sizeValue = mod?.AvatarSizes?.[size]
	const user = userRecord(userId)
	return (
		<Native name="Avatar" available={!!Avatar && sizeValue !== undefined} fallback={fallback}>
			{Avatar ? (
				user ? (
					<Avatar user={user} size={sizeValue} animate={false} />
				) : (
					<Avatar source={{ uri }} size={sizeValue} animate={false} />
				)
			) : null}
		</Native>
	)
}

/** Overlapping avatars with Discord's "+N" overflow, for the profile card. */
export function ReviewerPile({
	people,
	total,
	fallback,
}: {
	people: { userId: string; photo?: string; name: string }[]
	total: number
	fallback: any
}) {
	const Pile = pileComponent()
	const sizeValue = avatarModule()?.AvatarSizes?.SMALL
	return (
		<Native name="AvatarPile" available={!!Pile && sizeValue !== undefined} fallback={fallback}>
			{Pile ? (
				<Pile size={sizeValue} totalCount={total} names={people.map(p => p.name)}>
					{people.map(p => (
						<UserAvatar key={p.userId} userId={p.userId} photo={p.photo} size="SMALL" />
					))}
				</Pile>
			) : null}
		</Native>
	)
}

/**
 * Discord's APP / SYSTEM tag. `type` is a key of `BotTag.Types` (BOT, SYSTEM_DM, ...); a missing
 * key gives the plain fallback pill.
 */
export function Tag({ type, verified, fallback }: { type: string; verified?: boolean; fallback: any }) {
	const mod = botTagModule()
	const BotTag = mod?.default
	const value = mod?.Types?.[type]
	return (
		<Native name="BotTag" available={!!BotTag && value !== undefined} fallback={fallback}>
			{BotTag ? <BotTag type={value} verified={verified} /> : null}
		</Native>
	)
}

export function Empty({ title, body, fallback }: { title: string; body: string; fallback: any }) {
	const EmptyState = emptyStateComponent()
	return (
		<Native name="EmptyState" available={!!EmptyState} fallback={fallback}>
			{EmptyState ? <EmptyState title={title} body={body} style={{ paddingVertical: 32, paddingHorizontal: 16 }} /> : null}
		</Native>
	)
}
