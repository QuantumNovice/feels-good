# Called by the packaged TypeScript UI; retain the bridge's public API names.
-keepclassmembers class com.brightideas.spotlane.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
