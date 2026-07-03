/* Route THIS app's WebView to our Atlas/QtWebKit engine:
 * swap the NPAPI mime so enyo loads OUR BrowserAdapter (application/x-atlas-browser),
 * which connects to our BrowserServer at /tmp/yapserver.atlas.
 * Stock browser (application/x-palm-browser -> /tmp/yapserver.browser) is untouched. */
(function () {
    // Per-card-context static debounce store — stable across the tap+click pair even if
    // enyo.windows.getRootWindow() resolves differently (or null) between them.
    var _atlasDebounce = {};
    // Open a new browser card exactly once. On LunaCE an in-app openWindow ALSO fires
    // applicationRelaunch (whose else-branch would open a duplicate card); the {_atlasInApp}
    // param doesn't reliably survive into the root window's relaunch windowParams, so we ALSO
    // stamp a timestamp on the shared root-window object, which the relaunch handler can read.
    window.atlasOpenCard = function (params) {
        var p = params || {};
        p._atlasInApp = 1;
        // Debounce: LunaCE delivers a button/menu tap as BOTH a tap and a click, firing the open twice
        // within a few ms -> two cards. Swallow a second call inside 700ms. The debounce state lives on a
        // stable object: prefer the shared root window, but FALL BACK to a module-static (window may resolve
        // differently between the tap and the click for a menu opened inside a card -> debounce bypassed ->
        // two cards). (__atlasLastOpen is separate from __atlasInAppOpenAt, which the relaunch handler clears.)
        var now = (new Date()).getTime();
        var rw = null;
        try { rw = enyo.windows.getRootWindow(); } catch (e) {}
        var store = rw || _atlasDebounce;
        if (store.__atlasLastOpen && (now - store.__atlasLastOpen) < 700) {
            if (enyo.log) { enyo.log("[Atlas] openCard DEBOUNCED target=" + (p.target || "") + " rw=" + (rw ? 1 : 0)); }
            return;
        }
        store.__atlasLastOpen = now;
        _atlasDebounce.__atlasLastOpen = now;   // mirror onto the static so it works even if rw differs next call
        if (rw) { rw.__atlasInAppOpenAt = now; }
        _atlasDebounce.__atlasInAppOpenAt = now;
        if (enyo.log) { enyo.log("[Atlas] openCard OPEN target=" + (p.target || "") + " rw=" + (rw ? 1 : 0)); }
        enyo.windows.openWindow("index.html", null, p);
    };
    function patch() {
        if (window.enyo && enyo.BasicWebView && enyo.BasicWebView.prototype) {
            var orig = enyo.BasicWebView.prototype.create;
            enyo.BasicWebView.prototype.create = function () {
                orig.apply(this, arguments);
                this.domAttributes.type = "application/x-atlas-browser";
            };
            /* Reader-from-loaded-page: the BS pushes the loaded page via msgActionData; the adapter
             * fires this.actionData(dataType,data) on the WebView instance (node.eventListener=this).
             * Cache on the instance + PROBE via a distinctive luna call so we can confirm on the bus. */
            enyo.BasicWebView.prototype.actionData = function (dataType, data) {
                if (dataType === "readerContent") {
                    try {
                        var c = (enyo.json && enyo.json.parse) ? enyo.json.parse(data) : JSON.parse(data);
                        if (!window.__atlasReaderMap) { window.__atlasReaderMap = {}; window.__atlasReaderKeys = []; }
                        var u = this.url || "";
                        if (!window.__atlasReaderMap[u]) window.__atlasReaderKeys.push(u);
                        window.__atlasReaderMap[u] = { title: c.title || "", html: c.html || "" };
                        window.__atlasReaderLatest = { url: u, title: c.title || "", html: c.html || "" };
                        while (window.__atlasReaderKeys.length > 8) { delete window.__atlasReaderMap[window.__atlasReaderKeys.shift()]; }
                    } catch (e) {}
                }
                // Find the owning Browser: this.owner is usually it, but walk the owner/parent chain to be
                // robust against the WebView being wrapped in an intermediate container.
                var findBrowser = function (start, method) {
                    var c = start, n = 0;
                    while (c && n < 12) {
                        if (typeof c[method] === "function") { return c; }
                        c = c.owner || c.parent || c.container;
                        n++;
                    }
                    return null;
                };
                if (dataType === "saveLogin") {
                    // Engine captured a submitted web login form -> offer to save it.
                    try {
                        var s = (enyo.json && enyo.json.parse) ? enyo.json.parse(data) : JSON.parse(data);
                        var b = findBrowser(this, "engineSaveLogin");
                        if (enyo.log) { enyo.log("[Atlas] saveLogin dispatch p=" + (s && s.p ? 1 : 0) + " owner=" + (this.owner ? (this.owner.name || this.owner.kind) : "none") + " browser=" + (b ? (b.name || b.kind) : "NOTFOUND")); }
                        if (s && s.p && b) {
                            b.engineSaveLogin(s.host || "", s.u || "", s.p);
                        }
                    } catch (e2) { if (enyo.log) { enyo.log("[Atlas] saveLogin dispatch err " + e2); } }
                }
                if (dataType === "copiedText") {
                    // Engine ferried the current web-content selection -> put it on the system clipboard.
                    try {
                        var bc = findBrowser(this, "engineCopiedText");
                        if (data && data.length && bc) {
                            bc.engineCopiedText(data);
                        }
                    } catch (e3) {}
                }
                if (enyo.log) { enyo.log("[Atlas] actionData " + dataType + " url=" + (this.url || "") + " len=" + (data ? data.length : 0)); }
            };
            if (enyo.log) { enyo.log("[Atlas] WebView engine -> application/x-atlas-browser"); }
            return true;
        }
        return false;
    }
    if (!patch() && window.enyo && enyo.dispatcher) {
        // BasicWebView not ready yet — retry shortly
        var t = setInterval(function () { if (patch()) { clearInterval(t); } }, 50);
    }
})();
