# Atlas Web — Release Notes 0.9.5

A modern WPE WebKit 2.52 browser for the HP TouchPad (webOS 3.0.5), installed alongside — never
replacing — the stock Palm browser. This release is a large step up from 0.9.0: the engine grew from
~56 MB to ~96 MB with a lot of new web-platform, media, and font support, plus major scrolling,
stability, and input fixes. html5test.co score climbed from the mid-400s to **~535**.

## ✨ New web-platform features
- **Payment Request API** — `window.PaymentRequest` now exposed (standalone, no Apple Pay backend needed).
- **Gamepad API** — navigator.getGamepads / gamepad events.
- **Web App Manifest** — `<link rel="manifest">` recognized (PWA install metadata).
- **Web Speech synthesis** — `speechSynthesis` with 4 offline Flite voices (kal/slt/rms/awb), audible.
- **WebRTC** — peer connections, **data channels**, and receive-path audio + video decode.
- **Encrypted Media (ClearKey)**, **requestIdleCallback**, **LinkPrefetch** enabled.
- **Form input types** — date / time / month / week / datetime-local / color pickers.
- **getUserMedia** — camera capture (front camera) + audio-output device enumeration.

## 🅰 Fonts & images
- **WOFF2 web fonts** — modern sites (Dropbox, etc.) now render their fonts instead of blank text.
- **JPEG + WebP canvas export** — `canvas.toDataURL('image/jpeg' | 'image/webp')` now works
  (WPE previously only encoded PNG).

## 🔊 Media & codecs
- **AAC** audio decode (via gst-libav).
- **Ogg / Vorbis / Opus** audio.
- **WMA / WMV / VC-1** playback (ASF demuxer + decoders).
- **Ogg Theora** video.
- **MPEG-TS** container support (`video/mpegts`).
- HW video-overlay pipeline work (MDP4 / mediad handoff, experimental).
- **Autoplay-with-sound** preference toggle.

## 📜 Scrolling & rendering
- **Full-page scrolling for tall pages** — pages that build content with JavaScript *after* load
  (html5test, search results, SPAs) now scroll all the way to the bottom instead of cutting off.
- Restored the tall pan-buffer scroll model with predictive lead + strip readback for smoother flicks.
- Fixed fast-flick **"stretched stripes"** (bitblt source-row clamp).
- Fixed **portrait-rotation shear** (PGContext compositing).
- Simple/low-memory viewport mode (`mode=simple`) for OAuth popups & heavy SPAs.

## 🐞 Fixes & stability
- **Address bar** — you can now type a new URL after a page auto-focuses an input on load
  (the content plugin no longer swallows every keystroke once it's lost focus).
- **Memory pressure** — fixed the WebKit MemoryPressureMonitor on the 2.6.35 kernel (system-wide
  pressure valve now works; heavy pages no longer silently reboot the device).
- **WebProcess leak on card close** — the engine is now disconnected/reaped on window unload.
- **Network storage / cache moved off VFAT → cryptofs** — fixes IndexedDB and the WhatsApp QR login.
- **WhatsApp "loads halfway"** — routed to a fresh viewport-mode card.
- **Injected-bundle deploy consistency** — keeps the WebProcess bundle in lock-step with the engine
  (was causing an every-page crash when a new engine feature changed an IPC struct).
- Per-site UA quirk for Microsoft Teams; relaunch target made authoritative (no more stale/white card).

## 🧰 App & packaging
- Password Manager + Form Autofill managers; start-page launcher-style grid with drag/reorder/delete.
- Text-selection UI (draggable markers, Copy | Select All popover); cross-app clipboard paste.
- Find-in-page forward/back; address-bar autocomplete, bookmark star, favicons, downloads.
- Google Translate page option; App Museum II auto-update.
- **Self-contained IPK** now packages the *current* full engine (WOFF2, Flite, WebRTC, all codecs,
  the fixes) — installs via Preware / WebOS Quick Install (postinst sets up the adapter, upstart job,
  db8 kinds, and OpenSSL-1.1 dependency).

## Requirements
Community **OpenSSL 1.1** package (`/usr/lib/ssl11`) and the device Adreno GL driver. Does not touch
the stock Palm BrowserServer / WebKit.
