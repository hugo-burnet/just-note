package io.github.hugoburnet.justread;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PageFetcherPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
