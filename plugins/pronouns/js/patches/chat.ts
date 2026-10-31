/**
 * The badge: pronouns as the native tag pill next to the author name in chat.
 *
 * Chat rows are native data, not React — the tag next to the author name is drawn from
 * `getTagProperties` (`modules/messages/native/renderer/getTagProperties.tsx`), which this
 * rewrites the same way staff-tags does (`plugins/staff-tags/js/patches/chat.ts`). Because the
 * native renderer only draws the author/tag row on the first message of a block, the badge comes
 * out once per author block for free.
 *
 * Found with `getModules`, not `lookupModule`: on a cold start getTagProperties isn't loaded until
 * the chat screen first renders, and lookupModule would permanently cache that miss. A late start
 * finds it already loaded and lands in the same callback.
 */

import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { reportError } from '../../../../shared/report'
import { badgeColor, tagColorProps } from '../lib/color'
import { onProfileChange } from '../lib/discord'
import { shownFor } from '../lib/filter'
import { onResolved } from '../lib/pronounDB'
import { redrawMessage } from '../lib/redraw'
import { prime, resolve } from '../lib/resolve'
import { onUpdate, settings } from '../lib/state'
import type { DiscordModules } from '@valenced/discord/types'
import type { PluginApi } from '@valenced/plugins/types'
import type { PronounsStorage } from '../lib/state'

const TAG = '[Pronouns]'

interface Message {
	id: string
	channel_id: string
	author?: { id: string }
}

/** What `getTagProperties` returns; the renderer draws the pill from it. */
interface TagProperties {
	tagText?: string
	tagType?: number
	tagBackgroundColor?: number
	tagTextColor?: number
}

/** modules/messages/native/renderer/getTagProperties.tsx, as a namespace. */
interface GetTagPropertiesModule {
	default(input: { message: Message }): TagProperties
}

interface ChannelStore {
	getChannel(id: string): { guild_id?: string | null } | undefined
}

type Cleanup = PluginApi<{ jsonStorage: PronounsStorage }>['cleanup']

// ---------------------------------------------------------------------------------------------
// What recent rows show, so a landed result redraws exactly the rows whose badge changes.
//
// Every async source (a profile fetch, a PronounDB batch, a settings change) ends in refresh(),
// which re-resolves each recent row and redraws the ones whose answer differs from what was
// drawn. That covers rows still waiting for a badge and rows whose badge is superseded (a guild
// profile's pronouns beating the user's own), and does nothing for rows that are already right.
// Only the latest rows matter -- they're what's on screen.

const MAX_RECENT_ROWS = 200

interface Row {
	authorId: string
	guildId?: string
	/** The badge text this row was last drawn with; undefined = no badge. */
	shown?: string
}

const recent = new Map<string, Row>()

function track(key: string, row: Row) {
	recent.delete(key)
	recent.set(key, row)
	if (recent.size > MAX_RECENT_ROWS) {
		const oldest = recent.keys().next().value
		if (oldest !== undefined) recent.delete(oldest)
	}
}

/** The badge text a row of this author should show right now, or undefined for none. */
function badgeFor(authorId: string, guildId?: string): string | undefined {
	if (!settings().showInChat || !shownFor(authorId)) return undefined
	const text = resolve(authorId, guildId)?.text
	// The colour is part of what was drawn, so changing it redraws the row too.
	return text && `${text}\u0000${badgeColor(authorId, guildId) ?? ''}`
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined

/** Redraws every recent row whose badge changed. Coalesced: stores emit in bursts. */
export function refresh() {
	if (refreshTimer !== undefined) return
	refreshTimer = setTimeout(() => {
		refreshTimer = undefined
		for (const [key, row] of [...recent]) {
			try {
				if (badgeFor(row.authorId, row.guildId) === row.shown) continue
				const at = key.indexOf(':')
				// The redraw re-runs getTagProperties, which records the new text in `shown`.
				if (at > 0) redrawMessage(key.slice(0, at), key.slice(at + 1))
			} catch (error) {
				reportError(`${TAG} refresh failed:`, error)
			}
		}
	}, 50)
}

// ---------------------------------------------------------------------------------------------
// The patch

/** The tag for [message], given what Discord computed ([ret]). */
function tagFor(
	ret: TagProperties,
	message: Message | undefined,
): TagProperties {
	// A message that already carries a tag (bot, system, automod, or a staff tag) keeps it:
	// pronouns never override an existing tag.
	if (ret?.tagText || !message?.author?.id) return ret
	const key = `${message.channel_id}:${message.id}`
	const authorId = String(message.author.id)
	if (!settings().showInChat) {
		// Tracked anyway, so turning the badge back on redraws this row.
		track(key, { authorId })
		return ret
	}

	const ChannelStore =
		Stores.ChannelStore as DiscordModules.Flux.Store<ChannelStore>
	const guildId =
		ChannelStore.getChannel(message.channel_id)?.guild_id ?? undefined
	// Filtered out: no badge, and no profile or PronounDB lookup either.
	if (!shownFor(authorId)) {
		track(key, { authorId, guildId })
		return ret
	}
	prime(authorId, guildId)
	const text = resolve(authorId, guildId)?.text
	track(key, { authorId, guildId, shown: badgeFor(authorId, guildId) })
	return text
		? {
				...ret,
				tagText: text,
				tagType: undefined,
				...tagColorProps(authorId, guildId),
			}
		: ret
}

export default function patchChat(cleanup: Cleanup) {
	cleanup(
		getModules(
			withName<GetTagPropertiesModule>('getTagProperties'),
			getTagProperties => {
				if (typeof getTagProperties?.default !== 'function') return
				// With `returnNamespace` the match is the namespace, which has `default`.
				const mod = getTagProperties as GetTagPropertiesModule
				cleanup(
					// One `instead`, forwarding `this` and the args (coding rule 2). Other plugins
					// hook this function too; since the patcher fix of 2026-10-24 any mix of hooks
					// chains safely.
					instead(mod, 'default', function (args, original) {
						const ret = Reflect.apply(original, this, args)
						try {
							return tagFor(ret, args[0]?.message)
						} catch (error) {
							reportError(`${TAG} chat tag failed:`, error)
							return ret
						}
					}),
				)
			},
			{ returnNamespace: true },
		),
		onResolved(() => refresh()),
		onProfileChange(() => refresh()),
		// Any settings change (mode, lists, overrides, order) can change a drawn badge.
		onUpdate(() => refresh()),
		() => {
			if (refreshTimer !== undefined) clearTimeout(refreshTimer)
			refreshTimer = undefined
			recent.clear()
		},
	)
}
