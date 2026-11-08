package com.chaman.nap;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PersistableBundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;

/**
 * Step24 (3b-1): schedules whose text is written by an AI at the time (kind "ai", field "prompt").
 * Flow: PREP alarm (10 min before) -> JobScheduler job (needs internet) -> AiJobService -> run() -> AiClient -> the result is stored in the record ("res").
 * At the due time the normal alarm (NotifyCore.fire) shows the result; when it is not ready a fixed fallback text is shown, and a result that arrives later
 * is shown as a "(late)" notification (deliver). Every result also goes to the briefs list, which the app reads when it opens (takeBriefs) to put it in the chat.
 * Provider keys come from the app (setAi): a private copy in this app's SharedPreferences.
 */
final class NotifyAi {
    static final String ACT_PREP = "com.chaman.nap.SCHED_PREP";
    static final String K_AICFG = "aicfg";
    static final String K_BRIEFS = "briefs";
    static final long LEAD_MS = 10L * 60L * 1000L;
    static final long RETRY_WINDOW_MS = 20L * 60L * 1000L;
    static final long RUN_RECENT_MS = 3L * 60L * 1000L;
    static final int MAX_AI = 5;
    static final int PROMPT_MAX = 500;
    static final int MAX_BRIEFS = 10;
    static final int NOTE_MAX = 1500;
    static final String SYSTEM = "Tu Chaman hai, Najeef ka personal assistant. Najeef ko Hinglish me (Roman Hindi/Urdu aur English ka mix) chhota aur seedha jawab de. "
            + "Markdown heading, bullets aur emoji mat use kar, sirf plain text, 2 se 6 chhoti lines. Neeche aaj ki date aur time di hai. "
            + "Tujhe live internet ya aaj ki news nahi dikhti, isliye jo baat tujhe pata nahi (aaj ki khabar, mausam, score) uska andaza mat laga, saaf bol de.";

    private NotifyAi() {}

    static boolean isAi(JSONObject r) {
        return r != null && "ai".equals(r.optString("kind", ""));
    }

    static boolean hasRes(JSONObject r, long due) {
        JSONObject res = r.optJSONObject("res");
        return res != null && res.optLong("due") == due && !res.optString("text", "").isEmpty();
    }

    static int jobId(String id) {
        return 0x41490000 | (id.hashCode() & 0xFFFF);
    }

    static int countAi(JSONArray list) {
        int n = 0;
        for (int i = 0; i < list.length(); i++) if (isAi(list.optJSONObject(i))) n++;
        return n;
    }

    // ---------- decisions kept as plain functions (tested on a normal JVM, see tests/java) ----------
    /** -1 = nothing to do (the AI text is already there), 0 = prepare right now, otherwise the time at which the prep alarm must ring. */
    static long prepTime(JSONObject r, long now) {
        long due = r.optLong("at");
        if (hasRes(r, due)) return -1;
        long p = due - LEAD_MS;
        return p <= now + 2000 ? 0 : p;
    }

    /** False when a job for this due time was started less than 3 minutes ago (re-arming must not restart a running job). */
    static boolean mayStartJob(JSONObject r, long now) {
        return !(r.optLong("jobDue") == r.optLong("at") && now - r.optLong("jobAt") < RUN_RECENT_MS);
    }

    /** Index of the record when it still waits for this due time (so a result can be stored in it), else -1 (fired already, advanced or removed). */
    static int openIndex(JSONArray list, String id, long due) {
        int idx = NotifyCore.indexOf(list, id);
        if (idx < 0) return -1;
        JSONObject r = list.optJSONObject(idx);
        return r != null && r.optLong("at") == due ? idx : -1;
    }

    /** {title, text, info} for the notification at the due time: the AI text when it is there, else a fixed fallback that says why. */
    static String[] text(JSONObject r) {
        String title = r.optString("title", "Chaman");
        long due = r.optLong("at");
        if (hasRes(r, due)) {
            JSONObject res = r.optJSONObject("res");
            return new String[]{title, clip(res.optString("text", ""), NOTE_MAX), "ok:" + res.optString("by", "")};
        }
        String why = r.optString("rerr", "");
        return new String[]{title, "AI message nahi ban paya" + (why.isEmpty() ? " (net ya phone busy tha)" : " (" + why + ")") + ". Net aur AI key check karo.",
                "fail:" + (why.isEmpty() ? "nahi bana" : why)};
    }

    // ---------- provider config (a private copy of what the app uses) ----------
    static JSONArray aiCfg(Context c) {
        try {
            return new JSONArray(c.getSharedPreferences(NotifyCore.PREFS, Context.MODE_PRIVATE).getString(K_AICFG, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** Keeps only what AiClient needs and limits sizes. Returns how many providers were kept. */
    static int setAiCfg(Context c, JSONArray in) {
        JSONArray out = new JSONArray();
        try {
            for (int i = 0; in != null && i < in.length() && out.length() < 8; i++) {
                JSONObject p = in.optJSONObject(i);
                if (p == null) continue;
                String url = p.optString("url", "");
                JSONArray keys = p.optJSONArray("keys");
                if (!url.startsWith("https://") || keys == null) continue;
                JSONArray k2 = new JSONArray();
                for (int j = 0; j < keys.length() && k2.length() < 6; j++) {
                    String k = keys.optString(j, "").trim();
                    if (k.length() >= 8 && k.length() <= 300) k2.put(k);
                }
                if (k2.length() == 0) continue;
                JSONObject o = new JSONObject();
                o.put("id", clip(p.optString("id", ""), 20));
                o.put("name", clip(p.optString("name", p.optString("id", "AI")), 30));
                o.put("url", clip(url, 300));
                o.put("model", clip(p.optString("model", ""), 100));
                o.put("keys", k2);
                o.put("ptr", Math.max(0, p.optInt("ptr", 0)));
                o.put("read", Math.max(5, Math.min(120, p.optInt("read", 40))));
                out.put(o);
            }
            c.getSharedPreferences(NotifyCore.PREFS, Context.MODE_PRIVATE).edit().putString(K_AICFG, out.toString()).apply();
        } catch (Exception ignored) {
        }
        return out.length();
    }

    static int keyCount(JSONArray cfg) {
        int n = 0;
        for (int i = 0; i < cfg.length(); i++) {
            JSONObject p = cfg.optJSONObject(i);
            if (p != null && p.optJSONArray("keys") != null) n += p.optJSONArray("keys").length();
        }
        return n;
    }

    // ---------- prep alarm + job ----------
    static Intent prepIntent(Context c, String id) {
        Intent i = new Intent(ACT_PREP);
        i.setClass(c, NotifyReceiver.class);
        i.setData(Uri.parse("chaman://prep/" + id));
        i.putExtra("id", id);
        return i;
    }

    static PendingIntent prepPi(Context c, String id) {
        return PendingIntent.getBroadcast(c, ("p" + id).hashCode(), prepIntent(c, id), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Called by NotifyCore.arm for an AI record. Prepares at (due - 10 min), or right now when that time has already passed. */
    static void armPrep(Context c, JSONObject r) {
        String id = r.optString("id");
        long p = prepTime(r, System.currentTimeMillis());
        if (p < 0) return;
        if (p == 0) {
            startJob(c, r);
            return;
        }
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = prepPi(c, id);
        if (NotifyCore.canExact(c)) {
            try {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, p, pi);
                return;
            } catch (SecurityException ignored) {
            }
        }
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, p, pi);
    }

    static void disarmPrep(Context c, String id) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            PendingIntent pi = prepPi(c, id);
            if (am != null) am.cancel(pi);
            pi.cancel();
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js != null) js.cancel(jobId(id));
        } catch (Exception ignored) {
        }
    }

    /** Schedules the job (it waits for internet). Does nothing when one was started less than 3 minutes ago for the same time (re-arming must not restart it). */
    static void startJob(Context c, JSONObject r) {
        String id = r.optString("id");
        long due = r.optLong("at"), now = System.currentTimeMillis();
        if (!mayStartJob(r, now)) return;
        try {
            r.put("jobDue", due);
            r.put("jobAt", now);
        } catch (Exception ignored) {
        }
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        boolean ok = false;
        if (js != null) {
            PersistableBundle b = new PersistableBundle();
            b.putString("id", id);
            b.putLong("due", due);
            b.putString("title", r.optString("title", "Chaman"));
            b.putString("prompt", r.optString("prompt", ""));
            JobInfo.Builder jb = new JobInfo.Builder(jobId(id), new ComponentName(c, AiJobService.class))
                    .setExtras(b)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setBackoffCriteria(60000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL);
            if (Build.VERSION.SDK_INT >= 31) jb.setExpedited(true);
            else jb.setOverrideDeadline(120000L);
            try {
                ok = js.schedule(jb.build()) == JobScheduler.RESULT_SUCCESS;
            } catch (Exception ignored) {
            }
        }
        if (!ok) { // the system refused the job: do the work on a thread, once
            final Context app = c.getApplicationContext();
            final String fid = id, ftitle = r.optString("title", "Chaman"), fprompt = r.optString("prompt", "");
            final long fdue = due;
            new Thread(new Runnable() {
                @Override
                public void run() {
                    NotifyAi.run(app, fid, fdue, ftitle, fprompt);
                }
            }).start();
        }
    }

    /** The prep alarm came. */
    static void prep(Context c, String id) {
        synchronized (NotifyCore.LOCK) {
            try {
                JSONArray list = NotifyCore.load(c, NotifyCore.K_LIST);
                int idx = NotifyCore.indexOf(list, id);
                if (idx < 0) return;
                JSONObject r = list.getJSONObject(idx);
                if (!isAi(r)) return;
                startJob(c, r);
                list.put(idx, r);
                NotifyCore.save(c, NotifyCore.K_LIST, list);
            } catch (Exception ignored) {
            }
        }
    }

    // ---------- the work (runs on a thread of AiJobService) ----------
    static String dayText(long due) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(due);
        String[] days = {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"};
        String[] mons = {"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"};
        return String.format(Locale.US, "%s, %d %s %d, %02d:%02d", days[cal.get(Calendar.DAY_OF_WEEK) - 1], cal.get(Calendar.DAY_OF_MONTH), mons[cal.get(Calendar.MONTH)], cal.get(Calendar.YEAR), cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE));
    }

    /** Returns 0 = finished (do not retry), 1 = try again later (no internet, timeout, rate limit). */
    static int run(Context c, String id, long due, String title, String prompt) {
        long now = System.currentTimeMillis();
        if (now > due + RETRY_WINDOW_MS || prompt == null || prompt.trim().isEmpty()) return 0;
        synchronized (NotifyCore.LOCK) {
            JSONArray list = NotifyCore.load(c, NotifyCore.K_LIST);
            int idx = openIndex(list, id, due);
            if (idx >= 0 && hasRes(list.optJSONObject(idx), due)) return 0; // already prepared
        }
        AiClient.Result res = AiClient.complete(aiCfg(c), SYSTEM, "Date aur time: " + dayText(due) + ".\nKaam: " + prompt, 500, System.currentTimeMillis() + 150000L);
        if (!res.text.isEmpty()) {
            deliver(c, id, due, title, res.text, res.by);
            return 0;
        }
        synchronized (NotifyCore.LOCK) {
            try {
                JSONArray list = NotifyCore.load(c, NotifyCore.K_LIST);
                int idx = openIndex(list, id, due);
                if (idx >= 0) {
                    JSONObject r = list.getJSONObject(idx);
                    r.put("rerr", clip(res.error, 80));
                    list.put(idx, r);
                    NotifyCore.save(c, NotifyCore.K_LIST, list);
                }
            } catch (Exception ignored) {
            }
        }
        return res.retry ? 1 : 0;
    }

    /** A result is ready. Before the due time it is stored in the record; after it (fallback already shown) it is shown now as late. */
    static void deliver(Context c, String id, long due, String title, String text, String by) {
        synchronized (NotifyCore.LOCK) {
            try {
                JSONArray list = NotifyCore.load(c, NotifyCore.K_LIST);
                int idx = openIndex(list, id, due);
                if (idx >= 0) {
                    JSONObject r = list.getJSONObject(idx);
                    JSONObject res = new JSONObject();
                    res.put("due", due);
                    res.put("text", text);
                    res.put("by", by);
                    r.put("res", res);
                    r.remove("rerr");
                    list.put(idx, r);
                    NotifyCore.save(c, NotifyCore.K_LIST, list);
                    return;
                }
                NotifyCore.show(c, id + "late", title + " (late)", clip(text, NOTE_MAX), NotifyCore.CH_REPORT, false);
                addBrief(c, id, title, text, due, true, by);
            } catch (Exception ignored) {
            }
        }
    }

    // ---------- what the notification says at the due time ----------
    /** Called by NotifyCore under the lock. Returns {title, text, info}. Also files a brief when the AI text is used. */
    static String[] render(Context c, JSONObject r) {
        String[] t = text(r);
        if (t[2].startsWith("ok:")) {
            JSONObject res = r.optJSONObject("res");
            addBrief(c, r.optString("id"), t[0], res.optString("text", ""), r.optLong("at"), false, res.optString("by", ""));
        }
        return t;
    }

    // ---------- briefs: texts the app puts into the chat when it opens ----------
    static void addBrief(Context c, String id, String title, String text, long due, boolean late, String by) {
        try {
            JSONArray b = NotifyCore.load(c, K_BRIEFS);
            JSONObject e = new JSONObject();
            e.put("id", id);
            e.put("title", title);
            e.put("text", clip(text, 4000));
            e.put("due", due);
            e.put("late", late);
            e.put("by", by == null ? "" : by);
            b.put(e);
            while (b.length() > MAX_BRIEFS) b = NotifyCore.without(b, 0);
            NotifyCore.save(c, K_BRIEFS, b);
        } catch (Exception ignored) {
        }
    }

    static JSONArray takeBriefs(Context c) {
        synchronized (NotifyCore.LOCK) {
            JSONArray b = NotifyCore.load(c, K_BRIEFS);
            if (b.length() > 0) NotifyCore.save(c, K_BRIEFS, new JSONArray());
            return b;
        }
    }

    static String clip(String s, int max) {
        if (s == null) return "";
        s = s.trim();
        return s.length() > max ? s.substring(0, max) : s;
    }
}
