package com.chaman.nap;

// Step24: tests the plain decision functions of NotifyAi (native/NotifyAi.java) on a normal JVM.
// Run: javac -cp <org.json classes>:<android.jar> -d out native/*Notify*.java native/AiClient.java native/AiJobService.java <capacitor stubs> tests/java/com/chaman/nap/NotifyAiTest.java
//      java -cp out:<org.json classes>:<android.jar> com.chaman.nap.NotifyAiTest     (org.json classes BEFORE android.jar: the jar only has stubs)
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.TimeZone;

public class NotifyAiTest {
    static int fails = 0, passes = 0;

    static void ok(boolean c, String m) {
        if (c) { passes++; System.out.println("PASS " + m); } else { fails++; System.out.println("FAIL " + m); }
    }

    static JSONObject rec(String id, long at) throws Exception {
        return new JSONObject().put("id", id).put("title", "Chaman").put("kind", "ai").put("prompt", "good morning").put("at", at).put("rep", "daily");
    }

    static JSONObject withRes(JSONObject r, long due, String text, String by) throws Exception {
        return r.put("res", new JSONObject().put("due", due).put("text", text).put("by", by));
    }

    public static void main(String[] a) throws Exception {
        long now = 1_800_000_000_000L, min = 60_000L;
        // ---- prepTime
        ok(NotifyAi.prepTime(rec("a", now + 3 * 3600_000L), now) == now + 3 * 3600_000L - 10 * min, "prep: due in 3 h -> prep alarm at due - 10 min");
        ok(NotifyAi.prepTime(rec("a", now + 5 * min), now) == 0, "prep: due in 5 min -> prepare right now");
        ok(NotifyAi.prepTime(rec("a", now + 10 * min + 1500), now) == 0, "prep: due - 10 min is within 2 s from now -> right now");
        ok(NotifyAi.prepTime(rec("a", now + 10 * min + 5000), now) == now + 5000, "prep: 5 s before the lead time -> alarm in 5 s");
        ok(NotifyAi.prepTime(withRes(rec("a", now + 3 * 3600_000L), now + 3 * 3600_000L, "text", "G"), now) == -1, "prep: AI text already there -> nothing to do");
        ok(NotifyAi.prepTime(withRes(rec("a", now + 3 * 3600_000L), now + 1, "text", "G"), now) > 0, "prep: a text for another due time does not count");
        ok(NotifyAi.prepTime(withRes(rec("a", now + 3 * 3600_000L), now + 3 * 3600_000L, "", "G"), now) > 0, "prep: an empty text does not count");
        // ---- mayStartJob
        JSONObject j = rec("a", now + 5 * min);
        ok(NotifyAi.mayStartJob(j, now), "job: never started -> may start");
        j.put("jobDue", now + 5 * min).put("jobAt", now - 1 * min);
        ok(!NotifyAi.mayStartJob(j, now), "job: started 1 min ago for this due time -> do not restart");
        j.put("jobAt", now - 4 * min);
        ok(NotifyAi.mayStartJob(j, now), "job: started 4 min ago -> may start again");
        j.put("jobAt", now - 1 * min).put("jobDue", now + 99);
        ok(NotifyAi.mayStartJob(j, now), "job: recent job was for another due time -> may start");
        // ---- openIndex
        long due = now + 5 * min;
        JSONArray list = new JSONArray().put(rec("x", due + 1)).put(rec("y", due)).put(new JSONObject().put("id", "z").put("at", due));
        ok(NotifyAi.openIndex(list, "y", due) == 1, "open: record waiting for this due time -> its index");
        ok(NotifyAi.openIndex(list, "x", due) == -1, "open: record already moved to the next time -> -1 (result is late)");
        ok(NotifyAi.openIndex(list, "nope", due) == -1, "open: record gone (one-time schedule already fired) -> -1");
        ok(NotifyAi.openIndex(new JSONArray(), "y", due) == -1, "open: empty list -> -1");
        // ---- text()
        String[] t = NotifyAi.text(withRes(rec("a", due), due, "Good morning Najeef!", "GROQ"));
        ok(t[0].equals("Chaman") && t[1].equals("Good morning Najeef!") && t[2].equals("ok:GROQ"), "text: AI text, title, info ok:<provider>");
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 3000; i++) big.append('x');
        ok(NotifyAi.text(withRes(rec("a", due), due, big.toString(), "G"))[1].length() == 1500, "text: notification text is cut at 1500 chars");
        t = NotifyAi.text(rec("a", due).put("rerr", "HTTP 401"));
        ok(t[1].contains("(HTTP 401)") && t[1].contains("key check") && t[2].equals("fail:HTTP 401"), "text: fallback says why (HTTP 401)");
        t = NotifyAi.text(rec("a", due));
        ok(t[1].contains("net ya phone busy") && t[2].equals("fail:nahi bana"), "text: fallback without a reason");
        t = NotifyAi.text(withRes(rec("a", due), due - 1, "old text", "G"));
        ok(t[2].startsWith("fail:") && !t[1].contains("old text"), "text: a result of an earlier cycle is never shown");
        ok(NotifyAi.text(new JSONObject().put("at", due))[0].equals("Chaman"), "text: title defaults to Chaman");
        // ---- helpers
        ok(NotifyAi.isAi(rec("a", due)) && !NotifyAi.isAi(new JSONObject().put("id", "q")) && !NotifyAi.isAi(null), "isAi");
        ok(NotifyAi.countAi(new JSONArray().put(rec("a", due)).put(new JSONObject().put("id", "q")).put(rec("b", due))) == 2, "countAi counts AI records only");
        ok(NotifyAi.jobId("abc") == NotifyAi.jobId("abc") && NotifyAi.jobId("abc") > 0 && (NotifyAi.jobId("abc") & 0xFFFF0000) == 0x41490000 && NotifyAi.jobId("abc") != NotifyAi.jobId("abd"), "jobId: stable, positive, own range, differs per schedule");
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        long mon = java.time.ZonedDateTime.of(2026, 11, 9, 7, 5, 0, 0, java.time.ZoneId.of("UTC")).toInstant().toEpochMilli();
        ok(NotifyAi.dayText(mon).equals("Monday, 9 November 2026, 07:05"), "dayText: " + NotifyAi.dayText(mon));
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        ok(NotifyAi.dayText(mon).equals("Monday, 9 November 2026, 12:35"), "dayText uses the phone's time zone: " + NotifyAi.dayText(mon));
        ok(NotifyAi.clip("  abc  ", 10).equals("abc") && NotifyAi.clip("abcdef", 3).equals("abc") && NotifyAi.clip(null, 3).equals(""), "clip");
        // ---- cycle story: result stored before the time, then the next cycle starts clean
        long d1 = now + 3 * 3600_000L;
        JSONObject cyc = rec("s", d1);
        JSONArray l2 = new JSONArray().put(cyc);
        ok(NotifyAi.openIndex(l2, "s", d1) == 0, "story: before the time the record is open for its result");
        withRes(cyc, d1, "Subah ka text", "GROQ");
        ok(NotifyAi.text(cyc)[2].equals("ok:GROQ"), "story: at the time the stored text is used");
        cyc.put("at", d1 + 86_400_000L).remove("res");
        ok(NotifyAi.prepTime(cyc, d1 + 1000) > 0 && NotifyAi.text(cyc)[2].startsWith("fail:") && NotifyAi.openIndex(l2, "s", d1) == -1, "story: next day the old result is gone, a late result for the old time is 'late'");
        System.out.println(fails == 0 ? "\nALL PASS (" + passes + ")" : "\n" + fails + " FAIL");
        System.exit(fails == 0 ? 0 : 1);
    }
}
