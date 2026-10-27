package com.chaman.nap;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

// Receives the result Termux sends back through the PendingIntent.
public class TermuxResultReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra("cid", -1);
        Bundle b = intent.getBundleExtra("result");
        if (b == null && intent.getExtras() != null) {
            for (String k : intent.getExtras().keySet()) {
                Object v = intent.getExtras().get(k);
                if (v instanceof Bundle && (((Bundle) v).containsKey("exitCode") || ((Bundle) v).containsKey("stdout"))) {
                    b = (Bundle) v;
                    break;
                }
            }
        }
        TermuxPlugin.deliver(id, b);
    }
}
