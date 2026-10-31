import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { processColor } from 'react-native'
import { reportError } from '../../../../shared/report'
import { stores } from '../lib/discord'
import getTag from '../lib/getTag'
import { settings } from '../lib/state'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { User } from '../lib/discord'

/**
 * Message rows: the tag beside the author's name in chat.
 *
 * Message rows are drawn by native code from `getTagProperties`' result, which takes text and
 * colours, no components. So an icon shows here as its text glyph.
 */

interface Message {
	channel_id?: string
	author?: User
}

/** What Discord's row needs to draw a tag. A message with its own tag (bot, system) has `tagText`. */
interface TagProperties {
	tagText?: string
	tagType?: number
	tagTextColor?: unknown
	tagBackgroundColor?: unknown
	tagVerified?: boolean
}

interface GetTagPropertiesModule {
	default(input: { message?: Message }): TagProperties | undefined
}

function withStaffTag(
	ret: TagProperties | undefined,
	message: Message | undefined,
): TagProperties | undefined {
	// A message that already carries a tag (bot, system, automod...) is left alone.
	if (ret?.tagText || !message?.author) return ret

	const channel = stores.channel()?.getChannel(message.channel_id)
	const guild = stores.guild()?.getGuild(channel?.guild_id)
	const tag = getTag(guild, channel, message.author, settings().useRoleColor)
	if (!tag) return ret

	const glyph = tag.iconGlyph
	return {
		...ret,
		tagText: glyph ? (tag.iconOnly ? glyph : `${glyph} ${tag.text}`) : tag.text,
		tagTextColor: processColor(tag.textColor),
		tagBackgroundColor: processColor(tag.backgroundColor),
		tagVerified: tag.verified,
		tagType: undefined,
	}
}

export default function patchChat(cleanup: PluginCleanupApi) {
	cleanup(
		getModules(
			withName<GetTagPropertiesModule['default']>('getTagProperties'),
			exports => {
				// Valenced runs this callback as a bare engine job when the module is already loaded, and an
				// uncaught throw there can close the app.
				try {
					const module = exports as unknown as GetTagPropertiesModule
					if (typeof module?.default !== 'function') return
					cleanup(
						instead(module, 'default', function (args, original) {
							const ret = Reflect.apply(original, this, args)
							try {
								return withStaffTag(ret, args[0]?.message)
							} catch (error) {
								reportError('[StaffTags] chat tag failed:', error)
								return ret
							}
						}),
					)
				} catch (error) {
					reportError('[StaffTags] could not patch getTagProperties:', error)
				}
			},
			{ returnNamespace: true },
		),
	)
}
