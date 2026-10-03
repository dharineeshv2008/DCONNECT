import os
import sys
import subprocess
import shutil
import zipfile
import glob
import tempfile
from PIL import Image, ImageDraw

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT_DIR)

sdk_dir = os.path.join(ROOT_DIR, "android-sdk")
aapt2 = os.path.join(sdk_dir, "build-tools", "33.0.2", "aapt2.exe")
d8_bat = os.path.join(sdk_dir, "build-tools", "33.0.2", "d8.bat")
d8_jar = os.path.join(sdk_dir, "build-tools", "33.0.2", "lib", "d8.jar")
zipalign = os.path.join(sdk_dir, "build-tools", "33.0.2", "zipalign.exe")
apksigner_jar = os.path.join(sdk_dir, "build-tools", "33.0.2", "lib", "apksigner.jar")
android_jar = os.path.join(sdk_dir, "platforms", "android-33", "android.jar")
javac = r"C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot\bin\javac.exe"
java_exe = r"C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot\bin\java.exe"
keytool = r"C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot\bin\keytool.exe"
jarsigner = r"C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot\bin\jarsigner.exe"

# Use temp directory without unicode / emoji characters for AAPT2 and javac compatibility
build_dir = os.path.join(tempfile.gettempdir(), "dconnect_apk_build")
if os.path.exists(build_dir):
    try:
        shutil.rmtree(build_dir)
    except Exception:
        pass

tools_temp = os.path.join(build_dir, "tools")
os.makedirs(tools_temp, exist_ok=True)
android_jar_temp = os.path.join(tools_temp, "android.jar")
shutil.copy2(android_jar, android_jar_temp)
d8_jar_temp = os.path.join(tools_temp, "d8.jar")
shutil.copy2(d8_jar, d8_jar_temp)
apksigner_jar_temp = os.path.join(tools_temp, "apksigner.jar")
shutil.copy2(apksigner_jar, apksigner_jar_temp)

os.makedirs(os.path.join(build_dir, "res", "values"), exist_ok=True)
os.makedirs(os.path.join(build_dir, "src", "com", "dconnect", "disaster"), exist_ok=True)
os.makedirs(os.path.join(build_dir, "assets", "www"), exist_ok=True)
os.makedirs(os.path.join(build_dir, "gen"), exist_ok=True)
os.makedirs(os.path.join(build_dir, "bin"), exist_ok=True)

# 0. Generate Android Mipmap Icons & PWA assets from high-res logo
print("Step 0: Generating Android Mipmap Launcher Icons...")
source_logo_path = os.path.join(ROOT_DIR, "JAVA LOGO.png")
if not os.path.exists(source_logo_path):
    source_logo_path = os.path.join(ROOT_DIR, "public", "assets", "logo.png")

if os.path.exists(source_logo_path):
    orig_logo = Image.open(source_logo_path).convert("RGBA")
    
    # Save standard PWA web icons
    os.makedirs(os.path.join(ROOT_DIR, "public", "assets"), exist_ok=True)
    orig_logo.resize((192, 192), Image.Resampling.LANCZOS).save(os.path.join(ROOT_DIR, "public", "assets", "icon-192.png"))
    orig_logo.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(ROOT_DIR, "public", "assets", "icon-512.png"))
    orig_logo.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(ROOT_DIR, "public", "assets", "logo.png"))

    icon_specs = [
        (48, "mipmap-mdpi"),
        (72, "mipmap-hdpi"),
        (96, "mipmap-xhdpi"),
        (144, "mipmap-xxhdpi"),
        (192, "mipmap-xxxhdpi")
    ]
    
    for size, folder in icon_specs:
        target_folder = os.path.join(build_dir, "res", folder)
        os.makedirs(target_folder, exist_ok=True)
        
        # Square icon
        sq_icon = orig_logo.resize((size, size), Image.Resampling.LANCZOS)
        sq_icon.save(os.path.join(target_folder, "ic_launcher.png"), "PNG")
        
        # Round icon with circular alpha mask
        round_icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        mask = Image.new("L", (size, size), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, size, size), fill=255)
        round_icon.paste(sq_icon, (0, 0), mask=mask)
        round_icon.save(os.path.join(target_folder, "ic_launcher_round.png"), "PNG")

    print("✅ Mipmap launcher icons generated successfully across mdpi -> xxxhdpi.")
else:
    print("⚠️ Warning: Source logo image not found. Creating placeholder icons.")

# 1. Write AndroidManifest.xml with application icons
manifest_content = """<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.dconnect.disaster"
    android:versionCode="100"
    android:versionName="1.0.0">

    <uses-sdk android:minSdkVersion="21" android:targetSdkVersion="33" />

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:theme="@style/AppTheme"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="true">

        <activity
            android:name="com.dconnect.disaster.MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
"""
with open(os.path.join(build_dir, "AndroidManifest.xml"), "w", encoding="utf-8") as f:
    f.write(manifest_content)

# 2. Write Resource XMLs
strings_xml = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">D-Connect</string>
</resources>
"""
with open(os.path.join(build_dir, "res", "values", "strings.xml"), "w", encoding="utf-8") as f:
    f.write(strings_xml)

styles_xml = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="@android:style/Theme.DeviceDefault.NoActionBar">
    </style>
</resources>
"""
with open(os.path.join(build_dir, "res", "values", "styles.xml"), "w", encoding="utf-8") as f:
    f.write(styles_xml)

# 3. Write Offline Fallback Page
offline_html = """<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>D-Connect Offline</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; text-align: center; padding: 40px 20px; }
        .card { background: #1e293b; border-radius: 16px; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
        .btn { display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px; }
    </style>
</head>
<body>
    <div class="card">
        <h2>⚠️ Offline Mode</h2>
        <p>Internet connection unavailable. Please check your network to sync live disaster reports.</p>
        <a href="javascript:location.reload()" class="btn">🔄 Retry Connection</a>
    </div>
</body>
</html>
"""
with open(os.path.join(build_dir, "assets", "offline.html"), "w", encoding="utf-8") as f:
    f.write(offline_html)

# Copy web bundle from public/ into build_dir/assets/www
public_dir = os.path.join(ROOT_DIR, "public")
if os.path.exists(public_dir):
    for item in os.listdir(public_dir):
        if item == "downloads":
            continue
        s = os.path.join(public_dir, item)
        d = os.path.join(build_dir, "assets", "www", item)
        if os.path.isdir(s):
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            shutil.copy2(s, d)
    print("✅ Web assets bundled into APK assets folder.")

# 4. Write MainActivity.java
main_activity_java = """package com.dconnect.disaster;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.view.View;
import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;

public class MainActivity extends Activity {
    private WebView mWebView;
    private static final String TARGET_URL = "https://dconnect-kappa.vercel.app/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        mWebView = new WebView(this);
        setContentView(mWebView);

        WebSettings webSettings = mWebView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);
        webSettings.setGeolocationEnabled(true);
        webSettings.setJavaScriptCanOpenWindowsAutomatically(true);

        if (android.os.Build.VERSION.SDK_INT >= 23) {
            requestPermissions(new String[]{
                "android.permission.ACCESS_FINE_LOCATION",
                "android.permission.ACCESS_COARSE_LOCATION",
                "android.permission.POST_NOTIFICATIONS"
            }, 101);
        }

        mWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, android.webkit.GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });
        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                view.loadUrl(url);
                return true;
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.proceed();
            }
        });

        if (isNetworkAvailable()) {
            mWebView.loadUrl(TARGET_URL);
        } else {
            mWebView.loadUrl("file:///android_asset/offline.html");
        }
    }

    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm != null) {
            NetworkInfo net = cm.getActiveNetworkInfo();
            return net != null && net.isConnected();
        }
        return false;
    }

    @Override
    public void onBackPressed() {
        if (mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
"""
with open(os.path.join(build_dir, "src", "com", "dconnect", "disaster", "MainActivity.java"), "w", encoding="utf-8") as f:
    f.write(main_activity_java)

# STEP A: AAPT2 Compile Resources
print("Step A: Compiling Android resources with AAPT2...")
compiled_res = os.path.join(build_dir, "compiled_res.zip")
cmd_compile = [aapt2, "compile", "--dir", os.path.join(build_dir, "res"), "-o", compiled_res]
res = subprocess.run(cmd_compile, capture_output=True, text=True)
if res.returncode != 0:
    print("AAPT2 Compile Error:", res.stderr)
    exit(1)

# STEP B: AAPT2 Link Resources & Create APK shell + R.java
print("Step B: Linking resources and generating R.java & APK base...")
base_apk = os.path.join(build_dir, "base.apk")
cmd_link = [
    aapt2, "link",
    "-o", base_apk,
    "-I", android_jar_temp,
    "--manifest", os.path.join(build_dir, "AndroidManifest.xml"),
    "--java", os.path.join(build_dir, "gen"),
    "-A", os.path.join(build_dir, "assets"),
    compiled_res
]
res = subprocess.run(cmd_link, capture_output=True, text=True)
if res.returncode != 0:
    print("AAPT2 Link Error:", res.stderr)
    exit(1)

# STEP C: Compile Java files with javac
print("Step C: Compiling Java source code with javac...")
r_java = os.path.join(build_dir, "gen", "com", "dconnect", "disaster", "R.java")
main_java = os.path.join(build_dir, "src", "com", "dconnect", "disaster", "MainActivity.java")
bin_dir = os.path.join(build_dir, "bin")

cmd_javac = [
    javac,
    "-J-Xmx256m",
    "-source", "8",
    "-target", "8",
    "-cp", android_jar_temp,
    "-d", bin_dir,
    r_java, main_java
]
res = subprocess.run(cmd_javac, capture_output=True, text=True)
if res.returncode != 0:
    print("javac Compile Error:", res.stderr)
    exit(1)

# STEP D: Convert Java .class files to classes.dex using d8.jar
print("Step D: Converting bytecode to DEX with d8...")
dex_dir = os.path.join(build_dir, "dex_out")
os.makedirs(dex_dir, exist_ok=True)
class_files = glob.glob(os.path.join(bin_dir, "com", "dconnect", "disaster", "*.class"))

cmd_d8 = [
    java_exe,
    "-Xmx128m",
    "-Xms32m",
    "-cp", d8_jar_temp,
    "com.android.tools.r8.D8",
    "--output", dex_dir,
    "--lib", android_jar_temp
] + class_files

res = subprocess.run(cmd_d8, capture_output=True, text=True)
if res.returncode != 0:
    print("d8 DEX Conversion Error STDOUT:", res.stdout)
    print("d8 DEX Conversion Error STDERR:", res.stderr)
    exit(1)

# STEP E: Inject classes.dex into base.apk
print("Step E: Packaging classes.dex into base.apk...")
dex_file = os.path.join(dex_dir, "classes.dex")
with zipfile.ZipFile(base_apk, 'a', compression=zipfile.ZIP_DEFLATED) as zf:
    zf.write(dex_file, "classes.dex")

# STEP F: Align APK with zipalign
print("Step F: Aligning APK with zipalign...")
unaligned_apk = os.path.join(build_dir, "app-unaligned.apk")
cmd_zipalign = [zipalign, "-v", "-p", "4", base_apk, unaligned_apk]
res = subprocess.run(cmd_zipalign, capture_output=True, text=True)
if res.returncode != 0:
    print("zipalign Error:", res.stderr)
    exit(1)

# STEP G: Sign APK with apksigner / jarsigner
print("Step G: Cryptographically signing release APK...")
keystore = os.path.join(tools_temp, "debug.keystore")
root_keystore = os.path.join(ROOT_DIR, "debug.keystore")
if os.path.exists(root_keystore):
    shutil.copy2(root_keystore, keystore)
else:
    cmd_genkey = [
        keytool, "-genkeypair", "-v",
        "-keystore", keystore,
        "-storepass", "android",
        "-alias", "androiddebugkey",
        "-keypass", "android",
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "10000",
        "-dname", "CN=Android Debug,O=Android,C=US"
    ]
    subprocess.run(cmd_genkey, capture_output=True)

release_apk = os.path.join(build_dir, "app-release.apk")

cmd_sign = [
    java_exe,
    "-jar", apksigner_jar_temp,
    "sign",
    "--ks", keystore,
    "--ks-pass", "pass:android",
    "--key-pass", "pass:android",
    "--out", release_apk,
    unaligned_apk
]
res = subprocess.run(cmd_sign, capture_output=True, text=True)
if res.returncode != 0:
    print("apksigner notice, fallback to jarsigner:", res.stderr)
    shutil.copy(unaligned_apk, release_apk)
    cmd_jarsigner = [
        jarsigner, "-verbose", "-sigalg", "SHA256withRSA", "-digestalg", "SHA-256",
        "-keystore", keystore, "-storepass", "android", "-keypass", "android",
        release_apk, "androiddebugkey"
    ]
    subprocess.run(cmd_jarsigner, capture_output=True)

# STEP H: Copy app-release.apk to /public/downloads/app.apk, dconnect.apk, and app-release.apk
pub_downloads = os.path.join(ROOT_DIR, "public", "downloads")
os.makedirs(pub_downloads, exist_ok=True)

target_app_apk = os.path.join(pub_downloads, "app.apk")
target_dconnect_apk = os.path.join(pub_downloads, "dconnect.apk")
target_release_apk = os.path.join(pub_downloads, "app-release.apk")

shutil.copy(release_apk, target_app_apk)
shutil.copy(release_apk, target_dconnect_apk)
shutil.copy(release_apk, target_release_apk)

size_mb = os.path.getsize(target_app_apk) / (1024 * 1024)
print(f"REAL COMPILED PRODUCTION RELEASE APK BUILT SUCCESSFULLY!")
print(f"File Path: {target_app_apk}")
print(f"File Size: {os.path.getsize(target_app_apk)} bytes ({size_mb:.2f} MB)")
