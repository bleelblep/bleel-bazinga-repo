/**
 * The part of React Navigation's navigator the pages use. `useNavigation()` is typed against
 * Discord's own route list, which doesn't know this plugin's routes, so every page narrows it to
 * this instead of to `any`.
 */
export interface Navigation {
	navigate(route: string, params?: Record<string, unknown>): void
	goBack(): void
	setOptions(options: Record<string, unknown>): void
}
