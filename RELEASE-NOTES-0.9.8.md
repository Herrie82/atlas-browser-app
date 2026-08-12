# Atlas Web — Release Notes 0.9.8

A stability release. 0.9.8 does not add web-platform features; it fixes the failure that most often
ended a browsing session — the engine hang that used to require a reboot.

## 🔁 Atlas recovers from engine hangs on its own

GPU-heavy work — **pop-up menus on a site**, or rotating the device — could hang the browser engine.
The symptom was distinctive: the app stayed responsive, the address bar worked, but **no page would
ever finish loading again**. With no command line on a stock device, the only way out was a **reboot**.

Atlas now notices the hang, restarts its engine, and puts you back on the page you were reading.
Measured on a TouchPad against a real hang: **14 minutes 30 seconds → 63 seconds**.

What you see: a *"Atlas hung - restarting..."* banner, then the card reloads itself onto your page a
few seconds later. No cards to close, nothing to reopen, no reboot.

### How it works

Three pieces, and all three were needed:

1. **Detect it quickly.** The engine already carried a deadlock watchdog, and it was in fact the only
   thing that ever recovered a hang — but it was set to a 10-minute timeout, so recovery took nearly a
   quarter of an hour and looked permanent to anyone using it. The timeout could not simply be lowered:
   it also fires during heavy garbage collection, and shortening it would have started killing healthy
   engines. The watchdog now checks whether the engine is *doing anything* before giving up on it — a
   busy engine is left alone, a hung one is restarted immediately. That makes a 90-second timeout safe.
2. **Restart it.** The engine's boot job already respawns it, cleaning up any leaked page processes on
   the way back up.
3. **Rejoin it.** A card whose engine has died cannot be reconnected, so the card reloads itself and
   restores the page you were on.

### Known limitation

This is recovery, not a cure: the underlying hang
([atlas-wpe-env#3](https://github.com/Herrie82/atlas-wpe-env/issues/3)) is still being investigated, so
you may still see the occasional interruption — it should now cost you about a minute instead of a
reboot. If the engine cannot be restarted at all, the card says so (*"Close and re-open Atlas. Engine
died."*) rather than silently sitting dead.

## Requirements

Unchanged from 0.9.7: community **OpenSSL 1.1** (`/usr/lib/ssl11`) and the device Adreno GL driver.
Install with Preware / WebOS Quick Install (runs postinst). Never touches the stock Palm
BrowserServer / WebKit.
