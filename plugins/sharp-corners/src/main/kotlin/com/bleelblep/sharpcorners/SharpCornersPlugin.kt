@file:JvmName("SharpCornersPlugin")

package com.bleelblep.sharpcorners

import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod

/**
 * Sharp Corners' native half: the corner hooks (Corners.kt). JS sends the switches with
 * `setOptions(app, native, ovals)`; they're kept in SharedPreferences too, so the next launch starts
 * with the right ones before JS is up (views drawn before then would otherwise keep the defaults).
 */
private const val PREFS = "bleelblep.sharp-corners"

private val unhooks = mutableListOf<XC_MethodHook.Unhook>()

val sharpCornersPlugin = plugin {
	start {
		val id = manifest.id
		withAppContext { context ->
			runCatching {
				val prefs = context.getSharedPreferences(PREFS, 0)
				Corners.app = prefs.getBoolean("app", true)
				Corners.native = prefs.getBoolean("native", true)
				Corners.ovals = prefs.getBoolean("ovals", true)
			}
		}
		// Discord 352.2+ is R8-minified; the React Native hook is found with the host's DexKit there.
		Corners.install(classLoader, runCatching { dexFinder }.getOrNull(), unhooks) { message -> log.w(message) }
		log.i("${unhooks.size} corner hooks in")

		registerNativeMethod("$id.setOptions") { args ->
			Corners.app = args.getOrNull(0) as? Boolean ?: true
			Corners.native = args.getOrNull(1) as? Boolean ?: true
			Corners.ovals = args.getOrNull(2) as? Boolean ?: true
			withAppContext { context ->
				runCatching {
					context.getSharedPreferences(PREFS, 0).edit()
						.putBoolean("app", Corners.app)
						.putBoolean("native", Corners.native)
						.putBoolean("ovals", Corners.ovals)
						.apply()
				}
			}
			true
		}
		registerNativeMethod("$id.stats") { _ ->
			mapOf(
				"hooks" to unhooks.size,
				"app" to Corners.appCount.get().toDouble(),
				"native" to Corners.nativeCount.get().toDouble(),
				"ovals" to Corners.ovalCount.get().toDouble(),
			)
		}
	}
	stop {
		unhooks.forEach { runCatching { it.unhook() } }
		unhooks.clear()
	}
}
