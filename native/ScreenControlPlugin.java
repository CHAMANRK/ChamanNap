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
        call.resolve();
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
        ChamanAccessibilityService s = ChamanAccessibilityService.get();
        if (s != null) {
            Integer ttl = call.getInt("ttl", 8000);
            s.showPill(call.getString("text", ""), ttl == null ? 8000 : ttl);
        }
        call.resolve();
    }
}
