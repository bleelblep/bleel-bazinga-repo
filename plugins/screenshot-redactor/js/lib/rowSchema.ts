/**
 * The chat bridge wire format, taken from Discord's own serializers rather than guessed.
 *
 * Everything the message list draws crosses the JS/native boundary exactly once, as the JSON
 * argument to `DCDChatManager.updateRows`. That JSON is deserialized on the native side by
 * kotlinx.serialization classes whose generated `$$serializer`s name every field explicitly, and
 * those classes are readable in the jadx decompile of the shipped APK:
 *
 *   com/discord/chat/bridge/row/RowSerializer.java      — the row discriminator
 *   com/discord/chat/bridge/row/MessageRow$$serializer  — the row envelope
 *   com/discord/chat/bridge/Message$$serializer         — every field on a message
 *   com/discord/chat/bridge/referencedmessage/…         — the reply preview
 *
 * This matters because the plugin's previous field lists came from `dumpRowShape` — a one-shot
 * dump of a single row that had actually been scrolled past. That can only ever report fields
 * that happened to be populated on that row, which is exactly how `clanTag`/`clanBadgeUrl` went
 * unnoticed for fifteen releases. A schema read from the deserializer lists every field that
 * *can* be present, whether or not this account has ever received one.
 *
 * Schema below is from Discord Android 337.10.
 */

import { redactedAvatarUrl, redactedName } from './alias'
import { findSensitive } from './bodyPatterns'
import { blankValues, collectText } from './bodyText'
import { noteAvatarKey, noteMentionRedacted } from './diagnostics'
import { isSnowflake } from './userArgs'
import type { RedactionStyle } from '../types'

/**
 * `ChangeType`, an `IntEnum` — serialized as the bare integer, not the name.
 * From `com/discord/chat/bridge/ChangeType.java`.
 */
export const ChangeType = {
	NOOP: 0,
	INSERT: 1,
	UPDATE: 2,
	DELETE: 3,
} as const

/**
 * Identifying fields on a `Message`, grouped by how confident we are that clearing them is safe.
 *
 * ## Clearing with `""` is what broke the client in 0.16.0
 *
 * `clanBadgeUrl: ""` is not "absent" — it is an image URI Discord tries to load. Every field here
 * is therefore cleared to `null`, which is what the wire format actually uses for absent values
 * (all of these are `@Optional` nullable properties in the Kotlin classes). The README's
 * instruction for retrying the badge fields was "switch the clearing to `undefined` (or `null`)
 * first"; this is that.
 */

/** Swapped for a placeholder avatar, not cleared — a message with no avatar looks broken. */
export const AVATAR_URL_KEYS = ['avatarURL'] as const

/** Nitro decorations and role icons — say something about the account even once the face is gone. */
export const ORNAMENT_KEYS = ['avatarDecorationURL', 'roleIcon'] as const

/**
 * The server-tag badge and friends.
 *
 * ## The native serializer is not the JS row shape — read the device for this list
 *
 * 0.18.0 populated this from `Message$$serializer` and got it **wrong**: that class lists what
 * the native side will *accept*, which overlaps with but is not the same as what JS actually puts
 * on a row. It named `tagText`/`tagType`/`connectionsRoleTag`, which on a real device are
 * `null`/`undefined` on every message seen — and it omitted the three fields that are actually
 * populated, which are the `clan*` ones the original row dump found all along.
 *
 * It also invented `avatarURLs`, which does not exist on the JS row at all.
 *
 * The lesson is not "the decompile was useless" — it answered the bridge protocol and the DM
 * header correctly. It is that a *deserializer* is authoritative for the wire format and a
 * *device dump* is authoritative for what is on the object. For "which fields carry an identity
 * right now", the dump wins. The `tag*` names are kept because they are real fields that a future
 * build may start populating, and clearing an already-null field costs nothing.
 *
 * Off by default: clearing this family is precisely what visibly broke the client in 0.16.0.
 * The cause is understood — that code assigned `""`, and `clanBadgeUrl: ""` is an image URI
 * Discord tries to load, where absent is `null` — and this clears to `null`. But that was a
 * confident diagnosis last time too.
 */
export const BADGE_KEYS = [
	// Confirmed populated on a real message, Discord 340.9.
	'clanTag',
	'clanTagGuildId',
	'clanBadgeUrl',
	// Present but null/undefined on every row observed so far; harmless to clear, and they are
	// where the same badge appears to be migrating.
	'tagText',
	'tagAccessibilityLabel',
	'tagVerified',
	'tagType',
	'tagIconUrl',
	'opTagText',
	'connectionsRoleTag',
	// Custom name styling from collectibles — narrows down what the account owns.
	'displayNameStyles',
	'lobbyAdditionalName',
	'lobbyTagIconUrl',
] as const

/**
 * Every field on a `Message` that can carry an identity, for the audit line in Diagnostics.
 * Deliberately includes the ones this plugin does *not* redact, because the failure mode is
 * silent: anything present on a row and not listed here is in the screenshot by default.
 */
export const KNOWN_IDENTITY_KEYS: readonly string[] = [
	...AVATAR_URL_KEYS,
	...ORNAMENT_KEYS,
	...BADGE_KEYS,
	'username',
	'authorId',
	// Not redacted, and that is a deliberate choice rather than an oversight: role colour is a
	// weak signal on its own, and blanking it changes the look of the message enough that the
	// screenshot stops resembling what the user saw.
	'usernameColor',
	'roleColor',
	'colorString',
	'shouldShowRoleDot',
	'shouldShowRoleOnName',
]

/**
 * Inline `@mentions`, which are **content nodes on the row** and not resolved names.
 *
 * This is the correct layer for them, and finding that out took fifteen releases of patching the
 * wrong one. `patches/displayName.ts` hooks Discord's shared name resolvers, which covers the
 * member list, profile sheets and the autocomplete — and does nothing at all for a mention inside
 * a message, because by the time a message reaches the screen its mentions are already text.
 *
 * `com/discord/chat/bridge/contentnode/UserOrRoleMentionContentNode$$serializer` names the wire
 * shape exactly:
 *
 * ```
 * PluginGeneratedSerialDescriptor("mention", …, 6)
 *   channelId(opt)  userId(opt)  roleColor(opt)  guildId(opt)  roleId(opt)  content(required)
 * ```
 *
 * and `content` is a `List<ContentNode>` — the visible `@Name` is a child `text` node
 * (`PluginGeneratedSerialDescriptor("text", …, 1)`, one `content` string). So the name is baked
 * into the row JSON on the JS side and then lives in Kotlin like every other row field.
 *
 * Two consequences:
 *
 * - **It redacts here or nowhere.** There is no resolver left to hook downstream of this.
 * - **It comes free with the repaint.** Mentions are rewritten by the same pass over the same
 *   object as the username and avatar, so they follow the toggle exactly as those do.
 *
 * A role mention (`roleId`, no `userId`) is left alone: it names a group, not a person, and
 * blanking it would make the message harder to read for no privacy gain.
 */
const MENTION_TYPE = 'mention'

/** Nesting guard. A mention inside bold inside a quote is three deep; 16 is far past real. */
const MAX_CONTENT_DEPTH = 16

/**
 * Content arrays this plugin has already copied, so the second pass over the same row (RowManager,
 * then ChatManager.updateRows) edits its own copy instead of copying again.
 */
const ownedContent = new WeakSet<object>()

/** A structural copy of a JSON-shaped content tree. Primitives are shared as-is. */
function cloneContent(value: any, depth = 0): any {
	if (
		depth > MAX_CONTENT_DEPTH * 2 ||
		value === null ||
		typeof value !== 'object'
	)
		return value
	if (Array.isArray(value))
		return value.map(entry => cloneContent(entry, depth + 1))
	const copy: Record<string, any> = {}
	for (const key of Object.keys(value))
		copy[key] = cloneContent(value[key], depth + 1)
	return copy
}

/**
 * Gives `message` a private copy of its content before anything in it is rewritten.
 *
 * A generated row's `content` is **Discord's parse cache**, not a fresh parse:
 * `parseMessageMarkup` (`modules/messages/native/renderer/MarkupParsers.tsx`, 348.x) memoizes
 * its result per message record and returns the same object on every regeneration. Redacting it
 * in place wrote the placeholders into that cache, so they survived turning redaction off until
 * Discord was reloaded -- the "leftover placeholders" RELOAD_NOTICE warned about. The row object
 * itself is rebuilt per generation, so pointing it at a copy leaves the cache untouched.
 */
function ownContent(message: any) {
	const content = message?.content
	if (!Array.isArray(content) || ownedContent.has(content)) return
	const copy = cloneContent(content)
	ownedContent.add(copy)
	message.content = copy
}

export interface RedactOptions {
	style: RedactionStyle
	avatars: boolean
	badges: boolean
	self: boolean
	/** Blank emails, phone numbers, addresses and keys typed into the message body. */
	bodyDetails?: boolean
	/**
	 * The current user's id, for mentions.
	 *
	 * A message knows whether *you wrote it* (`isCurrentUserMessageAuthor`), which is all the
	 * `self` check needed until mentions — a mention of you inside someone else's message has no
	 * such flag, so the id has to be passed in. Resolved and memoized by the callers rather than
	 * read from the store here, so this file stays free of `valenced.*` and stays testable.
	 */
	selfId?: string
}

function clear(target: any, keys: readonly string[]) {
	for (const key of keys) {
		// `!= null` on purpose: absent is absent, whether it arrived as null or undefined, and
		// writing null over null would mark rows as changed for no reason.
		if (target[key] != null) {
			target[key] = null
			noteAvatarKey(key)
		}
	}
}

/**
 * Rewrites every user mention in a content-node tree, in place.
 *
 * Gated on `userId` rather than on the node's `type` string, for the same reason `redactRows`
 * gates on `authorId` rather than on `rowType`: a discriminator can be renamed between builds and
 * the failure would be silent, whereas "this node carries a user id" is what actually makes it
 * identifying. The `type` check is kept as a cheap first test, with the id check as the one that
 * decides.
 *
 * Idempotent: the replacement is derived from `userId`, which is left untouched, so running over
 * an already-redacted tree produces the same tree. That matters because `patches/rowManager.ts`
 * and `patches/chatManager.ts` both call this on the same object.
 *
 * @returns how many mentions were rewritten.
 */
/**
 * Overwrites the visible text inside a mention's children, in place.
 *
 * **Rewriting rather than replacing, deliberately.** The obvious implementation is
 * `node.content = [{ type: "text", content: name }]`, and it would be a guess in two places at
 * once: that the discriminator property is called `type`, and that `"text"` is the value it takes
 * on the JS object. The native `$$serializer` names those in the *wire* format, and this plugin
 * has already shipped one wrong fix from treating the deserializer as authoritative about the JS
 * row (see the note on `BADGE_KEYS`). A node this function did not construct cannot be a node the
 * native side refuses to deserialize.
 *
 * The first text child becomes the placeholder and the rest are emptied, which handles a mention
 * whose name was split across nodes without changing how many children there are.
 *
 * @returns true if anything actually changed — false when it was already redacted, which is the
 * normal case on the second pass, since `patches/rowManager.ts` and `patches/chatManager.ts` both
 * run over the same object.
 */
function rewriteText(children: any, text: string, depth = 0): boolean {
	if (!Array.isArray(children) || depth > MAX_CONTENT_DEPTH) return false

	let changed = false
	let first = true

	for (const child of children) {
		if (!child || typeof child !== 'object') continue

		if (typeof child.content === 'string') {
			const replacement = first ? text : ''
			if (child.content !== replacement) {
				child.content = replacement
				changed = true
			}
			first = false
		} else if (Array.isArray(child.content)) {
			// A styled mention -- bold, for instance -- keeps its text one level further down.
			if (rewriteText(child.content, first ? text : '', depth + 1))
				changed = true
			first = false
		}
	}

	return changed
}

export function redactContentNodes(
	nodes: any,
	options: RedactOptions,
	depth = 0,
): number {
	if (!Array.isArray(nodes) || depth > MAX_CONTENT_DEPTH) return 0

	let redacted = 0

	for (const node of nodes) {
		if (!node || typeof node !== 'object') continue

		const userId = node.userId

		// Two ways in, because only one of them is certain. The serial name `"mention"` comes
		// from the deserializer and is solid; that it arrives on a property called `type` is an
		// assumption about how the polymorphic serializer writes its discriminator, and this
		// plugin has been burned before by treating the native schema as the JS object's shape.
		// So a node that carries a user id *and* a child list counts as a mention whatever it
		// calls itself — while `Array.isArray(node.content)` keeps this away from the various
		// non-content payloads that also carry a `userId` (`UserNameOnClick`, and friends),
		// none of which have children to replace.
		const isMention =
			isSnowflake(userId) &&
			(node.type === MENTION_TYPE || Array.isArray(node.content))

		if (isMention) {
			// A mention of yourself, in someone else's message. `isCurrentUserMessageAuthor`
			// says nothing about this case, which is why the id is passed in.
			if (options.self || userId !== options.selfId) {
				// Discord renders the mention text with its own leading "@".
				if (
					rewriteText(node.content, `@${redactedName(userId, options.style)}`)
				) {
					noteMentionRedacted()
					redacted++
				}
			}
			// Deliberately no recursion into a mention we just handled: its children are the
			// name, and `rewriteText` has already dealt with all of them.
			continue
		}

		// Anything else that nests -- bold, italics, block quotes, headings, list items -- can
		// contain a mention, so the whole tree is walked rather than just the top level.
		if (Array.isArray(node.content))
			redacted += redactContentNodes(node.content, options, depth + 1)
		if (Array.isArray(node.items))
			redacted += redactContentNodes(node.items, options, depth + 1)
	}

	return redacted
}

/**
 * Rewrites one `Message` in place. Returns true if anything was changed.
 *
 * Idempotent by construction — every replacement is derived from `authorId` rather than from the
 * current value of the field — so it is safe for this to run over a row that `RowManager`'s hook
 * already redacted, which is the normal case while both patches are installed.
 */
export function redactMessage(message: any, options: RedactOptions): boolean {
	if (!message || typeof message !== 'object') return false

	// Every rewrite below edits content nodes in place, so they must be ours first.
	ownContent(message)

	// Mentions and the reply preview are handled **before** either early return below, and that
	// ordering is load-bearing. Both name someone other than the author:
	//
	// - a message *you wrote* can @-mention someone else, and "redact me too" being off must not
	//   mean "and everyone you talked to"
	// - a row with no `authorId` at all can still carry a mention
	//
	// The old code returned early on both and skipped them, which also meant a reply preview
	// inside one of your own messages kept the name of the person you replied to.
	let changed = redactContentNodes(message.content, options) > 0

	// The reply preview is a whole nested Message (LoadedReferencedMessage = {state, message,
	// systemContent}), so it redacts through exactly the same path rather than a parallel
	// implementation that can drift. `state` 0 is LOADED; a system reference carries no author.
	const referenced = message.referencedMessage
	if (referenced?.message) {
		// Reply previews can also come from a shared parser/row cache. Own the nested envelope
		// before replacing names, not just its content array.
		message.referencedMessage = {
			...referenced,
			message: { ...referenced.message },
		}
		if (redactMessage(message.referencedMessage.message, options))
			changed = true
	}

	// The message body. Deliberately before the author checks below: what somebody typed is
	// worth blanking whether or not the row names them, and "redact me too" being off must not
	// mean your own messages keep leaking an address.
	if (options.bodyDetails && Array.isArray(message.content)) {
		const text = collectText(message.content)
		if (text) {
			const values = findSensitive(text).map(hit => hit.value)
			if (values.length && blankValues(message.content, values) > 0)
				changed = true
		}
	}

	const authorId = message.authorId
	if (typeof authorId !== 'string' || !authorId) return changed

	if (!options.self) {
		// `isCurrentUserMessageAuthor` is on the wire already (Message$$serializer), so the
		// common case needs no store lookup at all on a path that runs per row.
		if (
			message.isCurrentUserMessageAuthor === true ||
			authorId === options.selfId
		)
			return changed
	}

	if (typeof message.username === 'string') {
		// Reply previews store the name "@"-prefixed. Keeping the prefix means the row still
		// reads as a reply preview rather than as a broken string.
		const hadAt = message.username.startsWith('@')
		message.username = redactedName(authorId, options.style)
		if (hadAt) message.username = `@${message.username}`
	}

	if (options.avatars) {
		for (const key of AVATAR_URL_KEYS) {
			if (typeof message[key] === 'string') {
				message[key] = redactedAvatarUrl(authorId)
				noteAvatarKey(key)
			}
		}
		clear(message, ORNAMENT_KEYS)
	}

	if (options.badges) clear(message, BADGE_KEYS)

	return true
}

/** Every message-bearing row in a batch, redacted. @returns how many rows were rewritten. */
export function redactRows(rows: any[], options: RedactOptions): number {
	let redacted = 0

	for (const row of rows) {
		// Gate on carrying an author, not on the row's `type` discriminator. The old hook
		// gated on `rowType === 1` and had no way to tell "a divider, correctly skipped" from
		// "a system message that names someone, silently leaked" — README open question 5.
		// Anything with an authorId is a thing that identifies a person, whatever row it is.
		if (redactMessage(row?.message, options)) redacted++
	}

	return redacted
}
