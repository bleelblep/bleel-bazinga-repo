/**
 * "Set timezone" in the ⋯ menu on someone's profile.
 *
 * `UserProfileOverflowMenu` renders Discord's `ContextMenu` with `items` as groups of
 * `{ label, action }` (checked on 352.6: [Add Friend Nickname … Apps], [Ignore, Block, Report]).
 * Discord holds direct references to both components, so patching their module exports does
 * nothing; they're matched by name as JSX elements are created instead, as Global Badges does.
 * The overflow menu is swapped for a wrapper that notes whose profile it is while it renders, and
 * the ContextMenu it creates during that render gets the row at the end of its first group.
 */

import { pickZone } from '../lib/picker'
import { zoneFor } from '../lib/resolve'
import { settings } from '../lib/state'
import { timeIn } from '../lib/zones'
import { before } from '@valenced/patcher'
import { ReactJSXRuntime } from '@valenced/react'
import { reportError } from '../../../../shared/report'

const TAG = '[Timezones]'

interface ProfileUser {
	id: string
	username?: string
	globalName?: string | null
}

interface OverflowMenuProps {
	user?: ProfileUser
	currentUser?: { id: string }
}

interface MenuItem {
	label: string
	action(): void
}

type Component = (props: any) => unknown

let profile: { user: ProfileUser; isSelf: boolean } | undefined
const wrappers = new WeakMap<Component, Component>()

function wrap(OverflowMenu: Component): Component {
	let wrapper = wrappers.get(OverflowMenu)
	if (!wrapper) {
		wrapper = function TimezonesProfileOverflowMenu(props: OverflowMenuProps) {
			const outer = profile
			profile = props?.user?.id
				? { user: props.user, isSelf: props.user.id === props.currentUser?.id }
				: undefined
			try {
				return OverflowMenu(props)
			} finally {
				profile = outer
			}
		}
		wrappers.set(OverflowMenu, wrapper)
	}
	return wrapper
}

function rowFor(user: ProfileUser): MenuItem {
	const found = zoneFor(user.id)
	const time = found && timeIn(found.zone, Date.now(), settings().hour24)
	return {
		label: time ? `Their time: ${time.time}${time.otherDay ? ` ${time.otherDay}` : ''}` : 'Set timezone',
		action: () => pickZone(user.id, user.globalName ?? user.username ?? 'this person'),
	}
}

function patchElement<Args extends [unknown, unknown?, ...unknown[]]>(args: Args): Args {
	const slots = args as unknown[]
	try {
		const type = slots[0]
		if (typeof type !== 'function') return args
		if (type.name === 'UserProfileOverflowMenu') {
			slots[0] = wrap(type as Component)
			return args
		}
		if (type.name !== 'ContextMenu' || !profile || profile.isSelf) return args

		const props = slots[1] as { items?: unknown } | undefined
		const groups = props?.items
		if (!Array.isArray(groups) || !Array.isArray(groups[0])) return args
		slots[1] = { ...props, items: [[...groups[0], rowFor(profile.user)], ...groups.slice(1)] }
	} catch (error) {
		reportError(`${TAG} profile menu failed:`, error)
	}
	return args
}

export default function patchProfileMenu(): () => void {
	const unpatches = [before(ReactJSXRuntime, 'jsx', patchElement), before(ReactJSXRuntime, 'jsxs', patchElement)]
	return () => {
		for (const unpatch of unpatches) unpatch()
		profile = undefined
	}
}
