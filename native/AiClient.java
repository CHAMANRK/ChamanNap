package com.chaman.nap;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.UnknownHostException;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;

/**
 * Step24 (3b-1): one chat-completions request to the AI providers Najeef already uses (OpenAI-style API), from Java, so it works with the app closed.
 * Pure Java on purpose (no Android classes): it is tested against a local HTTP server. Keys are never logged or put into error texts.
 * providers = [{id, name, url, model, keys:[...], ptr, read}] in the order to try. For each provider the keys are tried round-robin from ptr.
 */
final class AiClient {
    static boolean allowHttp = false; // tests only: lets a local http:// server be used

    static final class Result {
        String text = "";
        String by = "";
        String error = "";
        boolean retry; // true when trying again later could work (no internet, timeout, 429, 5xx)
    }

    private static final Pattern THINK = Pattern.compile("(?s)<think>.*?</think>");
    private static final int MAX_TEXT = 4000;

    static Result complete(JSONArray provs, String system, String user, int maxTokens, long deadline) {
        Result res = new Result();
        if (provs == null || provs.length() == 0) {
            res.error = "AI keys nahi mili (Chaman app ek baar kholo)";
            return res;
        }
        String last = "";
        boolean retryable = false, tried = false;
        for (int pi = 0; pi < provs.length(); pi++) {
            JSONObject p = provs.optJSONObject(pi);
            if (p == null) continue;
            String url = p.optString("url", "");
            if (!(url.startsWith("https://") || (allowHttp && url.startsWith("http://")))) continue;
            JSONArray keys = p.optJSONArray("keys");
            if (keys == null || keys.length() == 0) continue;
            String name = p.optString("name", p.optString("id", "AI"));
            String model = p.optString("model", "");
            int readMs = Math.max(5, Math.min(120, p.optInt("read", 40))) * 1000;
            int n = keys.length();
            int start = Math.floorMod(p.optInt("ptr", 0), n);
            for (int i = 0; i < n; i++) {
                if (System.currentTimeMillis() >= deadline) {
                    res.error = last.isEmpty() ? "time khatam" : last;
                    res.retry = true;
                    return res;
                }
                String key = keys.optString((start + i) % n, "");
                if (key.isEmpty()) continue;
                tried = true;
                try {
                    int[] code = new int[1];
                    String body = post(url, key, buildBody(model, system, user, maxTokens), readMs, code);
                    if (code[0] == 200) {
                        String t = parse(body);
                        if (t.isEmpty()) {
                            last = name + ": khaali jawab";
                            retryable = true;
                            continue;
                        }
                        res.text = t;
                        res.by = name;
                        return res;
                    }
                    last = name + ": HTTP " + code[0];
                    if (code[0] == 429 || code[0] == 408 || code[0] >= 500) retryable = true;
                    if (code[0] == 400 || code[0] == 404 || code[0] == 422) break; // model or request problem: next provider
                    // 401 / 403 / 429 / 5xx: next key
                } catch (UnknownHostException e) {
                    res.error = "net nahi";
                    res.retry = true;
                    return res;
                } catch (Exception e) {
                    last = name + ": " + shortErr(e);
                    retryable = true;
                }
            }
        }
        res.error = tried ? last : "AI keys nahi mili (Chaman app ek baar kholo)";
        res.retry = retryable;
        return res;
    }

    static String buildBody(String model, String system, String user, int maxTokens) throws Exception {
        JSONObject b = new JSONObject();
        b.put("model", model);
        JSONArray m = new JSONArray();
        m.put(new JSONObject().put("role", "system").put("content", system));
        m.put(new JSONObject().put("role", "user").put("content", user));
        b.put("messages", m);
        b.put("max_tokens", maxTokens);
        b.put("temperature", 0.8);
        return b.toString();
    }

    /** choices[0].message.content, without <think> blocks, trimmed, at most 4000 chars. Empty string when there is none. */
    static String parse(String body) {
        try {
            JSONObject j = new JSONObject(body);
            JSONArray ch = j.optJSONArray("choices");
            if (ch == null || ch.length() == 0) return "";
            JSONObject msg = ch.getJSONObject(0).optJSONObject("message");
            if (msg == null) return "";
            Object c = msg.opt("content");
            if (!(c instanceof String)) return "";
            String t = THINK.matcher((String) c).replaceAll("").trim();
            return t.length() > MAX_TEXT ? t.substring(0, MAX_TEXT) : t;
        } catch (Exception e) {
            return "";
        }
    }

    private static String shortErr(Exception e) {
        String m = e.getClass().getSimpleName();
        if (e instanceof java.net.SocketTimeoutException) return "timeout";
        return m.length() > 30 ? m.substring(0, 30) : m;
    }

    private static String post(String url, String key, String json, int readMs, int[] code) throws IOException {
        HttpURLConnection c = (HttpURLConnection) java.net.URI.create(url).toURL().openConnection();
        try {
            c.setRequestMethod("POST");
            c.setConnectTimeout(10000);
            c.setReadTimeout(readMs);
            c.setInstanceFollowRedirects(false);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("User-Agent", "Chaman/1.0");
            c.setRequestProperty("Authorization", "Bearer " + key);
            byte[] data = json.getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(data.length);
            try (OutputStream o = c.getOutputStream()) {
                o.write(data);
            }
            code[0] = c.getResponseCode();
            if (code[0] != 200) return "";
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                char[] buf = new char[4096];
                int k;
                while ((k = r.read(buf)) > 0 && sb.length() < 200000) sb.append(buf, 0, k);
            }
            return sb.toString();
        } finally {
            c.disconnect();
        }
    }
}
