#!/bin/bash
# Clean-build the Atlas Web APP front-end into an ipk using ONLY the webOS SDK (palm-package).
# This is the self-contained, from-scratch build of THIS repo — no sibling repos, no cross-toolchain,
# no engine artifacts. It proves the app packages cleanly and is handy for validating app changes.
#
# NOTE: the ipk this produces contains the app front-end only — it is NOT the full installable browser.
# For a complete browser ipk (app + WPE engine + BrowserServer + adapter) use build-ipk.sh, which pulls
# the ARM build artifacts from the atlas-wpe-env / atlas-wpe-backend sibling projects.
#
# Requires: palm-package (HP webOS SDK / novacom tools) on PATH.
#
# Usage:
#   packaging/build-app-ipk.sh                 # writes the ipk next to the repo
#   OUT=/tmp packaging/build-app-ipk.sh        # write it somewhere else
set -eu

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
APP=$(cd -- "$SCRIPT_DIR/.." && pwd)
ID=org.webosports.app.atlas
OUT="${OUT:-$APP}"

command -v palm-package >/dev/null || {
  echo "error: palm-package not found on PATH — install the webOS SDK (novacom/palm tools) first." >&2
  exit 1
}

VER=$(sed -n 's/.*"version"[^"]*"\([^"]*\)".*/\1/p' "$APP/appinfo.json")
echo "== Atlas app ipk  id=$ID  version=$VER =="

# 1. CLEAN: stage a pristine app tree (only the files that ship — no .git, packaging/, test/, .psd, etc.).
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
DEST="$STAGE/$ID"
mkdir -p "$DEST"
echo "-- staging app files"
for f in appinfo.json index.html depends.js source css images db \
         icon.png icon-256x256.png icon-64x64.png icon-48x48.png; do
  cp -a "$APP/$f" "$DEST/"
done

# 2. REBUILD / RE-PACKAGE with the SDK.
echo "-- palm-package"
rm -f "$OUT/${ID}_${VER}_all.ipk"
palm-package "$DEST" -o "$OUT"

IPK="$OUT/${ID}_${VER}_all.ipk"
echo "== built: $IPK  ($(du -h "$IPK" | cut -f1)) =="
ar t "$IPK"
