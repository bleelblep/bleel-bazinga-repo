/**
 * Desktop's "new member" sprout: a 🌱 after the author's name when they joined the server in the
 * last week.
 *
 * It goes in the row's role icon slot (`message.roleIcon`), which the native renderer draws after
 * the name and hands to Discord's own `handleTapRoleIcon` on tap: that shows `name` as a toast and
 * leaves the name tap (the @mention) alone. Shape seen live on 351.6:
 * `{ source | unicodeEmoji, name, size: 18, alt }`. The slot holds one icon, so for someone whose role
 * already has one the badge takes its place, or (if picked in settings) their icon stays and the
 * sprout goes after their name as text. Text can't hold an image, so that is 🌱 whatever is picked.
 *
 * Chat rows are native data built by `RowManager.generate`; the name the native renderer draws is
 * the string at `row.message.username` in its result (what Screenshot Redactor rewrites, see
 * `plugins/screenshot-redactor/js/lib/rowSchema.ts`). The author header only draws on the first
 * message of a block, so the sprout comes out once per block.
 *
 * Not the tag pill (`getTagProperties`): it has one slot, and Staff Tags / Pronouns already use it.
 *
 * A plain wrapper, not `valenced.patcher`: Ghost Log NG and Message Link Preview both `instead`-hook
 * generate, and a patcher hook registered before them makes that pair recurse until the stack
 * overflows (docs/debugging/api-contracts.md, "Two instead hooks on one method can recurse
 * forever"). That crashed Discord on 0.1.0. A plain function is not a proxy, so it is safe in any
 * start order; same approach as Send Tweaks' `lib/wrap.ts`.
 *
 * It also has to stay outermost: Show Tag rewrites the whole name after everyone else.
 */

import { Stores } from '@valenced/discord/flux'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import { reportError } from '../../../../shared/report'
import { ORIGINAL_ICON_URL, tintedIconUrl } from '../lib/newUserIcon'
import { settings } from '../state'

const TAG = '[NewMembers]'
const SPROUT = '🌱'
const DAY = 24 * 60 * 60 * 1000
// Discord desktop shows the badge for a member's first week.
const NEW_FOR_MS = 7 * DAY
// What Discord gives real role icons.
const ICON_SIZE = 18
// Also how a copy of the wrapper further out sees the icon is already there.
const ICON_ALT = 'Role icon, New member'

function joinedText(at: number): string {
	const days = Math.floor((Date.now() - at) / DAY)
	if (days <= 0) return 'Joined this server today'
	if (days === 1) return 'Joined this server yesterday'
	return `Joined this server ${days} days ago`
}

function joinedAt(guildId: string, userId: string): number | undefined {
	const { GuildMemberStore } = Stores as any
	const member = GuildMemberStore?.getMember?.(guildId, userId)
	const value = member?.joinedAt ?? member?.joined_at
	if (value == null) return undefined
	const at = new Date(value).getTime()
	return Number.isFinite(at) ? at : undefined
}

/** When [userId] joined the server [channelId] is in, if that was in the last week. */
function newMemberSince(channelId: string, userId: string): number | undefined {
	const { ChannelStore } = Stores as any
	const guildId = ChannelStore?.getChannel?.(channelId)?.guild_id
	if (!guildId) return undefined
	const at = joinedAt(String(guildId), userId)
	return at !== undefined && Date.now() - at < NEW_FOR_MS ? at : undefined
}

function addSprout(row: any, ret: any) {
	if (row?.rowType !== 1) return
	const record = row.message
	const authorId = record?.author?.id != null ? String(record.author.id) : undefined
	// Webhooks and bots have no member record, so they never match.
	if (!authorId || !record?.channel_id || record.webhook_id) return
	const message = ret?.message
	if (typeof message?.username !== 'string') return
	// Already done by a copy of the wrapper further in.
	if (message.roleIcon?.alt === ICON_ALT || message.username.endsWith(` ${SPROUT}`)) return
	const at = newMemberSince(String(record.channel_id), authorId)
	if (at === undefined) return
	const { style, color, roleIcon } = settings()
	if (message.roleIcon && roleIcon === 'keep') {
		message.username += ` ${SPROUT}`
		return
	}
	message.roleIcon = {
		// The settings page picks 🌱, Discord's NewUserIcon as shipped, or that icon recoloured.
		...(style === 'emoji'
			? { unicodeEmoji: SPROUT }
			: { source: style === 'icon' ? ORIGINAL_ICON_URL : tintedIconUrl(color) }),
		// The toast already shows the icon, so the text is just the date.
		name: joinedText(at),
		size: ICON_SIZE,
		alt: ICON_ALT,
	}
}

// How many times the wrapper climbs back on top before giving up, so two plugins doing the same
// can never fight forever.
const MAX_REWRAPS = 5

export default function patchChat(): () => void {
	const { getModules } = finders
	const { withName } = filters
	let undo: (() => void) | undefined

	const unsubscribe = getModules(withName('RowManager'), (RowManager: any) => {
		// A throw in this callback can close the app when the module was already loaded
		// (docs/debugging/api-contracts.md), so all of it is guarded.
		try {
			const proto = RowManager?.prototype
			if (typeof proto?.generate !== 'function') {
				reportError(`${TAG} RowManager.prototype.generate not found`, new Error('missing'))
				return
			}

			// Show Tag's after-hook rebuilds the name from scratch ("Nick (@user)"), so the sprout
			// has to be added after it. A hook registered after this wrapper sits outside it, so
			// when that happens the wrapper puts a fresh copy back on top. addSprout is idempotent,
			// so the copies underneath doing it again is harmless.
			let active = true
			let rewraps = 0
			let rewrapTimer: ReturnType<typeof setTimeout> | undefined
			const installed: Array<{ wrapper: Function; original: Function }> = []

			const wrap = () => {
				const original = proto.generate
				const wrapper = function (this: unknown, ...args: any[]) {
					const ret = original.apply(this, args)
					if (active) {
						try {
							addSprout(args[0], ret)
						} catch (error) {
							reportError(`${TAG} chat badge failed:`, error)
						}
						if (proto.generate !== top() && rewraps < MAX_REWRAPS && rewrapTimer === undefined) {
							rewrapTimer = setTimeout(() => {
								rewrapTimer = undefined
								if (!active || proto.generate === top()) return
								rewraps++
								wrap()
							}, 0)
						}
					}
					return ret
				}
				proto.generate = wrapper
				if (proto.generate !== wrapper) {
					reportError(`${TAG} could not wrap generate`, new Error('read-only'))
					return
				}
				installed.push({ wrapper, original })
			}
			const top = () => installed[installed.length - 1]?.wrapper

			wrap()
			// If something wrapped it since, putting the original back would drop their hook too,
			// so those wrappers stay and just stop doing anything.
			undo = () => {
				active = false
				if (rewrapTimer !== undefined) clearTimeout(rewrapTimer)
				for (const { wrapper, original } of installed.reverse()) {
					if (proto.generate === wrapper) proto.generate = original
				}
			}
		} catch (error) {
			reportError(`${TAG} could not patch RowManager:`, error)
		}
	})

	return () => {
		unsubscribe()
		undo?.()
		undo = undefined
	}
}
