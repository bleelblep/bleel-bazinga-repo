/**
 * The people "Don't ping when replying" treats differently.
 *
 * - `except` (the default, and how the switch behaved before the list existed): replies don't ping,
 *   except replies to people on the list.
 * - `only`: replies ping as normal, except replies to people on the list.
 *
 * The list is an array written whole, like the rules, so removing someone sticks (`set()` replaces
 * arrays but merges objects).
 */

import { getStorage, settings } from './state'
import type { ReplyPerson } from '../types'

export function replyPeople(): ReplyPerson[] {
	return settings().replyPingPeople ?? []
}

export function isListed(userId: string): boolean {
	return replyPeople().some(person => person.id === userId)
}

/** Whether a reply to [authorId] should start with the mention off. */
export function shouldSilence(authorId: string | undefined): boolean {
	const listed = !!authorId && isListed(authorId)
	return settings().replyPingMode === 'only' ? listed : !listed
}

export function toggleListed(userId: string, name: string) {
	const people = replyPeople()
	const next = people.some(person => person.id === userId)
		? people.filter(person => person.id !== userId)
		: [...people, { id: userId, name }]
	getStorage()?.set({ replyPingPeople: next })
}

export function removeListed(userId: string) {
	getStorage()?.set({ replyPingPeople: replyPeople().filter(person => person.id !== userId) })
}

/** The long-press row for someone, worded for the current mode and whether they're listed. */
export function menuLabel(name: string, listed: boolean): string {
	if (settings().replyPingMode === 'only')
		return listed ? `Ping ${name} when replying again` : `Don't ping ${name} when replying`
	return listed ? `Stop always pinging ${name}` : `Always ping ${name} when replying`
}
