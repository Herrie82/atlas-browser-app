# Atlas Web

Atlas Web is an Enyo 1 web browser for **webOS** (HP TouchPad, webOS 3.0.5), running a modern
**WPE WebKit 2.52** engine as a *separate* browser — it never touches Palm's system
`/usr/bin/BrowserServer` or the stock WebKit. It is the **Atlas rebrand** (`org.webosports.app.atlas`)
of the earlier Isis browser.

The goal: give the 2011 TouchPad a browser with a current-era JavaScript engine (ES2022, JIT) and
modern web-platform support, on the original hardware (Adreno 220, Cortex-A8, kernel 2.6.35).

## Overview

- **UI:** Enyo 1 app (this repo) using the framework `WebView` control.
- **Engine:** WPE WebKit 2.52.4, cross-built for softfp ARMv7 (Thumb2), `-mtune=cortex-a8 -mfpu=neon`,
  glibc 2.25, crosstool-NG GCC 12.5.
- **Bridge:** `WebView` → **BrowserAdapter** → **BrowserServer** (yap IPC) → WPE WebKit.

## Architecture

| Component | Repo / path | Role |
|-----------|-------------|------|
| Enyo UI app | `atlas-browser-app` (this repo) | cards, toaster drawer, dialogs, start page |
| WPE backend | `atlas-wpe-backend` | `libWPEBackend-atlas.so` + `BrowserPageWPE.cpp` (compiled into the BrowserServer) |
| BrowserServer | `doctor305/BrowserServer` | yap-IPC server hosting the WPE engine |
| BrowserAdapter | `BrowserAdapter` (LunaCE plugin) | paints the engine's offscreen buffer into the card |

**On-device layout:** engine under `/media/internal/wpe-252`, boot wrapper
`/media/internal/atlas/BrowserServer` (upstart job `atlas`, `BROWSERSERVER_NAME=atlas` → socket
`/tmp/yapserver.atlas`), adapter `/usr/lib/BrowserPlugins/BrowserAdapterAtlas.so`.

## Features

- **Modern JS engine** — ES2022, WebKit 620-era.
- **JIT enabled, including DFG** — ~3× faster than the C_LOOP interpreter on integer/logic code,
  ~1.25× on Math-heavy code (`Math.floor`/`%` are C-calls even under the JIT). Getting DFG correct on
  this softfp target required fixing a soft-float FP-call ABI hole in JSC's `CCallHelpers` (modern
  WebKit assumes hardfp) by **porting WebKit 2.34's softfp argument/return marshalling forward**.
  Runs **single-process** (`WEBKIT_USE_SINGLE_WEB_PROCESS`) with **Phase-1 low-RAM env tuning**
  (`JSC_forceRAMSize`, RGB565 tiles, Nicosia paint-thread cap, `MALLOC_ARENA_MAX`).
- **Legacy-webOS text selection** — long-press selects a word with a **persistent yellow highlight**
  (the view is forced active so WebKit paints the active colour, not inactive grey). Lands on the
  right word at **any scroll position** (pan-model coordinate fix). **Draggable start/end markers**
  (30×30 grab zones) grow/shrink the selection, a segmented **Copy \| Select All** popover sits above
  it, and a **tap outside dismisses** it. Copy is **plain text**. This runs the full app →
  BrowserAdapter → BrowserServer → WPE-engine chain via a new `extendSelectionTo` IPC command.
- **Large clipboard payloads** — the yap IPC buffers are now **dynamically growable up to 512 KB**
  (24-bit length header) instead of a fixed 16 KB, so a full **Select All → Copy** no longer overflows
  the pipe / crashes the client. (BrowserServer + BrowserAdapter rebuilt in lockstep.)
- **Editable-field context menu** — long-press an input for **Select \| Select All \| Paste**; with a
  word selected, **Cut \| Copy \| Paste**. Word / select-all work *inside* `INPUT`/`TEXTAREA` (via
  `setSelectionRange`, reported as an editable selection so no drag markers are drawn). **Paste reads the
  system clipboard cross-app** — via the platform's async `PalmSystem.paste()` (`enyo.dom.getClipboard`),
  so text copied in *any* app (Notes, etc.) pastes in — and inserts through the engine's `InsertText`
  command, falling back to the last in-browser copy. Double-fire-debounced so a paste inserts once.
- **Password Manager** — a single app-menu entry / toaster tab: searchable list, swipe-to-delete,
  tap-to-edit dialog with **show/hide password**, secure-lock iconography, and **import + export CSV**
  icons (Chrome / Google Password Manager format) right in the toaster.
- **Search on Bookmarks / History / Passwords** — via db8's `searchText` full-text index (matches
  title **or** URL), with a tightened search-pill and full-width row separators.
- **Save-login prompt** — offers to store username/password on form submit.
- **Form autofill manager** — store/search/edit/delete personal-info values (name, email, phone,
  address, …) in `org.webosports.autofill:1`, from the app menu / toaster tab. (Auto-capture on submit
  and auto-fill on field focus are the engine-side next step.)
- **Translate page** — an **address-bar toggle** (Preferences) opens the current page through Google
  Translate in your device language.
- **Address-bar** — history/bookmark autocomplete as you type; normalized icon baseline; a
  show/hide-keyboard button.
- **SSL / HTTP-auth dialogs** — certificate and basic-auth prompts.
- **Private browsing** card (ephemeral session, in-memory cookies/cache/history).
- **Start page** — bookmark grid with **launcher-style drag-to-reorder**: long-press lifts a tile to
  follow the finger while the sibling tiles reflow to open the drop gap (no drop-highlight box); the
  drop target is the nearest slot, so a tile can be moved before the first or after the last. Long-press
  and release in place instead for Open / Open in New Card / Remove.
- **Content blocker** — WebKit content-rules blocking ads **and** trackers (StevenBlack hosts +
  curated regional list).
- **Reading mode** — reader view of the loaded article.
- **TLS 1.3** — process-private OpenSSL 1.1 for the BrowserServer (system `libssl` untouched).
- **Stability hardening** — a static + dynamic analysis pass (cppcheck / clang-tidy / valgrind +
  ASan/UBSan) fixed a class of **use-after-free** bugs where async engine callbacks and timers could fire
  after their card had been freed (they now check a live-page set), plus destructor leaks and yap-IPC
  length-validation / leak issues. The 512 KB dynamic yap buffer path was verified clean under a
  host-native sanitizer harness.

## Status

The stack is now **atlas-only**: the earlier Isis engine has been fully **decommissioned** — all
`isis*` upstart jobs, plugins, binaries and ~153 MB of dormant on-device build directories were
removed. Canonical build/deploy paths are pinned in `~/webos/wpe/DEPLOY-PATHS.md` (there is exactly
one `BrowserServer-atlas` binary and one `BrowserAdapterAtlas.so` plugin — deploying anywhere else
silently no-ops). Text selection (yellow highlight, drag markers, Copy/Select All, tap-dismiss, 512 KB
copy), the **editable-field menu with paste** (in inputs and on normal pages), and the **launcher-style
start-page reorder** are committed and verified on-device. A **static + dynamic memory-safety pass**
(use-after-free guards, yap fixes) is committed and deployed on both the server and client sides.

## Known issues / limitations

- **LunaCE double-fires taps** (touch + mouse → `onclick` 2–4× per tap); dialog actions are debounced.
- **Real-site load time is CPU-bound on first-party JS** on the TouchPad; the DFG JIT helps JS
  execution but page load stays near the hardware limit.
- Page text-selection depends on the engine hit-test; the long-press must land on actual text.

## To-do / roadmap

- **WPE memory tuning** (researched, not yet applied):
  - *Phase 2* — `MemoryPressureSettings` (WebProcess ~200 MB cap) + a cache-model choice in the backend.
  - *Phase 3* (build-time) — `-DENABLE_GPU_PROCESS=OFF`, drop `avif/jpegxl/webaudio/mediastream/video`,
    `ENABLE_SAMPLING_PROFILER=OFF`.
  - A rigorous **ON/OFF A/B** of the Phase-1 env tuning still owes a **soft-reset harness**
    (`tellbootie` reboots wedge novacom, so a `drop_caches` + LunaSysMgr/atlas restart is needed instead).
- Commit the `CCallHelpers.h` softfp patch as a standalone `.patch` (it lives in the build tree).
- **Network:** expand the tracker/beacon blocklist, optional data-saver (defer images).
- **Scrolling perf:** async axis-event scroll done; strip-readback optimization pending.
- Autofill engine hooks: auto-capture form values on submit + auto-fill matching fields on focus
  (the manager/storage is done; matching is the remaining piece).
- Tabs; gesture navigation.

## Build & deploy (developer notes)

- **Engine build:** WPE WebKit under cron (`cron-jit-build.sh`, `ninja -j16`, ~40 min) to survive
  session teardown; capped `-j` (unified sources ~2.5 GB each).
- **Deploy:** `deploy-252.sh` — `patchelf` interp/rpath on the process stubs + binary string-patch of
  the baked host prefix (`staging-glibc-252` → `/media/internal/wpe-252`, `/.`-padded). Never ship raw
  `_b/lib` artifacts.
- **BrowserServer:** `build-browserserver.sh all` (compile — use `all`, not single-file, after any
  `BrowserPageWPE.h` member change) + `link-bs-252.sh` (link) → `/media/internal/wpe-252/BrowserServer-atlas`.
- **BrowserAdapter (NPAPI plugin):** `deploy-adapter.sh` builds + strips + deploys to
  `/usr/lib/BrowserPlugins/BrowserAdapterAtlas.so` (rootfs, remount rw) — the **only** path the app
  loads it from (MIME `application/x-atlas-browser`).
- **yap IPC:** `YapDefs.h` must match in `BrowserServer/Yap/` and the staging include; BrowserServer +
  BrowserAdapter must be rebuilt **in lockstep** or all IPC corrupts. Full path map: `~/webos/wpe/DEPLOY-PATHS.md`.
- **App JS reload:** `killall LunaSysMgr` (respawns in ~20–30 s, clears the JS cache). **Never**
  `rm -rf /var/luna/data/extractfs/*` — it forces a full re-extraction of every app and can wedge the
  device.
- **db8 kinds:** registered via `com.palm.configurator` + `/etc/palm/db/{kinds,permissions}` — not via
  ipk install or a shell `putKind`.

## Copyright and License

Portions © 2012 Hewlett-Packard Development Company, L.P. All source and documentation in this
repository are licensed under the **Apache License, Version 2.0**:

> http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is
distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
implied. See the License for the specific language governing permissions and limitations under the
License.
