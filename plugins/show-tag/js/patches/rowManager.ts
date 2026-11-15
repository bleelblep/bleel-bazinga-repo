import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { callNativeMethod } from '@valenced/modules/native'
import { withName } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { getErrorStack } from '@valenced/utils/error'
import { Platform } from 'react-native'
import { DEFAULTS } from '../index'
import { formatName, formatReplyName, isTagless, smallTagText } from '../lib/format'
import type { DiscordModules } from '@valenced/discord/types'
import type { PluginApi } from '@valenced/plugins/types'
import type { ShowTagStorage } from '../index'
import type { TagUser } from '../lib/format'

/** Builds the rows of the chat list. modules/messages/native/renderer/RowGenerator.tsx */
interface RowManager {
	prototype: {
		generate(row: unknown): MessageRow
	}
}

interface MessageRow {
	type?: number
	message?: RowMessage
}

/** The generated message: what the row draws, not the store record. */
interface RowMessage {
	/** The name shown in the header: the nickname when there is one, else the display name. */
	username?: string
	authorId?: string
	referencedMessage?: { message?: RowMessage }
	/**
	 * The small tag after the name (bots' "APP", "SYSTEM"), drawn natively by `MessageTagView`: 12 sp,
	 * one line, no caps, in `tagTextColor` on `tagBackgroundColor`. All colours are ARGB ints. Read
	 * from the 352.2 APK (`com.discord.chat.bridge.Message`, `MessageTagView`, layout
	 * `message_tag_view`). Tapping it sends `onTapTag`, whose JS `handleTapTag` only looks the message
	 * up (352.2 bundle), so a username there does nothing when tapped.
	 */
	tagText?: string
	tagTextColor?: number
	tagBackgroundColor?: number
	tagVerified?: boolean
	/** What kind of tag; only passed back on tap. `show-tag-below` asks the native half to move it under the name. */
	tagType?: string
	/** The timestamp's colour: Discord's muted text for the theme in use. */
	timestampColor?: number
}

interface UserStore {
	getUser(id: string): TagUser | undefined
}

const MessageRowType = 1

/** Read by Show Tag's native half (src/main/kotlin/.../ShowTagPlugin.kt): keep the two in step. */
const BELOW_MARKER = 'show-tag-below'

/**
 * For when another tag already holds the slot (Staff Tags, Pronouns): the native half draws the
 * username itself, after the name (`inline`) or on a line under it (`below`), and leaves that tag
 * alone. Format `show-tag-extra|<inline|below>|<argb int>|<text>`; usernames never contain `|`.
 * Also read by ShowTagPlugin.kt.
 */
const EXTRA_PREFIX = 'show-tag-extra|'

/**
 * Whether the native half is running and knows EXTRA_PREFIX (1.3.6+, after a restart). Android
 * only. Until it answers, or where it can't, a taken slot falls back to brackets as before.
 */
let nativeExtras = false

function checkNative(plugin: Api['plugin']) {
	if (Platform.OS !== 'android') return
	try {
		callNativeMethod('bleelblep.show-tag.status', [])
			.then(status => {
				nativeExtras = status?.hooked === true && status?.extras === true
			})
			.catch(() => {})
	} catch (e) {
		plugin.reportError(`Show Tag: native status failed: ${getErrorStack(e)}`)
	}
}

type Api = PluginApi<{ jsonStorage: ShowTagStorage }>

/**
 * Appends (or substitutes) the username on every generated chat row and its reply preview.
 *
 * `getModules`, not `lookupModule`: RowManager is chat UI and may not be initialised yet on a
 * cold launch, and a late start (switched on from the plugin list) finds it already loaded. Both
 * cases land here. Rows generated before the hook keep Discord's name until they redraw.
 */
export default function patchRowManager({ cleanup, jsonStorage, plugin }: Api) {
	checkNative(plugin)
	const UserStore = Stores.UserStore as DiscordModules.Flux.Store<UserStore>
	const settings = (): ShowTagStorage => ({ ...DEFAULTS, ...jsonStorage.cache })

	const rename = (
		message: RowMessage,
		{ onlyUsername, smallTag, below }: ShowTagStorage,
		reply: boolean,
	) => {
		if (message.username == null || !message.authorId) return
		const user = UserStore.getUser(message.authorId)
		if (isTagless(user)) return
		// Small and dim: into the tag slot after the name, or, when another plugin's tag (Staff Tags,
		// Pronouns) already holds it, drawn by the native half beside that tag. A bot's APP tag (it
		// has a tagType), no muted colour or no native half: brackets. Replies have no tag slot.
		if (
			smallTag &&
			!onlyUsername &&
			!reply &&
			typeof message.timestampColor === 'number'
		) {
			const text = smallTagText(message.username, user)
			// The name already says it: nothing to add.
			if (!text) return
			if (message.tagText == null) {
				message.tagText = text
				message.tagTextColor = message.timestampColor
				// Fully transparent: no pill behind it, just the text.
				message.tagBackgroundColor = 0
				message.tagVerified = false
				if (below) message.tagType = BELOW_MARKER
				return
			}
			if (nativeExtras && message.tagType == null) {
				message.tagType = `${EXTRA_PREFIX}${below ? 'below' : 'inline'}|${message.timestampColor}|${text}`
				return
			}
			// Otherwise on to the brackets.
		}
		message.username = reply
			? formatReplyName(message.username, user, onlyUsername)
			: formatName(message.username, user, onlyUsername)
	}

	cleanup(
		getModules(withName<RowManager>('RowManager'), ({ prototype }) => {
			cleanup(
				// This runs on the chat render path: anything escaping here takes down the whole
				// chat view, so the body is guarded and the row is returned on every path.
				after(prototype, 'generate', row => {
					const message = row?.type === MessageRowType ? row.message : null
					if (!message) return row

					try {
						const s = settings()
						rename(message, s, false)

						const reply = message.referencedMessage?.message
						if (reply) rename(reply, s, true)
					} catch (e) {
						plugin.reportError(
							`Show Tag: generate hook failed: ${getErrorStack(e)}`,
						)
					}

					return row
				}),
			)
		}),
	)
}

declare module '@valenced/modules/native' {
	interface NativeMethods {
		'bleelblep.show-tag.status': [
			[],
			{ hooked?: boolean; extras?: boolean } | null,
		]
	}
}
