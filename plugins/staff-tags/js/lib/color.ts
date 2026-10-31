/** `#RRGGBB` for anything recognisable (`#F0B232`, `f0b232`, `#abc`, `240, 178, 50`), otherwise undefined. */
export function parseColor(input: string): string | undefined {
	const value = input.trim()
	if (!value) return undefined

	const hex = value.replace(/^#/, '')
	if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`
	// Shorthand: #abc means #aabbcc.
	if (/^[0-9a-f]{3}$/i.test(hex))
		return `#${hex
			.split('')
			.map(c => c + c)
			.join('')
			.toUpperCase()}`

	const rgb = value.match(
		/^(?:rgba?)?\(?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i,
	)
	if (rgb) {
		const parts = [rgb[1], rgb[2], rgb[3]].map(n => Number.parseInt(n, 10))
		if (parts.every(n => n >= 0 && n <= 255))
			return `#${parts
				.map(n => n.toString(16).padStart(2, '0'))
				.join('')
				.toUpperCase()}`
	}

	return undefined
}

/**
 * Whether white text reads better than black on [hex]. Perceived brightness (ITU-R BT.601), 0-255;
 * below ~140 reads as a dark background. Anything that isn't a hex colour counts as dark.
 */
export function isDarkColor(hex: string): boolean {
	const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex)
	if (!match) return true

	const r = Number.parseInt(match[1], 16)
	const g = Number.parseInt(match[2], 16)
	const b = Number.parseInt(match[3], 16)
	return (r * 299 + g * 587 + b * 114) / 1000 < 140
}
