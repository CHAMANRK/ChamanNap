package com.chaman.nap;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Locale;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

// Voice v0.1 (1.52000.0): STT (Android SpeechRecognizer, in-app mic), TTS (ElevenLabs download + MediaPlayer, Android TextToSpeech as fallback).
// Keys are NOT stored here: JS passes one key per call (key rotation lives in www/js/voice.js). The key is only ever put in the xi-api-key header
// and never in an error message. Audio bytes stay native: ttsFetch writes an mp3 in the cache dir, play() plays that file and deletes it.
@CapacitorPlugin(name = "Voice", permissions = { @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO }) })
public class VoicePlugin extends Plugin {

    static final String EL = "https://api.elevenlabs.io";
    static final Pattern ID = Pattern.compile("^[A-Za-z0-9_.-]{3,80}$");
    final Handler main = new Handler(Looper.getMainLooper());

    SpeechRecognizer sr;
    PluginCall listenCall;
    MediaPlayer mp;
    PluginCall playCall;
    TextToSpeech tts;
    boolean ttsReady = false;
    PluginCall ttsCall;
    int uid = 0;

    Context ctx() {
        return getContext().getApplicationContext();
    }

    // ---------------- status ----------------
    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("mic", getPermissionState("mic") == PermissionState.GRANTED);
        r.put("stt", SpeechRecognizer.isRecognitionAvailable(ctx()));
        r.put("tts", ttsReady);
        call.resolve(r);
    }

    // ---------------- STT ----------------
    @PluginMethod
    public void listen(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) {
            requestPermissionForAlias("mic", call, "micPerm");
            return;
        }
        startListen(call);
    }

    @PermissionCallback
    private void micPerm(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) startListen(call);
        else call.reject("Mic permission nahi mili. Phone Settings > Apps > Chaman > Permissions me mic allow karo.", "PERMISSION");
    }

    private void startListen(final PluginCall call) {
        final Activity act = getActivity();
        if (act == null) {
            call.reject("Activity nahi mili", "ERROR");
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(ctx())) {
            call.reject("Phone me speech recognition service nahi hai (Google app / Speech Services chahiye).", "NOT_AVAILABLE");
            return;
        }
        final String lang = call.getString("lang", "hi-IN");
        stopSpeakInternal();
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    killRecognizer();
                    finishListen(null, "naya listen shuru hua", "SUPERSEDED");
                    listenCall = call;
                    sr = SpeechRecognizer.createSpeechRecognizer(ctx());
                    sr.setRecognitionListener(new RecognitionListener() {
                        @Override public void onReadyForSpeech(Bundle b) {}
                        @Override public void onBeginningOfSpeech() {}
                        @Override public void onRmsChanged(float v) {}
                        @Override public void onBufferReceived(byte[] b) {}
                        @Override public void onEndOfSpeech() {}
                        @Override public void onPartialResults(Bundle b) {}
                        @Override public void onEvent(int i, Bundle b) {}
                        @Override
                        public void onResults(Bundle b) {
                            ArrayList<String> l = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                            JSObject r = new JSObject();
                            r.put("text", (l != null && !l.isEmpty()) ? l.get(0) : "");
                            finishListen(r, null, null);
                        }
                        @Override
                        public void onError(int e) {
                            if (e == SpeechRecognizer.ERROR_NO_MATCH || e == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                                JSObject r = new JSObject();
                                r.put("text", "");
                                r.put("reason", "no_speech");
                                finishListen(r, null, null);
                            } else if (e == SpeechRecognizer.ERROR_CLIENT) {
                                // we cancelled it ourselves
                                JSObject r = new JSObject();
                                r.put("text", "");
                                r.put("reason", "cancelled");
                                finishListen(r, null, null);
                            } else {
                                finishListen(null, sttErr(e), e == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ? "PERMISSION" : "STT_" + e);
                            }
                        }
                    });
                    Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
                    // Hinglish: Hindi + Indian English together (the Google recognizer reads this extra; others ignore it)
                    i.putExtra("android.speech.extra.ADDITIONAL_LANGUAGES", new String[] { "en-IN", "hi-IN" });
                    i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
                    i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                    i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx().getPackageName());
                    sr.startListening(i);
                } catch (Exception ex) {
                    finishListen(null, "Mic shuru nahi hua: " + ex.getMessage(), "ERROR");
                }
            }
        });
    }

    static String sttErr(int e) {
        switch (e) {
            case SpeechRecognizer.ERROR_AUDIO: return "Mic audio error";
            case SpeechRecognizer.ERROR_NETWORK: return "Speech service ko internet nahi mila";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "Speech service timeout (internet)";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "Speech service busy, thodi der baad try karo";
            case SpeechRecognizer.ERROR_SERVER: return "Speech service server error";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "Mic permission nahi hai";
            default: return "Speech error " + e;
        }
    }

    // main thread only
    private void finishListen(JSObject ok, String err, String code) {
        PluginCall c = listenCall;
        listenCall = null;
        if (c == null) return;
        if (ok != null) c.resolve(ok);
        else c.reject(err == null ? "listen fail" : err, code == null ? "ERROR" : code);
        killRecognizer();
    }

    private void killRecognizer() {
        SpeechRecognizer s = sr;
        sr = null;
        if (s != null) {
            try { s.setRecognitionListener(null); } catch (Exception e) { /* ignore */ }
            try { s.cancel(); } catch (Exception e) { /* ignore */ }
            try { s.destroy(); } catch (Exception e) { /* ignore */ }
        }
    }

    // user pressed mic again: stop listening, the recognizer still returns what it heard so far
    @PluginMethod
    public void stopListen(final PluginCall call) {
        main.post(new Runnable() {
            @Override
            public void run() {
                try { if (sr != null) sr.stopListening(); } catch (Exception e) { /* ignore */ }
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void cancelListen(final PluginCall call) {
        main.post(new Runnable() {
            @Override
            public void run() {
                JSObject r = new JSObject();
                r.put("text", "");
                r.put("reason", "cancelled");
                finishListen(r, null, null);
                call.resolve();
            }
        });
    }

    // ---------------- TTS: ElevenLabs ----------------
    // args: key, voice, model, speed (0.7..1.2), text. Result: {path}. Errors: code = HTTP status as a string (JS uses it for key cooldown).
    @PluginMethod
    public void ttsFetch(final PluginCall call) {
        final String key = call.getString("key", "").trim();
        final String voice = call.getString("voice", "").trim();
        final String model = call.getString("model", "").trim();
        final String text = call.getString("text", "");
        final double speed = call.getDouble("speed", 1.0);
        if (key.isEmpty() || !ID.matcher(voice).matches() || !ID.matcher(model).matches() || text.trim().isEmpty() || text.length() > 4500) {
            call.reject("key / voice / model / text galat", "BAD_ARGS");
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection c = null;
                try {
                    purgeOld();
                    JSONObject body = new JSONObject();
                    body.put("text", text);
                    body.put("model_id", model);
                    if (Math.abs(speed - 1.0) > 0.01) {
                        double sp = Math.max(0.7, Math.min(1.2, speed));
                        JSONObject vs = new JSONObject();
                        vs.put("stability", 0.5);
                        vs.put("similarity_boost", 0.75);
                        vs.put("speed", sp);
                        body.put("voice_settings", vs);
                    }
                    URL u = new URL(EL + "/v1/text-to-speech/" + URLEncoder.encode(voice, "UTF-8") + "?output_format=mp3_44100_128");
                    c = (HttpURLConnection) u.openConnection();
                    c.setRequestMethod("POST");
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(40000);
                    c.setDoOutput(true);
                    c.setRequestProperty("xi-api-key", key);
                    c.setRequestProperty("Content-Type", "application/json");
                    c.setRequestProperty("Accept", "audio/mpeg");
                    OutputStream os = c.getOutputStream();
                    os.write(body.toString().getBytes("UTF-8"));
                    os.close();
                    int code = c.getResponseCode();
                    if (code != 200) {
                        call.reject("HTTP " + code + " " + errBody(c), String.valueOf(code));
                        return;
                    }
                    File f = new File(ctx().getCacheDir(), "vc_" + System.currentTimeMillis() + "_" + (uid++) + ".mp3");
                    InputStream in = c.getInputStream();
                    FileOutputStream fo = new FileOutputStream(f);
                    byte[] buf = new byte[16384];
                    int n;
                    long total = 0;
                    while ((n = in.read(buf)) > 0) {
                        fo.write(buf, 0, n);
                        total += n;
                    }
                    fo.close();
                    in.close();
                    if (total < 200) {
                        f.delete();
                        call.reject("Audio khaali aaya", "EMPTY");
                        return;
                    }
                    JSObject r = new JSObject();
                    r.put("path", f.getAbsolutePath());
                    r.put("bytes", total);
                    call.resolve(r);
                } catch (Exception e) {
                    call.reject("Network: " + e.getClass().getSimpleName() + " " + e.getMessage(), "NET");
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        }).start();
    }

    static String errBody(HttpURLConnection c) {
        try {
            InputStream es = c.getErrorStream();
            if (es == null) return "";
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[2048];
            int n = es.read(b);
            if (n > 0) bo.write(b, 0, n);
            es.close();
            return bo.toString("UTF-8").replaceAll("\\s+", " ").trim();
        } catch (Exception e) {
            return "";
        }
    }

    // old unplayed files (stopped mid-way) are removed after an hour
    private void purgeOld() {
        try {
            File[] fs = ctx().getCacheDir().listFiles();
            if (fs == null) return;
            long old = System.currentTimeMillis() - 3600000L;
            for (File f : fs) if (f.getName().startsWith("vc_") && f.getName().endsWith(".mp3") && f.lastModified() < old) f.delete();
        } catch (Exception e) { /* ignore */ }
    }

    // lists for the Settings pickers (real call, so the model / voice names are never guessed). what = models | voices
    @PluginMethod
    public void elGet(final PluginCall call) {
        final String key = call.getString("key", "").trim();
        final String what = call.getString("what", "");
        final String path = "models".equals(what) ? "/v1/models" : "voices".equals(what) ? "/v1/voices" : null;
        if (key.isEmpty() || path == null) {
            call.reject("key ya what galat", "BAD_ARGS");
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(EL + path).openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(20000);
                    c.setRequestProperty("xi-api-key", key);
                    int code = c.getResponseCode();
                    if (code != 200) {
                        call.reject("HTTP " + code + " " + errBody(c), String.valueOf(code));
                        return;
                    }
                    InputStream in = c.getInputStream();
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] b = new byte[8192];
                    int n;
                    while ((n = in.read(b)) > 0) bo.write(b, 0, n);
                    in.close();
                    JSONObject j = (bo.size() > 0 && bo.toString("UTF-8").trim().startsWith("[")) ? new JSONObject().put("models", new JSONArray(bo.toString("UTF-8"))) : new JSONObject(bo.toString("UTF-8"));
                    JSONArray out = new JSONArray();
                    if ("models".equals(what)) {
                        JSONArray a = j.optJSONArray("models");
                        for (int i = 0; a != null && i < a.length(); i++) {
                            JSONObject m = a.getJSONObject(i);
                            if (!m.optBoolean("can_do_text_to_speech", false)) continue;
                            JSONObject o = new JSONObject();
                            o.put("id", m.optString("model_id"));
                            o.put("name", m.optString("name"));
                            JSONArray l = m.optJSONArray("languages");
                            o.put("info", (l == null ? 0 : l.length()) + " languages");
                            out.put(o);
                        }
                    } else {
                        JSONArray a = j.optJSONArray("voices");
                        for (int i = 0; a != null && i < a.length(); i++) {
                            JSONObject v = a.getJSONObject(i);
                            JSONObject o = new JSONObject();
                            o.put("id", v.optString("voice_id"));
                            o.put("name", v.optString("name"));
                            o.put("info", v.optString("category"));
                            out.put(o);
                        }
                    }
                    JSObject r = new JSObject();
                    r.put("items", out);
                    call.resolve(r);
                } catch (Exception e) {
                    call.reject("Network: " + e.getClass().getSimpleName() + " " + e.getMessage(), "NET");
                } finally {
                    if (c != null) c.disconnect();
                }
            }
        }).start();
    }

    // ---------------- playback of a downloaded mp3 ----------------
    @PluginMethod
    public void play(final PluginCall call) {
        final String p = call.getString("path", "");
        File f;
        try {
            f = new File(p).getCanonicalFile();
            String dir = ctx().getCacheDir().getCanonicalPath() + File.separator;
            if (!f.getPath().startsWith(dir) || !f.getName().startsWith("vc_") || !f.exists()) throw new Exception("bad");
        } catch (Exception e) {
            call.reject("Audio file galat", "BAD_ARGS");
            return;
        }
        final File file = f;
        main.post(new Runnable() {
            @Override
            public void run() {
                try {
                    releasePlayer(true);
                    playCall = call;
                    mp = new MediaPlayer();
                    mp.setAudioAttributes(new AudioAttributes.Builder().setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).setUsage(AudioAttributes.USAGE_MEDIA).build());
                    mp.setDataSource(file.getAbsolutePath());
                    mp.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                        @Override public void onPrepared(MediaPlayer m) { m.start(); }
                    });
                    mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                        @Override
                        public void onCompletion(MediaPlayer m) {
                            file.delete();
                            JSObject r = new JSObject();
                            r.put("done", true);
                            finishPlay(r, null);
                        }
                    });
                    mp.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                        @Override
                        public boolean onError(MediaPlayer m, int what, int extra) {
                            file.delete();
                            finishPlay(null, "Audio play error " + what + "/" + extra);
                            return true;
                        }
                    });
                    mp.prepareAsync();
                } catch (Exception e) {
                    file.delete();
                    finishPlay(null, "Audio play nahi hua: " + e.getMessage());
                }
            }
        });
    }

    // main thread
    private void finishPlay(JSObject ok, String err) {
        PluginCall c = playCall;
        playCall = null;
        releasePlayer(false);
        if (c == null) return;
        if (ok != null) c.resolve(ok);
        else c.reject(err, "PLAY");
    }

    private void releasePlayer(boolean resolveStopped) {
        MediaPlayer m = mp;
        mp = null;
        if (m != null) {
            try { m.setOnCompletionListener(null); m.setOnErrorListener(null); m.stop(); } catch (Exception e) { /* ignore */ }
            try { m.release(); } catch (Exception e) { /* ignore */ }
        }
        if (resolveStopped && playCall != null) {
            JSObject r = new JSObject();
            r.put("stopped", true);
            PluginCall c = playCall;
            playCall = null;
            c.resolve(r);
        }
    }

    // ---------------- TTS: Android engine (fallback) ----------------
    @PluginMethod
    public void speakAndroid(final PluginCall call) {
        final String text = call.getString("text", "");
        final String lang = call.getString("lang", "hi-IN");
        final double rate = call.getDouble("rate", 1.0);
        if (text.trim().isEmpty()) {
            call.reject("text khaali", "BAD_ARGS");
            return;
        }
        main.post(new Runnable() {
            @Override
            public void run() {
                if (tts == null) {
                    tts = new TextToSpeech(ctx(), new TextToSpeech.OnInitListener() {
                        @Override
                        public void onInit(int s) {
                            ttsReady = s == TextToSpeech.SUCCESS;
                            if (ttsReady) {
                                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                                    @Override public void onStart(String id) {}
                                    @Override public void onDone(String id) { endTts(null); }
                                    @Override public void onError(String id) { endTts("Android TTS error"); }
                                });
                            }
                            doSpeak(call, text, lang, rate);
                        }
                    });
                } else doSpeak(call, text, lang, rate);
            }
        });
    }

    private void doSpeak(PluginCall call, String text, String lang, double rate) {
        if (!ttsReady || tts == null) {
            call.reject("Android TTS engine ready nahi hai (Settings > System > Languages > Text-to-speech).", "NO_TTS");
            return;
        }
        endTtsStopped();
        ttsCall = call;
        String[] p = lang.split("-");
        Locale loc = p.length > 1 ? new Locale(p[0], p[1]) : new Locale(p[0]);
        int r = tts.setLanguage(loc);
        if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
            r = tts.setLanguage(new Locale("en", "IN"));
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(Locale.getDefault());
        }
        tts.setSpeechRate((float) Math.max(0.5, Math.min(2.0, rate)));
        int q = tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "vc" + (uid++));
        if (q != TextToSpeech.SUCCESS) endTts("Android TTS speak fail");
    }

    // may be called from the TTS callback thread
    private synchronized void endTts(String err) {
        PluginCall c = ttsCall;
        ttsCall = null;
        if (c == null) return;
        if (err == null) c.resolve(new JSObject().put("done", true));
        else c.reject(err, "TTS");
    }

    private synchronized void endTtsStopped() {
        PluginCall c = ttsCall;
        ttsCall = null;
        if (c != null) c.resolve(new JSObject().put("stopped", true));
    }

    // ---------------- stop ----------------
    private void stopSpeakInternal() {
        main.post(new Runnable() {
            @Override
            public void run() {
                releasePlayer(true);
                try { if (tts != null) tts.stop(); } catch (Exception e) { /* ignore */ }
                endTtsStopped();
            }
        });
    }

    @PluginMethod
    public void stopSpeak(PluginCall call) {
        stopSpeakInternal();
        call.resolve();
    }

    @PluginMethod
    public void discard(PluginCall call) {
        try {
            File f = new File(call.getString("path", "")).getCanonicalFile();
            String dir = ctx().getCacheDir().getCanonicalPath() + File.separator;
            if (f.getPath().startsWith(dir) && f.getName().startsWith("vc_")) f.delete();
        } catch (Exception e) { /* ignore */ }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        main.post(new Runnable() {
            @Override
            public void run() {
                killRecognizer();
                releasePlayer(false);
                if (tts != null) { try { tts.shutdown(); } catch (Exception e) { /* ignore */ } tts = null; }
            }
        });
    }
}
