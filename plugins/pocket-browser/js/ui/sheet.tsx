/**
 * Scrolling that the picker's sheet knows about.
 *
 * The expression picker sits in Discord's keyboard sheet (modules/keyboard/native/
 * PortalKeyboardBottomSheet.tsx, built on @gorhom/bottom-sheet). The sheet's own drag-to-close
 * gesture only gives way to lists it has been told about -- gorhom's `BottomSheetScrollView` /
 * `BottomSheetFlatList`, which Discord's emoji and sticker lists use. A plain React Native
 * ScrollView isn't one, so a drag that starts on empty space between rows (where no row's own
 * touch handling claims it) went to the sheet, which tried to close.
 *
 * So the History list uses gorhom's versions, found by their exports when first drawn.
 * They throw outside a gorhom sheet, so each sits behind an error boundary that falls back to the
 * plain React Native list, which scrolls fine and only loses that hand-off.
 */

import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'

const TAG = '[Pocket Browser]'

let found: { ScrollView?: any; FlatList?: any } | undefined

function gorhom() {
	if (found) return found
	found = {}
	try {
		const { lookupModules } = finders as any
		const { withProps } = filters as any
		for (const [exports] of lookupModules(withProps('BottomSheetScrollView', 'BottomSheetFlatList'))) {
			found = { ScrollView: exports.BottomSheetScrollView, FlatList: exports.BottomSheetFlatList }
			break
		}
	} catch (error) {
		reportError(`${TAG} looking up the sheet's lists failed:`, error)
	}
	// Not loaded yet: look again next time rather than caching the miss.
	if (!found.ScrollView || !found.FlatList) {
		const miss = found
		found = undefined
		return miss
	}
	return found
}

let Boundary: any
/** Built on first use: `valenced.*` isn't safe at module scope. */
function boundary(): any {
	if (Boundary) return Boundary
	Boundary = class extends React.Component<{ fallback: () => any; children?: any }, { failed: boolean }> {
		state = { failed: false }
		static getDerivedStateFromError() {
			return { failed: true }
		}
		componentDidCatch(error: unknown) {
			reportError(`${TAG} the sheet's list failed; using a plain one:`, error)
		}
		render() {
			return this.state.failed ? this.props.fallback() : this.props.children
		}
	}
	return Boundary
}

function sheetAware(kind: 'ScrollView' | 'FlatList', props: any, ref?: any) {
	const Plain: any = (ReactNative as any)[kind]
	const Sheet = gorhom()?.[kind]
	if (!Sheet) return <Plain ref={ref} {...props} />
	const B = boundary()
	return (
		<B fallback={() => <Plain ref={ref} {...props} />}>
			<Sheet ref={ref} {...props} />
		</B>
	)
}

export function SheetScrollView(props: any) {
	return sheetAware('ScrollView', props)
}

/** Pass `listRef` for scrollToIndex and friends. */
export function SheetFlatList({ listRef, ...props }: any) {
	return sheetAware('FlatList', props, listRef)
}
