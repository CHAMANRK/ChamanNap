package com.chaman.nap

import android.content.Context
import org.json.JSONArray

/** Face lock settings (written by the JS side through FaceLock.config) + the "verified until" time. */
class FaceConfig private constructor(ctx: Context) {
    private val sp = ctx.getSharedPreferences("chaman_face", Context.MODE_PRIVATE)

    /** Master switch. Face lock only works when this is on AND a face is enrolled. */
    var master: Boolean
        get() = sp.getBoolean("master", true)
        set(v) = sp.edit().putBoolean("master", v).apply()

    /** How long one successful check stays valid (minutes). */
    var ttlMin: Int
        get() = sp.getInt("ttl", 30)
        set(v) = sp.edit().putInt("ttl", v.coerceIn(1, 480)).apply()

    var blink: Boolean
        get() = sp.getBoolean("blink", true)
        set(v) = sp.edit().putBoolean("blink", v).apply()

    /** Added to the model threshold. Positive = stricter. */
    var strictness: Float
        get() = sp.getFloat("strict", 0f)
        set(v) = sp.edit().putFloat("strict", v.coerceIn(-0.2f, 0.2f)).apply()

    /** Lock the phone when a face that is NOT the owner is seen. */
    var lockUnknown: Boolean
        get() = sp.getBoolean("lockUnknown", true)
        set(v) = sp.edit().putBoolean("lockUnknown", v).apply()

    /** Save a photo of the unknown face to /sdcard/Chaman/intruder. */
    var savePhoto: Boolean
        get() = sp.getBoolean("photo", true)
        set(v) = sp.edit().putBoolean("photo", v).apply()

    /** Areas that need a face check (screen, termux, files, comms, links, code, memory, image, device). */
    var areas: Set<String>
        get() {
            val raw = sp.getString("areas", null) ?: return setOf("screen", "termux")
            return try {
                val a = JSONArray(raw)
                (0 until a.length()).map { a.getString(it) }.toSet()
            } catch (e: Exception) {
                setOf("screen", "termux")
            }
        }
        set(v) = sp.edit().putString("areas", JSONArray(v.toList()).toString()).apply()

    var lastUnknownAt: Long
        get() = sp.getLong("lastUnknown", 0L)
        set(v) = sp.edit().putLong("lastUnknown", v).apply()

    companion object {
        @Volatile
        private var inst: FaceConfig? = null

        fun get(ctx: Context): FaceConfig =
            inst ?: synchronized(this) { inst ?: FaceConfig(ctx.applicationContext).also { inst = it } }
    }
}
