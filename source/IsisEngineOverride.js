/* Route THIS app's WebView to our Isis/QtWebKit engine:
 * swap the NPAPI mime so enyo loads OUR BrowserAdapter (application/x-isis-browser),
 * which connects to our BrowserServer at /tmp/yapserver.isisbrowser.
 * Stock browser (application/x-palm-browser -> /tmp/yapserver.browser) is untouched. */
(function () {
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
