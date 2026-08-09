# Atlas Web — IPK packaging

Builds a single self-contained `.ipk` bundling all four components (this enyo app + the WPE WebKit
engine + the BrowserServer engine host + the BrowserAdapter plugin) for a **clean** webOS 3.0.5 device.

Install with **Preware** or **WebOS Quick Install** — they run `postinst`/`prerm` as root.
`palm-install` does **not** run the scripts, so it will not set up the engine/adapter/db8.

## Build

`build-ipk.sh` finds **this repo** from its own location (no editing needed), and takes the large ARM
build artifacts — the engine, `BrowserServer`, and adapter — from two sibling projects via a few
environment variables. It runs a **preflight** that names any missing artifact and where to get it.

    packaging/build-ipk.sh                                    # uses the defaults below
    WPE=~/webos/wpe ADAPTER_SO=~/build/BrowserAdapterAtlas.so packaging/build-ipk.sh

| Variable     | Default                        | What it points at | Source repo |
|--------------|--------------------------------|-------------------|-------------|
| `WPE`        | `$HOME/webos/wpe`              | build-environment root: `deploy-252-jitfix/`, `browserserver-wpe/`, `ipk-build/pull/` | [atlas-wpe-env](https://github.com/Herrie82/atlas-wpe-env) |
| `ADAPTER_SO` | `/tmp/BrowserAdapterAtlas.so`  | the compiled NPAPI adapter plugin | [atlas-wpe-backend](https://github.com/Herrie82/atlas-wpe-backend) |
| `STRIP`      | autodetected on `PATH`         | cross-`strip` for the `BrowserServer` binary (optional — skipped if absent) | your ARM toolchain |
| `IPK_BUILD_DIR` | `$WPE/ipk-build`            | scratch + output directory | — |

The `postinst` / `prerm` control scripts are **vendored in this directory** (`ipk-postinst.sh`,
`ipk-prerm.sh`), so the package is self-contained; the build falls back to `$WPE/ipk-*.sh` only if the
vendored copies are removed. Keep them in sync with [atlas-wpe-env](https://github.com/Herrie82/atlas-wpe-env)
when the on-device install flow changes.

> **Which builder to use.** There are two. This one assembles the package from a *pre-built* engine
> deploy set (`deploy-252-jitfix`). The releases actually shipped since 0.9.7 are built by
> **[`atlas-wpe-env/build-ipk-atlas.sh`](https://github.com/Herrie82/atlas-wpe-env)** (see BUILDING.md
> §7), which builds `BrowserServer-atlas` and the backend from source and overlays them onto a
> reference deviceroot — that is what produced the ~99 MB `0.9.8` ipk. Use that one unless you
> specifically have a `deploy-252-jitfix` tree to package. Note that 0.9.8's engine-hang recovery spans
> this repo *and* BrowserServer *and* the boot wrapper, so an app-only package does not carry it.

Produces `org.webosports.app.atlas_<version>_all.ipk` (~56 MB with the `deploy-252-jitfix` engine set;
the from-source builder above yields ~99 MB, ~209 MB installed). `build-ipk.sh` assembles:

- the app (this repo) under `usr/palm/applications/org.webosports.app.atlas/`
- a bundled `deviceroot/` holding the **stripped** engine (`deploy-252-jitfix` set), the
  `BrowserServer-atlas` binary, the boot wrapper, the `atlas` + `atlas-sensord` upstart jobs, the
  LunaService role file, and the adapter plugin
- `control` + `postinst` + `prerm`

> Only the **app front-end** in this repo can be packaged with the webOS SDK alone
> (`palm-package <appdir>`), which is handy for validating app changes. A **complete, installable**
> browser ipk additionally needs the engine/BrowserServer/adapter artifacts from the two sibling repos
> above — the preflight will tell you exactly which ones are missing.

## Two distribution targets

The same engine payload is packaged two ways, because a package manager and a hand install need opposite
behaviour. Build whichever you are shipping (both live in [atlas-wpe-env](https://github.com/Herrie82/atlas-wpe-env)):

    ./build-ipk-feed.sh         # -> $OUT/feed/org.webosports.app.atlas_<ver>_all.ipk
    ./build-ipk-standalone.sh   # -> $OUT/standalone/...   (ATLAS_PKG_TARGET=feed|standalone)

|                              | `feed` (Preware / WOSA Modernize) | `standalone` (WOQI, direct download, by hand) |
|------------------------------|-----------------------------------|-----------------------------------------------|
| `postinst`/`prerm` restart Luna | **no** — a batch installer runs *under* LunaSysMgr, so an inline restart kills it and abandons the rest of the dependency chain | **yes** — there is no installer to defer to, and the plugin is invisible until Luna reloads |
| Restart declared as metadata | `PostInstallFlags`/`PostUpdateFlags`/`PostRemoveFlags` = `RestartLuna` | — |
| `Depends:`                   | the feed's OpenSSL 1.1 package (`FEED_DEPENDS`, default `org.webosarchive.tls-updates`) — Atlas needs `/usr/lib/ssl11` for HTTPS | none — nothing would resolve it |

`data.tar.gz` is **byte-identical between the two targets** (verified); only `control.tar.gz` differs, so
a feed can index these bits without repacking. Payload mtimes are stamped from the app repo's HEAD commit
(`SOURCE_DATE_EPOCH` overrides), so rebuilding the same commit reproduces the same payload md5 instead of
churning it — but the stamp still moves release to release, which GStreamer needs in order to invalidate
its cached plugin registry.

**Preware reads the restart flags from the feed's `Packages` index, not from the ipk control**, so a feed
must copy them into its own stanza; ours is there to be self-describing and to copy from. The display half
of `Source` (`Feed`, `Category`, `Title`, `FullDescription`, `Icon`, `DeviceCompatibility`, `LastUpdated`)
stays out of the ipk deliberately — that is per-feed catalog metadata.

Either target can be forced to restart Luna at install/remove time with `ATLAS_POSTINST_RESTART_LUNA=1` /
`ATLAS_PRERM_RESTART_LUNA=1`.

Both targets ship **the GPU driver under all three names the engine asks for** (`libEGL.so.1`,
`libGLESv2.so.2`, and the unversioned `libEGL.so` the vendor GLESv2 blob NEEDs). The build refuses to
produce an ipk without them; `postinst` prefers the device's own driver and falls back to these.

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
