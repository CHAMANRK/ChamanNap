package com.chaman.nap

import android.content.Context
import android.os.SystemClock

/**
 * The native "is the owner verified right now" state. Java plugins call [check] before doing something sensitive
 * (ScreenControl does). The time lives only in memory, so a restarted app has to verify again.
 */
object FaceGate {
    @Volatile
    private var until = 0L // SystemClock.elapsedRealtime() based

    @JvmStatic
    fun grant(minutes: Int) {
        until = SystemClock.elapsedRealtime() + minutes.coerceAtLeast(1) * 60_000L
    }

    @JvmStatic
    fun revoke() {
        until = 0L
    }

    @JvmStatic
    fun remainMs(): Long = (until - SystemClock.elapsedRealtime()).coerceAtLeast(0L)

    /** Face lock is really in force: master on, a face enrolled, a model present. */
    @JvmStatic
    fun active(ctx: Context): Boolean {
        val c = FaceConfig.get(ctx)
        if (!c.master) return false
        if (ModelRegistry.load(ctx).models.isEmpty()) return false
        val store = FaceStore(ctx)
        return store.count() > 0 || store.hasData()
    }

    /** true = go ahead. false = this area needs a face check and the owner is not verified. */
    @JvmStatic
    fun check(ctx: Context, area: String): Boolean {
        val c = FaceConfig.get(ctx)
        if (area !in c.areas) return true
        if (!active(ctx)) return true
        return remainMs() > 0
    }
}
