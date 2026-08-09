/* enyo.WebView reimplemented on the LuneOS browser_shell PageView — the Chromium half of the engine seam.
 *
 * On the WPE host, enyo.WebView is an NPAPI plugin instance living in the DOM: the engine paints into
 * the plugin's rectangle and the framework talks to it through synchronous plugin calls. browser_shell
 * has nothing like that. Its page views are NATIVE views owned by the shell, composited BEHIND the UI
 * page and positioned in window coordinates — they are not DOM nodes and cannot be laid out by CSS.
 *
 * So this kind renders an ordinary empty div as a PLACEHOLDER and keeps the native view glued to that
 * div's rectangle (see syncBounds). Everything else is translation: Atlas's WebView API and events on
 * one side, pageContents on the other. Atlas is unchanged — it still says {kind: "WebView"}.
 *
 * Loaded from depends.js AFTER the framework, so this definition replaces the framework's enyo.WebView;
 * it self-gates and leaves the NPAPI kind alone on the WPE host. */
if (window.__atlasChromium) {

enyo.kind({
    name: "enyo.WebView",
    kind: enyo.Control,
    className: "enyo-webview atlas-chromium-webview",
    published: {
        identifier: "",
        url: "",
        minFontSize: 16,
        enableJavascript: true,
        blockPopups: true,
        acceptCookies: true,
        headerHeight: 0
    },
    // Same event set the NPAPI kind published, so Browser.js binds without changes. Events with no
    // browser_shell equivalent (onFileLoad, onDisconnected, onResized) simply never fire.
    events: {
        onMousehold: "",
        onResized: "",
        onPageTitleChanged: "",
        onUrlRedirected: "",
        onSingleTap: "",
        onLoadStarted: "",
        onLoadProgress: "",
        onLoadStopped: "",
        onLoadComplete: "",
        onFileLoad: "",
        onAlertDialog: "",
        onConfirmDialog: "",
        onPromptDialog: "",
        onSSLConfirmDialog: "",
        onUserPasswordDialog: "",
        onNewPage: "",
        onPrint: "",
        onEditorFocusChanged: "",
        onScrolledTo: "",
        onError: "",
        onDisconnected: ""
    },

    // ---------------------------------------------------------------------------------------------
    // lifecycle
    // ---------------------------------------------------------------------------------------------
    create: function () {
        this.inherited(arguments);
        this.pageView = null;
        this.pageContents = null;
        this.loading = false;
        this.title = "";
        this.canGoBack = false;
        this.canGoForward = false;
        this.pendingDialog = null;      // { ok: fn, cancel: fn } while a page dialog is up
        this.pendingUrl = null;         // setUrl() before the view exists
        this._bounds = "";
    },
    rendered: function () {
        this.inherited(arguments);
        if (!this.pageView) { this.createPageView(); }
        this.scheduleBoundsSync();
    },
    destroy: function () {
        this.teardownPageView();
        this.inherited(arguments);
    },

    createPageView: function () {
        var shellWin = window.shell && window.shell.shellWindow;
        if (!shellWin || typeof window.PageView !== "function") {
            this.error("[Atlas] no browser_shell PageView available");
            return;
        }
        // browser_shell_ipc gives the PAGE a ShellIpc constructor, which is how injected script talks
        // back to us (see installInputBridge).
        var params = { partition: this.getPartition(), api: ["v8/browser_shell_ipc"] };
        this.pageView = new window.PageView({ "page-contents-params": params });
        shellWin.pageView.addChildView(this.pageView);
        this.pageContents = this.pageView.pageContents;
        this.wireEvents();
        this.pageView.setVisible(true);
        this.scheduleBoundsSync();
        if (this.pendingUrl) {
            var u = this.pendingUrl;
            this.pendingUrl = null;
            this.loadUrl(u);
        }
    },
    teardownPageView: function () {
        if (!this.pageView) { return; }
        try { if (this._ipc && this._ipc.removeAllEventListeners) { this._ipc.removeAllEventListeners(); } } catch (e1) {}
        this._ipc = null;
        try {
            var shellWin = window.shell && window.shell.shellWindow;
            if (shellWin) { shellWin.pageView.removeChildView(this.pageView); }
            if (this.pageContents && this.pageContents.closeNow) { this.pageContents.closeNow(); }
        } catch (e) {}
        this.pageView = null;
        this.pageContents = null;
    },

    /* A card tagged private gets its own throwaway partition so its cookies and storage never touch
     * the normal profile — the Chromium equivalent of the WPE atlas-private: marker. */
    getPartition: function () {
        var id = this.identifier || "";
        return (id.indexOf("private") === 0) ? ("atlas-private-" + id) : "persist:atlas";
    },

    // ---------------------------------------------------------------------------------------------
    // geometry: keep the native view exactly over our placeholder div
    // ---------------------------------------------------------------------------------------------
    /* A view that has never been given bounds is drawn by the shell at full window size — which means
     * it covers Atlas's own toolbar. The placeholder usually measures 0x0 for a beat after the view is
     * created or re-shown (enyo lays out on the next frames), so a single sync attempt can silently do
     * nothing and leave the page over the chrome. Retry over a few frames and stop at the first
     * measurement that sticks. */
    scheduleBoundsSync: function () {
        var self = this, delays = [0, 40, 120, 300, 700], i = 0;
        var tick = function () {
            if (self.destroyed || !self.pageView) { return; }
            self.syncBounds();
            // Deliberately run EVERY tick rather than stopping at the first non-zero measurement: the
            // first one lands before sibling chrome (the ActionBar) has laid out, so it measures the
            // full area and the page ends up over the toolbar. Later ticks are no-ops once the rect
            // stops changing.
            if (++i < delays.length) { setTimeout(tick, delays[i]); }
        };
        setTimeout(tick, delays[0]);
    },
    syncBounds: function () {
        if (!this.pageView || !this.hasNode()) { return; }
        var r = this.node.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) { return; }
        var key = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(",");
        this._rect = { left: Math.round(r.left), top: Math.round(r.top) };   // for page -> app coords
        if (key === this._bounds) { return; }         // nothing moved — don't churn the compositor
        this._bounds = key;
        try {
            this.pageView.setBounds(Math.round(r.left), Math.round(r.top),
                                    Math.round(r.width), Math.round(r.height));
        } catch (e) {}
    },
    resize: function () {
        this.scheduleBoundsSync();
    },
    resizeHandler: function () {
        this.inherited(arguments);
        this.syncBounds();
    },
    showingChanged: function () {
        this.inherited(arguments);
        if (this.pageView) {
            try { this.pageView.setVisible(!!this.showing); } catch (e) {}
            if (this.showing) { this.scheduleBoundsSync(); }
        }
    },
    /* Yield the screen area to an Atlas popup: the native view is composited above the UI page, so a
     * popup drawn over the page is invisible until the view stops painting there (ChromiumOverlay.js).
     * The page keeps running — only its pixels go away. */
    setOverlayHidden: function (hidden) {
        this._overlayHidden = !!hidden;
        if (!this.pageView) { return; }
        try { this.pageView.setVisible(!hidden && !!this.showing); } catch (e) {}
        if (!hidden) { this.scheduleBoundsSync(); }
    },
    /* Foreground/background a whole tab (see TabLayer.js). Hiding alone would leave the page live and
     * costing memory, so a backgrounded view also suspends its DOM and media. */
    setEngineActive: function (active) {
        var pc = this.pageContents;
        try {
            if (this.pageView) { this.pageView.setVisible(!!active && !this._overlayHidden); }
            if (!pc) { return; }
            if (active) {
                pc.resumeDOM(); pc.resumeMedia(); pc.activate();
                var shellWin = window.shell && window.shell.shellWindow;
                if (shellWin && this.pageView) { shellWin.pageView.bringToFront(this.pageView); }
                this._bounds = "";              // force a re-push; layout may have moved while hidden
                this.scheduleBoundsSync();
                // Deliberately NOT calling pc.setFocus() here: the native view takes keyboard focus away
                // from the UI page, which makes Atlas's address bar impossible to type in. Chromium
                // focuses the page itself when the user taps it.
            } else {
                pc.suspendMedia(); pc.suspendDOM(); pc.deactivate();
            }
        } catch (e) {}
    },

    // ---------------------------------------------------------------------------------------------
    // engine events -> Atlas events
    // ---------------------------------------------------------------------------------------------
    wireEvents: function () {
        var pc = this.pageContents, self = this;
        function on(name, fn) { try { pc.on(name, fn); } catch (e) {} }

        on("dom-ready", function () { self.installInputBridge(); });
        on("did-start-loading", function () {
            self.loading = true;
            self.doLoadStarted();
        });
        // "laod-progress-changed" is the shell's spelling, not a typo here. The payload has varied by
        // release, so accept a bare number, {progress}, or an event-ish object, and normalise to 0-100.
        on("laod-progress-changed", function (ev) {
            self.doLoadProgress(self.readProgress(ev));
        });
        on("did-stop-loading", function () {
            self.loading = false;
            self.refreshNavState();
            self.doLoadStopped();
        });
        on("did-finish-load", function () {
            self.loading = false;
            self.refreshNavState();
            self.doLoadProgress(100);
            self.doLoadComplete();
            self.pushTitle();
        });
        on("page-title-updated", function (a) {
            self.title = self.readString(a) || self.title;
            self.pushTitle();
        });
        on("did-finish-navigation", function () {
            self.refreshNavState();
            var u = self.currentUrl();
            /* A newly created page view starts at about:blank, and that navigation can complete AFTER
             * our loadURL — clobbering the requested URL in Atlas's address bar and tab label, or even
             * leaving the tab blank if the early load was dropped. Ignore the blank state while a real
             * URL is outstanding, and re-issue the load once in case it never took. */
            if (self.isBlank(u) && !self.isBlank(self.requestedUrl)) {
                /* falls through to the re-issue below */
                if (!self._reissued) {
                    self._reissued = true;
                    var want = self.requestedUrl;
                    setTimeout(function () { if (self.pageContents) { try { self.pageContents.loadURL(want); } catch (e) {} } }, 0);
                }
                return;
            }
            if (u && u !== self.url) {
                // NOT doUrlRedirected: BrowserApp maps that event to openResource, which asks the
                // system to open the URL in the default handler. On WPE it only fires for a scheme the
                // engine cannot load; firing it per navigation makes every page load launch the
                // platform's default browser (enactbrowser) alongside us. Atlas learns the new URL
                // from pageTitleChanged, which carries it.
                if (self.isExternalScheme(u)) { self.doUrlRedirected(u); }
            }
            // NB: the address bar is driven by onPageUrl (main frame only), not from here.
        });
        on("did-fail-load", function (url, isMainFrame, error, errorCode) {
            self.loading = false;
            if (isMainFrame === false) { return; }      // subresource failure is not a page error
            self.doError(errorCode, error, url);
        });
        on("newwindow", function (ev) {
            // Atlas answers this by opening a card; the tab layer turns that into a tab here.
            var target = self.readString(ev && (ev.targetUrl || ev.url)) || "";
            self.doNewPage(target || ("atlas-new-" + (new Date()).getTime()));
        });
        on("dialog", function (messageType, messageText, controller, defaultPromptText) {
            self.onEngineDialog(messageType, messageText, controller, defaultPromptText);
        });
        on("login", function (e) {
            // HTTP auth: the shell hands back a response(login, password) callback.
            self.pendingDialog = {
                ok: function (user, pass) { try { e.response(user, pass); } catch (err) {} },
                cancel: function () {}
            };
            self.doUserPasswordDialog(self.readString(e && e.url) || self.url);
        });
        on("zoomchange", function () { /* zoomFactor is read back on demand */ });
        on("close", function () { self.doError(0, "closed", self.url); });
    },

    onEngineDialog: function (messageType, messageText, controller, defaultPromptText) {
        this.pendingDialog = controller || null;
        var msg = this.readString(messageText) || "";
        switch (String(messageType)) {
        case "alert":       this.doAlertDialog(msg); break;
        case "confirm":     this.doConfirmDialog(msg); break;
        case "prompt":      this.doPromptDialog(msg, defaultPromptText || ""); break;
        case "auth":        this.doUserPasswordDialog(msg); break;
        case "unresponsive":
            // Not a page dialog — Atlas has no "page is hung" UI, so let the page keep going.
            if (controller && controller.ok) { try { controller.ok(); } catch (e) {} }
            this.pendingDialog = null;
            break;
        default:            this.doAlertDialog(msg); break;
        }
    },

    pushTitle: function () {
        // this.url is the MAIN FRAME location (onPageUrl); pageContents.url follows subframes too and
        // would put tracker iframe URLs in the address bar and the history database.
        var u = this.url || this.currentUrl();
        if (this.isBlank(u) && !this.isBlank(this.requestedUrl)) { return; }   // see did-finish-navigation
        this.doPageTitleChanged(this.title, u, this.canGoBack, this.canGoForward);
    },
    isBlank: function (u) {
        return !u || u === "about:blank";
    },
    refreshNavState: function () {
        if (!this.pageContents) { return; }
        this.canGoBack = !!this.pageContents.canGoBack;
        this.canGoForward = !!this.pageContents.canGoForward;
    },
    currentUrl: function () {
        try { return (this.pageContents && this.pageContents.url) || this.url || ""; } catch (e) { return this.url || ""; }
    },
    // ---------------------------------------------------------------------------------------------
    // input bridge: taps and scrolling inside the page
    // ---------------------------------------------------------------------------------------------
    /* browser_shell reports nothing about what happens INSIDE a page — no tap, no scroll — but Atlas
     * needs both (a tap dismisses the selection UI; the scroll offset positions it). The page is a
     * separate process, so the only channel is script injected into it talking back over ShellIpc on a
     * per-view channel. Re-injected on every dom-ready, since a navigation wipes the page context; the
     * guard flag makes a double injection harmless. */
    ipcChannel: function () {
        if (!this._ipcChannel) {
            this._ipcChannel = "atlas_input_" + (this.id || this.name || "view").replace(/[^A-Za-z0-9_]/g, "_");
        }
        return this._ipcChannel;
    },
    installInputBridge: function () {
        if (!this.pageContents) { return; }
        this.openInputChannel();
        var js = "(function(){" +
            "  if (window.__atlasInputBridge) { return; }" +
            "  if (typeof ShellIpc === 'undefined') { return; }" +
            "  window.__atlasInputBridge = 1;" +
            "  var ipc = new ShellIpc(" + JSON.stringify(this.ipcChannel()) + ");" +
            /* Hit-test for the long-press menu: what Atlas needs to decide between the link, image,
             * edit and page menus. */
            "  var hit = function (el) {" +
            "    var link = null, img = null, n = el;" +
            "    while (n && n !== document) {" +
            "      if (!link && n.tagName === 'A' && n.href) { link = n; }" +
            "      if (!img && n.tagName === 'IMG') { img = n; }" +
            "      n = n.parentNode;" +
            "    }" +
            "    var tag = (el && el.tagName || '').toUpperCase();" +
            "    var editable = !!(el && el.isContentEditable) || tag === 'TEXTAREA' ||" +
            "      (tag === 'INPUT' && /^(text|search|url|email|tel|password|number|)$/i.test(el.type || ''));" +
            "    return {" +
            "      isLink: !!link, linkUrl: link ? link.href : ''," +
            "      linkText: link ? (link.textContent || '').replace(/\\s+/g, ' ').substring(0, 200) : ''," +
            "      isImage: !!img, imageUrl: img ? img.src : ''," +
            "      title: (img && img.title) || (link && link.title) || ''," +
            "      altText: (img && img.alt) || ''," +
            "      editable: editable" +
            "    };" +
            "  };" +
            "  var postUrl = function () { ipc.post('url', { href: location.href, title: document.title }); };" +
            "  postUrl();" +
            "  window.addEventListener('popstate', postUrl, true);" +
            "  window.addEventListener('hashchange', postUrl, true);" +
            "  var postHold = function (x, y, el) {" +
            "    ipc.post('hold', { x: x, y: y, info: hit(el || document.elementFromPoint(x, y)) });" +
            "  };" +
            /* Blink raises contextmenu for a touch long-press as well as a right-click, so it covers
             * both; preventDefault stops Chromium's own menu appearing under Atlas's. */
            "  document.addEventListener('contextmenu', function (e) {" +
            "    e.preventDefault();" +
            "    postHold(e.clientX, e.clientY, e.target);" +
            "  }, true);" +
            /* Fallback for touch builds that never synthesise contextmenu. */
            "  var timer = null, sx = 0, sy = 0;" +
            "  var cancel = function () { if (timer) { clearTimeout(timer); timer = null; } };" +
            "  document.addEventListener('touchstart', function (e) {" +
            "    if (!e.touches || e.touches.length !== 1) { cancel(); return; }" +
            "    var t = e.touches[0]; sx = t.clientX; sy = t.clientY;" +
            "    cancel();" +
            "    timer = setTimeout(function () { timer = null; postHold(sx, sy, null); }, 550);" +
            "  }, true);" +
            "  document.addEventListener('touchmove', function (e) {" +
            "    var t = e.touches && e.touches[0];" +
            "    if (!t || Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) { cancel(); }" +
            "  }, true);" +
            "  document.addEventListener('touchend', cancel, true);" +
            "  document.addEventListener('touchcancel', cancel, true);" +
            "  document.addEventListener('click', function (e) {" +
            "    var n = e.target, link = '', img = '';" +
            "    while (n && n !== document) { if (n.tagName === 'A' && n.href) { link = n.href; break; } n = n.parentNode; }" +
            "    if (e.target && e.target.tagName === 'IMG') { img = e.target.src || ''; }" +
            "    ipc.post('tap', { x: e.clientX, y: e.clientY, link: link, img: img });" +
            "  }, true);" +
            "  var pending = false;" +
            "  var report = function () {" +
            "    pending = false;" +
            "    ipc.post('scroll', { x: window.pageXOffset || 0, y: window.pageYOffset || 0 });" +
            "  };" +
            "  window.addEventListener('scroll', function () {" +
            "    if (pending) { return; }" +          /* coalesce to one report per frame */
            "    pending = true;" +
            "    (window.requestAnimationFrame || window.setTimeout)(report, 16);" +
            "  }, true);" +
            "})();";
        this.runScript(js);
    },
    openInputChannel: function () {
        if (this._ipc || typeof window.ShellIpc === "undefined") { return; }
        var self = this;
        try {
            this._ipc = new window.ShellIpc(this.ipcChannel());
            this._ipc.on("tap", function (msg) { self.onPageTap(msg || {}); });
            this._ipc.on("scroll", function (msg) { self.onPageScroll(msg || {}); });
            this._ipc.on("hold", function (msg) { self.onPageHold(msg || {}); });
            this._ipc.on("url", function (msg) { self.onPageUrl(msg || {}); });
        } catch (e) {
            enyo.log("[Atlas] input bridge unavailable: " + e);
        }
    },
    /* Page coordinates are relative to the page view; Atlas works in app-window coordinates, so shift
     * by where the view currently sits. */
    onPageTap: function (msg) {
        // The user touched the page: keyboard focus belongs to it now (the shim hands focus back to
        // the UI page whenever a UI field is focused).
        try { if (this.pageContents && this.pageContents.setFocus) { this.pageContents.setFocus(); } } catch (e) {}
        var r = this._rect || { left: 0, top: 0 };
        var position = { left: r.left + (msg.x || 0), top: r.top + (msg.y || 0) };
        var tapInfo = { linkUrl: msg.link || "", imageUrl: msg.img || "" };
        this.doSingleTap(position, null, tapInfo);
    },
    onPageScroll: function (msg) {
        this.doScrolledTo(msg.x || 0, msg.y || 0);
    },
    /* The main frame telling us where it actually is. pageContents.url follows SUBFRAME navigations
     * too, so on an ad-heavy page the address bar (and history) filled up with tracker iframe URLs.
     * The bridge only ever runs in the main frame, so this is authoritative. */
    onPageUrl: function (msg) {
        var href = msg && msg.href;
        if (!href || this.isBlank(href)) { return; }
        this.url = href;
        if (msg.title) { this.title = msg.title; }
        this.refreshNavState();
        this.doPageTitleChanged(this.title, href, this.canGoBack, this.canGoForward);
    },
    /* Long press -> Atlas's context menu. openContextMenu reads pageX/pageY to place the popup and
     * the hit-test to choose between the link, image, edit and page menus. */
    onPageHold: function (msg) {
        var r = this._rect || { left: 0, top: 0 };
        var ev = { pageX: r.left + (msg.x || 0), pageY: r.top + (msg.y || 0) };
        this.doMousehold(ev, msg.info || {});
    },
    /* Chromium selects natively, but Atlas drives the plain-text long press through
     * enableSelectionMode, so honour it by selecting the word under the point. The app-space point has
     * to come back to page space first. Atlas's marker/popover UI stays unwired: it is fed by the WPE
     * backend's selectionBounds messages, which have no equivalent here. */
    selectWordAt: function (appX, appY) {
        var r = this._rect || { left: 0, top: 0 };
        var x = Math.round((appX || 0) - r.left), y = Math.round((appY || 0) - r.top);
        this.runScript(
            "(function(){" +
            "  var rng = document.caretRangeFromPoint ? document.caretRangeFromPoint(" + x + "," + y + ") : null;" +
            "  if (!rng) { return; }" +
            "  var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);" +
            "  if (sel.modify) { sel.modify('move', 'backward', 'word'); sel.modify('extend', 'forward', 'word'); }" +
            "})();");
    },

    /* Schemes the engine itself cannot render — these are the ones Atlas should hand to the system
     * (mailto:, tel:, an app's custom OAuth redirect...). Everything web-ish stays in the tab. */
    isExternalScheme: function (u) {
        var m = /^([a-z][a-z0-9+.-]*):/i.exec(String(u || ""));
        if (!m) { return false; }
        var s = m[1].toLowerCase();
        return !(s === "http" || s === "https" || s === "file" || s === "about" ||
                 s === "data" || s === "blob" || s === "chrome" || s === "ftp");
    },
    readString: function (v) {
        if (typeof v === "string") { return v; }
        if (v && typeof v === "object") { return v.title || v.url || v.value || ""; }
        return "";
    },
    readProgress: function (ev) {
        var p = ev;
        if (ev && typeof ev === "object") { p = (ev.progress !== undefined) ? ev.progress : ev.value; }
        p = parseFloat(p);
        if (isNaN(p)) { return 0; }
        return (p <= 1) ? Math.round(p * 100) : Math.round(p);   // some builds report 0..1
    },

    // ---------------------------------------------------------------------------------------------
    // Atlas API
    // ---------------------------------------------------------------------------------------------
    identifierChanged: function () {},
    urlChanged: function () {
        this.loadUrl(this.url);
    },
    setUrl: function (inUrl) {
        this.url = inUrl;
        this.loadUrl(inUrl);
    },
    getUrl: function () {
        return this.currentUrl();
    },
    goToUrl: function (inUrl) {
        this.setUrl(inUrl);
    },
    loadUrl: function (inUrl) {
        var u = this.normalizeUrl(this.stripMarkers(inUrl));
        if (!u) { return; }
        this.requestedUrl = u;
        this._reissued = false;
        if (!this.pageContents) { this.pendingUrl = u; return; }
        try { this.pageContents.loadURL(u); } catch (e) { this.error("[Atlas] loadURL failed " + e); }
    },
    /* Chromium's loadURL needs an absolute URL. Atlas hands the engine whatever the user typed once it
     * decides the input is a URL rather than a search, and BrowserServer used to normalise a bare
     * hostname for us — pass "vk.nl" to pageContents.loadURL and the view just stays on about:blank.
     * Add the scheme here, conservatively: only for input that actually looks like a host. */
    normalizeUrl: function (inUrl) {
        var u = String(inUrl || "").trim();
        if (!u) { return u; }
        // "localhost:8080" parses as scheme "localhost" — a host:port is not a scheme.
        if (/^[a-z0-9.\-]+:\d+([\/?#]|$)/i.test(u)) { return "http://" + u; }
        if (/^[a-z][a-z0-9+.\-]*:/i.test(u)) { return u; }                 // already has a scheme
        if (/^\/\//.test(u)) { return "https:" + u; }                      // protocol-relative
        if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([\/?#]|$)/i.test(u)) { return "http://" + u; }
        if (/^[^\s\/?#]+\.[^\s\/?#]+/.test(u)) { return "https://" + u; }  // host.tld[/path]
        return u;                                                          // not host-like: leave alone
    },

    /* atlas-simple: / atlas-private: are WPE backend markers (viewport-only rendering, private mode).
     * Chromium handles both natively — simple mode is meaningless and private is a partition — so the
     * markers are stripped rather than sent to the engine. */
    stripMarkers: function (inUrl) {
        var u = String(inUrl || "");
        while (u.indexOf("atlas-private:") === 0 || u.indexOf("atlas-simple:") === 0) {
            u = u.substring(u.indexOf(":") + 1);
        }
        return u;
    },

    isLoading: function () { return this.loading; },
    setIdentifier: function (inId) { this.identifier = inId; },
    getZoom: function () {
        try { return this.pageContents ? this.pageContents.zoomFactor : 1; } catch (e) { return 1; }
    },
    setZoom: function (inZoom) {
        try { if (this.pageContents) { this.pageContents.zoomFactor = inZoom; } } catch (e) {}
    },
    insertStringAtCursor: function (inString) {
        this.runScript("document.execCommand('insertText', false, " + JSON.stringify(String(inString || "")) + ");");
    },
    findInPage: function (inString) {
        // No find API on pageContents; window.find covers the common case (no match count, no highlight-all).
        this.runScript("window.find(" + JSON.stringify(String(inString || "")) + ");");
    },
    runScript: function (js) {
        try { if (this.pageContents) { this.pageContents.executeJavaScriptInMainFrame(js); } } catch (e) {}
    },

    /* Atlas funnels everything the NPAPI plugin used to expose through viewCall -> callBrowserAdapter,
     * so this dispatch table IS the rest of the API. Anything without a browser_shell equivalent is
     * logged once and ignored rather than throwing into Atlas's call sites. */
    callBrowserAdapter: function (inMethod, inArgs) {
        var a = inArgs || [];
        var pc = this.pageContents;
        switch (inMethod) {
        case "reloadPage":      try { pc && pc.reload(); } catch (e) {} break;
        case "stopLoad":        try { pc && pc.stop(); } catch (e) {} break;
        case "goBack":          try { pc && pc.goBack(); } catch (e) {} break;
        case "goForward":       try { pc && pc.goForward(); } catch (e) {} break;
        case "clearHistory":    break;                       // the shell owns per-view history
        case "clearCache":      this.clearData(["cache"]); break;
        case "clearCookies":    this.clearData(["cookies"]); break;
        case "insertStringAtCursor": this.insertStringAtCursor(a[0]); break;
        case "findInPage":      this.findInPage(a[0]); break;
        case "copy":            this.runScript("document.execCommand('copy');"); break;
        case "paste":           this.runScript("document.execCommand('paste');"); break;
        case "selectAll":       this.runScript("document.execCommand('selectAll');"); break;
        case "enableSelectionMode": this.selectWordAt(a[0], a[1]); break;
        case "clearSelection":  this.runScript("try { window.getSelection().removeAllRanges(); } catch (e) {}"); break;
        case "acceptDialog":    this.answerDialog(true, a); break;
        case "cancelDialog":    this.answerDialog(false, a); break;
        case "sendDialogResponse": this.answerDialog(!!a[0], []); break;
        case "activate":        try { pc && pc.activate(); pc && pc.resumeDOM(); pc && pc.resumeMedia(); } catch (e) {} break;
        case "deactivate":      try { pc && pc.suspendMedia(); pc && pc.suspendDOM(); pc && pc.deactivate(); } catch (e) {} break;
        case "disconnectBrowserServer": this.teardownPageView(); break;
        case "setEnableJavascript":
        case "setBlockPopups":
        case "setAcceptCookies":
        case "setAutoplayWithSound":
        case "ignoreMetaRefreshTags":
        case "setUserSelect":
        case "printFrame":
        // The rest of Atlas's marker-driven selection has nothing to drive: Chromium owns the drag
        // handles, and there is no selectionBounds channel to place Atlas's own markers.
        case "disableSelectionMode":
        case "extendSelectionTo":
        case "setDragMode":
            this.unsupported(inMethod);
            break;
        default:
            this.unsupported(inMethod);
            break;
        }
    },
    answerDialog: function (accept, args) {
        var d = this.pendingDialog;
        this.pendingDialog = null;
        if (!d) { return; }
        try {
            if (accept && d.ok) { d.ok.apply(d, args || []); }
            else if (!accept && d.cancel) { d.cancel(); }
        } catch (e) {}
    },
    clearData: function (types) {
        try { if (this.pageContents) { this.pageContents.clearData({ since: 0 }, types); } } catch (e) {}
    },
    unsupported: function (name) {
        if (!this._warned) { this._warned = {}; }
        if (this._warned[name]) { return; }
        this._warned[name] = true;
        enyo.log("[Atlas] chromium engine: '" + name + "' has no browser_shell equivalent — ignored");
    },

    /* Card thumbnails. captureVisibleRegion is asynchronous here, where the NPAPI call was synchronous
     * and wrote files; callers get the data URI through the callback instead. */
    createPageImages: function (inCallback) {
        if (!this.pageContents || !this.pageContents.captureVisibleRegion) {
            if (inCallback) { inCallback(null); }
            return;
        }
        try {
            this.pageContents.captureVisibleRegion({ format: "jpeg", quality: 70 }, function (img) {
                if (inCallback) { inCallback(img); }
            });
        } catch (e) { if (inCallback) { inCallback(null); } }
    }
});

}
