package com.bleelblep.musicbridge

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager

/**
 * The app drawer icon. It belongs to the `.Launcher` alias (not MainActivity), so switching the
 * alias off hides the icon while Multi Scrobbler's "Open Music Bridge" still opens MainActivity.
 *
 * Android 10+ shows a stand-in icon that opens App info for any app with permissions and no
 * launcher icon, so on most phones "hidden" means that stand-in, not nothing.
 */
object LauncherIcon {
    private fun alias(context: Context) = ComponentName(context, "${context.packageName}.Launcher")

    fun shown(context: Context): Boolean =
        context.packageManager.getComponentEnabledSetting(alias(context)) != PackageManager.COMPONENT_ENABLED_STATE_DISABLED

    fun setShown(context: Context, shown: Boolean) {
        context.packageManager.setComponentEnabledSetting(
            alias(context),
            if (shown) PackageManager.COMPONENT_ENABLED_STATE_DEFAULT else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
    }
}
