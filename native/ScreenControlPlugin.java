package com.chaman.nap;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ScreenControl")
public class ScreenControlPlugin extends Plugin {

    private static volatile boolean appVisible = true;

    static boolean isAppVisible() {
        return appVisible;
    }

    @Override
    public void load() {
        appVisible = true;
    }

    @Override
    protected void handleOnResume() {
        appVisible = true;
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        if (s != null) {
            s.hideDonePill();
            s.lineVisibilityChanged();
        }
    }

    @Override
    protected void handleOnPause() {
        appVisible = false;
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        if (s != null) s.lineVisibilityChanged();
    }

    private ChamanAccessibilityService svc(PluginCall call) {
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        if (s == null) {
            call.reject("Accessibility service on nahi hai.", "NOT_ENABLED");
            return null;
        }
        if (ChamanAccessibilityService.stopRequested) {
            call.reject("Najeef ne Stop dabaya.", "STOPPED");
            return null;
        }
        return s;
    }

    // Face lock: when the owner is not verified, screen actions are refused here too (the JS side checks first, this is the second lock).
    private boolean faceBlocked(PluginCall call) {
        if (FaceGate.check(getContext(), "screen")) return false;
        call.reject("Face verify chahiye.", "FACE_REQUIRED");
        return true;
    }

    private void fail(PluginCall call, Exception e) {
        if (e instanceof ChamanAccessibilityService.A11yError) {
            call.reject(e.getMessage(), ((ChamanAccessibilityService.A11yError) e).code);
        } else {
            call.reject(String.valueOf(e.getMessage()), "ERROR");
        }
    }

    private void startSettings(PluginCall call, Intent i) {
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
        JSObject r = new JSObject();
        r.put("a11y", ChamanAccessibilityService.get() != null);
        r.put("overlay", Settings.canDrawOverlays(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void openA11ySettings(PluginCall call) {
        startSettings(call, new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
    }

    @PluginMethod
    public void requestOverlay(PluginCall call) {
        startSettings(
            call,
            new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()))
        );
    }

    // App Stop button: same flag as long-pressing the dot. Every screen action then rejects with STOPPED until the next reset.
    @PluginMethod
    public void stop(PluginCall call) {
        ChamanAccessibilityService.stopRequested = true;
        call.resolve();
    }

    @PluginMethod
    public void reset(PluginCall call) {
        ChamanAccessibilityService.stopRequested = false;
        ChamanAccessibilityService.userDone = false;
        call.resolve();
    }

    // Used while the agent waits for Najeef: tap counter, keyboard state, dot-tap flag, stop flag.
    @PluginMethod
    public void activity(PluginCall call) {
        if (Boolean.TRUE.equals(call.getBoolean("reset", false))) ChamanAccessibilityService.userDone = false;
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        JSObject r = new JSObject();
        r.put("count", ChamanAccessibilityService.actCount);
        r.put("kbd", s != null && s.keyboardVisible());
        r.put("done", ChamanAccessibilityService.userDone);
        r.put("stop", ChamanAccessibilityService.stopRequested);
        call.resolve(r);
    }

    @PluginMethod
    public void read(PluginCall call) {
        ChamanAccessibilityService s = svc(call);
        if (s == null) return;
        if (faceBlocked(call)) return;
        try {
            call.resolve(JSObject.fromJSONObject(s.readScreen()));
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void click(PluginCall call) {
        ChamanAccessibilityService s = svc(call);
        if (s == null) return;
        if (faceBlocked(call)) return;
        try {
            Integer id = call.getInt("id");
            String text = call.getString("text", "");
            String label;
            if (id != null) label = s.clickById(id);
            else if (text != null && !text.trim().isEmpty()) label = s.clickByText(text.trim());
            else {
                call.reject("id ya text do.", "BAD_ARGS");
                return;
            }
            JSObject r = new JSObject();
            r.put("label", label);
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void type(PluginCall call) {
        ChamanAccessibilityService s = svc(call);
        if (s == null) return;
        if (faceBlocked(call)) return;
        try {
            String text = call.getString("text", "");
            Integer id = call.getInt("id", -1);
            Boolean submit = call.getBoolean("submit", false);
            String label = s.typeText(id == null ? -1 : id, text == null ? "" : text, submit != null && submit);
            JSObject r = new JSObject();
            r.put("label", label);
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void scroll(PluginCall call) {
        ChamanAccessibilityService s = svc(call);
        if (s == null) return;
        if (faceBlocked(call)) return;
        try {
            s.scroll(call.getString("direction", "down"));
            call.resolve();
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void key(PluginCall call) {
        ChamanAccessibilityService s = svc(call);
        if (s == null) return;
        if (!"lock".equals(call.getString("key", "")) && faceBlocked(call)) return;
        try {
            boolean ok = s.pressKey(call.getString("key", ""));
            JSObject r = new JSObject();
            r.put("ok", ok);
            call.resolve(r);
        } catch (Exception e) {
            fail(call, e);
        }
    }

    @PluginMethod
    public void pill(PluginCall call) {
        JSObject r = new JSObject();
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        if (s == null) {
            r.put("ok", false);
            r.put("err", "Accessibility service on nahi hai");
            call.resolve(r);
            return;
        }
        Integer ttl = call.getInt("ttl", 8000);
        String m = call.getString("mode", "pill");
        int mode = "ask".equals(m) ? 1 : ("done".equals(m) ? 2 : 3);
        String err = s.showPillSync(call.getString("text", ""), ttl == null ? 8000 : ttl, mode, call.getString("state", "run"));
        r.put("ok", err.isEmpty());
        r.put("err", err);
        r.put("type", s.lastPillType());
        call.resolve(r);
    }

    // step18: the one status line (text, dot state, list of steps). {off:true} removes it.
    @PluginMethod
    public void line(PluginCall call) {
        JSObject r = new JSObject();
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        if (s == null) {
            r.put("ok", false);
            r.put("err", "Accessibility service on nahi hai");
            call.resolve(r);
            return;
        }
        if (Boolean.TRUE.equals(call.getBoolean("off", false))) {
            s.lineOff();
            r.put("ok", true);
            call.resolve(r);
            return;
        }
        String err = s.lineSync(call.getString("text", ""), call.getString("state", "run"), call.getString("items", "[]"));
        r.put("ok", err.isEmpty());
        r.put("err", err);
        r.put("type", s.lastPillType());
        call.resolve(r);
    }

    // step26: floating mini Chaman. {on:true/false} (Settings switch; the JS sends it on every app start, so "on" also means the JS is alive).
    @PluginMethod
    public void bubble(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        ChamanBubble.active = on;
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        if (s != null && s.bubble() != null) s.bubble().refresh();
        JSObject r = new JSObject();
        r.put("ok", true);
        r.put("a11y", s != null);
        r.put("overlay", Settings.canDrawOverlays(getContext()));
        call.resolve(r);
    }

    // the answer of the last turn. open:true = show the panel for it (the turn was started from the panel)
    @PluginMethod
    public void bubbleAnswer(PluginCall call) {
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        if (s != null && s.bubble() != null) {
            s.bubble().setAnswer(call.getString("text", ""), Boolean.TRUE.equals(call.getBoolean("open", false)), Boolean.TRUE.equals(call.getBoolean("fail", false)));
        }
        call.resolve();
    }

    // confirm card for the panel: card = JSON string {title, body, m, btns:[{l,o}]}, or "" to remove it
    @PluginMethod
    public void bubbleCard(PluginCall call) {
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        if (s != null && s.bubble() != null) s.bubble().setCard(call.getString("card", ""));
        call.resolve();
    }

    // events typed or tapped in the panel since the last poll: {type:send,text} {type:stop} {type:confirm,m,o}
    @PluginMethod
    public void bubblePoll(PluginCall call) {
        JSObject r = new JSObject();
        r.put("events", ChamanBubble.drainEvents());
        call.resolve(r);
    }

    @Override
    protected void handleOnDestroy() {
        ChamanBubble.active = false;
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        if (s != null && s.bubble() != null) s.bubble().refresh();
    }

    // Task finished: bring Chaman back to the front. If Android blocks the launch, the pill says "tap to open".
    @PluginMethod
    public void finish(PluginCall call) {
        JSObject r = new JSObject();
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        if (s == null || appVisible) {
            r.put("opened", false);
            call.resolve(r);
            return;
        }
        boolean open = !Boolean.FALSE.equals(call.getBoolean("open", true));
        boolean launched = open && s.openSelf();
        if (!Boolean.TRUE.equals(call.getBoolean("quiet", false))) s.showPillSync("Done. Tap to open Chaman", 6000, 2, "ok");
        r.put("opened", launched);
        call.resolve(r);
    }
}
