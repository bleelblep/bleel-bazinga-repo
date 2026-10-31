/**
 * A scroll view that a Discord bottom sheet lets scroll.
 *
 * Discord's sheets are built on @gorhom/bottom-sheet. The sheet's own drag gesture only gives way
 * to lists it has been told about, gorhom's `BottomSheetScrollView` / `BottomSheetFlatList`, which
 * Discord's emoji and sticker lists use. A plain React Native ScrollView inside a sheet cannot be
 * scrolled: every drag goes to the sheet (seen on device in Character Counter's split sheet,
 * 2026-10-31, and in Pocket Browser's history list before it). Copied from Pocket Browser's
 * `js/ui/sheet.tsx`.
 *
 * gorhom's list is found by its exports when first drawn. It throws outside a gorhom sheet, so it
 * sits behind an error boundary that falls back to the plain list, which then scrolls as well as
 * it can. Call from a render: `valenced.*` is read here, so module scope is out (coding rule 1).
 */

import * as finders from '@valenced/modules/finders'
import * as filters from '@valenced/modules/finders/filters'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../report'

let found: { ScrollView?: any } | undefined

function gorhom() {
	if (found) return found
	found = {}
	try {
		const { lookupModules } = finders as any
		const { withProps } = filters as any
		for (const [exports] of lookupModules(withProps('BottomSheetScrollView', 'BottomSheetFlatList'))) {
			found = { ScrollView: exports.BottomSheetScrollView }
			break
		}
	} catch (error) {
		reportError('[sheetScroll] looking up the sheet list failed:', error)
	}
	// Not loaded yet: look again next time rather than caching the miss.
	if (!found.ScrollView) {
		const miss = found
		found = undefined
		return miss
	}
	return found
}

let Boundary: any
/** Built on first use: `valenced.*` isn't safe at module scope (docs/coding-rules.md rule 1). */
function boundary(): any {
	if (Boundary) return Boundary
	Boundary = class extends React.Component<{ fallback: () => any; children?: any }, { failed: boolean }> {
		state = { failed: false }
		static getDerivedStateFromError() {
			return { failed: true }
		}
		componentDidCatch(error: unknown) {
			reportError("[sheetScroll] the sheet's list failed; using a plain one:", error)
		}
		render() {
			return this.state.failed ? this.props.fallback() : this.props.children
		}
	}
	return Boundary
}

/** A ScrollView for inside a Discord bottom sheet. Same props as React Native's. */
export function SheetScrollView(props: any) {
	const Plain: any = (ReactNative as any).ScrollView
	const Sheet = gorhom()?.ScrollView
	if (!Sheet) return <Plain {...props} />
	const B = boundary()
	return (
		<B fallback={() => <Plain {...props} />}>
			<Sheet {...props} />
		</B>
	)
}
