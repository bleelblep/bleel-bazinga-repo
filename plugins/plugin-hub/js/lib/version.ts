/** A plugin version as Valenced hands it over: `{ label, nums }`. */
export interface Version {
	nums: number[]
	label: string | null
}

export function formatVersion(version: Version | null | undefined): string {
	if (!version?.nums?.length) return 'unknown'
	return version.label ? `${version.nums.join('.')}-${version.label}` : version.nums.join('.')
}

/** A version as Valenced hands it over (`{ label, nums }`) or as a string such as `0.5.0-beta9`. */
export function asVersion(value: any): Version | null {
	if (value && Array.isArray(value.nums)) {
		return { nums: value.nums.map(Number), label: value.label ?? null }
	}
	if (typeof value !== 'string' || !value.trim()) return null
	const [main, ...rest] = value.trim().replace(/^v/, '').split('-')
	const nums = main.split('.').map(part => Number.parseInt(part, 10))
	if (nums.some(n => !Number.isFinite(n))) return null
	return { nums, label: rest.length ? rest.join('-') : null }
}
