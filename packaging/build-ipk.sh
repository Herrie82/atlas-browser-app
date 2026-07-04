#!/bin/bash
# Build a self-contained Atlas Web IPK bundling all 4 components (app + WPE engine + BrowserServer +
# BrowserAdapter) for a CLEAN webOS 3.0.5 device. Install with Preware / WebOS Quick Install (they run
# postinst as root) — palm-install does NOT run the scripts.
#
# Engine is the stripped deploy-252-jitfix set (== the running device engine) + 3 device-pulled libs.
set -eu
WPE=/home/herrie/webos/wpe
APP=/home/herrie/Documents/GitHub/atlas-browser-app
B=$WPE/ipk-build
PULL=$B/pull
ID=org.webosports.app.atlas
VER=$(sed -n 's/.*"version"[^"]*"\([^"]*\)".*/\1/p' "$APP/appinfo.json")
ARCH=all
STRIP=/home/herrie/webos/touchpad-kernel/doctor305/isis-project/toolchain/arm-2009q1/bin/arm-none-linux-gnueabi-strip

echo "== Atlas IPK  id=$ID  version=$VER =="
DATA=$B/data
CTRL=$B/control
APPROOT=$DATA/usr/palm/applications/$ID
DR=$APPROOT/deviceroot
rm -rf "$DATA" "$CTRL"; mkdir -p "$APPROOT" "$DR/wpe-252" "$DR/atlas" "$DR/BrowserPlugins" "$DR/event.d" "$CTRL"

echo "-- app (enyo UI)"
for f in appinfo.json index.html depends.js source css images db icon.png icon-256x256.png icon-64x64.png icon-48x48.png; do
  cp -a "$APP/$f" "$APPROOT/"
done

echo "-- engine (stripped jitfix set)"
cp -a "$WPE/deploy-252-jitfix/lib"      "$DR/wpe-252/lib"
cp -a "$WPE/deploy-252-jitfix/libexec"  "$DR/wpe-252/libexec"
cp -a "$WPE/deploy-252-jitfix/run.sh"   "$DR/wpe-252/run.sh"
cp -a "$WPE/browserserver-wpe/obj/BrowserServer-atlas" "$DR/wpe-252/BrowserServer-atlas"
cp -a "$PULL/fonts.conf"                "$DR/wpe-252/fonts.conf"
# DO NOT bundle OpenSSL 1.1 — depend on the existing /usr/lib/ssl11 package (the engine's copies differ from
# it; both are 1.1.x / ABI-compatible via soname, and the wrapper's LD_LIBRARY_PATH already includes ssl11).
rm -f "$DR/wpe-252/lib/libssl.so.1.1" "$DR/wpe-252/lib/libcrypto.so.1.1"
# DO NOT bundle libEGL.so.1 / libGLESv2.so.2 — they are byte-identical to the device's Adreno driver
# (/usr/lib/libEGL.so, /usr/lib/libGLESv2.so). postinst symlinks the versioned sonames to the real driver.
# The GIO TLS module IS engine-specific (built for OpenSSL 1.1, not in the rootfs) — keep it.
mkdir -p "$DR/wpe-252/lib/gio/modules"
cp -a "$PULL/gio/modules/libgioopenssl.so" "$DR/wpe-252/lib/gio/modules/libgioopenssl.so"
# strip the BrowserServer binary (the .so's are already stripped)
"$STRIP" --strip-unneeded "$DR/wpe-252/BrowserServer-atlas" 2>/dev/null || true

echo "-- BrowserServer boot wrapper + upstart job"
cp -a "$PULL/wrapper-BrowserServer" "$DR/atlas/BrowserServer"
cp -a "$PULL/upstart-atlas"         "$DR/event.d/atlas"

echo "-- BrowserAdapter plugin"
cp -a /tmp/BrowserAdapterAtlas.so "$DR/BrowserPlugins/BrowserAdapterAtlas.so"

# sanity: core engine libs present (OpenSSL 1.1 + EGL/GLES intentionally NOT bundled — see above)
for l in libWPEWebKit-2.0.so.1 libWPEBackend-atlas.so gio/modules/libgioopenssl.so; do
  [ -e "$DR/wpe-252/lib/$l" ] || echo "  WARN: engine lib missing: $l"
done
[ -e "$DR/wpe-252/lib/libssl.so.1.1" ] && echo "  WARN: OpenSSL still bundled (should depend on /usr/lib/ssl11)"

echo "-- control + scripts"
INSTSIZE=$(du -sk "$DATA" | cut -f1)
cat > "$CTRL/control" <<EOF
Package: $ID
Version: $VER
Section: web
Priority: optional
Architecture: $ARCH
Installed-Size: $INSTSIZE
Maintainer: WebOS Ports <webos-ports@example.org>
Description: Atlas Web — a modern WPE WebKit 2.52 browser for webOS (HP TouchPad).
 Bundles the enyo app, the WPE WebKit engine, the BrowserServer engine host, and
 the BrowserAdapter plugin. Installs as a separate browser; never touches the stock
 Palm BrowserServer / WebKit. Requires the community OpenSSL 1.1 package
 (/usr/lib/ssl11) and the device Adreno GL driver (/usr/lib/libEGL.so,
 /usr/lib/libGLESv2.so). Install with Preware or WebOS Quick Install (runs postinst
 as root); palm-install will NOT run the install scripts.
EOF
cp "$WPE/ipk-postinst.sh" "$CTRL/postinst"
cp "$WPE/ipk-prerm.sh"    "$CTRL/prerm"
chmod 755 "$CTRL/postinst" "$CTRL/prerm"

echo "-- assemble ipk (ar: debian-binary + control.tar.gz + data.tar.gz)"
printf '2.0\n' > "$B/debian-binary"
( cd "$CTRL" && tar --owner=0 --group=0 -czf "$B/control.tar.gz" ./control ./postinst ./prerm )
( cd "$DATA" && tar --owner=0 --group=0 -czf "$B/data.tar.gz" ./ )
OUT="$B/${ID}_${VER}_${ARCH}.ipk"
( cd "$B" && ar rc "$(basename "$OUT")" debian-binary control.tar.gz data.tar.gz )
echo "== built: $OUT  ($(du -h "$OUT" | cut -f1)) =="
ar t "$OUT"
