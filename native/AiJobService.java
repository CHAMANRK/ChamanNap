package com.chaman.nap;

import android.app.job.JobParameters;
import android.app.job.JobService;
import android.os.PersistableBundle;

/** Step24: runs the AI request for a schedule when the system says internet is there (see NotifyAi). */
public class AiJobService extends JobService {
    @Override
    public boolean onStartJob(final JobParameters params) {
        final PersistableBundle b = params.getExtras();
        final String id = b.getString("id", "");
        final long due = b.getLong("due", 0L);
        final String title = b.getString("title", "Chaman");
        final String prompt = b.getString("prompt", "");
        new Thread(new Runnable() {
            @Override
            public void run() {
                int r = 0;
                try {
                    r = NotifyAi.run(getApplicationContext(), id, due, title, prompt);
                } catch (Throwable ignored) {
                }
                jobFinished(params, r == 1);
            }
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true; // the system stopped it (network lost, time): run it again later
    }
}
