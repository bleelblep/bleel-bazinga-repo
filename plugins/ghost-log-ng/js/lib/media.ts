import * as finders from "@valenced/discord/utils/modules/finders";
import * as react from "@valenced/react";
import { getModuleByPath } from "../../../../shared/modules";
import { reportError } from "../../../../shared/report";
import type { DeletedMessage } from "../ui/state";
import { native } from "./bridge";
import { resolveMediaUri } from "./richContent";

const DEBUG: boolean = false;

const TAG = "[GhostLogNG:media]";

export type MediaKind = "image" | "video" | "file";

/** One saved file from a deleted message: an attachment, or an embed's image or video. */
export interface SavedMedia {
	key: string;
	entry: DeletedMessage;
	/** The encrypted copy's name in native's media folder. */
	localFile: string;
	kind: MediaKind;
	filename: string;
	size?: number;
	width?: number;
	height?: number;
	contentType?: string;
}

const VIDEO_EXT = /\.(mp4|mov|webm|mkv|m4v)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i;

function kindOf(contentType: unknown, name: string): MediaKind {
	const type = typeof contentType === "string" ? contentType.toLowerCase() : "";
	if (type.startsWith("image/")) return "image";
	if (type.startsWith("video/")) return "video";
	if (VIDEO_EXT.test(name)) return "video";
	if (IMAGE_EXT.test(name)) return "image";
	return "file";
}

function nameFrom(url: unknown, fallback: string): string {
	if (typeof url !== "string" || url.startsWith("file://")) return fallback;
	const last = url.split("?")[0].split("/").pop();
	return last ? decodeURIComponent(last) : fallback;
}

/**
 * Every saved file of one deleted message, in the order Discord showed them. Anything without a
 * saved copy (over the size cap, or the download failed) is left out: its CDN link died with the
 * message. Embed author and footer icons are saved too, but they are not media anyone wants listed.
 */
export function savedMedia(entry: DeletedMessage): SavedMedia[] {
	const out: SavedMedia[] = [];
	for (const [index, attachment] of (entry.attachments ?? []).entries()) {
		if (!attachment?.localFile) continue;
		const filename = String(
			attachment.filename ?? nameFrom(attachment.remoteUrl, "file"),
		);
		out.push({
			key: `${entry.id}:a${index}`,
			entry,
			localFile: attachment.localFile,
			kind: kindOf(attachment.content_type, filename),
			filename,
			size: typeof attachment.size === "number" ? attachment.size : undefined,
			width: attachment.width ?? undefined,
			height: attachment.height ?? undefined,
			contentType: attachment.content_type ?? undefined,
		});
	}
	for (const [index, embed] of (entry.embeds ?? []).entries()) {
		// A GIF link's embed has both: the video is the GIF, the thumbnail its first frame.
		const parts: Array<[any, MediaKind, string]> = embed?.video?.localFile
			? [[embed.video, "video", "v"]]
			: [
					[embed?.image, "image", "i"],
					[embed?.thumbnail, "image", "t"],
				];
		for (const [part, kind, slot] of parts) {
			if (!part?.localFile) continue;
			out.push({
				key: `${entry.id}:e${index}${slot}`,
				entry,
				localFile: part.localFile,
				kind,
				filename: nameFrom(
					part.remoteUrl,
					kind === "video" ? "video" : "image",
				),
				width: part.width ?? undefined,
				height: part.height ?? undefined,
			});
		}
	}
	return out;
}

/** Every saved file across the log, newest deletion first. */
export function allSavedMedia(entries: DeletedMessage[]): SavedMedia[] {
	return entries.flatMap(savedMedia);
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	if (bytes < 1024 * 1024 * 1024)
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const thumbs = new Map<string, string | null>();

/** A drawable picture for a saved file: the image itself, or a video's first frame. */
export async function previewUri(
	item: SavedMedia,
): Promise<string | undefined> {
	if (item.kind === "image") return resolveMediaUri(item.localFile);
	if (item.kind !== "video") return undefined;
	if (thumbs.has(item.localFile))
		return thumbs.get(item.localFile) ?? undefined;
	try {
		const uri = await native.getMediaThumb(item.localFile);
		thumbs.set(item.localFile, typeof uri === "string" && uri ? uri : null);
	} catch (error) {
		reportError(`${TAG} getMediaThumb failed:`, error);
		thumbs.set(item.localFile, null);
	}
	return thumbs.get(item.localFile) ?? undefined;
}

/** React hook form of {@link previewUri}; undefined while loading or when there is none. */
export function usePreviewUri(item: SavedMedia): string | undefined {
	const { React } = react;
	const [uri, setUri] = React.useState<string | undefined>();
	React.useEffect(() => {
		let live = true;
		setUri(undefined);
		void previewUri(item).then((value) => {
			if (live) setUri(value);
		});
		return () => {
			live = false;
		};
	}, [item.localFile, item.kind]);
	return uri;
}

const MEDIA_VIEWER_PATH =
	"modules/media_viewer/native/components/openMediaModal.tsx";

let viewer: ((options: any) => void) | undefined;
// The wait for Discord to load the viewer, started on the first miss and kept until it lands.
let stopWaiting: (() => void) | undefined;

/**
 * Discord's `openMediaModal`, once Discord has loaded it.
 *
 * Discord loads the module the first time something in chat opens media, and an imported-path
 * lookup only sees loaded modules, so from the log it can be missing until then. Up to 1.x this
 * loaded it itself: `__r` on a module id known for 349.5, or else a sweep of every module id for
 * one with the viewer's import pattern. Both run a module picked by guesswork, and the sweep (2000+
 * dependency reads) ran again on every tap while it kept missing. Now a miss starts one wait for the
 * real module by its path and answers "not yet" at once; the next tap after Discord loads it works.
 */
function openMediaModal(): ((options: any) => void) | undefined {
	if (viewer) return viewer;
	try {
		const mod = (finders as any).lookupModuleWithImportedPath(
			MEDIA_VIEWER_PATH,
		)?.[0];
		if (typeof mod?.openMediaModal === "function")
			return (viewer = mod.openMediaModal);
	} catch {
		/* not loaded yet */
	}
	if (!stopWaiting) {
		stopWaiting = getModuleByPath(
			MEDIA_VIEWER_PATH,
			null,
			(mod: any) => {
				if (typeof mod?.openMediaModal === "function")
					viewer = mod.openMediaModal;
			},
			TAG,
		);
	}
	return viewer;
}

/** Module-scope state reset for stop(): thumbnail memo and the cached viewer handle. */
export function resetMediaState() {
	thumbs.clear();
	viewer = undefined;
	try {
		stopWaiting?.();
	} catch {
		/* already gone */
	}
	stopWaiting = undefined;
}

/** How many neighbours either side of the tapped item are opened with it, so a swipe has somewhere to go. */
const VIEWER_WINDOW = 8;

/**
 * Opens saved images and videos in Discord's own media viewer, starting at `index`.
 *
 * The sources are built by hand in the shape Discord's `extractMediaFromAttachment` returns (349.5
 * bundle): `{ uri, width, height, mediaIndex, filename, ... }`, and for a video `videoURI` as well,
 * with `uri` as its poster. Discord's own extractor is not used: it rewrites CDN urls and applies
 * content-scan obscuring, neither of which means anything for a file:// path. Videos play through
 * LocalVideoHook, like they do in chat.
 *
 * Only a window around the tapped item is opened, because every source has to be decrypted first.
 * Returns true, or why it couldn't, for the toast.
 */
export async function openSavedMedia(
	items: SavedMedia[],
	index: number,
): Promise<true | string> {
	const open = openMediaModal();
	if (!open) {
		// Expected until Discord loads its viewer; the toast says what to do, so this is debug only.
		if (DEBUG) console.log(`${TAG} openMediaModal not loaded yet`);
		return "Discord's media viewer couldn't be loaded. Open any image in chat once, then try again.";
	}
	const viewable = items.filter((item) => item.kind !== "file");
	const target = items[index];
	const at = Math.max(0, viewable.indexOf(target));
	const slice = viewable.slice(
		Math.max(0, at - VIEWER_WINDOW),
		at + VIEWER_WINDOW + 1,
	);

	const sources: any[] = [];
	let initialIndex = 0;
	for (const item of slice) {
		const file = await resolveMediaUri(item.localFile);
		if (!file) continue;
		if (item === target) initialIndex = sources.length;
		const width = item.width || 1080;
		const height = item.height || 1080;
		const common = {
			mediaIndex: sources.length,
			messageId: item.entry.id,
			channelId: item.entry.channelId,
			guildId: item.entry.guildId,
			filename: item.filename,
			contentType: item.contentType,
			width,
			height,
		};
		if (item.kind === "video") {
			const poster = await previewUri(item);
			sources.push({
				...common,
				uri: poster ?? file,
				sourceURI: file,
				videoURI: file,
			});
		} else {
			sources.push({ ...common, uri: file, sourceURI: file });
		}
	}
	if (!sources.length) return "The saved copy couldn't be decrypted.";

	try {
		open({
			initialSources: sources,
			initialIndex,
			analyticsSource: "ghost_log",
			// Discord's share sheet forwards the CDN link, which is dead; saving to the gallery
			// copies the file and stays on.
			shareable: false,
			disableDownload: false,
		});
		return true;
	} catch (error) {
		reportError(`${TAG} openMediaModal failed:`, error);
		return `Discord's media viewer failed: ${String((error as any)?.message ?? error)}`;
	}
}
