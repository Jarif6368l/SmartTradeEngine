package com.smarttradeengine.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ImageView;
import android.widget.LinearLayout;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Create a Splash Screen Layout
        LinearLayout splashLayout = new LinearLayout(this);
        splashLayout.setOrientation(LinearLayout.VERTICAL);
        splashLayout.setBackgroundColor(Color.parseColor("#071426")); // Dark background
        splashLayout.setGravity(Gravity.CENTER);

        // 2. Add the Brain Logo
        ImageView logoView = new ImageView(this);
        logoView.setImageResource(getResources().getIdentifier("splash_logo", "drawable", getPackageName()));
        logoView.setAdjustViewBounds(true);
        logoView.setMaxWidth(600); // Fit to screen

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
        );
        params.setMargins(40, 40, 40, 40);
        logoView.setLayoutParams(params);
        splashLayout.addView(logoView);

        setContentView(splashLayout);

        // 3. Wait 2.5 seconds, then load the WebView
        new Handler().postDelayed(new Runnable() {
            @Override
            public void run() {
                loadWebView();
            }
        }, 2500);
    }

    private void loadWebView() {
        webView = new WebView(this);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.setWebViewClient(new WebViewClient());
        setContentView(webView);

        // Make sure the Node.js server is running on port 3000
        webView.loadUrl("http://127.0.0.1:3000/report.html");
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
