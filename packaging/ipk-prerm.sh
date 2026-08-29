#!/bin/sh
# Atlas Web — pre-removal. Runs as ROOT. Reverses postinst. The app dir itself is removed by the installer.
APP=/media/cryptofs/apps/usr/palm/applications/org.webosports.app.atlas
log() { echo "atlas-prerm: $*"; }

# Packaging target — REWRITTEN AT BUILD TIME by build-ipk-atlas.sh (ATLAS_PKG_TARGET). See ipk-postinst.sh.
# Kept for symmetry with postinst; removal behaves the same either way (see the note at the end).
PKG_TARGET=standalone

log "stopping engine..."
stop atlas 2>/dev/null
stop atlas-sensord 2>/dev/null
# Kill the HELPER DAEMONS too, not just BrowserServer. The boot wrapper backgrounds qcamd/qspkd/qmicd
# and then execs BrowserServer-atlas, so they are its children — and when BS dies without reaping them
# (the deadlock watchdog's abort, a kill -9, an upstart respawn) they re-parent to init and keep running
# forever. The wrapper is fine with that (it skips a helper that is already up), but an UNINSTALL is not:
#
#   /media/cryptofs is FUSE. Unlinking a file that some process still has open does not remove it — the
#   filesystem renames it to .fuse_hiddenXXXXXXXX and keeps it until the last holder closes it. A helper
#   left running holds its own binary and the engine libs open, so the installer's `rm -rf` of the app
#   directory silently leaves those files behind and then cannot remove the directories containing them:
#       rm: can't remove '.../deviceroot/atlas': Directory not empty
#       rm: can't remove '.../deviceroot/wpe-252/lib': Directory not empty
#   What the user is left with is an app folder holding an empty deviceroot skeleton — no app, no icon —
#   and the next install unpacks on top of it. Observed on-device 2026-08-23.
#
# So: TERM everything, give it a moment, then KILL whatever ignored that.
for _p in BrowserServer-atlas qcamd qspkd qmicd atlas-sensord; do killall "$_p" 2>/dev/null; done
sleep 2
for _p in BrowserServer-atlas qcamd qspkd qmicd atlas-sensord; do killall -9 "$_p" 2>/dev/null; done
# Anything still holding a deleted file shows up as .fuse_hidden* under the app dir; with the holders
# gone these are ordinary files again, so remove them before the installer tries to drop the directory.
rm -f "$APP"/deviceroot/atlas/.fuse_hidden* \
      "$APP"/deviceroot/wpe-252/lib/.fuse_hidden* 2>/dev/null
find "$APP" -name '.fuse_hidden*' -exec rm -f {} \; 2>/dev/null

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

# Drop our URL/MIME handler claims. The resolved table is persisted to
# /var/usr/palm/command-resource-handlers-active.json and reloaded at startup, so a
# claim like "^file:" would otherwise keep pointing local media at an app that is no
# longer installed.
#
# BACKGROUNDED ON PURPOSE — and it matters more here than in postinst: this script runs
# SYNCHRONOUSLY from inside LunaSysMgr, before `ipkg remove` (see the note below), and
# com.palm.applicationManager is LunaSysMgr's own service. A blocking `luna-send -n 1`
# would wait on a reply from the process waiting for this script to exit. The `( … & )`
# is load-bearing; do not "simplify" it.
log "removing our URL/MIME handler registrations..."
( luna-send -n 1 palm://com.palm.applicationManager/removeHandlersForAppId \
    '{"appId":"org.webosports.app.atlas"}' & ) >/dev/null 2>&1

# Do NOT restart LunaSysMgr here, on either target. com.palm.appinstaller runs this script as
# pmPreRemove.script SYNCHRONOUSLY, from inside LunaSysMgr, BEFORE `ipkg remove` — so killing Luna kills
# the removal itself: prerm runs, Luna restarts, the package is still installed. Observed 2026-08-23.
# (postinst is safe to restart Luna from: pmPostInstall.script runs AFTER ipkg has finished.)
# Nothing is lost by leaving it — the plugin file is already deleted above, and Luna drops it on its next
# restart or reboot.
log "removal complete."
exit 0
