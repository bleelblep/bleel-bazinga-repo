// `valenced.utils.react.findInReactTree` doesn't exist -- see docs/coding-rules.md rule 4. This
// is a self-contained walker with classic Vendetta's semantics: walk a rendered element's
// `props.children` (single node or array) recursively for the first match.
//
// Also finds arrays, which is what the action-sheet patch needs -- the row groups live in a
// plain array rather than behind an element, so `predicate` is given every node including
// arrays and their entries.
export function findInReactTree(
	root: any,
	predicate: (node: any) => boolean,
	depth = 0,
): any {
	if (!root || typeof root !== 'object' || depth > 30) return undefined
	if (predicate(root)) return root

	if (Array.isArray(root)) {
		for (const entry of root) {
			const found = findInReactTree(entry, predicate, depth + 1)
			if (found) return found
		}
		return undefined
	}

	const children = root.props?.children
	if (Array.isArray(children)) {
		for (const child of children) {
			const found = findInReactTree(child, predicate, depth + 1)
			if (found) return found
		}
	} else if (children && typeof children === 'object') {
		const found = findInReactTree(children, predicate, depth + 1)
		if (found) return found
	}

	return undefined
}
