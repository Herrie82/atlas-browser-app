#!/bin/bash
# Deploy the Atlas app to a LuneOS target as a Chromium browser_shell app.
#
# LuneOS has no NPAPI and no <webview> tag (measured: WAM runs with --disable-extensions, so the tag is
# an inert HTMLElement). The only way to embed web content is browser_shell, which SAM launches for apps
# whose appinfo type is "native_browsershell". So this script deploys the SAME source tree as the WPE
# build with two differences applied at deploy time:
#
#   1. appinfo.json "type" is rewritten to native_browsershell  (the engine itself is picked at runtime
#      by source/engine/AtlasHost.js — no source edit, no second branch)
#   2. the LS2 ACG files (role / client-permissions / manifest) are installed, without which every
#      db8, download-manager and settings call the app makes is refused by the hub
#
# Usage:
#   packaging/luneos/deploy-luneos.sh                      # deploy + launch on the default target
#   TARGET=root@192.168.1.50 PORT=22 packaging/luneos/deploy-luneos.sh
#   REPORT=10.0.2.2:8899 packaging/luneos/deploy-luneos.sh # also inject a JS error/log reporter
#   LAUNCH=0 packaging/luneos/deploy-luneos.sh             # copy only, don't launch
set -eu

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP=$(cd -- "$SCRIPT_DIR/../.." && pwd)
ID=org.webosports.app.atlas
DEST=/usr/palm/applications/$ID

TARGET="${TARGET:-root@localhost}"
PORT="${PORT:-5522}"
LAUNCH="${LAUNCH:-1}"
REPORT="${REPORT:-}"

SSHOPT="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p $PORT"
SCPOPT="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -P $PORT"   # scp spells the port -P
sshc() { ssh $SSHOPT "$TARGET" "$@"; }
sshtty() { ssh -tt $SSHOPT "$TARGET" "$@"; }

echo "== deploying $ID to $TARGET:$PORT =="

# 1. Stage the app tree: ship what the app needs, skip repo furniture and the WPE-only packaging.
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
tar -C "$APP" -cf - \
    --exclude=.git --exclude=packaging --exclude=test --exclude='*.psd' --exclude='*.ipk' \
    . | tar -C "$STAGE" -xf -

# 2. Chromium host: SAM must launch us through browser_shell, not WAM.
python3 - "$STAGE/appinfo.json" <<'PY'
import json, sys
p = sys.argv[1]
with open(p) as f:
    info = json.load(f)
info["type"] = "native_browsershell"
info["nativeLifeCycleInterfaceVersion"] = 2
info.setdefault("handlesRelaunch", True)
with open(p, "w") as f:
    json.dump(info, f, indent=2)
print("appinfo type -> native_browsershell")
PY

# 3. Optional dev reporter: browser_shell frequently does not bind its devtools port, so ship the page
#    a way to post errors and enyo.log lines to a collector on the build host.
if [ -n "$REPORT" ]; then
  cat > "$STAGE/source/engine/DevReport.js" <<EOF
(function () {
    var URL = "http://$REPORT/r?d=";
    var buf = [];
    function send(s) { try { var x = new XMLHttpRequest(); x.open("GET", URL + encodeURIComponent(s), true); x.send(); } catch (e) {} }
    window.onerror = function (m, u, l, c, err) {
        buf.push("ERROR " + m + " @" + String(u).split("/").pop() + ":" + l + ":" + c +
                 (err && err.stack ? "\nSTACK " + err.stack : ""));
    };
    var origLog = window.console && console.log;
    if (origLog) { console.log = function () { try { buf.push(Array.prototype.join.call(arguments, " ")); } catch (e) {} origLog.apply(console, arguments); }; }
    setInterval(function () { if (buf.length) { send(buf.splice(0, 40).join("\n")); } }, 2000);
})();
EOF
  sed -i 's|<script src="source/engine/AtlasHost.js"|<script src="source/engine/DevReport.js" type="text/javascript"></script>\n    <script src="source/engine/AtlasHost.js"|' "$STAGE/index.html"
  echo "dev reporter -> $REPORT"
fi

# 4. Copy the tree.
sshc "rm -rf $DEST && mkdir -p $DEST"
tar -C "$STAGE" -czf - . | sshc "tar -C $DEST -xzf -"

# 5. ACG: role + client-permissions + manifest, then make the hub re-read them.
for f in "$SCRIPT_DIR"/sysbus/*.json; do
  base=$(basename "$f")
  case "$base" in
    *.role.json)     scp -q $SCPOPT "$f" "$TARGET:/usr/share/luna-service2/roles.d/$ID.app.json" ;;
    *.perm.json)     scp -q $SCPOPT "$f" "$TARGET:/usr/share/luna-service2/client-permissions.d/$ID.app.json" ;;
    *.manifest.json) scp -q $SCPOPT "$f" "$TARGET:/usr/share/luna-service2/manifests.d/$ID.json" ;;
  esac
done
sshc "ls-control scan-services >/dev/null 2>&1 || true"

# 5b. db8 kinds. On legacy webOS the browser kinds shipped with the stock browser; LuneOS has never had
#     them ("kind not registered: 'com.palm.browserbookmarks:1'"), so bookmarks / history / passwords /
#     autofill would fail silently. Register them (idempotent) and grant the app every operation — the
#     caller name db8 sees carries an instance suffix (org.webosports.app.atlas-1), hence the wildcard.
# A direct putKind is refused ("db: permission denied") because the caller isn't the kind's owner, so
# use the platform path: drop kind + permission files in /etc/palm/db and let the configurator install
# them, exactly as every stock webOS app does. Permissions are granted to a wildcard caller because the
# hub gives a browsershell app an instance suffix (org.webosports.app.atlas-1).
echo "-- registering db8 kinds --"
PERMSTAGE=$(mktemp -d)
for k in "$SCRIPT_DIR"/db8/*.json; do
  name=$(basename "$k" .json)
  kind=$(python3 -c "import json; print(json.load(open('$k'))['id'])")
  python3 - "$kind" > "$PERMSTAGE/$name" <<'PY'
import json, sys
kind = sys.argv[1]
callers = ["org.webosports.app.atlas", "org.webosports.app.atlas*"]
print(json.dumps([{
    "type": "db.kind",
    "object": kind,
    "caller": c,
    "operations": {"read": "allow", "create": "allow", "update": "allow", "delete": "allow"}
} for c in callers], indent=4))
PY
  scp -q $SCPOPT "$k" "$TARGET:/etc/palm/db/kinds/$name"
  scp -q $SCPOPT "$PERMSTAGE/$name" "$TARGET:/etc/palm/db/permissions/$name"
  echo "   $kind"
done
rm -rf "$PERMSTAGE"
sshc "luna-send -n 1 palm://com.palm.configurator/run '{\"types\":[\"dbkinds\"]}' >/dev/null 2>&1; \
      luna-send -n 1 palm://com.palm.configurator/run '{\"types\":[\"dbpermissions\"]}' >/dev/null 2>&1"

# 6. SAM only picks up a newly installed app dir on restart.
sshc "systemctl restart sam.service"
until sshc "systemctl is-active sam.service" 2>/dev/null | grep -q active; do sleep 2; done
sleep 3

if [ "$LAUNCH" = "1" ]; then
  sshtty "luna-send -n 1 -f luna://com.webos.service.applicationmanager/launch '{\"id\":\"$ID\"}'; exit" | tail -n 6
fi
echo "== done =="
