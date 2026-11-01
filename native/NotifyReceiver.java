package com.chaman.nap;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fired by AlarmManager (explicit intent, not exported). */
public class NotifyReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !NotifyCore.ACT_FIRE.equals(intent.getAction())) return;
        String id = intent.getStringExtra("id");
        if (id == null || id.isEmpty()) return;
        final PendingResult pr = goAsync();
        final Context app = context.getApplicationContext();
        final String fid = id;
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    NotifyCore.fire(app, fid);
                } finally {
                    pr.finish();
                }
            }
        }).start();
    }
}
