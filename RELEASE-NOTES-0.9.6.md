# Atlas Web — Release Notes 0.9.6

A focused follow-up to 0.9.5: next-gen image support plus a leaner, faster-starting engine.

## 🖼 Images
- **AVIF decoding** — AV1-based images now display (decoded via `libavif` + `dav1d`).
- **JPEG-XL decoding** — `.jxl` images now display (decoded via `libjxl`).
  Both verified on-device: an AVIF renders to screen and a JXL decodes to its true dimensions.

## ⚡ Performance
- **Faster first-page load** — the engine binary (`libWPEWebKit`) is now stripped, dropping it from
  **104 MB → 67 MB**. A cold browser start has far less to fault in from storage. Once the shared
  WebProcess is warm, subsequent pages and reloads are already near-instant.
- **Persistent media plugin registry** — the GStreamer registry moved from `/tmp` (wiped on every
  reboot → full plugin rescan on the first browse) to cryptofs, so it's built once and survives
  reboots.

## 🔧 MIME handler cleanup
- Atlas registers as an opener for **images, audio, video, and `file:` / `ftp:` links**, but no
  longer registers `http:` / `https:` or `text/html` — it won't compete with the stock browser for
  the default-browser role, and won't claim plain-text files.

## Requirements
Unchanged from 0.9.5: community **OpenSSL 1.1** (`/usr/lib/ssl11`) and the device Adreno GL driver.
Install with Preware / WebOS Quick Install (runs postinst). Never touches the stock Palm
BrowserServer / WebKit.
