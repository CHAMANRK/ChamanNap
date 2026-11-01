package com.chaman.nap;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Step22: Chaman's own notifications + scheduler. No Termux, no WebView: the alarm fires into NotifyReceiver (Java),
 * so it works with the screen off and with the app closed. Everything is kept in SharedPreferences "chaman_sched".
 * Record: {id, title, text, ch, rep: none|daily|weekdays, at: next fire (epoch ms), h, m}
 */
final class NotifyCore {
    static final String PREFS = "chaman_sched";
    static final String K_LIST = "list";
    static final String K_HIST = "hist";
    static final String ACT_FIRE = "com.chaman.nap.SCHED_FIRE";
    static final String CH_REMIND = "chaman_remind";
    static final String CH_REPORT = "chaman_report";
    static final String CH_TASK = "chaman_task";
    static final int MAX = 50;
    static final int MAX_HIST = 20;
    static final long LATE_WINDOW_MS = 24L * 3600L * 1000L;
    static final Object LOCK = new Object();

    private NotifyCore() {}

    // ---------- storage ----------
    static JSONArray load(Context c, String key) {
        try {
            String s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key, "[]");
            return new JSONArray(s);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void save(Context c, String key, JSONArray a) {
        SharedPreferences.Editor ed = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        ed.putString(key, a.toString());
        ed.apply();
    }

    static int indexOf(JSONArray a, String id) {
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) return i;
        }
        return -1;
    }

    static JSONArray without(JSONArray a, int idx) {
        JSONArray out = new JSONArray();
        for (int i = 0; i < a.length(); i++) {
            if (i != idx) out.put(a.opt(i));
        }
        return out;
    }

    static void addHist(Context c, JSONObject r, long now, boolean late) {
        try {
            JSONArray h = load(c, K_HIST);
            JSONObject e = new JSONObject();
            e.put("id", r.optString("id"));
            e.put("title", r.optString("title"));
            e.put("fired", now);
            e.put("late", late);
            h.put(e);
            while (h.length() > MAX_HIST) h = without(h, 0);
            save(c, K_HIST, h);
        } catch (Exception ignored) {
        }
    }

    // ---------- time ----------
    /** Next time strictly after "after" at h:m local time (weekdays skips Saturday and Sunday). */
    static long nextFire(String rep, int h, int m, long after) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(after);
        cal.set(Calendar.HOUR_OF_DAY, h);
        cal.set(Calendar.MINUTE, m);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        if (cal.getTimeInMillis() <= after) cal.add(Calendar.DAY_OF_YEAR, 1);
        if ("weekdays".equals(rep)) {
            int guard = 0;
            while (guard++ < 8) {
                int d = cal.get(Calendar.DAY_OF_WEEK);
                if (d != Calendar.SATURDAY && d != Calendar.SUNDAY) break;
                cal.add(Calendar.DAY_OF_YEAR, 1);
            }
        }
        return cal.getTimeInMillis();
    }

    // ---------- alarms ----------
    static Intent fireIntent(Context c, String id) {
        Intent i = new Intent(ACT_FIRE);
        i.setClass(c, NotifyReceiver.class);
        i.setData(Uri.parse("chaman://sched/" + id));
        i.putExtra("id", id);
        return i;
    }

    static PendingIntent firePi(Context c, String id) {
        return PendingIntent.getBroadcast(c, id.hashCode(), fireIntent(c, id), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean canExact(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    /** Sets the alarm for record r. Returns true when it is an exact alarm, false when Android only allowed an inexact one. */
    static boolean arm(Context c, JSONObject r) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return false;
        String id = r.optString("id");
        long at = r.optLong("at");
        PendingIntent pi = firePi(c, id);
        if (canExact(c)) {
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                return true;
            } catch (SecurityException ignored) {
                // permission was taken away between the check and the call: fall through to inexact
            }
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        return false;
    }

    static void disarm(Context c, String id) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = firePi(c, id);
        if (am != null) am.cancel(pi);
        pi.cancel();
    }

    // ---------- notification ----------
    static String safeChannel(String ch) {
        if (CH_REPORT.equals(ch) || CH_TASK.equals(ch)) return ch;
        return CH_REMIND;
    }

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        nm.createNotificationChannel(channel(CH_REMIND, "Reminders", "Chaman ke reminders", NotificationManager.IMPORTANCE_HIGH));
        nm.createNotificationChannel(channel(CH_REPORT, "Reports", "Daily message aur reports", NotificationManager.IMPORTANCE_DEFAULT));
        nm.createNotificationChannel(channel(CH_TASK, "Task result", "Kaam khatam hone ki notification", NotificationManager.IMPORTANCE_DEFAULT));
    }

    private static NotificationChannel channel(String id, String name, String desc, int importance) {
        NotificationChannel ch = new NotificationChannel(id, name, importance);
        ch.setDescription(desc);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        return ch;
    }

    private static int smallIcon(Context c) {
        int r = c.getResources().getIdentifier("ic_stat_chaman", "drawable", c.getPackageName());
        return r != 0 ? r : c.getApplicationInfo().icon;
    }

    /** Shows one notification. Content is hidden on a secure lock screen (public version says only "Chaman"). */
    static boolean show(Context c, String id, String title, String text, String channel) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || !nm.areNotificationsEnabled()) return false;
        ensureChannels(c);
        String ch = safeChannel(channel);
        int icon = smallIcon(c);

        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        PendingIntent tap = null;
        if (open != null) {
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            tap = PendingIntent.getActivity(c, id.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        }

        Notification pub = new Notification.Builder(c, ch)
                .setSmallIcon(icon)
                .setContentTitle("Chaman")
                .setContentText("Notification")
                .build();

        Notification.Builder b = new Notification.Builder(c, ch)
                .setSmallIcon(icon)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setShowWhen(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .setPublicVersion(pub);
        if (CH_REMIND.equals(ch)) b.setCategory(Notification.CATEGORY_REMINDER);
        if (tap != null) b.setContentIntent(tap);
        nm.notify(id.hashCode(), b.build());
        return true;
    }

    // ---------- fire / restore ----------
    /** Called by the alarm. Shows the notification, then re-arms (repeat) or drops (one time) the record. */
    static void fire(Context c, String id) {
        synchronized (LOCK) {
            try {
                JSONArray list = load(c, K_LIST);
                int idx = indexOf(list, id);
                if (idx < 0) return;
                JSONObject r = list.getJSONObject(idx);
                long now = System.currentTimeMillis();
                show(c, id, r.optString("title", "Chaman"), r.optString("text", ""), r.optString("ch", CH_REMIND));
                addHist(c, r, now, false);
                String rep = r.optString("rep", "none");
                if ("none".equals(rep)) {
                    list = without(list, idx);
                } else {
                    long base = Math.max(now, r.optLong("at"));
                    r.put("at", nextFire(rep, r.optInt("h"), r.optInt("m"), base));
                    arm(c, r);
                    list.put(idx, r);
                }
                save(c, K_LIST, list);
            } catch (Exception ignored) {
            }
        }
    }

    /**
     * After reboot / app update / clock change: alarms are gone, so set them again.
     * Something that was due while the phone was off and is less than 24 h old is shown once now, marked late.
     */
    static void rearmAll(Context c) {
        synchronized (LOCK) {
            try {
                ensureChannels(c);
                JSONArray list = load(c, K_LIST);
                JSONArray keep = new JSONArray();
                long now = System.currentTimeMillis();
                for (int i = 0; i < list.length(); i++) {
                    JSONObject r = list.optJSONObject(i);
                    if (r == null) continue;
                    String rep = r.optString("rep", "none");
                    long at = r.optLong("at");
                    if (at <= now) {
                        if (now - at < LATE_WINDOW_MS) {
                            show(c, r.optString("id"), r.optString("title", "Chaman") + " (late)", r.optString("text", ""), r.optString("ch", CH_REMIND));
                            addHist(c, r, now, true);
                        }
                        if ("none".equals(rep)) continue;
                        r.put("at", nextFire(rep, r.optInt("h"), r.optInt("m"), now));
                    }
                    arm(c, r);
                    keep.put(r);
                }
                save(c, K_LIST, keep);
            } catch (Exception ignored) {
            }
        }
    }
}
