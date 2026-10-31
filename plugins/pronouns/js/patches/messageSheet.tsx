/**
 * "Pronouns…" in the message long-press sheet: the per-user override entry point.
 *
 * The badge itself is drawn natively from row data, so it can't take presses — the long-press
 * sheet is the closest long-press flow. This hooks `ActionSheetActionCreators.openLazy` and
 * injects a row into the sheet the same way Screenshot Redactor does
 * (`plugins/screenshot-redactor/js/patches/messageActionSheet.tsx`), whose header comment explains
 * the choices here: the sheet module's name is unknown (openLazy's key names it), and the row
 * groups are found inside the real ActionSheet with the shared `findMessageSheetGroupParent`.
 */

import { getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { after, before } from '@valenced/patcher'
import { isValidElement } from 'react'
import { findMessageSheetGroupParent } from '../../../../shared/messageSheet'
import { reportError } from '../../../../shared/report'
import { isOnActiveList, setOnActiveList } from '../lib/filter'
import { promptOverride } from '../lib/promptOverride'
import { settings } from '../lib/state'
import { showToast } from '../lib/toast'
import type { PluginApi } from '@valenced/plugins/types'
import type { ReactElement, ReactNode } from 'react'
import type { PronounsStorage } from '../lib/state'

const TAG = '[Pronouns]'

/** The parts of a message record the rows read. */
interface SheetMessage {
	author?: { id: string; globalName?: string | null; username?: string }
}

/**
 * A message sheet module: `default` renders the sheet from `{ message }` props. Typed as a plain
 * function (what the sheets are) so the hooks see one signature, not React's component union.
 */
interface SheetModule {
	default: (props: { message?: SheetMessage }) => ReactNode
}

interface ElementWithChildren extends ReactElement {
	props: { children?: ReactNode; message?: SheetMessage }
}

type Cleanup = PluginApi<{ jsonStorage: PronounsStorage }>['cleanup']

function isMessageSheet(key: string) {
	return /message/i.test(key) && !/channel|forum|guild|thread/i.test(key)
}

/** The message the sheet is about, from the stashed props or a walk of the rendered tree. */
function findMessage(
	rendered: ReactNode,
	fromProps?: SheetMessage,
): SheetMessage | undefined {
	if (fromProps?.author) return fromProps
	const seen = new Set<unknown>()
	let found: SheetMessage | undefined
	const visit = (node: ReactNode, depth: number) => {
		if (found || !node || depth > 30 || seen.has(node)) return
		seen.add(node)
		if (Array.isArray(node)) {
			for (const child of node) visit(child, depth + 1)
			return
		}
		if (!isValidElement(node)) return
		const { props } = node as ElementWithChildren
		if (props.message?.author) {
			found = props.message
			return
		}
		visit(props.children, depth + 1)
	}
	visit(rendered, 0)
	return found
}

function authorName(message: SheetMessage, fallback: string): string {
	return message.author?.globalName ?? message.author?.username ?? fallback
}

function promptOverrideFor(message: SheetMessage) {
	const authorId = String(message.author?.id ?? '')
	if (!authorId) return
	promptOverride(authorId, authorName(message, 'this person'))
}

function buildRow(message: SheetMessage) {
	const { ActionSheetRow } = Design
	const authorId = String(message.author?.id ?? '')
	if (!authorId) return null

	const existing = settings().overrides?.[authorId]
	const label =
		typeof existing === 'string' ? `Pronouns: ${existing}` : 'Pronouns…'

	const onPress = () => {
		try {
			ActionSheetActionCreators.hideActionSheet()
		} catch {
			/* most rows close the sheet themselves; not worth failing the dialog over */
		}
		promptOverrideFor(message)
	}

	return (
		<ActionSheetRow.Group>
			<ActionSheetRow
				label={label}
				subLabel="Set or clear what the badge next to their name shows"
				icon={
					<ActionSheetRow.Icon source={getAssetIdByName('UserCircleIcon')} />
				}
				onPress={onPress}
			/>
			{filterRow(message)}
		</ActionSheetRow.Group>
	)
}

/** "Show / hide their pronouns", for the list the current mode edits; none in "everyone" mode. */
function filterRow(message: SheetMessage) {
	const { ActionSheetRow } = Design
	const mode = settings().filterMode
	if (mode !== 'only' && mode !== 'except') return null
	const authorId = String(message.author?.id ?? '')
	if (!authorId) return null
	const name = authorName(message, authorId)
	const listed = isOnActiveList(authorId)
	// On the show list = shown; on the hide list = hidden.
	const shown = mode === 'only' ? listed : !listed
	const onPress = () => {
		try {
			ActionSheetActionCreators.hideActionSheet()
		} catch {
			/* see buildRow */
		}
		try {
			setOnActiveList(authorId, name, !listed)
			showToast(
				shown
					? `Hiding pronouns for ${name}.`
					: `Showing pronouns for ${name}.`,
				'PronounsFilterToast',
			)
		} catch (error) {
			reportError(`${TAG} updating the list failed:`, error)
		}
	}
	return (
		<ActionSheetRow
			label={shown ? 'Hide their pronouns' : 'Show their pronouns'}
			subLabel={
				mode === 'only'
					? 'Badges only show for people you pick'
					: 'Badges show for everyone but people you hid'
			}
			icon={
				<ActionSheetRow.Icon
					source={getAssetIdByName(shown ? 'EyeSlashIcon' : 'EyeIcon')}
				/>
			}
			onPress={onPress}
		/>
	)
}

function inject(
	rendered: ReactNode,
	message: SheetMessage | undefined,
): boolean {
	if (!message) return false
	const row = buildRow(message)
	if (!row) return false
	const { ActionSheet, ActionSheetRow } = Design
	const parent = findMessageSheetGroupParent(
		rendered,
		ActionSheet,
		ActionSheetRow.Group,
	) as ElementWithChildren | undefined
	if (!parent) return false
	const children = parent.props.children
	if (Array.isArray(children)) {
		children.unshift(row)
	} else {
		// Single child: promote it to an array so the new group can sit alongside it. Mutating a
		// rendered element's props is how staff-tags adds its tag too — React only freezes props
		// in development builds.
		parent.props.children = [row, children]
	}
	return true
}

const patchedModules = new WeakSet<object>()

function patchSheetModule(mod: SheetModule, cleanup: Cleanup): SheetModule {
	if (!mod || typeof mod.default !== 'function') return mod
	if (patchedModules.has(mod)) return mod
	let pendingMessage: SheetMessage | undefined

	cleanup(
		before(mod, 'default', args => {
			pendingMessage = args[0]?.message
			return args
		}),
		after(mod, 'default', rendered => {
			try {
				if (rendered != null)
					inject(rendered, findMessage(rendered, pendingMessage))
			} catch (error) {
				reportError(`${TAG} sheet injection failed:`, error)
			}
			pendingMessage = undefined
			return rendered
		}),
	)
	patchedModules.add(mod)
	return mod
}

export default function patchMessageSheet(cleanup: Cleanup) {
	cleanup(
		before(ActionSheetActionCreators, 'openLazy', args => {
			try {
				const [sheet, key] = args
				if (
					typeof key === 'string' &&
					isMessageSheet(key) &&
					sheet &&
					typeof sheet.then === 'function'
				) {
					// A *derived* promise, not a `.then` bolted onto theirs: the sheet component
					// openLazy receives cannot resolve until after the row has been added, so
					// there is no race with their own resolution handler.
					args[0] = sheet.then(mod =>
						patchSheetModule(mod as SheetModule, cleanup),
					)
				}
			} catch (error) {
				reportError(`${TAG} openLazy hook failed:`, error)
			}
			// A before-hook must return the args array -- returning nothing sets args to
			// undefined for every later hook. Outside the try so it survives a throw above.
			return args
		}),
	)
}
