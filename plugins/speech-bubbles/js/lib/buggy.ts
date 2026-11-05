import { confirmAction } from '../../../../shared/ui/confirm'
import { setSettings } from '../state'

export type BuggyKey = 'invisibleInk' | 'typingBubble' | 'swipeTimes' | 'sendAnimation'

/** Buggy features: turning one on asks first; turning it off doesn't. */
export function setBuggy(key: BuggyKey, name: string, on: boolean) {
	if (!on) {
		setSettings({ [key]: false })
		return
	}
	confirmAction({
		title: `Turn on ${name}?`,
		body: `${name} is buggy and may misbehave. You can turn it off again here at any time.`,
		action: 'Turn on',
		onConfirm: () => setSettings({ [key]: true }),
	})
}
