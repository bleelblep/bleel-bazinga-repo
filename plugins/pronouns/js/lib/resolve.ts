/**
 * One lookup for a badge: your override first, then Discord's own pronouns and PronounDB in the
 * order the settings choose. Everything here answers synchronously; asynchronous sources (a
 * profile fetch, a PronounDB batch) are *primed* here and land through the listeners the patches
 * subscribe to.
 */

import { discordPronouns, fetchOnMiss } from './discord'
import { cached, request } from './pronounDB'
import { settings } from './state'
import { cleanPronounDb, cleanPronouns, parseExtra, tidy } from './validate'

export interface Resolved {
	text: string
	source: 'override' | 'discord' | 'pronoundb'
}

export function overrideFor(userId: string): string | undefined {
	const value = settings().overrides?.[userId]
	// null is a cleared override's tombstone, not a value.
	return tidy(value)
}

/**
 * With "Only real pronouns" on, just the pronoun part of [text]; otherwise [text] with its blank
 * space tidied. Either way, text that's only spaces or invisible characters gives no badge.
 */
function filtered(
	raw: string | undefined,
	source: 'discord' | 'pronoundb',
): string | undefined {
	const text = tidy(raw)
	if (!text) return undefined
	const s = settings()
	if (!s.validOnly) return text
	const options = { anyAll: s.allowAnyAll, extra: parseExtra(s.extraPronouns) }
	// PronounDB answers with codes ("it", "he/it"), not free text, so no name or prose checks.
	return tidy(
		source === 'pronoundb'
			? cleanPronounDb(text, options)
			: cleanPronouns(text, options),
	)
}

/** The pronoun string the badge shows for this author, if any is known right now. */
export function resolve(
	userId: string,
	guildId?: string,
): Resolved | undefined {
	try {
		const override = overrideFor(userId)
		if (override) return { text: override, source: 'override' }
		const s = settings()
		// Filtered before the order is applied: junk in one source falls through to the other.
		const discord = filtered(discordPronouns(userId, guildId), 'discord')
		const db = s.pronounDbEnabled
			? filtered(cached(userId), 'pronoundb')
			: undefined
		if (s.discordFirst || !s.pronounDbEnabled) {
			if (discord) return { text: discord, source: 'discord' }
			if (db) return { text: db, source: 'pronoundb' }
		} else {
			if (db) return { text: db, source: 'pronoundb' }
			if (discord) return { text: discord, source: 'discord' }
		}
		return undefined
	} catch {
		return undefined
	}
}

/**
 * Kicks off whatever is missing for this author: a Discord profile fetch when the store has
 * nothing, and a PronounDB lookup when it isn't cached and PronounDB is enabled. Deduped by both
 * clients.
 */
export function prime(userId: string, guildId?: string) {
	if (overrideFor(userId)) return
	// Even with the user's own pronouns known: a guild profile can carry its own, which win.
	fetchOnMiss(userId, guildId)
	if (settings().pronounDbEnabled && !cached(userId)) request(userId)
}
