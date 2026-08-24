# Atlas Web 0.9.11 — the "GPU wedge" is fixed at the source

One change, three bugs, all in the engine's own plumbing. The freeze tracked as
[atlas-wpe-env#3](https://github.com/Herrie82/atlas-wpe-env/issues/3) — heavy pages, site menus, or a
few minutes of browsing and then no page ever loads again — **was never a GPU hang**. All three
mechanisms were caught live on-device (webOS CE 3.1.0, 2026-08-23), each with a stack trace or strace
proving it, and each is fixed.

## What was actually happening

All three park BrowserServer's main loop while the process stays alive — which is why it always looked
like a mysterious "wedge" and why the old watchdog was the only thing that ever cleared it.

**1. A stale close of a socket WebKit owns** (`wpe-atlas-backend.c`). The frame channel hands WebKit
one end of a socketpair (`view_get_renderer_host_fd`). WebKit *adopts* that fd — it ships it to the
WebProcess and closes it itself, on another thread, within milliseconds. The backend kept the number
and closed it again later ("on the first frame"). By then the number had been reused — strace showed
the very next `socketpair()` getting it back 80 ms later — so the close killed a live fd: another
frame channel, or a WebKit IPC socket. The wedged BrowserServer captured live had its main thread
blocking in `recv()` on an fd whose peer was a WPEWebProcess's **WebKit IPC socket**: the frame
channel's poll source had ended up reading WebKit's IPC traffic. Depending on which fd got hit you
get `__skb_recv_datagram` (blocking recv racing the IPC thread), `futex_wait_queue_me` (a stolen IPC
datagram = a sync reply that never arrives), or "WebKit keeps spawning fresh WebProcesses while BS
stays stuck" (a closed IPC socket looks like a crashed process).
*Fix:* the fd returned to WebKit is WebKit's — the backend never touches the number again; the channel
is reaped on HUP/EOF; the receive is `MSG_DONTWAIT` so the main loop can never block in `recv`.

**2. A frame acknowledgement nobody ever read** (`wpe-atlas-backend.c`). BrowserServer answered every
rendered frame with a 28-byte FRAME_ACK; the WebProcess never read it. Unread unix datagrams stay
charged to the **sender's** buffer, so after a few hundred frames on one page the blocking ack
`send()` parked the main loop forever — right *after* a perfectly good frame, exactly how the wedge
was always described ("the last readback completed fine, then nothing"). Reproduced deterministically:
an animated page wedged the stock engine after ~1230 frames (~5 min), main thread in
`sock_alloc_send_pskb`.
*Fix:* the WebProcess drains acks before each frame and the ack send is non-blocking. The same page
sailed past 1380 frames and kept going.

**3. A debug hook squatting on JavaScriptCore's GC signal** (`BrowserPageWPE.cpp`). The autonomous
scroll test registered `g_unix_signal_add(SIGUSR1, …)`. WTF/JSC uses SIGUSR1 to suspend threads for
conservative GC stack scanning; glib's handler replaced WebKit's, so the next concurrent GC of the
UIProcess-side JSC VM (the one behind `webkit_web_view_evaluate_javascript`) hung its collector in
`Thread::suspend → sem_wait(globalSemaphoreForSuspendResume)` and the main thread deadlocked in
`JSC::Heap::acquireAccessSlow` — the classic `futex_wait_queue_me` wedge. This one was caught by gdb
*after* fixes 1+2 were already in, which is why all three matter.
*Fix:* the SIGUSR1 hook is gone (the `/tmp/atlas_scrolltest` file trigger remains). Nothing in the
engine may take SIGUSR1; if something ever must, move JSC off it with `JSC_SIGNAL_FOR_GC=<signo>` in
the boot wrapper instead.

## Before / after, same device, same test

| | stock 0.9.10 engine | 0.9.11 |
|---|---|---|
| cross-site navigation hammer | wedged at page **8** (`__skb_recv_datagram`) | **64 pages, no wedge** |
| + backend fixes only | deadlocked at page 21 (SIGUSR1/JSC, `futex`) | — |
| animated page | frozen after ~1230 frames (`sock_alloc_send_pskb`) | 1380+ frames and counting |

## What this changes for users

- Pages keep loading. Menus, rotation, long sessions, animated pages — the engine no longer freezes.
- **Restart Browser Engine** stays in the menu as belt-and-braces, but you should not need it.
- No watchdog returns. Nothing guesses at hangs; the causes are gone.

## Engine provenance

0.9.11's WebKit runtime is **byte-identical** to 0.9.8/0.9.9/0.9.10 (`libWPEWebKit-2.0.so.1`
md5 `d9923df8…`). The only engine binaries that change are `BrowserServer-atlas` (SIGUSR1 hook
removed) and `libWPEBackend-atlas.so` (frame-channel lifecycle) — both built from source with the
device-matched toolchain; the stock 0.9.10 binaries rebuild byte-identically from the pre-fix source,
so the diff is exactly these fixes.

Packaging is unchanged from 0.9.10 (no `Depends:`, pm-hook ar members, feed vs standalone targets —
see RELEASE-NOTES-0.9.10.md).
