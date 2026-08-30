# Atlas Web 0.9.12 — local media goes back to the media apps

Packaging-only release. The browser engine is byte-for-byte the 0.9.11 engine; what changed is one
line of the app manifest and the install/remove scripts around it.

## The bug

Once Atlas was installed, tapping a photo, a video or a song in a file manager opened **Atlas**
instead of Photos, Video or Music. Reported against webOS CE 3.1.0 (2026-08-29).

## Why

`appinfo.json` claimed `{"urlPattern": "^file:"}`. That is not a mime claim — LunaSysMgr registers an
appinfo `urlPattern` as a **non-scheme redirect handler**
(`ApplicationDescription.cpp`: `addRedirectHandler(pattern, appId, NULL, false, false)`), and the
handler lookup in `ApplicationManagerService` resolves redirect handlers **before** it looks at either
the supplied mime type or the URL's extension:

```
getActiveHandlerForRedirect(uri, …)   <-- "^file:" matches here, first
  -> getActiveHandlerForResource(mime)
  -> extension -> mime -> getActiveHandlerForResource()
```

So a single `^file:` claim outranked every media app on the device for anything opened as a
`file://` URL, whatever its type. Nothing about images, audio or video had to be declared for this to
happen — and nothing could out-rank it.

## The fix

**One line removed from `appinfo.json`, and nothing else.** Atlas keeps `^ftp:` and its real document
types (`text/html`, `xhtml`, `xml`, `json`, `text/plain`, `svg`, `ico`), so links, downloaded pages and
local HTML still open in Atlas; local media does not. Media types are deliberately *not* claimed: on
this platform the first app to register a mime type becomes its primary handler, so claiming
`image/jpeg` could take the role from Photos depending on scan order.

The package is byte-for-byte 0.9.11 apart from that manifest. Verified by unpacking both ipks and
hashing all 1588 payload files: `appinfo.json` is the only one that differs, and `postinst` / `prerm`
are byte-identical to 0.9.11's. It was built from the 0.9.11 commit (`ebab715`), not from `master` —
`master` has since merged the in-progress Chromium/`browser_shell` engine layer (PR #4, ~2,150 lines),
which is not in this release and was not tested as part of it.

## Known limitation — upgrades may need a restart

LunaSysMgr persists the resolved handler table to
`/var/usr/palm/command-resource-handlers-active.json` and loads *that* at startup in preference to
rebuilding it from the installed apps. So on an upgrade from 0.9.11 the stale `^file:` claim can
outlive the install; a fresh install is unaffected.

An earlier draft of this release had `postinst` clear Atlas's entries with
`applicationManager/removeHandlersForAppId`. **That is not in the shipped package**, for two reasons:

1. `com.palm.applicationManager` is served by LunaSysMgr, and these scripts run synchronously from
   inside LunaSysMgr — `luna-send -n 1` blocks waiting for a reply from the process that is waiting for
   the script to exit. That is a known wedge in this feed (the Synergy Revival connectors had to
   background their `luna-send` calls for the same reason). If it is ever added back, it must be
   backgrounded: `( luna-send … & ) >/dev/null 2>&1`.
2. Whether `removeHandlersForAppId` exists on this platform is **unverified**. If it does not, the call
   is a silent no-op and buys nothing.

Neither question is settled, so the release does not depend on the answer.
