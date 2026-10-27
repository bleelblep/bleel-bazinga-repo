/** Locate groups inside the actual sheet, never beside its outer provider/portal. */
export function findMessageSheetGroupParent(tree: any, Sheet: any, Group: any): any {
	if (!Sheet || !Group) return undefined
	const visit = (node: any, inside: boolean, depth: number): any => {
		if (!node || depth > 40) return undefined
		if (Array.isArray(node)) {
			for (const child of node) {
				const found = visit(child, inside, depth + 1)
				if (found) return found
			}
			return undefined
		}
		if (!node.props) return undefined
		const inSheet = inside || node.type === Sheet
		const children = node.props.children
		const groups = Array.isArray(children) ? children : [children]
		if (inSheet && groups.some(child => child?.type === Group)) return node
		return visit(children, inSheet, depth + 1)
	}
	return visit(tree, false, 0)
}
