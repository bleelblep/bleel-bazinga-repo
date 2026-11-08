@file:JvmName("GhostLogNG")

package com.bleelblep.ghostlogng

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.util.Base64
import android.util.Log
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeAsyncMethod
import app.valenced.xposed.api.registerNativeMethod
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.FilterOutputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.crypto.spec.SecretKeySpec

private const val TAG = "GhostLogNG"

private const val LOG_NAME = "deleted-log.json.enc"
private const val EDITS_NAME = "edited-log.json.enc"
private const val INDEX_NAME = "deleted-embeds.index.v1.json"

/**
 * Safety copies, written as ordinary version-2 backups so importBackup restores them (both logs at
 * once) and older builds can read them the same way. One of each, overwritten each time.
 */
private const val PRE_TRIM_NAME = "deleted-log.pre-trim.backup.json"
private const val PRE_IMPORT_NAME = "deleted-log.pre-import.backup.json"

/** importBundle answers beyond the entry count. -2/-3 predate this list and keep their meaning. */
private const val BUNDLE_FAILED = -1
private const val BUNDLE_NEEDS_PASSWORD = -2
private const val BUNDLE_WRONG_PASSWORD = -3
/** Refused: the current folder is locked or unreadable, or the plugin has no folder yet. */
private const val IMPORT_REFUSED = -4
/** The bundle's log (or another file in it) does not open or parse. Nothing was changed. */
private const val BUNDLE_DAMAGED = -5

/** Decrypted working copies above this are evicted oldest first. */
private const val MEDIA_CACHE_CAP = 200L * 1024 * 1024

private fun cls(error: Throwable): String = error.javaClass.simpleName

/**
 * Replaces [file] with what [write] produces, or leaves it exactly as it was.
 *
 * Everything persistent used to be written with writeText straight over the live file, so a kill,
 * a full disk or a storage hiccup mid-write left a truncated log, and a truncated log read as an
 * empty one. Now the bytes go to `<name>.part`, are synced, and only then renamed over the target,
 * which on Linux replaces it in one step. Returns null on success, or the error, with the .part
 * removed. [write] must not close the stream it is given.
 */
internal fun atomicReplace(file: File, write: (OutputStream) -> Unit): Throwable? {
	val temp = File(file.parentFile, "${file.name}.part")
	return try {
		file.parentFile?.mkdirs()
		FileOutputStream(temp).use { raw ->
			val out = raw.buffered(64 * 1024)
			write(out)
			out.flush()
			// Best effort: some shared-storage (FUSE) mounts refuse fsync, and the rename is still
			// what keeps a half-written file from ever replacing a whole one.
			runCatching { raw.fd.sync() }
		}
		if (!temp.renameTo(file)) error("rename refused")
		null
	} catch (error: Throwable) {
		runCatching { temp.delete() }
		error
	}
}

/** Copies [src] over [dst] through [atomicReplace]. */
internal fun copyAtomic(src: File, dst: File): Throwable? =
	atomicReplace(dst) { out -> src.inputStream().use { it.copyTo(out, 64 * 1024) } }

/** Lets a wrapping stream (Base64, zip) be closed to finish it without closing what it wraps. */
private class NonClosing(out: OutputStream) : FilterOutputStream(out) {
	override fun write(b: ByteArray, off: Int, len: Int) = out.write(b, off, len)
	override fun close() = out.flush()
}

/**
 * One base dir and the files in it. Swapped as a whole through an AtomicReference, so code running
 * outside the mutex (downloads, getMedia, thumbnails) takes one snapshot per operation and can't see
 * half a folder switch: a download used to resolve mediaDir at the start and the record's folder at
 * the end, and a switch in between left the blob in one folder and the record in another.
 */
private class Layout(val base: File) {
	val log = File(base, LOG_NAME)
	val edits = File(base, EDITS_NAME)
	val richIndex = File(base, INDEX_NAME)
	val media = File(base, "media")
	fun shard(n: Int) = File(base, "deleted-embeds-%05d.json".format(n))
}

/** A log or edit-log file as found on disk. Missing is a fresh log; Bad never is. */
private sealed class LogRead {
	object Missing : LogRead()
	class Ok(val arr: JSONArray) : LogRead()
	object UnknownKey : LogRead()
	class Bad(val why: String) : LogRead()
}

/** A media blob as found on disk; only [Bad] means the blob itself is broken. */
private sealed class BlobRead {
	class Ok(val bytes: ByteArray, val mime: String, val current: Boolean) : BlobRead()
	object UnknownKey : BlobRead()
	object Bad : BlobRead()
	/** Couldn't be read (IO, out of memory): says nothing about the blob. */
	class Failed(val why: String) : BlobRead()
}

/** A media envelope without its payload text, and the payload decoded. */
private class Envelope(val meta: JSONObject, val ct: ByteArray)

/**
 * Parses a media envelope from its bytes without ever making the payload a String.
 *
 * The payload is the whole file in Base64 (tens of megabytes). readText + JSONObject held it as a
 * UTF-16 string twice (the file text and the parsed value) and then as bytes: about 5x the file
 * size live at once. This finds the payload's quotes in the raw bytes and decodes in place, so the
 * peak is the file bytes plus the ciphertext. Null when it is not an envelope. Older blobs were
 * written by JSONObject, which escapes '/' as "\/"; the backslashes are dropped before decoding.
 */
private fun parseEnvelope(bytes: ByteArray): Envelope? {
	val key = "\"payload\"".toByteArray(Charsets.US_ASCII)
	var at = -1
	outer@ for (i in 0..bytes.size - key.size) {
		for (j in key.indices) if (bytes[i + j] != key[j]) continue@outer
		at = i
		break
	}
	if (at < 0) return null
	var i = at + key.size
	while (i < bytes.size && bytes[i] != '"'.code.toByte()) {
		val c = bytes[i].toInt().toChar()
		if (c != ':' && !c.isWhitespace()) return null
		i++
	}
	if (i >= bytes.size) return null
	val start = i + 1
	var end = start
	while (end < bytes.size && bytes[end] != '"'.code.toByte()) end++
	if (end >= bytes.size) return null
	val head = String(bytes, 0, at, Charsets.UTF_8)
	val tail = String(bytes, end + 1, bytes.size - end - 1, Charsets.UTF_8)
	val meta = runCatching { JSONObject("$head\"payload\":\"\"$tail") }.getOrNull() ?: return null
	var w = start
	for (r in start until end) if (bytes[r] != '\\'.code.toByte()) bytes[w++] = bytes[r]
	val ct = runCatching { Base64.decode(bytes, start, w - start, Base64.NO_WRAP) }.getOrNull() ?: return null
	return Envelope(meta, ct)
}

// A burst of deletions used to mean one full re-encrypt + rewrite of the WHOLE log per catch, all
// serialized through the persistence mutex, so a 500-message purge did 500 rewrites of a growing
// array -- quadratic, and long enough for Android to consider the app hung. Writes are coalesced
// into at most one per window instead, and forced to disk before any read, backup or shutdown, so
// nothing observable ever sees a stale log. The exposure is one window's worth of catches if the
// process is hard-killed inside it.
private const val PERSIST_DEBOUNCE_MS = 400L

// `stop {}` is a separate lambda from `start {}` and cannot see its locals, so the final flush is
// published here for it to call.
private var flushOnStop: (() -> Unit)? = null

/** Undoes LocalVideoHook, for the same reason flushOnStop lives out here. */
private var unhookLocalVideo: (() -> Unit)? = null

/**
 * Native-first Ghost Log NG (ground-up rewrite of Ghost Log Native Beta, format-compatible).
 *
 * Why native exists here at all: Discord's delete events live in the Hermes/JS Flux layer, so the
 * capture itself must happen on the JS side. What the native side buys is everything the JS side is
 * bad at: real AES-GCM encryption via javax.crypto, and persistence that does not depend on the JS
 * jsonStorage document. The log file lives in storageDir, encrypted, and is rewritten on each catch
 * (same overwrite model as stable's backup file).
 */
@Suppress("UNUSED")
val ghostLogNg = plugin {
    start {
        val mutex = Mutex()
		// For MediaStore (saving bundles into Download) and reading files picked in Android's picker.
		var appContext: android.content.Context? = null
		withAppContext { appContext = it.applicationContext ?: it }
		// Bounds how many media downloads run at once. registerNativeAsyncMethod handlers all run on
		// ONE shared CoroutineScope(SupervisorJob() + Dispatchers.IO) inside the Valenced bridge
		// (ValencedBridgeSupport.dispatchScope), so every native call in the app -- every plugin's,
		// not just ours -- competes for that pool's threads. A mod bulk-deleting dozens of
		// attachment-bearing messages starts one blocking HttpURLConnection per message at once
		// (15s connect, 120s read), and enough of those pin every thread in the pool, so unrelated
		// native calls stop being serviced and the app looks hung. The permit count keeps one burst
		// from claiming the whole pool. No withContext needed -- we are already on Dispatchers.IO.
		//
		// Two, not four: each heavy download holds up to 25 MB of body plus its ciphertext while it is
		// sealed, so four at once was the larger share of the app's heap on a bulk delete (AS-07).
		// Repair downloads take the same permits.
		val downloadSemaphore = Semaphore(2)
		// Our own scope, not the bridge's: the debounced flush outlives the native call that
		// scheduled it, so it cannot ride on a handler coroutine that is about to complete.
		// With a handler: an exception escaping a coroutine on a scope without one goes to the thread's
		// default handler, which kills the whole app. Nothing in here throws today (writeLogNow is
		// runCatching), but that should not be the only thing standing between a bug and a crash.
		val scope = CoroutineScope(
			SupervisorJob() + Dispatchers.IO +
				CoroutineExceptionHandler { _, error -> Log.e(TAG, "background task failed (${cls(error)})") },
		)
        val entries = mutableListOf<JSONObject>()
		// Edit history: one record per edited message, newest first, each holding the versions it
		// had before its current text. A separate file from the deleted log so the two can be
		// cleared, counted and trimmed independently, but living in the same base dir, under the
		// same key, flushed by the same debounce and carried by the same bundle.
		val edits = mutableListOf<JSONObject>()
		// EVERYTHING lives in one portable base directory — the backup location (default
		// /storage/emulated/0/Download/GhostLogNG) — so the encrypted log, the rolling embed shards
		// and the encrypted media blobs all survive an app uninstall/data wipe together. baseDir
		// stands at app-internal storageDir until the JS pushes the configured path at bootstrap
		// (setBaseDir). Nothing is read from or written to it before then: see `configured`.
		val layout = AtomicReference(Layout(storageDir))
		// Snapshots. Under the mutex they never change mid-operation (every switch takes the mutex);
		// outside it, take one and keep using it.
		fun baseDir() = layout.get().base
		fun logFile() = layout.get().log
		fun editsFile() = layout.get().edits
		fun richIndexFile() = layout.get().richIndex
		fun richShard(file: Int) = layout.get().shard(file)
		fun mediaDir() = layout.get().media
		// Decrypted copies handed to the RN image loader. App-private, hidden from the media
		// scanner, and wiped on start / clear so plaintext never accumulates.
		val mediaCacheDir: File = File(storageDir, "mediacache")
        var maxEntries = 100
        var unlimitedEntries = false
		// The limits come from the JS settings after bootstrap. Until they do, nothing is trimmed:
		// trimming an unlimited log to the default 100 because a catch or a folder merge got there
		// first would drop everything else.
		var limitsKnown = false

		// False until JS names the folder (setBaseDir at bootstrap). Catches made before then are
		// held in memory and in [pendingFile], then merged into that folder's log by id. They used to
		// be flushed to the storageDir root, where nothing ever read them again; and a capture that
		// switched the folder itself could write that near-empty list over the real log.
		var configured = false
		// App-private, never the base dir: what was caught while no folder could take it (before
		// bootstrap, or while the folder is locked or unreadable), so a restart doesn't lose it.
		val pendingFile = File(storageDir, "pending-catches.json.enc")
		// Ids caught this session, so a bundle import (which replaces the log) can put them back.
		val sessionDeleted = HashSet<String>()
		val sessionEdited = HashSet<String>()

		// Storage health, surfaced to JS by getStorageStatus so the UI can say plainly that the
		// configured location is unusable instead of silently losing every catch. Discord's manifest
		// declares neither MANAGE_EXTERNAL_STORAGE nor requestLegacyExternalStorage, so on Android 11+
		// there is no permission to request and no dialog to raise: a shared path either happens to
		// work on that device or it never will, and the only honest response is to say so and fall
		// back to app-private storage.
		var requestedDir: String? = null
		var storageError: String? = null
		var lastWriteError: String? = null

		var dirty = false
		var editsDirty = false
		// Rich-content records waiting for the next flush, oldest first. Writing the shard on every
		// capture meant decrypting, re-encrypting and rewriting up to 100 embeds per deletion; the log
		// itself was already coalesced and this was the half that wasn't.
		val pendingRich = mutableListOf<JSONObject>()
		var richPerFile = 100
		var persistJob: Job? = null

		fun hideFromMediaScanner(dir: File) {
			if (!dir.exists()) dir.mkdirs()
			// Keep the blobs out of the gallery/media scanner. .nomedia also stops
			// thumbnails/indexing of the folder itself.
			val noMedia = File(dir, ".nomedia")
			if (!noMedia.exists()) runCatching { noMedia.createNewFile() }
		}

		fun ensureMediaDir(dir: File = mediaDir()): File {
			hideFromMediaScanner(dir)
			return dir
		}

		fun ensureMediaCacheDir(): File {
			hideFromMediaScanner(mediaCacheDir)
			return mediaCacheDir
		}

		// Saved videos play from the decrypted cache; Discord's player only speaks HTTP without this.
		unhookLocalVideo?.invoke()
		unhookLocalVideo = runCatching { LocalVideoHook.install(classLoader, ensureMediaCacheDir(), runCatching { dexFinder }.getOrNull()) }
			.onFailure {
				Log.e(TAG, "local video hook failed (${cls(it)})")
				LocalVideoHook.Status.hooked = 0
				LocalVideoHook.Status.installError = it.toString()
			}
			.getOrNull()

		// Decrypted copy per blob name, so a repeat getMedia neither re-reads the blob for its mime
		// nor lists the folder. Checked with isFile before use: the cap below can evict.
		val cacheIndex = ConcurrentHashMap<String, File>()
		// One writer per cache file: two getMedia calls for one blob used to write the same file.
		val cacheLocks = ConcurrentHashMap<String, Any>()
		val cacheTrimLock = Any()

		fun wipeMediaCache() {
			cacheIndex.clear()
			runCatching { mediaCacheDir.listFiles()?.forEach { if (it.isFile && it.name != ".nomedia") it.delete() } }
		}

		/**
		 * Keeps the decrypted cache under [MEDIA_CACHE_CAP] by deleting the least recently used files.
		 * It was only wiped at start, clear and stop, so scrolling a long media log in one session
		 * could leave gigabytes of plaintext copies. A file the video player has open keeps playing:
		 * Linux keeps an unlinked file's data until it is closed.
		 */
		fun trimMediaCache(keep: File) = synchronized(cacheTrimLock) {
			runCatching {
				val files = mediaCacheDir.listFiles().orEmpty().filter { it.isFile && it.name != ".nomedia" && !it.name.endsWith(".part") }
				var total = files.sumOf { it.length() }
				if (total <= MEDIA_CACHE_CAP) return@runCatching
				for (old in files.sortedBy { it.lastModified() }) {
					if (total <= MEDIA_CACHE_CAP) break
					if (old == keep) continue
					val size = old.length()
					if (old.delete()) total -= size
				}
				cacheIndex.entries.removeAll { !it.value.isFile }
			}.onFailure { Log.w(TAG, "media cache trim failed (${cls(it)})") }
		}

		/**
		 * Absolute paths are used as given; a RELATIVE path resolves against app-private storageDir.
		 * That is what makes the new app-private default (and the "App docs"/"App cache" choices,
		 * which were relative strings resolving against the process CWD and therefore never worked)
		 * land somewhere the app can actually write.
		 */
		fun resolveBaseDir(backupPath: String?): File? {
			if (backupPath.isNullOrBlank()) return null
			val raw = File(backupPath)
			val abs = if (raw.isAbsolute) raw else File(storageDir, backupPath)
			// A path ending in a file name means "the directory holding it".
			return if (abs.extension.isNotEmpty()) abs.parentFile else abs
		}

		/**
		 * The file a backup/bundle path names, resolved the same way as [resolveBaseDir]: absolute as
		 * given, RELATIVE against app-private storageDir.
		 *
		 * exportBackup/importBackup/exportBundle/importBundle used a bare `File(path)`, which resolves
		 * a relative path against the process working directory (`/`). The defaults ARE relative
		 * ("GhostLogNG/deleted-log.backup.json"), so every auto-backup wrote to `/GhostLogNG/...` and
		 * failed, and every restore read from there and found nothing -- while the log itself, which
		 * goes through resolveBaseDir, worked. That split is why backups silently never existed.
		 */
		fun resolveFile(path: String): File {
			val raw = File(path)
			return if (raw.isAbsolute) raw else File(storageDir, path)
		}

		/**
		 * The file an import reads: [resolveFile] when it exists, otherwise the same relative path in the
		 * app's own external folder (`Android/data/<package>/files`, readable without any permission, and
		 * where adb or a file manager can drop a backup), then in shared Download/.
		 *
		 * On a fresh install the default relative path resolves into empty app-private storage, so a
		 * restore from the default always failed, even with the backup sitting in either of those places.
		 * Writes still go to [resolveFile]; only reads search.
		 */
		fun resolveExisting(path: String): File {
			val first = resolveFile(path)
			if (first.isFile || File(path).isAbsolute) return first
			val shared = File("/storage/emulated/0")
			return listOf(File(shared, "Android/data/${appInfo.packageName}/files/$path"), File(shared, "Download/$path"))
				.firstOrNull { runCatching { it.isFile && it.canRead() }.getOrDefault(false) }
				?.also { Log.i(TAG, "import: not in app storage, using a shared-storage copy") }
				?: first
		}

		/** Null when the directory really accepts a write; otherwise the reason it does not. */
		fun probeWritable(dir: File): String? = runCatching {
			dir.mkdirs()
			val probe = File(dir, ".glwrite")
			probe.writeText("ok")
			probe.delete()
			null
		}.getOrElse { error -> "${error.javaClass.simpleName}: ${error.message ?: "write denied"}" }

        // The fixed keys every version up to 0.2.x wrote with. Each is a hash of a string printed in
        // this source, the same on every install, so they never protected against anyone who had
        // the plugin. They stay READ-ONLY, for old logs, backups, bundles and the old plugin's data
        // (its portable 0.5.0+ key and its pre-0.5.0 package-bound key). See KeyRing.
        fun keyFrom(material: String): SecretKeySpec {
            val digest = MessageDigest.getInstance("SHA-256").digest(material.toByteArray(Charsets.UTF_8))
            return SecretKeySpec(digest, "AES")
        }

        // Everything is now WRITTEN under this install's random key (Keystore-protected), and
        // portable through the recovery password. keys.json stays in app-private storageDir, never
        // the base dir: the base dir can be shared storage, and a bundle import writes into it.
        // The constructor never throws (a broken Keystore at start used to take the plugin's start
        // down with it); a ring that could not start reports `broken` and nothing is written.
        val ring = KeyRing(
            File(storageDir, "keys.json"),
            listOf(
                keyFrom("ghost-log-ng:${manifest.id}"),
                keyFrom("ghost-log-native-beta:bleelblep.ghost-log-native-beta"),
                keyFrom("${appInfo.packageName}:bleelblep.ghost-log-native-beta"),
            ),
        )

        fun encrypt(plain: String): String = ring.seal(plain.toByteArray(Charsets.UTF_8)).toString()

        /** Current key, any key the ring holds, then the old fixed keys. Null when nothing opens it. */
        fun decrypt(raw: String): String? = ring.openString(raw)

        // A log, edit log or rich index sealed with a key this install lacks: written by an earlier
        // install (a shared-storage folder after a reinstall) and waiting on the recovery password.
        // While locked nothing in the base dir is written. Every write path there replaces the file
        // it read, and reading a locked file as "empty" and saving would destroy the old log.
        var locked = false
        // A log, edit log or rich index that exists but won't read, decrypt or parse (damaged,
        // truncated by an older build's in-place write, or not ours). The reason, or null. It used to
        // load as an empty, unlocked log, and the next flush wrote `[]` over it and the prune then
        // deleted every media blob. Now it is treated like `locked`: nothing in the folder is
        // written or pruned until the files are set aside (setAsideLocked) or the folder changes.
        var unreadable: String? = null
        // No writes to the base dir while any of these hold. `!configured` writes go to pendingFile.
        fun frozen() = locked || unreadable != null || ring.broken != null

        /** [atomicReplace] for text; records a failure for getStorageStatus. Never throws. */
        fun writeAtomic(file: File, text: String): Boolean {
            val error = atomicReplace(file) { it.write(text.toByteArray(Charsets.UTF_8)) } ?: return true
            lastWriteError = "${cls(error)}: could not save ${file.name}"
            Log.e(TAG, "write of ${file.name} failed (${cls(error)})")
            return false
        }

        fun unknownKeyIn(file: File): Boolean =
            file.isFile && runCatching { ring.isUnknownKey(file.readText()) }.getOrDefault(false)
        fun staleIn(file: File): Boolean =
            file.isFile && runCatching { ring.isStale(file.readText()) }.getOrDefault(false)

        /**
         * Read a JSON sidecar (the rich-content index or a shard) in either format.
         *
         * These used to be written as plain JSON while the plugin described itself as encrypted at
         * rest, and they carry real content: attachment filenames and urls, embed titles,
         * descriptions and fields. They are encrypted now. Existing plaintext files still load and
         * are rewritten encrypted by migrateLocked or the next write that touches them.
         *
         * An envelope that does not open (damaged, or another install's key) is null, NOT the
         * envelope parsed as data: callers treat null as "unreadable, leave it alone", and the
         * envelope read as an empty shard used to get rewritten with only the new records.
         */
        fun readJsonFile(file: File): JSONObject? {
            val raw = runCatching { file.readText() }.getOrNull() ?: return null
            decrypt(raw)?.let { return runCatching { JSONObject(it) }.getOrNull() }
            val obj = runCatching { JSONObject(raw) }.getOrNull() ?: return null
            return if (obj.has("iv") && obj.has("payload")) null else obj
        }

        /** A sidecar from before they were encrypted: readable JSON that is not an envelope. */
        fun plainIn(file: File): Boolean = file.isFile && runCatching {
            val obj = JSONObject(file.readText())
            !(obj.has("iv") && obj.has("payload"))
        }.getOrDefault(false)

		/** A log or edit-log file, told apart: missing (a fresh log), readable, sealed elsewhere, broken. */
		fun readLogFile(file: File): LogRead = try {
			if (!file.exists()) {
				LogRead.Missing
			} else {
				val raw = file.readText()
				when {
					ring.isUnknownKey(raw) -> LogRead.UnknownKey
					else -> {
						val plain = decrypt(raw)
						val arr = plain?.let { runCatching { JSONArray(it) }.getOrNull() }
						when {
							plain == null -> LogRead.Bad("does not decrypt")
							arr == null -> LogRead.Bad("does not parse")
							else -> LogRead.Ok(arr)
						}
					}
				}
			}
		} catch (error: Throwable) {
			// Out of memory or an IO error says nothing about the file, but it isn't a fresh log
			// either: holding off is the safe answer.
			LogRead.Bad("could not be read (${cls(error)})")
		}

		fun objectsOf(arr: JSONArray?): List<JSONObject> =
			if (arr == null) emptyList() else (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }

		/**
		 * Seals [bytes] and writes a media envelope to [target] through [atomicReplace], streaming the
		 * Base64 payload rather than building it as a String. The JSON is the same as before, keys in
		 * the order version, kid, iv, mime, payload (`kid` still second, which kidOfBlob relies on),
		 * so older builds read it. Built with JSONObject.toString, the payload was held as a UTF-16
		 * string twice plus its encoded bytes: about 8x the media size at peak, per download (AS-07).
		 */
		fun writeMediaEnvelope(target: File, bytes: ByteArray, mime: String): Throwable? {
			val sealed = try { ring.sealParts(bytes) } catch (error: Throwable) { return error }
			return atomicReplace(target) { out ->
				val iv = Base64.encodeToString(sealed.iv, Base64.NO_WRAP)
				val head = "{\"version\":2,\"kid\":${JSONObject.quote(sealed.kid)},\"iv\":${JSONObject.quote(iv)}," +
					"\"mime\":${JSONObject.quote(mime)},\"payload\":\""
				out.write(head.toByteArray(Charsets.UTF_8))
				android.util.Base64OutputStream(NonClosing(out), Base64.NO_WRAP).use { it.write(sealed.ct) }
				out.write("\"}".toByteArray(Charsets.UTF_8))
			}
		}

		/** Opens a media blob without ever holding its payload as text; see parseEnvelope. */
		fun readBlob(src: File): BlobRead {
			val env = try {
				parseEnvelope(src.readBytes())
			} catch (error: Throwable) {
				return BlobRead.Failed(cls(error))
			} ?: return BlobRead.Bad
			val iv = runCatching { Base64.decode(env.meta.getString("iv"), Base64.NO_WRAP) }.getOrNull()
				?: return BlobRead.Bad
			val mime = env.meta.optString("mime", "image/jpeg").ifBlank { "image/jpeg" }
			val opened = try {
				ring.openParts(env.meta.optString("kid"), iv, env.ct)
			} catch (error: Throwable) {
				return BlobRead.Failed(cls(error))
			}
			return when (opened) {
				is KeyRing.Opened.Ok -> BlobRead.Ok(opened.bytes, mime, opened.current)
				is KeyRing.Opened.UnknownKey -> BlobRead.UnknownKey
				KeyRing.Opened.Bad -> BlobRead.Bad
			}
		}

		/**
		 * Writes the logs as they are now into [name] beside them, as a version-2 backup (importBackup
		 * restores both), before something drops entries: a limit cut or a bundle replacing the log. A
		 * settings reset (Valenced 1.7's storage move put an unlimited log back to 100) used to cut
		 * the rest with no copy anywhere. Caller holds the mutex and has checked the folder isn't frozen.
		 */
		fun writeSafetyCopyLocked(name: String): Boolean = runCatching {
			val body = JSONObject().put("version", 2).put("deleted", JSONArray(entries)).put("edits", JSONArray(edits))
			val envelope = ring.seal(body.toString().toByteArray(Charsets.UTF_8))
			ring.portableRecord()?.let { envelope.put("recovery", JSONArray().put(it)) }
			writeAtomic(File(baseDir(), name), envelope.toString())
		}.getOrElse { error ->
			lastWriteError = "${cls(error)}: safety copy failed"
			Log.e(TAG, "safety copy failed (${cls(error)})")
			false
		}

		/**
		 * Cuts both logs to the limit. [safety] first writes the pre-trim copy, and a failed copy
		 * stops the cut. Not on the per-catch path (that drops one entry at a time, and a full copy per
		 * catch is the rewrite storm the debounce exists to avoid); setLimits, imports and merges pass it.
		 */
        fun trimLocked(safety: Boolean = false) {
            if (unlimitedEntries || !limitsKnown) return
            if (entries.size <= maxEntries && edits.size <= maxEntries) return
            if (safety && configured && !frozen() && !writeSafetyCopyLocked(PRE_TRIM_NAME)) return
            while (entries.size > maxEntries) entries.removeAt(entries.size - 1)
            while (edits.size > maxEntries) edits.removeAt(edits.size - 1)
        }

		fun extensionFor(contentType: String?, url: String): String {
			val ct = contentType?.substringBefore(';')?.trim()?.lowercase()
			when (ct) {
				"image/png" -> return "png"
				"image/jpeg", "image/jpg" -> return "jpg"
				"image/gif" -> return "gif"
				"image/webp" -> return "webp"
				"image/bmp" -> return "bmp"
				"image/heic", "image/heif" -> return "heic"
				"video/mp4" -> return "mp4"
				"video/quicktime" -> return "mov"
				"video/webm" -> return "webm"
				"video/x-matroska" -> return "mkv"
				"audio/mpeg" -> return "mp3"
				"audio/ogg" -> return "ogg"
				"audio/wav", "audio/x-wav" -> return "wav"
				"audio/mp4", "audio/aac" -> return "m4a"
			}
			// Fall back to the URL's own extension (strip any ?query), default to bin.
			val fromUrl = url.substringBefore('?').substringAfterLast('.', "").lowercase()
			return if (fromUrl.length in 2..5 && fromUrl.all { it.isLetterOrDigit() }) fromUrl else "bin"
		}

		/**
		 * Decrypt a media envelope into an app-private cache file and return a `file://` URI, or null
		 * on any failure (the caller then keeps the CDN url).
		 *
		 * Deliberately NOT a `data:` URI any more. A data URI carries the whole image as a Base64
		 * string: built in Java (UTF-16, ~2.7x the byte count), copied across the bridge, then held in
		 * the Hermes heap by the JS media cache and again by every memoized MessageRecord built from
		 * it. A log with a few dozen saved images was hundreds of megabytes of resident JS string with
		 * nothing to evict it, which is what made "open a channel with restored media" an out-of-memory
		 * kill. A file:// URI is a short path the RN image loader streams from disk instead.
		 *
		 * The trade-off, stated plainly: the decrypted bytes now exist on disk. They live in
		 * app-private storage that other apps cannot read, under .nomedia so nothing indexes them, and
		 * the whole folder is wiped on plugin start, on clear log, and on plugin stop. The encrypted
		 * copy in the portable base dir remains the only at-rest form.
		 */
		fun decryptMediaToCacheFile(src: File, name: String): String? {
			// Already decrypted this session: hand back the same file rather than redoing the work.
			cacheIndex[name]?.takeIf { it.isFile && it.length() > 0L }?.let {
				it.setLastModified(System.currentTimeMillis())
				return "file://" + it.absolutePath
			}
			val lock = cacheLocks.computeIfAbsent(name) { Any() }
			return runCatching {
				synchronized(lock) {
					cacheIndex[name]?.takeIf { it.isFile && it.length() > 0L }?.let { return@synchronized "file://" + it.absolutePath }
					// Any key in the ring, then the old fixed keys, so blobs from an imported bundle still open.
					val blob = readBlob(src) as? BlobRead.Ok ?: return@synchronized null
					val out = File(ensureMediaCacheDir(), name.removeSuffix(".enc") + "." + extensionFor(blob.mime, ""))
					// Through a .part and a rename: a copy cut short by a kill used to pass the
					// "already decrypted" check and be served half-written for the rest of the session.
					atomicReplace(out) { it.write(blob.bytes) }?.let { error ->
						Log.w(TAG, "media cache write failed (${cls(error)})")
						return@synchronized null
					}
					cacheIndex[name] = out
					trimMediaCache(out)
					"file://" + out.absolutePath
				}
			}.getOrNull()
		}

		fun queueRichLocked(rich: JSONObject, messageId: String, channelId: String, deletedAt: Long) {
			pendingRich.removeAll { it.optString("messageId") == messageId }
			pendingRich.add(JSONObject().apply {
				put("messageId", messageId)
				put("channelId", channelId)
				put("deletedAt", deletedAt)
				if (rich.has("attachments")) put("attachments", rich.optJSONArray("attachments"))
				if (rich.has("embeds")) put("embeds", rich.optJSONArray("embeds"))
			})
		}

		/**
		 * Writes every queued rich-content record into the rolling shards in one pass. Caller holds the
		 * mutex. Never throws: a failure is recorded and the queue kept, so the next flush retries it.
		 *
		 * Shards are read through readJsonFile: they are written encrypted, and the envelope is itself
		 * valid JSON with no `entries`, so a plain parse once made every capture wipe the shard.
		 */
		fun flushRichLocked(): Boolean {
			if (pendingRich.isEmpty()) return true
			return runCatching {
				val l = layout.get()
				val indexRead = readJsonFile(l.richIndex)
				// An index that is there but won't open is never replaced with a fresh one. loadLocked
				// already holds the folder back in that case; this is the second line.
				if (indexRead == null && l.richIndex.exists()) error("rich index unreadable")
				val index = indexRead ?: JSONObject()
				val startFile = index.optInt("file", 1).coerceAtLeast(1)
				var file = startFile
				// A shard that exists but will not open (damaged, or another install's key) is stepped
				// over, never treated as empty: that would rewrite it with only the new records.
				while (l.shard(file).isFile && readJsonFile(l.shard(file)) == null) file += 1
				val incoming = pendingRich.map { it.optString("messageId") }.toHashSet()
				var current = JSONArray()
				readJsonFile(l.shard(file))?.optJSONArray("entries")?.let { old ->
					for (i in 0 until old.length()) {
						val entry = old.optJSONObject(i) ?: continue
						if (entry.optString("messageId") !in incoming) current.put(entry)
					}
				}
				l.base.mkdirs()
				fun write(n: Int, shardEntries: JSONArray) {
					val text = encrypt(JSONObject().put("version", 1).put("entries", shardEntries).toString())
					if (!writeAtomic(l.shard(n), text)) error("shard write failed")
				}
				for (next in pendingRich) {
					if (current.length() >= richPerFile) {
						write(file, current)
						file += 1
						current = JSONArray()
					}
					current.put(next)
				}
				write(file, current)
				if (file != startFile || !l.richIndex.exists()) {
					val text = encrypt(JSONObject().put("version", 1).put("file", file).toString())
					if (!writeAtomic(l.richIndex, text)) error("index write failed")
				}
				pendingRich.clear()
				true
			}.getOrElse { error ->
				lastWriteError = "${cls(error)}: ${error.message ?: "shard write failed"}"
				Log.e(TAG, "rich shard write failed (${cls(error)})")
				false
			}
		}

		/**
		 * Drops rich-content records whose deletion has left the log, and media blobs nothing refers to.
		 * Caller holds the mutex.
		 *
		 * Trimming the log to its limit never touched either, so shards and media grew for as long as
		 * the plugin was installed, and every start decrypted every shard ever written. Blobs written in
		 * the last ten minutes are kept: downloads happen before the lock, so a fresh blob may belong to
		 * a capture that has not queued its record yet.
		 */
		fun pruneOrphansLocked() {
			// Never on a folder that didn't load whole. Locked or unreadable, `entries` lacks whatever
			// the files hold, so all of it would look orphaned; before bootstrap there's no folder.
			if (!configured || frozen()) return
			val l = layout.get()
			val indexRead = readJsonFile(l.richIndex)
			// The same for an index that won't open, or one that is missing while shards exist: with
			// no shard list, every blob would look unreferenced.
			if (indexRead == null && l.richIndex.exists()) return
			val shardPattern = Regex("""^deleted-embeds-\d{5}\.json$""")
			if (indexRead == null && l.base.listFiles().orEmpty().any { shardPattern.matches(it.name) }) return
			val live = entries.map { it.optString("id") }.toHashSet()
			val referenced = HashSet<String>()
			fun collect(value: Any?) {
				when (value) {
					is JSONObject -> {
						value.optString("localFile").takeIf { it.isNotEmpty() }?.let { referenced.add(it) }
						for (key in value.keys()) collect(value.opt(key))
					}
					is JSONArray -> for (i in 0 until value.length()) collect(value.opt(i))
				}
			}
			var dropped = 0
			val index = indexRead ?: JSONObject()
			val last = index.optInt("file", 0).coerceAtLeast(0)
			for (file in 1..last) {
				val shard = l.shard(file)
				val old = readJsonFile(shard)?.optJSONArray("entries") ?: continue
				val kept = JSONArray()
				for (i in 0 until old.length()) {
					val entry = old.optJSONObject(i) ?: continue
					if (entry.optString("messageId") in live) {
						kept.put(entry)
						collect(entry)
					}
				}
				if (kept.length() == old.length()) continue
				dropped += old.length() - kept.length()
				runCatching {
					// The newest shard is still being filled, so it stays even when empty.
					if (kept.length() == 0 && file != last) shard.delete()
					else writeAtomic(shard, encrypt(JSONObject().put("version", 1).put("entries", kept).toString()))
				}.onFailure { Log.e(TAG, "pruning ${shard.name} failed (${cls(it)})") }
			}
			// A shard that failed to read above skipped `collect`, so its blobs would look orphaned.
			// Only delete media when every shard was readable.
			val unreadableShard = (1..last).any { l.shard(it).exists() && readJsonFile(l.shard(it)) == null }
			for (record in pendingRich) collect(record)
			var blobs = 0
			if (!unreadableShard) {
				val cutoff = System.currentTimeMillis() - 10 * 60 * 1000L
				l.media.listFiles()?.forEach { blob ->
					if (blob.isFile && blob.name.endsWith(".enc") && blob.name !in referenced && blob.lastModified() < cutoff) {
						if (blob.delete()) blobs++
					}
				}
			}
			if (dropped > 0 || blobs > 0) log.i("pruned $dropped rich records and $blobs media files")
		}

		/**
		 * The one place the log is actually written. Never throws: this runs on the per-delete path,
		 * and an exception escaping a bridge handler coroutine is not a recoverable condition for the
		 * host app. A failure is recorded for getStorageStatus and leaves the log dirty so the next
		 * flush retries it.
		 */
		fun writeLogNow(): Boolean = runCatching {
			writeAtomic(logFile(), encrypt(JSONArray(entries).toString())).also { if (it) lastWriteError = null }
		}.getOrElse { error ->
			lastWriteError = "${cls(error)}: ${error.message ?: "write failed"}"
			Log.e(TAG, "log write failed (${cls(error)})")
			false
		}

		/** The edit-history twin of [writeLogNow]; never throws, for the same reason. */
		fun writeEditsNow(): Boolean = runCatching {
			writeAtomic(editsFile(), encrypt(JSONArray(edits).toString()))
		}.getOrElse { error ->
			lastWriteError = "${cls(error)}: ${error.message ?: "edit log write failed"}"
			Log.e(TAG, "edit log write failed (${cls(error)})")
			false
		}

		/**
		 * Catches with no folder to go to (before bootstrap, or while the folder is locked or
		 * unreadable), sealed into app-private [pendingFile] so a restart keeps them. They used to live
		 * only in memory. Merged into a folder's log by id, and the file deleted, once one takes them.
		 */
		fun writePendingLocked(): Boolean = runCatching {
			if (entries.isEmpty() && edits.isEmpty() && pendingRich.isEmpty()) {
				!pendingFile.exists() || pendingFile.delete()
			} else {
				val body = JSONObject().put("version", 1)
					.put("deleted", JSONArray(entries))
					.put("edits", JSONArray(edits))
					.put("rich", JSONArray(pendingRich))
				writeAtomic(pendingFile, encrypt(body.toString()))
			}
		}.getOrElse { error ->
			lastWriteError = "${cls(error)}: could not hold catches for later"
			Log.e(TAG, "pending write failed (${cls(error)})")
			false
		}

		/** Caller must hold the mutex. Writes whichever of the two logs has something to write. */
		fun flushLocked() {
			if (!configured || frozen()) {
				// Kept in memory and in pendingFile, and merged in by setBaseDir, unlock or
				// setAsideLocked; nothing in a frozen folder is written. See `locked`, `unreadable`.
				if (dirty || editsDirty) {
					if (writePendingLocked()) {
						dirty = false
						editsDirty = false
					}
				}
				if (configured && (dirty || editsDirty || pendingRich.isNotEmpty() || pendingFile.exists())) {
					lastWriteError = when {
						ring.broken != null -> "Keys unavailable: nothing is saved to the folder this session."
						unreadable != null -> "Unreadable: this folder's log could not be read, so nothing is saved there."
						else -> "Locked: this folder's log needs the recovery password before anything is saved."
					}
				}
				return
			}
			if (dirty && writeLogNow()) dirty = false
			if (editsDirty && writeEditsNow()) editsDirty = false
			flushRichLocked()
			// Whatever was held for later is in the folder now.
			if (!dirty && !editsDirty && pendingRich.isEmpty() && pendingFile.exists()) pendingFile.delete()
		}

		/** Caller must hold the mutex. Marks dirty and writes immediately. */
		fun persistNowLocked() {
			dirty = true
			flushLocked()
		}

		/** Caller must hold the mutex. Writes the deleted log now; true only when it reached the folder. */
		fun commitLogLocked(): Boolean {
			persistNowLocked()
			return configured && !frozen() && !dirty
		}

		/** [commitLogLocked] for the edit log. */
		fun commitEditsLocked(): Boolean {
			editsDirty = true
			flushLocked()
			return configured && !frozen() && !editsDirty
		}

		/** Caller must hold the mutex. Coalesces a write of whatever is dirty into the current window. */
		fun scheduleFlushLocked() {
			if (persistJob != null) return
			persistJob = scope.launch {
				delay(PERSIST_DEBOUNCE_MS)
				mutex.withLock {
					persistJob = null
					flushLocked()
				}
			}
		}

		/** Caller must hold the mutex. Marks the deleted log dirty and coalesces the write. */
		fun schedulePersistLocked() {
			dirty = true
			scheduleFlushLocked()
		}

		/** Caller must hold the mutex. Marks the edit log dirty and coalesces the write. */
		fun scheduleEditsPersistLocked() {
			editsDirty = true
			scheduleFlushLocked()
		}

		// 25 MB, matching Discord's free-tier upload limit, because the whole payload is held in memory
		// while it is sealed. At the old 512 MB cap a single large video needed well over a gigabyte
		// of transient heap and simply killed the app. Anything over the cap keeps its CDN url only.
		val maxMediaBytes = 25L * 1024 * 1024

		/** Per-file locks for downloadMedia, keyed by .enc name. Never shrinks; one tiny Object per file. */
		val mediaLocks = ConcurrentHashMap<String, Any>()

		/**
		 * Download a remote URL (image/video/audio/file), AES-GCM encrypt the bytes, and write a
		 * content-addressed `deleted-media-<hash>.enc` envelope into the media folder. Returns the FILE
		 * NAME (not a path) so the stored reference stays valid even if the portable media dir is
		 * remounted at a new absolute path. Returns null (caller keeps only the CDN url) on any failure
		 * or a payload over maxMediaBytes. Idempotent: a URL already downloaded is not fetched again.
		 */
		fun mediaNameFor(url: String): String {
			val hash = MessageDigest.getInstance("SHA-256")
				.digest(url.toByteArray(Charsets.UTF_8))
				.joinToString("") { "%02x".format(it) }
				.take(32)
			return "deleted-media-$hash.enc"
		}

		/**
		 * The body, or null when it runs past [maxMediaBytes] or ends short of its declared length.
		 * With a declared length it is read straight into one array of that size: a growing
		 * ByteArrayOutputStream holds up to twice the body and then copies it once more.
		 */
		fun readBody(input: java.io.InputStream, declared: Long): ByteArray? {
			if (declared in 1..maxMediaBytes) {
				val out = ByteArray(declared.toInt())
				var off = 0
				while (off < out.size) {
					val read = input.read(out, off, out.size - off)
					if (read < 0) break
					off += read
				}
				// Short means the connection dropped: saving it would be a blob that never opens.
				if (off < out.size) return null
				// Longer than declared means the header was wrong; read the rest the slow way.
				val next = input.read()
				if (next < 0) return out
				val rest = java.io.ByteArrayOutputStream(out.size + 8192)
				rest.write(out)
				rest.write(next)
				val buffer = ByteArray(8192)
				while (true) {
					val read = input.read(buffer)
					if (read < 0) break
					if (rest.size() + read > maxMediaBytes) return null
					rest.write(buffer, 0, read)
				}
				return rest.toByteArray()
			}
			val out = java.io.ByteArrayOutputStream()
			val buffer = ByteArray(8192)
			var total = 0L
			while (true) {
				val read = input.read(buffer)
				if (read < 0) break
				total += read
				if (total > maxMediaBytes) {
					Log.w(TAG, "downloadMedia aborted oversize mid-stream")
					return null
				}
				out.write(buffer, 0, read)
			}
			return out.toByteArray()
		}

		fun downloadMediaLocked(url: String, name: String, dir: File): String? {
			ensureMediaDir(dir)
			// Reuse an existing download.
			if (File(dir, name).exists()) return name
			try {
				val conn = (URL(url).openConnection() as HttpURLConnection).apply {
					connectTimeout = 15000
					// Large videos need a long read window; otherwise the socket dies mid-transfer.
					readTimeout = 120000
					instanceFollowRedirects = true
					requestMethod = "GET"
					setRequestProperty("User-Agent", "Mozilla/5.0 (Android) GhostLogNG")
				}
				try {
					val code = conn.responseCode
					// The status only: the url names the channel, the attachment and its file name (AS-08).
					if (code !in 200..299) {
						Log.i(TAG, "downloadMedia HTTP $code")
						return null
					}
					val contentType = conn.contentType
					val declaredLen = conn.contentLengthLong
					if (declaredLen > maxMediaBytes) {
						Log.w(TAG, "downloadMedia skipped oversize=$declaredLen")
						return null
					}
					val bytes = conn.inputStream.use { readBody(it, declaredLen) } ?: return null
					if (bytes.isEmpty()) { Log.w(TAG, "downloadMedia empty body"); return null }
					val mime = contentType?.substringBefore(';')?.trim()?.ifBlank { null }
						?: "application/" + extensionFor(null, url)
					// Written beside the target and renamed into place, so a crash or kill mid-write can
					// never leave a truncated .enc that the "reuse an existing download" check trusts.
					writeMediaEnvelope(File(dir, name), bytes, mime)?.let { error ->
						Log.w(TAG, "downloadMedia could not save the file (${cls(error)})")
						return null
					}
					Log.i(TAG, "media saved (${bytes.size} bytes)")
					return name
				} finally {
					conn.disconnect()
				}
			} catch (e: Throwable) {
				Log.e(TAG, "downloadMedia failed (${cls(e)})")
				return null
			}
		}

		/** Into [dir], which the caller snapshots once for the whole capture (see Layout). */
		fun downloadMedia(url: String, dir: File): String? {
			if (url.isBlank() || !(url.startsWith("http://") || url.startsWith("https://"))) {
				Log.w(TAG, "downloadMedia skipped: non-http url")
				return null
			}
			val name = mediaNameFor(url)
			// One download per file at a time. A single deletion can reach captureDeleted twice (the
			// dispatcher hook and the MESSAGE_DELETE fallback), and both used to download the same url
			// and write the same file at once. Small images rarely overlapped; a video took long enough
			// that the two writes interleaved into one file whose payload no longer matched its GCM tag
			// -- saved, and never openable (seen live on 348.5 with a 3.7 MB mp4).
			val lock = mediaLocks.computeIfAbsent(name) { Any() }
			return synchronized(lock) { downloadMediaLocked(url, name, dir) }
		}

		/**
		 * Walk the captured rich content and download + encrypt every media file it references. The
		 * original CDN url is preserved on each object under `remoteUrl`, and the encrypted on-disk
		 * copy is referenced by `localFile` (the .enc file name in [dir]). Attachments: ALL types
		 * (image/video/audio/other). Embeds: image, thumbnail, video, author icon and footer icon are
		 * pulled (covers bot embeds). Network happens here so it can run before the persistence lock.
		 */
		fun downloadRichMedia(rich: JSONObject, dir: File) {
			Log.i(TAG, "downloadRichMedia: attachments=${rich.optJSONArray("attachments")?.length() ?: 0} embeds=${rich.optJSONArray("embeds")?.length() ?: 0}")
			fun stampImage(obj: JSONObject?) {
				if (obj == null) return
				// image/thumbnail/video use `url`/`proxy_url`; author/footer icons use
				// `icon_url`/`proxy_icon_url`. Accept either shape.
				val url = obj.optString("url").ifBlank {
					obj.optString("proxy_url").ifBlank {
						obj.optString("icon_url").ifBlank { obj.optString("proxy_icon_url") }
					}
				}
				if (url.isBlank()) return
				val localFile = downloadMedia(url, dir) ?: return
				if (!obj.has("remoteUrl")) obj.put("remoteUrl", url)
				// Store the .enc file name only. The bytes are encrypted at rest; the JS side asks the
				// native getMedia() to decrypt into a file:// copy at render time. No plain path is kept.
				obj.put("localFile", localFile)
			}

			rich.optJSONArray("attachments")?.let { arr ->
				for (i in 0 until arr.length()) {
					val att = arr.optJSONObject(i) ?: continue
					stampImage(att)
				}
			}
			rich.optJSONArray("embeds")?.let { arr ->
				for (i in 0 until arr.length()) {
					val embed = arr.optJSONObject(i) ?: continue
					stampImage(embed.optJSONObject("image"))
					stampImage(embed.optJSONObject("thumbnail"))
					stampImage(embed.optJSONObject("video"))
					stampImage(embed.optJSONObject("author"))
					stampImage(embed.optJSONObject("footer"))
				}
			}
		}

		/**
		 * Loads both logs from the current folder and decides whether it may be written. Caller holds
		 * the mutex (or is the start, before any handler exists). Every folder switch comes through
		 * here, so `locked` and `unreadable` always describe the folder in use.
		 *
		 * A missing file is a fresh log. A file sealed with a key we lack sets `locked`; one that
		 * exists but won't read, decrypt or parse sets `unreadable`. Either way nothing is loaded and
		 * the folder is not written, so what it holds survives until it is unlocked or set aside.
		 */
		fun loadLocked() {
			val l = layout.get()
			entries.clear()
			edits.clear()
			locked = false
			unreadable = null
			val logRead = readLogFile(l.log)
			val ed = readLogFile(l.edits)
			val index: LogRead = try {
				when {
					!l.richIndex.exists() -> LogRead.Missing
					unknownKeyIn(l.richIndex) -> LogRead.UnknownKey
					readJsonFile(l.richIndex) == null -> LogRead.Bad("does not open")
					else -> LogRead.Ok(JSONArray())
				}
			} catch (error: Throwable) {
				LogRead.Bad("could not be read (${cls(error)})")
			}
			val reads = listOf(l.log.name to logRead, l.edits.name to ed, l.richIndex.name to index)
			if (reads.any { it.second is LogRead.UnknownKey }) {
				locked = true
				Log.w(TAG, "base dir is sealed with another install's key; waiting for the recovery password")
				return
			}
			val bad = reads.firstOrNull { it.second is LogRead.Bad }
			if (bad != null) {
				val why = (bad.second as LogRead.Bad).why
				unreadable = "${bad.first} $why"
				Log.w(TAG, "base dir held back: ${bad.first} $why")
				return
			}
			(logRead as? LogRead.Ok)?.let { entries.addAll(objectsOf(it.arr)) }
			(ed as? LogRead.Ok)?.let { edits.addAll(objectsOf(it.arr)) }
		}

		/** The rich-content records of one folder, every readable shard the index lists. */
		fun readShardsOf(l: Layout): List<JSONObject> {
			val index = readJsonFile(l.richIndex) ?: return emptyList()
			return (1..index.optInt("file", 0).coerceAtLeast(0)).flatMap {
				objectsOf(readJsonFile(l.shard(it))?.optJSONArray("entries"))
			}
		}

		/**
		 * Valenced 1.7 moved plugin storage from `storage/<id>/` to `storage/<slot>/<id>/` and left the
		 * old folder where it was, so every app-private log (the default location is relative, so it
		 * lives inside storageDir) started over empty. Worse, the JS settings reset with it: a log that
		 * was unlimited went back to 100 entries, and the next start trimmed and pruned the rest.
		 *
		 * This folds the old folder into the new one, once: entries, edits and rich records are
		 * unioned by id (the new copy wins a clash), media blobs and any other file are copied only
		 * where the new folder has none. Nothing is overwritten and the old folder is left as it is,
		 * so it can be run again by deleting the marker. A shared-storage log (Download/GhostLogNG) was
		 * never inside storageDir and is untouched.
		 *
		 * NG only: `legacy` derives from NG's own storageDir, so this never scans or reads the old
		 * Ghost Log Native Beta plugin's folder. Old GLNB data enters exclusively through
		 * importBackup/importBundle.
		 */
		fun mergeLegacyStorage() {
			val slotRoot = storageDir.parentFile ?: return
			val storage = slotRoot.parentFile ?: return
			if (slotRoot.name == "storage" || storage.name != "storage") return
			val legacy = File(storage, storageDir.name)
			if (!legacy.isDirectory) return
			val marker = File(legacy, ".merged-into-${slotRoot.name}")
			if (marker.exists()) return

			fun readArray(file: File): JSONArray? = (readLogFile(file) as? LogRead.Ok)?.arr

			/** Union by [key]; [mine] first so its copy wins. Null when [theirs] adds nothing. */
			fun union(mine: List<JSONObject>, theirs: List<JSONObject>, key: String): MutableList<JSONObject>? {
				val seen = mine.mapNotNull { it.optString(key).ifBlank { null } }.toHashSet()
				val added = theirs.filter { it.optString(key).let { id -> id.isNotEmpty() && seen.add(id) } }
				return if (added.isEmpty()) null else (mine + added).toMutableList()
			}

			/** One base dir: the folder holding deleted-log.json.enc, the shards and media/. */
			fun mergeBase(from: File, to: File) {
				val target = Layout(to)
				val mineLog = readLogFile(target.log)
				val mineEdits = readLogFile(target.edits)
				// A target this install cannot open, or a damaged one, reads as empty here, and the
				// union would replace it.
				if (listOf(mineLog, mineEdits).any { it is LogRead.UnknownKey || it is LogRead.Bad }) {
					Log.w(TAG, "legacy merge skipped for one folder: its log does not open")
					return
				}
				to.mkdirs()
				union(objectsOf((mineLog as? LogRead.Ok)?.arr), objectsOf(readArray(File(from, LOG_NAME))), "id")?.let { merged ->
					merged.sortByDescending { it.optLong("deletedAt", 0L) }
					if (writeAtomic(target.log, encrypt(JSONArray(merged).toString()))) {
						Log.i(TAG, "legacy merge: log now ${merged.size} entries")
					}
				}
				union(objectsOf((mineEdits as? LogRead.Ok)?.arr), objectsOf(readArray(File(from, EDITS_NAME))), "id")?.let { merged ->
					merged.sortByDescending { it.optLong("editedAt", 0L) }
					writeAtomic(target.edits, encrypt(JSONArray(merged).toString()))
				}
				// The shards are rewritten from 1, so every existing one has to be readable first: one
				// that isn't would be written over with the union, which can't include it.
				val indexRead = readJsonFile(target.richIndex)
				if (indexRead == null && target.richIndex.exists()) return
				val count = indexRead?.optInt("file", 0)?.coerceAtLeast(0) ?: 0
				if ((1..count).any { target.shard(it).exists() && readJsonFile(target.shard(it)) == null }) return
				// Shard numbers collide between the two folders, so the union is rewritten from shard 1.
				union(readShardsOf(target), readShardsOf(Layout(from)), "messageId")?.let { merged ->
					val chunks = merged.chunked(100)
					chunks.forEachIndexed { i, chunk ->
						val text = encrypt(JSONObject().put("version", 1).put("entries", JSONArray(chunk)).toString())
						// The index is written last, so a failure leaves it naming the shards it did.
						if (!writeAtomic(target.shard(i + 1), text)) return
					}
					var stale = chunks.size + 1
					while (target.shard(stale).delete()) stale++
					writeAtomic(target.richIndex, encrypt(JSONObject().put("version", 1).put("file", chunks.size).toString()))
				}
			}

			val handled = setOf(LOG_NAME, EDITS_NAME, INDEX_NAME)
			val shardName = Regex("""^deleted-embeds-\d{5}\.json$""")
			runCatching {
				// Every folder that held a log: the root (storage fell back) and the relative default
				// (GhostLog/), or wherever a relative custom path pointed.
				legacy.walkTopDown()
					.onEnter { it.name != "mediacache" }
					.filter { it.isDirectory && (File(it, LOG_NAME).isFile || File(it, INDEX_NAME).isFile) }
					.forEach { from -> mergeBase(from, File(storageDir, from.relativeTo(legacy).path)) }
				var copied = 0
				legacy.walkTopDown()
					.onEnter { it.name != "mediacache" }
					.filter { it.isFile && it.name !in handled && !shardName.matches(it.name) && !it.name.startsWith(".merged-into-") }
					.forEach { src ->
						val dst = File(storageDir, src.relativeTo(legacy).path)
						// A top-level .json is the JS settings (jsonStorage), which the move reset to
						// defaults. The old one wins, or the 100-entry default would trim the merged log
						// straight back down at the next setLimits. The reset copy is kept beside it.
						val settings = src.parentFile == legacy && src.name.endsWith(".json")
						if (!dst.exists() || (settings && dst.readText() != src.readText())) {
							if (dst.exists() && copyAtomic(dst, File(dst.parentFile, "${dst.name}.before-merge")) != null) return@forEach
							if (copyAtomic(src, dst) == null) copied++
						}
					}
				marker.writeText(System.currentTimeMillis().toString())
				Log.i(TAG, "legacy merge: $copied files copied")
			}.onFailure { Log.e(TAG, "legacy merge failed (${cls(it)})") }
		}

		/** Recovery records from a key file (`records`) or a backup envelope (`recovery`). */
		fun recordsIn(obj: JSONObject?): List<JSONObject> {
			val arr = obj?.optJSONArray("records") ?: obj?.optJSONArray("recovery") ?: return emptyList()
			return (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
		}

		fun keyFileRecords(dir: File?): List<JSONObject> {
			val file = File(dir ?: return emptyList(), KeyRing.KEY_FILE)
			if (!file.isFile) return emptyList()
			return recordsIn(runCatching { JSONObject(file.readText()) }.getOrNull())
		}

		/**
		 * ghost-log.key.json beside the log: this install's recovery record, plus any record still
		 * holding a key we lack (the only way back into a locked log, so it is never dropped). The
		 * contents are password-wrapped keys and useless without the password. Caller holds the mutex.
		 */
		fun writeKeyFileLocked() {
			// Not into a folder that is held back, and not over a key file that won't parse: the
			// records in it may be the only way into a locked log, and rewriting would drop them.
			if (!configured || frozen()) return
			runCatching {
				val base = baseDir()
				val file = File(base, KeyRing.KEY_FILE)
				if (file.isFile && runCatching { JSONObject(file.readText()) }.isFailure) {
					Log.w(TAG, "key file beside the log does not parse; left as it is")
					return@runCatching
				}
				val records = ring.mergedRecords(keyFileRecords(base))
				if (records.length() == 0) return@runCatching
				writeAtomic(file, JSONObject().put("version", 1).put("records", records).toString())
			}.onFailure { Log.e(TAG, "could not write ${KeyRing.KEY_FILE} (${cls(it)})") }
		}

		/**
		 * The key a media blob was sealed with, from the head of the file only: blobs run to tens of
		 * megabytes and the envelope writes `kid` second. Null for version-1 (fixed-key) blobs.
		 */
		fun kidOfBlob(file: File): String? = runCatching {
			val head = CharArray(256)
			val n = file.reader().use { it.read(head) }
			Regex(""""kid"\s*:\s*"([0-9a-f]+)"""").find(String(head, 0, maxOf(n, 0)))?.groupValues?.get(1)
		}.getOrNull()

		var mediaMigration: Job? = null

		/**
		 * Rewrites under the current key whatever was last written under an older one: the fixed keys
		 * of 0.2.x, or another install's key once the recovery password brought it in. Logs and shards
		 * here; media in the background, one blob at a time (they are large) and cancelled on stop.
		 * Caller holds the mutex.
		 */
		fun migrateLocked() {
			if (!configured || frozen()) return
			val l = layout.get()
			if (staleIn(l.log)) dirty = true
			if (staleIn(l.edits)) editsDirty = true
			flushLocked()
			val last = (readJsonFile(l.richIndex)?.optInt("file", 0) ?: 0).coerceAtLeast(0)
			for (file in listOf(l.richIndex) + (1..last).map { l.shard(it) }) {
				if (!staleIn(file) && !plainIn(file)) continue
				val obj = readJsonFile(file) ?: continue
				runCatching { writeAtomic(file, encrypt(obj.toString())) }
					.onFailure { Log.e(TAG, "re-sealing ${file.name} failed (${cls(it)})") }
			}
			if (mediaMigration?.isActive == true) return
			val dir = l.media
			mediaMigration = scope.launch {
				var resealed = 0
				for (blob in dir.listFiles().orEmpty()) {
					if (!isActive) break
					if (!blob.isFile || !blob.name.endsWith(".enc")) continue
					if (kidOfBlob(blob) == ring.currentId) continue
					synchronized(mediaLocks.computeIfAbsent(blob.name) { Any() }) {
						val opened = readBlob(blob) as? BlobRead.Ok ?: return@synchronized
						if (opened.current) return@synchronized
						val error = writeMediaEnvelope(blob, opened.bytes, opened.mime)
						if (error == null) resealed++ else Log.w(TAG, "re-sealing a media file failed (${cls(error)})")
					}
				}
				if (resealed > 0) log.i("re-sealed $resealed media files under the current key")
			}
		}

		/** Every `localFile` named anywhere in [records]. */
		fun localFilesIn(records: Iterable<JSONObject>): Set<String> {
			val out = HashSet<String>()
			fun walk(value: Any?) {
				when (value) {
					is JSONObject -> {
						value.optString("localFile").takeIf { it.isNotEmpty() }?.let { out.add(it) }
						for (key in value.keys()) walk(value.opt(key))
					}
					is JSONArray -> for (i in 0 until value.length()) walk(value.opt(i))
				}
			}
			records.forEach { walk(it) }
			return out
		}

		/**
		 * Copies the blobs [records] refer to into [to] from the first of [from] that has them. A
		 * record that changes folders (a location change, catches held from before bootstrap, a
		 * download that finished after a switch) used to leave its media behind. Caller holds the mutex.
		 */
		fun carryBlobsLocked(records: Iterable<JSONObject>, to: File, from: List<File>) {
			var carried = 0
			for (name in localFilesIn(records)) {
				if (name.contains('/') || name.contains('\\') || !name.endsWith(".enc")) continue
				val dst = File(to, name)
				if (dst.exists()) continue
				val src = from.filter { it.absolutePath != to.absolutePath }.map { File(it, name) }.firstOrNull { it.isFile } ?: continue
				ensureMediaDir(to)
				synchronized(mediaLocks.computeIfAbsent(name) { Any() }) {
					if (!dst.exists() && copyAtomic(src, dst) == null) carried++
				}
			}
			if (carried > 0) log.i("carried $carried media files into the current folder")
		}

		// Versions kept per message. An edit war should not grow one record without bound.
		val maxVersions = 20

		/**
		 * Folds edit records from a backup into the edit log. Caller holds the mutex. A message only
		 * in the backup is added; one in both gets the union of its versions (no duplicates, oldest
		 * first, capped) and the newer of the two current texts. Returns how many records changed.
		 */
		fun mergeEditsLocked(incoming: JSONArray): Int {
			var changed = 0
			for (i in 0 until incoming.length()) {
				val record = incoming.optJSONObject(i) ?: continue
				val id = record.optString("id").ifBlank { null } ?: continue
				val index = edits.indexOfFirst { it.optString("id") == id }
				if (index < 0) {
					edits.add(record)
					changed++
					continue
				}
				val mine = edits[index]
				val seen = HashSet<String>()
				val merged = ArrayList<JSONObject>()
				for (list in listOf(mine.optJSONArray("versions"), record.optJSONArray("versions"))) {
					list ?: continue
					for (j in 0 until list.length()) {
						val version = list.optJSONObject(j) ?: continue
						val key = version.optString("content") + "\u0000" + version.optLong("editedAt")
						if (seen.add(key)) merged.add(version)
					}
				}
				merged.sortBy { it.optLong("editedAt") }
				val before = mine.optJSONArray("versions")?.length() ?: 0
				mine.put("versions", JSONArray(merged.takeLast(maxVersions)))
				if (record.optLong("editedAt") > mine.optLong("editedAt")) {
					mine.put("current", record.optString("current"))
					mine.put("editedAt", record.optLong("editedAt"))
				}
				if ((mine.optJSONArray("versions")?.length() ?: 0) != before) changed++
			}
			edits.sortByDescending { it.optLong("editedAt") }
			return changed
		}

		/**
		 * Folds what memory held before a folder's files were loaded into the loaded log: union by id
		 * (the newer copy of an entry wins; edit versions are merged), sorted, trimmed with a safety
		 * copy, and marked for writing. Caller holds the mutex and has loaded a readable folder.
		 */
		fun mergeHeldLocked(heldEntries: List<JSONObject>, heldEdits: List<JSONObject>) {
			val loaded = entries.size to edits.size
			// Nothing held (the usual bootstrap): no rewrite of a log that is already on disk as it is.
			if (heldEntries.isEmpty() && heldEdits.isEmpty()) {
				trimLocked(safety = true)
				if (entries.size != loaded.first) dirty = true
				if (edits.size != loaded.second) editsDirty = true
				return
			}
			val byId = LinkedHashMap<String, JSONObject>()
			val noId = ArrayList<JSONObject>()
			for (entry in entries + heldEntries) {
				val id = entry.optString("id")
				if (id.isEmpty()) {
					noId.add(entry)
					continue
				}
				val have = byId[id]
				if (have == null || entry.optLong("deletedAt", 0L) > have.optLong("deletedAt", 0L)) byId[id] = entry
			}
			entries.clear()
			entries.addAll(byId.values)
			entries.addAll(noId)
			entries.sortByDescending { it.optLong("deletedAt", 0L) }
			mergeEditsLocked(JSONArray(heldEdits))
			trimLocked(safety = true)
			dirty = true
			editsDirty = true
		}

		/** Ids of what was caught this session, for [importBundleLocked] to put back. */
		fun rememberSessionLocked() {
			entries.forEach { e -> e.optString("id").takeIf { it.isNotEmpty() }?.let { sessionDeleted.add(it) } }
			edits.forEach { e -> e.optString("id").takeIf { it.isNotEmpty() }?.let { sessionEdited.add(it) } }
		}

		/**
		 * At start: what an earlier session held for later (see writePendingLocked). One that won't
		 * open is renamed aside rather than left to be overwritten by the next pending write.
		 */
		fun loadPendingLocked() {
			if (!pendingFile.isFile) return
			val body = runCatching { decrypt(pendingFile.readText())?.let { JSONObject(it) } }.getOrNull()
			if (body == null) {
				val aside = File(storageDir, "pending-catches.unreadable-${System.currentTimeMillis()}.json.enc")
				val moved = pendingFile.renameTo(aside)
				Log.w(TAG, "held catches from an earlier session do not open; kept aside=$moved")
				return
			}
			entries.addAll(objectsOf(body.optJSONArray("deleted")))
			edits.addAll(objectsOf(body.optJSONArray("edits")))
			pendingRich.addAll(objectsOf(body.optJSONArray("rich")))
			// They have no folder yet: a bundle import before they land must put them back too.
			rememberSessionLocked()
			if (entries.isNotEmpty() || edits.isNotEmpty()) log.i("holding ${entries.size} catches from an earlier session")
		}

		/**
		 * Points the whole base dir (log, shards, media) at [backupPath]'s folder. Caller holds the
		 * mutex. The first call is bootstrap and takes the catches held since start; later ones are
		 * location changes. Either way the new folder is loaded and `locked`/`unreadable` recomputed
		 * for it. If it is readable, what memory held (the old folder's log when that was readable,
		 * otherwise this session's catches) is merged into it by id, with the old folder's rich
		 * records and the media they name: going App -> Download -> App used to show only one side.
		 * The old folder is left as it was. If the new one is locked or unreadable, nothing is
		 * written there and memory (and pendingFile) keeps the catches.
		 */
		fun switchBaseDirLocked(backupPath: String) {
			val requested = resolveBaseDir(backupPath) ?: return
			// The same path that already works needs no new probe (a test file written and deleted).
			// A failing one is still retried, in case it recovers.
			if (configured && requested.absolutePath == requestedDir && storageError == null) return
			requestedDir = requested.absolutePath

			// Probe before committing. A shared-storage path that Android refuses is the difference
			// between "every catch is lost" and "every catch throws out of the handler coroutine",
			// and neither is acceptable, so an unusable location falls back to app-private storage
			// and reports why.
			storageError = probeWritable(requested)
			val dir = if (storageError == null) requested else storageDir
			if (storageError != null) Log.e(TAG, "configured folder is not writable; using app storage")
			val old = layout.get()
			if (configured && dir.absolutePath == old.base.absolutePath) return

			val oldReadable = configured && !frozen()
			// The old folder gets what it is owed first, so it is whole on its own as well.
			if (configured) flushLocked()
			val heldEntries = entries.toList()
			val heldEdits = edits.toList()
			// A frozen folder's rich records stay where they are, with the rest of it.
			val oldRich = if (oldReadable) readShardsOf(old) else emptyList()

			val next = Layout(dir)
			layout.set(next)
			ensureMediaDir(next.media)
			configured = true
			loadLocked()
			if (frozen()) {
				entries.addAll(heldEntries)
				edits.addAll(heldEdits)
				dirty = true
				editsDirty = true
				flushLocked()
				return
			}
			// Media failing to carry costs pictures, never entries: the merge below runs regardless.
			runCatching {
				val known = readShardsOf(next).map { it.optString("messageId") }.toHashSet()
				pendingRich.forEach { known.add(it.optString("messageId")) }
				for (record in oldRich) if (known.add(record.optString("messageId"))) pendingRich.add(record)
				carryBlobsLocked(pendingRich, next.media, listOf(old.media, File(storageDir, "media")))
			}.onFailure { Log.e(TAG, "carrying rich content failed (${cls(it)})") }
			mergeHeldLocked(heldEntries, heldEdits)
			flushLocked()
			log.i("folder ready: ${entries.size} entries, ${edits.size} edit records")
		}

		mergeLegacyStorage()
		// Nothing is read from a folder until JS names it (setBaseDir at bootstrap); see `configured`.
		loadPendingLocked()

        registerNativeAsyncMethod("${manifest.id}.captureDeleted") { args ->
            val map = args.getOrNull(0) as? Map<*, *> ?: return@registerNativeAsyncMethod false
            val entry = JSONObject(map)
			val rich = entry.optJSONObject("richContent")
			// backupPath once let a capture move the whole log to another folder mid-session, without
			// reloading or rechecking the lock, and could write a near-empty list over the real log. The
			// folder is setBaseDir's alone now; an older JS that still sends these is ignored.
			entry.remove("richContent")
			entry.remove("richContentPerFile")
			entry.remove("backupPath")
            // React Native delivers all numbers as Double; normalize the timestamps to Long so the
            // stored JSON reads clean and matches stable's number shape.
            for (key in listOf("sentAt", "deletedAt")) {
                (entry.opt(key) as? Number)?.let { entry.put(key, it.toLong()) }
            }
			val id = entry.optString("id")
			// One folder for the whole download. If it changes before the record is queued, the
			// blobs are carried over below rather than left behind.
			val target = layout.get()
			// Fetch image bytes to local files BEFORE taking the persistence lock: this is network
			// I/O and must not block other captures serializing through the mutex. Capped by
			// downloadSemaphore because a bulk delete starts one of these per attachment-bearing
			// message at once -- see the semaphore's own note for why that matters.
			if (rich != null) downloadSemaphore.withPermit { runCatching { downloadRichMedia(rich, target.media) } }
            val count = mutex.withLock {
                entries.removeAll { it.optString("id") == id }
                entries.add(0, entry)
				if (id.isNotEmpty()) sessionDeleted.add(id)
                trimLocked()
                // Coalesced, not written outright: see PERSIST_DEBOUNCE_MS. Every read path flushes
                // first, so nothing can observe the gap.
                schedulePersistLocked()
				if (rich != null) {
					// Queued for the same coalesced flush as the log, not written outright.
					queueRichLocked(rich, id, entry.optString("channelId"), entry.optLong("deletedAt"))
					val now = layout.get()
					if (now !== target) carryBlobsLocked(listOf(rich), now.media, listOf(target.media))
				}
                entries.size
            }
            log.i("captured deletion, log holds $count")
			// The rich content as saved, each media object now naming its encrypted copy, so the JS
			// cache can show the saved media without waiting for a reload.
			rich?.toString() ?: true
        }

        registerNativeAsyncMethod("${manifest.id}.getLog") { _ ->
            mutex.withLock {
                flushLocked()
                val arr = JSONArray()
                entries.forEach(arr::put)
                arr.toString()
            }
        }

		/**
		 * After the ring gains keys: if the base dir was locked and now opens, load it and fold in
		 * whatever was caught in memory meanwhile. Caller holds the mutex.
		 */
		fun reloadAfterUnlockLocked() {
			if (!locked) return
			val heldEntries = entries.toList()
			val heldEdits = edits.toList()
			loadLocked()
			if (frozen()) {
				// Still sealed with a key we lack (or, opened, it turns out damaged): keep this
				// session's catches in memory and in pendingFile.
				entries.clear(); entries.addAll(heldEntries)
				edits.clear(); edits.addAll(heldEdits)
				return
			}
			mergeHeldLocked(heldEntries, heldEdits)
			lastWriteError = null
			flushLocked()
		}

		/**
		 * One edit, merged into that message's record. JS sends the text as it was before this edit
		 * (`previous`) and after it (`current`); native owns the record, so the merge happens here and
		 * the merged record is returned for the JS cache to mirror. The first edit also records the
		 * message's metadata (author, channel, guild), which later edits leave alone.
		 */
		registerNativeAsyncMethod("${manifest.id}.captureEdit") { args ->
			val map = args.getOrNull(0) as? Map<*, *> ?: return@registerNativeAsyncMethod null
			val incoming = JSONObject(map)
			val id = incoming.optString("id").ifBlank { return@registerNativeAsyncMethod null }
			val previous = incoming.optString("previous")
			val current = incoming.optString("current")
			val editedAt = (incoming.opt("editedAt") as? Number)?.toLong() ?: System.currentTimeMillis()
			mutex.withLock {
				val index = edits.indexOfFirst { it.optString("id") == id }
				val record = if (index >= 0) edits.removeAt(index) else JSONObject().apply {
					for (key in listOf("id", "channelId", "guildId", "authorId", "authorName", "channelName", "guildName", "authorAvatar", "guildIcon")) {
						incoming.opt(key)?.takeIf { it != JSONObject.NULL }?.let { put(key, it) }
					}
					(incoming.opt("sentAt") as? Number)?.let { put("sentAt", it.toLong()) }
					put("versions", JSONArray())
				}
				val versions = record.optJSONArray("versions") ?: JSONArray().also { record.put("versions", it) }
				val last = if (versions.length() > 0) versions.optJSONObject(versions.length() - 1)?.optString("content") else null
				// The same text arriving twice (a replayed update) adds nothing.
				if (previous != last && previous != current) {
					versions.put(JSONObject().put("content", previous).put("editedAt", editedAt))
				}
				while (versions.length() > maxVersions) versions.remove(0)
				record.put("current", current)
				record.put("editedAt", editedAt)
				edits.add(0, record)
				sessionEdited.add(id)
				trimLocked()
				scheduleEditsPersistLocked()
				record.toString()
			}
		}

		registerNativeAsyncMethod("${manifest.id}.getEdits") { _ ->
			mutex.withLock {
				flushLocked()
				val arr = JSONArray()
				edits.forEach(arr::put)
				arr.toString()
			}
		}

		// clearEdits() -> true only when the emptied edit log reached the folder. False before
		// bootstrap, while the folder is locked or unreadable, or when the write fails; then the edit
		// log is left as it was, so the UI can say so instead of showing an empty list that comes back.
		registerNativeAsyncMethod("${manifest.id}.clearEdits") { _ ->
			val cleared = mutex.withLock {
				if (!configured || frozen()) return@withLock false
				val before = edits.toList()
				edits.clear()
				if (commitEditsLocked()) {
					true
				} else {
					edits.addAll(before)
					false
				}
			}
			if (cleared) log.i("edit log cleared")
			cleared
		}

		registerNativeAsyncMethod("${manifest.id}.getRichContent") { args ->
			val ids = (args.getOrNull(0) as? List<*>)?.mapNotNull { it as? String }?.toHashSet() ?: emptySet()
			mutex.withLock {
				// Queued records are written first, or a capture inside the flush window has no media.
				flushLocked()
				val out = JSONObject()
				// pendingRich too: while the folder is held back, this session's records are only there.
				for (rich in readShardsOf(layout.get()) + pendingRich) {
					val id = rich.optString("messageId")
					if (id in ids) out.put(id, rich)
				}
				out.toString()
			}
		}

		/** Only a bare `.enc` file name inside the media folder; anything else is refused. */
		fun safeBlobName(name: String) = !name.contains('/') && !name.contains('\\') && name.endsWith(".enc")

		// Decrypt one encrypted media blob (by .enc file name) into an app-private file:// URI for the
		// RN image loader. Returns null if the file is missing or cannot be decrypted (falls back to
		// CDN url). See decryptMediaToCacheFile for why this is not a data: URI any more.
		//
		// Two at a time: opening a chat asks for every saved picture and video in it at once, and each
		// decrypt holds the whole blob (twice, while it decodes). Twenty saved videos at once ran
		// Discord out of memory. Files already decrypted this session skip the queue.
		val decryptSemaphore = Semaphore(2)
		registerNativeAsyncMethod("${manifest.id}.getMedia") { args ->
			val name = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
			if (!safeBlobName(name)) return@registerNativeAsyncMethod null
			cacheIndex[name]?.takeIf { it.isFile && it.length() > 0L }?.let { return@registerNativeAsyncMethod "file://" + it.absolutePath }
			val file = File(mediaDir(), name)
			if (!file.exists()) return@registerNativeAsyncMethod null
			decryptSemaphore.withPermit { decryptMediaToCacheFile(file, name) }
		}

		// Decoding a video frame holds the whole frame in memory and keeps a decoder busy, so the media
		// grid asks for these a couple at a time however fast it scrolls.
		val thumbSemaphore = Semaphore(2)

		/**
		 * getMediaThumb(name) -> a file:// JPEG of a saved video's first frame, for the media grid and
		 * the log's thumbnails. React Native's Image cannot draw a frame out of an mp4. Kept beside
		 * the decrypted copies, so it is wiped with them. Null when the blob is missing, will not
		 * decrypt, or has no decodable frame (audio, a damaged file).
		 */
		registerNativeAsyncMethod("${manifest.id}.getMediaThumb") { args ->
			val name = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
			if (!safeBlobName(name)) return@registerNativeAsyncMethod null
			val thumb = File(ensureMediaCacheDir(), name.removeSuffix(".enc") + ".thumb.jpg")
			if (thumb.isFile && thumb.length() > 0L) return@registerNativeAsyncMethod "file://" + thumb.absolutePath
			val blob = File(mediaDir(), name)
			if (!blob.exists()) return@registerNativeAsyncMethod null
			thumbSemaphore.withPermit {
				val uri = decryptMediaToCacheFile(blob, name) ?: return@withPermit null
				runCatching {
					val retriever = MediaMetadataRetriever()
					try {
						retriever.setDataSource(uri.removePrefix("file://"))
						val frame = retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
							?: return@runCatching null
						// Grid tiles are small; a full-resolution frame would be most of a megabyte each.
						val scale = 480f / maxOf(frame.width, frame.height)
						val small = if (scale < 1f) {
							Bitmap.createScaledBitmap(frame, (frame.width * scale).toInt(), (frame.height * scale).toInt(), true)
						} else frame
						// Through a .part, like the decrypted copies: a cut-short JPEG would pass the
						// length check above for the rest of the session.
						val error = synchronized(cacheLocks.computeIfAbsent(thumb.name) { Any() }) {
							atomicReplace(thumb) { small.compress(Bitmap.CompressFormat.JPEG, 80, it) }
						}
						if (small !== frame) small.recycle()
						frame.recycle()
						if (error != null) null else "file://" + thumb.absolutePath
					} finally {
						runCatching { retriever.release() }
					}
				}.onFailure { Log.w(TAG, "thumbnail failed (${cls(it)})") }.getOrNull()
			}
		}

		/**
		 * Takes [ids] out of the deleted log and writes it now, so the answer is honest: how many left
		 * the log on disk. 0 when none matched, before bootstrap, while the folder is locked or
		 * unreadable, or when the write fails (then nothing is removed). Caller holds the mutex.
		 */
		fun removeEntriesLocked(ids: Set<String>): Int {
			if (!configured || frozen()) return 0
			val gone = entries.filter { it.optString("id") in ids }
			if (gone.isEmpty()) return 0
			val goneRich = pendingRich.filter { it.optString("messageId") in ids }
			entries.removeAll { it.optString("id") in ids }
			pendingRich.removeAll { it.optString("messageId") in ids }
			if (commitLogLocked()) return gone.size
			entries.addAll(gone)
			entries.sortByDescending { it.optLong("deletedAt", 0L) }
			pendingRich.addAll(goneRich)
			return 0
		}

		/** [removeEntriesLocked] for the edit log. */
		fun removeEditsLocked(ids: Set<String>): Int {
			if (!configured || frozen()) return 0
			val gone = edits.filter { it.optString("id") in ids }
			if (gone.isEmpty()) return 0
			edits.removeAll { it.optString("id") in ids }
			if (commitEditsLocked()) return gone.size
			edits.addAll(gone)
			edits.sortByDescending { it.optLong("editedAt") }
			return 0
		}

		// removeEntry(id) -> true when it left the log on disk; see removeEntriesLocked. Its rich
		// content and media go at the next start's prune, which handles records whose deletion has
		// left the log.
		registerNativeAsyncMethod("${manifest.id}.removeEntry") { args ->
			val id = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod false
			mutex.withLock { removeEntriesLocked(setOf(id)) > 0 }
		}

		// removeEntries(ids) -> how many left the log on disk. One write for a whole selection.
		registerNativeAsyncMethod("${manifest.id}.removeEntries") { args ->
			val ids = (args.getOrNull(0) as? List<*>)?.mapNotNull { it as? String }?.toHashSet()
				?: return@registerNativeAsyncMethod 0
			mutex.withLock { removeEntriesLocked(ids) }
		}

		// removeEdits(ids) -> how many edit records left the edit log on disk.
		registerNativeAsyncMethod("${manifest.id}.removeEdits") { args ->
			val ids = (args.getOrNull(0) as? List<*>)?.mapNotNull { it as? String }?.toHashSet()
				?: return@registerNativeAsyncMethod 0
			mutex.withLock { removeEditsLocked(ids) }
		}

		// removeEdit(id) -> true when that message's edit record left the edit log on disk.
		registerNativeAsyncMethod("${manifest.id}.removeEdit") { args ->
			val id = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod false
			mutex.withLock { removeEditsLocked(setOf(id)) > 0 }
		}

		// repairMedia(name, url) -> true when the blob now opens. For a saved copy that exists but
		// fails to decrypt (damaged by the concurrent-write bug fixed in beta19): if Discord's CDN
		// still serves the original, download it again. The name must be the one this url hashes
		// to, so a caller can't point one file's name at someone else's url.
		registerNativeAsyncMethod("${manifest.id}.repairMedia") { args ->
			val name = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod false
			val url = args.getOrNull(1) as? String ?: return@registerNativeAsyncMethod false
			if (name != mediaNameFor(url)) return@registerNativeAsyncMethod false
			val dir = mediaDir()
			val file = File(dir, name)
			if (file.exists()) {
				if (decryptSemaphore.withPermit { decryptMediaToCacheFile(file, name) } != null) return@registerNativeAsyncMethod true
				// Only a blob that is definitely broken is replaced. Out of memory, an IO error or a key
				// this phone lacks says nothing about the blob, and the signed CDN url may have expired,
				// so deleting on any failure could swap a good copy for nothing.
				if (readBlob(file) != BlobRead.Bad) return@registerNativeAsyncMethod false
				synchronized(mediaLocks.computeIfAbsent(name) { Any() }) {
					// Checked again under the lock: a download may have just replaced it.
					if (readBlob(file) == BlobRead.Bad) file.delete()
				}
			}
			// The same permits as captures: a repair is the same heavy download.
			val saved = downloadSemaphore.withPermit { downloadMedia(url, dir) } ?: return@registerNativeAsyncMethod false
			decryptSemaphore.withPermit { decryptMediaToCacheFile(File(dir, saved), saved) } != null
		}

		// Diagnostics for one saved media blob: getMedia answers only "a URI or null", which hides why
		// a blob won't open. Reports each step, and never returns any of the content.
		registerNativeAsyncMethod("${manifest.id}.mediaCheck") { args ->
			val name = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
			if (!safeBlobName(name)) return@registerNativeAsyncMethod null
			val file = File(mediaDir(), name)
			val out = JSONObject().put("path", file.absolutePath).put("exists", file.exists()).put("bytes", file.length())
			runCatching {
				val raw = file.readText()
				out.put("readChars", raw.length)
				val obj = JSONObject(raw)
				out.put("mime", obj.optString("mime")).put("hasIv", obj.has("iv")).put("hasPayload", obj.has("payload"))
				out.put("cipherBytes", Base64.decode(obj.getString("payload"), Base64.NO_WRAP).size)
				out.put("decrypt", JSONArray().put(ring.describe(obj)))
			}.onFailure { out.put("error", "${it.javaClass.simpleName}: ${it.message}") }
			out.toString()
		}

		// setBaseDir(path) -> true. Bootstrap's call names the folder for the first time; later calls
		// are location changes. See switchBaseDirLocked. Whatever state the folder turns out to be in
		// (locked, unreadable, fallback) is in getStorageStatus.
		registerNativeAsyncMethod("${manifest.id}.setBaseDir") { args ->
			val backupPath = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod false
			mutex.withLock {
				runCatching {
					switchBaseDirLocked(backupPath)
					migrateLocked()
					writeKeyFileLocked()
				}.onFailure { error ->
					lastWriteError = "${cls(error)}: changing folders failed"
					Log.e(TAG, "setBaseDir failed (${cls(error)})")
				}
			}
			true
		}

		// Where the log actually ended up, and why, so the UI can say so rather than failing silently.
		registerNativeAsyncMethod("${manifest.id}.getStorageStatus") { _ ->
			mutex.withLock {
				val l = layout.get()
				JSONObject().apply {
					put("baseDir", l.base.absolutePath)
					put("requestedDir", requestedDir ?: l.base.absolutePath)
					put("usingFallback", storageError != null)
					put("error", storageError ?: JSONObject.NULL)
					put("lastWriteError", lastWriteError ?: JSONObject.NULL)
					put("entries", entries.size)
					put("edits", edits.size)
					// Encryption: whether this folder needs the recovery password, whether one is set
					// (and covers the key new files use), and whether the Keystore protects the keys.
					put("locked", locked)
					put("recoverySet", ring.recoverySet)
					put("recoveryCurrent", ring.recoveryCurrent)
					put("deviceKey", if (ring.keystore) "keystore" else "file")
					// A log file here exists but won't read, decrypt or parse. Like `locked`, nothing is
					// written to the folder; the password can't help, but setAsideLocked (Start a new
					// log) or another location can. The reason names the file.
					put("unreadable", unreadable != null)
					put("unreadableReason", unreadable ?: JSONObject.NULL)
					// The key ring could not start (Keystore failure): nothing is saved this session.
					put("keyError", ring.broken ?: JSONObject.NULL)
					// False until bootstrap's setBaseDir: catches are held, not yet in any folder.
					put("ready", configured)
					// Catches held in app storage until a folder can take them.
					put("held", pendingFile.isFile)
					// A pre-trim copy sits beside the log (importBackup restores it).
					put("safetyCopy", File(l.base, PRE_TRIM_NAME).isFile)
				}.toString()
			}
		}

		/**
		 * setRecoveryPassword(password) -> { ok } or { ok: false, error }. Wraps every key this install
		 * holds; backups and bundles written from now on open elsewhere with it. Never logged.
		 */
		registerNativeAsyncMethod("${manifest.id}.setRecoveryPassword") { args ->
			val password = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
			if (password.length < KeyRing.MIN_PASSWORD) {
				return@registerNativeAsyncMethod mapOf("ok" to false, "error" to "short")
			}
			mutex.withLock {
				runCatching {
					ring.setRecovery(password)
					writeKeyFileLocked()
					mapOf("ok" to true)
				}.getOrElse { error ->
					Log.e(TAG, "setting the recovery password failed (${cls(error)})")
					mapOf("ok" to false, "error" to cls(error))
				}
			}
		}

		/**
		 * unlock(password) -> { matched, added, locked, unreadable, entries }. Opens a folder written
		 * by an earlier install (ghost-log.key.json and any backup beside the log carry its
		 * password-wrapped keys), then loads it and folds in what was caught while it was locked.
		 */
		registerNativeAsyncMethod("${manifest.id}.unlock") { args ->
			val password = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
			mutex.withLock {
				val base = baseDir()
				val records = keyFileRecords(base) + base.listFiles().orEmpty()
					.filter { it.isFile && it.name.endsWith(".json") && it.name != KeyRing.KEY_FILE }
					.flatMap { file -> recordsIn(runCatching { JSONObject(file.readText()) }.getOrNull()) }
				val (matched, added) = runCatching { ring.unlock(password, records) }.getOrElse { error ->
					Log.e(TAG, "unlock failed (${cls(error)})")
					0 to 0
				}
				reloadAfterUnlockLocked()
				migrateLocked()
				writeKeyFileLocked()
				log.i("unlock: matched=$matched added=$added locked=$locked")
				mapOf(
					"matched" to matched,
					"added" to added,
					"locked" to locked,
					"unreadable" to (unreadable != null),
					"entries" to entries.size,
				)
			}
		}

		/**
		 * setAsideLocked() -> the folder the held-back files moved to, or null when nothing is held back
		 * or they could not all be moved. For a locked log whose password is lost, or an unreadable
		 * one: moves the log files, and every media blob this session's catches don't use, into
		 * locked-<time>/ untouched, then saves this session's catches as a new log.
		 *
		 * Every rename is checked. One that fails puts back what had already moved and leaves the
		 * folder held back: clearing `locked` over a half-moved log would let the next flush write
		 * over what stayed. Media used to be moved only when its key was unknown, so fixed-key (0.2.x)
		 * blobs of the old log stayed and the next prune deleted them as orphans.
		 */
		registerNativeAsyncMethod("${manifest.id}.setAsideLocked") { _ ->
			mutex.withLock {
				if (!configured || !(locked || unreadable != null)) return@withLock null
				val l = layout.get()
				val aside = File(l.base, "locked-${System.currentTimeMillis()}")
				val moved = ArrayList<Pair<File, File>>()
				fun move(from: File, to: File): Boolean {
					to.parentFile?.mkdirs()
					val ok = from.renameTo(to)
					if (ok) moved.add(from to to)
					return ok
				}
				try {
					if (!aside.mkdirs()) error("could not create the aside folder")
					val shard = Regex("""^deleted-embeds-\d{5}\.json$""")
					val logFiles = l.base.listFiles().orEmpty().filter {
						it.isFile && (it.name == LOG_NAME || it.name == EDITS_NAME || it.name == INDEX_NAME || shard.matches(it.name))
					}
					for (file in logFiles) {
						if (!move(file, File(aside, file.name))) error("could not move ${file.name}")
					}
					File(l.base, KeyRing.KEY_FILE).takeIf { it.isFile }?.let { key ->
						copyAtomic(key, File(aside, KeyRing.KEY_FILE))?.let { throw it }
					}
					// A blob from the last ten minutes may belong to a capture that hasn't queued its
					// record yet (downloads happen before the lock), so it stays.
					val keep = localFilesIn(pendingRich)
					val cutoff = System.currentTimeMillis() - 10 * 60 * 1000L
					for (blob in l.media.listFiles().orEmpty()) {
						if (!blob.isFile || !blob.name.endsWith(".enc") || blob.name in keep || blob.lastModified() >= cutoff) continue
						if (!move(blob, File(aside, "media/${blob.name}"))) error("could not move a media file")
					}
				} catch (error: Throwable) {
					var restored = true
					for ((from, to) in moved.asReversed()) if (!to.renameTo(from)) restored = false
					if (restored) runCatching { aside.deleteRecursively() }
					lastWriteError = "${cls(error)}: could not set the old log aside" +
						if (restored) "" else "; some files are still in ${aside.name}"
					Log.e(TAG, "setting the old log aside failed (${cls(error)}, restored=$restored)")
					return@withLock null
				}
				locked = false
				unreadable = null
				lastWriteError = null
				dirty = true
				editsDirty = true
				flushLocked()
				writeKeyFileLocked()
				log.i("set the old log aside in ${aside.name}")
				aside.absolutePath
			}
		}

		// The saved-video hook's state, for the Debug page (see LocalVideoHook.Status).
		registerNativeAsyncMethod("${manifest.id}.getVideoStatus") { _ -> LocalVideoHook.Status.toJson() }

        registerNativeAsyncMethod("${manifest.id}.getLogCount") { _ ->
            mutex.withLock { entries.size }
        }

        // clearLog() -> true only when the empty log reached the folder; then the shards, media and
        // safety copies go too. False before bootstrap, while the folder is locked or unreadable, or
        // when the write fails, and then nothing is deleted.
        registerNativeAsyncMethod("${manifest.id}.clearLog") { _ ->
            val cleared = mutex.withLock {
                // A held-back log is not this session's to clear: unlock it or set it aside first.
                if (!configured || frozen()) return@withLock false
                val before = entries.toList()
                val beforeRich = pendingRich.toList()
                entries.clear()
                pendingRich.clear()
                // The rest goes only once the empty log is on disk: deleting the shards and media
                // under a log that failed to save would leave it naming files that are gone.
                if (!commitLogLocked()) {
                    entries.addAll(before)
                    pendingRich.addAll(beforeRich)
                    return@withLock false
                }
                // Clearing the log must also drop the rolling embed shards, their index, and every
                // downloaded image, otherwise stale media/shards linger and reattach on next load.
                runCatching {
                    val l = layout.get()
                    val index = readJsonFile(l.richIndex) ?: JSONObject()
                    for (file in 1..index.optInt("file", 0).coerceAtLeast(0)) l.shard(file).delete()
                    l.richIndex.delete()
                    // Delete only the encrypted media blobs; keep .nomedia so the folder stays hidden.
                    l.media.listFiles()?.forEach { if (it.name.endsWith(".enc")) it.delete() }
                    // The safety copies hold the cleared entries too; cleared should mean gone.
                    File(l.base, PRE_TRIM_NAME).delete()
                    File(l.base, PRE_IMPORT_NAME).delete()
                }
                // And the decrypted working copies, or cleared media stays readable on disk.
                wipeMediaCache()
                true
            }
            if (cleared) log.i("log cleared")
            cleared
        }

        registerNativeMethod("${manifest.id}.getLogFilePath") { _ ->
            logFile().absolutePath
        }

        registerNativeAsyncMethod("${manifest.id}.setLimits") { args ->
            val max = (args.getOrNull(0) as? Number)?.toInt() ?: 100
            val unlimited = args.getOrNull(1) as? Boolean ?: false
            mutex.withLock {
                maxEntries = max.coerceAtLeast(1)
                unlimitedEntries = unlimited
                limitsKnown = true
                val before = entries.size to edits.size
                // With a safety copy first (PRE_TRIM_NAME): a settings reset that brings an
                // unlimited log back to 100 must not cut the rest with no copy anywhere.
                trimLocked(safety = true)
                if (entries.size != before.first || edits.size != before.second) {
                    // trimLocked trims the edit log too, so it has to be written as well.
                    dirty = true
                    editsDirty = true
                    flushLocked()
                }
            }
            log.i("setLimits max=$maxEntries unlimited=$unlimitedEntries")
			// JS sends the limits once per start, after the log is loaded: the moment to clear out what
			// earlier trims left behind. Off the call, since it reads every shard.
			scope.launch { mutex.withLock { pruneOrphansLocked() } }
            true
        }

        registerNativeAsyncMethod("${manifest.id}.exportBackup") { args ->
            val path = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
            mutex.withLock {
                // Held back, `entries` is only this session's catches, and the default backup sits in
                // the same folder: writing it would replace the old log's other copy with a near-empty one.
                if (!configured || frozen()) return@withLock null
                runCatching {
                    val target = resolveFile(path)
                    // Version 2 carries the edit history too. Version 1 was a bare array of
                    // deleted entries; importBackup still reads both.
                    val body = JSONObject().put("version", 2).put("deleted", JSONArray(entries)).put("edits", JSONArray(edits))
                    // The envelope carries this install's password-wrapped key, so the file restores on
                    // another phone with the recovery password and needs nothing else beside it.
                    val envelope = ring.seal(body.toString().toByteArray(Charsets.UTF_8))
                    ring.portableRecord()?.let { envelope.put("recovery", JSONArray().put(it)) }
                    if (!writeAtomic(target, envelope.toString())) return@runCatching null
                    mapOf(
                        "path" to target.absolutePath,
                        "count" to entries.size,
                        "edits" to edits.size,
                        "portable" to ring.recoveryCurrent,
                    )
                }.onFailure { error ->
                    lastWriteError = "${cls(error)}: ${error.message ?: "backup write failed"}"
                    Log.e(TAG, "backup export failed (${cls(error)})")
                }.getOrNull()
            }
        }

        // seedEntries(entries) -> how many new entries are in the log after the limit (Debug page).
        registerNativeAsyncMethod("${manifest.id}.seedEntries") { args ->
            val list = args.getOrNull(0) as? List<*> ?: return@registerNativeAsyncMethod 0
            mutex.withLock {
                if (!configured || frozen()) return@withLock 0
                val existing = entries.map { it.optString("id") }.toHashSet()
                val addedIds = ArrayList<String>()
                for (item in list) {
                    val map = item as? Map<*, *> ?: continue
                    val o = JSONObject(map)
                    for (key in listOf("sentAt", "deletedAt")) {
                        (o.opt(key) as? Number)?.let { o.put(key, it.toLong()) }
                    }
                    val id = o.optString("id")
                    if (id.isNotEmpty() && existing.add(id)) {
                        entries.add(o)
                        addedIds.add(id)
                    }
                }
                entries.sortByDescending { it.optLong("deletedAt", 0L) }
                trimLocked(safety = true)
                persistNowLocked()
                val live = entries.mapTo(HashSet()) { it.optString("id") }
                addedIds.count { it in live }
            }
        }

        /**
         * Merges a backup's text into the log. Caller holds the mutex. [dir] is the folder it came
         * from (a key file beside it can hold its key), null for a file from Android's picker.
         * Answers { added, edits, trimmed }, { needsPassword }, { wrongPassword }, -1 (unreadable
         * backup), or -4 (IMPORT_REFUSED: the folder is locked or unreadable, or not set yet).
         * `added` counts only new entries still in the log after the limit; `trimmed` is how many
         * entries (old or new) the limit cut, with the pre-trim copy written first.
         */
        fun importBackupRawLocked(raw: String, dir: File?, password: String): Any {
                if (!configured) return IMPORT_REFUSED
                var opened = decrypt(raw)
                if (opened == null && ring.isUnknownKey(raw)) {
                    // Written on another phone or a previous install: its own envelope (and any key file
                    // beside it) carries the password-wrapped key.
                    if (password.isEmpty()) return mapOf("needsPassword" to true)
                    val records = recordsIn(runCatching { JSONObject(raw) }.getOrNull()) + keyFileRecords(dir)
                    val (matched, _) = runCatching { ring.unlock(password, records) }.getOrElse { 0 to 0 }
                    if (matched == 0) return mapOf("wrongPassword" to true)
                    // The same key may be what the current folder was locked with.
                    reloadAfterUnlockLocked()
                    writeKeyFileLocked()
                    opened = decrypt(raw)
                }
                // Merged into a held-back folder it would live in memory only, and `added` would be a
                // promise nothing keeps.
                if (frozen()) return IMPORT_REFUSED
                val plain = opened ?: return -1
                // Version 1: a bare array of deleted entries. Version 2: {deleted, edits}.
                val trimmed = plain.trimStart()
                val body = if (trimmed.startsWith("{")) runCatching { JSONObject(plain) }.getOrNull() else null
                val arr = if (body != null) body.optJSONArray("deleted") ?: JSONArray()
                else runCatching { JSONArray(plain) }.getOrNull() ?: return -1
                val existing = entries.map { it.optString("id") }.toHashSet()
                val addedIds = ArrayList<String>()
                for (i in 0 until arr.length()) {
                    val o = arr.optJSONObject(i) ?: continue
                    val id = o.optString("id")
                    if (id.isNotEmpty() && existing.add(id)) {
                        entries.add(o)
                        addedIds.add(id)
                    }
                }
                entries.sortByDescending { it.optLong("deletedAt", 0L) }
                val editsAdded = body?.optJSONArray("edits")?.let { mergeEditsLocked(it) } ?: 0
                val beforeTrim = entries.size
                trimLocked(safety = true)
                editsDirty = editsDirty || editsAdded > 0
                persistNowLocked()
                val live = entries.mapTo(HashSet()) { it.optString("id") }
                return mapOf(
                    "added" to addedIds.count { it in live },
                    "edits" to editsAdded,
                    "trimmed" to beforeTrim - entries.size,
                )
        }

        registerNativeAsyncMethod("${manifest.id}.importBackup") { args ->
            val path = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod -1
            val password = (args.getOrNull(1) as? String).orEmpty()
            mutex.withLock {
                val source = resolveExisting(path)
                val raw = runCatching { source.readText() }
                    .onFailure { error -> Log.e(TAG, "backup import could not read the file (${cls(error)})") }
                    .getOrNull() ?: return@withLock -1
                importBackupRawLocked(raw, source.parentFile, password)
            }
        }

        /** Reads a content:// file picked in Android's picker into [target], up to [cap] bytes. */
        fun copyPicked(uri: String, target: File, cap: Long): Boolean {
            val context = appContext ?: return false
            val stream = context.contentResolver.openInputStream(android.net.Uri.parse(uri)) ?: return false
            target.parentFile?.mkdirs()
            stream.use { input ->
                target.outputStream().use { out ->
                    val buffer = ByteArray(64 * 1024)
                    var total = 0L
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        total += read
                        if (total > cap) {
                            target.delete()
                            Log.w(TAG, "picked file over the ${cap / (1024 * 1024)} MB limit")
                            return false
                        }
                        out.write(buffer, 0, read)
                    }
                }
            }
            return true
        }

        /** importBackup for a file from Android's picker: same answers. */
        registerNativeAsyncMethod("${manifest.id}.importBackupUri") { args ->
            val uri = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod -1
            val password = (args.getOrNull(1) as? String).orEmpty()
            val temp = File(storageDir, "picked-backup.part")
            mutex.withLock {
                try {
                    if (!runCatching { copyPicked(uri, temp, 512L * 1024 * 1024) }.getOrDefault(false)) return@withLock -1
                    importBackupRawLocked(temp.readText(), null, password)
                } finally {
                    temp.delete()
                }
            }
        }

		/**
		 * Pulls Ghost Log Native Beta's data straight out of its own folder, so moving over needs no
		 * export, no shared storage and no typed path. Both plugins run inside the same Discord, so the
		 * old plugin's app-private folder is readable from here. It is only read, never changed.
		 *
		 * Takes every log found there (encrypted log, edit history, rich-content shards, media blobs)
		 * and any `*.backup.json`, plus the live log in shared storage when the old settings pointed
		 * there. Entries and rich records are added by id where NG has none, edit histories are merged,
		 * media is copied where NG lacks the file. Old-key data decrypts through the fallback keys and
		 * is rewritten under the current key by the persist below.
		 */
		registerNativeAsyncMethod("${manifest.id}.importOldPlugin") { _ ->
			mutex.withLock {
				// Into a held-back folder it would live in memory only. `refused` lets the UI say why.
				if (!configured || frozen()) return@withLock mapOf<String, Any>("found" to false, "refused" to true)
				flushLocked()
				val oldId = "bleelblep.ghost-log-native-beta"
				// Valenced's own plugin storage: storage/<slot>/<id> on 1.7+, storage/<id> before it.
				val storageRoot = generateSequence(storageDir) { it.parentFile }.firstOrNull { it.name == "storage" }
				val oldDirs = storageRoot?.walkTopDown()?.maxDepth(2)
					?.filter { it.isDirectory && it.name == oldId }?.toList().orEmpty().toMutableList()
				// Revenge Next (what Valenced used to be) kept plugin data in Discord's folder at
				// files/revenge/plugins/storage/<id>/. Both Ghost Log Native Beta and the Revenge-era
				// Ghost Log NG lived there; NG's settings didn't carry over to Valenced (0.2.19), and nor
				// did its log. Only read, never changed. A Revenge Next that was a separate app has its
				// files in that app's private storage, which nothing here can reach: export a bundle
				// there and import it with the file picker instead.
				val revengeRoot = File(appInfo.dataDir, "files/revenge/plugins/storage")
				if (revengeRoot.isDirectory) {
					revengeRoot.walkTopDown().maxDepth(2)
						.filter { it.isDirectory && (it.name == oldId || it.name == manifest.id) }
						// Never this plugin's own live folder, if Valenced's storage sits in there too.
						.filter { runCatching { it.canonicalPath != storageDir.canonicalPath }.getOrDefault(false) }
						.forEach(oldDirs::add)
				}
				val seenDirs = HashSet<String>()
				oldDirs.retainAll { runCatching { seenDirs.add(it.canonicalPath) }.getOrDefault(false) }
				if (oldDirs.isEmpty()) return@withLock mapOf<String, Any>("found" to false)

				val baseDirs = LinkedHashSet<File>()
				val backups = LinkedHashSet<File>()
				val configured = Regex(""""backupFilePath"\s*:\s*"([^"]+)"""")
				for (dir in oldDirs) {
					dir.walkTopDown().onEnter { it.name != "mediacache" }.forEach { f ->
						if (f.isDirectory && (File(f, "deleted-log.json.enc").isFile || File(f, "deleted-embeds.index.v1.json").isFile)) baseDirs.add(f)
						if (f.isFile && f.name.endsWith(".backup.json")) backups.add(f)
					}
					// A shared-storage log lives outside the folder; the old JS settings say where.
					dir.listFiles()?.filter { it.isFile && it.name.endsWith(".json") }?.forEach { settings ->
						val path = runCatching { configured.find(settings.readText())?.groupValues?.get(1) }.getOrNull()
							?: return@forEach
						val file = File(path.replace("\\/", "/"))
						if (!file.isAbsolute) return@forEach
						file.parentFile?.takeIf { File(it, "deleted-log.json.enc").isFile }?.let { baseDirs.add(it) }
						if (file.isFile) backups.add(file)
					}
				}

				fun readArray(file: File): JSONArray? {
					val raw = runCatching { file.readText() }.getOrNull() ?: return null
					return runCatching { JSONArray(decrypt(raw) ?: return null) }.getOrNull()
				}
				val known = entries.map { it.optString("id") }.toHashSet()
				val addedIds = ArrayList<String>()
				fun addEntries(arr: JSONArray?) {
					arr ?: return
					for (i in 0 until arr.length()) {
						val o = arr.optJSONObject(i) ?: continue
						val id = o.optString("id")
						if (id.isNotEmpty() && known.add(id)) {
							entries.add(o)
							addedIds.add(id)
						}
					}
				}
				// Rich records already in NG's shards or queue win; the old copy only fills gaps.
				val richKnown = HashSet<String>()
				for (n in 1..(readJsonFile(richIndexFile())?.optInt("file", 0) ?: 0).coerceAtLeast(0)) {
					val arr = readJsonFile(richShard(n))?.optJSONArray("entries") ?: continue
					for (i in 0 until arr.length()) arr.optJSONObject(i)?.optString("messageId")?.let { richKnown.add(it) }
				}
				pendingRich.forEach { richKnown.add(it.optString("messageId")) }

				var editsChanged = 0
				var rich = 0
				var media = 0
				for (dir in baseDirs) {
					addEntries(readArray(File(dir, "deleted-log.json.enc")))
					readArray(File(dir, "edited-log.json.enc"))?.let { editsChanged += mergeEditsLocked(it) }
					val index = readJsonFile(File(dir, "deleted-embeds.index.v1.json"))
					for (n in 1..(index?.optInt("file", 0) ?: 0).coerceAtLeast(0)) {
						val arr = readJsonFile(File(dir, "deleted-embeds-%05d.json".format(n)))?.optJSONArray("entries") ?: continue
						for (i in 0 until arr.length()) {
							val record = arr.optJSONObject(i) ?: continue
							val id = record.optString("messageId")
							if (id.isNotEmpty() && richKnown.add(id)) {
								pendingRich.add(record)
								rich++
							}
						}
					}
					File(dir, "media").listFiles()?.forEach { src ->
						if (!src.isFile || !src.name.endsWith(".enc")) return@forEach
						val dst = File(ensureMediaDir(), src.name)
						if (!dst.exists() && copyAtomic(src, dst) == null) media++
					}
				}
				for (file in backups) {
					val plain = runCatching { decrypt(file.readText()) }.getOrNull() ?: continue
					// Version 1: a bare array of deleted entries. Version 2: {deleted, edits}.
					val body = if (plain.trimStart().startsWith("{")) runCatching { JSONObject(plain) }.getOrNull() else null
					addEntries(if (body != null) body.optJSONArray("deleted") else runCatching { JSONArray(plain) }.getOrNull())
					body?.optJSONArray("edits")?.let { editsChanged += mergeEditsLocked(it) }
				}

				entries.sortByDescending { it.optLong("deletedAt", 0L) }
				trimLocked(safety = true)
				editsDirty = editsDirty || editsChanged > 0
				persistNowLocked()
				// Counted after the limit: only what is actually in the log now.
				val live = entries.mapTo(HashSet()) { it.optString("id") }
				val added = addedIds.count { it in live }
				log.i("imported from Revenge Next / $oldId: $added entries, $editsChanged edits, $rich rich, $media media from ${baseDirs.size + backups.size} sources")
				mapOf<String, Any>(
					"found" to true,
					"added" to added,
					"edits" to editsChanged,
					"rich" to rich,
					"media" to media,
					"sources" to baseDirs.size + backups.size,
				)
			}
		}

		/**
		 * Everything that makes up a complete log: the encrypted text log, the rich-content index and
		 * its rolling shards, and every encrypted media blob. Media entries are namespaced under
		 * `media/` inside the archive so the import side can put them back in the right place.
		 */
		fun bundleEntries(): List<Pair<String, File>> {
			val l = layout.get()
			val out = mutableListOf<Pair<String, File>>()
			if (l.log.isFile) out.add(l.log.name to l.log)
			if (l.edits.isFile) out.add(l.edits.name to l.edits)
			if (l.richIndex.isFile) out.add(l.richIndex.name to l.richIndex)
			val index = readJsonFile(l.richIndex)
			if (index != null) {
				for (file in 1..index.optInt("file", 0).coerceAtLeast(0)) {
					val shard = l.shard(file)
					if (shard.isFile) out.add(shard.name to shard)
				}
			} else {
				// Index unreadable (a locked log): take every shard by name rather than none.
				val shardName = Regex("""^deleted-embeds-\d{5}\.json$""")
				l.base.listFiles()?.filter { it.isFile && shardName.matches(it.name) }?.sortedBy { it.name }
					?.forEach { out.add(it.name to it) }
			}
			l.media.listFiles()?.forEach { if (it.isFile && it.name.endsWith(".enc")) out.add("media/${it.name}" to it) }
			return out
		}

		/**
		 * Write the whole log as one portable .zip. The contents are already AES-GCM ciphertext, so the
		 * archive is no less protected than the base dir it came from. It restores on another phone
		 * with the recovery password (its key records ride along as ghost-log.key.json), which is the
		 * answer to app-private storage not surviving an uninstall.
		 *
		 * Writes the bundle .zip to [target] through a .part and a rename, so an export cut short never
		 * replaces an older bundle with a broken one. Returns how many log files went in. Caller holds
		 * the mutex.
		 */
		fun writeBundleLocked(target: File): Int {
			var files = 0
			val error = atomicReplace(target) { out ->
				ZipOutputStream(NonClosing(out)).use { zip ->
					for ((name, file) in bundleEntries()) {
						zip.putNextEntry(ZipEntry(name))
						file.inputStream().use { it.copyTo(zip) }
						zip.closeEntry()
						files++
					}
					// The password-wrapped keys for everything above, including files still under a key
					// carried in from elsewhere, so the bundle opens on another phone with the password.
					val records = ring.mergedRecords(keyFileRecords(baseDir()))
					if (records.length() > 0) {
						zip.putNextEntry(ZipEntry(KeyRing.KEY_FILE))
						zip.write(JSONObject().put("version", 1).put("records", records).toString().toByteArray(Charsets.UTF_8))
						zip.closeEntry()
					}
				}
			}
			if (error != null) throw error
			return files
		}

		registerNativeAsyncMethod("${manifest.id}.exportBundle") { args ->
			val path = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod null
			mutex.withLock {
				flushLocked()
				runCatching {
					val target = resolveFile(path)
					val files = writeBundleLocked(target)
					log.i("exported bundle: $files files")
					mapOf(
						"path" to target.absolutePath,
						"files" to files,
						"count" to entries.size,
						"portable" to ring.recoveryCurrent,
					)
				}.onFailure { error ->
					lastWriteError = "${cls(error)}: ${error.message ?: "bundle export failed"}"
					Log.e(TAG, "bundle export failed (${cls(error)})")
				}.getOrNull()
			}
		}

		/**
		 * exportBundleToDownloads() -> { path, count, portable } or null. Saves the bundle into the
		 * phone's Download/GhostLogNG folder through MediaStore. Discord has no permission to write
		 * there with plain file paths on Android 11+, but any app may add its own files to Download
		 * this way (Android 10+), and they survive uninstalling Discord. Same pattern as Checkup.
		 */
		registerNativeAsyncMethod("${manifest.id}.exportBundleToDownloads") { _ ->
			val context = appContext ?: return@registerNativeAsyncMethod null
			if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.Q) return@registerNativeAsyncMethod null
			val temp = File(storageDir, "bundle-export.zip.tmp")
			mutex.withLock {
				flushLocked()
				try {
					runCatching {
						writeBundleLocked(temp)
						val stamp = java.text.SimpleDateFormat("yyyy-MM-dd-HHmm", java.util.Locale.US).format(java.util.Date())
						val name = "ghost-log-bundle-$stamp.zip"
						val folder = "${android.os.Environment.DIRECTORY_DOWNLOADS}/GhostLogNG"
						val resolver = context.contentResolver
						val values = android.content.ContentValues().apply {
							put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, name)
							put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "application/zip")
							put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, folder)
							// Pending until it is whole: nothing else sees a half-written bundle.
							put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)
						}
						val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
							?: error("MediaStore would not create the file")
						try {
							(resolver.openOutputStream(uri) ?: error("MediaStore gave no stream")).use { out ->
								temp.inputStream().use { it.copyTo(out) }
							}
							values.clear()
							values.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0)
							resolver.update(uri, values, null, null)
						} catch (error: Throwable) {
							runCatching { resolver.delete(uri, null, null) }
							throw error
						}
						log.i("exported bundle to Download")
						mapOf("path" to "$folder/$name", "count" to entries.size, "portable" to ring.recoveryCurrent)
					}.onFailure { error ->
						lastWriteError = "${cls(error)}: ${error.message ?: "saving to Download failed"}"
						Log.e(TAG, "bundle export to Download failed (${cls(error)})")
					}.getOrNull()
				} finally {
					temp.delete()
				}
			}
		}

		// Bounds what one bundle may unpack to, so a damaged (or hostile) zip can't fill the phone.
		val maxBundleBytes = 4L * 1024 * 1024 * 1024

		/**
		 * Restore a .zip written by exportBundle. This REPLACES the log, the index and the shards with
		 * the archive's (and the edit log, when it has one), and merges its media blobs in; use
		 * importBackup for the merge-into-current path. Caller holds the mutex.
		 *
		 * Returns the number of entries in the log afterwards (after the limit), or BUNDLE_FAILED
		 * (-1), BUNDLE_NEEDS_PASSWORD (-2), BUNDLE_WRONG_PASSWORD (-3), IMPORT_REFUSED (-4: the
		 * current folder is locked or unreadable, or not set yet) or BUNDLE_DAMAGED (-5: its log, or
		 * another log file in it, does not open or parse).
		 *
		 * Nothing in the folder changes until the whole archive is unpacked into app storage and every
		 * file in it opens. Then each file is swapped in whole through a .part and a rename, the log
		 * last. The log being replaced is kept first as PRE_IMPORT_NAME, and this session's catches
		 * that the bundle lacks (including any still waiting on the debounce) are put back after. It
		 * used to stream straight over the live files, so a truncated zip left them half-replaced; it
		 * checked only "not an unknown key", and it ran over a locked log.
		 */
		fun importBundleLocked(source: File, password: String): Int {
			if (!configured || frozen()) return IMPORT_REFUSED
			// Only what exportBundle writes. Anything else in an archive is skipped, so a bundle can
			// never replace keys.json or the key file (or anything else) in the base dir.
			val shardName = Regex("""^deleted-embeds-\d{5}\.json$""")
			val topLevel = setOf(LOG_NAME, EDITS_NAME, INDEX_NAME)
			val mediaName = Regex("""^media/[A-Za-z0-9._-]+\.enc$""")
			val work = File(storageDir, "bundle-import.tmp")
			var swappedLog = false
			try {
				work.deleteRecursively()
				if (!work.mkdirs()) return BUNDLE_FAILED

				// 1. Unpack into app storage. The folder is not touched.
				var records = emptyList<JSONObject>()
				var total = 0L
				ZipInputStream(source.inputStream().buffered()).use { zip ->
					val buffer = ByteArray(64 * 1024)
					while (true) {
						val entry = zip.nextEntry ?: break
						val name = entry.name.replace('\\', '/')
						if (!entry.isDirectory) {
							if (name == KeyRing.KEY_FILE) {
								records = recordsIn(runCatching { JSONObject(zip.reader().readText()) }.getOrNull())
							} else if (name in topLevel || shardName.matches(name) || mediaName.matches(name)) {
								val dst = File(work, name)
								dst.parentFile?.mkdirs()
								dst.outputStream().buffered().use { out ->
									while (true) {
										val read = zip.read(buffer)
										if (read < 0) break
										total += read
										if (total > maxBundleBytes) error("bundle unpacks past the size limit")
										out.write(buffer, 0, read)
									}
								}
							}
						}
						zip.closeEntry()
					}
				}

				// 2. Does it open? The log must open and parse, and so must every other log file in it.
				val incoming = Layout(work)
				if (!incoming.log.isFile) return BUNDLE_DAMAGED
				val logRaw = incoming.log.readText()
				if (ring.isUnknownKey(logRaw)) {
					if (password.isEmpty()) return BUNDLE_NEEDS_PASSWORD
					val (matched, _) = runCatching { ring.unlock(password, records) }.getOrElse { 0 to 0 }
					if (matched == 0 || ring.isUnknownKey(logRaw)) return BUNDLE_WRONG_PASSWORD
				}
				if (readLogFile(incoming.log) !is LogRead.Ok) return BUNDLE_DAMAGED
				if (incoming.edits.exists() && readLogFile(incoming.edits) !is LogRead.Ok) return BUNDLE_DAMAGED
				if (incoming.richIndex.exists() && readJsonFile(incoming.richIndex) == null) return BUNDLE_DAMAGED
				val shards = work.listFiles().orEmpty().filter { it.isFile && shardName.matches(it.name) }.sortedBy { it.name }
				if (shards.any { readJsonFile(it) == null }) return BUNDLE_DAMAGED

				// 3. Keep what is about to be replaced: the catches still waiting on the debounce go to
				// disk, the log as it stands becomes the pre-import copy, and this session's catches
				// are held to put back.
				flushLocked()
				val l = layout.get()
				val heldEntries = entries.filter { it.optString("id") in sessionDeleted }
				val heldEdits = edits.filter { it.optString("id") in sessionEdited }
				val heldRich = (readShardsOf(l) + pendingRich).filter { it.optString("messageId") in sessionDeleted }
				if (!writeSafetyCopyLocked(PRE_IMPORT_NAME)) return BUNDLE_FAILED

				// 4. Swap in, each file whole: media (only added), shards, index, edits, then the log.
				File(work, "media").listFiles().orEmpty().forEach { blob ->
					val dst = File(ensureMediaDir(l.media), blob.name)
					synchronized(mediaLocks.computeIfAbsent(blob.name) { Any() }) {
						if (!dst.exists()) copyAtomic(blob, dst)?.let { throw it }
					}
				}
				for (shard in shards) copyAtomic(shard, File(l.base, shard.name))?.let { throw it }
				if (incoming.richIndex.isFile) {
					copyAtomic(incoming.richIndex, l.richIndex)?.let { throw it }
				} else if (l.richIndex.exists() && !l.richIndex.delete()) {
					error("could not remove the old index")
				}
				if (incoming.edits.isFile) copyAtomic(incoming.edits, l.edits)?.let { throw it }
				copyAtomic(incoming.log, l.log)?.let { throw it }
				swappedLog = true
				// The replaced log's other shards: left, they'd be filled again once the new index
				// reached their numbers, bringing the old records back with them.
				val kept = shards.map { it.name }.toHashSet()
				l.base.listFiles().orEmpty()
					.filter { it.isFile && shardName.matches(it.name) && it.name !in kept }
					.forEach { it.delete() }

				// 5. Read back what is on disk now and put this session's catches back in.
				loadLocked()
				if (frozen()) return BUNDLE_FAILED
				pendingRich.clear()
				val known = readShardsOf(l).map { it.optString("messageId") }.toHashSet()
				for (record in heldRich) if (known.add(record.optString("messageId"))) pendingRich.add(record)
				mergeHeldLocked(heldEntries, heldEdits)
				flushLocked()
				wipeMediaCache()
				// Re-seal what came in under the current key, and record the keys it brought.
				migrateLocked()
				writeKeyFileLocked()
				log.i("imported bundle (${entries.size} entries)")
				return entries.size
			} catch (error: Throwable) {
				Log.e(TAG, "bundle import failed (${cls(error)})")
				// Past the log swap, memory must follow the disk, or the next flush writes the old
				// log back over the new one.
				if (swappedLog) runCatching { loadLocked() }
				return BUNDLE_FAILED
			} finally {
				runCatching { work.deleteRecursively() }
			}
		}

		registerNativeAsyncMethod("${manifest.id}.importBundle") { args ->
			val path = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod BUNDLE_FAILED
			val password = (args.getOrNull(1) as? String).orEmpty()
			mutex.withLock { importBundleLocked(resolveExisting(path), password) }
		}

		/** importBundle for a .zip picked in Android's picker: copied in first (bounded), same answers. */
		registerNativeAsyncMethod("${manifest.id}.importBundleUri") { args ->
			val uri = args.getOrNull(0) as? String ?: return@registerNativeAsyncMethod BUNDLE_FAILED
			val password = (args.getOrNull(1) as? String).orEmpty()
			val temp = File(storageDir, "picked-bundle.zip.part")
			mutex.withLock {
				// Refused before the copy: a locked folder shouldn't cost a 2 GB read to say no.
				if (!configured || frozen()) return@withLock IMPORT_REFUSED
				try {
					if (!runCatching { copyPicked(uri, temp, 2048L * 1024 * 1024) }.getOrDefault(false)) return@withLock BUNDLE_FAILED
					importBundleLocked(temp, password)
				} finally {
					temp.delete()
				}
			}
		}

		// Decrypted working copies never survive a restart: whatever is in there is from a previous
		// session and may not even correspond to the current log.
		wipeMediaCache()

		// Best-effort final write, since stop {} cannot see any of the above. Bounded: stop() can run
		// on the main thread, and blocking it indefinitely on a mutex another coroutine happens to
		// hold would be an ANR of our own making. If the wait expires the debounced write is simply
		// lost, which is the same exposure the debounce already carries. Before bootstrap (or with
		// the folder held back) the flush goes to pendingFile, so those catches survive the stop.
		flushOnStop = {
			runCatching {
				runBlocking { withTimeoutOrNull(1500L) { mutex.withLock { flushLocked() } } }
				wipeMediaCache()
				scope.cancel()
			}
		}

        log.i("native capture ready${if (ring.broken != null) " (keys unavailable: nothing will be saved)" else ""}")
    }

    stop {
        flushOnStop?.invoke()
        flushOnStop = null
        unhookLocalVideo?.invoke()
        unhookLocalVideo = null
        log.i("Unloaded ${manifest.id}")
    }
}
