#!/bin/bash
# Build a self-contained Atlas Web IPK bundling all 4 components (app + WPE engine + BrowserServer +
# BrowserAdapter) for a CLEAN webOS 3.0.5 device. Install with Preware / WebOS Quick Install (they run
# postinst as root) — palm-install does NOT run the scripts.
#
# Engine is the stripped deploy-252-jitfix set (== the running device engine) + 3 device-pulled libs.
#
# ---------------------------------------------------------------------------------------------------
# This script assembles THIS app's package. The engine, BrowserServer and adapter are large ARM build
# artifacts produced by two sibling projects — they are NOT vendored here. Point the variables below at
# your local build outputs (or export them in the environment):
#
#   WPE          build-environment root (the atlas-wpe-env checkout / its build tree).
#                Provides deploy-252-jitfix/, browserserver-wpe/, and ipk-build/pull/.
#                https://github.com/Herrie82/atlas-wpe-env
#   ADAPTER_SO   the compiled BrowserAdapterAtlas.so (NPAPI plugin).
#                https://github.com/Herrie82/atlas-wpe-backend
#   STRIP        cross 'strip' for the ARM BrowserServer binary (optional — skipped if unavailable).
#
# APP (this repo) is derived from the script's own location, so the script works from any checkout with
# no editing. The on-device paths it writes into the package (/media/internal, /var/atlas252, …) are
# device paths and are intentionally absolute.
#
# Usage:
#   packaging/build-ipk.sh
#   WPE=~/webos/wpe ADAPTER_SO=~/build/BrowserAdapterAtlas.so packaging/build-ipk.sh
# ---------------------------------------------------------------------------------------------------
set -eu

# --- locations (override any via the environment) ------------------------------------------------
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP=$(cd -- "$SCRIPT_DIR/.." && pwd)                 # this repo (atlas-browser-app), derived — do not hardcode
WPE="${WPE:-$HOME/webos/wpe}"                         # build-environment root (atlas-wpe-env build tree)
ADAPTER_SO="${ADAPTER_SO:-/tmp/BrowserAdapterAtlas.so}"  # compiled NPAPI adapter (atlas-wpe-backend)
B="${IPK_BUILD_DIR:-$WPE/ipk-build}"                 # scratch/output dir for the assembled package
PULL="$B/pull"                                       # device-pulled bits (fonts.conf, gio module, wrapper, upstart)
ID=org.webosports.app.atlas
VER=$(sed -n 's/.*"version"[^"]*"\([^"]*\)".*/\1/p' "$APP/appinfo.json")
ARCH=all

# STRIP: honour an explicit override, else autodetect a cross-strip on PATH, else skip stripping.
if [ -z "${STRIP:-}" ]; then
  STRIP=$(command -v arm-none-linux-gnueabi-strip || command -v arm-linux-gnueabihf-strip \
          || command -v arm-linux-gnueabi-strip || true)
fi

# --- preflight: verify the external build artifacts are present, with pointers if not ------------
missing=0
need() { # need <path> <human description> <where-to-get-it>
  if [ ! -e "$1" ]; then
    echo "  MISSING: $2"
    echo "           expected at: $1"
    echo "           get it from:  $3"
    missing=1
  fi
}
echo "== preflight =="
need "$APP/appinfo.json"                              "this app (appinfo.json)"          "this repo"
need "$WPE/deploy-252-jitfix/lib"                     "stripped WPE engine libs"         "https://github.com/Herrie82/atlas-wpe-env"
need "$WPE/deploy-252-jitfix/libexec"                 "WPE engine libexec"               "https://github.com/Herrie82/atlas-wpe-env"
need "$WPE/deploy-252-jitfix/run.sh"                  "engine run.sh"                    "https://github.com/Herrie82/atlas-wpe-env"
need "$WPE/browserserver-wpe/obj/BrowserServer-atlas" "BrowserServer-atlas binary"       "https://github.com/Herrie82/atlas-wpe-backend"
need "$PULL/fonts.conf"                               "fonts.conf (device-pulled)"       "https://github.com/Herrie82/atlas-wpe-env"
need "$PULL/gio/modules/libgioopenssl.so"             "GIO OpenSSL TLS module"           "https://github.com/Herrie82/atlas-wpe-env"
need "$PULL/wrapper-BrowserServer"                    "BrowserServer boot wrapper"       "https://github.com/Herrie82/atlas-wpe-env"
need "$PULL/upstart-atlas"                            "atlas upstart job"                "https://github.com/Herrie82/atlas-wpe-env"
need "$ADAPTER_SO"                                    "BrowserAdapterAtlas.so plugin"    "https://github.com/Herrie82/atlas-wpe-backend"
if [ "$missing" -ne 0 ]; then
  echo
  echo "Build artifacts are missing (see above). This repo packages the Atlas app front-end; the ARM"
  echo "engine/BrowserServer/adapter are built by the two sibling projects. Point WPE= / ADAPTER_SO= at"
  echo "your local build outputs, then re-run. WPE is currently: $WPE"
  exit 1
fi
if [ -n "$STRIP" ] && [ -x "$STRIP" ]; then
  echo "  strip: $STRIP"
else
  echo "  note: no cross-strip found — shipping the BrowserServer binary unstripped (set STRIP= to override)."
fi

echo "== Atlas IPK  id=$ID  version=$VER =="
echo "   app  = $APP"
echo "   wpe  = $WPE"
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
if [ -n "$STRIP" ] && [ -x "$STRIP" ]; then
  "$STRIP" --strip-unneeded "$DR/wpe-252/BrowserServer-atlas" 2>/dev/null || true
fi

echo "-- BrowserServer boot wrapper + upstart job"
cp -a "$PULL/wrapper-BrowserServer" "$DR/atlas/BrowserServer"
cp -a "$PULL/upstart-atlas"         "$DR/event.d/atlas"
# atlas-sensord upstart job + LunaService role file — required by the current postinst (0.9.7 sensors).
# Best-effort: stage them if the build tree provides them, else warn (an older engine build may lack them).
if [ -e "$PULL/upstart-atlas-sensord" ]; then
  cp -a "$PULL/upstart-atlas-sensord" "$DR/event.d/atlas-sensord"
else
  echo "  note: no upstart-atlas-sensord in \$PULL — motion/orientation sensors won't autostart (see atlas-wpe-env)."
fi
ROLE_SRC="$PULL/ls2-roles/org.webosports.browserserver.json"
[ -e "$ROLE_SRC" ] || ROLE_SRC="$WPE/ls2-roles/org.webosports.browserserver.json"
if [ -e "$ROLE_SRC" ]; then
  mkdir -p "$DR/ls2-roles"
  cp -a "$ROLE_SRC" "$DR/ls2-roles/org.webosports.browserserver.json"
else
  echo "  note: no ls2-roles/org.webosports.browserserver.json found — BrowserServer may fail 'Invalid permissions' (see atlas-wpe-env)."
fi

echo "-- BrowserAdapter plugin"
cp -a "$ADAPTER_SO" "$DR/BrowserPlugins/BrowserAdapterAtlas.so"

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
# Prefer the control scripts vendored in this repo (packaging/), so the package is self-contained.
# Fall back to the copies in the build-environment ($WPE) if the vendored ones are ever removed.
POSTINST="$SCRIPT_DIR/ipk-postinst.sh"; [ -e "$POSTINST" ] || POSTINST="$WPE/ipk-postinst.sh"
PRERM="$SCRIPT_DIR/ipk-prerm.sh";       [ -e "$PRERM" ]    || PRERM="$WPE/ipk-prerm.sh"
cp "$POSTINST" "$CTRL/postinst"
cp "$PRERM"    "$CTRL/prerm"
chmod 755 "$CTRL/postinst" "$CTRL/prerm"

echo "-- assemble ipk (ar: debian-binary + control.tar.gz + data.tar.gz)"
printf '2.0\n' > "$B/debian-binary"
( cd "$CTRL" && tar --owner=0 --group=0 -czf "$B/control.tar.gz" ./control ./postinst ./prerm )
( cd "$DATA" && tar --owner=0 --group=0 -czf "$B/data.tar.gz" ./ )
OUT="$B/${ID}_${VER}_${ARCH}.ipk"
( cd "$B" && ar rc "$(basename "$OUT")" debian-binary control.tar.gz data.tar.gz )
echo "== built: $OUT  ($(du -h "$OUT" | cut -f1)) =="
ar t "$OUT"
