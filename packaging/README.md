# Atlas Web — IPK packaging

Builds a single self-contained `.ipk` bundling all four components (this enyo app + the WPE WebKit
engine + the BrowserServer engine host + the BrowserAdapter plugin) for a **clean** webOS 3.0.5 device.

Install with **Preware** or **WebOS Quick Install** — they run `postinst`/`prerm` as root.
`palm-install` does **not** run the scripts, so it will not set up the engine/adapter/db8.

## Build

    bash packaging/build-ipk.sh   # (from ~/webos/wpe — it references the host build outputs)

Produces `org.webosports.app.atlas_<version>_all.ipk` (~56 MB). `build-ipk.sh` assembles:

- the app (this repo) under `usr/palm/applications/org.webosports.app.atlas/`
- a bundled `deviceroot/` holding the **stripped** engine (`deploy-252-jitfix` set), the
  `BrowserServer-atlas` binary, the boot wrapper, the `atlas` upstart job, and the adapter plugin
- `control` + `postinst` + `prerm`

## What is intentionally NOT bundled (dependencies on the device)

- **OpenSSL 1.1** — depends on the community `/usr/lib/ssl11` package (the wrapper's `LD_LIBRARY_PATH`
  resolves it). Install that package first or HTTPS/TLS 1.3 will not work.
- **EGL / GLESv2** — byte-identical to the device's Adreno driver (`/usr/lib/libEGL.so`,
  `/usr/lib/libGLESv2.so`); `postinst` copies them to the versioned sonames the engine links
  (`/media/internal` is vfat, so it copies rather than symlinks).

## db8 kinds / permissions

`db/kinds` (bookmarks/history/preferences are stock — ours match / add indexes additively; logins/autofill
are ours) and `db/permissions` are copied to `/etc/palm/db/{kinds,permissions}` **inside the rootfs-rw
window** and registered via `com.palm.configurator` (kinds first, then permissions). The stock browser's
permission files are left untouched — our grants are **additive, app-scoped** files
(`org.webosports.app.atlas.browser*`) that only add `org.webosports.app.atlas` as a caller.

## Verify / test

    ar t <file>.ipk                                  # ar members
    tar tzf <(ar p <file>.ipk control.tar.gz)        # control/postinst/prerm

Clean-install test: run `prerm` + remove the app dir, extract `data.tar.gz` into `/media/cryptofs/apps`,
run `postinst` as root — the same path Preware takes.
