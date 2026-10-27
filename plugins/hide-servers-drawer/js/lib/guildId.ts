/**
 * Pull a guild id out of a component's props.
 *
 * The prop naming used by the guild-bar row component isn't documented, so accept any
 * plausible shape. Shared so every consumer agrees on what counts as a given row's server.
 */
export function guildIdOf(props: any): string | undefined {
	const candidate =
		props?.guildId ?? props?.guild?.id ?? props?.id ?? props?.node?.id ?? props?.item?.id ?? props?.item?.guildId

	return candidate == null ? undefined : String(candidate)
}
