#!/bin/sh
# Atlas Web — post-install. Runs as ROOT under Preware / WebOS Quick Install (NOT palm-install).
# Lays the bundled engine/adapter/wrapper/upstart into place, points the GPU sonames at the device's
# Adreno driver, and registers the db8 kinds. Reversed by prerm.
APP=/media/cryptofs/apps/usr/palm/applications/org.webosports.app.atlas
DR=$APP/deviceroot
log() { echo "atlas-postinst: $*"; }

# 0. prerequisite: community OpenSSL 1.1 lives in /usr/lib/ssl11 (NOT bundled — we depend on it for TLS 1.3).
[ -e /usr/lib/ssl11/libssl.so.1.1 ] || log "WARNING: /usr/lib/ssl11/libssl.so.1.1 missing — install the webOS OpenSSL 1.1 package first or HTTPS will not work."

# 1+2. The WPE engine + BrowserServer wrapper run IN PLACE from the app's cryptofs deviceroot
#    ($DR/wpe-252, $DR/atlas). NOTHING is copied to /media/internal — that vfat partition is the user's
#    USB storage and must stay free of app internals. The boot wrapper derives its own $DR at runtime.
log "preparing WPE engine (in place on cryptofs deviceroot)..."
chmod 755 "$DR/wpe-252/BrowserServer-atlas" "$DR/atlas/BrowserServer" 2>/dev/null
# GPU: the engine links versioned sonames; supply them from the device's real Adreno driver (not bundled).
# cryptofs (like vfat) has no symlinks, so COPY the driver to the versioned names rather than symlink.
cp -f /usr/lib/libEGL.so    "$DR/wpe-252/lib/libEGL.so.1"
cp -f /usr/lib/libGLESv2.so "$DR/wpe-252/lib/libGLESv2.so.2"
# Bridge symlink: libWPEWebKit's baked install prefix is length-limited (can't hold the long cryptofs path),
# so deploy prefix-patches it to the short /var/atlas252, which we point at the real engine dir on cryptofs.
# (/var is ext3 → supports symlinks; cryptofs/vfat do not.) Removed once WebKit is rebuilt with the cryptofs
# prefix baked in directly (see build-webkit-252.sh TODO).
ln -sfn "$DR/wpe-252" /var/atlas252

# 3+4+5a. The adapter plugin, upstart job, AND db8 kind/permission config files all live on the read-only
#    rootfs (/usr/lib/BrowserPlugins, /etc/event.d, /etc/palm/db) — do all the rootfs writes in one rw window.
#    db8: com.palm.browser* kinds are stock (ours are identical / additive index merge); the app-scoped
#    permission files ADD org.webosports.app.atlas without touching the stock grants; logins/autofill are ours.
log "installing adapter + upstart + db8 config (rootfs rw)..."
mount -o remount,rw / 2>/dev/null
mkdir -p /usr/lib/BrowserPlugins
cp -a "$DR/BrowserPlugins/BrowserAdapterAtlas.so" /usr/lib/BrowserPlugins/BrowserAdapterAtlas.so
chmod 755 /usr/lib/BrowserPlugins/BrowserAdapterAtlas.so
cp -a "$DR/event.d/atlas" /etc/event.d/atlas
chmod 755 /etc/event.d/atlas
# atlas-sensord: HAL accelerometer/gyro bridge for DeviceOrientation/DeviceMotion (system-glibc helper)
cp -a "$DR/event.d/atlas-sensord" /etc/event.d/atlas-sensord
chmod 755 /etc/event.d/atlas-sensord
start atlas-sensord 2>/dev/null || true   # start now; also autostarts on boot (stopped fontconfig_cache)
mkdir -p /etc/palm/db/kinds /etc/palm/db/permissions
cp -a "$APP/db/kinds/."       /etc/palm/db/kinds/
cp -a "$APP/db/permissions/." /etc/palm/db/permissions/
# LunaService role: authorises BrowserServer-atlas to register org.webosports.browserserver. Install into
# the ROOTFS ls2 roles (NOT /var/palm/ls2 — a device reset/GC wipes /var and this file with it, after
# which startService() fails 'Invalid permissions' and BS exits 255 with WebKit already up). prv + pub.
ROLE="$DR/ls2-roles/org.webosports.browserserver.json"
[ -f "$ROLE" ] || ROLE="$APP/deviceroot/ls2-roles/org.webosports.browserserver.json"
if [ -f "$ROLE" ]; then
  cp -a "$ROLE" /usr/share/ls2/roles/prv/org.webosports.browserserver.json
  cp -a "$ROLE" /usr/share/ls2/roles/pub/org.webosports.browserserver.json
fi
sync
mount -o remount,ro / 2>/dev/null
ls-control scan-services 2>/dev/null || true

# 5b. register db8 kinds (then permissions) via the supported configurator path — same as the boot flow.
log "registering db8 kinds..."
luna-send -n 1 palm://com.palm.configurator/run '{"types":["dbkinds"]}'       2>/dev/null
luna-send -n 1 palm://com.palm.configurator/run '{"types":["dbpermissions"]}' 2>/dev/null

# 6. start the engine + reload LunaSysMgr (picks up the new NPAPI plugin for application/x-atlas-browser).
log "starting atlas engine + reloading LunaSysMgr..."
start atlas 2>/dev/null
killall LunaSysMgr 2>/dev/null
log "install complete."
exit 0
