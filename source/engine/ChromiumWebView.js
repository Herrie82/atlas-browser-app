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
        this.syncBounds();
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
        var params = { partition: this.getPartition() };
        this.pageView = new window.PageView({ "page-contents-params": params });
        shellWin.pageView.addChildView(this.pageView);
        this.pageContents = this.pageView.pageContents;
        this.wireEvents();
        this.pageView.setVisible(true);
        this.syncBounds();
        if (this.pendingUrl) {
            var u = this.pendingUrl;
            this.pendingUrl = null;
            this.loadUrl(u);
        }
    },
    teardownPageView: function () {
        if (!this.pageView) { return; }
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
    syncBounds: function () {
        if (!this.pageView || !this.hasNode()) { return; }
        var r = this.node.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) { return; }
        var key = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(",");
        if (key === this._bounds) { return; }         // nothing moved — don't churn the compositor
        this._bounds = key;
        try {
            this.pageView.setBounds(Math.round(r.left), Math.round(r.top),
                                    Math.round(r.width), Math.round(r.height));
        } catch (e) {}
    },
    resize: function () {
        this.syncBounds();
    },
    resizeHandler: function () {
        this.inherited(arguments);
        this.syncBounds();
    },
    showingChanged: function () {
        this.inherited(arguments);
        if (this.pageView) {
            try { this.pageView.setVisible(!!this.showing); } catch (e) {}
            if (this.showing) { this.syncBounds(); }
        }
    },

    // ---------------------------------------------------------------------------------------------
    // engine events -> Atlas events
    // ---------------------------------------------------------------------------------------------
    wireEvents: function () {
        var pc = this.pageContents, self = this;
        function on(name, fn) { try { pc.on(name, fn); } catch (e) {} }

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
            if (u && u !== self.url) {
                self.url = u;
                self.doUrlRedirected(u);
            }
            self.pushTitle();
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
        this.doPageTitleChanged(this.title, this.currentUrl(), this.canGoBack, this.canGoForward);
    },
    refreshNavState: function () {
        if (!this.pageContents) { return; }
        this.canGoBack = !!this.pageContents.canGoBack;
        this.canGoForward = !!this.pageContents.canGoForward;
    },
    currentUrl: function () {
        try { return (this.pageContents && this.pageContents.url) || this.url || ""; } catch (e) { return this.url || ""; }
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
        var u = this.stripMarkers(inUrl);
        if (!u) { return; }
        if (!this.pageContents) { this.pendingUrl = u; return; }
        try { this.pageContents.loadURL(u); } catch (e) { this.error("[Atlas] loadURL failed " + e); }
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
        // Text selection is native in Chromium (handles and all), so Atlas's marker-driven selection
        // commands have nothing to drive.
        case "enableSelectionMode":
        case "disableSelectionMode":
        case "extendSelectionTo":
        case "clearSelection":
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
