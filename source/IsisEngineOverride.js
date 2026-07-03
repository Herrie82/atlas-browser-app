/* Route THIS app's WebView to our Isis/QtWebKit engine:
 * swap the NPAPI mime so enyo loads OUR BrowserAdapter (application/x-isis-browser),
 * which connects to our BrowserServer at /tmp/yapserver.isisbrowser.
 * Stock browser (application/x-palm-browser -> /tmp/yapserver.browser) is untouched. */
(function () {
    // Open a new browser card exactly once. On LunaCE an in-app openWindow ALSO fires
    // applicationRelaunch (whose else-branch would open a duplicate card); the {_isisInApp}
    // param doesn't reliably survive into the root window's relaunch windowParams, so we ALSO
    // stamp a timestamp on the shared root-window object, which the relaunch handler can read.
    window.isisOpenCard = function (params) {
        var p = params || {};
        p._isisInApp = 1;
        try {
            var rw = enyo.windows.getRootWindow();
            if (rw) {
                var now = (new Date()).getTime();
                // Debounce: LunaCE delivers a button/menu tap as BOTH a tap and a click, firing the
                // open twice within a few ms -> two cards. Swallow a second call inside 700ms.
                // (__isisLastOpen is separate from __isisInAppOpenAt, which the relaunch handler clears.)
                if (rw.__isisLastOpen && (now - rw.__isisLastOpen) < 700) { return; }
                rw.__isisLastOpen = now;
                rw.__isisInAppOpenAt = now;   // for the relaunch-handler duplicate guard
            }
        } catch (e) {}
        enyo.windows.openWindow("index.html", null, p);
    };
    function patch() {
        if (window.enyo && enyo.BasicWebView && enyo.BasicWebView.prototype) {
            var orig = enyo.BasicWebView.prototype.create;
            enyo.BasicWebView.prototype.create = function () {
                orig.apply(this, arguments);
                this.domAttributes.type = "application/x-isis-browser";
            };
            /* Reader-from-loaded-page: the BS pushes the loaded page via msgActionData; the adapter
             * fires this.actionData(dataType,data) on the WebView instance (node.eventListener=this).
             * Cache on the instance + PROBE via a distinctive luna call so we can confirm on the bus. */
            enyo.BasicWebView.prototype.actionData = function (dataType, data) {
                if (dataType === "readerContent") {
                    try {
                        var c = (enyo.json && enyo.json.parse) ? enyo.json.parse(data) : JSON.parse(data);
                        if (!window.__isisReaderMap) { window.__isisReaderMap = {}; window.__isisReaderKeys = []; }
                        var u = this.url || "";
                        if (!window.__isisReaderMap[u]) window.__isisReaderKeys.push(u);
                        window.__isisReaderMap[u] = { title: c.title || "", html: c.html || "" };
                        window.__isisReaderLatest = { url: u, title: c.title || "", html: c.html || "" };
                        while (window.__isisReaderKeys.length > 8) { delete window.__isisReaderMap[window.__isisReaderKeys.shift()]; }
                    } catch (e) {}
                }
                if (dataType === "saveLogin") {
                    // Engine captured a submitted web login form -> offer to save it (this.owner is the Browser).
                    try {
                        var s = (enyo.json && enyo.json.parse) ? enyo.json.parse(data) : JSON.parse(data);
                        if (s && s.p && this.owner && this.owner.engineSaveLogin) {
                            this.owner.engineSaveLogin(s.host || "", s.u || "", s.p);
                        }
                    } catch (e2) {}
                }
                if (dataType === "copiedText") {
                    // Engine ferried the current web-content selection -> put it on the system clipboard.
                    try {
                        if (data && data.length && this.owner && this.owner.engineCopiedText) {
                            this.owner.engineCopiedText(data);
                        }
                    } catch (e3) {}
                }
                if (enyo.log) { enyo.log("[Isis] actionData " + dataType + " url=" + (this.url || "") + " len=" + (data ? data.length : 0)); }
            };
            if (enyo.log) { enyo.log("[Isis] WebView engine -> application/x-isis-browser"); }
            return true;
        }
        return false;
    }
    if (!patch() && window.enyo && enyo.dispatcher) {
        // BasicWebView not ready yet — retry shortly
        var t = setInterval(function () { if (patch()) { clearInterval(t); } }, 50);
    }
})();
