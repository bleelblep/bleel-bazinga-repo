type Choice = { template: string; value: string }
let recording: Choice[] | undefined
let replay: Choice[] | undefined
let cursor = 0
let pending: { draft: string; choices: Choice[] } | undefined
const bags = new Map<string, { remaining: string[]; last?: string }>()

function shuffleChoice(key: string, choices: string[]): string {
	let bag = bags.get(key)
	if (!bag) {
		if (bags.size >= 256) bags.delete(bags.keys().next().value!)
		bags.set(key, (bag = { remaining: [] }))
	}
	if (!bag.remaining.length) {
		bag.remaining = [...new Set(choices)]
		for (let i = bag.remaining.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1))
			;[bag.remaining[i], bag.remaining[j]] = [
				bag.remaining[j],
				bag.remaining[i],
			]
		}
		if (
			bag.remaining.length > 1 &&
			bag.remaining[bag.remaining.length - 1] === bag.last
		) {
			;[bag.remaining[0], bag.remaining[bag.remaining.length - 1]] = [
				bag.remaining[bag.remaining.length - 1],
				bag.remaining[0],
			]
		}
	}
	return (bag.last = bag.remaining.pop()!)
}

/** Commas separate choices; braces allow ordinary greeting placeholders inside a choice. */
export function expandRandom(text: string, namespace = ''): string {
	let block = 0
	return text.replace(
		/\$(random|shuffle)\{((?:[^{}]|\{[^{}]*\})*)\}/g,
		(template, kind: string, body: string) => {
			const choices = body
				.split(/,(?![^{}]*\})/)
				.map(value => value.trim())
				.filter(Boolean)
			if (!choices.length) return template
			const saved = replay?.[cursor++]
			const key = `${namespace}:${block++}:${template}`
			const value =
				saved?.template === template
					? saved.value
					: kind === 'shuffle'
						? shuffleChoice(key, choices)
						: choices[Math.floor(Math.random() * choices.length)]!
			recording?.push({ template, value })
			return value
		},
	)
}

export function captureRandom<T>(run: () => T): {
	result: T
	choices: Choice[]
} {
	const previous = recording
	const choices: Choice[] = []
	recording = choices
	try {
		return { result: run(), choices }
	} finally {
		recording = previous
	}
}

/** Only armed when Send is tapped in Preview; closing a preview never affects a later send. */
export function sendWithPreviewRandom(
	draft: string,
	choices: Choice[],
	send: () => void,
) {
	pending = { draft, choices }
	const current = pending
	try {
		send()
	} catch (error) {
		if (pending === current) pending = undefined
		throw error
	} finally {
		// Discord may complete sending asynchronously. Expire any instruction not consumed yet.
		setTimeout(() => {
			if (pending === current) pending = undefined
		}, 5000)
	}
}

export function withSendRandom<T>(draft: string, run: () => T): T {
	const next = pending
	pending = undefined
	const previous = replay
	const previousCursor = cursor
	replay = next?.draft === draft ? next.choices : undefined
	cursor = 0
	try {
		return run()
	} finally {
		replay = previous
		cursor = previousCursor
	}
}
