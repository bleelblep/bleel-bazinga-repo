/*
 * The "User Reviews" card on a profile's main tab. Port of Vencord reviewDB's
 * `renderProfileComponent` (src/plugins/reviewDB/index.tsx). Copyright (c) 2023 Vendicated and
 * contributors. GPL-3.0-or-later; see ../../NOTICE.md.
 *
 * Where it goes: `UserProfileContent` renders the main tab as a fixed list of cards, and the last
 * two are `UserProfileConnections.UserProfileAccountConnectionsCard` and
 * `…ApplicationRoleConnectionsCard`, read off the module namespace at render time. So a hook on
 * the second one adds a card right after Connections without touching the list itself. That card
 * returns null for most people (no linked-role apps); the hook still adds ours.
 *
 * `after` gets only the return value (coding rule 2), so a `before` stashes the props for the
 * `after` that follows it in the same synchronous call. `before` returns the args array.
 *
 * Bots get a different screen, `BotUserProfileContent` (a memo; props `{ user, channel, ... }`),
 * which never renders the Connections cards. Its render returns a View whose children are the
 * card list (each card gets a `user` or `userId` prop), so the card is appended to that list.
 * ReviewDB itself takes reviews on bots (MEE6 has thousands); only the mobile hook was missing.
 */

import { getReviews } from '../lib/api'
import { defaultAvatar, TAG } from '../lib/discord'
import { ReviewType, type UserReviewsData } from '../lib/entities'
import { ReviewerPile } from '../ui/native'
import { openReviews } from '../ui/routes'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import * as finders from '@valenced/discord/utils/modules/finders'
import { after, before } from '@valenced/patcher'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const PATH = 'modules/user_profile/native/UserProfileConnections.tsx'
const CARD_PATH = 'modules/user_profile/native/UserProfileCard.tsx'
const TARGET = 'UserProfileApplicationRoleConnectionsCard'
const BOT_PATH = 'modules/user_profile/native/BotUserProfileContent.tsx'

/** Short cache so scrolling a profile, or reopening it, doesn't refetch every time. */
const cache = new Map<string, { at: number; data: UserReviewsData }>()
const CACHE_MS = 60_000

let profileCard: any
function ProfileCardComponent(): any {
	if (profileCard === undefined) {
		try {
			const mod = (finders as any).lookupModuleWithImportedPath(CARD_PATH)?.[0]
			profileCard = typeof mod?.default === 'function' ? mod.default : null
		} catch {
			profileCard = null
		}
	}
	return profileCard
}

function usernameOf(userId: string): string {
	try {
		const user = (Stores as any).UserStore?.getUser?.(userId)
		return user?.globalName || user?.username || 'User'
	} catch {
		return 'User'
	}
}

function AvatarStack({ data }: { data: UserReviewsData }) {
	const { View, Image } = ReactNative
	const { Text } = Design as any
	const reviews = data.reviews.filter(r => r.id !== 0).slice(0, 4)
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center' }}>
			{reviews.map((review, i) => {
				const showCount = i === 3 && data.reviewCount > 4
				return (
					<View key={review.id} style={{ marginLeft: i ? -8 : 0 }}>
						<Image
							source={{ uri: review.sender.profilePhoto || defaultAvatar(review.sender.discordID) }}
							style={{ width: 28, height: 28, borderRadius: 14, opacity: showCount ? 0.35 : 1 }}
						/>
						{showCount ? (
							<View
								style={{
									position: 'absolute',
									top: 0,
									left: 0,
									right: 0,
									bottom: 0,
									alignItems: 'center',
									justifyContent: 'center',
								}}
							>
								<Text variant="text-xs/bold" color="text-strong">
									+{data.reviewCount - 3}
								</Text>
							</View>
						) : null}
					</View>
				)
			})}
		</View>
	)
}

/** Discord's AvatarPile of the latest reviewers, or the hand-drawn stack if it isn't loaded. */
function Reviewers({ data }: { data: UserReviewsData }) {
	const people = data.reviews
		.filter(r => r.id !== 0)
		.slice(0, 3)
		.map(r => ({ userId: r.sender.discordID, photo: r.sender.profilePhoto, name: r.sender.username }))
	return <ReviewerPile people={people} total={data.reviewCount} fallback={<AvatarStack data={data} />} />
}

function ReviewsCard({ userId }: { userId: string }) {
	const { TableRowGroup, TableRow, Card, Text } = Design as any
	const [data, setData] = React.useState<UserReviewsData | null>(() => cache.get(userId)?.data ?? null)

	React.useEffect(() => {
		const hit = cache.get(userId)
		if (hit && Date.now() - hit.at < CACHE_MS) {
			setData(hit.data)
			return
		}
		let alive = true
		getReviews(userId, { limit: 4 })
			.then(res => {
				cache.set(userId, { at: Date.now(), data: res })
				if (alive) setData(res)
			})
			.catch(error => reportError(`${TAG} profile card fetch failed:`, error))
		return () => {
			alive = false
		}
	}, [userId])

	const optedOut = !!data?.hasOptedOut
	const count = data?.reviewCount ?? 0
	const label = !data ? 'Loading…' : optedOut ? 'User opted out' : count ? `${count} ${count === 1 ? 'review' : 'reviews'}` : 'No reviews yet'

	const row = (
		<TableRowGroup hasIcons={false}>
			<TableRow
				label={label}
				subLabel={!optedOut && data ? 'Tap to read or write reviews' : undefined}
				trailing={data && count ? <Reviewers data={data} /> : undefined}
				arrow={!optedOut}
				disabled={optedOut}
				onPress={optedOut ? undefined : () => openReviews(userId, usernameOf(userId), ReviewType.User)}
			/>
		</TableRowGroup>
	)

	const UserProfileCard = ProfileCardComponent()
	if (UserProfileCard) {
		return (
			<UserProfileCard title="User Reviews" titleStyle={{ marginBottom: 8 }}>
				{row}
			</UserProfileCard>
		)
	}
	return (
		<Card>
			<Text variant="text-sm/medium" color="text-strong" style={{ marginBottom: 8 }}>
				User Reviews
			</Text>
			{row}
		</Card>
	)
}

/** Cards on the bot screen take a `userId` string (the header pieces take a `user` record). */
function cardCount(children: any[]): number {
	return children.filter(c => typeof c?.props?.userId === 'string').length
}

/** The children array holding the most `userId` cards (at least two): the path to it, or null. */
function findCardList(element: any, depth = 0): { count: number; path: number[] } | null {
	if (!element || typeof element !== 'object' || depth > 10 || !element.props) return null
	const children = element.props.children
	const list = Array.isArray(children) ? children : [children]
	let best: { count: number; path: number[] } | null = null
	if (Array.isArray(children) && cardCount(children) >= 2) best = { count: cardCount(children), path: [] }
	list.forEach((child, i) => {
		const found = findCardList(child, depth + 1)
		if (found && (!best || found.count > best.count)) best = { count: found.count, path: [i, ...found.path] }
	})
	return best
}

function withCard(element: any, path: number[], card: any): any {
	const children = element.props.children
	if (!path.length) return React.cloneElement(element, { children: [...children, card] })
	const [i, ...rest] = path
	if (!Array.isArray(children)) return React.cloneElement(element, { children: withCard(children, rest, card) })
	const copy = children.slice()
	copy[i] = withCard(children[i], rest, card)
	return React.cloneElement(element, { children: copy })
}

/**
 * A copy of `element` with `card` added to its card list, cloning only the elements on the way
 * down. Undefined if no list was found.
 */
function appendToCardList(element: any, card: any): any {
	const found = findCardList(element)
	return found ? withCard(element, found.path, card) : undefined
}

export default function patchProfileCard(): () => void {
	const patches: Array<() => void> = []
	let lastProps: any
	let unsubscribe: (() => void) | undefined

	const apply = (mod: any) => {
		try {
			if (typeof mod?.[TARGET] !== 'function') {
				reportError(`${TAG} ${TARGET} not found on ${PATH}; the profile card is off.`)
				return
			}
			patches.push(
				before(mod, TARGET, (args: any[]) => {
					lastProps = args?.[0]
					return args
				}),
				after(mod, TARGET, (ret: any) => {
					const props = lastProps
					lastProps = undefined
					const userId = props?.userId
					if (typeof userId !== 'string') return ret
					try {
						const card = <ReviewsCard userId={userId} />
						return ret ? (
							<>
								{ret}
								{card}
							</>
						) : (
							card
						)
					} catch (error) {
						reportError(`${TAG} profile card render failed:`, error)
						return ret
					}
				}),
			)
			if (DEBUG) console.log(`${TAG} hooked ${TARGET}`)
		} catch (error) {
			reportError(`${TAG} failed to hook the profile:`, error)
		}
	}

	try {
		unsubscribe = (finders as any).getModuleWithImportedPath(PATH, apply)
	} catch (error) {
		reportError(`${TAG} profile lookup failed:`, error)
	}

	let lastBotProps: any
	let unsubscribeBot: (() => void) | undefined
	const applyBot = (mod: any) => {
		try {
			const memo = mod?.default
			if (typeof memo?.type !== 'function') {
				reportError(`${TAG} BotUserProfileContent not found on ${BOT_PATH}; no card on bot profiles.`)
				return
			}
			patches.push(
				before(memo, 'type', (args: any[]) => {
					lastBotProps = args?.[0]
					return args
				}),
				after(memo, 'type', (ret: any) => {
					const props = lastBotProps
					lastBotProps = undefined
					const userId = props?.user?.id
					if (typeof userId !== 'string') return ret
					try {
						return appendToCardList(ret, <ReviewsCard key="reviewdb-card" userId={userId} />) ?? ret
					} catch (error) {
						reportError(`${TAG} bot profile card render failed:`, error)
						return ret
					}
				}),
			)
			if (DEBUG) console.log(`${TAG} hooked BotUserProfileContent`)
		} catch (error) {
			reportError(`${TAG} failed to hook bot profiles:`, error)
		}
	}
	try {
		unsubscribeBot = (finders as any).getModuleWithImportedPath(BOT_PATH, applyBot)
	} catch (error) {
		reportError(`${TAG} bot profile lookup failed:`, error)
	}

	return () => {
		unsubscribe?.()
		unsubscribeBot?.()
		for (const unpatch of patches) unpatch()
		patches.length = 0
	}
}
