package com.chaman.nap;

import android.animation.ValueAnimator;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.provider.Settings;
import android.text.Editable;
import android.text.InputType;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.text.method.ScrollingMovementMethod;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * step26: floating mini Chaman.
 * A small, soft, draggable icon that stays over other apps while Chaman itself is not on screen. Tap it = a compact panel
 * (type a message, see the answer, Allow / Cancel on a confirm card). After 5 seconds without any touch or news the panel
 * disappears and the icon fades to 25%.
 * The panel never talks to the AI itself: what Najeef types goes to the app's JS as an event (poll with ScreenControl.bubblePoll),
 * and the JS runs the normal send path. Status line text, the answer and the confirm card come from the JS the same way.
 * All view work happens on the main thread.
 */
final class ChamanBubble {
    // true while Najeef has it on in Settings AND the app's JS is alive in this process (JS sets it, plugin destroy clears it)
    static volatile boolean active = false;

    private static final ArrayList<String> EVENTS = new ArrayList<>();

    static void pushEvent(JSONObject o) {
        synchronized (EVENTS) {
            if (EVENTS.size() < 50) EVENTS.add(o.toString());
        }
    }

    static JSONArray drainEvents() {
        JSONArray a = new JSONArray();
        synchronized (EVENTS) {
            for (String s : EVENTS) a.put(s);
            EVENTS.clear();
        }
        return a;
    }

    private static final int ICON_DP = 36;
    private static final int IDLE_MS = 5000;
    private static final int CARD_MS = 180000;
    private static final float A_ON = 0.8f;
    private static final float A_DIM = 0.25f;
    private static final int C_ORANGE = 0xFFD98A3D;
    private static final int C_GREEN = 0xFF8DBF9C;
    private static final int C_RED = 0xFFD4645C;
    private static final int C_MOSS = 0xFF4E6B58;
    private static final int C_TEXT = 0xFFE6EFE8;

    private final ChamanAccessibilityService svc;
    private final Handler main;
    private final SharedPreferences prefs;
    private final WindowManager wm;

    // icon
    private FrameLayout icon;
    private TextView iconLetter;
    private GradientDrawable iconBg;
    private GradientDrawable iconDotDraw;
    private WindowManager.LayoutParams iconLp;
    private boolean iconAttached = false;
    private int curType = 0;
    private float downX;
    private float downY;
    private int startX;
    private int startY;
    private boolean dragging = false;

    // panel
    private LinearLayout panel;
    private WindowManager.LayoutParams panelLp;
    private boolean panelAttached = false;
    private boolean panelFocusable = false;
    private GradientDrawable headDotDraw;
    private TextView statusView;
    private TextView answerView;
    private LinearLayout cardBox;
    private TextView cardTitle;
    private TextView cardBody;
    private LinearLayout cardBtns;
    private EditText input;
    private TextView sendBtn;

    // state
    private boolean busy = false;
    private String stText = "";
    private String stState = "ok";
    private String answer = "";
    private boolean cardOn = false;
    private int cardM = -1;
    private String cardTitleText = "";
    private String cardBodyText = "";
    private final List<String[]> cardButtons = new ArrayList<>();
    private Runnable idleTask;
    private Runnable cardTask;

    ChamanBubble(ChamanAccessibilityService svc, Handler main) {
        this.svc = svc;
        this.main = main;
        this.prefs = svc.getSharedPreferences("chaman_bubble", Context.MODE_PRIVATE);
        this.wm = (WindowManager) svc.getSystemService(Context.WINDOW_SERVICE);
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, svc.getResources().getDisplayMetrics());
    }

    private int screenW() {
        return svc.getResources().getDisplayMetrics().widthPixels;
    }

    private int screenH() {
        return svc.getResources().getDisplayMetrics().heightPixels;
    }

    private int stateColor(String s) {
        if ("ok".equals(s)) return C_GREEN;
        if ("fail".equals(s)) return C_RED;
        return C_ORANGE;
    }

    private boolean wantVisible() {
        return active && !ScreenControlPlugin.isAppVisible();
    }

    // ---------- public entry points (any thread) ----------

    // Chaman came to the front / went to the back / the switch changed
    void refresh() {
        main.post(new Runnable() {
            @Override
            public void run() {
                doRefresh();
            }
        });
    }

    void destroy() {
        main.post(new Runnable() {
            @Override
            public void run() {
                cancelIdle();
                cancelCardTimer();
                hidePanel();
                removeIcon();
            }
        });
    }

    // the status line (same text and dot state the chat shows)
    void setStatus(final String text, final String state) {
        main.post(new Runnable() {
            @Override
            public void run() {
                busy = true;
                stText = text == null ? "" : text;
                stState = state == null ? "run" : state;
                paint();
                if (iconAttached) wake();
            }
        });
    }

    // the turn is over, the line goes away
    void statusEnd() {
        main.post(new Runnable() {
            @Override
            public void run() {
                busy = false;
                stText = "";
                stState = "ok";
                paint();
                if (iconAttached) scheduleIdle(IDLE_MS);
            }
        });
    }

    // the answer of the last turn; open = show the panel for it (turn started from the panel)
    void setAnswer(final String text, final boolean open, final boolean fail) {
        main.post(new Runnable() {
            @Override
            public void run() {
                answer = text == null ? "" : text;
                if (fail) stState = "fail";
                if (open && iconAttached && answer.length() > 0) showPanel();
                paint();
                if (iconAttached) {
                    wake();
                    if (open) scheduleIdle(IDLE_MS + Math.min(7000, answer.length() * 30));
                }
            }
        });
    }

    // confirm card: json {title, body, m, btns:[{l, o}]}; empty/null = remove it
    void setCard(final String json) {
        main.post(new Runnable() {
            @Override
            public void run() {
                doCard(json);
            }
        });
    }

    // ---------- main-thread work ----------

    private void doRefresh() {
        if (wantVisible()) {
            showIcon();
            if (iconAttached && cardOn) showPanel();
        } else {
            cancelIdle();
            hidePanel();
            removeIcon();
        }
    }

    private void doCard(String json) {
        cancelCardTimer();
        if (json == null || json.length() == 0) {
            if (cardOn) {
                cardOn = false;
                paint();
                if (iconAttached) scheduleIdle(IDLE_MS);
            }
            return;
        }
        try {
            JSONObject o = new JSONObject(json);
            cardTitleText = o.optString("title", "");
            cardBodyText = o.optString("body", "");
            cardM = o.optInt("m", -1);
            cardButtons.clear();
            JSONArray bs = o.optJSONArray("btns");
            if (bs != null) {
                for (int i = 0; i < bs.length(); i++) {
                    JSONObject b = bs.optJSONObject(i);
                    if (b != null) cardButtons.add(new String[] { b.optString("l", ""), b.optString("o", "x") });
                }
            }
            if (cardButtons.isEmpty()) return;
            cardOn = true;
            if (iconAttached) {
                showPanel();
                wake();
                cancelIdle();
            }
            paint();
            cardTask = new Runnable() {
                @Override
                public void run() {
                    cardTask = null;
                    cardOn = false;
                    paint();
                    if (iconAttached) scheduleIdle(IDLE_MS);
                }
            };
            main.postDelayed(cardTask, CARD_MS);
        } catch (Exception e) {
            cardOn = false;
        }
    }

    private void cancelCardTimer() {
        if (cardTask != null) main.removeCallbacks(cardTask);
        cardTask = null;
    }

    private void cancelIdle() {
        if (idleTask != null) main.removeCallbacks(idleTask);
        idleTask = null;
    }

    private void scheduleIdle(int ms) {
        cancelIdle();
        idleTask = new Runnable() {
            @Override
            public void run() {
                idleTask = null;
                onIdle();
            }
        };
        main.postDelayed(idleTask, ms);
    }

    // brighten the icon and start the 5 second idle timer again
    private void wake() {
        if (icon != null) {
            icon.animate().cancel();
            icon.setAlpha(A_ON);
        }
        if (!cardOn) scheduleIdle(IDLE_MS);
    }

    private void onIdle() {
        if (!iconAttached) return;
        if (cardOn) return; // waiting for Allow / Cancel
        if (panelAttached && input != null && input.getText().length() > 0 && input.hasFocus()) {
            scheduleIdle(IDLE_MS); // still typing
            return;
        }
        hidePanel();
        if (icon != null) icon.animate().alpha(A_DIM).setDuration(300).start();
    }

    // ---------- icon ----------

    private int addType() {
        if (Build.VERSION.SDK_INT >= 26 && Settings.canDrawOverlays(svc)) return WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        return WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY;
    }

    private boolean addWin(View v, WindowManager.LayoutParams lp) {
        lp.type = addType();
        try {
            wm.addView(v, lp);
            curType = lp.type;
            return true;
        } catch (Exception e) {
            // app overlay refused: try the accessibility overlay
        }
        if (lp.type == WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY) return false;
        lp.type = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY;
        try {
            wm.addView(v, lp);
            curType = lp.type;
            return true;
        } catch (Exception e2) {
            return false;
        }
    }

    private void buildIcon() {
        icon = new FrameLayout(svc);
        iconBg = new GradientDrawable();
        iconBg.setShape(GradientDrawable.OVAL);
        iconBg.setColor(C_MOSS);
        iconBg.setStroke(dp(1), 0x66E6EFE8);
        icon.setBackground(iconBg);

        iconLetter = new TextView(svc);
        iconLetter.setText("C");
        iconLetter.setTextColor(C_TEXT);
        iconLetter.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        iconLetter.setTypeface(null, Typeface.BOLD);
        iconLetter.setGravity(Gravity.CENTER);
        icon.addView(iconLetter, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        View dot = new View(svc);
        iconDotDraw = new GradientDrawable();
        iconDotDraw.setShape(GradientDrawable.OVAL);
        iconDotDraw.setColor(C_GREEN);
        dot.setBackground(iconDotDraw);
        FrameLayout.LayoutParams dl = new FrameLayout.LayoutParams(dp(9), dp(9));
        dl.gravity = Gravity.BOTTOM | Gravity.END;
        dl.setMargins(0, 0, dp(2), dp(2));
        icon.addView(dot, dl);

        // the AI must never read or tap the bubble as if it were part of the screen
        icon.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);

        final int slop = ViewConfiguration.get(svc).getScaledTouchSlop();
        icon.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent ev) {
                switch (ev.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = ev.getRawX();
                        downY = ev.getRawY();
                        startX = iconLp.x;
                        startY = iconLp.y;
                        dragging = false;
                        wake();
                        return true;
                    case MotionEvent.ACTION_MOVE: {
                        float dx = ev.getRawX() - downX;
                        float dy = ev.getRawY() - downY;
                        if (!dragging && (Math.abs(dx) > slop || Math.abs(dy) > slop)) dragging = true;
                        if (dragging) {
                            int size = dp(ICON_DP);
                            iconLp.x = Math.max(0, Math.min(screenW() - size, startX + (int) dx));
                            iconLp.y = Math.max(0, Math.min(screenH() - size, startY + (int) dy));
                            try {
                                wm.updateViewLayout(icon, iconLp);
                            } catch (Exception e) {
                                // ignore
                            }
                        }
                        return true;
                    }
                    case MotionEvent.ACTION_UP:
                        if (dragging) snap();
                        else togglePanel();
                        dragging = false;
                        wake();
                        return true;
                    case MotionEvent.ACTION_CANCEL:
                        if (dragging) snap();
                        dragging = false;
                        return true;
                    default:
                        return true;
                }
            }
        });
    }

    private void showIcon() {
        if (iconAttached) return;
        try {
            if (icon == null) buildIcon();
            int size = dp(ICON_DP);
            int w = screenW();
            int h = screenH();
            int side = prefs.getInt("side", 0); // default: left edge
            float yf = prefs.getFloat("yf", 0.5f); // default: middle
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                size,
                size,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                    | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                PixelFormat.TRANSLUCENT
            );
            lp.gravity = Gravity.TOP | Gravity.START;
            lp.x = side == 1 ? w - size : 0;
            lp.y = Math.max(0, Math.min(h - size, (int) (yf * h) - size / 2));
            iconLp = lp;
            icon.setAlpha(A_ON);
            if (!addWin(icon, lp)) {
                iconAttached = false;
                return;
            }
            iconAttached = true;
            paint();
            wake();
        } catch (Exception e) {
            iconAttached = false;
        }
    }

    private void removeIcon() {
        if (!iconAttached) return;
        try {
            wm.removeView(icon);
        } catch (Exception e) {
            // ignore
        }
        iconAttached = false;
    }

    // after a drag: stick to the nearest side edge and remember the place
    private void snap() {
        int size = dp(ICON_DP);
        int w = screenW();
        int h = screenH();
        final boolean right = iconLp.x + size / 2 > w / 2;
        int from = iconLp.x;
        int to = right ? w - size : 0;
        ValueAnimator va = ValueAnimator.ofInt(from, to);
        va.setDuration(160);
        va.addUpdateListener(new ValueAnimator.AnimatorUpdateListener() {
            @Override
            public void onAnimationUpdate(ValueAnimator a) {
                if (!iconAttached) return;
                iconLp.x = (Integer) a.getAnimatedValue();
                try {
                    wm.updateViewLayout(icon, iconLp);
                } catch (Exception e) {
                    // ignore
                }
            }
        });
        va.start();
        prefs.edit().putInt("side", right ? 1 : 0).putFloat("yf", (iconLp.y + size / 2f) / h).apply();
    }

    private void togglePanel() {
        if (panelAttached) hidePanel();
        else showPanel();
    }

    // ---------- panel ----------

    private TextView label(float sp, int color) {
        TextView t = new TextView(svc);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        return t;
    }

    private GradientDrawable box(int color, int radiusDp, int strokeColor) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(dp(radiusDp));
        if (strokeColor != 0) g.setStroke(dp(1), strokeColor);
        return g;
    }

    private void buildPanel() {
        panel = new LinearLayout(svc);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackground(box(0xB31E2A24, 16, 0x553F5E4C));
        panel.setPadding(dp(12), dp(10), dp(12), dp(10));
        panel.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);

        // header: dot + status line + close
        LinearLayout head = new LinearLayout(svc);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);
        View hd = new View(svc);
        headDotDraw = new GradientDrawable();
        headDotDraw.setShape(GradientDrawable.OVAL);
        headDotDraw.setColor(C_GREEN);
        hd.setBackground(headDotDraw);
        head.addView(hd, new LinearLayout.LayoutParams(dp(8), dp(8)));
        statusView = label(12, 0xCCE6EFE8);
        statusView.setSingleLine(true);
        statusView.setEllipsize(TextUtils.TruncateAt.END);
        statusView.setPadding(dp(8), 0, dp(8), 0);
        head.addView(statusView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView close = label(12, 0x99E6EFE8);
        close.setText("Band");
        close.setPadding(dp(8), dp(2), 0, dp(2));
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                hidePanel();
                wake();
            }
        });
        head.addView(close, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        panel.addView(head, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        // answer (scrolls by dragging the text)
        answerView = label(13.5f, C_TEXT);
        answerView.setMaxLines(8);
        answerView.setMovementMethod(new ScrollingMovementMethod());
        answerView.setVerticalScrollBarEnabled(true);
        answerView.setVisibility(View.GONE);
        LinearLayout.LayoutParams al = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        al.topMargin = dp(6);
        panel.addView(answerView, al);

        // confirm card
        cardBox = new LinearLayout(svc);
        cardBox.setOrientation(LinearLayout.VERTICAL);
        cardBox.setBackground(box(0x26FFFFFF, 12, 0));
        cardBox.setPadding(dp(10), dp(8), dp(10), dp(8));
        cardBox.setVisibility(View.GONE);
        cardTitle = label(13.5f, C_TEXT);
        cardTitle.setTypeface(null, Typeface.BOLD);
        cardBox.addView(cardTitle, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        cardBody = label(12.5f, 0xE6E6EFE8);
        cardBody.setMaxLines(6);
        cardBody.setEllipsize(TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bl.topMargin = dp(4);
        cardBox.addView(cardBody, bl);
        cardBtns = new LinearLayout(svc);
        LinearLayout.LayoutParams cl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cl.topMargin = dp(8);
        cardBox.addView(cardBtns, cl);
        LinearLayout.LayoutParams cbl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cbl.topMargin = dp(8);
        panel.addView(cardBox, cbl);

        // input row
        LinearLayout row = new LinearLayout(svc);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        input = new EditText(svc);
        input.setHint("Chaman se bolo");
        input.setTextColor(C_TEXT);
        input.setHintTextColor(0x80E6EFE8);
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        input.setBackground(box(0x26FFFFFF, 12, 0));
        input.setPadding(dp(10), dp(7), dp(10), dp(7));
        input.setMaxLines(3);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent ev) {
                if (ev.getAction() == MotionEvent.ACTION_DOWN) {
                    setWinFocusable(true);
                    main.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            if (input == null || !panelAttached) return;
                            input.requestFocus();
                            InputMethodManager im = (InputMethodManager) svc.getSystemService(Context.INPUT_METHOD_SERVICE);
                            if (im != null) im.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT);
                        }
                    }, 120);
                }
                wake();
                return false;
            }
        });
        input.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int a, int b, int c) {}

            @Override
            public void onTextChanged(CharSequence s, int a, int b, int c) {
                wake();
            }

            @Override
            public void afterTextChanged(Editable s) {}
        });
        row.addView(input, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        sendBtn = label(13, C_TEXT);
        sendBtn.setText("Bhejo");
        sendBtn.setGravity(Gravity.CENTER);
        sendBtn.setBackground(box(0xCC4E6B58, 12, 0));
        sendBtn.setPadding(dp(12), dp(8), dp(12), dp(8));
        sendBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                onSend();
            }
        });
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        sl.leftMargin = dp(6);
        row.addView(sendBtn, sl);
        LinearLayout.LayoutParams rl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rl.topMargin = dp(8);
        panel.addView(row, rl);

        // when the panel loses the keyboard focus (Najeef touched the app behind), go back to a non-focusable window
        panel.getViewTreeObserver().addOnWindowFocusChangeListener(new ViewTreeObserver.OnWindowFocusChangeListener() {
            @Override
            public void onWindowFocusChanged(boolean hasFocus) {
                if (!hasFocus) setWinFocusable(false);
            }
        });
    }

    private void showPanel() {
        if (!iconAttached) return;
        try {
            if (panel == null) buildPanel();
            if (!panelAttached) {
                WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    (int) (screenW() * 0.92f),
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    curType != 0 ? curType : WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.TRANSLUCENT
                );
                lp.gravity = Gravity.TOP | Gravity.CENTER_HORIZONTAL;
                lp.y = dp(40);
                lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN;
                wm.addView(panel, lp);
                panelLp = lp;
                panelAttached = true;
                panelFocusable = false;
            }
            paint();
        } catch (Exception e) {
            panelAttached = false;
        }
    }

    private void hidePanel() {
        hideKeyboard();
        if (panelAttached) {
            try {
                wm.removeView(panel);
            } catch (Exception e) {
                // ignore
            }
        }
        panelAttached = false;
        panelFocusable = false;
    }

    private void hideKeyboard() {
        if (input == null) return;
        try {
            InputMethodManager im = (InputMethodManager) svc.getSystemService(Context.INPUT_METHOD_SERVICE);
            if (im != null && input.getWindowToken() != null) im.hideSoftInputFromWindow(input.getWindowToken(), 0);
            input.clearFocus();
        } catch (Exception e) {
            // ignore
        }
    }

    // the panel window is touch-only; it becomes focusable just while Najeef types
    private void setWinFocusable(boolean on) {
        if (!panelAttached || panelLp == null || panelFocusable == on) return;
        if (on) panelLp.flags &= ~WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        else panelLp.flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
        try {
            wm.updateViewLayout(panel, panelLp);
            panelFocusable = on;
        } catch (Exception e) {
            // ignore
        }
    }

    private void onSend() {
        if (busy) {
            JSONObject st = new JSONObject();
            try {
                st.put("type", "stop");
            } catch (Exception e) {
                // ignore
            }
            pushEvent(st);
            wake();
            return;
        }
        String t = input.getText().toString().trim();
        if (t.length() == 0) return;
        JSONObject o = new JSONObject();
        try {
            o.put("type", "send");
            o.put("text", t);
        } catch (Exception e) {
            return;
        }
        pushEvent(o);
        input.setText("");
        hideKeyboard();
        setWinFocusable(false);
        answer = "";
        busy = true;
        stText = "Message bhej raha hu";
        stState = "wait";
        paint();
        wake();
    }

    private void resolveCard(String o) {
        JSONObject e = new JSONObject();
        try {
            e.put("type", "confirm");
            e.put("m", cardM);
            e.put("o", o);
        } catch (Exception x) {
            return;
        }
        pushEvent(e);
        cancelCardTimer();
        cardOn = false;
        paint();
        wake();
    }

    // draws everything from the state fields (cheap, safe to call any time on the main thread)
    private void paint() {
        int col = stateColor(stState);
        if (iconDotDraw != null) iconDotDraw.setColor(col);
        if (panel == null || !panelAttached) return;
        headDotDraw.setColor(col);
        statusView.setText(stText.length() > 0 ? stText : (busy ? "" : "Taiyar"));
        sendBtn.setText(busy ? "Stop" : "Bhejo");
        if (answer.length() > 0) {
            answerView.setText(answer);
            answerView.setVisibility(View.VISIBLE);
        } else {
            answerView.setVisibility(View.GONE);
        }
        if (cardOn) {
            cardTitle.setText(cardTitleText);
            cardBody.setText(cardBodyText);
            cardBody.setVisibility(cardBodyText.length() > 0 ? View.VISIBLE : View.GONE);
            buildButtons();
            cardBox.setVisibility(View.VISIBLE);
        } else {
            cardBox.setVisibility(View.GONE);
        }
    }

    private void buildButtons() {
        cardBtns.removeAllViews();
        boolean stack = cardButtons.size() > 2;
        cardBtns.setOrientation(stack ? LinearLayout.VERTICAL : LinearLayout.HORIZONTAL);
        for (int i = 0; i < cardButtons.size(); i++) {
            final String[] b = cardButtons.get(i);
            boolean cancel = "x".equals(b[1]);
            TextView t = label(13, C_TEXT);
            t.setText(b[0]);
            t.setGravity(Gravity.CENTER);
            t.setSingleLine(true);
            t.setEllipsize(TextUtils.TruncateAt.END);
            t.setPadding(dp(10), dp(8), dp(10), dp(8));
            t.setBackground(cancel ? box(0x00000000, 12, 0x66E6EFE8) : box(0xCC4E6B58, 12, 0));
            t.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    resolveCard(b[1]);
                }
            });
            LinearLayout.LayoutParams lp = stack
                ? new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
                : new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            if (stack) lp.bottomMargin = dp(4);
            else lp.rightMargin = i < cardButtons.size() - 1 ? dp(6) : 0;
            cardBtns.addView(t, lp);
        }
    }
}
