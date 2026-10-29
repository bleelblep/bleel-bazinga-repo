import renderTimestamp, { DEFAULTS, type TimestampStorage } from "../lib/renderTimestamp"
import * as finders from "@valenced/modules/finders"
import * as filters from "@valenced/modules/finders/filters"
import { wrapMethod } from "../../../../shared/wrapMethod"
import { reportError } from "../../../../shared/report"

// This runs inside RowManager.generate, i.e. on the chat render path. Anything that
// escapes here crashes the entire ChatView, so the whole body is guarded.
//
// getModules, not lookupModule: confirmed on-device (staff-tags plugin, getTagProperties)
// that a chat-UI-related module can still be unloaded even from inside start() on a cold
// app restart -- it only initializes once the chat screen actually renders. lookupModule
// gives up immediately and permanently caches that as "not found"; getModules subscribes
// and calls back whenever the module actually loads.
export default function patchRowManager(jsonStorage: ValencedJsonStorageApi<TimestampStorage>): () => void {
	const { getModules } = finders
	const { withName } = filters

	let unpatch: (() => void) | undefined

	const unsubscribe = getModules(withName("RowManager"), (RowManager: any) => {
		if (!RowManager?.prototype?.generate) {
			reportError("[CustomTimestamps] RowManager.prototype.generate not found")
			return
		}

		// One plain wrapper (shared/wrapMethod), not the patcher's before + instead pair it used to
		// be. Ghost Log NG also changes generate with an `instead`, and a patcher `before` here plus
		// two `instead`s set off the patcher's two-instead recursion: "Maximum call stack size
		// exceeded" on the chat screen (352.2 testing; docs/debugging/api-contracts.md). The
		// wrapper sees the args and the return value, so one function does both halves.
		//
		// A plain `function`, NOT an arrow, and `Reflect.apply(original, this, args)`, NOT
		// `original(...args)`: `generate` is a prototype method, so it needs its receiver.
		// wrapMethod calls the hook with the receiver as `this`; an arrow function discards it,
		// and calling `original(...)` bare then runs `generate` with `this === undefined`. That
		// surfaced as "TypeError: Cannot read property 'options' of undefined" thrown from
		// Discord's own code, several frames below ours.
		unpatch = wrapMethod(RowManager.prototype, "generate", function (
			this: any,
			args: any[],
			original: any,
		) {
			const [row] = args
			try {
				const settings = jsonStorage.cache ?? DEFAULTS
				const { selected, customFormat, hour24 } = settings
				if (row?.rowType === 1) {
					if (settings.separateMessages) row.isFirst = true
					if (row.message?.timestamp) {
						row.message.__customTimestamp = renderTimestamp(row.message.timestamp, selected, customFormat, !!hour24)
					}
				}
				// "day" separator rows (row.text, e.g. "Today"/"Yesterday"/a date) aren't
				// reformatted here: Discord hands us that text already rendered, and there's
				// no reliable way to parse it back into a Date without moment.js (which
				// doesn't exist on revenge.discord.common -- see renderTimestamp.ts). The
				// per-message timestamp above is the primary feature and is unaffected.
			} catch (error) {
				reportError("[CustomTimestamps] generate hook failed:", error)
			}

			const ret: any = Reflect.apply(original, this, args)
			try {
				if (row?.rowType !== 1) return ret

				const message = ret?.message
				if (message && row.message?.__customTimestamp && message.state === "SENT" && message.timestamp) {
					message.timestamp = row.message.__customTimestamp
				}
			} catch (error) {
				reportError("[CustomTimestamps] generate return hook failed:", error)
			}
			return ret
		})
	})

	return () => {
		unsubscribe()
		unpatch?.()
	}
}
