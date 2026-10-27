package com.chaman.nap;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Context;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

public class ChamanAccessibilityService extends AccessibilityService {

    public static class A11yError extends Exception {
        public final String code;

        public A11yError(String code, String msg) {
            super(msg);
            this.code = code;
        }
    }

    private static ChamanAccessibilityService instance;
    public static volatile boolean stopRequested = false;

    public static ChamanAccessibilityService get() {
        return instance;
    }

    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<AccessibilityNodeInfo> nodes = new ArrayList<>();
    private WindowManager wm;
    private LinearLayout pill;
    private TextView pillText;
    private boolean pillAttached = false;
    private Runnable hideTask;

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        instance = this;
        wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {}

    @Override
    public void onInterrupt() {}

    @Override
    public boolean onUnbind(Intent intent) {
        instance = null;
        main.post(new Runnable() {
            @Override
            public void run() {
                removePill();
            }
        });
        return super.onUnbind(intent);
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics());
    }

    // ---------- reading the screen ----------

    public synchronized JSONObject readScreen() throws Exception {
        nodes.clear();
        AccessibilityNodeInfo root = getRootInActiveWindow();
        JSONObject out = new JSONObject();
        JSONArray items = new JSONArray();
        if (root == null) {
            out.put("pkg", "");
            out.put("items", items);
            return out;
        }
        out.put("pkg", String.valueOf(root.getPackageName()));
        walk(root, items, 0);
        out.put("items", items);
        return out;
    }

    private void walk(AccessibilityNodeInfo n, JSONArray items, int depth) throws Exception {
        if (n == null || items.length() >= 150 || depth > 40) return;
        if (!n.isVisibleToUser()) return;
        String t = label(n);
        boolean interactive = n.isClickable() || n.isEditable() || n.isScrollable() || n.isCheckable();
        if (!t.isEmpty() || interactive) {
            JSONObject o = new JSONObject();
            o.put("i", nodes.size());
            nodes.add(n);
            if (!t.isEmpty()) o.put("t", t);
            String cls = String.valueOf(n.getClassName());
            int dot = cls.lastIndexOf('.');
            o.put("k", dot >= 0 ? cls.substring(dot + 1) : cls);
            StringBuilder f = new StringBuilder();
            if (n.isClickable()) f.append('c');
            if (n.isEditable()) f.append('e');
            if (n.isScrollable()) f.append('s');
            if (n.isChecked()) f.append('x');
            if (n.isFocused()) f.append('f');
            if (f.length() > 0) o.put("f", f.toString());
            items.put(o);
        }
        for (int k = 0; k < n.getChildCount(); k++) {
            walk(n.getChild(k), items, depth + 1);
        }
    }

    private String label(AccessibilityNodeInfo n) {
        if (n.isPassword()) return "[password field]";
        CharSequence c = n.getText();
        if (c == null || c.length() == 0) c = n.getContentDescription();
        if ((c == null || c.length() == 0) && n.isEditable() && Build.VERSION.SDK_INT >= 26) {
            c = n.getHintText();
        }
        if (c == null) return "";
        String s = c.toString().replaceAll("\\s+", " ").trim();
        return s.length() > 80 ? s.substring(0, 80) : s;
    }

    // ---------- actions ----------

    private boolean tapAt(int x, int y) {
        if (Build.VERSION.SDK_INT < 24) return false;
        Path p = new Path();
        p.moveTo(x, y);
        GestureDescription.StrokeDescription sd = new GestureDescription.StrokeDescription(p, 0, 60);
        return dispatchGesture(new GestureDescription.Builder().addStroke(sd).build(), null, null);
    }

    private boolean swipe(int x1, int y1, int x2, int y2, int ms) {
        if (Build.VERSION.SDK_INT < 24) return false;
        Path p = new Path();
        p.moveTo(x1, y1);
        p.lineTo(x2, y2);
        GestureDescription.StrokeDescription sd = new GestureDescription.StrokeDescription(p, 0, ms);
        return dispatchGesture(new GestureDescription.Builder().addStroke(sd).build(), null, null);
    }

    private String clickNode(AccessibilityNodeInfo n) throws A11yError {
        AccessibilityNodeInfo t = n;
        int up = 0;
        while (t != null && !t.isClickable() && up < 6) {
            t = t.getParent();
            up++;
        }
        if (t != null) {
            if (t.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return label(n);
        }
        Rect r = new Rect();
        n.getBoundsInScreen(r);
        if (tapAt(r.centerX(), r.centerY())) return label(n);
        throw new A11yError("CLICK_FAILED", "Click nahi ho paya.");
    }

    public synchronized String clickById(int id) throws A11yError {
        if (id < 0 || id >= nodes.size()) {
            throw new A11yError("BAD_ID", "Ye id sahi nahi hai. Pehle screen_read karo.");
        }
        AccessibilityNodeInfo n = nodes.get(id);
        if (!n.refresh()) {
            throw new A11yError("BAD_ID", "Screen badal gayi hai. Dobara screen_read karo.");
        }
        return clickNode(n);
    }

    public synchronized String clickByText(String text) throws A11yError {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) throw new A11yError("NO_SCREEN", "Screen padh nahi pa raha.");
        List<AccessibilityNodeInfo> found = root.findAccessibilityNodeInfosByText(text);
        if (found != null) {
            for (AccessibilityNodeInfo n : found) {
                if (n.isVisibleToUser()) return clickNode(n);
            }
        }
        throw new A11yError("NOT_FOUND", "\"" + text + "\" screen pe nahi mila.");
    }

    private boolean imeEnter(AccessibilityNodeInfo t) {
        if (Build.VERSION.SDK_INT >= 30) {
            return t.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.getId());
        }
        return false;
    }

    public synchronized String typeText(int id, String text, boolean submit) throws A11yError {
        AccessibilityNodeInfo t = null;
        if (id >= 0 && id < nodes.size()) t = nodes.get(id);
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (t == null && root != null) {
            t = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            if (t == null) {
                for (AccessibilityNodeInfo n : nodes) {
                    if (n.isEditable()) {
                        t = n;
                        break;
                    }
                }
            }
        }
        if (t == null) throw new A11yError("NO_INPUT", "Koi text box nahi mila. Pehle screen_read karo.");
        if (t.isPassword()) throw new A11yError("BLOCKED", "Password field me type nahi karta.");
        t.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
        Bundle b = new Bundle();
        b.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
        if (!t.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, b)) {
            throw new A11yError("TYPE_FAILED", "Text set nahi hua. Shayad ye text box nahi hai.");
        }
        if (submit) imeEnter(t);
        return label(t);
    }

    private AccessibilityNodeInfo findScrollable(AccessibilityNodeInfo n, int depth) {
        if (n == null || depth > 30) return null;
        if (n.isScrollable()) return n;
        for (int k = 0; k < n.getChildCount(); k++) {
            AccessibilityNodeInfo r = findScrollable(n.getChild(k), depth + 1);
            if (r != null) return r;
        }
        return null;
    }

    public synchronized void scroll(String dir) throws A11yError {
        AccessibilityNodeInfo target = null;
        for (AccessibilityNodeInfo n : nodes) {
            if (n.isScrollable()) {
                target = n;
                break;
            }
        }
        if (target == null) target = findScrollable(getRootInActiveWindow(), 0);
        boolean ok = false;
        if (target != null && Build.VERSION.SDK_INT >= 23) {
            AccessibilityNodeInfo.AccessibilityAction a;
            if ("up".equals(dir)) a = AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_UP;
            else if ("left".equals(dir)) a = AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_LEFT;
            else if ("right".equals(dir)) a = AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_RIGHT;
            else a = AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_DOWN;
            ok = target.performAction(a.getId());
        }
        if (!ok) {
            DisplayMetrics dm = getResources().getDisplayMetrics();
            int w = dm.widthPixels, h = dm.heightPixels;
            boolean done;
            if ("up".equals(dir)) done = swipe(w / 2, (int) (h * 0.3), w / 2, (int) (h * 0.7), 300);
            else if ("left".equals(dir)) done = swipe((int) (w * 0.3), h / 2, (int) (w * 0.7), h / 2, 300);
            else if ("right".equals(dir)) done = swipe((int) (w * 0.7), h / 2, (int) (w * 0.3), h / 2, 300);
            else done = swipe(w / 2, (int) (h * 0.7), w / 2, (int) (h * 0.3), 300);
            if (!done) throw new A11yError("SCROLL_FAILED", "Scroll nahi hua.");
        }
    }

    public boolean pressKey(String key) throws A11yError {
        if ("back".equals(key)) return performGlobalAction(GLOBAL_ACTION_BACK);
        if ("home".equals(key)) return performGlobalAction(GLOBAL_ACTION_HOME);
        if ("recents".equals(key)) return performGlobalAction(GLOBAL_ACTION_RECENTS);
        if ("notifications".equals(key)) return performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS);
        if ("quick_settings".equals(key)) return performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS);
        if ("lock".equals(key) && Build.VERSION.SDK_INT >= 28) return performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN);
        if ("screenshot".equals(key) && Build.VERSION.SDK_INT >= 28) return performGlobalAction(GLOBAL_ACTION_TAKE_SCREENSHOT);
        if ("enter".equals(key)) {
            AccessibilityNodeInfo root = getRootInActiveWindow();
            AccessibilityNodeInfo f = root == null ? null : root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            if (f != null) return imeEnter(f);
            return false;
        }
        throw new A11yError("BAD_KEY", "Ye key support nahi: " + key);
    }

    // ---------- status pill (overlay) ----------

    private boolean pillTapOpens = false;
    private View stopIcon;
    private volatile String lastPillType = "";

    public String lastPillType() {
        return lastPillType;
    }

    private class StopIcon extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        StopIcon(Context c) {
            super(c);
            p.setColor(0xFFE6EFE8);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(dp(1.6f));
            p.setStrokeCap(Paint.Cap.ROUND);
        }

        @Override
        protected void onDraw(Canvas c) {
            float w = getWidth();
            float h = getHeight();
            float m = w * 0.28f;
            c.drawLine(m, m, w - m, h - m, p);
            c.drawLine(w - m, m, m, h - m, p);
        }
    }

    private void buildPill() {
        Context c = this;
        pill = new LinearLayout(c);
        pill.setOrientation(LinearLayout.HORIZONTAL);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        pill.setPadding(dp(14), dp(8), dp(10), dp(8));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xF01E2A24);
        bg.setCornerRadius(dp(24));
        bg.setStroke(dp(1), 0xFF3F5E4C);
        pill.setBackground(bg);

        View dot = new View(c);
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(0xFF8DBF9C);
        dot.setBackground(d);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(dp(8), dp(8));
        dlp.rightMargin = dp(10);
        pill.addView(dot, dlp);

        pillText = new TextView(c);
        pillText.setTextColor(0xFFE6EFE8);
        pillText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        pillText.setSingleLine(true);
        pillText.setEllipsize(TextUtils.TruncateAt.END);
        pillText.setMaxWidth((int) (getResources().getDisplayMetrics().widthPixels * 0.66f));
        pill.addView(pillText, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        stopIcon = new StopIcon(c);
        LinearLayout.LayoutParams xlp = new LinearLayout.LayoutParams(dp(26), dp(26));
        xlp.leftMargin = dp(10);
        pill.addView(stopIcon, xlp);

        pill.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (pillTapOpens) {
                    openSelf();
                    removePill();
                    return;
                }
                stopRequested = true;
                if (pillText != null) pillText.setText("Stopped");
                scheduleHide(1200);
            }
        });
    }

    private WindowManager.LayoutParams pillParams(int type) {
        WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        );
        lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
        lp.y = dp(44);
        return lp;
    }

    private void scheduleHide(long ms) {
        if (hideTask != null) main.removeCallbacks(hideTask);
        hideTask = new Runnable() {
            @Override
            public void run() {
                removePill();
            }
        };
        main.postDelayed(hideTask, ms);
    }

    private void removePill() {
        try {
            if (pillAttached && wm != null && pill != null) wm.removeView(pill);
        } catch (Exception e) {
            // ignore
        }
        pillAttached = false;
    }

    // runs on the main thread; returns "" on success, else the error text
    private String doShowPill(String text, long ttl, boolean tapOpens) {
        try {
            if (wm == null) wm = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
            if (pill == null) {
                try {
                    buildPill();
                } catch (Exception e) {
                    pill = null;
                    pillText = null;
                    return "build: " + e;
                }
            }
            pillTapOpens = tapOpens;
            stopIcon.setVisibility(tapOpens ? View.GONE : View.VISIBLE);
            pillText.setText(text);
            if (!pillAttached) {
                String err = "";
                boolean ok = false;
                if (Build.VERSION.SDK_INT >= 26 && Settings.canDrawOverlays(this)) {
                    try {
                        wm.addView(pill, pillParams(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY));
                        ok = true;
                        lastPillType = "app_overlay";
                    } catch (Exception e) {
                        err = "app overlay: " + e;
                    }
                }
                if (!ok) {
                    try {
                        wm.addView(pill, pillParams(WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY));
                        ok = true;
                        lastPillType = "a11y_overlay";
                    } catch (Exception e) {
                        return err + " | a11y overlay: " + e;
                    }
                }
                pillAttached = true;
            }
            scheduleHide(ttl > 0 ? ttl : 8000);
            return "";
        } catch (Exception e) {
            return String.valueOf(e);
        }
    }

    // called from a plugin thread; waits briefly for the main thread so errors can be reported
    public String showPillSync(final String text, final long ttl, final boolean tapOpens) {
        final String[] res = { "" };
        final CountDownLatch latch = new CountDownLatch(1);
        main.post(new Runnable() {
            @Override
            public void run() {
                res[0] = doShowPill(text, ttl, tapOpens);
                latch.countDown();
            }
        });
        try {
            if (!latch.await(800, TimeUnit.MILLISECONDS)) return "main thread busy";
        } catch (InterruptedException e) {
            return "interrupted";
        }
        return res[0];
    }

    public boolean openSelf() {
        try {
            Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (i == null) return false;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public void hideDonePill() {
        main.post(new Runnable() {
            @Override
            public void run() {
                if (pillTapOpens) removePill();
            }
        });
    }
}
