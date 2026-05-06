package expo.core;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.List;

public class ExpoModulesPackage implements ReactPackage {
    private final expo.modules.ExpoModulesPackage delegate;

    public ExpoModulesPackage() {
        this.delegate = new expo.modules.ExpoModulesPackage();
    }

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        return delegate.createNativeModules(reactContext);
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return (List) delegate.createViewManagers(reactContext);
    }
}
