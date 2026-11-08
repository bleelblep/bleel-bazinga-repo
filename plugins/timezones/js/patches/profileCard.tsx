/**
 * "Local time" card on someone's profile, so their time shows as soon as the profile opens
 * (the ⋯ menu row in patches/profileMenu.ts needed a tap first).
 *
 * Same spot as Review DB's card (plugins/review-db/js/patches/profileCard.tsx, checked on 352.6):
 * `UserProfileContent` renders the main tab as a fixed list of cards, the last being
 * `UserProfileConnections.UserProfileApplicationRoleConnectionsCard`, read off the module namespace at
 * render time. A hook on it adds a card after Connections without touching the list. `after` only
 * gets the return value (coding rule 2), so a `before` stashes the props for it.
 *
 * Only when a zone is known (yours, the shared list, or Equicord's) and never on your own profile.
 * Tapping the card opens the picker. The time ticks each minute while the profile is open.
 */

import { onEquicord } from '../lib/equicord'
import { pickZone } from '../lib/picker'
import { zoneFor } from '../lib/resolve'
import { onShared } from '../lib/shared'
import { onUpdate, settings } from '../lib/state'
import { timeIn, zoneName } from '../lib/zones'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import * as finders from '@valenced/discord/utils/modules/finders'
import { after, before } from '@valenced/patcher'
import * as React from 'react'
import { reportError } from '../../../../shared/report'

const TAG = '[Timezones]'
const PATH = 'modules/user_profile/native/UserProfileConnections.tsx'
const CARD_PATH = 'modules/user_profile/native/UserProfileCard.tsx'
const TARGET = 'UserProfileApplicationRoleConnectionsCard'

const WRAPPERS = new Set(['react.memo', 'react.forward_ref', 'react.lazy'].map(name => Symbol.for(name)))

/** A function, class, or memo / forwardRef / lazy wrapper: anything else would take the profile down. */
function isComponent(value: unknown): boolean {
	if (typeof value === 'function') return true
	return !!value && typeof value === 'object' && WRAPPERS.has((value as { $$typeof?: symbol }).$$typeof as symbol)
}

let profileCard: any
function ProfileCardComponent(): any {
	if (profileCard === undefined) {
		try {
			const mod = (finders as any).lookupModuleWithImportedPath(CARD_PATH)?.[0]
			profileCard = isComponent(mod?.default) ? mod.default : null
		} catch {
			profileCard = null
		}
	}
	return profileCard
}

function nameOf(userId: string): string {
	try {
		const user = (Stores as any).UserStore?.getUser?.(userId)
		return user?.globalName || user?.username || settings().people[userId]?.name || 'this person'
	} catch {
		return 'this person'
	}
}

function isSelf(userId: string): boolean {
	try {
		return (Stores as any).UserStore?.getCurrentUser?.()?.id === userId
	} catch {
		return false
	}
}

const SOURCE: Record<string, string> = { you: 'set by you', shared: 'from the shared list', equicord: "from Equicord's list" }

function LocalTimeCard({ userId }: { userId: string }) {
	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		const offs = [onUpdate(bump), onShared(bump), onEquicord(bump)]
		// To the next minute, then every minute, so the clock turns over with the phone's.
		let interval: ReturnType<typeof setInterval> | undefined
		const first = setTimeout(
			() => {
				bump()
				interval = setInterval(bump, 60_000)
			},
			60_000 - (Date.now() % 60_000),
		)
		return () => {
			for (const off of offs) off()
			clearTimeout(first)
			if (interval) clearInterval(interval)
		}
	}, [])

	const s = settings()
	if (!s.profileCard) return null
	const found = zoneFor(userId)
	if (!found) return null
	const time = timeIn(found.zone, Date.now(), s.hour24)
	if (!time) return null

	const D = Design as any
	const TableRowGroup = isComponent(D?.TableRowGroup) ? D.TableRowGroup : undefined
	const TableRow = isComponent(D?.TableRow) ? D.TableRow : undefined
	const UserProfileCard = ProfileCardComponent()
	if (!TableRowGroup || !TableRow || !UserProfileCard) return null

	const label = `${time.time}${s.showDay && time.otherDay ? ` ${time.otherDay}` : ''}`
	const subLabel = `${found.place ?? zoneName(found.zone)} · ${time.offset} · ${SOURCE[found.source] ?? ''}`
	return (
		<UserProfileCard title="Local time" titleStyle={{ marginBottom: 8 }}>
			<TableRowGroup hasIcons={false}>
				<TableRow label={label} subLabel={subLabel} arrow onPress={() => pickZone(userId, nameOf(userId))} />
			</TableRowGroup>
		</UserProfileCard>
	)
}

/** If the card itself throws on some Discord build, the profile still opens, without it. */
class Guard extends React.Component<{ children?: any }, { failed: boolean }> {
	state = { failed: false }
	static getDerivedStateFromError() {
		return { failed: true }
	}
	componentDidCatch(error: unknown) {
		reportError(`${TAG} profile card failed:`, error)
	}
	render() {
		return this.state.failed ? null : this.props.children
	}
}

export default function patchProfileCard(): () => void {
	const patches: Array<() => void> = []
	let lastProps: any
	let unsubscribe: (() => void) | undefined

	const apply = (mod: any) => {
		try {
			if (typeof mod?.[TARGET] !== 'function') {
				reportError(`${TAG} ${TARGET} not found on ${PATH}; no time card on profiles.`)
				return
			}
			patches.push(
				before(mod, TARGET, (args: any[]) => {
					lastProps = args?.[0]
					return args
				}),
				after(mod, TARGET, (ret: any) => {
					const props = lastProps
					lastProps = undefined
					const userId = props?.userId
					if (typeof userId !== 'string' || isSelf(userId)) return ret
					try {
						const card = (
							<Guard key="timezones-card">
								<LocalTimeCard userId={userId} />
							</Guard>
						)
						return ret ? (
							<>
								{ret}
								{card}
							</>
						) : (
							card
						)
					} catch (error) {
						reportError(`${TAG} profile card render failed:`, error)
						return ret
					}
				}),
			)
		} catch (error) {
			reportError(`${TAG} failed to hook the profile:`, error)
		}
	}

	try {
		unsubscribe = (finders as any).getModuleWithImportedPath(PATH, apply)
	} catch (error) {
		reportError(`${TAG} profile lookup failed:`, error)
	}

	return () => {
		unsubscribe?.()
		for (const unpatch of patches) unpatch()
		patches.length = 0
	}
}
