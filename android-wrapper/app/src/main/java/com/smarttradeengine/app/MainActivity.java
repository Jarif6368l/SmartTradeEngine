package com.smarttradeengine.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.webkit.JsPromptResult;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String PREFS = "smarttrade_settings";
    private static final String SERVER_URL_KEY = "server_url";
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setSafeBrowsingEnabled(true);
        webView.setWebViewClient(new WebViewClient());

        // JavaScript prompt is used by the History page to request the private API token.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsPrompt(WebView view, String url, String message,
                                      String defaultValue, JsPromptResult result) {
                EditText input = new EditText(MainActivity.this);
                input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
                input.setSingleLine(true);
                new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Private History Access")
                    .setMessage(message)
                    .setView(input)
                    .setPositiveButton("Continue", (dialog, which) ->
                        result.confirm(input.getText().toString()))
                    .setNegativeButton("Cancel", (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
                return true;
            }
        });

        setContentView(webView);

        String configured = BuildConfig.SERVER_URL == null ? "" : BuildConfig.SERVER_URL.trim();
        if (isValidHttpsUrl(configured)) {
            loadDashboard(configured);
            return;
        }

        SharedPreferences preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        String saved = preferences.getString(SERVER_URL_KEY, "");
        if (isValidHttpsUrl(saved)) {
            loadDashboard(saved);
        } else {
            promptForServerUrl();
        }
    }

    private boolean isValidHttpsUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        try {
            Uri uri = Uri.parse(value.trim());
            return "https".equalsIgnoreCase(uri.getScheme())
                && uri.getHost() != null
                && !uri.getHost().isEmpty()
                && uri.getUserInfo() == null;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void promptForServerUrl() {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setSingleLine(true);
        input.setHint("https://your-service.onrender.com");

        new AlertDialog.Builder(this)
            .setTitle("Connect SmartTradeEngine")
            .setMessage("Enter your deployed Render HTTPS address. The APK does not run a local Node.js server.")
            .setView(input)
            .setCancelable(false)
            .setPositiveButton("Connect", (dialog, which) -> {
                String value = input.getText().toString().trim();
                if (!isValidHttpsUrl(value)) {
                    Toast.makeText(this, "A valid HTTPS server URL is required.", Toast.LENGTH_LONG).show();
                    promptForServerUrl();
                    return;
                }
                getSharedPreferences(PREFS, MODE_PRIVATE)
                    .edit()
                    .putString(SERVER_URL_KEY, value.replaceAll("/+$", ""))
                    .apply();
                loadDashboard(value);
            })
            .setNegativeButton("Exit", (dialog, which) -> finish())
            .show();
    }

    private void loadDashboard(String baseUrl) {
        String normalized = baseUrl.trim().replaceAll("/+$", "");
        String pageUrl = normalized.endsWith("/report.html")
            ? normalized
            : normalized + "/report.html";
        webView.loadUrl(pageUrl);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
