# Atlas Web 0.9.10 — installs on webOS 3.1.0, and stops restarting its own engine

0.9.10 changes **no engine code**. `BrowserServer-atlas`, `libWPEWebKit-2.0.so.1`, `WPEWebProcess`, the
backend and the whole GStreamer stack are byte-for-byte what 0.9.8 and 0.9.9 shipped. What changed is
packaging — how Atlas installs and uninstalls — plus one flag on the engine command line and a
user-triggered engine restart, which lives in the app and in `atlas-sensord`, not in the engine.

## Installs on webOS 3.1.0

On the community **webOS CE 3.1.0** build, installing Atlas failed outright. What the user saw was an
Atlas folder containing nothing, no icon in the launcher, and — if they hand-installed the app on top of
that — a browser that opened and could not load a page.

Three separate defects, all in packaging:

**1. An impossible dependency.** The feed package declared `Depends: org.webosarchive.tls-updates`, the
Modernize bundle that installs OpenSSL 1.1 at `/usr/lib/ssl11`. webOS CE 3.1.0 *bakes that stack into the
OS image* and registers the webos-internals packages it bakes in — but not the bundle, which is marked
`MaxWebOSVersion 3.0.9` and is deliberately not offered on 3.1.0. ipkg checks its own status file, not the
filesystem, and has no notion of OS version at all, so a device that already had everything Atlas needs
still refused:

    ERROR: Cannot satisfy the following dependencies for org.webosports.app.atlas:
             org.webosarchive.tls-updates

and aborted mid-unpack, leaving the empty app folder. **The package now declares no dependencies at all —
it just installs.** Qualifying environments is the feed's job, and the feed can already do it: Preware
drops a package whose `MaxWebOSVersion` is older than the running OS at load time, so a stanza carrying
`Depends: org.webosarchive.tls-updates` pulls the bundle in on 3.0.5 and resolves to nothing on 3.1.0.
One package, both OS versions, no version checking anywhere in the ipk.

**2. The install scripts never ran under webOS's own installer.** There are two install paths and they
disagree about who runs the control scripts. Preware knows that `ipkg -o <root>` skips `postinst`
("offline root mode: not running …") and runs the deferred script itself. `com.palm.appinstaller` — WebOS
Quick Install, a tapped `.ipk`, `installNoVerify` — does not: it runs the same ipkg command, stops, and
instead looks for a `pmPostInstall.script` member in the package. With none there it wrote a 0-byte
placeholder and reported **SUCCESS** for an install whose entire engine half was missing: no browser
plugin, no upstart job, no GPU driver staged, no db8 kinds. That is the "installs fine, opens, renders
nothing" report. The package now ships `pmPostInstall.script` and `pmPreRemove.script` as package members
alongside `postinst`/`prerm`, so both installers do the whole job. Exactly one of the two runs for any
given install, and they are idempotent anyway.

**3. Uninstalling left the folder behind.** `/media/cryptofs` is FUSE: unlinking a file some process still
has open renames it to `.fuse_hidden…` instead of removing it. The boot wrapper starts `qcamd`/`qspkd`/
`qmicd` as children of the engine, and when the engine dies without reaping them they re-parent to init
and keep running — holding their own binaries and the engine libraries open. `prerm` killed only
`BrowserServer-atlas`, so a removal left files no `rm -rf` could take:

    rm: can't remove '.../deviceroot/atlas': Directory not empty
    rm: can't remove '.../deviceroot/wpe-252/lib': Directory not empty

The result was an app folder holding an empty `deviceroot` skeleton — and the next install unpacked on
top of it.

There is a second half to this, found the hard way: because the package now ships `prerm` as
`pmPreRemove.script`, `com.palm.appinstaller` runs it **synchronously from inside LunaSysMgr, before
`ipkg remove`**. The standalone build's `prerm` used to end with `killall LunaSysMgr` — which killed the
process performing the removal. Preware would show the uninstall running, the scripts would execute, Luna
would restart, and the package would still be installed. `prerm` no longer restarts Luna on either target.
`postinst` still does on the standalone target, and that is safe: `pmPostInstall.script` runs *after* ipkg
has finished. `prerm` now stops the helper daemons too and sweeps up any `.fuse_hidden*`; `postinst` sweeps
the debris an older Atlas left behind, and stops the engine *before* it starts laying down new files —
which also fixes an in-place **upgrade** leaving the user on the previous version's binaries until the
next reboot (`start atlas` is a no-op on an upstart job that is already running).

One residue remains and is unavoidable: an in-place upgrade replaces files while LunaSysMgr still has the
old app open, and deleting a file FUSE has already hidden just re-hides it under a new name. That leaves
~1.5 MB of hidden files, which are gone after the next reboot.

## The engine no longer restarts itself while you are reading

`BrowserServer`'s deadlock watchdog decided the main loop was hung when its heartbeat had not advanced
across one interval **and** the process looked idle — which is equally true of a healthy engine that
simply had nothing to do. Measured on an idle tablet with one card open and nobody touching it:

    BrowserServer-atlas: Deadlock detected; aborting! (13 cpu ticks in the last 90000ms)
    BrowserServer-atlas: Deadlock detected; aborting! (155 cpu ticks in the last 90000ms)

Two aborts in six minutes. upstart respawns the engine every time, so cards are torn down and reloaded at
random. That watchdog is now off (`-d 0`).

## Restarting a hung engine, when you say so

Turning the watchdog off leaves the **GPU wedge**
([atlas-wpe-env#3](https://github.com/Herrie82/atlas-wpe-env/issues/3)) unrecoverable on its own: it parks
BrowserServer's main thread in `futex_wait_queue_me` with the process still alive, so nothing reports a
failure. Previously that meant a reboot.

0.9.10 adds a **Restart Browser Engine** item to the app menu. Atlas makes no attempt to detect a hang —
that is deliberate, and it is why the old watchdog was removed. You decide; the app restarts the engine
and reloads your card back onto the page you were reading.

The plumbing exists because the app cannot do it directly: the Enyo front-end runs as `luna` inside
LunaSysMgr and cannot exec, and anything routed through BrowserServer is dead by definition when
BrowserServer is wedged. So `atlas-sensord` — the one root daemon in the package, and one that does not
depend on BrowserServer — grew a **loopback-only** control socket on `127.0.0.1:8442`. A `GET
/restart-engine` there stops the `atlas` job, clears its helper daemons, and starts it again. Nothing
else calls it.

## Verified

On an HP TouchPad running webOS CE 3.1.0 (build 600056), from a completely removed state:

- installs through `com.palm.appinstaller` (the standalone target) — engine set up, GPU driver staged
  from the device's own Adreno blob, LunaSysMgr reloaded by the package
- installs through the Preware sequence (the feed target) — `ipkg -o … install` then the deferred
  `postinst`, LunaSysMgr reload left to `PostInstallFlags=RestartLuna`
- icon in the launcher, app launches, `http://example.com` and `https://en.wikipedia.org/wiki/HP_TouchPad`
  both render (HTTPS against CE 3.1.0's built-in OpenSSL 1.1)
- uninstall through Preware completes and removes the app folder, with no `.fuse_hidden` debris
- engine autostarts on boot and stays up
- **Restart Browser Engine** stops and restarts the engine and reloads the card onto its page, verified
  against a frozen engine (`kill -STOP`, indistinguishable from a wedge)
- two consecutive restarts leave exactly one `atlas-sensord` and no zombies (the first cut leaked one
  per restart; `start atlas` blocks, so the helper double-forks and lets init reap)

## For feed maintainers

Nothing about the ipk changes what your stanza should say — keep
`Depends: org.webosarchive.tls-updates` there, in **plain comma syntax** (Preware's parser splits on `,`
only, so an alternation would reach it as one unknown name and queue nothing). That line is now the only
place the OpenSSL 1.1 requirement is expressed, and it qualifies itself by OS version through
`tls-updates`' existing `MaxWebOSVersion 3.0.9`.

Keep `PostInstallFlags` / `PostUpdateFlags` / `PostRemoveFlags` = `RestartLuna` as before, and make sure
Atlas's own `MaxWebOSVersion` covers 3.1.0 (`3.9.9` today) — the same load-time filter that hides
`tls-updates` from CE devices would otherwise hide Atlas.
