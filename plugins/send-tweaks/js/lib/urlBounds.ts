/** Separate a URL from the surrounding markdown before cleaning or protecting it. */
export function splitUrl(
	match: string,
	before: string,
): { url: string; tail: string } {
	let end = match.length
	let parentheses = 0
	for (let i = 0; i < end; i++) {
		if (match[i] === '(') parentheses++
		else if (match[i] === ')') {
			if (parentheses === 0) {
				end = i
				break
			}
			parentheses--
		}
	}
	// Only strip formatting delimiters when the URL is preceded by the corresponding opener.
	// Underscores and tildes can otherwise legitimately belong to a URL.
	const punctuation = /[.,!?;:\]}>'"]+$/.exec(match.slice(0, end))?.[0]
	if (punctuation) end -= punctuation.length
	const opener = /([*_~|]+)$/.exec(before)?.[1]
	if (opener) {
		const closer = [...opener].reverse().join('')
		if (match.slice(0, end).endsWith(closer)) end -= closer.length
	}
	return { url: match.slice(0, end), tail: match.slice(end) }
}
