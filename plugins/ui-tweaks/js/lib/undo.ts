/**
 * Undo for the edit screens (settings page and long-press menu): a snapshot of the settings an
 * edit touches is taken before each change, and Undo puts the last one back.
 *
 * Maps like hiddenSettingsItems are stored with `null` for "not hidden", so restoring one sets
 * every key added since to null as well, whatever way the storage merges.
 */

import type { UITweaksStorage } from '../defaults'
import { settings, update } from './state'

type Snapshot = Partial<UITweaksStorage>

export function snapshot(keys: Array<keyof UITweaksStorage>): Snapshot {
	const s = settings() as any
	const out: any = {}
	for (const key of keys) {
		const value = s[key]
		out[key] = value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value
	}
	return out
}

export function restore(snap: Snapshot) {
	const s = settings() as any
	const patch: any = {}
	for (const [key, value] of Object.entries(snap)) {
		const now = s[key]
		if (value && typeof value === 'object' && now && typeof now === 'object') {
			patch[key] = { ...Object.fromEntries(Object.keys(now).map(k => [k, null])), ...value }
		} else patch[key] = value
	}
	update(patch)
}

export class UndoStack {
	private items: Snapshot[] = []

	constructor(private readonly keys: Array<keyof UITweaksStorage>) {}

	/** Call before a change. */
	record() {
		this.items.push(snapshot(this.keys))
		if (this.items.length > 30) this.items.shift()
	}

	undo(): boolean {
		const last = this.items.pop()
		if (!last) return false
		restore(last)
		return true
	}

	get size() {
		return this.items.length
	}

	clear() {
		this.items = []
	}
}
