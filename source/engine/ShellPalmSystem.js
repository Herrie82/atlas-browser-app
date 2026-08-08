/* PalmSystem shim for the LuneOS browser_shell host.
 *
 * Enyo 1 and Atlas both assume the legacy webOS window object `PalmSystem` exists — the framework
 * touches ~30 members of it while it boots (launchParams, identifier, stageReady, banners, keyboard,
 * clipboard paste, locale...), and Atlas reads deviceInfo, paste, enableFullScreenMode, hasAlphaHole.
 * WAM injects that object; browser_shell does NOT (measured on LuneOS 2026-08-08: PalmSystem and
 * webOSSystem are undefined in a "native_browsershell" page, though PalmServiceBridge IS present, so
 * db8/luna keep working untouched).
 *
 * This file supplies the missing object on top of what the shell actually gives us:
 *   window.shell.launchArgs                 -> launchParams / identifier
 *   window.shell.shellWindow                -> activate / visibility
 *   window.screen                           -> deviceInfo
 *   navigator.clipboard                     -> paste
 * Everything the shell has no equivalent for is an explicit, silent no-op — listed below rather than
 * left undefined, so the framework's feature checks take a consistent path instead of throwing.
 *
 * No-op on every other host: if PalmSystem already exists (legacy webOS, LuneOS WAM) this file returns
 * immediately and changes nothing. Load it after AtlasHost.js and before enyo.js. */
(function () {
    if (!window.__atlasChromium) { return; }          // wpe host: the real PalmSystem is already there
    if (window.PalmSystem) { return; }                // belt and braces — never shadow a real one

    var shell = window.shell || {};
    var launchArgs = shell.launchArgs || {};

    function shellWindow() { return shell.shellWindow || null; }

    function rootPageContents() {
        var w = shellWindow();
        return (w && w.pageView && w.pageView.pageContents) ? w.pageView.pageContents : null;
    }

    /* deviceInfo is a JSON *string* in the legacy API (callers run it through enyo.json.parse).
     * screenWidth/screenHeight matter most: Atlas sizes its chrome from them, and the low-memory
     * profile keys off the smaller dimension. */
    function deviceInfo() {
        var w = (window.screen && window.screen.width) || window.innerWidth || 1024;
        var h = (window.screen && window.screen.height) || window.innerHeight || 768;
        return JSON.stringify({
            modelName: "LuneOS",
            modelNameAscii: "LuneOS",
            platformVersion: "chromium-shell",
            screenWidth: w,
            screenHeight: h,
            maximumCardWidth: w,
            maximumCardHeight: h,
            minimumCardWidth: w,
            minimumCardHeight: h,
            keyboardAvailable: false,
            wifiAvailable: true,
            carrierAvailable: false,
            coreNaviButton: false
        });
    }

    /* Banners: the shell has no system notification surface reachable from JS. Route them to a hook the
     * UI layer can own (an in-app toast), and fall back to the log so nothing is silently swallowed. */
    var bannerId = 0;
    function banner(message) {
        try {
            if (typeof window.__atlasBanner === "function") { window.__atlasBanner(message); }
            else { console.log("[Atlas][banner] " + message); }
        } catch (e) {}
        return ++bannerId;
    }

    /* The legacy paste() pastes the SYSTEM clipboard into whatever is focused, asynchronously and with
     * no callback — enyo.dom.getClipboard selects a scratch textarea and calls it. execCommand("paste")
     * is blocked in Chromium, so read the clipboard and insert at the cursor ourselves. */
    function paste() {
        var el = document.activeElement;
        function insert(text) {
            if (!text || !el) { return; }
            if (typeof el.selectionStart === "number") {
                var s = el.selectionStart, e = el.selectionEnd, v = el.value || "";
                el.value = v.substring(0, s) + text + v.substring(e);
                el.selectionStart = el.selectionEnd = s + text.length;
            } else if (el.isContentEditable) {
                document.execCommand("insertText", false, text);
            }
            try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (e2) {}
        }
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                navigator.clipboard.readText().then(insert, function () {});
                return;
            }
        } catch (e) {}
        try { document.execCommand("paste"); } catch (e3) {}
    }

    /* Synchronous local-file read. Two things about the legacy contract matter:
     *   - asked for "const json" it returns a PARSED OBJECT, not text (enyo's g11n loader and
     *     enyo.getResource only JSON.parse the result when it comes back as a string — hand them ""
     *     for a missing file and they throw "Unexpected end of JSON input" during boot);
     *   - a missing resource must come back undefined, not empty string.
     * file:// XHR reports status 0 on success, so treat that as OK. */
    function getResource(path, type) {
        var text = null;
        try {
            var x = new XMLHttpRequest();
            x.open("GET", path, false);
            x.send(null);
            if (x.status === 0 || (x.status >= 200 && x.status < 300)) { text = x.responseText; }
        } catch (e) {}
        if (!text) { return undefined; }
        if (type && String(type).indexOf("json") >= 0) {
            try { return JSON.parse(text); } catch (e2) { return undefined; }
        }
        return text;
    }

    function noop() {}

    var PalmSystem = {
        // --- identity / launch -------------------------------------------------------------------
        identifier: launchArgs.appId || launchArgs.nid || "org.webosports.app.atlas",
        getIdentifier: function () { return PalmSystem.identifier; },
        launchParams: JSON.stringify(launchArgs.params || launchArgs || {}),
        deviceInfo: deviceInfo(),
        version: "chromium-shell",

        // --- window lifecycle --------------------------------------------------------------------
        // The shell owns the window and shows it itself, so stageReady has nothing to do. activate()
        // is the one that matters: Enyo calls it to pull the app forward and restore focus.
        stageReady: noop,
        isActivated: true,
        activate: function () {
            var w = shellWindow();
            try { if (w && w.setVisible) { w.setVisible(true); } } catch (e) {}
            var pc = rootPageContents();
            try { if (pc && pc.setFocus) { pc.setFocus(); } } catch (e2) {}
            PalmSystem.isActivated = true;
        },
        deactivate: function () { PalmSystem.isActivated = false; },
        // A browsershell app is already fullscreen and has no alpha hole; keep the state so callers
        // that read it back stay consistent.
        enableFullScreenMode: function (on) { PalmSystem.__fullScreen = !!on; },
        hasAlphaHole: false,
        setWindowProperties: noop,
        setWindowOrientation: noop,
        screenOrientation: "free",
        allowResizeOnPositiveSpaceChange: noop,

        // --- clipboard ---------------------------------------------------------------------------
        paste: paste,

        // --- notifications -----------------------------------------------------------------------
        addBannerMessage: function (message) { return banner(message); },
        removeBannerMessage: noop,
        addNewContentIndicator: function () { return ++bannerId; },
        removeNewContentIndicator: noop,

        // --- input / IME -------------------------------------------------------------------------
        // LuneOS drives the on-screen keyboard through Maliit in the compositor; the app has no say.
        keyboardShow: noop,
        keyboardHide: noop,
        setManualKeyboardEnabled: noop,
        editorFocused: noop,
        useSimulatedMouseClicks: noop,
        simulateMouseClick: noop,

        // --- locale / misc -----------------------------------------------------------------------
        locale: (navigator.language || "en-US"),
        localeRegion: (navigator.language || "en-US").split("-")[1] || "US",
        phoneRegion: "",
        timeFormat: "HH12",
        TZ: (function () {
            try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; }
        })(),
        runTextIndexer: noop,
        getResource: getResource
    };

    /* Relaunch. On webOS, LunaSysMgr calls Mojo.relaunch(), which makes enyo re-read
     * PalmSystem.launchParams, push them onto the root window and dispatch applicationRelaunch.
     * browser_shell instead fires a DOM "webOSRelaunch" event carrying the new launch args (this is
     * what enactbrowser listens for). Translate one into the other so Atlas's own relaunch handler
     * runs with the new params, exactly as it does on a device. */
    document.addEventListener("webOSRelaunch", function (ev) {
        var detail = (ev && ev.detail) || {};
        PalmSystem.launchParams = JSON.stringify(detail);
        try { if (window.shell) { window.shell.launchArgs = detail; } } catch (e) {}
        try {
            if (window.Mojo && window.Mojo.relaunch) { window.Mojo.relaunch(); }
            else if (window.enyo && enyo.windows && enyo.windows.events) { enyo.windows.events.handleRelaunch(); }
        } catch (e2) {
            try { console.log("[Atlas] relaunch dispatch failed: " + e2); } catch (e3) {}
        }
    }, false);

    window.PalmSystem = PalmSystem;
    // WAM injects both names and some framework/app code reads the modern one; keep them the same
    // object so a write through either is visible to the other.
    if (!window.webOSSystem) { window.webOSSystem = PalmSystem; }

    try { console.log("[Atlas] PalmSystem shim installed for browser_shell (appId " + PalmSystem.identifier + ")"); } catch (e) {}
})();
