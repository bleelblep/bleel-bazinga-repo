// SPDX-License-Identifier: GPL-3.0-only
//
// Ported from kmmiio99o/vd-plugins (the ServerDrawer plugin),
// https://github.com/kmmiio99o/vd-plugins/blob/main/plugins/ServerDrawer/src/patches/createElementIntercept.ts
// Copyright (C) kmmiio99o, licensed GPL-3.0. Full license text:
// ../../THIRD_PARTY_LICENSES/GPL-3.0.txt
//
// This file is a close adaptation of that original (renamed identifiers, added TypeScript
// types, ported from the classic Revenge/@vendetta API to Valenced's `valenced` global,
// otherwise the same structure and logic) and is therefore itself licensed GPL-3.0 -- unlike
// the rest of this repository, which is CC0. See NOTICE.md in this plugin's directory.

// Swapping a module's default export only catches call sites that resolve the component
// lazily; anything that already captured the original function reference in a closure keeps
// rendering it. Patching React.createElement itself catches every construction site, cached
// references included, because React always goes through this call to build an element.

import * as React from 'react'

interface Intercept {
	replacement: any
	extraProps?: Record<string, any>
}

const intercepts = new Map<any, Intercept>()
let original: typeof React.createElement | null = null
let patched = false

export function registerIntercept(target: any, replacement: any, extraProps?: Record<string, any>) {
	intercepts.set(target, { replacement, extraProps })
}

export function unregisterIntercept(target: any) {
	intercepts.delete(target)
}

export function patchCreateElement(cleanups: Array<() => void>) {
	if (patched) return

	original = React.createElement
	if (!original) return

	const wrapped = function (type: any, props: any, ...rest: any[]) {
		const entry = intercepts.get(type)
		if (entry) {
			const nextProps = entry.extraProps ? { ...props, ...entry.extraProps } : props
			return original!.call(React, entry.replacement, nextProps, ...rest)
		}
		return original!.call(React, type, props, ...rest)
	}

	Object.assign(wrapped, original)
	;(React as any).createElement = wrapped
	patched = true

	cleanups.push(() => {
		if (patched && original) {
			;(React as any).createElement = original
			patched = false
		}
		intercepts.clear()
	})
}
