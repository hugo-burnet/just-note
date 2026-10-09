package io.github.hugoburnet.justread;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

/**
 * Loads a page in a real WebView, which runs the scripts of an anti-bot check (Cloudflare's
 * "Just a moment...") the way a browser does, and hands back the page it let through, with
 * the cookies and the User-Agent that earned it. The WebView is shown, in front of the app, so
 * that a check which needs a tap can be answered; it closes by itself once the page is there.
 *
 * It can also run a script of the app's in the page (once the page is ready) that gives it the
 * pictures the page's own scripts built, which have no address to ask for. They stay here, and the
 * app takes them one at a time (picture) and says when it has them all (release): tens of
 * megabytes do not cross the bridge well in one answer.
 *
 * A failure carries a code: "cancelled", "timeout", "pictures" (the page was passed, its pictures
 * did not come) or "unreadable".
 */
@CapacitorPlugin(name = "PageFetcher")
public class PageFetcherPlugin extends Plugin {

    // The pictures a page built, as {type, base64}.
    private final List<String[]> captured = Collections.synchronizedList(new ArrayList<String[]>());

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
        final String startScript = call.getString("startScript");
        final String script = call.getString("script");
        activity.runOnUiThread(() -> new Session(activity, call, captured, url, timeoutMs, settleMs, scroll, startScript, script, status, cancel).start());
    }

    // What the WebViews of the app already hold for a site (the cookie of an earlier check, from this run or
    // another), with the User-Agent they present: asked without showing anything.
    @PluginMethod
    public void held(final PluginCall call) {
        final String url = call.getString("url");
        final Activity activity = getActivity();
        if (url == null || !url.startsWith("https://") || activity == null) {
            call.reject("An https address is needed.");
            return;
        }
        activity.runOnUiThread(() -> {
            String cookies = CookieManager.getInstance().getCookie(url);
            JSObject result = new JSObject();
            result.put("cookies", cookies == null ? "" : cookies);
            result.put("userAgent", WebSettings.getDefaultUserAgent(activity));
            call.resolve(result);
        });
    }

    @PluginMethod
    public void picture(PluginCall call) {
        final Integer index = call.getInt("index");
        String[] one = null;
        synchronized (captured) {
            if (index != null && index >= 0 && index < captured.size()) one = captured.get(index);
        }
        if (one == null) {
            call.reject("There is no such picture.");
            return;
        }
        JSObject result = new JSObject();
        result.put("type", one[0]);
        result.put("data", one[1]);
        call.resolve(result);
    }

    @PluginMethod
    public void release(PluginCall call) {
        captured.clear();
        call.resolve();
    }

    /** One page, from the first request to the answer. Everything here runs on the UI thread, but the page's script. */
    private static final class Session {

        // The check's own page carries a script from /cdn-cgi/challenge-platform/.../orchestrate: while it is
        // there, the page is still the check, whatever its title says in the visitor's language.
        private static final String STATE =
            "(function(){return JSON.stringify({running:!!document.querySelector("
                + "'script[src*=\"/cdn-cgi/challenge-platform/\"][src*=\"orchestrate\"],#challenge-error-text,#cf-challenge-running'),"
                + "ready:document.readyState});})()";
        private static final long POLL_MS = 600;
        private static final long SETTLE_STEP_MS = 700;
        // Scrolling a chapter, and reading each of its pictures, is given this long once the page is ready.
        private static final long SCRIPT_TIMEOUT_MS = 120000;
        // A page that is only read for its pictures is kept out of sight (a spinner covers it) unless it is
        // slow, or turns out to be a check that someone has to answer.
        private static final long REVEAL_AFTER_MS = 15000;
        private static final int MAX_LOGGED = 500;

        private final Activity activity;
        private final PluginCall call;
        private final List<String[]> captured;
        private final String url;
        private final long timeoutMs;
        private final long settleMs;
        private final boolean scroll;
        private final String startScript;
        private final String script;
        private final String statusLabel;
        private final String cancelLabel;
        // What the script of the app must show to be heard by the page's bridge: other frames of the page can reach it too.
        private final String token = UUID.randomUUID().toString();
        private final Handler handler = new Handler(Looper.getMainLooper());
        // What the page asks for, and what the site answers with an error: where a reader gets its pictures from.
        // Both are written from the WebView's own threads.
        private final List<String> requests = Collections.synchronizedList(new ArrayList<String>());
        private final List<String> failures = Collections.synchronizedList(new ArrayList<String>());
        private Dialog dialog;
        private WebView web;
        private FrameLayout cover;
        private TextView label;
        private final Runnable revealLater = this::reveal;
        private boolean loaded = false;
        private volatile boolean finished = false;
        // What the script of the app found, in a line, for the report of a Diagnostic.
        private volatile String note = "";
        private long startedAt;

        Session(
            Activity activity,
            PluginCall call,
            List<String[]> captured,
            String url,
            long timeoutMs,
            long settleMs,
            boolean scroll,
            String startScript,
            String script,
            String statusLabel,
            String cancelLabel
        ) {
            this.activity = activity;
            this.call = call;
            this.captured = captured;
            this.url = url;
            this.timeoutMs = timeoutMs;
            this.settleMs = settleMs;
            this.scroll = scroll;
            this.startScript = startScript;
            this.script = script;
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

                    // Only looks: the request goes on as it was.
                    @Override
                    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                        if (requests.size() < MAX_LOGGED) requests.add(request.getMethod() + " " + request.getUrl());
                        return null;
                    }

                    @Override
                    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
                        if (failures.size() < MAX_LOGGED) failures.add(errorResponse.getStatusCode() + " " + request.getUrl());
                    }
                }
            );
            if (script != null) {
                captured.clear();
                web.addJavascriptInterface(new Pictures(), "JustReadPictures");
            }
            if (startScript != null) injectBeforeThePage();

            label = new TextView(activity);
            label.setText(statusLabel);
            label.setTextColor(Color.WHITE);
            label.setTextSize(16);
            Button cancel = new Button(activity);
            cancel.setText(cancelLabel);
            cancel.setOnClickListener(view -> finish(null, "cancelled", "Cancelled."));
            LinearLayout bar = new LinearLayout(activity);
            bar.setGravity(Gravity.CENTER_VERTICAL);
            bar.setPadding(32, 16, 16, 16);
            bar.addView(label, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
            bar.addView(cancel);

            FrameLayout stage = new FrameLayout(activity);
            stage.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            if (script != null) {
                // The page goes on behind the cover exactly as if it were seen: a page that is hidden, or drawn with no
                // alpha, is throttled, and its pictures would not come in.
                cover = new FrameLayout(activity);
                cover.setBackgroundColor(Color.parseColor("#0f1015"));
                cover.setClickable(true);
                cover.addView(new ProgressBar(activity), new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));
                stage.addView(cover, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                handler.postDelayed(revealLater, REVEAL_AFTER_MS);
            }
            LinearLayout root = new LinearLayout(activity);
            root.setOrientation(LinearLayout.VERTICAL);
            root.setBackgroundColor(Color.parseColor("#0f1015"));
            root.addView(bar);
            root.addView(stage, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
            // The bars of the system are drawn over the dialog on recent Android: keep clear of them.
            root.setOnApplyWindowInsetsListener((view, insets) -> {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
                return insets;
            });

            dialog = new Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
            dialog.setContentView(root);
            dialog.setOnCancelListener(shown -> finish(null, "cancelled", "Cancelled."));
            dialog.show();

            startedAt = SystemClock.elapsedRealtime();
            web.loadUrl(url);
            handler.postDelayed(poll, POLL_MS);
        }

        // Shows the page: it is a check that someone has to answer, or it is taking its time.
        private void reveal() {
            if (!finished && cover != null) cover.setVisibility(View.GONE);
        }

        // The page has been let through and the app's own script is about to scroll it: that is nothing to look
        // at (a page going by at that speed, with its advertisements), and the label says how far it has got.
        private void conceal() {
            handler.removeCallbacks(revealLater);
            if (cover != null) cover.setVisibility(View.VISIBLE);
        }

        // Runs `startScript` in the page before any script of the page does, on the site's own origins.
        // Where the WebView cannot, the script is simply not run: what it prepares is a convenience.
        private void injectBeforeThePage() {
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
            String host = Uri.parse(url).getHost();
            if (host == null) return;
            String[] labels = host.split("\\.");
            String domain = labels.length > 2 ? labels[labels.length - 2] + "." + labels[labels.length - 1] : host;
            try {
                WebViewCompat.addDocumentStartJavaScript(
                    web,
                    startScript,
                    new HashSet<String>(Arrays.asList("https://" + host, "https://*." + domain))
                );
            } catch (IllegalArgumentException invalidRule) {
                // Not the usual rules of the WebView: the script is not run.
            }
        }

        private final Runnable poll = new Runnable() {
            @Override
            public void run() {
                if (finished) return;
                if (SystemClock.elapsedRealtime() - startedAt > timeoutMs) {
                    finish(null, "timeout", "The site did not let the page through in time.");
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
                        if (script != null && state.optBoolean("running", false)) reveal();
                        if (!state.optBoolean("running", true) && "complete".equals(state.optString("ready"))) {
                            if (script != null) runScript();
                            else settle();
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

        // The script of the app scrolls the page, then gives the pictures to Pictures, which ends with done or fail.
        private void runScript() {
            conceal();
            handler.postDelayed(() -> finish(null, "pictures", "The pictures did not come in time."), SCRIPT_TIMEOUT_MS);
            web.evaluateJavascript("window.__justReadToken=" + JSONObject.quote(token) + ";" + script, null);
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
                    result.put("requests", snapshot(requests));
                    result.put("failures", snapshot(failures));
                    if (script != null) {
                        result.put("pictures", captured.size());
                        result.put("note", note);
                    }
                    // What the check gave is kept on disk now: a later run of the app finds it (see held).
                    CookieManager.getInstance().flush();
                    finish(result, null, null);
                } catch (Exception failure) {
                    finish(null, "unreadable", "The page could not be read: " + failure.getMessage());
                }
            });
        }

        private static JSONArray snapshot(List<String> logged) {
            synchronized (logged) {
                return new JSONArray(new ArrayList<String>(logged));
            }
        }

        private void finish(JSObject result, String code, String error) {
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
            else call.reject(error, code);
        }

        /** What the script of the app calls, from the page: the WebView runs these on a thread of its own. */
        private final class Pictures {

            @JavascriptInterface
            public void add(String presented, String type, String data) {
                if (finished || !token.equals(presented)) return;
                captured.add(new String[] { type, data });
            }

            @JavascriptInterface
            public void progress(String presented, int percent) {
                if (finished || !token.equals(presented)) return;
                handler.post(() -> {
                    if (!finished && label != null) label.setText(statusLabel + " " + percent + " %");
                });
            }

            @JavascriptInterface
            public void done(String presented, String found) {
                if (!token.equals(presented)) return;
                note = found == null ? "" : found;
                handler.post(() -> collect());
            }

            @JavascriptInterface
            public void fail(String presented, String message) {
                if (!token.equals(presented)) return;
                handler.post(() -> finish(null, "pictures", "The pictures could not be read: " + message));
            }
        }
    }
}
