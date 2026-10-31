/** Formatting with no Discord or React in it, so tests can import it. */

import type { HistoryEntry } from './store'

/** "example.com" from a URL, for the address bar and tab titles. */
export function shortHost(url: string): string {
	const match = /^[a-z]+:\/\/(?:[^@/]*@)?([^/:?#]+)/i.exec(url)
	return match ? match[1].replace(/^www\./i, '') : url
}

/** "Today", "Yesterday", or the date, for History's day headings. */
function dayLabel(at: number, now = new Date()): string {
	const day = new Date(at)
	const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
	const days = Math.round((start(now) - start(day)) / 86_400_000)
	if (days === 0) return 'Today'
	if (days === 1) return 'Yesterday'
	return day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', ...(day.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

export const timeOf = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

export type HistoryRow = { kind: 'day'; label: string } | { kind: 'entry'; entry: HistoryEntry }

/** History newest first, under a heading per day, matching [query] in the title or address. */
export function historyRows(history: HistoryEntry[], query: string): HistoryRow[] {
	const q = query.trim().toLowerCase()
	const rows: HistoryRow[] = []
	let last = ''
	for (const entry of history) {
		if (q && !entry.title.toLowerCase().includes(q) && !entry.url.toLowerCase().includes(q)) continue
		const label = dayLabel(entry.at)
		if (label !== last) {
			rows.push({ kind: 'day', label })
			last = label
		}
		rows.push({ kind: 'entry', entry })
	}
	return rows
}

const DISCORD_HOST =
	/(^|\.)(discord\.com|discordapp\.com|discord\.gg|discord\.gift|discord\.new|discord\.co|discordapp\.net|discord\.media|discordstatus\.com)$/i

/** Whether a tapped link should open in the Web tab. */
export function capturable(url: unknown): url is string {
	if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false
	const host = url.replace(/^https?:\/\//i, '').split(/[/?#:]/)[0].replace(/^[^@]*@/, '')
	return !!host && !DISCORD_HOST.test(host)
}

/** The address of a plain (not masked) web link tapped in a message, from handleMessagesTapLink's argument. */
export function plainChatLink(options: any): string | undefined {
	const data = options?.tapLinkData?.data
	if (!data || data.action != null || typeof data.url !== 'string') return undefined
	const shown = data.node?.content
	// Masked: the text shown isn't the address. Discord warns about those first.
	if (typeof shown === 'string' && shown.trim() !== data.url && shown.trim() !== data.node?.target) return undefined
	return data.url
}
