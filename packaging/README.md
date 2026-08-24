# Atlas Web — IPK packaging

Builds a single self-contained `.ipk` bundling all four components (this enyo app + the WPE WebKit
engine + the BrowserServer engine host + the BrowserAdapter plugin) for a **clean** webOS 3.0.5 **or
webOS CE 3.1.0** device. One package covers both; see [Depends](#why-depends-is-an-alternation).

Install with **Preware** or **WebOS Quick Install**. `palm-install` does **not** run any install
script, so it will not set up the engine/adapter/db8.

> **The two installers do not agree on who runs the control scripts** (measured on-device, webOS CE
> 3.1.0). `ipkg -o <root> install` — which both of them use — *defers* `postinst`:
>
>     Configuring org.webosports.app.atlas
>     (offline root mode: not running org.webosports.app.atlas.postinst)
>
> **Preware** (`org.webosinternals.ipkgservice`) knows this and runs the deferred script itself as a
> second step: `IPKG_OFFLINE_ROOT=/media/cryptofs/apps /bin/sh <info>/<pkg>.postinst`.
>
> **`com.palm.appinstaller`** (WebOS Quick Install, tapping an `.ipk`, `installNoVerify`) does not. It
> stops after ipkg and instead extracts the package with `ar x` and runs `pmPostInstall.script` (and
> `pmPreRemove.script` on removal) **as root** — webOS package format v2. With no such member it writes
> a 0-byte placeholder and reports `SUCCESS` for an install that never set up the engine: the browser
> opens and renders nothing.
>
> So the package ships the same two scripts **twice**: as `postinst`/`prerm` inside `control.tar.gz` for
> the Preware path, and as `pmPostInstall.script`/`pmPreRemove.script` ar members for the appinstaller
> path. Only one of the two ever runs for a given install, and they are idempotent regardless.

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
- `control` + `postinst` + `prerm` inside `control.tar.gz`, **and** the same two scripts again as the
  ar members `pmPostInstall.script` / `pmPreRemove.script` (see the installer note at the top — the two
  install paths look for different names)

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
| `postinst` restarts Luna | **no** — a batch installer runs *under* LunaSysMgr, so an inline restart kills it and abandons the rest of the dependency chain | **yes** — there is no installer to defer to, and the plugin is invisible until Luna reloads |
| `prerm` restarts Luna | **never, on either target** — `com.palm.appinstaller` runs `prerm` (as `pmPreRemove.script`) synchronously from inside LunaSysMgr **before** `ipkg remove`, so killing Luna there kills the removal itself: the scripts run, Luna restarts, the package is still installed. `postinst` is safe because `pmPostInstall.script` runs *after* ipkg. | |
| Restart declared as metadata | `PostInstallFlags`/`PostUpdateFlags`/`PostRemoveFlags` = `RestartLuna` | — |
| `Depends:`                   | **none** by default (`FEED_DEPENDS=` to override) — the feed's stanza declares it instead; see below | none — nothing would resolve it |

### The package does not check anything — the feed qualifies environments

Atlas needs OpenSSL 1.1 at `/usr/lib/ssl11`. That requirement is real on **webOS 3.0.x** and *absent* on
**webOS CE 3.1.0**, which bakes the whole TLS 1.3 stack into the OS image. So it is a per-environment
requirement — and the ipk is the wrong place to express it:

**ipkg has no notion of OS version.** It enforces `Depends:` against its own status file, and it does so
*before* any script of ours runs. CE 3.1.0 registers the `org.webosinternals.*-tls13` packages it bakes
in, but not `org.webosarchive.tls-updates` — that is the Modernize *bundle*, `MaxWebOSVersion 3.0.9`, and
deliberately not offered there. A hard `Depends: org.webosarchive.tls-updates` therefore failed on a
device that already had everything Atlas needs:

    ERROR: Cannot satisfy the following dependencies for org.webosports.app.atlas:
             org.webosarchive.tls-updates

and ipkg aborted mid-unpack, leaving the app directory half-created (empty `deviceroot`, no launcher
icon). **So the package ships no `Depends:` at all. It just installs.**

The requirement lives in the **feed's `Packages` stanza**, which *can* qualify environments, because
Preware's `loadPackage()` drops a package whose `MaxWebOSVersion` is older than the running OS — it
removes it from the loaded set, not merely from the display — and `getDependencies()` only queues names
it can find there:

| device | `org.webosarchive.tls-updates` (min 3.0.5, max 3.0.9) | result |
|--------|------------------------------------------------------|--------|
| webOS 3.0.5   | loads | queued as a dependency → the bundle is pulled in, as before |
| webOS CE 3.1.0 | filtered out at load | dependency resolves to nothing → Atlas installs alone |

Verified against Preware 1.9.18 on-device. Two things to get right in the stanza:

- **Plain comma syntax.** Preware's `Depends` parser splits on `,` only, so an alternation (`A | B`)
  reaches it as one unknown package name and queues nothing — on 3.0.5 too.
- **`MaxWebOSVersion` on Atlas itself must cover 3.1.0** (it is `3.9.9` today), or the same `loadPackage()`
  filter hides Atlas from CE devices entirely.

One consequence, accepted deliberately: a feed ipk installed **by hand** on a bare 3.0.5 with no OpenSSL
1.1 will install and have no working HTTPS. `postinst` logs a warning when `/usr/lib/ssl11/libssl.so.1.1`
is missing; nothing blocks the install.

## Uninstall: the helper daemons must die first

`/media/cryptofs` is **FUSE**. Unlinking a file that some process still has open does not remove it — the
filesystem renames it to `.fuse_hiddenXXXXXXXX` and keeps it until the last holder closes it.

The boot wrapper backgrounds `qcamd` / `qspkd` / `qmicd` and then execs `BrowserServer-atlas`, so they are
its children. When the engine dies without reaping them (a `kill -9`, an upstart respawn, the deadlock
watchdog's abort back when it was on) they re-parent to init and keep running. The wrapper is fine with
that — it skips a helper that is already up — but an uninstall is not: a live helper holds its own binary
and the engine libraries open, so the installer's `rm -rf` of the app directory leaves those files behind
and then cannot remove the directories containing them:

    rm: can't remove '.../deviceroot/atlas': Directory not empty
    rm: can't remove '.../deviceroot/wpe-252/lib': Directory not empty

What the user is left with is an app folder holding an empty `deviceroot` skeleton — no app, no launcher
icon — and the next install unpacks on top of it. `prerm` therefore stops **all** of
`BrowserServer-atlas qcamd qspkd qmicd atlas-sensord` (TERM, then KILL) and sweeps any `.fuse_hidden*`;
`postinst` sweeps the same debris on the way in, for devices that removed an older Atlas, and stops the
engine *before* sweeping (also so an in-place **upgrade** does not leave the user running the binaries it
just replaced — `start atlas` is a no-op on an already-running upstart job).

One residue this cannot clear: an **in-place upgrade** overwrites files while LunaSysMgr still has the old
app open, and deleting a file FUSE has already hidden simply re-hides it under a new `.fuse_hidden` name.
So an upgrade typically leaves ~1.5 MB of hidden files behind. Measured: they are **gone after the next
reboot** (cryptofs is re-initialised at boot), so this is transient, not a leak — but it is why a removal
run immediately after an upgrade can still report *"Directory not empty"*. Reboot first if you need a
guaranteed-clean removal.

## Verify / test

    ar t <file>.ipk                                  # ar members: debian-binary, control.tar.gz,
                                                     # data.tar.gz, pmPostInstall.script, pmPreRemove.script
    tar tzf <(ar p <file>.ipk control.tar.gz)        # control/postinst/prerm
    ar p <file>.ipk control.tar.gz | tar xzO ./control | grep -E 'Version|Depends'

Clean-install test, **the Preware path** (this is what the feed target is built for):

    /usr/bin/ipkg -o /media/cryptofs/apps -force-overwrite install <file>.ipk
    IPKG_OFFLINE_ROOT=/media/cryptofs/apps /bin/sh \
        /media/cryptofs/apps/usr/lib/ipkg/info/org.webosports.app.atlas.postinst
    killall LunaSysMgr        # what PostInstallFlags=RestartLuna does for you

Clean-install test, **the appinstaller path** (what the standalone target is built for) — it restarts
LunaSysMgr itself, which kills the subscription, so the final `SUCCESS` is often never delivered even
though the install completed:

    luna-send -i -a com.palm.appinstaller palm://com.palm.appinstaller/installNoVerify \
        '{"target":"/media/internal/<file>.ipk","subscribe":true}'

Afterwards, check that the engine half actually landed — this is the part a silent `postinst` failure
takes out:

    ls -l /usr/lib/BrowserPlugins/BrowserAdapterAtlas.so /etc/event.d/atlas /var/atlas252
    ls -l .../deviceroot/wpe-252/lib/libEGL.so.1     # should be the DEVICE's driver (171517 bytes),
                                                    # not the bundled fallback
    ps -ef | grep BrowserServer-atlas                # should be running, with -d 0
