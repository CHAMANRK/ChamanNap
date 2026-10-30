package com.chaman.nap;

import android.accessibilityservice.AccessibilityService;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
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
import android.view.accessibility.AccessibilityWindowInfo;
import android.widget.FrameLayout;
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
    public static volatile boolean userDone = false;
    public static volatile int actCount = 0;

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

    // Counts the user's own interactions (taps, focus, typing) outside Chaman; used by ask_user.
    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        int t = event.getEventType();
        if (
            t == AccessibilityEvent.TYPE_VIEW_CLICKED
                || t == AccessibilityEvent.TYPE_VIEW_FOCUSED
                || t == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED
                || t == AccessibilityEvent.TYPE_TOUCH_INTERACTION_END
        ) {
            CharSequence pkg = event.getPackageName();
            if (pkg == null || !getPackageName().contentEquals(pkg)) actCount++;
        }
    }

    public boolean keyboardVisible() {
        try {
            List<AccessibilityWindowInfo> ws = getWindows();
            if (ws == null) return false;
            for (AccessibilityWindowInfo w : ws) {
                if (w.getType() == AccessibilityWindowInfo.TYPE_INPUT_METHOD) return true;
            }
        } catch (Exception e) {
            // ignore
        }
        return false;
    }

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
    // modes: 0 = old pill (background, one line), 1 = ask (no background, text beside a dot), 2 = done (tap to open Chaman),
    // 3 = status line (no background, dot + one rolling line + arrow; tap the text = list of steps)
    // dot states: run = orange, ok = green, fail = red, wait = orange pulsing
    private static final int C_ORANGE = 0xFFD98A3D;
    private static final int C_GREEN = 0xFF8DBF9C;
    private static final int C_RED = 0xFFD4645C;

    private int pillMode = 0;
    private int pillWinType = 0;
    private boolean lineActive = false;
    private boolean listOpen = false;
    private String lineText = "";
    private String lineState = "run";
    private final List<String[]> lineItems = new ArrayList<>();
    private LinearLayout listWin;
    private boolean listAttached = false;
    private View arrowView;
    private Runnable collapseTask;
    private View dotBox;
    private View dotView;
    private GradientDrawable dotDraw;
    private GradientDrawable pillBg;
    private ObjectAnimator pulse;
    private volatile String lastPillType = "";

    public String lastPillType() {
        return lastPillType;
    }

    private void buildPill() {
        Context c = this;
        pill = new LinearLayout(c);
        pill.setOrientation(LinearLayout.HORIZONTAL);
        pill.setGravity(Gravity.CENTER_VERTICAL);

        pillBg = new GradientDrawable();
        pillBg.setColor(0xF01E2A24);
        pillBg.setCornerRadius(dp(24));
        pillBg.setStroke(dp(1), 0xFF3F5E4C);

        FrameLayout box = new FrameLayout(c);
        dotView = new View(c);
        dotDraw = new GradientDrawable();
        dotDraw.setShape(GradientDrawable.OVAL);
        dotDraw.setColor(C_ORANGE);
        dotView.setBackground(dotDraw);
        FrameLayout.LayoutParams dlp = new FrameLayout.LayoutParams(dp(10), dp(10));
        dlp.gravity = Gravity.CENTER;
        box.addView(dotView, dlp);
        dotBox = box;
        pill.addView(box, new LinearLayout.LayoutParams(dp(34), dp(34)));

        pillText = new TextView(c);
        pillText.setEllipsize(TextUtils.TruncateAt.END);
        pill.addView(pillText, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ArrowView arrow = new ArrowView(c);
        arrow.setVisibility(View.GONE);
        pill.addView(arrow, new LinearLayout.LayoutParams(dp(28), dp(34)));
        arrowView = arrow;
        pill.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);

        // tap the text (or the arrow) = open / close the list of steps (status line only)
        View.OnClickListener toggle = new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (pillMode == 2) {
                    openSelf();
                    removePill();
                    return;
                }
                if (pillMode != 3 || lineItems.isEmpty()) return;
                listOpen = !listOpen;
                refreshList(true);
            }
        };
        pillText.setOnClickListener(toggle);
        arrow.setOnClickListener(toggle);

        // tap the dot while Chaman is waiting for you = "done"
        box.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (pillMode == 1) userDone = true;
            }
        });
        // long-press the dot = stop the agent
        box.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                stopRequested = true;
                if (pillText != null) pillText.setText("Stopped");
                setDot("fail");
                scheduleHide(1200);
                return true;
            }
        });
        pill.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (pillMode == 2) {
                    openSelf();
                    removePill();
                }
            }
        });
    }

    private void setDot(String state) {
        int col = "ok".equals(state) ? C_GREEN : ("fail".equals(state) ? C_RED : C_ORANGE);
        dotDraw.setColor(col);
        if (pulse != null) {
            pulse.cancel();
            pulse = null;
        }
        dotView.setAlpha(1f);
        if ("wait".equals(state)) {
            pulse = ObjectAnimator.ofFloat(dotView, "alpha", 1f, 0.3f);
            pulse.setDuration(650);
            pulse.setRepeatCount(ValueAnimator.INFINITE);
            pulse.setRepeatMode(ValueAnimator.REVERSE);
            pulse.start();
        }
    }

    private void applyMode(int mode) {
        pillMode = mode;
        int w = getResources().getDisplayMetrics().widthPixels;
        if (mode == 1) {
            pill.setBackground(null);
            pill.setPadding(dp(4), dp(2), dp(8), dp(2));
            pillText.setSingleLine(false);
            pillText.setMaxLines(3);
            pillText.setTextColor(0xFFFFFFFF);
            pillText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
            pillText.setShadowLayer(dp(3), 0, dp(1), 0xFF000000);
            pillText.setMaxWidth((int) (w * 0.78f));
            pillText.setMinWidth(0);
        } else if (mode == 3) {
            int tw = (int) (w * 0.76f) - dp(34) - dp(28) - dp(12);
            pill.setBackground(null);
            pill.setPadding(dp(4), dp(2), dp(8), dp(2));
            pillText.setSingleLine(true);
            pillText.setTextColor(0xFFFFFFFF);
            pillText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            pillText.setShadowLayer(dp(3), 0, dp(1), 0xFF000000);
            pillText.setMinWidth(tw);
            pillText.setMaxWidth(tw);
        } else {
            pill.setBackground(pillBg);
            pill.setPadding(dp(8), dp(4), dp(16), dp(4));
            pillText.setSingleLine(true);
            pillText.setTextColor(0xFFE6EFE8);
            pillText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            pillText.setShadowLayer(0, 0, 0, 0);
            pillText.setMaxWidth((int) (w * 0.66f));
            pillText.setMinWidth(0);
        }
        pillText.setEllipsize(TextUtils.TruncateAt.END);
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
                if (pillMode == 3) {
                    lineActive = false;
                    listOpen = false;
                }
                removePill();
            }
        };
        main.postDelayed(hideTask, ms);
    }

    private void removePill() {
        hideList();
        try {
            if (pulse != null) {
                pulse.cancel();
                pulse = null;
            }
            if (pillAttached && wm != null && pill != null) wm.removeView(pill);
        } catch (Exception e) {
            // ignore
        }
        pillAttached = false;
    }

    // runs on the main thread; returns "" on success, else the error text
    private String doShowPill(String text, long ttl, int mode, String state) {
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
            if (mode == 3 && !lineActive) lineItems.clear();
            applyMode(mode);
            setDot(state);
            pillText.animate().cancel();
            pillText.setTranslationY(0f);
            pillText.setAlpha(1f);
            if (arrowView != null) {
                arrowView.setVisibility(mode == 3 ? (lineItems.isEmpty() ? View.INVISIBLE : View.VISIBLE) : View.GONE);
                arrowView.setRotation(listOpen ? 90f : 0f);
            }
            if (mode == 3) {
                rollText(text);
            } else {
                pillText.setText(text);
                hideList();
            }
            if (!pillAttached) {
                String err = "";
                boolean ok = false;
                if (Build.VERSION.SDK_INT >= 26 && Settings.canDrawOverlays(this)) {
                    try {
                        wm.addView(pill, pillParams(WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY));
                        ok = true;
                        pillWinType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
                        lastPillType = "app_overlay";
                    } catch (Exception e) {
                        err = "app overlay: " + e;
                    }
                }
                if (!ok) {
                    try {
                        wm.addView(pill, pillParams(WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY));
                        ok = true;
                        pillWinType = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY;
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
    public String showPillSync(final String text, final long ttl, final int mode, final String state) {
        final String[] res = { "" };
        final CountDownLatch latch = new CountDownLatch(1);
        main.post(new Runnable() {
            @Override
            public void run() {
                res[0] = doShowPill(text, ttl, mode, state);
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

    // ---------- status line (step18) ----------
    // The app sends the whole line each time: text, dot state and the list of steps. Nothing here is written by the AI.
    // The line is shown only while Chaman is NOT on screen (inside Chaman the chat draws the same line).

    private class ArrowView extends View {
        private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Path path = new Path();

        ArrowView(Context c) {
            super(c);
            p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(dp(2));
            p.setStrokeCap(Paint.Cap.ROUND);
            p.setStrokeJoin(Paint.Join.ROUND);
            p.setColor(0xFFFFFFFF);
            p.setShadowLayer(dp(3), 0, dp(1), 0xFF000000);
            setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float w = getWidth();
            float h = getHeight();
            path.reset();
            path.moveTo(w * 0.40f, h * 0.32f);
            path.lineTo(w * 0.62f, h * 0.50f);
            path.lineTo(w * 0.40f, h * 0.68f);
            canvas.drawPath(path, p);
        }
    }

    // new text rolls in from below (the system "remove animations" setting turns this off by itself)
    private void rollText(String t) {
        if (pillText == null) return;
        CharSequence cur = pillText.getText();
        if (cur != null && cur.toString().equals(t)) return;
        pillText.setText(t);
        pillText.setTranslationY(dp(8));
        pillText.setAlpha(0f);
        pillText.animate().translationY(0f).alpha(1f).setDuration(180).start();
    }

    private void hideList() {
        if (collapseTask != null) {
            main.removeCallbacks(collapseTask);
            collapseTask = null;
        }
        try {
            if (listAttached && wm != null && listWin != null) wm.removeView(listWin);
        } catch (Exception e) {
            // ignore
        }
        listAttached = false;
    }

    private void buildList() {
        if (listWin == null) {
            listWin = new LinearLayout(this);
            listWin.setOrientation(LinearLayout.VERTICAL);
            listWin.setPadding(dp(14), dp(2), dp(8), dp(2));
            listWin.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        }
        listWin.removeAllViews();
        int from = Math.max(0, lineItems.size() - 6);
        for (int i = from; i < lineItems.size(); i++) {
            String[] it = lineItems.get(i);
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            View d = new View(this);
            GradientDrawable g = new GradientDrawable();
            g.setShape(GradientDrawable.OVAL);
            g.setColor("ok".equals(it[1]) ? C_GREEN : ("fail".equals(it[1]) ? C_RED : C_ORANGE));
            d.setBackground(g);
            LinearLayout.LayoutParams dl = new LinearLayout.LayoutParams(dp(7), dp(7));
            dl.rightMargin = dp(8);
            row.addView(d, dl);
            TextView t = new TextView(this);
            t.setText(it[0]);
            t.setSingleLine(true);
            t.setEllipsize(TextUtils.TruncateAt.END);
            t.setTextColor(0xFFFFFFFF);
            t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
            t.setShadowLayer(dp(3), 0, dp(1), 0xFF000000);
            row.addView(t, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            listWin.addView(row, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            if (it[2] != null && it[2].length() > 0) {
                TextView r = new TextView(this);
                r.setText(it[2]);
                r.setSingleLine(true);
                r.setEllipsize(TextUtils.TruncateAt.END);
                r.setTextColor(0xB3FFFFFF);
                r.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11.5f);
                r.setShadowLayer(dp(3), 0, dp(1), 0xFF000000);
                r.setPadding(dp(15), 0, 0, dp(3));
                listWin.addView(r, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            }
        }
    }

    // The list is a second window that cannot be touched, so taps meant for the app under it go through.
    // It closes by itself 6 seconds after the user opened it.
    private void refreshList(boolean byTap) {
        if (arrowView != null) arrowView.animate().rotation(listOpen ? 90f : 0f).setDuration(160).start();
        if (!listOpen || lineItems.isEmpty() || pillMode != 3 || !pillAttached || pillWinType == 0) {
            hideList();
            return;
        }
        buildList();
        if (!listAttached) {
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                (int) (getResources().getDisplayMetrics().widthPixels * 0.76f),
                WindowManager.LayoutParams.WRAP_CONTENT,
                pillWinType,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                    | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            );
            lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
            lp.y = dp(44) + dp(36);
            try {
                wm.addView(listWin, lp);
                listAttached = true;
            } catch (Exception e) {
                listAttached = false;
            }
        }
        if (byTap) {
            if (collapseTask != null) main.removeCallbacks(collapseTask);
            collapseTask = new Runnable() {
                @Override
                public void run() {
                    listOpen = false;
                    refreshList(false);
                }
            };
            main.postDelayed(collapseTask, 6000);
        }
    }

    private String renderLine(boolean fromJs) {
        if (!lineActive) return "";
        if (!fromJs && pillAttached && pillMode != 3) return "";
        if (ScreenControlPlugin.isAppVisible()) {
            if (pillAttached && pillMode == 3) removePill();
            return "";
        }
        String err = doShowPill(lineText, 150000, 3, lineState);
        if (err.isEmpty() && listOpen) refreshList(false);
        return err;
    }

    private String doLine(String text, String state, String itemsJson) {
        lineActive = true;
        lineText = text == null ? "" : text;
        lineState = state == null ? "run" : state;
        lineItems.clear();
        try {
            JSONArray arr = new JSONArray(itemsJson == null ? "[]" : itemsJson);
            for (int i = 0; i < arr.length(); i++) {
                JSONArray a = arr.optJSONArray(i);
                if (a != null) lineItems.add(new String[] { a.optString(0, ""), a.optString(1, "run"), a.optString(2, "") });
            }
        } catch (Exception e) {
            // bad items: show the line without the list
        }
        return renderLine(true);
    }

    // called from a plugin thread, same pattern as showPillSync
    public String lineSync(final String text, final String state, final String itemsJson) {
        final String[] res = { "" };
        final CountDownLatch latch = new CountDownLatch(1);
        main.post(new Runnable() {
            @Override
            public void run() {
                res[0] = doLine(text, state, itemsJson);
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

    // the answer is ready (or the turn failed): the line goes away
    public void lineOff() {
        main.post(new Runnable() {
            @Override
            public void run() {
                lineActive = false;
                listOpen = false;
                lineItems.clear();
                if (pillAttached && pillMode == 3) removePill();
            }
        });
    }

    // Chaman came to the front (chat shows the line) or went to the back (overlay shows it)
    public void lineVisibilityChanged() {
        main.post(new Runnable() {
            @Override
            public void run() {
                if (lineActive) renderLine(false);
            }
        });
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
                if (pillMode == 2) removePill();
            }
        });
    }
}
