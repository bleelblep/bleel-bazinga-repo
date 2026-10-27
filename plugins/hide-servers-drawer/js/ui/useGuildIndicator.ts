import { guildNotificationState, settingsStore } from "../lib/notifications"
import { Stores } from "@valenced/discord/flux"
import * as react from "@valenced/react"

export interface GuildIndicatorState {
	/** Mention count after notification-setting suppression -- 0 means no mention pill. */
	mentionCount: number
	/** Plain unread, after the same suppression rules. */
	showDot: boolean
}

/**
 * Shared by Badge.tsx (the corner badge) and GuildRow.tsx (the left-edge selection/unread
 * pill) so both agree on what counts as "this guild has something to show" -- a muted guild
 * suppresses both the same way, rather than the pill showing unread activity the badge has
 * already decided to hide.
 */
export function useGuildIndicator(guildId: string): GuildIndicatorState {
	// Read per-render, never at module scope -- see docs/coding-rules.md rule 1. Flux stores
	// come from the Stores proxy by name; there is no `withStoreName` filter.
	const { React } = react
	const { GuildReadStateStore } = Stores as any

	const [, bump] = React.useReducer((n: number) => n + 1, 0)

	React.useEffect(() => {
		const stores = [GuildReadStateStore, settingsStore()].filter(s => s?.addChangeListener)
		if (!stores.length) return
		const onChange = () => bump()
		stores.forEach(s => s.addChangeListener(onChange))
		return () => stores.forEach(s => s.removeChangeListener?.(onChange))
	}, [])

	let mentionCount = 0
	let hasUnread = false
	try {
		mentionCount = GuildReadStateStore?.getMentionCount?.(guildId) ?? 0
	} catch {
		/* ignore */
	}
	try {
		hasUnread = GuildReadStateStore?.hasUnread?.(guildId) ?? false
	} catch {
		/* ignore */
	}

	const { muted, onlyMentions, suppressed } = guildNotificationState(guildId)

	if (suppressed) return { mentionCount: 0, showDot: false }

	return {
		mentionCount,
		showDot: hasUnread && !muted && !onlyMentions,
	}
}
