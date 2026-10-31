import { reportError } from '../../../../shared/report'
import type { JsonStorage } from '@valenced/json-storage'
import type { StaffTagsStorage, TagOverride } from '../types'

export const TAG = '[StaffTags]'

/** Also the fallback for every read -- `load: true` does not await, so `cache` starts undefined. */
export const DEFAULTS: StaffTagsStorage = { useRoleColor: false, tags: {} }

type Storage = JsonStorage<StaffTagsStorage>

let storage: Storage | undefined

export function setStorage(value: Storage | undefined) {
	storage = value
}

/** Sub-pages are plain navigator routes with no plugin `api` prop, so they read through this. */
export function getStorage(): Storage | undefined {
	return storage
}

export function settings(): StaffTagsStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

/** One tag's changes, or an empty object when it has never been touched. */
export function overrideFor(id: string): TagOverride {
	return settings().tags?.[id] ?? {}
}

/** Merges into one tag's entry, leaving every other tag alone. */
export function setOverride(id: string, patch: Partial<TagOverride>) {
	try {
		storage?.set({ tags: { [id]: patch } } as Partial<StaffTagsStorage>)
	} catch (error) {
		reportError(`${TAG} could not save tag settings:`, error)
	}
}

/**
 * Puts one tag back to how it ships. Written as an explicit blank override rather than deleting
 * the key, because a merge cannot remove one (docs/coding-rules.md rule 6).
 */
export function resetOverride(id: string) {
	setOverride(id, {
		enabled: true,
		text: '',
		icon: 'none',
		customSvg: '',
		iconOnly: false,
		useCustomColor: false,
		color: '',
		useGradient: false,
		gradientColor: '',
	})
}
