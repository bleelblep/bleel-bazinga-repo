/** A short-lived editor session; callbacks are cleared when its editor leaves the navigator. */
let session: { initial: string; apply?: (text: string) => void } = {
	initial: '',
}

export function openTemplateSession(
	initial: string,
	apply?: (text: string) => void,
) {
	session = { initial, apply }
}

export function templateSession() {
	return session
}

export function clearTemplateSession() {
	session = { initial: '' }
}
