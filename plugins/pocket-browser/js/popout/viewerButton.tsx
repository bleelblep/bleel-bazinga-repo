/**
 * A "Pop out" button in Discord's media viewer header, for videos and YouTube embeds.
 *
 * The header is `modules/media_viewer/native/components/overlay/MediaModalOverlayHeader.tsx`
 * (350.4 bundle): it gets the current `source` as a prop and renders `MediaViewerOverlayButton`s
 * (`{ accessibilityLabel, icon, onPress }`) -- the close button first, with an `XSmallIcon` -- and
 * a "…" menu. The wrapper finds the first such button in what the header returns and puts one of
 * the same component next to it, so it looks and behaves like Discord's own. Tapping it opens the
 * floating player and then presses the viewer's close button, so the video doesn't play twice.
 *
 * On 350.4 the header is a plain function exported by name (`MediaModalOverlayHeader`, no
 * `default`; 0.1.0 looked only at `default` and never found it). The viewer reads the export on
 * every render, so swapping it works live (verified 2026-10-11). It also gets `onClose`, which
 * closes the viewer after popping out. A memo export is wrapped through its `type` instead.
 */

import { showToast } from '../../../../shared/toast'
import { wrapRender } from '../../../../shared/wrapRender'
import { findModule } from './find'
import { native, type PopoutRequest } from './player'
import { requestFor } from './source'
import { settings } from '../lib/store'
import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import * as react from '@valenced/react'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const HEADER = 'modules/media_viewer/native/components/overlay/MediaModalOverlayHeader.tsx'
const EXPORTS = ['MediaModalOverlayHeader', 'default']
const TAG = '[Pop Out Player]'
const ICON_NAMES = ['WindowLaunchIcon', 'LinkExternalSmallIcon', 'ScreenArrowIcon']

let icon: any
let warned = false

function iconComponent(): any {
	if (icon !== undefined) return icon
	const { lookupModule } = finders
	const { withProps } = filters
	for (const name of ICON_NAMES) {
		const found = lookupModule<any>(withProps(name))?.[0]?.[name]
		if (found) return (icon = found)
	}
	return (icon = null)
}

/** The first overlay button in [tree] and the children array holding it. */
function findButton(tree: any): { holder: any; index: number; element: any } | undefined {
	let result: { holder: any; index: number; element: any } | undefined
	const isButton = (node: any) =>
		node?.props && typeof node.props.onPress === 'function' && node.props.icon != null && 'accessibilityLabel' in node.props
	const visit = (node: any, depth: number) => {
		if (result || !node || typeof node !== 'object' || depth > 14) return
		const children = node.props?.children
		if (Array.isArray(children)) {
			for (let i = 0; i < children.length && !result; i++) {
				if (isButton(children[i])) result = { holder: node, index: i, element: children[i] }
				else visit(children[i], depth + 1)
			}
		} else if (children && typeof children === 'object') {
			if (isButton(children)) result = { holder: node, index: -1, element: children }
			else visit(children, depth + 1)
		}
	}
	visit(tree, 0)
	return result
}

function askForPermission() {
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators as any
	const key = 'PopoutPlayerPermission'
	alerts.openAlert(
		key,
		<AlertModal
			title="Allow the floating player"
			content={'The player floats over other apps, so Android needs "Display over other apps" switched on for Discord. Turn it on, come back, and tap Pop out again.'}
			actions={
				<>
					<AlertActionButton
						text="Open settings"
						variant="primary"
						onPress={() => {
							alerts.dismissAlert(key)
							void native.requestOverlay()
						}}
					/>
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}

async function popOut(source: any, closeViewer: (() => void) | undefined) {
	const request = requestFor(source)
	if (!request) {
		showToast("This one can't be popped out.", 'PopoutPlayerToast')
		return
	}
	if (await openPopout(request)) {
		try {
			closeViewer?.()
		} catch {
			/* the viewer may already be closing */
		}
	}
}

/** Opens [request] in the player style from settings. True when it's playing. Shared with the browser's menu. */
export async function openPopout(request: PopoutRequest): Promise<boolean> {
	const mode = settings().popoutMode
	// Picture-in-picture needs no permission; the floating window needs "Display over other apps".
	if (mode === 'overlay' && !(await native.canOverlay())) {
		askForPermission()
		return false
	}
	const error = await native.open({ ...request, mode })
	if (error === 'overlay permission') {
		askForPermission()
		return false
	}
	if (error === 'pip unsupported') {
		showToast('This phone has picture-in-picture turned off. Switch Pop-out style to Floating window.', 'PopoutPlayerToast')
		return false
	}
	if (error) {
		showToast(`Couldn't pop it out (${error}).`, 'PopoutPlayerToast')
		return false
	}
	return true
}

function addButton(tree: any, props: any): any {
	const source = props?.source
	if (!source || !requestFor(source)) return tree
	const found = findButton(tree)
	if (!found) {
		if (!warned) {
			warned = true
			if (DEBUG) console.warn(`${TAG} no overlay button in the viewer header; can't place Pop out`)
		}
		return tree
	}
	const Icon = iconComponent()
	if (!Icon) return tree
	const { React } = react
	const button = React.createElement(found.element.type, {
		key: 'popout-player',
		accessibilityLabel: 'Pop out',
		icon: React.createElement(Icon, { size: 'md', color: 'interactive-text-active' }),
		onPress: () => void popOut(source, typeof props.onClose === 'function' ? props.onClose : found.element.props.onPress),
	})
	if (found.index < 0) found.holder.props.children = [button, found.element]
	else found.holder.props.children = [...found.holder.props.children.slice(0, found.index), button, ...found.holder.props.children.slice(found.index)]
	return tree
}

function wrapper(original: (...args: any[]) => any) {
	return function (this: unknown, ...args: any[]) {
		const tree = Reflect.apply(original, this, args)
		try {
			return addButton(tree, args[0])
		} catch (error) {
			reportError(`${TAG} viewer button failed:`, error)
			return tree
		}
	}
}

export default (): (() => void) => {
	const undo: Array<() => void> = []
	undo.push(
		findModule(HEADER, ['MediaModalOverlayHeader'], (mod: any) => {
			const key = EXPORTS.find(name => mod?.[name] != null)
			const value = key ? mod[key] : undefined
			// A memo: wrapped through its `type`.
			if (value && typeof value === 'object' && typeof value.type === 'function') {
				const restore = wrapRender({ default: value }, wrapper)
				if (restore) undo.push(restore)
				return
			}
			if (!key || typeof value !== 'function') {
				reportError(`${TAG} MediaModalOverlayHeader has an unknown shape: ${Object.keys(mod ?? {}).join(',')}`)
				return
			}
			const wrapped = wrapper(value)
			mod[key] = wrapped
			undo.push(() => {
				if (mod[key] === wrapped) mod[key] = value
			})
		}),
	)
	return () => {
		for (const fn of undo.reverse()) {
			try {
				fn()
			} catch {
				/* already gone */
			}
		}
	}
}
