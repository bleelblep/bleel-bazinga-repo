/**
 * Which tag the editor is editing.
 *
 * Settings routes are registered once with fixed names and carry no parameters, so the list sets
 * this before navigating and the editor reads it on mount -- the same trick the repo's other
 * "list then detail" screens use.
 */

let selected = ''

export function selectTag(id: string) {
	selected = id
}

export function selectedTagId(): string {
	return selected
}
