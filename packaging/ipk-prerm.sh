#!/bin/sh
# Atlas Web — pre-removal. Runs as ROOT. Reverses postinst. The app dir itself is removed by the installer.
log() { echo "atlas-prerm: $*"; }

log "stopping engine..."
stop atlas 2>/dev/null
killall BrowserServer-atlas 2>/dev/null
stop atlas-sensord 2>/dev/null
killall atlas-sensord 2>/dev/null

log "removing rootfs components (rw)..."
mount -o remount,rw / 2>/dev/null
rm -f /usr/lib/BrowserPlugins/BrowserAdapterAtlas.so
rm -f /etc/event.d/atlas
rm -f /etc/event.d/atlas-sensord
sync
mount -o remount,ro / 2>/dev/null

# Engine + wrapper live in the app's cryptofs deviceroot and are removed with the app dir by the installer —
# nothing to clean under /media/internal (we no longer copy anything there).
rm -f /var/atlas252   # the bridge symlink -> cryptofs engine dir (see postinst)

# Remove ONLY our own db8 kind/permission files. Leave com.palm.browser* in place — they are the stock
# kinds (ours only added an index); deleting the files would strip the stock browser's registration too.
log "removing our db8 kind files..."
rm -f /etc/palm/db/kinds/org.webosports.logins       /etc/palm/db/kinds/org.webosports.autofill
rm -f /etc/palm/db/permissions/org.webosports.logins /etc/palm/db/permissions/org.webosports.autofill

# No `killall LunaSysMgr` here either — same reason as postinst: a removal can be one step of a batch
# (Preware dependency chain), and restarting Luna mid-batch takes the installer down with it. Removal is
# declared PostRemoveFlags=RestartLuna so the installer does it once, at the end. Set
# ATLAS_PRERM_RESTART_LUNA=1 when removing by hand and you want the plugin unloaded immediately.
if [ "${ATLAS_PRERM_RESTART_LUNA:-0}" = 1 ]; then
    log "ATLAS_PRERM_RESTART_LUNA=1 — restarting LunaSysMgr now"
    killall LunaSysMgr 2>/dev/null
else
    log "NOTE: restart Luna or reboot to finish unloading the browser plugin."
fi
log "removal complete."
exit 0
