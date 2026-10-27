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

    @Override
    public void load() {
        appVisible = true;
    }

    @Override
    protected void handleOnResume() {
        appVisible = true;
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        if (s != null) s.hideDonePill();
    }

    @Override
    protected void handleOnPause() {
        appVisible = false;
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
        int mode = "ask".equals(m) ? 1 : ("done".equals(m) ? 2 : 0);
        String err = s.showPillSync(call.getString("text", ""), ttl == null ? 8000 : ttl, mode, call.getString("state", "run"));
        r.put("ok", err.isEmpty());
        r.put("err", err);
        r.put("type", s.lastPillType());
        call.resolve(r);
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
        boolean launched = s.openSelf();
        s.showPillSync("Done. Tap to open Chaman", 6000, 2, "ok");
        r.put("opened", launched);
        call.resolve(r);
    }
}
