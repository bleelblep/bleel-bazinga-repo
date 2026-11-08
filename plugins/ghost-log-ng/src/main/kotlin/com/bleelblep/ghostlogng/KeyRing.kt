package com.bleelblep.ghostlogng

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.GeneralSecurityException
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/**
 * The keys behind everything Ghost Log NG writes.
 *
 * Up to 0.2.x every file was sealed with a key derived from a fixed string printed in this plugin's
 * source, identical on every install, so anyone with the plugin could open anyone's log. Now:
 *
 * - **Data keys.** Each install makes a random 256-bit key. Files are sealed with it and say which
 *   key they need (`kid`). Keys from other installs join the ring when the recovery password
 *   unlocks them, so a restored backup keeps opening. Only the current key is used for writing.
 * - **Device protection.** The ring file (`keys.json`, app-private) holds each data key wrapped by an
 *   AES key that lives in Android's Keystore and never leaves this device. If the Keystore is
 *   unusable the key is stored as-is in app-private storage and the status says so.
 * - **Recovery password.** Set once. PBKDF2 turns it into a key-encryption key (KEK) that wraps every
 *   data key. The KEK itself is kept device-wrapped, so new keys get wrapped without asking for the
 *   password again and auto-backups stay silent. The password-wrapped copies ("records") travel in
 *   backups, bundles and `ghost-log.key.json`; the password is needed only where the device key is
 *   not, i.e. on another phone or after a reinstall.
 * - **Legacy keys.** The three old fixed keys stay as read-only fallbacks for version-1 envelopes, so
 *   old logs, backups, bundles and the old plugin's data still import. Whatever is read through one
 *   is rewritten under the current key.
 *
 * Plugins share Discord's process, so another plugin could use the same Keystore alias. This
 * protects the files against being copied off the phone, not against code running inside Discord.
 *
 * Thread safety: every public member is synchronized on the ring.
 */
internal class KeyRing(private val file: File, private val legacy: List<SecretKeySpec>) {

	sealed class Opened {
		/** [current] is false when the file should be rewritten under the current key. */
		class Ok(val bytes: ByteArray, val current: Boolean) : Opened()
		/** Sealed with a key this install does not have yet: the recovery password can add it. */
		class UnknownKey(val kid: String) : Opened()
		/** Not an envelope, damaged, or no key fits. */
		object Bad : Opened()
	}

	private val random = SecureRandom()
	private val keys = LinkedHashMap<String, SecretKeySpec>()
	// Every device wrap ever saved, including ones that would not unwrap this time, so a Keystore
	// hiccup never turns into a save that drops a key.
	private val deviceWraps = LinkedHashMap<String, JSONObject>()
	private var recovery: JSONObject? = null
	private var recoveryKek: SecretKeySpec? = null

	var currentId: String = ""
		@Synchronized get
		private set

	/** True when the data keys are protected by the Android Keystore. */
	var keystore: Boolean = false
		@Synchronized get
		private set

	/**
	 * Why the ring could not start (an error class), or null. The Keystore misbehaving at start used
	 * to throw out of the constructor and take the plugin's start with it. Now the ring starts empty
	 * instead: nothing it holds is trustworthy enough to write with, so the plugin treats the folder
	 * as held back (nothing written) and the status shows this.
	 */
	var broken: String? = null
		@Synchronized get
		private set

	class Sealed(val kid: String, val iv: ByteArray, val ct: ByteArray)

	init {
		try {
			load()
		} catch (error: Throwable) {
			broken = error.javaClass.simpleName
			Log.e(TAG, "key ring could not start (${error.javaClass.simpleName}); nothing will be written this session")
		}
	}

	// ---- status -------------------------------------------------------------------------------

	/** A recovery password is set and its key is usable on this device. */
	@get:Synchronized
	val recoverySet: Boolean get() = recovery != null && recoveryKek != null

	/** The recovery password covers the key new files are written with. */
	@get:Synchronized
	val recoveryCurrent: Boolean
		get() = recoverySet && recovery?.optJSONObject("wraps")?.has(currentId) == true

	// ---- sealing ------------------------------------------------------------------------------

	/** Seals [plain] under the current key as a version-2 envelope. Add fields (e.g. `mime`) after. */
	@Synchronized
	fun seal(plain: ByteArray): JSONObject {
		val sealed = sealParts(plain)
		return JSONObject()
			.put("version", 2)
			.put("kid", sealed.kid)
			.put("iv", b64(sealed.iv))
			.put("payload", b64(sealed.ct))
	}

	/** [seal] without building the envelope, so a large payload can be streamed out as Base64. */
	@Synchronized
	fun sealParts(plain: ByteArray): Sealed {
		val iv = ByteArray(12).also(random::nextBytes)
		val cipher = Cipher.getInstance(GCM)
		cipher.init(Cipher.ENCRYPT_MODE, keys.getValue(currentId), GCMParameterSpec(128, iv))
		cipher.updateAAD(aad(currentId))
		return Sealed(currentId, iv, cipher.doFinal(plain))
	}

	/** Never throws: anything that goes wrong reads as [Opened.Bad], as it always has for text files. */
	@Synchronized
	fun open(obj: JSONObject): Opened {
		val iv = runCatching { unb64(obj.getString("iv")) }.getOrNull() ?: return Opened.Bad
		val ct = runCatching { unb64(obj.getString("payload")) }.getOrNull() ?: return Opened.Bad
		return runCatching { openParts(obj.optString("kid"), iv, ct) }.getOrElse { Opened.Bad }
	}

	/**
	 * [open] on parts already decoded. [Opened.Bad] only when the data itself is wrong (the tag
	 * fails, the IV is malformed); anything else (out of memory, a provider failure) is thrown, so a
	 * caller deciding whether to delete a blob can tell "broken" from "couldn't check".
	 */
	@Synchronized
	fun openParts(kid: String, iv: ByteArray, ct: ByteArray): Opened {
		if (kid.isEmpty()) {
			// Version 1: one of the old fixed keys, no associated data.
			for (key in legacy) {
				val plain = try {
					Cipher.getInstance(GCM).run {
						init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
						doFinal(ct)
					}
				} catch (e: GeneralSecurityException) {
					null
				} catch (e: IllegalArgumentException) {
					null
				}
				if (plain != null) return Opened.Ok(plain, current = false)
			}
			return Opened.Bad
		}
		val key = keys[kid] ?: return Opened.UnknownKey(kid)
		val plain = try {
			Cipher.getInstance(GCM).run {
				init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, iv))
				updateAAD(aad(kid))
				doFinal(ct)
			}
		} catch (e: GeneralSecurityException) {
			return Opened.Bad
		} catch (e: IllegalArgumentException) {
			return Opened.Bad
		}
		return Opened.Ok(plain, current = kid == currentId)
	}

	/** [open] for text files. Null for anything that is not a readable envelope. */
	fun openString(raw: String): String? {
		val obj = parse(raw) ?: return null
		return (open(obj) as? Opened.Ok)?.bytes?.toString(Charsets.UTF_8)
	}

	/** An envelope sealed with a key this install lacks (as opposed to damaged or plain). */
	fun isUnknownKey(raw: String): Boolean {
		val obj = parse(raw) ?: return false
		return open(obj) is Opened.UnknownKey
	}

	@Synchronized
	fun hasKey(kid: String): Boolean = keys.containsKey(kid)

	/** Readable, but not under the current key: due a rewrite. */
	fun isStale(raw: String): Boolean {
		val obj = parse(raw) ?: return false
		return (open(obj) as? Opened.Ok)?.current == false
	}

	/** For the Debug page's media check: which key a blob wants and whether it opens. No content. */
	fun describe(obj: JSONObject): String {
		val kid = obj.optString("kid").ifEmpty { "legacy" }
		return when (val result = open(obj)) {
			is Opened.Ok -> "kid=$kid: ok (${result.bytes.size} bytes${if (result.current) "" else ", not yet rewritten"})"
			is Opened.UnknownKey -> "kid=$kid: key not on this device (recovery password unlocks it)"
			Opened.Bad -> "kid=$kid: does not open"
		}
	}

	// ---- recovery password --------------------------------------------------------------------

	/** Sets or replaces the recovery password. Older backups keep needing the one they were made with. */
	@Synchronized
	fun setRecovery(password: String) {
		val salt = ByteArray(16).also(random::nextBytes)
		val kek = derive(password, salt, ITERATIONS)
		val wraps = JSONObject()
		for ((kid, key) in keys) wraps.put(kid, wrapWithKek(kek, kid, key))
		val before = recovery to recoveryKek
		recovery = JSONObject()
			.put("salt", b64(salt))
			.put("iterations", ITERATIONS)
			.put("kek", deviceWrap(kek.encoded))
			.put("wraps", wraps)
		recoveryKek = kek
		try {
			save()
		} catch (error: Throwable) {
			// Not on disk, so not set: the status must not claim a password the next start won't have.
			recovery = before.first
			recoveryKek = before.second
			throw error
		}
	}

	/**
	 * Salt and rounds of a recovery record, or null when it isn't one this ring will run. Records
	 * come from files anyone can edit (backups, bundles, the key file beside the log): an empty salt
	 * made PBEKeySpec throw, and a record could ask for millions of rounds while the caller holds
	 * the plugin's lock. Records without `iterations` predate the field and used [LEGACY_ITERATIONS].
	 */
	private fun recordParams(record: JSONObject): Pair<ByteArray, Int>? {
		val saltText = record.optString("salt")
		if (saltText.isEmpty()) return null
		val salt = runCatching { unb64(saltText) }.getOrNull() ?: return null
		if (salt.size !in MIN_SALT..MAX_SALT) return null
		val iterations = if (record.has("iterations")) record.optInt("iterations", -1) else LEGACY_ITERATIONS
		if (iterations !in MIN_ITERATIONS..MAX_ITERATIONS) return null
		return salt to iterations
	}

	/**
	 * Adds every data key in [records] that [password] opens. With no recovery password set yet, the
	 * password becomes this install's one too, so a new phone needs it typed only once.
	 * Returns (records the password matched, keys added). Invalid records are skipped, never thrown on.
	 */
	@Synchronized
	fun unlock(password: String, records: List<JSONObject>): Pair<Int, Int> {
		var matched = 0
		var added = 0
		val derived = HashMap<String, SecretKeySpec?>()
		for (record in records) {
			val (salt, iterations) = recordParams(record) ?: continue
			val cacheKey = "${b64(salt)}:$iterations"
			// Each distinct salt costs a full derivation under the lock; a file can't make it run on.
			if (cacheKey !in derived) {
				if (derived.size >= MAX_DERIVATIONS) continue
				derived[cacheKey] = runCatching { derive(password, salt, iterations) }.getOrNull()
			}
			val kek = derived[cacheKey] ?: continue
			val wraps = record.optJSONObject("wraps") ?: continue
			var any = false
			for (kid in wraps.keys()) {
				val key = unwrapWithKek(kek, kid, wraps.optJSONObject(kid)) ?: continue
				any = true
				if (keys.containsKey(kid)) continue
				val ok = runCatching { addKeyLocked(kid, key) }
					.onFailure { Log.e(TAG, "adding a recovered key failed (${it.javaClass.simpleName})") }
					.isSuccess
				if (ok) added++
			}
			if (any) matched++
		}
		// The keys are usable for this session either way; a failed save only means the next start
		// asks for the password again.
		runCatching { if (matched > 0 && !recoverySet) setRecovery(password) else if (added > 0) save() }
			.onFailure { Log.e(TAG, "saving recovered keys failed (${it.javaClass.simpleName})") }
		return matched to added
	}

	/** This install's password-wrapped keys, for backups and bundles. Null with no password set. */
	@Synchronized
	fun portableRecord(): JSONObject? {
		val rec = recovery ?: return null
		if (recoveryKek == null) return null
		return JSONObject()
			.put("salt", rec.optString("salt"))
			.put("iterations", rec.optInt("iterations", LEGACY_ITERATIONS))
			.put("wraps", rec.optJSONObject("wraps") ?: JSONObject())
	}

	/**
	 * The records to write into `ghost-log.key.json` or a bundle: ours, plus any [existing] record
	 * that still holds a key this install lacks. Replacing the file outright could destroy the only
	 * recovery copy of a log that is still locked.
	 */
	@Synchronized
	fun mergedRecords(existing: List<JSONObject>): JSONArray {
		val out = JSONArray()
		val ours = portableRecord()
		if (ours != null) out.put(ours)
		for (record in existing) {
			if (ours != null && record.optString("salt") == ours.optString("salt")) continue
			val wraps = record.optJSONObject("wraps") ?: continue
			if (wraps.keys().asSequence().any { it !in keys }) out.put(record)
		}
		return out
	}

	// ---- internals ----------------------------------------------------------------------------

	private fun load() {
		val obj = if (file.isFile) {
			runCatching { JSONObject(file.readText()) }.getOrElse {
				// Never overwrite a ring we cannot read: set it aside and start a new one.
				val aside = File(file.parentFile, "${file.name}.unreadable-${System.currentTimeMillis()}")
				Log.e(TAG, "key ring unreadable (${it.javaClass.simpleName}), keeping it as ${aside.name}")
				// If it can't be moved, starting a new ring would save over it: stop instead (`broken`).
				if (!file.renameTo(aside)) throw IllegalStateException("unreadable key ring could not be set aside")
				null
			}
		} else null
		val device = deviceKey()
		keystore = device != null
		obj?.optJSONArray("keys")?.let { arr ->
			for (i in 0 until arr.length()) {
				val entry = arr.optJSONObject(i) ?: continue
				val kid = entry.optString("id").ifEmpty { null } ?: continue
				val wrap = entry.optJSONObject("device") ?: continue
				deviceWraps[kid] = wrap
				unwrapDevice(wrap, device)?.let { keys[kid] = it }
					?: Log.w(TAG, "key $kid did not unwrap on this device")
			}
		}
		recovery = obj?.optJSONObject("recovery")
		recoveryKek = recovery?.optJSONObject("kek")?.let { unwrapDevice(it, device) }
		val wanted = obj?.optString("current").orEmpty()
		if (wanted.isNotEmpty() && keys.containsKey(wanted)) {
			currentId = wanted
		} else {
			val key = SecretKeySpec(ByteArray(32).also(random::nextBytes), "AES")
			val kid = ByteArray(8).also(random::nextBytes).joinToString("") { "%02x".format(it) }
			addKeyLocked(kid, key)
			currentId = kid
			save()
			Log.i(TAG, "new data key $kid (keystore=$keystore)")
		}
	}

	private fun addKeyLocked(kid: String, key: SecretKeySpec) {
		keys[kid] = key
		deviceWraps[kid] = deviceWrap(key.encoded)
		val kek = recoveryKek ?: return
		recovery?.optJSONObject("wraps")?.put(kid, wrapWithKek(kek, kid, key))
	}

	private fun save() {
		val arr = JSONArray()
		for ((kid, wrap) in deviceWraps) arr.put(JSONObject().put("id", kid).put("device", wrap))
		val obj = JSONObject().put("version", 1).put("current", currentId).put("keys", arr)
		recovery?.let { obj.put("recovery", it) }
		atomicReplace(file) { it.write(obj.toString().toByteArray(Charsets.UTF_8)) }?.let { throw it }
	}

	private fun deviceKey(): SecretKey? = runCatching {
		val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
		// Generate only when the alias is truly absent: generating over an existing alias replaces
		// the key, and every data key wrapped by the old one would be gone.
		if (store.containsAlias(ALIAS)) {
			store.getKey(ALIAS, null) as SecretKey
		} else {
			KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE).run {
				init(
					KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
						.setBlockModes(KeyProperties.BLOCK_MODE_GCM)
						.setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
						.setKeySize(256)
						.build(),
				)
				generateKey()
			}
		}
	}.onFailure { Log.e(TAG, "Android Keystore unavailable (${it.javaClass.simpleName}); keys are stored unwrapped in app storage") }.getOrNull()

	private fun deviceWrap(raw: ByteArray): JSONObject {
		val device = deviceKey()
		if (device == null) return JSONObject().put("type", "raw").put("key", b64(raw))
		val cipher = Cipher.getInstance(GCM)
		// Keystore keys pick their own IV.
		cipher.init(Cipher.ENCRYPT_MODE, device)
		val ct = cipher.doFinal(raw)
		return JSONObject().put("type", "keystore").put("iv", b64(cipher.iv)).put("payload", b64(ct))
	}

	private fun unwrapDevice(wrap: JSONObject, device: SecretKey?): SecretKeySpec? = runCatching {
		when (wrap.optString("type")) {
			"raw" -> SecretKeySpec(unb64(wrap.getString("key")), "AES")
			"keystore" -> {
				device ?: return@runCatching null
				val cipher = Cipher.getInstance(GCM)
				cipher.init(Cipher.DECRYPT_MODE, device, GCMParameterSpec(128, unb64(wrap.getString("iv"))))
				SecretKeySpec(cipher.doFinal(unb64(wrap.getString("payload"))), "AES")
			}
			else -> null
		}
	}.getOrNull()

	private fun derive(password: String, salt: ByteArray, iterations: Int): SecretKeySpec {
		val spec = PBEKeySpec(password.toCharArray(), salt, iterations, 256)
		try {
			val bytes = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
			return SecretKeySpec(bytes, "AES")
		} finally {
			spec.clearPassword()
		}
	}

	private fun wrapWithKek(kek: SecretKeySpec, kid: String, key: SecretKeySpec): JSONObject {
		val iv = ByteArray(12).also(random::nextBytes)
		val cipher = Cipher.getInstance(GCM)
		cipher.init(Cipher.ENCRYPT_MODE, kek, GCMParameterSpec(128, iv))
		cipher.updateAAD(aad(kid))
		return JSONObject().put("iv", b64(iv)).put("payload", b64(cipher.doFinal(key.encoded)))
	}

	private fun unwrapWithKek(kek: SecretKeySpec, kid: String, wrap: JSONObject?): SecretKeySpec? = runCatching {
		wrap ?: return@runCatching null
		val cipher = Cipher.getInstance(GCM)
		cipher.init(Cipher.DECRYPT_MODE, kek, GCMParameterSpec(128, unb64(wrap.getString("iv"))))
		cipher.updateAAD(aad(kid))
		SecretKeySpec(cipher.doFinal(unb64(wrap.getString("payload"))), "AES")
	}.getOrNull()

	private fun parse(raw: String): JSONObject? =
		if (raw.trimStart().startsWith("{")) runCatching { JSONObject(raw) }.getOrNull() else null

	private fun aad(kid: String) = "ghost-log-ng:v2:$kid".toByteArray(Charsets.UTF_8)
	private fun b64(bytes: ByteArray) = Base64.encodeToString(bytes, Base64.NO_WRAP)
	private fun unb64(text: String): ByteArray = Base64.decode(text, Base64.NO_WRAP)

	companion object {
		private const val TAG = "GhostLogNG"
		private const val GCM = "AES/GCM/NoPadding"
		private const val KEYSTORE = "AndroidKeyStore"
		private const val ALIAS = "bleelblep.ghost-log-ng.device.v1"
		/**
		 * PBKDF2-SHA256 rounds for new passwords (OWASP's current figure); stored per record, so it
		 * can rise later and older records keep opening with what they say.
		 */
		const val ITERATIONS = 600_000
		/** What every record before 0.3.0 was written with, and the reading for one without the field. */
		const val LEGACY_ITERATIONS = 310_000
		/** A record asking for rounds outside this is refused rather than run under the plugin's lock. */
		private const val MIN_ITERATIONS = 100_000
		private const val MAX_ITERATIONS = 1_000_000
		/** Salt bytes a record may carry. Ours are 16. */
		private const val MIN_SALT = 8
		private const val MAX_SALT = 64
		/** Distinct salts one unlock will derive keys for. */
		private const val MAX_DERIVATIONS = 8
		/** Shortest recovery password accepted (JS checks too). */
		const val MIN_PASSWORD = 8
		/** Recovery records beside the log, so a shared-folder log can be unlocked after a reinstall. */
		const val KEY_FILE = "ghost-log.key.json"
	}
}
