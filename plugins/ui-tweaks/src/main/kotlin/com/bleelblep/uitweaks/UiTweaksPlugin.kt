@file:JvmName("UiTweaksPlugin")

package com.bleelblep.uitweaks

import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod

/**
 * UI Tweaks' native half: only the message-swipe stage icons (SwipeIcons.kt), which JS can't reach
 * on 351.x. JS tells it the chosen action per stage with `setSwipeIcons(short, long)`; the drawable
 * hook then serves that action's icon in place of Discord's. Everything else UI Tweaks does is JS.
 *
 * The list caches the drawables it has already loaded, so a change shows on rows built afterwards and
 * fully after a restart.
 */
val uiTweaksPlugin = plugin {
	start {
		val id = manifest.id
		withAppContext { context ->
			runCatching { SwipeIcons.install(context.resources, context.packageName) { message -> log.w(message) } }
				.onFailure { log.w("swipe icon hook failed: ${it.message}") }
		}
		registerNativeMethod("$id.swipeIconsSupported") { _ -> true }
		registerNativeMethod("$id.setSwipeIcons") { args ->
			SwipeIcons.shortAction = (args.getOrNull(0) as? String) ?: "stock"
			SwipeIcons.longAction = (args.getOrNull(1) as? String) ?: "stock"
			true
		}
	}
	stop {
		SwipeIcons.uninstall()
	}
}
