/**
 * The frame behind a server in the list: `GuildsBarAnimatedItemWrapper` draws the item's
 * background and selection, and still takes the pre-redesign `circle` prop (corner = size / 2;
 * otherwise GUILD_ITEM_SELECTED_BORDER_RADIUS). Up to 336 `GuildsBarGuild` passed
 * `circle: !selected && ...`; the redesign passes nothing. Setting it again on unselected items
 * gives the classic look: round servers, and the selected one a rounded square. With "always
 * round" it's set on the selected one too.
 *
 * Folders get it too (a closed folder is a circle, an open one a pill); a drag target squares up on purpose.
 */

import { getModuleByPath } from '../../../../shared/modules'
import { reportError } from '../../../../shared/report'
import { settings } from '../lib/settings'
import { before } from '@valenced/patcher'

const TAG = '[Round Corners]'
const WRAPPER = 'modules/guilds_bar/native/GuildsBarAnimatedItemWrapper.tsx'

export default function patchSelectionFrame(): () => void {
	let unpatch: (() => void) | undefined
	const unsubscribe = getModuleByPath(
		WRAPPER,
		null,
		(mod: any) => {
			if (typeof mod?.default !== 'function') throw new Error('no default component')
			unpatch = before(mod, 'default', (args: any[]) => {
				try {
					const props = args[0]
					const s = settings()
					if (s.serverIcons && props && typeof props === 'object' && !props.circle && !props.isDragTarget) {
						if (!props.selected || s.selected === 'round') args[0] = { ...props, circle: true }
					}
				} catch (error) {
					reportError(`${TAG} selection frame:`, error)
				}
				return args // a before-hook must return the args array
			})
		},
		TAG,
	)
	return () => {
		unsubscribe()
		unpatch?.()
	}
}
