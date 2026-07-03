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
- **Password manager** — searchable list, swipe-to-delete, tap-to-edit dialog with **show/hide
  password**, secure-lock iconography.
- **Search on Bookmarks / History / Passwords** — via db8's `searchText` full-text index (matches
  title **or** URL).
- **Save-login prompt** — offers to store username/password on form submit.
- **Form autofill manager** — store/search/edit/delete personal-info values (name, email, phone,
  address, …) in `org.webosports.autofill:1`, from the app menu / toaster tab. (Auto-capture on submit
  and auto-fill on field focus are the engine-side next step.)
- **Translate page** — opens the current page through Google Translate in your device language.
- **Address-bar autocomplete** — history/bookmark suggestions as you type.
- **SSL / HTTP-auth dialogs** — certificate and basic-auth prompts.
- **Private browsing** card (ephemeral session, in-memory cookies/cache/history).
- **CSV password import** (Chrome / Google Password Manager export).
- **Start page** — bookmark grid with drag-to-reorder tiles.
- **Content blocker** — WebKit content-rules blocking ads **and** trackers (StevenBlack hosts +
  curated regional list).
- **Reading mode** — reader view of the loaded article.
- **Text selection + copy** on web content; system cut/copy/paste in the URL bar.
- **TLS 1.3** — process-private OpenSSL 1.1 for the BrowserServer (system `libssl` untouched).

## Known issues / limitations

- **LunaCE double-fires taps** (touch + mouse → `onclick` 2–4× per tap); dialog actions are debounced.
- **Real-site load time is network-bound** on the TouchPad's WiFi radio — JIT gains show on JS
  execution, not wall-clock page load.
- Page text-selection depends on the engine hit-test; the long-press must land on actual text.

## To-do / roadmap

- Make the DFG JIT the **persistent default** (update `safeengine.sh`, which still reverts to C_LOOP).
- Commit the `CCallHelpers.h` softfp patch as a standalone `.patch` (it lives in the build tree).
- **Network:** expand the tracker/beacon blocklist, verify HTTP disk cache is enabled, optional
  data-saver (defer images).
- **Scrolling perf:** async axis-event scroll done; strip-readback optimization pending.
- Autofill engine hooks: auto-capture form values on submit + auto-fill matching fields on focus
  (the manager/storage is done; matching is the remaining piece).
- Tabs; gesture navigation.
- GitHub repo rename `isis → atlas` + push.

## Build & deploy (developer notes)

- **Engine build:** WPE WebKit under cron (`cron-jit-build.sh`, `ninja -j16`, ~40 min) to survive
  session teardown; capped `-j` (unified sources ~2.5 GB each).
- **Deploy:** `deploy-252.sh` — `patchelf` interp/rpath on the process stubs + binary string-patch of
  the baked host prefix (`staging-glibc-252` → `/media/internal/wpe-252`, `/.`-padded). Never ship raw
  `_b/lib` artifacts.
- **BrowserServer:** `build-browserserver.sh` (compile) + `link-bs-252.sh` (link) →
  `/media/internal/wpe-252/BrowserServer-atlas`.
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
