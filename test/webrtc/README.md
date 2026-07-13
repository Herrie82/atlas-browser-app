# Atlas WebRTC receive-path test harness

End-to-end test for the Atlas WebRTC **receive** path on the TouchPad: a laptop
(Chrome/Firefox) is the **caller** and sends audio (and optionally video); the
TouchPad running Atlas is the **callee** and decodes + plays it out the speaker
(audio via the `qspk` sink → `qspkd` → PulseAudio) and renders video in a
`<video>` element.

This is a LAN, non-trickle harness — no external TURN/signaling server. Each peer
posts one full SDP (candidates already embedded) to a tiny relay and polls for the
other side's SDP.

## Files

| File               | Runs on | Purpose |
|--------------------|---------|---------|
| `signal.py`        | laptop  | stdlib-only signaling relay **and** static server for `call.html` (`/post`, `/get`, `/reset`) |
| `call.html`        | both    | the WebRTC peer page; `?role=caller` or `?role=callee` |
| `restartbrowse.sh` | device  | clean BS + Atlas restart and single-launch a URL (recover the white-page startup race) |

## Run it

1. **On the laptop**, from this directory:
   ```sh
   python3 signal.py          # prints the caller/callee URLs; PORT=8080 by default
   ```
   Note the laptop's LAN IP (e.g. `192.168.1.192`).

2. **Caller** (laptop Chrome — needs a localhost secure context for mic permission
   so it emits real LAN-IP ICE candidates):
   ```
   http://localhost:8080/call.html?role=caller
   ```
   Click **START**. Query params:
   - `?src=mic` (default) — send the real laptop microphone (talk into it).
   - `?src=tone` — send a constant 440 Hz sine (steady signal for A/B debugging).
   - `?video=1` — also send a synthetic canvas video (this desktop has no webcam;
     a moving ball + frame counter is `captureStream`'d as a real VP8/H.264 track).
   - `?ns=1` — restore echo-cancellation / noise-suppression (default off, which
     was crushing a quiet analog mic to near-silence).

3. **Callee** (TouchPad Atlas — open in the browser or launch via `restartbrowse.sh`
   pointed at the URL):
   ```
   http://<LAPTOP_LAN_IP>:8080/call.html?role=callee
   ```
   The callee auto-starts (receive needs no user gesture). Audio should play out the
   TouchPad speaker; video (if sent) shows in the `<video>` element.

## Notes / gotchas

- **ICE is filtered** to the LAN host candidate (UDP, `192.168.1.x`) + srflx
  fallback; VM/docker candidates (`192.168.122.x`, `172.16.x`) and TCP are dropped.
  The AR6003 WiFi drops UDP media sessions intermittently — keep the device near the
  router. If `ice=failed`, retry; it is environmental, not the engine.
- **Opus here has no `usedtx`**, so caller `packetsSent` climbs continuously even
  during silence. A low `micRMS` (~0.006) means a quiet laptop mic, not a receive bug.
- **The callee's on-screen log can look frozen** ("waiting for offer") because the
  Atlas software compositor repaints at ~0.5 fps — the JS/WebRTC has actually
  progressed. Read the mirrored log remotely instead:
  `curl 'http://localhost:8080/get?key=clog_callee'`.
- **Video display is compositor-limited** to a slideshow (~0.3 fps) even though VP8
  decodes fine (software `vp8dec`); smooth video needs the HW MDP overlay path.
- **Reset** the relay between runs: `curl http://localhost:8080/reset`.

## Related engine fix

The smooth-playback fix lives in the engine/daemon side (not this app):
`atlas-wpe-env/spk/gstqspksink.c` enlarges the sink ring buffer to 1.5 s to bridge
the WebProcess main-thread's ~900 ms `callOnMainThread` audio-dispatch bursts, and
`atlas-wpe-backend/patches/wpewebkit-2.52.4-webrtc-receive-av.patch` carries the
transceiver-match / incoming-bin-decode / continuous-appsrc changes.
