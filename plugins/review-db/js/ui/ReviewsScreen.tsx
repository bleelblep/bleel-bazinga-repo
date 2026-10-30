/*
 * Ported from Vencord's reviewDB plugin (src/plugins/reviewDB/components/ReviewModal.tsx and
 * ReviewsView.tsx). Copyright (c) 2023 Vendicated and contributors.
 * GPL-3.0-or-later; see ../../NOTICE.md.
 *
 * A route in Discord's settings stack (ui/routes.tsx), so the header, back arrow and status-bar
 * inset are Discord's own. Same pieces as desktop's modal: the list (system reviews first, your
 * own review pulled out of it), your own review above the composer, and a pager at 50 a page.
 */

import { addReview, getReviews, REVIEWS_PER_PAGE } from '../lib/api'
import { authorize } from '../lib/auth'
import { icon, isDiscordBlocked, TAG, toast } from '../lib/discord'
import { ReviewType, type UserReviewsData } from '../lib/entities'
import { currentUserId, getAuth, getToken, settings } from '../lib/state'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { assetId, Empty, Native } from './native'
import ReviewItem from './ReviewItem'
import { useTarget } from './routes'
import { token } from './theme'
import { Design } from '@valenced/discord/design'
import { ReactNativeSafeAreaContext } from '@valenced/externals/react-native-safe-area-context'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

/**
 * The bottom bar: Discord's round TextInput and an IconButton send arrow that stays put (disabled
 * while there's nothing to send), so the bar never changes width as you type. The hand-drawn
 * field and button remain as the fallback. Signed out, it's one stock button instead.
 */
function Composer({
	discordId,
	name,
	isAuthor,
	refetch,
}: {
	discordId: string
	name: string
	isAuthor: boolean
	refetch(): void
}) {
	const { View, Pressable, TextInput } = ReactNative
	const { Button } = Design as any
	const [text, setText] = React.useState('')
	const [busy, setBusy] = React.useState(false)
	const [, rerender] = React.useReducer((n: number) => n + 1, 0)
	const signedIn = !!getToken()
	const SendIcon = icon('SendMessageIcon')

	if (!signedIn) {
		return <Button size="lg" variant="primary" text="Authorize to write a review" onPress={() => authorize(rerender)} />
	}

	async function submit() {
		const comment = text.trim()
		if (!comment || busy) return
		setBusy(true)
		try {
			if (await addReview({ userid: discordId, comment })) {
				setText('')
				refetch()
			}
		} finally {
			setBusy(false)
		}
	}

	const canSend = !busy && !!text.trim()
	const placeholder = isAuthor ? 'Update your review' : `Review @${name}`
	const fallback = (
		<View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
			<TextInput
				value={text}
				onChangeText={setText}
				placeholder={placeholder}
				placeholderTextColor={token('TEXT_MUTED', '#949ba4')}
				multiline
				editable={!busy}
				style={{
					flex: 1,
					minHeight: 40,
					maxHeight: 120,
					borderRadius: 20,
					paddingHorizontal: 14,
					paddingTop: 9,
					paddingBottom: 9,
					backgroundColor: token('INPUT_BACKGROUND_DEFAULT', token('BACKGROUND_MOD_SUBTLE', '#2e3035')),
					color: token('TEXT_DEFAULT', '#dbdee1'),
					fontSize: 16,
				}}
			/>
			<Pressable
				accessibilityLabel="Send review"
				accessibilityState={{ disabled: !canSend }}
				disabled={!canSend}
				onPress={submit}
				style={{
					width: 40,
					height: 40,
					borderRadius: 20,
					alignItems: 'center',
					justifyContent: 'center',
					backgroundColor: canSend
						? token('BACKGROUND_BRAND', '#5865f2')
						: token('BACKGROUND_MOD_SUBTLE', '#2e3035'),
				}}
			>
				{SendIcon ? (
					<SendIcon size="sm" color={canSend ? '#ffffff' : token('INTERACTIVE_TEXT_DEFAULT', '#b5bac1')} />
				) : null}
			</Pressable>
		</View>
	)

	const { TextInput: DesignInput, IconButton } = Design as any
	const send = assetId('SendMessageIcon')
	if (!DesignInput || !IconButton || send === undefined) return fallback
	return (
		<Native name="TextInput" available fallback={fallback}>
			<View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
				<View style={{ flex: 1 }}>
					<DesignInput
						value={text}
						onChange={setText}
						placeholder={placeholder}
						multiline
						isRound
						editable={!busy}
						size="md"
					/>
				</View>
				<IconButton
					icon={send}
					size="md"
					variant={canSend ? 'primary' : 'secondary'}
					disabled={!canSend}
					loading={busy}
					accessibilityLabel="Send review"
					onPress={submit}
				/>
			</View>
		</Native>
	)
}

function Pager({ page, count, setPage }: { page: number; count: number; setPage(p: number): void }) {
	const { View } = ReactNative
	const { Button, Text } = Design as any
	const pages = Math.max(1, Math.ceil(count / REVIEWS_PER_PAGE))
	if (pages <= 1) return null
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
			<Button size="sm" variant="secondary" text="Previous" disabled={page <= 1} onPress={() => setPage(page - 1)} />
			<Text variant="text-sm/medium" color="text-muted">
				Page {page} of {pages}
			</Text>
			<Button size="sm" variant="secondary" text="Next" disabled={page >= pages} onPress={() => setPage(page + 1)} />
		</View>
	)
}


/**
 * Bottom space for the input bar. Two things the stock hooks get wrong on this screen:
 *
 * - Inside Discord's settings stack the safe-area hook reports a bottom inset of 0 (the bar sat on
 *   the gesture pill), so the window's real inset from `initialWindowMetrics` is used as a floor.
 * - Discord doesn't resize its window for the keyboard (the keyboard covered the bar), so the
 *   keyboard's height is added while it's open.
 */
function useComposerBottom(base: number): { bottom: number; rootRef: any; onRootLayout(): void } {
	const { Keyboard, Dimensions } = ReactNative
	const [keyboardTop, setKeyboardTop] = React.useState<number | null>(null)
	const [keyboardHeight, setKeyboardHeight] = React.useState(0)
	const [rootBottom, setRootBottom] = React.useState<number | null>(null)
	const rootRef = React.useRef<any>(null)
	const hookBottom = useBottomPadding(0)

	let windowBottom = 0
	try {
		windowBottom =
			ReactNativeSafeAreaContext.initialWindowMetrics?.insets?.bottom ?? 0
	} catch {
		/* none */
	}
	const inset = Math.max(hookBottom, windowBottom, 16)

	const measure = () => {
		try {
			rootRef.current?.measureInWindow?.((_x: number, y: number, _w: number, h: number) => {
				if (typeof y === 'number' && typeof h === 'number') setRootBottom(y + h)
			})
		} catch {
			/* keep the last value */
		}
	}

	React.useEffect(() => {
		const show = Keyboard.addListener('keyboardDidShow', (e: any) => {
			setKeyboardTop(typeof e?.endCoordinates?.screenY === 'number' ? e.endCoordinates.screenY : null)
			setKeyboardHeight(e?.endCoordinates?.height ?? 0)
			measure()
		})
		const hide = Keyboard.addListener('keyboardDidHide', () => {
			setKeyboardTop(null)
			setKeyboardHeight(0)
		})
		return () => {
			show.remove()
			hide.remove()
		}
	}, [])

	if (!keyboardHeight) return { bottom: inset + base, rootRef, onRootLayout: measure }

	// How much of this screen the keyboard actually covers: from its top edge to our bottom edge.
	// The reported height leaves out the navigation bar under the keyboard, which is what hid half
	// the field; the measured overlap doesn't.
	let overlap = keyboardHeight + inset
	if (keyboardTop !== null) {
		const bottomEdge = rootBottom ?? Dimensions.get('window').height
		overlap = Math.max(bottomEdge - keyboardTop, keyboardHeight)
		if (DEBUG) console.log(`[ReviewDB] keyboard: top=${keyboardTop} height=${keyboardHeight} rootBottom=${rootBottom} window=${Dimensions.get("window").height} inset=${inset} -> ${overlap}`)
	}
	return { bottom: overlap + base, rootRef, onRootLayout: measure }
}

export default function ReviewsScreen() {
	const { View, ScrollView, ActivityIndicator } = ReactNative
	const { Text } = Design as any
	const target = useTarget()
	const { bottom, rootRef, onRootLayout } = useComposerBottom(12)
	const [page, setPage] = React.useState(1)
	const [signal, refetch] = React.useReducer((n: number) => n + 1, 0)
	const [data, setData] = React.useState<UserReviewsData | null>(null)
	const [loading, setLoading] = React.useState(true)
	const scrollRef = React.useRef<any>(null)
	const discordId = target?.discordId

	React.useEffect(() => {
		setPage(1)
		setData(null)
	}, [discordId])

	React.useEffect(() => {
		if (!discordId) return
		let alive = true
		setLoading(true)
		getReviews(discordId, { offset: (page - 1) * REVIEWS_PER_PAGE, limit: REVIEWS_PER_PAGE, fetchVotes: true })
			.then(res => {
				if (!alive) return
				let reviews = res.reviews ?? []
				if (settings().hideBlockedUsers) reviews = reviews.filter(r => !isDiscordBlocked(r.sender.discordID))
				const system = reviews.filter(r => r.type === ReviewType.System)
				const normal = reviews.filter(r => r.type !== ReviewType.System)
				setData({ ...res, reviews: [...system, ...normal] })
				scrollRef.current?.scrollTo?.({ y: 0, animated: true })
			})
			.catch(error => {
				reportError(`${TAG} getReviews failed:`, error)
				toast("Couldn't load reviews.")
			})
			.finally(() => alive && setLoading(false))
		return () => {
			alive = false
		}
	}, [discordId, page, signal])

	if (!target) {
		return (
			<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
				<Text color="text-muted">Open reviews from a profile or a server.</Text>
			</View>
		)
	}

	const myId = getAuth().user?.discordID ?? currentUserId()
	const ownReview = data?.reviews.find(r => r.sender.discordID === myId)
	const list = (data?.reviews ?? []).filter(r => r.sender.discordID !== myId)
	const reviewCount = data?.reviewCount ?? 0
	const heading = { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }

	return (
		<View ref={rootRef} onLayout={onRootLayout} style={{ flex: 1 }}>
			<ScrollView
				ref={scrollRef}
				style={{ flex: 1 }}
				contentContainerStyle={{ paddingBottom: 8 }}
				keyboardShouldPersistTaps="handled"
			>
				{!data && loading ? <ActivityIndicator style={{ marginTop: 32 }} /> : null}

				{ownReview ? (
					<>
						<Text variant="eyebrow" color="text-muted" style={heading}>
							Your review
						</Text>
						<ReviewItem review={ownReview} refetch={refetch} profileId={target.discordId} />
					</>
				) : null}

				{data ? (
					<Text variant="eyebrow" color="text-muted" style={heading}>
						{reviewCount} {reviewCount === 1 ? 'Review' : 'Reviews'}
					</Text>
				) : null}
				{list.map(review => (
					<ReviewItem key={review.id} review={review} refetch={refetch} profileId={target.discordId} />
				))}
				{data && list.length === 0 && !ownReview ? (
					<Empty
						title="No reviews yet"
						body={`Looks like nobody reviewed this ${target.type === ReviewType.Server ? 'server' : 'user'} yet. You could be the first!`}
						fallback={
							<Text
								variant="text-md/medium"
								color="text-muted"
								style={{ textAlign: 'center', paddingVertical: 32, paddingHorizontal: 32 }}
							>
								Looks like nobody reviewed this {target.type === ReviewType.Server ? 'server' : 'user'} yet. You could be
								the first!
							</Text>
						}
					/>
				) : null}
				<Pager page={page} count={reviewCount} setPage={setPage} />
			</ScrollView>

			<View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: bottom }}>
				{data?.hasOptedOut ? (
					<Text variant="text-sm/medium" color="text-muted" style={{ textAlign: 'center', paddingVertical: 10 }}>
						This user has opted out of reviews.
					</Text>
				) : (
					<Composer discordId={target.discordId} name={target.name} isAuthor={!!ownReview} refetch={refetch} />
				)}
			</View>
		</View>
	)
}
