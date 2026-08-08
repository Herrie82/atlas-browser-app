/* Which engine is this app running on?
 *
 * Atlas ships ONE source tree that runs on two very different hosts:
 *
 *   "wpe"      — legacy webOS (TouchPad 3.0.5 / Pre 3 2.2.4) and LuneOS WAM. The web content is an
 *                NPAPI plugin instance (enyo.BasicWebView -> BrowserAdapter -> BrowserServer -> WPE
 *                WebKit). PalmSystem is injected by the host, cards are separate windows.
 *   "chromium" — LuneOS browser_shell (appinfo "type": "native_browsershell"). Web content is a NATIVE
 *                Chromium view owned by the shell and driven from JS via window.shell /
 *                PageView.pageContents. There is no PalmSystem here (see ShellPalmSystem.js) and only
 *                ONE window, so cards become in-app tabs.
 *
 * Detection is by capability, not by guessing the device: only the browser_shell host defines both
 * window.shell and the PageView constructor. Packaging can pin the answer instead by defining
 * window.__atlasHostForce = "wpe" | "chromium" before this file runs (see packaging/), and
 * ?atlasEngine=<host> in the URL overrides both for quick on-device A/B testing.
 *
 * This file MUST load before enyo.js: ShellPalmSystem.js keys off __atlasHost, and the framework
 * inspects PalmSystem while it boots. */
(function () {
    function fromQuery() {
        try {
            var m = /[?&]atlasEngine=([a-z]+)/.exec(window.location.search || "");
            return m ? m[1] : null;
        } catch (e) { return null; }
    }

    function detect() {
        var forced = fromQuery() || window.__atlasHostForce;
        if (forced === "wpe" || forced === "chromium") { return forced; }
        // browser_shell exposes the shell object AND the PageView ctor used to create page views.
        if (window.shell && typeof window.shell === "object" && typeof window.PageView === "function") {
            return "chromium";
        }
        return "wpe";
    }

    window.__atlasHost = detect();
    window.__atlasChromium = (window.__atlasHost === "chromium");
    window.__atlasWpe = !window.__atlasChromium;

    try { console.log("[Atlas] host = " + window.__atlasHost); } catch (e) {}
})();
