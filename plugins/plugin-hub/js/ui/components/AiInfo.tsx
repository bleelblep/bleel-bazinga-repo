import { rowIcon } from '../icon'
import { Design } from '@valenced/discord/design'
import * as React from 'react'

/**
 * AI Core at a glance, at the top of the AI Hub: which provider and model, today's calls against the
 * cap, the money left on the key, and which plugins used it today. Each part can be switched off in
 * AI Hub settings (`aiInfo`, `aiInfoBalance`, `aiInfoPlugins`).
 *
 * Read from `globalThis.__bleelblepAiCoreInfo`, which AI Core 2.3.0+ sets: read-only copies, never
 * the key. Declaring AI Core as a dependency instead would list Plugin Hub as one of its AI plugins
 * (see `lib/installed.ts`). With an older AI Core, or none running, this draws nothing.
 */

interface Info {
	status(): {
		native: boolean
		configured: boolean
		provider?: string
		host?: string
		model?: string
		calls: number
		cap: number
		unlimited: boolean
		remaining: number
		promptTokens: number
		completionTokens: number
		byPlugin: Array<{ id: string; name: string; calls: number }>
	}
	balance(force?: boolean): Promise<unknown>
	describeBalance(balance: unknown): string
	subscribe(listener: () => void): () => void
	refresh(): Promise<unknown>
}

export function aiCoreInfo(): Info | undefined {
	const info = (globalThis as any).__bleelblepAiCoreInfo
	return info && typeof info.status === 'function' ? (info as Info) : undefined
}

const AI_CORE_ID = 'bleelblep.ai-core'

function tokens(n: number): string {
	return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export default function AiInfo({
	showBalance,
	showPlugins,
	onOpen,
}: {
	showBalance: boolean
	showPlugins: boolean
	/** Navigates to a route: AI Core's settings, or a plugin's page. */
	onOpen: (route: string) => void
}) {
	const { TableRowGroup, TableRow } = Design

	const info = aiCoreInfo()
	const [, redraw] = React.useReducer((n: number) => n + 1, 0)
	const [balance, setBalance] = React.useState<unknown>(undefined)

	React.useEffect(() => {
		if (!info) return
		const unsubscribe = info.subscribe(redraw)
		info.refresh().catch(() => {})
		return unsubscribe
	}, [])
	React.useEffect(() => {
		if (info && showBalance) info.balance().then(setBalance, () => {})
	}, [showBalance])

	if (!info) return null
	let status: ReturnType<Info['status']>
	try {
		status = info.status()
	} catch {
		return null
	}

	const today = !status.configured
		? 'Nothing can be sent until a key is set'
		: status.unlimited
			? `${status.calls} call${status.calls === 1 ? '' : 's'}, no daily cap`
			: `${status.calls} of ${status.cap} calls, ${status.remaining} left`
	const used = status.promptTokens + status.completionTokens
	const top = status.byPlugin.filter(p => p.calls > 0).slice(0, 3)

	return (
		<TableRowGroup title="AI Core" hasIcons>
			<TableRow
				label={status.configured ? (status.provider ?? status.host ?? 'Provider') : 'No API key set'}
				subLabel={
					status.configured
						? [status.model, status.provider === 'Custom' ? status.host : undefined].filter(Boolean).join(' · ') ||
							undefined
						: 'Tap to set one in AI Core'
				}
				icon={rowIcon('ServerIcon', 'MagicWandIcon')}
				arrow
				onPress={() => onOpen(AI_CORE_ID)}
			/>
			<TableRow
				label="Today"
				subLabel={used ? `${today} · ${tokens(used)} tokens` : today}
				icon={rowIcon('SpeedometerIcon', 'ClockIcon')}
			/>
			{showBalance && status.configured ? (
				<TableRow
					label="Balance"
					subLabel={balance === undefined ? 'Checking…' : info.describeBalance(balance)}
					icon={rowIcon('CreditCardIcon')}
					onPress={() => {
						setBalance(undefined)
						info.balance(true).then(setBalance, () => setBalance({ ok: false, supported: true }))
					}}
				/>
			) : null}
			{showPlugins && top.length ? (
				<TableRow
					label="Used most today"
					subLabel={top.map(p => `${p.name} ${p.calls}`).join(', ')}
					icon={rowIcon('AnalyticsIcon', 'ListBulletsIcon')}
				/>
			) : null}
		</TableRowGroup>
	)
}
