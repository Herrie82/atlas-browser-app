# Atlas Web

Atlas Web is an Enyo 1 web browser app that runs on **two platforms, with two different engines,
from one source tree**:

| Target | Engine | How the page is embedded |
|--------|--------|--------------------------|
| **webOS 3.0.5** (HP TouchPad, Pre 3) | **WPE WebKit 2.52**, cross-built for ARMv7 | NPAPI plugin → BrowserAdapter → BrowserServer (yap IPC) |
| **LuneOS** | **Chromium 120** (the platform's own `webruntime`) | `browser_shell` native page views (`window.shell` / `PageView`) |

On webOS it is a *separate* browser: it never touches Palm's system `/usr/bin/BrowserServer` or the
stock WebKit, so the 2011 hardware gets a current-era JavaScript engine (ES2022, JIT) without
disturbing anything else. On LuneOS it reuses the Chromium that is already on the device, so nothing
has to be rebuilt. It is the **Atlas rebrand** (`org.webosports.app.atlas`) of the earlier Isis browser.

The UI — cards/tabs, address bar, bookmarks, history, downloads, passwords, autofill, reader mode — is
the same on both.

## How one app drives two engines

Everything engine-specific sits behind one seam: the Enyo `WebView` control. `source/engine/` decides
which implementation is live, at runtime:

| File | Role |
|------|------|
| `source/engine/AtlasHost.js` | Picks the host by capability: `window.shell` + `PageView` ⇒ `chromium`, otherwise `wpe`. Sets `window.__atlasHost` / `__atlasChromium`. Overridable with `window.__atlasHostForce` (packaging) or `?atlasEngine=` (testing). |
| `source/AtlasEngineOverride.js` | **WPE host.** Points the framework's `WebView` at our NPAPI mime (`application/x-atlas-browser`) and routes engine callbacks (saved logins, reader content, OAuth redirects, selection bounds). |
| `source/engine/ShellPalmSystem.js` | **Chromium host.** Supplies the `PalmSystem` object `browser_shell` does not inject (launch params, deviceInfo, clipboard, keyboard, relaunch), on top of `window.shell`. |
| `source/engine/ChromiumWebView.js` | **Chromium host.** Reimplements `enyo.WebView` on `PageView`/`pageContents`: navigation, load events, dialogs, zoom, thumbnails, plus an injected in-page bridge for taps, scrolling and the long-press hit test. |
| `source/engine/TabLayer.js` | **Chromium host.** `browser_shell` gives an app one window, so webOS *cards* become in-app *tabs*. |
| `source/engine/ChromiumOverlay.js` | **Chromium host.** A page view is composited *above* the UI page, so it is clipped (or hidden) whenever Atlas draws a menu, dialog or drawer over it. |

Everything in `source/engine/` except `AtlasHost.js` is inert on the other host. Note that the files
are still *parsed* on webOS, whose WebKit predates ES6 — keep them ES5 unless they are made to load
conditionally.

## Architecture

### webOS — WPE WebKit

| Component | Repo / path | Role |
|-----------|-------------|------|
| Enyo UI app | this repo | cards, toaster drawer, dialogs, start page |
| WPE backend | [`atlas-wpe-backend`](https://github.com/Herrie82/atlas-wpe-backend) | `libWPEBackend-atlas.so` + `BrowserPageWPE.cpp` (compiled into the BrowserServer) |
| Build env | [`atlas-wpe-env`](https://github.com/Herrie82/atlas-wpe-env) | cross-build scripts, engine deploy set, device-pulled bits, install scripts |
| BrowserServer | `doctor305/BrowserServer` | yap-IPC server hosting the WPE engine |
| BrowserAdapter | `BrowserAdapter` (LunaCE plugin) | paints the engine's offscreen buffer into the card |

Engine: WPE WebKit 2.52.4, softfp ARMv7 (Thumb2), `-mtune=cortex-a8 -mfpu=neon`, glibc 2.25,
crosstool-NG GCC 12.5. **On-device layout:** engine under `/media/internal/wpe-252`, boot wrapper
`/media/internal/atlas/BrowserServer` (upstart job `atlas`, `BROWSERSERVER_NAME=atlas` → socket
`/tmp/yapserver.atlas`), adapter `/usr/lib/BrowserPlugins/BrowserAdapterAtlas.so`.

### LuneOS — Chromium browser_shell

LuneOS has no NPAPI, and the Chromium `<webview>` tag is unavailable (WAM runs with
`--disable-extensions`, so the tag is an inert element). The only way to embed web content is
**browser_shell**, which SAM launches for an app whose `appinfo.json` type is `native_browsershell`.
Its page views are *native* views the shell composites — they are not DOM nodes and cannot be laid out
by CSS. `ChromiumWebView` therefore renders an empty placeholder div and keeps the native view glued to
that div's rectangle.

Consequences worth knowing before changing this code:

- **The page paints above the UI.** Anything Atlas draws over the page area is invisible until the view
  yields. `ChromiumOverlay` clips the view around an edge drawer, and hides it for a popup mid-screen.
- **Keyboard focus is the shell's, not the DOM's.** A UI field only receives key events after
  `shell.shellWindow.pageView.pageContents.setFocus()`; typing on the on-screen keyboard still works
  without it (the IME inserts text directly), which makes the symptom look like a broken key handler.
- **`pageContents.url` follows subframes**, so the address bar and history are driven by the main
  frame's own `location`, reported by the injected bridge.

## Repository layout

| Path | Contents |
|------|----------|
| `source/` | the Enyo 1 app |
| `source/engine/` | host detection and the two engine bindings (above) |
| `css/`, `images/` | app styling and art |
| `db/kinds`, `db/permissions` | db8 definitions for bookmarks, history, preferences, logins, autofill |
| `sysbus/` | LS2 role / client-permissions / manifest |
| `packaging/` | legacy webOS ipk tooling (`build-app-ipk.sh`, `build-ipk.sh`, postinst/prerm) |

The LuneOS **bitbake recipe** lives outside this repo, in
`meta-webos-ports/meta-luneos/recipes-luneos/apps/org.webosports.app.atlas.bb`.

## Building and packaging

### webOS (ipk)

- **App only** — plain Enyo 1, no compile step: `palm-package <path-to-this-repo>`, or
  `packaging/build-app-ipk.sh`. Handy for validating an app change.
- **Complete browser** (app + engine + BrowserServer + adapter): `packaging/build-ipk.sh`, which takes
  the ARM build artifacts from [`atlas-wpe-env`](https://github.com/Herrie82/atlas-wpe-env) /
  [`atlas-wpe-backend`](https://github.com/Herrie82/atlas-wpe-backend) via `WPE=` / `ADAPTER_SO=`
  (its preflight lists anything missing). See `packaging/README.md`.
- **db8 kinds** are installed from `db/` by the ipk's postinst into `/etc/palm/db/{kinds,permissions}`
  and registered by `com.palm.configurator` — never by a shell `putKind`.

### LuneOS (bitbake)

`bitbake org.webosports.app.atlas`, then install the ipk (the app is in
`packagegroup-luneos-extended`, and is the default browser via
`VIRTUAL-RUNTIME_com.webos.app.browser`).

The recipe ships this tree as-is and applies the platform differences at package time, so the source
stays single-target:

- `appinfo.json` type → `native_browsershell`, and `http`/`https` registered so Atlas is the default
  browser. The tree deliberately does **not** claim those schemes: on webOS that would fight the stock
  browser for the default-browser role.
- db8 kind **owner** → the app. The kinds belong to `com.palm.app.browser`, the legacy stock browser;
  that service does not exist on LuneOS and db8 silently refuses a kind whose owner is unknown.
- db8 permission **caller** → `org.webosports.app.atlas*`. The hub gives a browsershell app an
  instance-suffixed name (`org.webosports.app.atlas-1`) that an exact caller never matches.

enactbrowser stays installed on LuneOS even though Atlas is the default: `run_browser_shell` loads its
`pdf.js` as a Chromium extension for *every* browsershell app, so removing it would take Atlas's
in-browser PDF with it.

## Features

Shared by both hosts: bookmarks, history and downloads drawers; address-bar autocomplete over history
and bookmarks; **password manager** (searchable, swipe-to-delete, show/hide, CSV import/export in
Chrome format); **form autofill manager**; **save-login prompt**; SSL and HTTP-auth dialogs; private
browsing; **start page** bookmark grid with launcher-style drag-to-reorder; **reading mode**;
**translate page**; search across bookmarks/history/passwords via db8's `searchText` index.

**webOS / WPE only**

- **Modern JS engine** — ES2022, WebKit 620-era, **JIT including DFG**: ~3× faster than the C_LOOP
  interpreter on integer/logic code, ~1.25× on Math-heavy code. Getting DFG correct on this softfp
  target required fixing a soft-float FP-call ABI hole in JSC's `CCallHelpers` (modern WebKit assumes
  hardfp) by porting WebKit 2.34's softfp argument/return marshalling forward. Runs single-process
  (`WEBKIT_USE_SINGLE_WEB_PROCESS`) with low-RAM env tuning.
- **Legacy-webOS text selection** — long-press selects a word with a persistent yellow highlight,
  draggable start/end markers, and a segmented Copy | Select All popover. Runs the full app →
  BrowserAdapter → BrowserServer → engine chain via an `extendSelectionTo` IPC command.
- **Large clipboard payloads** — yap IPC buffers grow dynamically to 512 KB (24-bit length header)
  instead of a fixed 16 KB, so Select All → Copy no longer overflows the pipe.
- **Editable-field context menu** — Select | Select All | Paste, with cross-app paste through
  `PalmSystem.paste()`.
- **Content blocker** — WebKit content-rules blocking ads and trackers.
- **TLS 1.3** — process-private OpenSSL 1.1 for the BrowserServer (system `libssl` untouched).
- **Stability hardening** — a static + dynamic analysis pass (cppcheck / clang-tidy / valgrind +
  ASan/UBSan) fixed a class of **use-after-free** bugs where async engine callbacks and timers could fire
  after their card had been freed (they now check a live-page set), plus destructor leaks and yap-IPC
  length-validation / leak issues. The 512 KB dynamic yap buffer path was verified clean under a
  host-native sanitizer harness.
- **Engine-restart recovery** — when the engine dies or wedges, the card no longer strands. It shows
  *"Browser engine stopped — restarting…"*, waits for the respawn, then **reloads itself back onto the
  page you were on**. Three parts, one per repo:
  1. *Detect fast* — BrowserServer's yap deadlock watchdog now aborts only when the main loop is
     stalled **and** the process is idle (`YapServer.cpp`). A memory-pressure GC pegs a core and is
     given more time; a wedge sits near-idle and is killed at once. That gate is what makes a short
     timeout safe, so the boot wrapper drops `-d` from 600000 to **90000**.
  2. *Respawn* — upstart's `respawn limit 0 0` on the `atlas` job brings the engine straight back,
     reaping orphaned WebProcesses on the way up.
  3. *Rejoin* — the card reloads its own document (`Browser.engineDisconnected`). Nothing less works:
     a plugin instance whose BrowserServer died cannot be re-connected in place, and a card cannot
     close itself to be replaced. The page is carried across the reload in `window.name`, because
     launch params come back empty.

  Measured on-device 2026-08-03 against a real wedge: **14 min 30 s → 63 s**, page restored
  automatically. Before this, users had no recourse but a reboot.

- **In-app tabs** with a tab strip, since the shell gives the app a single window. Background tabs
  suspend their DOM and media.
- **Chromium's own text selection and handles** — the WPE marker/popover UI is not used.
- **Find-in-page with a match count and highlight-all**, done by a script injected into the page: it
  walks the text nodes and paints matches with the CSS Custom Highlight API, so unlike a `<mark>`-based
  highlighter it never mutates the page DOM. Next/previous wrap around, and the count appears in the
  find bar (the WPE host reports no count, so there the counter stays empty).
- **HTML fullscreen** — a page going fullscreen takes the whole window and the tab strip gets out of
  the way, instead of staying letterboxed inside the content area.
- **Favicons straight from the page**, since the UI page is itself Chromium and can load them; the WPE
  host has to have the engine download them to the app bundle first.
- Private tabs get a throwaway Chromium partition.
- Page dialogs, HTTP auth and the long-press context menu come from the shell's own events.
- `html5test.co` scores **574/588** on this engine (WPE scores ~535).

The stack is now **atlas-only**: the earlier Isis engine has been fully **decommissioned** — all
`isis*` upstart jobs, plugins, binaries and ~153 MB of dormant on-device build directories were
removed. Canonical build/deploy paths are pinned in `~/webos/wpe/DEPLOY-PATHS.md` (there is exactly
one `BrowserServer-atlas` binary and one `BrowserAdapterAtlas.so` plugin — deploying anywhere else
silently no-ops). Text selection (yellow highlight, drag markers, Copy/Select All, tap-dismiss, 512 KB
copy), the **editable-field menu with paste** (in inputs and on normal pages), and the **launcher-style
start-page reorder** are committed and verified on-device. A **static + dynamic memory-safety pass**
(use-after-free guards, yap fixes) is committed and deployed on both the server and client sides.

**0.9.8** is a stability release: engine hangs now recover automatically in ~1 minute instead of
needing a reboot (see *Engine-restart recovery* above). Verified on-device against a real wedge on
2026-08-03; the fix spans all three repos, so app-only packaging is not enough for it — ship the full
ipk (`atlas-wpe-env/build-ipk-atlas.sh`).

## Known issues / limitations

- **GPU wedge** ([atlas-wpe-env#3](https://github.com/Herrie82/atlas-wpe-env/issues/3)) — GPU-heavy work
  (site pop-up menus, rotation) can park BrowserServer's main thread in a futex wait: yap keeps
  accepting, `openURL` is never serviced, pages stop loading. The root cause is unfixed, but it now
  **recovers itself in ~1 minute** instead of looking permanent — see *Engine-restart recovery* below.
- **LunaCE double-fires taps** (touch + mouse → `onclick` 2–4× per tap); dialog actions are debounced.
- **Real-site load time is CPU-bound on first-party JS** on the TouchPad; the DFG JIT helps JS
  execution but page load stays near the hardware limit.
- Page text-selection depends on the engine hit-test; the long-press must land on actual text.

**LuneOS / Chromium**

These are limitations of the *engine*, not of the app — each needs a `webruntime` patch, so they are
batched into one rebuild rather than fixed piecemeal:

Some of these are fixed by the LuneOS `webruntime` patch
(`meta-luneos/recipes-webos-ose/chromium/files/0009-browser_shell-*.patch`), which adds permission
delivery, find-in-page, and the JavaScript and cookie switches. Atlas feature-detects each one, so the
same build runs on a patched or an unpatched engine.

- **No print.** `pageContents` has no print entry point, and — unlike the other gaps — this is not a
  matter of exposing something that already exists: `neva` builds no printing stack at all (no
  `PrintRenderFrameHelper` in the renderer, no printing dependency in any `BUILD.gn`). Adding it is a
  component integration spanning renderer, browser and mojo, not an API exposure, so it is deliberately
  left out of the patch.
- **No selection reporting.** Atlas's own selection markers and popover are fed by the WPE backend's
  `selectionBounds` messages, which have no counterpart here — and no clean Chromium API to build one
  from. Chromium draws its own drag handles instead, so the loss is cosmetic parity rather than
  function.
- **Permission prompts need the patch.** On a stock engine, camera, microphone, geolocation and
  notification requests never reach the app: `PageContents::RequestMediaAccessPermission` goes straight
  to the capture dispatcher without calling the delegate, nothing ever populates
  `media_access_requests_`, so the `permissionrequest` event never fires and `AckPermission` only ever
  logs "Not found request". This is not Atlas-specific — enactbrowser registers a `permissionrequest`
  listener that has never once been called.
- Without the patch, find-in-page is done **in the page** rather than by the engine (see below), so its
  match count does not cover cross-origin iframes.
- While a popup is open the page area is blanked rather than clipped (edge drawers *are* clipped).

Note that Chromium flags can be tried on-device *without* a rebuild: `run_browser_shell` sources
`${CACHE_DIR}/extra_conf` (usually `/home/wam/.cache/extra_conf`) after building `CHROME_FLAGS`, so
appending to that variable there takes effect on the next launch.

## Roadmap

- **WPE memory tuning** — *Phase 2* `MemoryPressureSettings` (WebProcess ~200 MB cap) + backend cache
  model; *Phase 3* build-time `-DENABLE_GPU_PROCESS=OFF`, drop `avif/jpegxl/webaudio/mediastream/video`,
  `ENABLE_SAMPLING_PROFILER=OFF`. A rigorous ON/OFF A/B still owes a soft-reset harness.
- Commit the `CCallHelpers.h` softfp patch as a standalone `.patch`.
- Autofill engine hooks: auto-capture on submit and auto-fill on focus (storage and UI are done).
- Expand the tracker/beacon blocklist; optional data-saver (defer images).
- Scrolling perf: async axis-event scroll is done; strip-readback optimization pending.
- Chromium host: print, which needs a printing stack built into `neva` before any browser_shell API
  can expose it; and selection-bounds reporting for Atlas's own marker UI. Then merging the
  `chromium-engine` branch once it has had wider use.

## Copyright and License

Portions © 2012 Hewlett-Packard Development Company, L.P. All source and documentation in this
repository are licensed under the **Apache License, Version 2.0**:

> http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is
distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
implied. See the License for the specific language governing permissions and limitations under the
License.
