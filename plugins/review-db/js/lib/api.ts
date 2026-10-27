/*
 * Ported from Vencord's reviewDB plugin (src/plugins/reviewDB/reviewDbApi.ts).
 * Copyright (c) 2023 Vendicated and contributors. GPL-3.0-or-later; see ../../NOTICE.md.
 */

import { authorize } from './auth'
import { toast } from './discord'
import { type Review, ReviewType, type ReviewDBCurrentUser, type ReviewDBUser, type UserReviewsData } from './entities'
import { getAuth, getToken, settings, updateAuth } from './state'

export const API_URL = 'https://manti.vendicated.dev/api/reviewdb'
export const REVIEWS_PER_PAGE = 50

const WarningFlag = 0b00000010

export interface ReviewVote {
	reviewID: number
	isUpvote: boolean
}

async function rdbRequest<T = unknown>(path: string, options: RequestInit = {}): Promise<T | null> {
	const headers: Record<string, string> = {
		Accept: 'application/json',
		Authorization: getToken() ?? '',
		...(options.headers as Record<string, string>),
	}
	if (options.body) headers['Content-Type'] = 'application/json'

	const res = await fetch(API_URL + path, { ...options, headers }).catch(() => {
		toast('Network error: failed to connect to ReviewDB.')
		return null
	})
	if (!res) return null

	const data = await res.json().catch(() => null)
	if (!res.ok) {
		toast(data?.message ?? `ReviewDB: request failed with status ${res.status}`)
		return null
	}
	return data as T
}

function systemReview(message: string): Review {
	return {
		id: 0,
		comment: message,
		star: 0,
		timestamp: 0,
		type: ReviewType.System,
		sender: {
			id: 0,
			username: 'ReviewDB',
			profilePhoto:
				'https://cdn.discordapp.com/avatars/1134864775000629298/3f87ad315b32ee464d84f1270c8d1b37.png?size=256',
			discordID: '1134864775000629298',
			badges: [],
		},
	}
}

export async function getReviews(
	id: string,
	{ limit, offset = 0, fetchVotes = false }: { limit?: number; offset?: number; fetchVotes?: boolean } = {},
): Promise<UserReviewsData> {
	let flags = 0
	if (!settings().showWarning) flags |= WarningFlag

	const params: string[] = []
	if (flags) params.push(`flags=${flags}`)
	if (offset) params.push(`offset=${offset}`)
	if (limit) params.push(`limit=${limit}`)

	const votesPromise = fetchVotes ? getReviewVotes(id).catch(() => []) : Promise.resolve([])
	const req = await fetch(`${API_URL}/users/${id}/reviews?${params.join('&')}`).catch(() => null)

	if (!req?.ok) {
		const message =
			req?.status === 429
				? 'You are sending requests too fast. Wait a few seconds and try again.'
				: 'An error occurred while fetching reviews. Please try again later.'
		return {
			message,
			reviews: [systemReview(message)],
			updated: false,
			hasNextPage: false,
			reviewCount: 0,
			hasOptedOut: false,
		}
	}

	const res = (await req.json()) as UserReviewsData
	res.reviews ??= []
	if (!fetchVotes || res.reviews.length === 0) return res

	const votes = await votesPromise
	if (votes.length === 0) return res

	const voteByReviewId = new Map<number, boolean>()
	for (const vote of votes) voteByReviewId.set(vote.reviewID, vote.isUpvote)
	res.reviews = res.reviews.map(review => ({ ...review, userVote: voteByReviewId.get(review.id) ?? null }))
	return res
}

export async function getReviewVotes(id: string): Promise<ReviewVote[]> {
	if (!getToken()) return []
	const res = await rdbRequest<{ votes: ReviewVote[] }>(`/users/${id}/reviews/votes`)
	return res?.votes ?? []
}

export async function addReview(review: { userid: string; comment: string }): Promise<UserReviewsData | null> {
	if (!getToken()) {
		toast('Please authorize to add a review.')
		authorize()
		return null
	}
	const data = await rdbRequest<UserReviewsData>(`/users/${review.userid}/reviews`, {
		method: 'PUT',
		body: JSON.stringify(review),
	})
	if (data?.message) toast(data.message)
	return data
}

export async function deleteReview(id: number): Promise<UserReviewsData | null> {
	// Desktop sends the review id in the path too; the server reads it from the body.
	const data = await rdbRequest<UserReviewsData>(`/users/${id}/reviews`, {
		method: 'DELETE',
		body: JSON.stringify({ reviewid: id }),
	})
	if (data?.message) toast(data.message)
	return data
}

export async function reportReview(id: number) {
	const data = await rdbRequest<UserReviewsData>('/reports', {
		method: 'PUT',
		body: JSON.stringify({ reviewid: id }),
	})
	if (data?.message) toast(data.message)
}

function needToken(action: string) {
	if (getToken()) return false
	toast(`Please authorize to ${action}.`)
	authorize()
	return true
}

export async function voteReview(id: number, isUpvote: boolean) {
	if (needToken('vote on reviews')) return false
	const data = await rdbRequest(`/reviews/${id}/vote`, {
		method: 'POST',
		body: JSON.stringify({ isUpvote }),
	})
	return !!data
}

export async function deleteReviewVote(id: number) {
	if (needToken('vote on reviews')) return false
	const data = await rdbRequest(`/reviews/${id}/vote`, { method: 'DELETE' })
	return !!data
}

async function patchBlock(action: 'block' | 'unblock', userId: string) {
	const data = await rdbRequest('/blocks', {
		method: 'PATCH',
		body: JSON.stringify({ action, discordId: userId }),
	})
	if (!data) return false

	toast(`Successfully ${action}ed user`)
	const user = getAuth().user
	if (user?.blockedUsers) {
		const blockedUsers =
			action === 'block' ? [...user.blockedUsers, userId] : user.blockedUsers.filter(id => id !== userId)
		updateAuth({ user: { ...user, blockedUsers } })
	}
	return true
}

export const blockUser = (userId: string) => patchBlock('block', userId)
export const unblockUser = (userId: string) => patchBlock('unblock', userId)

export async function fetchBlocks(): Promise<ReviewDBUser[]> {
	return (await rdbRequest<ReviewDBUser[]>('/blocks')) ?? []
}

export function getCurrentUserInfo(): Promise<ReviewDBCurrentUser | null> {
	return rdbRequest<ReviewDBCurrentUser>('/users', { method: 'POST' })
}

export function readNotification(id: number) {
	return rdbRequest(`/notifications?id=${id}`, { method: 'PATCH' })
}
