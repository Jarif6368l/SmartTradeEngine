package com.smarttradeengine.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.view.Gravity;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Splash Screen Layout
        LinearLayout splashLayout = new LinearLayout(this);
        splashLayout.setOrientation(LinearLayout.VERTICAL);
        splashLayout.setBackgroundColor(Color.parseColor("#020916")); // Deep Dark Background
        splashLayout.setGravity(Gravity.CENTER);

        // Load the Custom Vector Logo
        ImageView logoView = new ImageView(this);
        logoView.setImageResource(R.drawable.splash_logo);
        
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(40, 40, 40, 40);
        logoView.setLayoutParams(params);
        splashLayout.addView(logoView);

        setContentView(splashLayout);

        // Wait 2.5 seconds then load the app
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
