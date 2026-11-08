/**
 * The rich-content sidecar: full attachment/embed objects for captured messages, plus the
 * per-channel lazy decryption that points restored rows at the saved copies.
 *
 * Native owns persistence: the sidecar commits with the encrypted log, and media blobs are
 * downloaded and AES-GCM encrypted natively at capture time. Each media object then carries
 * `localFile` (the .enc blob name) alongside the original CDN url kept as `remoteUrl`.
 * `rehydrateEntries` asks native to decrypt each blob into a `file://` URI and points the live url
 * at it, so restored messages render the saved copy even after Discord's CDN link expires.
 */

import { reportError } from "../../../../shared/report";
import type { GhostLogSettings } from "../types";
import { native } from "./bridge";

const TAG = "[GhostLogNG:richContent]";

type RichContent = {
	// Discord's renderer relies on more than a filename and CDN URL (notably
	// proxy_url and image metadata). Persist the complete attachment object so a
	// restored MessageRecord has the same shape as the deleted message.
	attachments?: any[];
	embeds?: any[];
};

function clone(value: any): any {
	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		return { description: String(value?.description ?? "") };
	}
}

/** The capture side: what of a message's rich content goes into the sidecar. */
export function richContentForCapture(
	message: any,
	settings: Pick<GhostLogSettings, "saveEmbeds">,
): RichContent | undefined {
	if (!settings.saveEmbeds) return undefined;
	const embeds =
		Array.isArray(message?.embeds) && message.embeds.length
			? message.embeds.map(clone)
			: undefined;
	const attachments = Array.isArray(message?.attachments)
		? message.attachments
				.map(clone)
				.filter(
					(attachment: any) =>
						typeof attachment?.url === "string" && attachment.url.length > 0,
				)
		: undefined;
	if (!embeds && !attachments?.length) return undefined;
	return { embeds, attachments: attachments?.length ? attachments : undefined };
}

// Memoize resolved media URIs by .enc file name so repeated restores of the same image don't
// re-decrypt (the render-restore hook can ask for the same entries many times). These are now short
// `file://` paths rather than whole images encoded as `data:` strings, so the map costs nothing --
// but it is still bounded, because nothing else ever evicts it.
const MEDIA_URI_CACHE_MAX = 512;
const mediaUriCache = new Map<string, string>();

function rememberMediaUri(localFile: string, uri: string) {
	// Map preserves insertion order, so the first key is the oldest.
	if (mediaUriCache.size >= MEDIA_URI_CACHE_MAX) {
		const oldest = mediaUriCache.keys().next();
		if (!oldest.done) mediaUriCache.delete(oldest.value);
	}
	mediaUriCache.set(localFile, uri);
}

/** Resolve one encrypted media blob to a playable/renderable URI via native, cached by file name. */
export async function resolveMediaUri(
	localFile: string,
): Promise<string | undefined> {
	if (!localFile) return undefined;
	const cached = mediaUriCache.get(localFile);
	if (cached) return cached;
	try {
		const uri = await native.getMedia(localFile);
		if (typeof uri === "string" && uri.length) {
			rememberMediaUri(localFile, uri);
			return uri;
		}
	} catch (error) {
		reportError(`${TAG} failed to decrypt saved media:`, error);
	}
	return undefined;
}

// Files already sent for repair this session, so a dead CDN link is not retried on every frame.
const repairTried = new Set<string>();

/**
 * A saved copy that exists but won't open can be downloaded again while Discord's CDN still has the
 * original. Native checks the name matches the url before touching it.
 */
async function repairMediaUri(
	localFile: string,
	remoteUrl: unknown,
): Promise<string | undefined> {
	if (typeof remoteUrl !== "string" || !remoteUrl || repairTried.has(localFile))
		return undefined;
	repairTried.add(localFile);
	try {
		const ok = await native.repairMedia(localFile, remoteUrl);
		if (ok === true) return await resolveMediaUri(localFile);
	} catch (error) {
		reportError(`${TAG} media repair failed:`, error);
	}
	return undefined;
}

/** Collect every media sub-object in a rich record that carries a saved encrypted copy. */
function mediaObjects(rich: RichContent): any[] {
	const out: any[] = [];
	if (Array.isArray(rich.attachments))
		for (const att of rich.attachments) if (att?.localFile) out.push(att);
	if (Array.isArray(rich.embeds)) {
		for (const embed of rich.embeds) {
			if (!embed || typeof embed !== "object") continue;
			if (embed.image?.localFile) out.push(embed.image);
			if (embed.thumbnail?.localFile) out.push(embed.thumbnail);
			if (embed.video?.localFile) out.push(embed.video);
			if (embed.author?.localFile) out.push(embed.author);
			if (embed.footer?.localFile) out.push(embed.footer);
		}
	}
	return out;
}

/**
 * Point every url field a media object may have (image/thumbnail/video use url/proxy_url,
 * author/footer icons use icon_url/proxy_icon_url) at the decrypted URI.
 */
function applyUri(obj: any, uri: string) {
	for (const key of ["url", "proxy_url", "icon_url", "proxy_icon_url"]) {
		if (typeof obj[key] === "string") obj[key] = uri;
	}
}

/**
 * Rewrite every saved media reference in a rich-content record to a decrypted file:// URI so
 * restored messages render the bytes we captured, not the (often-expired) CDN link. The original
 * CDN url stays available under `remoteUrl`. Media that fails to decrypt is left on its CDN url
 * as fallback.
 */
export async function rehydrateLocalMedia(rich: RichContent) {
	const objs = mediaObjects(rich);
	if (!objs.length) return;
	await Promise.all(
		objs.map(async (obj) => {
			const uri =
				(await resolveMediaUri(obj.localFile)) ??
				(await repairMediaUri(obj.localFile, obj.remoteUrl));
			if (uri) applyUri(obj, uri);
		}),
	);
}

/**
 * Fetch the rich-content sidecar for these ids. Deliberately does NOT resolve saved media here.
 *
 * It used to: `refreshLog` passed every id in the log and this awaited a `Promise.all` over every
 * saved media object at once, so opening the app with a large log fired one native decrypt per
 * saved image simultaneously, each of which then returned the whole file as a base64 `data:` string.
 * That was the out-of-memory kill. Media is now resolved lazily, per channel, by `rehydrateEntries`
 * below -- only for messages actually about to be drawn.
 */
export async function loadRichContent(ids: string[]) {
	const out = new Map<string, RichContent>();
	if (!ids.length) return out;
	try {
		const raw = await native.getRichContent(ids);
		const entries = raw ? JSON.parse(raw) : {};
		for (const [id, rich] of Object.entries(entries)) {
			if (rich && typeof rich === "object") out.set(id, rich as RichContent);
		}
	} catch (error) {
		reportError(`${TAG} failed to load rich content:`, error);
	}
	return out;
}

/** True when this entry references saved media that has not been pointed at a local copy yet. */
export function needsRehydrate(entry: {
	attachments?: any[];
	embeds?: any[];
}): boolean {
	for (const obj of mediaObjects(entry as RichContent)) {
		if (typeof obj.remoteUrl === "string" && obj.url === obj.remoteUrl)
			return true;
		if (!String(obj.url ?? "").startsWith("file://")) return true;
	}
	return false;
}

/**
 * Resolve saved media for a specific set of entries, mutating them in place. Returns true when
 * anything actually changed, so the caller can bump the log version and let memoized records rebuild.
 */
export async function rehydrateEntries(
	entries: { attachments?: any[]; embeds?: any[] }[],
): Promise<{ changed: boolean; complete: boolean }> {
	const pending = entries.filter(needsRehydrate);
	if (!pending.length) return { changed: false, complete: true };
	await Promise.all(
		pending.map((entry) => rehydrateLocalMedia(entry as RichContent)),
	);
	// A blob that failed to decrypt is left on its CDN url, and those expire. Report whether any are
	// still unresolved so the caller can try again later rather than marking the channel done and
	// stranding it on a dead link until the app restarts.
	const complete = !pending.some(needsRehydrate);
	return { changed: true, complete };
}

export function resetRichContentState() {
	mediaUriCache.clear();
	repairTried.clear();
}
