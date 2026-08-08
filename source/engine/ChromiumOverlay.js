/* Let Atlas's popups be seen on the Chromium host.
 *
 * A browser_shell page view is a native view the shell composites ON TOP of the UI page — that is why a
 * mis-positioned view covers the ActionBar. The same rule quietly breaks every popup Atlas draws over
 * the page area: the context menu, the JS dialogs, the login prompt, the SSL sheet. They open in the
 * DOM exactly as they always have (openContextMenu returns handled, the popup lays out with a real
 * rect and display:block) and are simply never seen, because the page is painted over them.
 *
 * There is no z-order to fix — a native view cannot go behind the UI page. So while any popup is on
 * screen, the active tab's page view stops painting and the area falls back to the app's background;
 * it returns, with bounds re-pushed, once the last popup closes. The page keeps running (this is not
 * the tab-suspend path) so nothing is lost but the pixels.
 *
 * Detection is done in the DOM rather than by patching enyo.Popup: enyo resolves this.inherited at
 * kind-creation time, so a monkey-patch on enyo.Popup.prototype installed later is invisible to kinds
 * that were already defined (measured: BrowserContextMenu never hit a patched showingChanged). Every
 * popup kind does carry the enyo-popup class, so watching for a visible one is both simpler and more
 * robust — including for popups Atlas grows later. Inert on the WPE host. */
if (window.__atlasChromium) {

(function () {
    var scheduled = null;
    var lastState = null;

    function activeWebView() {
        var app = window.__atlasApp;
        var view = app && app.atlasActiveView && app.atlasActiveView();
        return (view && view.$) ? view.$.view : null;
    }

    function anyPopupVisible() {
        var els = document.querySelectorAll(".enyo-popup");
        for (var i = 0; i < els.length; i++) {
            var el = els[i];
            // offsetParent is null for display:none (and for anything not laid out at all)
            if (el.offsetParent === null) { continue; }
            var r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) { return true; }
        }
        return false;
    }

    function evaluate() {
        scheduled = null;
        var state = anyPopupVisible();
        if (state === lastState) { return; }
        lastState = state;
        var wv = activeWebView();
        if (wv && wv.setOverlayHidden) { wv.setOverlayHidden(state); }
    }

    function schedule() {
        if (scheduled) { return; }
        scheduled = setTimeout(evaluate, 30);      // coalesce bursts of DOM mutation into one check
    }

    function start() {
        if (!document.body || typeof window.MutationObserver !== "function") { return; }
        var mo = new window.MutationObserver(schedule);
        mo.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["style", "class"]     // enyo opens/closes a popup by toggling these
        });
        window.addEventListener("resize", schedule, false);
        schedule();
    }

    if (document.body) { start(); }
    else { document.addEventListener("DOMContentLoaded", start, false); }
})();

}
