import { isGetNameHooked } from '../patches/displayName'
import { isDmHeaderPatched } from '../patches/dmHeader'
import { diagnostics } from './diagnostics'

/**
 * What is actually hooked right now, in words, for the toggle toast and the Settings page.
 *
 * Through 0.27.15 both said "Names hidden" / "Redaction on" without asking anything, so on a
 * Discord build where the chat hook never landed the person was told a screenshot was safe while
 * real names were on screen (coding rule 3: say what happened, not what was attempted). Each check
 * reads an outcome recorded after a hook installed, never the attempt.
 *
 * Plain module reads, no `valenced.*`, so it is safe to call from anywhere, any time.
 */
export function uncovered(): string[] {
	const missing: string[] = []
	try {
		const d = diagnostics()
		const chat =
			d.rowManagersPatched > 0 ||
			(d.chatManagerPatch ?? '').startsWith('patched')
		if (!chat) missing.push('chat messages')
		if (!isGetNameHooked()) missing.push('names outside chat')
		if (!isDmHeaderPatched()) missing.push('friend nicknames in DM headers')
	} catch {
		missing.push('unknown (could not check)')
	}
	return missing
}

/** One sentence for when something is missing, or undefined when everything is in. */
export function coverageWarning(): string | undefined {
	const missing = uncovered()
	if (!missing.length) return undefined
	return `Not hidden on this Discord version: ${missing.join(', ')}. Check before you screenshot.`
}
