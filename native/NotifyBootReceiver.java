package com.chaman.nap;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** System broadcasts only (boot, app update, clock or time zone change): put the alarms back. Other actions are ignored. */
public class NotifyBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String a = intent.getAction();
        if (!(Intent.ACTION_BOOT_COMPLETED.equals(a)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)
                || Intent.ACTION_TIME_CHANGED.equals(a)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(a))) return;
        final PendingResult pr = goAsync();
        final Context app = context.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    NotifyCore.rearmAll(app);
                } finally {
                    pr.finish();
                }
            }
        }).start();
    }
}
