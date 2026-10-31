/**
 * Putting a page screenshot or a held image into the message box as an attachment. The work is in
 * shared/upload.ts, which also Sekai Stickers uses; see the note there.
 */

import { type LocalImage, attachImage, watchUploads } from '../../../../shared/upload'

/** A local image file, from the native screenshot or a fetched page image. */
export type Rendered = LocalImage

export const patchUpload = () => watchUploads('[Pocket Browser]')

/** Queues [rendered] as an attachment in [channelId]'s message box. Throws if it can't. */
export const attach = (rendered: Rendered, channelId: string) => attachImage(rendered, channelId)
