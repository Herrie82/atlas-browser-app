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

killall LunaSysMgr 2>/dev/null
log "removal complete."
exit 0
