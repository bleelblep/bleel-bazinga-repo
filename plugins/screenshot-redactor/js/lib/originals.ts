/**
 * What each message looked like before `patches/rowManager.ts` redacted it.
 *
 * The chat mirror (`lib/chatRows.ts`) must hold *unredacted* rows: turning redaction off repaints
 * from it. But when a chat is opened with redaction already on, `RowManager.generate` redacts each
 * row as Discord builds it, before the `updateRows` hook ever sees it -- so the mirror was filled
 * with placeholders, and switching off repainted the placeholders (0.27.x: "enable on another
 * screen, open the chat, toggle off: names stay censored"). Enabling inside an open chat worked,
 * because those rows had been mirrored before redaction started.
 *
 * So the row hook records a copy of each message just before redacting it, and the mirror swaps
 * it back in by message id. Pure data, no `valenced.*`, so module scope is fine.
 */

/** Enough for several long conversations; the oldest are dropped first. */
// 1000 is still several open chats' worth of loaded history; 3000 deep copies (through 0.27.15)
// was more memory than a toggle needs.
const LIMIT = 1000

const originals = new Map<string, unknown>()

/** Call with the message *before* redacting it in place. */
export function rememberOriginal(message: any) {
	const id = message?.id
	if (typeof id !== 'string') return
	try {
		originals.delete(id)
		originals.set(id, JSON.parse(JSON.stringify(message)))
		if (originals.size > LIMIT)
			originals.delete(originals.keys().next().value as string)
	} catch {
		/* a message that will not copy is simply not restorable */
	}
}

/**
 * Puts the unredacted message back on every row that has one recorded. `rows` must already be a
 * private copy: this rewrites it in place.
 */
export function restoreOriginals(rows: any[]) {
	if (originals.size === 0 || !Array.isArray(rows)) return
	for (const row of rows) {
		const id = row?.message?.id
		if (typeof id !== 'string') continue
		const original = originals.get(id)
		if (original) row.message = JSON.parse(JSON.stringify(original))
	}
}

export function forgetOriginal(id: unknown) {
	if (typeof id === 'string') originals.delete(id)
}

export function resetOriginals() {
	originals.clear()
}
