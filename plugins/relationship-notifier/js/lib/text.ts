import type { RelationshipEvent } from '../types'

/** One sentence for a toast. Pure logic, safe at module scope. */
export function sentence(e: RelationshipEvent): string {
	switch (e.kind) {
		case 'friend':
			if (e.byYou)
				return e.blocked ? `You blocked ${e.name}` : `You removed ${e.name}`
			return `${e.name} is no longer your friend`
		case 'incoming':
			return e.byYou
				? `You declined ${e.name}'s friend request`
				: `${e.name} cancelled their friend request`
		case 'outgoing':
			return e.byYou
				? `You cancelled your request to ${e.name}`
				: `${e.name} turned down your friend request`
		case 'name':
			return e.field === 'username'
				? `@${e.oldName} is now @${e.name}`
				: `${e.oldName} is now ${e.name}`
		case 'newfriend':
			return e.accepted === 'you'
				? `You accepted ${e.name}'s friend request`
				: e.accepted === 'them'
					? `${e.name} accepted your friend request`
					: `${e.name} is now your friend`
		case 'avatar':
			return `${e.name} changed their avatar`
		case 'guild':
			return e.byYou ? `You left ${e.name}` : `You're no longer in ${e.name}`
		case 'groupdm':
			return e.byYou
				? `You left ${e.name}`
				: `You're no longer in the group ${e.name}`
	}
}

/** The history row's second line, without the time. */
export function detail(e: RelationshipEvent): string {
	switch (e.kind) {
		case 'friend':
			if (e.byYou) return e.blocked ? 'You blocked them' : 'You removed them'
			return 'No longer your friend'
		case 'incoming':
			return e.byYou
				? 'You declined their request'
				: 'Cancelled their request to you'
		case 'outgoing':
			return e.byYou ? 'You cancelled your request' : 'Turned down your request'
		case 'name':
			return e.field === 'username' ? `Was @${e.oldName}` : `Was ${e.oldName}`
		case 'newfriend':
			return e.accepted === 'you'
				? 'You accepted their request'
				: e.accepted === 'them'
					? 'Accepted your request'
					: 'Now your friend'
		case 'avatar':
			return e.iconHash ? 'New avatar' : 'Back to the default avatar'
		case 'guild':
			return e.byYou ? 'You left' : 'Removed, banned, or the server was deleted'
		case 'groupdm':
			return e.byYou ? 'You left' : 'Removed, or the group was closed'
	}
}

export function ago(timestamp: number, now = Date.now()): string {
	const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
	if (seconds < 60) return 'just now'
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
	return `${Math.floor(seconds / 86400)}d ago`
}
