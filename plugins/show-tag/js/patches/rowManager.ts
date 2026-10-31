import { Stores } from '@valenced/discord/flux'
import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { getErrorStack } from '@valenced/utils/error'
import { DEFAULTS } from '../index'
import { formatName, formatReplyName, isTagless } from '../lib/format'
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
}

interface UserStore {
	getUser(id: string): TagUser | undefined
}

const MessageRowType = 1

type Api = PluginApi<{ jsonStorage: ShowTagStorage }>

/**
 * Appends (or substitutes) the username on every generated chat row and its reply preview.
 *
 * `getModules`, not `lookupModule`: RowManager is chat UI and may not be initialised yet on a
 * cold launch, and a late start (switched on from the plugin list) finds it already loaded. Both
 * cases land here. Rows generated before the hook keep Discord's name until they redraw.
 */
export default function patchRowManager({ cleanup, jsonStorage, plugin }: Api) {
	const UserStore = Stores.UserStore as DiscordModules.Flux.Store<UserStore>
	const settings = (): ShowTagStorage => ({ ...DEFAULTS, ...jsonStorage.cache })

	const rename = (
		message: RowMessage,
		onlyUsername: boolean,
		reply: boolean,
	) => {
		if (message.username == null || !message.authorId) return
		const user = UserStore.getUser(message.authorId)
		if (isTagless(user)) return
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
						const { onlyUsername } = settings()
						rename(message, onlyUsername, false)

						const reply = message.referencedMessage?.message
						if (reply) rename(reply, onlyUsername, true)
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
