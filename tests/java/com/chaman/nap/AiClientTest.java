package com.chaman.nap;

// Step24: tests AiClient (native/AiClient.java) against a local HTTP server on a normal JVM. Not part of the app.
// Run (needs org.json, e.g. compiled from github.com/stleary/JSON-java):
//   javac -cp <org.json classes> -d out native/AiClient.java tests/java/com/chaman/nap/AiClientTest.java && java -cp out:<org.json classes> com.chaman.nap.AiClientTest
import com.sun.net.httpserver.HttpServer;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

public class AiClientTest {
    static int fails = 0, passes = 0;
    static HttpServer srv;
    static String base;
    static final List<String> authSeen = new ArrayList<>();
    static final List<String> bodySeen = new ArrayList<>();
    static final List<String> uaSeen = new ArrayList<>();

    static void ok(boolean c, String m) {
        if (c) { passes++; System.out.println("PASS " + m); } else { fails++; System.out.println("FAIL " + m); }
    }

    interface H { int[] handle(String key, String body); } // returns {status, delayMs}; body text via lastBody

    static String lastBody = "";

    static void route(String path, final H h) {
        srv.createContext(path, ex -> {
            String auth = ex.getRequestHeaders().getFirst("Authorization");
            authSeen.add(auth);
            uaSeen.add(ex.getRequestHeaders().getFirst("User-Agent"));
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            bodySeen.add(body);
            String key = auth == null ? "" : auth.replace("Bearer ", "");
            int[] r = h.handle(key, body);
            if (r[1] > 0) { try { Thread.sleep(r[1]); } catch (InterruptedException e) { } }
            byte[] out = lastBody.getBytes(StandardCharsets.UTF_8);
            try {
                ex.sendResponseHeaders(r[0], out.length == 0 ? -1 : out.length);
                if (out.length > 0) try (OutputStream o = ex.getResponseBody()) { o.write(out); }
            } catch (Exception e) { }
            ex.close();
        });
    }

    static String okBody(String text) { return new JSONObject().put("choices", new JSONArray().put(new JSONObject().put("message", new JSONObject().put("role", "assistant").put("content", text)))).toString(); }

    static JSONObject prov(String id, String path, String model, String... keys) {
        JSONArray k = new JSONArray();
        for (String s : keys) k.put(s);
        return new JSONObject().put("id", id).put("name", id.toUpperCase()).put("url", base + path).put("model", model).put("keys", k).put("ptr", 0).put("read", 5);
    }

    static AiClient.Result run(JSONArray provs) { return AiClient.complete(provs, "SYS", "USER", 300, System.currentTimeMillis() + 60000); }

    public static void main(String[] a) throws Exception {
        AiClient.allowHttp = true;
        srv = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        base = "http://127.0.0.1:" + srv.getAddress().getPort();
        final AtomicInteger hits = new AtomicInteger();
        route("/good", (k, b) -> { lastBody = okBody("  Good morning Najeef!  "); return new int[]{200, 0}; });
        route("/think", (k, b) -> { lastBody = okBody("<think>soch raha hu\nlines</think>\nAsli jawab"); return new int[]{200, 0}; });
        route("/k2", (k, b) -> { if (k.equals("bad1")) { lastBody = ""; return new int[]{401, 0}; } lastBody = okBody("key2 ne diya"); return new int[]{200, 0}; });
        route("/all429", (k, b) -> { lastBody = ""; return new int[]{429, 0}; });
        route("/all401", (k, b) -> { lastBody = ""; return new int[]{401, 0}; });
        route("/bad400", (k, b) -> { hits.incrementAndGet(); lastBody = ""; return new int[]{400, 0}; });
        route("/err500", (k, b) -> { lastBody = ""; return new int[]{500, 0}; });
        route("/empty", (k, b) -> { lastBody = okBody("   "); return new int[]{200, 0}; });
        route("/junk", (k, b) -> { lastBody = "not json at all"; return new int[]{200, 0}; });
        route("/nochoice", (k, b) -> { lastBody = "{\"choices\":[]}"; return new int[]{200, 0}; });
        route("/slow", (k, b) -> { lastBody = okBody("late"); return new int[]{200, 7000}; });
        route("/long", (k, b) -> { StringBuilder s = new StringBuilder(); for (int i = 0; i < 6000; i++) s.append('x'); lastBody = okBody(s.toString()); return new int[]{200, 0}; });
        srv.start();

        // 1 success + request shape
        authSeen.clear(); bodySeen.clear(); uaSeen.clear();
        AiClient.Result r = run(new JSONArray().put(prov("groq", "/good", "m-1", "k-secret-1")));
        ok(r.text.equals("Good morning Najeef!") && r.by.equals("GROQ") && r.error.isEmpty(), "success: text trimmed, provider name returned");
        JSONObject req = new JSONObject(bodySeen.get(0));
        ok(req.getString("model").equals("m-1") && req.getInt("max_tokens") == 300 && req.getJSONArray("messages").length() == 2
                && req.getJSONArray("messages").getJSONObject(0).getString("role").equals("system")
                && req.getJSONArray("messages").getJSONObject(0).getString("content").equals("SYS")
                && req.getJSONArray("messages").getJSONObject(1).getString("content").equals("USER"), "request: model, max_tokens, system + user messages");
        ok(authSeen.get(0).equals("Bearer k-secret-1") && uaSeen.get(0).equals("Chaman/1.0"), "request: Bearer key and User-Agent");

        // 2 think blocks
        r = run(new JSONArray().put(prov("a", "/think", "m", "k")));
        ok(r.text.equals("Asli jawab"), "reasoning <think> block is removed");
        // 3 key rotation / 401 -> next key
        r = run(new JSONArray().put(prov("a", "/k2", "m", "bad1", "good2")));
        ok(r.text.equals("key2 ne diya"), "401 on the first key -> second key is used");
        JSONObject p = prov("a", "/k2", "m", "good2", "bad1").put("ptr", 1);
        authSeen.clear(); r = run(new JSONArray().put(p));
        ok(authSeen.get(0).equals("Bearer bad1") && r.text.equals("key2 ne diya") && authSeen.size() == 2, "ptr is the first key tried, then the others (round robin)");
        // 4 all 429 -> retry
        r = run(new JSONArray().put(prov("a", "/all429", "m", "k1", "k2")));
        ok(r.text.isEmpty() && r.error.contains("HTTP 429") && r.retry, "every key rate limited -> error, retry = true");
        // 5 all 401 -> no retry
        r = run(new JSONArray().put(prov("a", "/all401", "m", "k1", "k2")));
        ok(r.text.isEmpty() && r.error.contains("HTTP 401") && !r.retry, "every key unauthorized -> retry = false (a retry cannot help)");
        // 6 400 -> next provider, breaks out of the keys loop
        hits.set(0);
        r = run(new JSONArray().put(prov("a", "/bad400", "m", "k1", "k2", "k3")).put(prov("b", "/good", "m", "k")));
        ok(r.text.equals("Good morning Najeef!") && r.by.equals("B") && hits.get() == 1, "HTTP 400 (bad model/request): other keys skipped, next provider answers");
        // 7 5xx then next provider
        r = run(new JSONArray().put(prov("a", "/err500", "m", "k1")).put(prov("b", "/good", "m", "k")));
        ok(r.by.equals("B"), "provider with 500 -> next provider");
        r = run(new JSONArray().put(prov("a", "/err500", "m", "k1")));
        ok(r.retry && r.error.contains("500"), "500 only -> retry = true");
        // 8 empty / junk / no choices
        r = run(new JSONArray().put(prov("a", "/empty", "m", "k1")));
        ok(r.text.isEmpty() && r.error.contains("khaali") && r.retry, "empty content -> error, retry");
        ok(AiClient.parse("not json").isEmpty() && AiClient.parse("{\"choices\":[]}").isEmpty() && AiClient.parse("{\"choices\":[{\"message\":{\"content\":null}}]}").isEmpty() && AiClient.parse("{\"choices\":[{\"message\":{\"content\":[1]}}]}").isEmpty(), "parse: junk, no choices, null or non-string content -> empty");
        r = run(new JSONArray().put(prov("a", "/junk", "m", "k1")));
        ok(r.text.isEmpty() && r.retry, "junk reply -> treated as empty");
        r = run(new JSONArray().put(prov("a", "/long", "m", "k1")));
        ok(r.text.length() == 4000, "reply is cut at 4000 chars");
        // 9 providers without https / keys
        AiClient.allowHttp = false;
        r = run(new JSONArray().put(prov("a", "/good", "m", "k1")));
        ok(r.text.isEmpty() && r.error.contains("keys nahi"), "plain http providers are ignored (https only)");
        AiClient.allowHttp = true;
        r = run(new JSONArray().put(new JSONObject().put("id", "x").put("url", base + "/good").put("model", "m").put("keys", new JSONArray())));
        ok(r.error.contains("keys nahi") && !r.retry, "a provider without keys is skipped");
        ok(run(new JSONArray()).error.contains("keys nahi") && AiClient.complete(null, "s", "u", 10, System.currentTimeMillis() + 1000).error.contains("keys nahi"), "no providers -> clear message");
        // 10 timeout
        long t0 = System.currentTimeMillis();
        r = run(new JSONArray().put(prov("a", "/slow", "m", "k1")));
        ok(r.text.isEmpty() && r.error.contains("timeout") && r.retry && System.currentTimeMillis() - t0 < 9000, "slow server -> timeout after the read limit, retry = true");
        // 11 deadline already passed
        r = AiClient.complete(new JSONArray().put(prov("a", "/good", "m", "k1")), "s", "u", 10, System.currentTimeMillis() - 1);
        ok(r.text.isEmpty() && r.retry && r.error.contains("time khatam"), "deadline over -> stops before calling, retry = true");
        // 12 no internet (host does not resolve)
        JSONObject nh = new JSONObject().put("id", "n").put("name", "N").put("url", "http://no-such-host.invalid/v1").put("model", "m").put("keys", new JSONArray().put("k")).put("read", 5);
        t0 = System.currentTimeMillis();
        r = run(new JSONArray().put(nh));
        ok(r.text.isEmpty() && r.error.equals("net nahi") && r.retry && System.currentTimeMillis() - t0 < 8000, "host not found -> \"net nahi\", retry = true, no waiting through other keys");
        // 13 keys never in errors
        boolean leak = false;
        for (String path : new String[]{"/all401", "/all429", "/err500", "/empty"}) {
            r = run(new JSONArray().put(prov("a", path, "m", "SECRETKEY-123")));
            if (r.error.contains("SECRETKEY")) leak = true;
        }
        ok(!leak, "error texts never contain the API key");
        // 14 round robin across providers keeps order
        authSeen.clear();
        r = run(new JSONArray().put(prov("a", "/all401", "m", "a1")).put(prov("b", "/good", "m", "b1")));
        ok(r.by.equals("B") && authSeen.get(0).equals("Bearer a1") && authSeen.get(1).equals("Bearer b1"), "providers are tried in the given order");
        srv.stop(0);
        System.out.println(fails == 0 ? "\nALL PASS (" + passes + ")" : "\n" + fails + " FAIL");
        System.exit(fails == 0 ? 0 : 1);
    }
}
