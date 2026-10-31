package com.bleelblep.livemarkdown

import app.valenced.plugins.PluginBuilder
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Member
import java.lang.reflect.Method

/**
 * Xposed hooks without naming the Xposed API.
 *
 * Some frameworks (JingMatrix Vector, LSPosed with API obfuscation) rename `de.robv.android.xposed`
 * to a random package and rewrite the *module's* dex to match. Plugin jars are loaded later by
 * Valenced and never rewritten, so any class of ours that extends `XC_MethodHook` or calls
 * `XposedBridge` fails with NoClassDefFoundError there. Instead, hooks are built by the host's own
 * `app.valenced.xposed.MethodHookBuilder` (already rewritten, not minified), and
 * `XposedBridge` is found next to whatever `XC_MethodHook` the built hook extends.
 */
internal class HookParam(private val scope: Any) {
	val thisObject: Any? get() = Host.call(Host.getThis, scope)
	@Suppress("UNCHECKED_CAST")
	val args: Array<Any?> get() = Host.call(Host.getArgs, scope) as Array<Any?>
	var result: Any?
		get() = Host.call(Host.getResult, scope)
		set(value) { Host.call(Host.setResult, scope, value) }
	var throwable: Throwable?
		get() = Host.call(Host.getThrowable, scope) as Throwable?
		set(value) { Host.call(Host.setThrowable, scope, value) }
}

internal fun interface Unhook {
	fun unhook()
}

internal fun hookMethod(
	member: Member,
	before: ((HookParam) -> Unit)? = null,
	after: ((HookParam) -> Unit)? = null,
): Unhook {
	val builder = Host.builderCtor.newInstance()
	if (before != null) Host.call(Host.before, builder, { scope: Any -> before(HookParam(scope)) })
	if (after != null) Host.call(Host.after, builder, { scope: Any -> after(HookParam(scope)) })
	val hook = Host.call(Host.build, builder)!!
	val unhook = Host.call(Host.hookMethod(hook.javaClass), null, member, hook)!!
	val unhookMethod = unhook.javaClass.getMethod("unhook")
	return Unhook { Host.call(unhookMethod, unhook) }
}

private object Host {
	private val loader = PluginBuilder::class.java.classLoader!!
	private val builderClass = loader.loadClass("app.valenced.xposed.MethodHookBuilder")
	private val scopeClass = loader.loadClass("app.valenced.xposed.HookScope")

	val builderCtor = builderClass.getDeclaredConstructor().apply { isAccessible = true }
	val before: Method = builderClass.getMethod("before", Function1::class.java)
	val after: Method = builderClass.getMethod("after", Function1::class.java)
	val build: Method = builderClass.getMethod("build")

	val getThis: Method = scopeClass.getMethod("getThisObject")
	val getArgs: Method = scopeClass.getMethod("getArgs")
	val getResult: Method = scopeClass.getMethod("getResult")
	val setResult: Method = scopeClass.getMethod("setResult", Any::class.java)
	val getThrowable: Method = scopeClass.getMethod("getThrowable")
	val setThrowable: Method = scopeClass.getMethod("setThrowable", Throwable::class.java)

	@Volatile private var bridgeHook: Method? = null

	/** `XposedBridge.hookMethod`, in whichever package the framework put it. */
	fun hookMethod(hookClass: Class<*>): Method = bridgeHook ?: run {
		var base: Class<*> = hookClass
		while (base.superclass != null && base.simpleName != "XC_MethodHook") base = base.superclass!!
		val bridge = Class.forName("${base.name.substringBeforeLast('.')}.XposedBridge", false, base.classLoader)
		bridge.getMethod("hookMethod", Member::class.java, base).also { bridgeHook = it }
	}

	fun call(method: Method, target: Any?, vararg args: Any?): Any? = try {
		method.invoke(target, *args)
	} catch (e: InvocationTargetException) {
		throw e.targetException
	}
}
