package io.github.hugoburnet.justread;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import org.json.JSONTokener;

/**
 * Loads a page in a real WebView, which runs the scripts of an anti-bot check (Cloudflare's
 * "Just a moment...") the way a browser does, and hands back the page it let through, with
 * the cookies and the User-Agent that earned it. The WebView is shown, in front of the app, so
 * that a check which needs a tap can be answered; it closes by itself once the page is there.
 */
@CapacitorPlugin(name = "PageFetcher")
public class PageFetcherPlugin extends Plugin {

    @PluginMethod
    public void fetch(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("An https address is needed.");
            return;
        }
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("The app is not on screen.");
            return;
        }
        final int timeoutMs = call.getInt("timeoutMs", 90000);
        final int settleMs = call.getInt("settleMs", 0);
        final boolean scroll = call.getBoolean("scroll", false);
        final String status = call.getString("statusLabel", "Checking the site…");
        final String cancel = call.getString("cancelLabel", "Cancel");
        activity.runOnUiThread(() -> new Session(activity, call, url, timeoutMs, settleMs, scroll, status, cancel).start());
    }

    /** One page, from the first request to the answer. Everything here runs on the UI thread. */
    private static final class Session {

        // The check's own page carries a script from /cdn-cgi/challenge-platform/.../orchestrate: while it is
        // there, the page is still the check, whatever its title says in the visitor's language.
        private static final String STATE =
            "(function(){return JSON.stringify({running:!!document.querySelector("
                + "'script[src*=\"/cdn-cgi/challenge-platform/\"][src*=\"orchestrate\"],#challenge-error-text,#cf-challenge-running'),"
                + "ready:document.readyState});})()";
        private static final long POLL_MS = 600;
        private static final long SETTLE_STEP_MS = 700;

        private final Activity activity;
        private final PluginCall call;
        private final String url;
        private final long timeoutMs;
        private final long settleMs;
        private final boolean scroll;
        private final String statusLabel;
        private final String cancelLabel;
        private final Handler handler = new Handler(Looper.getMainLooper());
        private Dialog dialog;
        private WebView web;
        private boolean loaded = false;
        private boolean finished = false;
        private long startedAt;

        Session(Activity activity, PluginCall call, String url, long timeoutMs, long settleMs, boolean scroll, String statusLabel, String cancelLabel) {
            this.activity = activity;
            this.call = call;
            this.url = url;
            this.timeoutMs = timeoutMs;
            this.settleMs = settleMs;
            this.scroll = scroll;
            this.statusLabel = statusLabel;
            this.cancelLabel = cancelLabel;
        }

        void start() {
            web = new WebView(activity);
            WebSettings settings = web.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            CookieManager cookies = CookieManager.getInstance();
            cookies.setAcceptCookie(true);
            cookies.setAcceptThirdPartyCookies(web, true);
            web.setWebViewClient(
                new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String finishedUrl) {
                        loaded = true;
                    }
                }
            );

            TextView label = new TextView(activity);
            label.setText(statusLabel);
            label.setTextColor(Color.WHITE);
            label.setTextSize(16);
            Button cancel = new Button(activity);
            cancel.setText(cancelLabel);
            cancel.setOnClickListener(view -> finish(null, "Cancelled."));
            LinearLayout bar = new LinearLayout(activity);
            bar.setGravity(Gravity.CENTER_VERTICAL);
            bar.setPadding(32, 16, 16, 16);
            bar.addView(label, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            bar.addView(cancel);

            LinearLayout root = new LinearLayout(activity);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setBackgroundColor(Color.parseColor("#0f1015"));
            root.addView(bar);
            root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
            // The bars of the system are drawn over the dialog on recent Android: keep clear of them.
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
                return insets;
            });

            dialog = new Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
            dialog.setContentView(root);
            dialog.setOnCancelListener(shown -> finish(null, "Cancelled."));
            dialog.show();

            startedAt = SystemClock.elapsedRealtime();
            web.loadUrl(url);
            handler.postDelayed(poll, POLL_MS);
        }

        private final Runnable poll = new Runnable() {
            @Override
            public void run() {
                if (finished) return;
                if (SystemClock.elapsedRealtime() - startedAt > timeoutMs) {
                    finish(null, "The site did not let the page through in time.");
                    return;
                }
                if (!loaded) {
                    handler.postDelayed(this, POLL_MS);
                    return;
                }
                web.evaluateJavascript(STATE, value -> {
                    if (finished) return;
                    try {
                        JSONObject state = new JSONObject((String) new JSONTokener(value).nextValue());
                        if (!state.optBoolean("running", true) && "complete".equals(state.optString("ready"))) {
                            settle();
                            return;
                        }
                    } catch (Exception notReadyYet) {
                        // A page that is not there yet answers null: ask again.
                    }
                    handler.postDelayed(poll, POLL_MS);
                });
            }
        };

        // A page that builds itself with scripts, or loads its pictures as they come into view, is given
        // a few seconds (and scrolled to the bottom meanwhile) before it is read.
        private void settle() {
            final long until = SystemClock.elapsedRealtime() + settleMs;
            handler.post(
                new Runnable() {
                    @Override
                    public void run() {
                        if (finished) return;
                        if (scroll) {
                            web.evaluateJavascript(
                                "window.scrollTo(0,Math.max(document.body?document.body.scrollHeight:0,document.documentElement.scrollHeight))",
                                null
                            );
                        }
                        if (SystemClock.elapsedRealtime() >= until) {
                            collect();
                            return;
                        }
                        handler.postDelayed(this, SETTLE_STEP_MS);
                    }
                }
            );
        }

        private void collect() {
            web.evaluateJavascript("document.documentElement.outerHTML", value -> {
                if (finished) return;
                try {
                    String html = (String) new JSONTokener(value).nextValue();
                    String current = web.getUrl();
                    String cookies = CookieManager.getInstance().getCookie(current);
                    JSObject result = new JSObject();
                    result.put("html", html);
                    result.put("url", current);
                    result.put("userAgent", web.getSettings().getUserAgentString());
                    result.put("cookies", cookies == null ? "" : cookies);
                    finish(result, null);
                } catch (Exception failure) {
                    finish(null, "The page could not be read: " + failure.getMessage());
                }
            });
        }

        private void finish(JSObject result, String error) {
            if (finished) return;
            finished = true;
            handler.removeCallbacksAndMessages(null);
            if (dialog != null) {
                dialog.setOnCancelListener(null);
                dialog.dismiss();
            }
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.stopLoading();
            web.destroy();
            if (result != null) call.resolve(result);
            else call.reject(error);
        }
    }
}
