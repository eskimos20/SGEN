package com.sgen.app;

import android.os.Bundle;
import android.webkit.WebStorage;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Clear old WebView cache/storage before loading new assets so updates are visible immediately
        WebStorage.getInstance().deleteAllData();
        WebView cacheClearer = new WebView(this);
        cacheClearer.clearCache(true);
        cacheClearer.destroy();
        super.onCreate(savedInstanceState);
    }
}
