/**
 * Stands in for the `@valenced/*` modules under `bun test`.
 *
 * The plugin CLI rewrites every `@valenced/*` import into a read of the `valenced` global at build
 * time, so there is no package for Bun to resolve on a computer. This preload registers a mock
 * for each module name the repository imports, exporting every name the repository imports from
 * it. Each export is a stand-in that does nothing until a test gives it an implementation through
 * `mockValenced` (tests/mocks.ts): called, it calls the implementation; read as an object, it
 * reads the implementation's properties. That is enough for code that only imports a module at
 * the top and reads it inside a function (docs/coding-rules.md rule 1), which is all the helpers
 * under test do.
 *
 * A test file may still register its own `mock.module` for one of these names (Pronouns does).
 * That replaces the stand-ins for the rest of the run, which is why `mockValenced` registers them
 * again each time it is called.
 *
 * Wired up by `bunfig.toml` at the repository root, and run by `bun test`.
 */

import { mock } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const SOURCE_DIRS = ['plugins', 'shared']
const SKIP_DIRS = new Set(['node_modules', 'build', 'docs'])
const IMPORT =
	/import\s+(type\s+)?([^'"]+?)\s+from\s+['"](@valenced\/[^'"]+)['"]/g

interface ValencedTestGlobals {
	/** Implementations set by tests, by module name then export name. */
	__valencedMocks?: Map<string, Record<string, unknown>>
	/** Registers the stand-ins for one module name again, for `mockValenced`. */
	__valencedRemock?: (specifier: string) => void
}

/**
 * One map for the whole run: Bun runs this preload once per test file but keeps modules it
 * already loaded, and their stand-ins must keep reading the same map the tests write to.
 */
const globals = globalThis as ValencedTestGlobals
const impls = (globals.__valencedMocks ??= new Map<
	string,
	Record<string, unknown>
>())

function* sources(dir: string): Generator<string> {
	for (const name of readdirSync(dir)) {
		if (SKIP_DIRS.has(name)) continue
		const path = join(dir, name)
		if (statSync(path).isDirectory()) yield* sources(path)
		else if (/\.(ts|tsx)$/.test(name)) yield path
	}
}

/** `import a, { b, c as d, type E } from '...'` gives `default`, `b` and `c`. */
function importedNames(clause: string): string[] {
	const names: string[] = []
	const braces = clause.match(/\{([^}]*)\}/)
	if (braces) {
		for (const part of braces[1].split(',')) {
			const trimmed = part.trim()
			if (!trimmed || trimmed.startsWith('type ')) continue
			names.push(trimmed.split(/\s+as\s+/)[0].trim())
		}
	}
	const head = clause
		.replace(/\{[^}]*\}/, '')
		.trim()
		.replace(/,$/, '')
		.trim()
	if (/^[A-Za-z_$][\w$]*$/.test(head)) names.push('default')
	return names
}

/** A stand-in for one export: a function that calls, and an object that reads, the test's implementation. */
function standIn(specifier: string, name: string): unknown {
	const current = () => impls.get(specifier)?.[name]
	return new Proxy(() => undefined, {
		apply: (_target, thisArg, args) => {
			const impl = current()
			return typeof impl === 'function'
				? Reflect.apply(impl, thisArg, args)
				: undefined
		},
		get: (_target, key) => {
			const impl = current()
			return impl == null ? undefined : Reflect.get(impl as object, key)
		},
		has: (_target, key) => {
			const impl = current()
			return impl != null && key in (impl as object)
		},
	})
}

const namesByModule = new Map<string, Set<string>>()
for (const dir of SOURCE_DIRS) {
	for (const file of sources(join(ROOT, dir))) {
		for (const [, typeOnly, clause, specifier] of readFileSync(
			file,
			'utf8',
		).matchAll(IMPORT)) {
			const names = namesByModule.get(specifier) ?? new Set<string>()
			namesByModule.set(specifier, names)
			if (!typeOnly) for (const name of importedNames(clause)) names.add(name)
		}
	}
}

function stubFor(specifier: string): Record<string, unknown> {
	const stub: Record<string, unknown> = {}
	for (const name of namesByModule.get(specifier) ?? []) {
		stub[name] = standIn(specifier, name)
	}
	return stub
}

function remock(specifier: string) {
	mock.module(specifier, () => stubFor(specifier))
}

globals.__valencedRemock = remock

for (const specifier of namesByModule.keys()) remock(specifier)
