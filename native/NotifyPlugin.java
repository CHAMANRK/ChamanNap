package com.chaman.nap;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Step22: native notifications + scheduler (see NotifyCore). JS side: www/js/sched.js.
 * Methods: status, requestNotif, openNotifSettings, openExact, openBattery, show, add, list, cancel, clear.
 */
@CapacitorPlugin(
        name = "Notify",
        permissions = {
                @Permission(alias = "notif", strings = {Manifest.permission.POST_NOTIFICATIONS})
        })
public class NotifyPlugin extends Plugin {

    private Context ctx() {
        return getContext().getApplicationContext();
    }

    private JSObject statusObj() {
        Context c = ctx();
        JSObject r = new JSObject();
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        r.put("notif", nm != null && nm.areNotificationsEnabled());
        r.put("exact", NotifyCore.canExact(c));
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        r.put("battery", pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("mode", NotifyCore.mode(c));
        r.put("wake", NotifyCore.wake(c));
        synchronized (NotifyCore.LOCK) {
            r.put("count", NotifyCore.load(c, NotifyCore.K_LIST).length());
        }
        return r;
    }

    private void openSettings(PluginCall call, Intent i) {
        try {
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()), "ERROR");
        }
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(statusObj());
    }

    @PluginMethod
    public void requestNotif(PluginCall call) {
        NotificationManager nm = (NotificationManager) ctx().getSystemService(Context.NOTIFICATION_SERVICE);
        boolean on = nm != null && nm.areNotificationsEnabled();
        if (on) {
            NotifyCore.ensureChannels(ctx());
            call.resolve(statusObj());
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notif") != PermissionState.GRANTED && !call.getData().has("_retry")) {
            call.getData().put("_retry", true);
            requestPermissionForAlias("notif", call, "notifCb");
            return;
        }
        // permission granted but notifications switched off (or asked twice): the only way is the app's notification settings
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx().getPackageName());
        openSettings(call, i);
    }

    @PermissionCallback
    private void notifCb(PluginCall call) {
        NotifyCore.ensureChannels(ctx());
        call.resolve(statusObj());
    }

    @PluginMethod
    public void openNotifSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx().getPackageName());
        openSettings(call, i);
    }

    @PluginMethod
    public void openExact(PluginCall call) {
        if (Build.VERSION.SDK_INT < 31) {
            call.resolve();
            return;
        }
        openSettings(call, new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + ctx().getPackageName())));
    }

    @PluginMethod
    public void openBattery(PluginCall call) {
        openSettings(call, new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
    }

    @PluginMethod
    public void setMode(PluginCall call) {
        String m = call.getString("mode", "clock");
        if (!("clock".equals(m) || "quiet".equals(m))) {
            call.reject("mode clock ya quiet hona chahiye.", "BAD");
            return;
        }
        NotifyCore.setMode(ctx(), m);
        NotifyCore.rearmAll(ctx()); // existing schedules switch to the new way now
        call.resolve(statusObj());
    }

    @PluginMethod
    public void setWake(PluginCall call) {
        NotifyCore.setWake(ctx(), call.getData().optBoolean("on", true));
        call.resolve(statusObj());
    }

    /** Put every alarm back (some phones drop them when the app is swiped away). Overdue ones (under 24 h) show once as late. */
    @PluginMethod
    public void rearm(PluginCall call) {
        NotifyCore.rearmAll(ctx());
        call.resolve(statusObj());
    }

    @PluginMethod
    public void show(PluginCall call) {
        String title = clip(call.getString("title"), 80);
        String text = clip(call.getString("text"), 300);
        if (title.isEmpty() && text.isEmpty()) {
            call.reject("title ya text chahiye.", "BAD");
            return;
        }
        if (title.isEmpty()) title = "Chaman";
        boolean ok = NotifyCore.show(ctx(), "now" + System.nanoTime(), title, text, call.getString("channel"), false);
        JSObject r = new JSObject();
        r.put("shown", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void add(PluginCall call) {
        try {
            String id = clip(call.getString("id"), 40).replaceAll("[^A-Za-z0-9_-]", "");
            String title = clip(call.getString("title"), 80);
            String text = clip(call.getString("text"), 300);
            String rep = call.getString("rep", "none");
            if (id.isEmpty()) {
                call.reject("id chahiye.", "BAD");
                return;
            }
            if (title.isEmpty() && text.isEmpty()) {
                call.reject("title ya text chahiye.", "BAD");
                return;
            }
            if (title.isEmpty()) title = "Chaman";
            if (!("none".equals(rep) || "daily".equals(rep) || "weekdays".equals(rep))) {
                call.reject("repeat none, daily ya weekdays hona chahiye.", "BAD");
                return;
            }
            long now = System.currentTimeMillis();
            long at;
            int h = 0, m = 0;
            if ("none".equals(rep)) {
                Long a = call.getData().has("at") ? Long.valueOf(call.getData().optLong("at")) : null;
                if (a == null) {
                    call.reject("at (time) chahiye.", "BAD");
                    return;
                }
                at = a;
                if (at <= now + 2000) {
                    call.reject("Ye time nikal chuka hai.", "PAST");
                    return;
                }
            } else {
                Integer hh = call.getData().has("h") ? Integer.valueOf(call.getData().optInt("h", -1)) : null;
                Integer mm = call.getData().has("m") ? Integer.valueOf(call.getData().optInt("m", -1)) : null;
                if (hh == null || mm == null || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
                    call.reject("Repeat ke liye h (0-23) aur m (0-59) chahiye.", "BAD");
                    return;
                }
                h = hh;
                m = mm;
                at = NotifyCore.nextFire(rep, h, m, now);
            }
            JSObject out = new JSObject();
            String via;
            synchronized (NotifyCore.LOCK) {
                JSONArray list = NotifyCore.load(ctx(), NotifyCore.K_LIST);
                int idx = NotifyCore.indexOf(list, id);
                if (idx < 0 && list.length() >= NotifyCore.MAX) {
                    call.reject("Maximum " + NotifyCore.MAX + " schedules ho chuke. Kuch cancel karo.", "LIMIT");
                    return;
                }
                JSONObject r = new JSONObject();
                r.put("id", id);
                r.put("title", title);
                r.put("text", text);
                r.put("ch", NotifyCore.safeChannel(call.getString("channel")));
                r.put("rep", rep);
                r.put("at", at);
                r.put("h", h);
                r.put("m", m);
                NotifyCore.ensureChannels(ctx());
                via = NotifyCore.arm(ctx(), r);
                if (idx >= 0) list.put(idx, r);
                else list.put(r);
                NotifyCore.save(ctx(), NotifyCore.K_LIST, list);
            }
            out.put("id", id);
            out.put("at", at);
            out.put("exact", !"inexact".equals(via));
            out.put("via", via);
            call.resolve(out);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()), "ERROR");
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        try {
            JSArray items = new JSArray();
            JSArray hist = new JSArray();
            synchronized (NotifyCore.LOCK) {
                JSONArray l = NotifyCore.load(ctx(), NotifyCore.K_LIST);
                for (int i = 0; i < l.length(); i++) items.put(l.get(i));
                JSONArray h = NotifyCore.load(ctx(), NotifyCore.K_HIST);
                for (int i = 0; i < h.length(); i++) hist.put(h.get(i));
            }
            JSObject r = new JSObject();
            r.put("items", items);
            r.put("hist", hist);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()), "ERROR");
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = clip(call.getString("id"), 40);
        boolean removed = false;
        synchronized (NotifyCore.LOCK) {
            JSONArray list = NotifyCore.load(ctx(), NotifyCore.K_LIST);
            int idx = NotifyCore.indexOf(list, id);
            if (idx >= 0) {
                NotifyCore.disarm(ctx(), id);
                NotifyCore.save(ctx(), NotifyCore.K_LIST, NotifyCore.without(list, idx));
                removed = true;
            }
        }
        JSObject r = new JSObject();
        r.put("removed", removed);
        call.resolve(r);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        int n = 0;
        synchronized (NotifyCore.LOCK) {
            JSONArray list = NotifyCore.load(ctx(), NotifyCore.K_LIST);
            for (int i = 0; i < list.length(); i++) {
                JSONObject o = list.optJSONObject(i);
                if (o != null) NotifyCore.disarm(ctx(), o.optString("id"));
                n++;
            }
            NotifyCore.save(ctx(), NotifyCore.K_LIST, new JSONArray());
        }
        JSObject r = new JSObject();
        r.put("cleared", n);
        call.resolve(r);
    }

    private static String clip(String s, int max) {
        if (s == null) return "";
        s = s.trim();
        return s.length() > max ? s.substring(0, max) : s;
    }
}
