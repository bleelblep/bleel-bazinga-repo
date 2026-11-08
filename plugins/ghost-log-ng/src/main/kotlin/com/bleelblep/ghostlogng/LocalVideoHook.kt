package com.bleelblep.ghostlogng

import android.app.Application
import android.net.Uri
import android.util.Log
import app.valenced.xposed.api.DexFinder
import java.io.File
import java.io.RandomAccessFile
import java.lang.reflect.InvocationHandler
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Method
import java.lang.reflect.Proxy

/**
 * Lets Discord's video player play Ghost Log NG's saved videos.
 *
 * Restored attachments point at decrypted copies in app-private storage (`file://.../mediacache/`).
 * Images load, because Fresco reads local files. Videos did not: Discord's player
 * (`com.discord.media_player.MediaPlayer`, 348.x) takes every source from `CacheDataSourceFactory`,
 * an ExoPlayer cache over an OkHttp or Cronet upstream, which only speaks HTTP. The poster frame
 * showed, then playback failed. A local HTTP server is no way round it either: the release build
 * sets `use_cleartext_traffic` false, so plain http to 127.0.0.1 is refused.
 *
 * So the data sources that factory builds are wrapped. A wrapped source reads a `file://` uri
 * itself, and only when it is inside [allowedDir] (Ghost Log NG's own decrypted cache); every other
 * uri goes to Discord's source untouched. Nothing in revenge-xposed is changed: this is an ordinary
 * XposedBridge hook from the plugin, like Text Brightness's.
 *
 * ExoPlayer is obfuscated in Discord's build (`DataSource.o(p)` is open, `x()` is getUri, ...), and
 * those names change between builds, so methods are told apart by signature, not by name:
 *
 * - `long (DataSpec)`: open. The uri is the DataSpec's only `Uri` field; position and length come
 *   from `DataSpec.toString()` ("DataSpec[GET uri, position, length, key, flags]"), which ExoPlayer
 *   keeps and obfuscation can't rename.
 * - `int (byte[], int, int)`: read. -1 is ExoPlayer's end-of-input.
 * - `Uri ()`: getUri. `Map ()`: response headers. `close()`.
 * - Anything else (the transfer listener) goes to Discord's source.
 *
 * From 352.2 Discord itself is R8-minified, so the factory and DataSource lose their names too.
 * Then the factory is found with [DexFinder] and DataSource is the return type of the factory
 * interface's only method. Only methods returning exactly DataSource are hooked: R8 narrowed
 * `buildCacheDataSource` to the concrete CacheDataSource, which a proxy can't stand in for.
 * Before anything is hooked, both classes are checked against the signatures above (shapeProblem);
 * a class that only looks right by its strings is refused and the Debug page says why.
 */
object LocalVideoHook {
	private const val TAG = "GhostLogNG"
	private const val FACTORY = "com.discord.media_player.CacheDataSourceFactory"
	private const val DATA_SOURCE = "com.google.android.exoplayer2.upstream.DataSource"

	/** "DataSpec[GET file:///x.mp4, 0, -1, null, 0]" -> position 0, length -1. */
	private val SPEC = Regex(""", (-?\d+), (-?\d+), [^,]*, -?\d+]$""")

	/**
	 * What happened, for the Debug page's "Video playback" row (`getVideoStatus`): no adb or devtools
	 * needed to tell "the hook never installed" from "the player was never handed the saved file"
	 * from "the file was refused or failed to read".
	 */
	object Status {
		@Volatile var hooked = -1 // -1 = install never ran, 0 = player classes or methods missing
		@Volatile var installError: String? = null
		@Volatile var served = 0
		@Volatile var lastError: String? = null
		/** The last few sources the player opened: "served file …", "refused file …", "passed https://…". */
		val recent = ArrayDeque<String>()

		@Synchronized fun note(line: String) {
			recent.addLast(line.take(160))
			while (recent.size > 8) recent.removeFirst()
		}

		@Synchronized fun toJson(): String = org.json.JSONObject().apply {
			put("hooked", hooked)
			put("installError", installError ?: org.json.JSONObject.NULL)
			put("served", served)
			put("lastError", lastError ?: org.json.JSONObject.NULL)
			put("recent", org.json.JSONArray(recent.toList()))
		}.toString()
	}

	fun install(classLoader: ClassLoader, allowedDir: File, dexFinder: DexFinder? = null): () -> Unit {
		val factory = runCatching { classLoader.loadClass(FACTORY) }.getOrNull()
			?: runCatching { dexFinder?.let(::findFactory) }.getOrNull()
		val dataSource = runCatching { classLoader.loadClass(DATA_SOURCE) }.getOrNull()
			?: runCatching { factory?.interfaces?.single()?.declaredMethods?.single()?.returnType }.getOrNull()
		if (factory == null || dataSource == null) {
			Log.w(TAG, "local video: player classes not found; saved videos will not play")
			Status.hooked = 0
			Status.installError = "player classes not found (${if (factory == null) FACTORY else DATA_SOURCE})"
			return {}
		}
		// A wrong match on a new Discord build would put a proxy that answers by signature in front of
		// something that isn't a DataSource at all. Refuse unless the shapes are the ones Source handles.
		val mismatch = runCatching { shapeProblem(factory, dataSource) }.getOrElse { "check failed: ${it.javaClass.simpleName}" }
		if (mismatch != null) {
			Log.w(TAG, "local video: player classes did not match ($mismatch); saved videos will not play")
			Status.hooked = 0
			Status.installError = "player classes did not match: $mismatch"
			return {}
		}
		val root = allowedDir.canonicalPath + File.separator
		val hook = object : XC_MethodHook() {
			override fun afterHookedMethod(param: MethodHookParam) {
				// Runs inside Discord's player setup: a failure here leaves Discord's own source in place.
				try {
					val original = param.result ?: return
					if (!dataSource.isInstance(original) || Proxy.isProxyClass(original.javaClass)) return
					param.result = Proxy.newProxyInstance(classLoader, arrayOf(dataSource), Source(original, root))
				} catch (error: Throwable) {
					Status.lastError = "wrap: ${error.javaClass.simpleName}"
				}
			}
		}
		// Both entry points where they return DataSource: `createDataSource()` for playback and
		// `buildCacheDataSource(boolean)`, which the first calls and downloads use directly. Wrapping
		// twice is guarded above. On 352.2+ the second returns CacheDataSource, so only the first is hooked.
		val unhooks = factory.declaredMethods
			.filter { it.returnType == dataSource && !java.lang.reflect.Modifier.isStatic(it.modifiers) }
			.map { XposedBridge.hookMethod(it, hook) }
		Log.i(TAG, "local video: hooked ${unhooks.size} player source method(s)")
		Status.hooked = unhooks.size
		if (unhooks.isEmpty()) Status.installError = "no DataSource-returning methods on $FACTORY"
		return { unhooks.forEach { runCatching { it.unhook() } } }
	}

	/**
	 * `CacheDataSourceFactory` on R8-minified Discord (352.2: `md.a`): the class holding the player's
	 * static Application, whose lateinit checks name "applicationContext" and "cache".
	 */
	private fun findFactory(finder: DexFinder): Class<*>? = finder.findClass {
		matcher {
			usingEqStrings("applicationContext", "cache")
			addFieldForType(Application::class.java)
			interfaceCount(1)
		}
	}?.takeIf { candidate ->
		// The strings and the field are loose on their own; the class must also be a concrete factory
		// whose one interface has one no-argument method, which is what install() reads DataSource from.
		val iface = candidate.interfaces.singleOrNull()
		val method = iface?.declaredMethods?.singleOrNull()
		!candidate.isInterface && !java.lang.reflect.Modifier.isAbstract(candidate.modifiers) &&
			method != null && method.parameterTypes.isEmpty() && method.returnType.isInterface
	}

	/**
	 * Null when [factory] and [dataSource] look like ExoPlayer's, otherwise what doesn't. Source tells
	 * methods apart by signature, so each one it answers must exist on DataSource exactly once:
	 * open `long (DataSpec)` where DataSpec has a public Uri field, read `int (byte[], int, int)`,
	 * getUri `Uri ()`, response headers `Map ()`; and the factory must return DataSource itself.
	 */
	private fun shapeProblem(factory: Class<*>, dataSource: Class<*>): String? {
		if (!dataSource.isInterface) return "DataSource is not an interface"
		val methods = dataSource.methods.filter { !java.lang.reflect.Modifier.isStatic(it.modifiers) }
		val open = methods.filter { it.returnType == java.lang.Long.TYPE && it.parameterTypes.size == 1 && !it.parameterTypes[0].isPrimitive }
		if (open.size != 1) return "open(DataSpec) x${open.size}"
		if (open[0].parameterTypes[0].fields.none { it.type == Uri::class.java }) return "DataSpec has no Uri field"
		val read = methods.count {
			it.returnType == Integer.TYPE && it.parameterTypes.contentEquals(arrayOf(ByteArray::class.java, Integer.TYPE, Integer.TYPE))
		}
		if (read != 1) return "read(byte[], int, int) x$read"
		val uri = methods.count { it.returnType == Uri::class.java && it.parameterTypes.isEmpty() }
		if (uri != 1) return "getUri() x$uri"
		val headers = methods.count { Map::class.java.isAssignableFrom(it.returnType) && it.parameterTypes.isEmpty() }
		if (headers > 1) return "getResponseHeaders() x$headers"
		val builders = factory.declaredMethods.count { it.returnType == dataSource && !java.lang.reflect.Modifier.isStatic(it.modifiers) }
		if (builders == 0) return "no DataSource-returning methods on the factory"
		return null
	}

	private class Source(private val delegate: Any, private val root: String) : InvocationHandler {
		private var file: RandomAccessFile? = null
		private var uri: Uri? = null
		private var remaining = 0L

		override fun invoke(proxy: Any, method: Method, args: Array<out Any?>?): Any? {
			val params = method.parameterTypes
			if (method.declaringClass == Any::class.java) {
				return when (method.name) {
					"equals" -> proxy === args?.getOrNull(0)
					"hashCode" -> System.identityHashCode(proxy)
					else -> "GhostLogLocalSource(${delegate})"
				}
			}
			// open(DataSpec)
			if (method.returnType == java.lang.Long.TYPE && params.size == 1 && args != null) {
				val spec = args[0]
				// Reflection on the DataSpec failing means "not ours": Discord's source takes it.
				val local = spec?.let { runCatching { localFileFor(it) }.getOrNull() }
				if (local != null) {
					return try {
						openLocal(local, spec).also {
							Status.served++
							Status.note("served file ${local.name} ($it bytes)")
						}
					} catch (error: Throwable) {
						Status.lastError = "open ${local.name}: $error"
						Status.note("failed file ${local.name}: ${error.javaClass.simpleName}")
						throw error
					}
				}
			}
			val open = file
			if (open != null) {
				when {
					method.returnType == Integer.TYPE && params.size == 3 && params[0] == ByteArray::class.java ->
						return readLocal(open, args!![0] as ByteArray, args[1] as Int, args[2] as Int)
					method.returnType == Uri::class.java && params.isEmpty() -> return uri
					Map::class.java.isAssignableFrom(method.returnType) && params.isEmpty() -> return emptyMap<String, List<String>>()
					method.name == "close" && params.isEmpty() -> {
						runCatching { open.close() }
						file = null
						uri = null
						return null
					}
				}
			}
			return try {
				method.invoke(delegate, *(args ?: emptyArray()))
			} catch (error: InvocationTargetException) {
				throw error.targetException
			}
		}

		/** The file a DataSpec asks for, only if it is a file:// uri inside Ghost Log's own cache. */
		private fun localFileFor(spec: Any): File? {
			val specUri = spec.javaClass.fields.firstOrNull { it.type == Uri::class.java }?.get(spec) as? Uri
			if (specUri == null) {
				Status.note("no Uri field on ${spec.javaClass.name}")
				return null
			}
			if (specUri.scheme != "file") {
				Status.note("passed ${specUri.scheme}://${specUri.host ?: ""}${(specUri.path ?: "").takeLast(40)}")
				return null
			}
			val path = specUri.path ?: return null
			val file = File(path)
			val canonical = runCatching { file.canonicalPath }.getOrNull() ?: return null
			if (!canonical.startsWith(root)) {
				Status.note("refused file outside the cache: $canonical")
				return null
			}
			if (!file.isFile) {
				Status.note("refused missing file ${file.name}")
				return null
			}
			uri = specUri
			return file
		}

		private fun openLocal(local: File, spec: Any): Long {
			val match = SPEC.find(spec.toString())
			val position = match?.groupValues?.get(1)?.toLongOrNull() ?: 0L
			val length = match?.groupValues?.get(2)?.toLongOrNull() ?: -1L
			val raf = RandomAccessFile(local, "r")
			val available = (raf.length() - position).coerceAtLeast(0L)
			raf.seek(position.coerceAtMost(raf.length()))
			remaining = if (length >= 0) minOf(length, available) else available
			file = raf
			return remaining
		}

		private fun readLocal(raf: RandomAccessFile, buffer: ByteArray, offset: Int, length: Int): Int {
			if (length == 0) return 0
			if (remaining <= 0L) return -1
			val read = try {
				raf.read(buffer, offset, minOf(length.toLong(), remaining).toInt())
			} catch (error: Throwable) {
				Status.lastError = "read: $error"
				throw error
			}
			if (read < 0) return -1
			remaining -= read
			return read
		}
	}
}
