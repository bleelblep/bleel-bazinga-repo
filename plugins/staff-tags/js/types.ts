/** What one tag may have changed about it. Everything is optional: absent means "as shipped". */
export interface TagOverride {
	/** Off hides this tag everywhere. */
	enabled?: boolean
	/** Replaces the label, e.g. "OWNER" -> "BOSS". */
	text?: string
	/** Id from `lib/icons.ts`, or "none". */
	icon?: string
	/** Pasted `<svg>` markup, used when `icon` is "custom". */
	customSvg?: string
	/** Show only the icon, without the label text. */
	iconOnly?: boolean
	/** Use `color` instead of the tag's own colour. */
	useCustomColor?: boolean
	/** Background colour as `#rrggbb`. */
	color?: string
	/** Fade from `color` to `gradientColor` across the tag. */
	useGradient?: boolean
	gradientColor?: string
}

export interface StaffTagsStorage {
	/** Tag backgrounds follow the member's top role colour instead of the tag's own. */
	useRoleColor: boolean
	/**
	 * Per-tag changes, keyed by tag id.
	 *
	 * A keyed object rather than an array because entries are only ever added or updated, never
	 * removed -- `jsonStorage.set()` deep-merges objects and cannot delete a key, so "reset" is
	 * written as an explicit empty override rather than a deletion (docs/coding-rules.md rule 6).
	 */
	tags: Record<string, TagOverride>
}
