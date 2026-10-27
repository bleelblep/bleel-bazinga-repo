/*
 * Ported from Vencord's reviewDB plugin (src/plugins/reviewDB/components/ReviewComponent.tsx,
 * ReviewBadge.tsx, utils.tsx). Copyright (c) 2023 Vendicated and contributors.
 * GPL-3.0-or-later; see ../../NOTICE.md.
 *
 * The permission rules and vote arithmetic are desktop's. The layout follows Discord's own chat
 * message: avatar, name line (name, tag, badges, date), the text, and the votes as reaction-style
 * chips under it. Report / Block / Delete live in a long-press action sheet, like a message's.
 */

import { dangerIcon, rowIcon } from '../../../../shared/ui/icon'
import {
	blockUser,
	deleteReview,
	deleteReviewVote,
	reportReview,
	unblockUser,
	voteReview,
} from '../lib/api'
import { confirm, icon, openURL, openUserProfile, toast } from '../lib/discord'
import { ReviewType, UserType } from '../lib/entities'
import { currentUserId, getAuth, getToken, settings } from '../lib/state'
import { isBotUser, Tag, UserAvatar } from './native'
import { openBlockedUsers } from './routes'
import { token } from './theme'
import type { Badge, Review } from '../lib/entities'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import * as React from 'react'
import * as ReactNative from 'react-native'

const SHEET_KEY = 'ReviewDBReviewActions'

export function canDeleteReview(profileId: string, review: Review) {
	const myId = currentUserId()
	return (
		myId === profileId ||
		review.sender.discordID === myId ||
		getAuth().user?.type === UserType.Admin
	)
}

export function canBlockReviewAuthor(profileId: string, review: Review) {
	const myId = currentUserId()
	return profileId === myId && review.sender.discordID !== myId
}

export function canReportReview(review: Review) {
	return review.sender.discordID !== currentUserId()
}

function formatDate(seconds: number) {
	const date = new Date(seconds * 1000)
	const now = new Date()
	const time = date.toLocaleTimeString([], {
		hour: 'numeric',
		minute: '2-digit',
	})
	if (date.toDateString() === now.toDateString()) return `Today at ${time}`
	const yesterday = new Date(now)
	yesterday.setDate(now.getDate() - 1)
	if (date.toDateString() === yesterday.toDateString())
		return `Yesterday at ${time}`
	return date.toLocaleDateString()
}

function ReviewBadge({ badge }: { badge: Badge }) {
	const { Image, Pressable } = ReactNative
	return (
		<Pressable
			accessibilityLabel={badge.name}
			hitSlop={6}
			onPress={() =>
				badge.redirectURL ? openURL(badge.redirectURL) : toast(badge.name)
			}
			onLongPress={() => toast(badge.description || badge.name)}
		>
			<Image
				source={{ uri: badge.icon }}
				style={{ width: 16, height: 16 }}
				resizeMode="contain"
			/>
		</Pressable>
	)
}

/**
 * Votes display: plain icons on the right side with the count next to them on the left.
 * Upvote/downvote arrows are pressable to vote.
 */
function Votes({ review }: { review: Review }) {
	const { View, Pressable } = ReactNative
	const { Text } = Design as any
	const vote = useVote(review)
	const { localVote, score, isVoting, submitVote } = vote
	const Up = icon('ArrowSmallUpIcon')
	const Down = icon('ArrowSmallDownIcon')
	const scoreColor =
		score > 0
			? token('TEXT_FEEDBACK_POSITIVE', '#4ecb85')
			: score < 0
				? token('TEXT_FEEDBACK_CRITICAL', '#f57976')
				: token('TEXT_MUTED', '#949ba4')
	const upColor =
		localVote === true
			? token('TEXT_FEEDBACK_POSITIVE', '#4ecb85')
			: token('TEXT_MUTED', '#949ba4')
	const downColor =
		localVote === false
			? token('TEXT_FEEDBACK_CRITICAL', '#f57976')
			: token('TEXT_MUTED', '#949ba4')
	// Each arrow gets its own padding instead of a bare icon plus hitSlop: two adjacent slop
	// rectangles overlap (the row gap is only 4), so a tap near the middle landed on whichever
	// sibling React Native hit-tested first. Padding widens the target without pushing the
	// arrows apart, and keeps the two targets from ever sharing a pixel. Slop stays vertical.
	const arrowStyle = (pressed: boolean) =>
		({
			paddingHorizontal: 4,
			paddingVertical: 8,
			alignItems: 'center',
			justifyContent: 'center',
			borderRadius: 14,
			opacity: pressed ? 0.6 : 1,
		}) as any
	return (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				gap: 4,
				opacity: isVoting ? 0.6 : 1,
			}}
		>
			<Text
				variant="text-sm/semibold"
				style={{ color: scoreColor, textAlign: 'center' }}
				accessibilityLabel={`Score ${score}`}
			>
				{score}
			</Text>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Upvote"
				accessibilityState={{ selected: localVote === true }}
				hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
				disabled={isVoting}
				onPress={() => submitVote(true)}
				style={({ pressed }) => arrowStyle(pressed)}
			>
				{Up ? <Up size="xs" color={upColor} /> : null}
			</Pressable>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Downvote"
				accessibilityState={{ selected: localVote === false }}
				hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
				disabled={isVoting}
				onPress={() => submitVote(false)}
				style={({ pressed }) => arrowStyle(pressed)}
			>
				{Down ? <Down size="xs" color={downColor} /> : null}
			</Pressable>
		</View>
	)
}

function useVote(review: Review) {
	const [localVote, setLocalVote] = React.useState<boolean | null>(
		review.userVote ?? null,
	)
	const [score, setScore] = React.useState(review.score ?? 0)
	const [isVoting, setIsVoting] = React.useState(false)

	React.useEffect(() => {
		setLocalVote(review.userVote ?? null)
		setScore(review.score ?? 0)
	}, [review.score, review.userVote])

	async function submitVote(isUpvote: boolean) {
		if (isVoting) return
		if (
			review.sender.discordID === getAuth().user?.discordID ||
			review.sender.discordID === currentUserId()
		) {
			toast('You cannot vote on your own review.')
			return
		}
		setIsVoting(true)
		try {
			if (localVote === isUpvote) {
				if (await deleteReviewVote(review.id)) {
					setLocalVote(null)
					setScore((s: number) => s + (isUpvote ? -1 : 1))
				}
				return
			}
			if (await voteReview(review.id, isUpvote)) {
				const delta =
					localVote == null ? (isUpvote ? 1 : -1) : isUpvote ? 2 : -2
				setLocalVote(isUpvote)
				setScore((s: number) => s + delta)
			}
		} finally {
			setIsVoting(false)
		}
	}

	return { localVote, score, isVoting, submitVote }
}

function ReviewActionsSheet({
	review,
	profileId,
	refetch,
}: {
	review: Review
	profileId: string
	refetch(): void
}) {
	const { ActionSheet, BottomSheetTitleHeader, TableRowGroup, TableRow } = Design as any
	const { hideActionSheet } = ActionSheetActionCreators
	const isAuthorBlocked =
		getAuth().user?.blockedUsers?.includes(review.sender.discordID) ?? false
	const run = (fn: () => void) => () => {
		hideActionSheet(SHEET_KEY)
		fn()
	}

	return (
		<ActionSheet>
			<BottomSheetTitleHeader title={`Review by ${review.sender.username}`} />
			<TableRowGroup hasIcons>
				<TableRow
					label="View Profile"
					icon={rowIcon('UserCircleIcon', 'UserIcon')}
					onPress={run(() => openUserProfile(review.sender.discordID))}
				/>
				<TableRow
					label="Copy Text"
					icon={rowIcon('CopyIcon')}
					onPress={run(() => {
						try {
							const Clipboard = (ReactNative as any)?.Clipboard
							if (typeof Clipboard?.setString !== 'function')
								throw new Error('no clipboard')
							Clipboard.setString(review.comment)
							toast('Copied to clipboard')
						} catch {
							toast("Couldn't copy.")
						}
					})}
				/>
				{canBlockReviewAuthor(profileId, review) ? (
					<TableRow
						label={isAuthorBlocked ? 'Unblock Reviewer' : 'Block Reviewer'}
						variant={isAuthorBlocked ? undefined : 'danger'}
						icon={
							isAuthorBlocked ? rowIcon('DenyIcon') : dangerIcon('DenyIcon')
						}
						onPress={run(() => {
							if (isAuthorBlocked) {
								unblockUser(review.sender.discordID).then(ok => ok && refetch())
								return
							}
							confirm({
								title: 'Block this reviewer?',
								body: 'They will be unable to leave further reviews on your profile. You can unblock users in the plugin settings.',
								confirmText: 'Block',
								destructive: true,
								async onConfirm() {
									if (!getToken())
										return toast('You must be logged in to block users.')
									if (await blockUser(review.sender.discordID)) refetch()
								},
							})
						})}
					/>
				) : null}
				{canReportReview(review) ? (
					<TableRow
						label="Report Review"
						variant="danger"
						icon={dangerIcon('FlagIcon')}
						onPress={run(() =>
							confirm({
								title: 'Report this review?',
								body: 'ReviewDB moderators will look at it.',
								confirmText: 'Report',
								destructive: true,
								async onConfirm() {
									if (!getToken())
										return toast('You must be logged in to report reviews.')
									await reportReview(review.id)
								},
							}),
						)}
					/>
				) : null}
				{canDeleteReview(profileId, review) ? (
					<TableRow
						label="Delete Review"
						variant="danger"
						icon={dangerIcon('TrashIcon')}
						onPress={run(() =>
							confirm({
								title: 'Delete review?',
								body: 'Do you really want to delete this review?',
								confirmText: 'Delete',
								destructive: true,
								async onConfirm() {
									if (!getToken())
										return toast('You must be logged in to delete reviews.')
									if (await deleteReview(review.id)) refetch()
								},
							}),
						)}
					/>
				) : null}
			</TableRowGroup>
		</ActionSheet>
	)
}

function openActions(review: Review, profileId: string, refetch: () => void) {
	ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: ReviewActionsSheet }),
		SHEET_KEY,
		{ review, profileId, refetch } as any,
	)
}

export default function ReviewItem({
	review,
	refetch,
	profileId,
}: {
	review: Review
	refetch(): void
	profileId: string
}) {
	const { View, Pressable } = ReactNative
	const { Text } = Design as any
	const [showAll, setShowAll] = React.useState(false)
	const { hideTimestamps } = settings()

	const isSystem = review.type === ReviewType.System
	const isReal = review.id !== 0
	const isAuthorBlocked =
		getAuth().user?.blockedUsers?.includes(review.sender.discordID) ?? false
	const openProfile = () => {
		if (!isSystem) openUserProfile(review.sender.discordID)
	}

	const long = review.comment.length > 200 && !showAll
	const isBot = !isSystem && isBotUser(review.sender.discordID)
	const DenyIcon = icon('DenyIcon')

	return (
		<Pressable
			onLongPress={
				isReal ? () => openActions(review, profileId, refetch) : undefined
			}
			delayLongPress={350}
			android_ripple={{ color: token('BACKGROUND_MOD_SUBTLE', '#2e3035') }}
			style={{
				flexDirection: 'row',
				gap: 12,
				paddingHorizontal: 16,
				paddingVertical: 8,
			}}
		>
			<Pressable onPress={openProfile} disabled={isSystem}>
				<UserAvatar
					userId={review.sender.discordID}
					photo={review.sender.profilePhoto}
				/>
			</Pressable>

			<View style={{ flex: 1 }}>
				<View
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						flexWrap: 'wrap',
						columnGap: 4,
					}}
				>
					<Text
						variant="text-md/semibold"
						color="text-strong"
						onPress={isSystem ? undefined : openProfile}
					>
						{review.sender.username}
					</Text>
					{isSystem ? (
						<Tag
							type="SYSTEM_DM"
							fallback={
								<View
									style={{
										backgroundColor: token('BACKGROUND_BRAND', '#5865f2'),
										borderRadius: 4,
										paddingHorizontal: 4,
										marginLeft: 2,
									}}
								>
									<Text variant="text-xxs/bold" style={{ color: '#ffffff' }}>
										SYSTEM
									</Text>
								</View>
							}
						/>
					) : null}
					{isBot ? <Tag type="BOT" fallback={null} /> : null}
					{isAuthorBlocked ? (
						<Pressable
							accessibilityLabel="You have blocked this user"
							hitSlop={6}
							onPress={openBlockedUsers}
						>
							{DenyIcon ? (
								<DenyIcon
									size="xs"
									color={token('TEXT_FEEDBACK_CRITICAL', '#f57976')}
								/>
							) : null}
						</Pressable>
					) : null}
					{(review.sender.badges ?? []).map((badge, i) => (
						<ReviewBadge key={i} badge={badge} />
					))}
					{!hideTimestamps && !isSystem && review.timestamp ? (
						<Text
							variant="text-xs/medium"
							color="text-muted"
							style={{ marginLeft: 2 }}
						>
							{formatDate(review.timestamp)}
						</Text>
					) : null}
				</View>

				<Text variant="text-md/normal" color="text-default">
					{long ? `${review.comment.substring(0, 200)}… ` : review.comment}
					{long ? (
						<Text
							variant="text-md/medium"
							style={{ color: token('TEXT_LINK', '#00a8fc') }}
							onPress={() => setShowAll(true)}
						>
							Read more
						</Text>
					) : null}
				</Text>
			</View>
			{isReal ? <Votes review={review} /> : null}
		</Pressable>
	)
}
