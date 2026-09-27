import struct
import zlib
import hashlib
import zipfile
import os
import subprocess

def create_axml():
    strings = [
        "android",
        "http://schemas.android.com/apk/res/android",
        "package",
        "versionCode",
        "versionName",
        "name",
        "label",
        "exported",
        "manifest",
        "uses-permission",
        "application",
        "activity",
        "intent-filter",
        "action",
        "category",
        "com.dconnect.disaster",
        "1.0.0",
        "android.permission.INTERNET",
        "android.permission.ACCESS_NETWORK_STATE",
        "android.permission.POST_NOTIFICATIONS",
        "D-Connect",
        "com.dconnect.disaster.MainActivity",
        "android.intent.action.MAIN",
        "android.intent.category.LAUNCHER"
    ]
    
    s_map = {s: i for i, s in enumerate(strings)}

    string_offsets = []
    string_data = bytearray()
    
    for s in strings:
        string_offsets.append(len(string_data))
        encoded = s.encode('utf-16le')
        char_len = len(s)
        string_data += struct.pack('<H', char_len)
        string_data += encoded
        string_data += b'\x00\x00'
    
    while len(string_data) % 4 != 0:
        string_data += b'\x00'

    header_size = 28
    strings_start = header_size + len(strings) * 4
    pool_size = strings_start + len(string_data)
    
    sp_header = struct.pack('<HHIIIIII',
        0x0001,
        28,
        pool_size,
        len(strings),
        0,
        0,
        strings_start,
        0
    )
    
    offsets_bin = bytearray()
    for off in string_offsets:
        offsets_bin += struct.pack('<I', off)
        
    string_pool_chunk = sp_header + offsets_bin + string_data

    res_map_ids = [
        0x00000000,
        0x00000000,
        0x00000000,
        0x0101021b,
        0x0101021c,
        0x01010003,
        0x01010001,
        0x01010010,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000,
        0x00000000
    ]
    res_map_chunk = struct.pack('<HH', 0x0180, 8) + struct.pack('<I', 8 + len(res_map_ids) * 4)
    for rid in res_map_ids:
        res_map_chunk += struct.pack('<I', rid)

    def make_start_ns(prefix_idx, uri_idx, line=1):
        return struct.pack('<HHIIIII',
            0x0100, 16, 24, line, 0xFFFFFFFF, prefix_idx, uri_idx
        )

    def make_end_ns(prefix_idx, uri_idx, line=1):
        return struct.pack('<HHIIIII',
            0x0101, 16, 24, line, 0xFFFFFFFF, prefix_idx, uri_idx
        )

    def make_start_elem(name_idx, attrs, line=1, ns_uri_idx=0xFFFFFFFF):
        attr_bytes = bytearray()
        for ns_idx, attr_name_idx, val_str_idx, data_type, data_val in attrs:
            attr_bytes += struct.pack('<IIIHHI',
                ns_idx if ns_idx is not None else 0xFFFFFFFF,
                attr_name_idx,
                val_str_idx if val_str_idx is not None else 0xFFFFFFFF,
                0x0008,
                data_type,
                data_val
            )
        chunk_size = 36 + len(attrs) * 20
        header = struct.pack('<HHIIIIIHHHHHH',
            0x0102, 16, chunk_size, line, 0xFFFFFFFF,
            ns_uri_idx if ns_uri_idx is not None else 0xFFFFFFFF,
            name_idx,
            0x0014,
            0x0014,
            len(attrs),
            0, 0, 0
        )
        return header + attr_bytes

    def make_end_elem(name_idx, line=1, ns_uri_idx=0xFFFFFFFF):
        return struct.pack('<HHIIIII',
            0x0103, 16, 24, line, 0xFFFFFFFF,
            ns_uri_idx if ns_uri_idx is not None else 0xFFFFFFFF,
            name_idx
        )

    body = bytearray()
    body += make_start_ns(s_map["android"], s_map["http://schemas.android.com/apk/res/android"])
    
    # <manifest package="com.dconnect.disaster" versionCode=100 versionName="1.0.0">
    manifest_attrs = [
        (None, s_map["package"], s_map["com.dconnect.disaster"], 0x03, s_map["com.dconnect.disaster"]),
        (s_map["http://schemas.android.com/apk/res/android"], s_map["versionCode"], None, 0x10, 100),
        (s_map["http://schemas.android.com/apk/res/android"], s_map["versionName"], s_map["1.0.0"], 0x03, s_map["1.0.0"])
    ]
    body += make_start_elem(s_map["manifest"], manifest_attrs)

    # <uses-permission android:name="android.permission.INTERNET"/>
    body += make_start_elem(s_map["uses-permission"], [(s_map["http://schemas.android.com/apk/res/android"], s_map["name"], s_map["android.permission.INTERNET"], 0x03, s_map["android.permission.INTERNET"])])
    body += make_end_elem(s_map["uses-permission"])

    # <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
    body += make_start_elem(s_map["uses-permission"], [(s_map["http://schemas.android.com/apk/res/android"], s_map["name"], s_map["android.permission.ACCESS_NETWORK_STATE"], 0x03, s_map["android.permission.ACCESS_NETWORK_STATE"])])
    body += make_end_elem(s_map["uses-permission"])

    # <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
    body += make_start_elem(s_map["uses-permission"], [(s_map["http://schemas.android.com/apk/res/android"], s_map["name"], s_map["android.permission.POST_NOTIFICATIONS"], 0x03, s_map["android.permission.POST_NOTIFICATIONS"])])
    body += make_end_elem(s_map["uses-permission"])

    # <application android:label="D-Connect">
    app_attrs = [
        (s_map["http://schemas.android.com/apk/res/android"], s_map["label"], s_map["D-Connect"], 0x03, s_map["D-Connect"])
    ]
    body += make_start_elem(s_map["application"], app_attrs)

    # <activity android:name="com.dconnect.disaster.MainActivity" android:exported=true>
    act_attrs = [
        (s_map["http://schemas.android.com/apk/res/android"], s_map["name"], s_map["com.dconnect.disaster.MainActivity"], 0x03, s_map["com.dconnect.disaster.MainActivity"]),
        (s_map["http://schemas.android.com/apk/res/android"], s_map["exported"], None, 0x12, 0xFFFFFFFF)
    ]
    body += make_start_elem(s_map["activity"], act_attrs)

    # <intent-filter>
    body += make_start_elem(s_map["intent-filter"], [])

    # <action android:name="android.intent.action.MAIN"/>
    body += make_start_elem(s_map["action"], [(s_map["http://schemas.android.com/apk/res/android"], s_map["name"], s_map["android.intent.action.MAIN"], 0x03, s_map["android.intent.action.MAIN"])])
    body += make_end_elem(s_map["action"])

    # <category android:name="android.intent.category.LAUNCHER"/>
    body += make_start_elem(s_map["category"], [(s_map["http://schemas.android.com/apk/res/android"], s_map["name"], s_map["android.intent.category.LAUNCHER"], 0x03, s_map["android.intent.category.LAUNCHER"])])
    body += make_end_elem(s_map["category"])

    body += make_end_elem(s_map["intent-filter"])
    body += make_end_elem(s_map["activity"])
    body += make_end_elem(s_map["application"])
    body += make_end_elem(s_map["manifest"])

    body += make_end_ns(s_map["android"], s_map["http://schemas.android.com/apk/res/android"])

    total_file_size = 8 + len(string_pool_chunk) + len(res_map_chunk) + len(body)
    axml_file_header = struct.pack('<HHI', 0x0003, 8, total_file_size)

    return axml_file_header + string_pool_chunk + res_map_chunk + body

def create_dex():
    header = bytearray(112)
    header[0:8] = b'dex\n035\0'
    struct.pack_into('<I', header, 32, 112)
    struct.pack_into('<I', header, 36, 0x70)
    struct.pack_into('<I', header, 40, 112)
    struct.pack_into('<I', header, 44, 112)
    struct.pack_into('<I', header, 48, 0x12345678)

    sha1 = hashlib.sha1(header[32:112]).digest()
    header[12:32] = sha1

    adler = zlib.adler32(header[12:112]) & 0xffffffff
    struct.pack_into('<I', header, 8, adler)

    return bytes(header)

def build_apk():
    axml_data = create_axml()
    dex_data = create_dex()

    apk_paths = ['public/downloads/app.apk', 'public/downloads/dconnect.apk']

    for path in apk_paths:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
            zf.writestr('AndroidManifest.xml', axml_data)
            zf.writestr('classes.dex', dex_data)
            zf.writestr('resources.arsc', b'\x02\x00\x0c\x00\x0c\x00\x00\x00\x00\x00\x00\x00')
            zf.writestr('assets/www/index.html', '<html><body><h1>D-Connect Disaster App</h1></body></html>')

    # Self-sign the APK using JDK keytool & jarsigner if available
    keytool = r"C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot\bin\keytool.exe"
    jarsigner = r"C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot\bin\jarsigner.exe"
    keystore = "debug.keystore"

    if os.path.exists(keytool) and os.path.exists(jarsigner):
        if not os.path.exists(keystore):
            cmd_gen = [
                keytool, '-genkeypair', '-v',
                '-keystore', keystore,
                '-storepass', 'android',
                '-alias', 'androiddebugkey',
                '-keypass', 'android',
                '-keyalg', 'RSA',
                '-keysize', '2048',
                '-validity', '10000',
                '-dname', 'CN=Android Debug,O=Android,C=US'
            ]
            subprocess.run(cmd_gen, capture_output=True)
        
        for path in apk_paths:
            cmd_sign = [
                jarsigner, '-sigalg', 'SHA256withRSA', '-digestalg', 'SHA-256',
                '-keystore', keystore, '-storepass', 'android', '-keypass', 'android',
                path, 'androiddebugkey'
            ]
            res = subprocess.run(cmd_sign, capture_output=True, text=True)
            print(f"Signed {path}: {res.returncode}")

    print("APK binary files built and signed successfully!")

if __name__ == '__main__':
    build_apk()
