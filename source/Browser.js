//   Copyright 2012 Hewlett-Packard Development Company, L.P.
//
//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an "AS IS" BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
//   limitations under the License.

enyo.kind({
	name: "Browser",
	kind: enyo.VFlexBox,
	className: "basic-back",
	published: {
		url: "",
		searchPreferences: {},
		defaultSearch: "",
		offerTranslate: false
	},
	events: {
		onPageTitleChanged: "",
		onPageLoadStopped: "",
		onFileLoad: "",
		onDownloadLink: "",
		onAddBookmark: "",
		onDeleteBookmark: "",
		onAddToLauncher: "",
		onShareLink: "",
		onOpenBookmarks: "",
		onPrint: "",
		onUrlRedirected: "",
		// called when user picks "Reading Mode" on a link in the context menu
		onReaderLink: "",
		// called when user wants to leave the browser
		onClose: "",
		// user typed atlas:home in the address bar -> app switches to the start-page (bookmark grid) view
		onGoHome: "",
		// user tapped the address-bar translate icon -> app opens the page via Google Translate
		onTranslatePage: ""
	},
	components: [
		{kind: "Control", style: "position:absolute; bottom:0px; left:0px; height:8px; width:1024px; background-color:none; z-index:120;"},
		{name: "launchApplicationService", kind: enyo.PalmService, service: enyo.palmServices.application, method: "open"},
		{name: "importWallpaperService", kind: enyo.PalmService, service: enyo.palmServices.system, method: "wallpaper/importWallpaper", onSuccess: "importedWallpaper", onFailure: "wallpaperError"},
		{name: "setWallpaperService", kind: enyo.PalmService, service: enyo.palmServices.system, method: "setPreferences", onFailure: "wallpaperError"},
		{name: "actionbar", kind: "ActionBar",
			onBack: "goBack",
			onForward: "goForward",
			onLoad: "goClick",
			onStopLoad: "stopClick",
			onRefresh: "reloadClick",
			onAddBookmark: "doAddBookmark",
			onDeleteBookmark: "doDeleteBookmark",
			onAddToLauncher: "doAddToLauncher",
			onShareLink: "doShareLink",
			onOpenBookmarks: "doOpenBookmarks",
			onNewCard: "openNewCard",
			onHistorySelected: "setHistoryUrl",
			onTranslate: "actionbarTranslate"
		},
		{name: "findDialog", kind: "FindBar", showing: false, onFind: "find", onGoToPrevious: "goToPrevious", onGoToNext: "goToNext"},
		{name: "view", kind: "WebView", flex: 1, height: "100%",
			onMousehold: "openContextMenu",
			onPageTitleChanged: "pageTitleChanged",
			onUrlRedirected: "doUrlRedirected",
			onLoadStarted: "loadStarted",
			onLoadProgress: "loadProgress",
			onLoadStopped: "loadStopped",
			onLoadComplete: "loadCompleted",
			onFileLoad: "doFileLoad",
			onError: "browserError",
			onSingleTap: "browserTap",
			onScrolledTo: "browserScrolled",
			onAlertDialog: "showAlertDialog",
			onConfirmDialog: "showConfirmDialog",
			onPromptDialog: "showPromptDialog",
			onSSLConfirmDialog: "showSSLConfirmDialog",
			onUserPasswordDialog: "showUserPasswordDialog",
			onNewPage: "openNewCardWithIdentifier",
			onPrint: "doPrint",
			onEditorFocusChanged: "editorFocusChanged",
			minFontSize: 2,
		},
		{kind: "FindBar", showing: false, onFind: "find", onGoToPrevious: "goToPrevious", onGoToNext: "goToNext"},
		{name: "context", kind: "BrowserContextMenu", onItemClick: "contextItemClick"},
		{name: "dialog", kind: "VerticalAcceptCancelPopup", cancelCaption: "", components: [
			{name: "dialogTitle", className: "enyo-dialog-prompt-title"},
			{name: "dialogMessage", className: "browser-dialog-body enyo-text-body "}
		]},
		{name: "alertDialog", kind: "AcceptCancelPopup", cancelCaption: "", onResponse: "sendDialogResponse", components: [
			{name: "alertMessage", className: "browser-dialog-body enyo-text-body "}
		]},
		{name: "confirmDialog", kind: "VerticalAcceptCancelPopup", onResponse: "sendDialogResponse", components: [
			{name: "confirmMessage", className: "browser-dialog-body enyo-text-body "}
		]},
		{name: "promptDialog", kind: "AcceptCancelPopup", cancelCaption: "", onResponse: "promptResponse", onClose: "closePrompt", components: [
			{name: "promptMessage", className: "browser-dialog-body enyo-text-body "},
			{name: "promptInput", kind: "Input", spellcheck: false, autocorrect: false, autoCapitalize: "lowercase"}
		]},
		{name: "shareLinkDialog", kind: "ShareLinkDialog"},
		{name: "loginDialog", kind: "AcceptCancelPopup", onResponse: "loginResponse", onClose: "closeLogin", components: [
			{name: "loginMessage", className: "browser-dialog-body enyo-text-body "},
			{name: "userInput", kind: "Input", spellcheck: false, autocorrect: false, autoCapitalize: "lowercase", hint: $L("Username...")},
			{name: "passwordInput", kind: "PasswordInput", hint: $L("Password...")}
		]},
		{name: "sslDialog", kind: "Popup", onClose: "sslConfirmResponse", components: [
			{name: "sslConfirmMessage", className: "browser-dialog-body enyo-text-body "},
			{kind: enyo.HFlexBox, components: [
				{kind: "Button", name: "viewCertButton", flex: 1, caption: $L("View Certificate"), className: "enyo-button-dark", onclick: "viewSSLCertificate"},
				{kind: "Button", flex: 1, caption: $L("Trust Always"), response: "1", className: "enyo-button-dark", onclick: "closeSSLConfirmBox"},
				{kind: "Button", flex: 1, caption: $L("Trust Once"), response: "2", className: "enyo-button-dark", onclick: "closeSSLConfirmBox"},
				{kind: "Button", flex: 1, caption: $L("Don't Trust"), response: "0", className: "enyo-button-dark", onclick: "closeSSLConfirmBox"}
			]}
		]},
        {name: "sslCertDialog", kind: "CertificateDialog", onCertLoad: "enableViewSSLCertificate", onClose: "closeSSLCertificate"},
		// Per-site saved logins + autofill. One-shot fill on first login-field focus; a picker only when
		// the host has more than one saved login. (The old bottom-right toasters were replaced.)
		{name: "loginsService", kind: "DbService", dbKind: "org.webosports.logins:1", reCallWatches: true},
		{name: "loginPicker", kind: "LoginPicker", onPick: "loginPicked"},
		{name: "saveLoginDialog", kind: "VerticalAcceptCancelPopup", acceptCaption: $L("Save"), onResponse: "saveLoginResponse", components: [
			{name: "saveLoginMessage", className: "browser-dialog-body enyo-text-body "}
		]},
		// Web-content text selection (legacy-style): press a word -> engine selects it and reports the
		// start/end rects on the "selectionBounds" channel; we pin the two drag markers (arrows) at the
		// selection ends and a Copy popover above it. Copy ferries the selection back via copiedText ->
		// clipboard. Markers are position:fixed (reported coords are window/pageX,Y space).
		{name: "selStart", kind: "Image", src: "images/webkit/topmarker.png", showing: false,
			style: "position:fixed; z-index:1000; width:18px; height:15px;"},
		{name: "selEnd", kind: "Image", src: "images/webkit/bottommarker.png", showing: false,
			style: "position:fixed; z-index:1000; width:18px; height:15px;"},
		{name: "selPopover", className: "atlas-select-popover", showing: false,
			style: "position:fixed; z-index:1001;", content: $L("Copy"), onclick: "copySelectionClick"}
    ],
		loginsKind: "org.webosports.logins:1",
        changedUrl: false,
	    isQuickRedirect: false,
	WebKitErrors: {
		ERR_SYS_FILE_DOESNT_EXIST: 14,
		ERR_WK_FLOADER_CANCELLED: 1000,
		ERR_WK_NOINTERNET:1005,
		ERR_CURL_FAILURE: 2000,
		ERR_CURL_COULDNT_RESOLVE_HOST: 2006,
		ERR_CURL_SSL_CACERT: 2060
	},
	create: function() {
		this.inherited(arguments);
		this.$.context.setView(this.$.view);
		this.urlChanged();
		this.searchPreferencesChanged();
		this.defaultSearchChanged();
		if (window.PalmSystem) {
			this.$.view.setIdentifier(enyo.windowParams.webviewId);
		}
	},
	resize: function() {
		this.$.actionbar.resize();
		this.$.view.resize();
	},
	showingChanged: function() {
		this.inherited(arguments);
		if (!this.showing) {
			this.$.actionbar.forceBlur();
		}
	},
	//* @public
	printFrame: function(inJobID, inPrintParams) {
		this.viewCall("printFrame", ["", inJobID, inPrintParams.width, inPrintParams.height, inPrintParams.pixelUnits, false, inPrintParams.renderInReverseOrder]);
	},
	showFind: function() {
		//this.$.findBar.show();
		this.findStr = null;
 		this.$.findDialog.show();
	},
	//* @protected
	find: function(inSender, inString) {
		this.log(inString);
	//this.$.view.callBrowserAdapter("findInPage", [inString]);
	if (this.findStr != inString) {
			/* Reset */
			this.$.view.findInPage("");
			this.findStr = inString;
		}
		this.$.view.findInPage(this.findStr);
	},
	goToPrevious: function() {
		this.$.view.findInPage(this.findStr, false);
	},
	goToNext: function() {
		this.$.view.findInPage(this.findStr, true);
	},
	setEnableJavascript: function(inEnable) {
		this.viewCall("setEnableJavascript", [inEnable]);
	},
	setBlockPopups: function(inBlock) {
		this.viewCall("setBlockPopups", [inBlock]);
	},
	setAcceptCookies: function(inAccept) {
		this.viewCall("setAcceptCookies", [inAccept]);
	},
	clearHistory: function() {
		this.viewCall("clearHistory");
	},
	clearCookies: function() {
		new PalmServiceBridge().call('palm://com.palm.browserServer/clearCookies', '{}');
	},
	clearCache: function() {
		new PalmServiceBridge().call('palm://com.palm.browserServer/clearCache', '{}');
	},
	isLoading: function() {
		return this.$.actionbar.getProgress() != 0;
	},
	viewCall: function(inMethod, inArgs) {
		if (window.PalmSystem) {
			var v = this.$.view;
			if (v[inMethod]) {
				v[inMethod].apply(v, inArgs);
			} else {
				v.callBrowserAdapter(inMethod, inArgs);
			}
		}
	},
		setHistoryUrl: function() {
		var newUrl = this.$.actionbar.getHistoryUrl();
		this.url = newUrl;
		this.urlChanged();
 	},
	urlChanged: function() {
		this.log(this.url);
		this.$.view.setUrl(this.url);
		this.$.actionbar.setLoading(true);
		this.$.actionbar.setUrl(this.url);
	},
	searchPreferencesChanged: function() {
		this.$.actionbar.setSearchPreferences(this.searchPreferences);
	},
	defaultSearchChanged: function() {
		this.$.actionbar.setDefaultSearch(this.defaultSearch);
	},
	pageTitleChanged: function(inSender, inTitle, inUrl, inBack, inForward) {
		this.log(inUrl, inTitle, inBack, inForward);
		this.url = inUrl;
		this.title = inTitle || $L("Untitled");
		if (!this.$.dialog.isOpen) {
			this.$.actionbar.setUrl(this.url);
			this.$.actionbar.setTitle(this.title);
		}
		if (inTitle) { this.$.actionbar.updateCurrentTitle(inUrl, inTitle); }   // patch the history entry once the real title parses (fixes "Untitled"/mismatch)
		this.changedUrl = true;
		this.checkHostLogins(inUrl);
		this.doPageTitleChanged(this.title, this.url);
	},
	//* @protected
	// Derive a bare, lowercased host from a URL (used to key saved logins).
	hostFromUrl: function(inUrl) {
		var m = (inUrl || "").match(/^[a-z]+:\/\/([^\/:?#]+)/i);
		return m ? m[1].toLowerCase() : "";
	},
	// Autofill: when the page host changes, look up any saved logins for that host.
	checkHostLogins: function(inUrl) {
		var host = this.hostFromUrl(inUrl);
		this._loginFilled = false;   // allow one autofill per page load
		if (!host) {
			this._loginHost = null;
			this.hostLogins = [];
			return;
		}
		if (host === this._loginHost) {
			return; // already resolved logins for this host
		}
		this._loginHost = host;
		this.$.loginsService.call({query: {where: [{prop: "host", op: "=", val: host}]}},
			{method: "find", onSuccess: "gotHostLogins", onFailure: "loginsDbFailure"});
	},
	gotHostLogins: function(inSender, inResponse) {
		// Just remember them; don't fill until a login field is focused (form is reliably present then).
		this.hostLogins = (inResponse && inResponse.results) || [];
	},
	// Engine editor-focus signal (WebView.onEditorFocusChanged -> BrowserAdapter "editorFocused"): a field
	// gained focus. Autofill ONCE per page: single login -> fill both fields in one shot; multiple -> picker.
	editorFocusChanged: function(inSender, inFocused, inFieldType, inFieldActions) {
		if (!inFocused || this._loginFilled) { return; }
		if (!this.hostLogins || !this.hostLogins.length) { return; }
		this._loginFilled = true;
		if (this.hostLogins.length === 1) {
			this.fillLogin(this.hostLogins[0]);
		} else {
			this.$.loginPicker.setLogins(this.hostLogins);
			this.$.loginPicker.openAtCenter();
		}
	},
	// User picked a login from the multi-login picker.
	loginPicked: function(inSender, inLogin) {
		this.fillLogin(inLogin);
	},
	// One-shot fill: hand the engine "\x02user\x02pass" via the existing insertStringAtCursor command; the
	// engine fills BOTH the username + password fields in a single JS pass (no per-field tapping).
	fillLogin: function(inLogin) {
		if (!inLogin) { return; }
		this.$.view.insertStringAtCursor("\x02" + (inLogin.username || "") + "\x02" + (inLogin.password || ""));
	},
	loginsDbFailure: function(inSender, inResponse) {
		enyo.log("[Atlas] logins db error: " + (inResponse && (inResponse.errorText || inResponse.errorCode)));
		// A read failure shouldn't swallow the offer: if we were mid save-offer, still prompt the user.
		if (this.pendingSaveLogin) {
			var p = this.pendingSaveLogin, who = p.username || p.host;
			var msg = enyo.macroize($L("Save the password for {$user} on {$host}?"), {user: who, host: p.host});
			this.$.saveLoginDialog.validateComponents();
			this.$.saveLoginMessage.setContent(msg);
			this.showPopup(this.$.saveLoginDialog);
			enyo.log("[Atlas] loginsDbFailure: showed save-login popup anyway");
		}
	},
	gotHistoryState: function(inBack, inForward) {
		this.canGoBack = inBack;
		this.$.actionbar.setCanGoBack(inBack);
		this.$.actionbar.setCanGoForward(inForward);
	},
	goClick: function(inSender, inUrl) {
		// atlas:home / atlas:start -> jump back to the bookmark start-page view (handled by BrowserApp)
		var u = (inUrl || "").replace(/^\s+|\s+$/g, "").toLowerCase().replace(/\/+$/, "");
		if (u === "atlas:home" || u === "atlas://home" || u === "atlas:start" || u === "atlas://start") {
			this.doGoHome();
			return;
		}
		this.setUrl(inUrl);
	},
	browserTap: function(inSender, inPosition, inEvent, inTapInfo) {
		// a tap on the page dismisses an active text selection (markers + popover)
		if (this._selBounds) {
			this.viewCall("clearSelection", []);
			this.hideSelectionUI();
		}
	},
	// The markers/popover are position:fixed on screen, so once the page scrolls they'd go stale ->
	// auto-hide + clear the selection when a real scroll happens (a new long-press re-selects).
	browserScrolled: function(inSender, inX, inY) {
		this._lastScrollY = inY;
		if (this._selBounds && Math.abs(inY - (this._selBaseScrollY || 0)) > 6) {
			this.viewCall("clearSelection", []);
			this.hideSelectionUI();
		}
	},
	// Show/hide the address-bar Google Translate icon based on the "Offer to translate pages" preference.
	offerTranslateChanged: function() {
		if (this.$.actionbar) { this.$.actionbar.setShowTranslate(this.offerTranslate); }
	},
	// Address-bar translate icon tapped -> ask the app to open the current page via Google Translate.
	actionbarTranslate: function() {
		this.doTranslatePage(this.url || (this.$.view.getUrl ? this.$.view.getUrl() : ""));
	},
	showPopup: function(inPopup) {
		var w = enyo.fetchControlSize(this).w;
		inPopup.applyStyle("max-width", w - 100);
		inPopup.openPopup();
	},
	showAlertDialog: function(inSender, inMsg) {
		this.$.alertDialog.validateComponents();
		this.$.alertMessage.setContent(inMsg);
		this.showPopup(this.$.alertDialog);
	},
	showConfirmDialog: function(inSender, inMsg) {
		this.$.confirmDialog.validateComponents();
		this.$.confirmMessage.setContent(inMsg);
		this.showPopup(this.$.confirmDialog);
	},
	showPromptDialog: function(inSender, inMsg, inDefaultValue) {
		this.$.promptDialog.validateComponents();
		this.$.promptMessage.setContent(inMsg);
		this.$.promptInput.setValue("");
		this.$.promptInput.setHint(inDefaultValue);
		this.showPopup(this.$.promptDialog);
	},
    showShareLinkDialog: function(inUrl, inTitle) {
        this.$.shareLinkDialog.init(inUrl, inTitle);
        this.showPopup(this.$.shareLinkDialog);
    },
	promptResponse: function(inAccept) {
		this.sendDialogResponse(this, inAccept, this.$.promptInput.getValue() || this.$.promptInput.getHint());
	},
	closePrompt: function() {
		this.$.promptInput.forceBlur();
	},
	showSSLConfirmDialog: function(inSender, inHost, inErrorCode, inCertFile) {
		this.$.sslDialog.validateComponents();
		this.$.viewCertButton.setDisabled(true);
		this.$.sslCertDialog.setCertFile(inCertFile);
		var msg;
		if (inErrorCode == 0) {
			msg = $L("The security certificate #{websiteName} sent is expired. Connecting to this site might put your confidential information at risk.");
		} else if (inErrorCode >= 2 && inErrorCode < 5) {
			msg = $L("The website #{websiteName} didn't send a security certificate to identify itself. Connecting to this site might put your confidential information at risk.");
		} else if (inErrorCode >= 5 && inErrorCode < 10) {
			msg = $L("The security certificate #{websiteName} sent could not be read completely. Connecting to this site might put your confidential information at risk.");
		} else if (inErrorCode >= 10 && inErrorCode < 18) {
			msg = $L("The security certificate #{websiteName} sent has some invalid information. Connecting to this site might put your confidential information at risk.");
		} else if (inErrorCode >= 18 && inErrorCode < 24) {
			msg = $L("The security certificate #{websiteName} sent has questionable signatures. Connecting to this site might put your confidential information at risk.");
		} else if (inErrorCode >= 24 && inErrorCode < 30) {
			msg = $L("The security certificate #{websiteName} sent is invalid. Connecting to this site might put your confidential information at risk.");
		} else if (inErrorCode == 30 || inErrorCode == 31 || inErrorCode == 50) {
			msg = $L("The security certificate #{websiteName} sent has inconsistent information in it. Connecting to this site might put your confidential information at risk.");
		}
		if (msg) {
			var m = msg.replace("#{websiteName}", inHost);
			this.$.sslConfirmMessage.setContent(m);
		}
		this.$.sslDialog.response = "0";
		this.$.sslDialog.openAtCenter();
	},
	closeSSLConfirmBox: function(inSender) {
		this.$.sslDialog.response = inSender.response;
		this.$.sslDialog.close();
	},
	sslConfirmResponse: function(inSender) {
		this.viewCall("sendDialogResponse", [inSender.response]);
	},
	enableViewSSLCertificate: function() {
		this.$.viewCertButton.setDisabled(false);
	},
	viewSSLCertificate: function(inSender) {
		this.$.sslCertDialog.validateComponents();
		this.$.sslCertDialog.openAtCenter();
	},
	closeSSLCertificate: function(inSender) {
		this.$.sslCertDialog.close();
	},
	showUserPasswordDialog: function(inSender, inMsg) {
		this.$.loginDialog.validateComponents();
		var msg = $L("The server {$serverName} requires a username and password");
		msg = enyo.macroize(msg, {serverName: inMsg});
		this.$.loginMessage.setContent(msg);
		this.showPopup(this.$.loginDialog);
	},
	loginResponse: function(inSender, inAccept) {
		var user = this.$.userInput.getValue();
		var pass = this.$.passwordInput.getValue();
		this.sendDialogResponse(this, inAccept, user, pass);
		// After a successful HTTP/proxy-auth login, offer to remember it for this host.
		if (inAccept && user && pass) {
			this.offerSaveLogin(user, pass);
		}
	},
	// Offer to save a submitted credential. Skips the prompt if the same host+username is
	// already stored so the user isn't nagged on every visit.
	// Engine-side hook: a web login form was submitted (host supplied by the engine).
	engineSaveLogin: function(inHost, inUser, inPass) {
		enyo.log("[Atlas] engineSaveLogin host=" + inHost + " user='" + inUser + "' hasPass=" + (inPass ? 1 : 0));
		if (!inPass) {
			return;
		}
		this.offerSaveLogin(inUser, inPass, inHost);
	},
	// Engine-side hook: web-content selection was copied -> place on the system clipboard.
	engineCopiedText: function(inText) {
		if (!inText) {
			return;
		}
		enyo.dom.setClipboard(inText);
		var params = enyo.json.stringify({dontLaunch: true});
		enyo.windows.addBannerMessage($L("Copied to clipboard"), params);
	},
	offerSaveLogin: function(inUser, inPass, inHost) {
		var url = this.url || "";
		var host = inHost || this.hostFromUrl(url);
		if (!host) {
			return;
		}
		this.pendingSaveLogin = {host: host, url: url, username: inUser, password: inPass, title: this.title || host};
		enyo.log("[Atlas] offerSaveLogin host=" + host + " user='" + inUser + "' -> find");
		this.$.loginsService.call({query: {where: [{prop: "host", op: "=", val: host}]}},
			{method: "find", onSuccess: "checkOfferSave", onFailure: "loginsDbFailure"});
	},
	checkOfferSave: function(inSender, inResponse) {
		var p = this.pendingSaveLogin;
		if (!p) {
			enyo.log("[Atlas] checkOfferSave: no pendingSaveLogin");
			return;
		}
		var results = (inResponse && inResponse.results) || [];
		enyo.log("[Atlas] checkOfferSave host=" + p.host + " user='" + p.username + "' existing=" + results.length);
		// Skip the prompt only if the SAME non-empty username+password is already stored (don't nag).
		// An empty username never counts as a match; a changed password should re-prompt.
		for (var i = 0; i < results.length; i++) {
			if (p.username && results[i].username === p.username && results[i].password === p.password) {
				enyo.log("[Atlas] checkOfferSave: already stored, skipping prompt");
				this.pendingSaveLogin = null; // already saved for this host+username
				return;
			}
		}
		var who = p.username || p.host;
		var msg = enyo.macroize($L("Save the password for {$user} on {$host}?"), {user: who, host: p.host});
		this.$.saveLoginDialog.validateComponents();
		this.$.saveLoginMessage.setContent(msg);
		this.showPopup(this.$.saveLoginDialog);
		enyo.log("[Atlas] checkOfferSave: showed save-login popup");
	},
	saveLoginResponse: function(inSender, inAccept) {
		var p = this.pendingSaveLogin;
		this.pendingSaveLogin = null;
		if (inAccept && p) {
			p._kind = this.loginsKind;
			p.date = (new Date()).getTime();
			this.$.loginsService.call({objects: [p]}, {method: "put", onSuccess: "savedLogin", onFailure: "loginsDbFailure"});
		}
	},
	savedLogin: function() {
		// Force the next host check to re-query so the new login shows up for autofill.
		this._loginHost = null;
		var params = enyo.json.stringify({dontLaunch: true});
		enyo.windows.addBannerMessage($L("Password saved"), params);
	},
	sendDialogResponse: function(inSender, inAccepted) {
		this.log(inAccepted);
		if (inAccepted) {
			this.viewCall("acceptDialog", [].slice.call(arguments, 2));
		} else {
			this.viewCall("cancelDialog");
		}
	},
	closeLogin: function() {
		this.$.userInput.forceBlur();
		this.$.passwordInput.forceBlur();
	},
	openContextMenu: function(inSender, inEvent, inTapInfo) {
		// inTapInfo is the engine hit-test at the long-press point
		// (isLink/linkUrl, isImage/imageUrl, editable). If the engine hit-test
		// isn't wired yet it may be null/isNull; fall back to page-level actions.
		var info = inTapInfo || {};
		// A long-press inside an editable field belongs to the engine's own
		// selection/paste handling, so don't hijack it with our menu.
		if (info.editable) {
			return;
		}
		// Plain text (no link/image): select the word directly — legacy-style, no "Select Text" menu step.
		if (!info.isLink && !info.isImage) {
			this._selAnchor = {left: inEvent.pageX, top: inEvent.pageY};
			this.viewCall("enableSelectionMode", [inEvent.pageX, inEvent.pageY]);
			return true;
		}
		this.$.context.openAtTap(inEvent, info);
		return true;
	},
	contextItemClick: function(inSender, inValue, inTapInfo, inPosition) {
		if (this[inValue]) {
			this[inValue](inTapInfo, inPosition);
		}
	},
	// --- web-content text selection (legacy-style markers + Copy popover) ---
	selectTextClick: function(inTapInfo, inPosition) {
		if (!inPosition) {
			return;
		}
		// engine selects the word at the point, paints the native highlight, and reports the selection
		// rects back on "selectionBounds" (-> engineSelectionBounds) which pins the markers + popover.
		this.viewCall("enableSelectionMode", [inPosition.left, inPosition.top]);
	},
	// Engine-side hook: selection changed -> {sx,sy,sh,ex,ey,len} in window/pageX,Y coords. Pin the two
	// drag markers at the ends and the Copy popover above the start.
	engineSelectionBounds: function(inData) {
		var b;
		try { b = enyo.json.parse(inData); } catch (e) { return; }
		if (!b || !b.len) { this.hideSelectionUI(); return; }
		this._selBounds = b;
		this._selBaseScrollY = this._lastScrollY || 0;   // scroll pos at selection time (auto-hide on scroll)
		// The reported coords are true window/screen coords, but enyo Panes carry a -webkit-transform
		// which makes position:fixed relative to the pane, not the viewport -> markers land off. Move the
		// overlay nodes to document.body (no transformed ancestor) so fixed positioning is real-screen.
		this._reparentSelectionUI();
		// The engine reports coords relative to the web CONTENT (0 = top of the page area). The markers
		// are position:fixed on document.body (real screen), so add the WebView's live screen offset
		// (top ~= address-bar height, left ~= 0) to land on the actual text.
		var vr = this.$.view.hasNode() ? this.$.view.node.getBoundingClientRect() : {top: 0, left: 0};
		var ox = Math.round(vr.left), oy = Math.round(vr.top);
		// top marker (18x15): its bottom points at the selection start
		this.$.selStart.applyStyle("left", (b.sx - 9 + ox) + "px");
		this.$.selStart.applyStyle("top", (b.sy - 15 + oy) + "px");
		this.$.selStart.setShowing(true);
		// bottom marker: its top points at the selection end
		this.$.selEnd.applyStyle("left", (b.ex - 9 + ox) + "px");
		this.$.selEnd.applyStyle("top", (b.ey + oy) + "px");
		this.$.selEnd.setShowing(true);
		// Copy bubble centered above the selection (clamp on-screen). Single-line selection uses the
		// midpoint of start/end; multi-line falls back to above the start.
		var midX = (b.ey - b.sy < b.sh + 4) ? Math.round((b.sx + b.ex) / 2) : b.sx;
		// sit the bubble above the selection AND above the top marker (which occupies sy-15..sy) so they
		// don't overlap; its tail then points down toward the marker/selection.
		this.$.selPopover.applyStyle("left", Math.max(4, midX - 40 + ox) + "px");
		this.$.selPopover.applyStyle("top", Math.max(4, b.sy - 60 + oy) + "px");
		this.$.selPopover.setShowing(true);
	},
	_reparentSelectionUI: function() {
		if (this._selReparented) { return; }
		var ctrls = [this.$.selStart, this.$.selEnd, this.$.selPopover];
		for (var i = 0; i < ctrls.length; i++) {
			var n = ctrls[i] && ctrls[i].hasNode();
			if (n && n.parentNode !== document.body) { document.body.appendChild(n); }
		}
		this._selReparented = true;
	},
	hideSelectionUI: function() {
		this._selBounds = null;
		if (this.$.selStart) { this.$.selStart.setShowing(false); }
		if (this.$.selEnd) { this.$.selEnd.setShowing(false); }
		if (this.$.selPopover) { this.$.selPopover.setShowing(false); }
	},
	copySelectionClick: function() {
		// engine runs Copy + ferries the selection text back via copiedText -> engineCopiedText (clipboard).
		this.viewCall("copy", []);
		this.hideSelectionUI();
		this.viewCall("clearSelection", []);
		return true;
	},
	selectAllSelectionClick: function() {
		this.viewCall("selectAll", []);
		return true;
	},
	doneSelectionClick: function() {
		this.viewCall("clearSelection", []);
		this.viewCall("disableSelectionMode", []);
		this.hideSelectionUI();
		return true;
	},
	// --- web-content drag ---
	startDragModeClick: function(inTapInfo, inPosition) {
		// Arm drag mode: the next touch-and-drag drives the in-page element (slider/canvas/DnD) instead
		// of scrolling; the adapter auto-clears it on release. Hint the user since it's a one-shot mode.
		this.viewCall("setDragMode", [true]);
		var params = enyo.json.stringify({dontLaunch: true});
		enyo.windows.addBannerMessage($L("Drag mode: touch and drag the item"), params);
	},
	newCardClick: function(inTapInfo) {
		window.atlasOpenCard({url: inTapInfo.linkUrl});
	},
	openNewCard: function() {
		window.atlasOpenCard({});
	},
	// --- page-level context menu actions (long-press on plain page/text, or when
	// the engine hit-test is unavailable). These operate on the current page. ---
	pageNewCardClick: function() {
		this.openNewCard();
	},
	pageCopyLinkClick: function() {
		if (!this.url) {
			return;
		}
		enyo.dom.setClipboard(this.url);
		var params = enyo.json.stringify({dontLaunch:true});
		enyo.windows.addBannerMessage($L("Link Copied to clipboard"), params);
	},
	pageShareClick: function() {
		this.shareLink(this.url, this.title || this.url);
	},
	pageReaderClick: function() {
		this.doReaderLink(this.url, this.title || this.url);
	},
	openNewCardWithIdentifier: function(inSender, inIdentifier) {
		window.atlasOpenCard({webviewId: inIdentifier});
	},
	copyLinkClick: function(inTapInfo) {
		enyo.dom.setClipboard(inTapInfo.linkUrl);
		var params = enyo.json.stringify({dontLaunch:true});
		enyo.windows.addBannerMessage($L("Link Copied to clipboard"), params);
	},
    //handler for the context menu shareLinkClick in BrowserContextMenu.js.
    //TODO: refactor these for a clearer abstraction. So you don't have to hunt
    //to see where it is being called.
	shareLinkClick: function(inTapInfo) {
		this.shareLink(inTapInfo.linkUrl, inTapInfo.linkText || inTapInfo.linkUrl);
	},
	shareLink: function(inUrl, inTitle) {
        this.showShareLinkDialog(inUrl, inTitle);
	},
    downloadlinkClick: function(inTapInfo) {
        this.doDownloadLink(inTapInfo.linkUrl);
    },
	readerLinkClick: function(inTapInfo) {
		this.doReaderLink(inTapInfo.linkUrl, inTapInfo.linkText || inTapInfo.linkUrl);
	},
	copyToPhotosClick: function(inTapInfo, inPosition) {
		this.viewCall("saveImageAtPoint", [inPosition.left, inPosition.top, "/media/internal",
			enyo.hitch(this, "finishCopyToPhotos", inTapInfo)]);
	},
	shareImageClick: function(inTapInfo, inPosition) {
		this.viewCall("saveImageAtPoint", [inPosition.left, inPosition.top, "/tmp",
			enyo.hitch(this, "finishShareImage", inTapInfo)]);
	},
	setWallpaperClick: function(inTapInfo, inPosition) {
		this.viewCall("saveImageAtPoint", [inPosition.left, inPosition.top, "/media/internal",
			enyo.hitch(this, "finishSetWallpaper", inTapInfo)]);
	},
	copyImageUrlClick: function(inTapInfo) {
		if (!inTapInfo || !inTapInfo.imageUrl) {
			return;
		}
		enyo.dom.setClipboard(inTapInfo.imageUrl);
		var params = enyo.json.stringify({dontLaunch:true});
		enyo.windows.addBannerMessage($L("Image URL Copied to clipboard"), params);
	},
	openDialog: function(inTitle, inMessage) {
		this.$.dialog.validateComponents();
		this.$.dialogTitle.setContent(inTitle);
		this.$.dialogMessage.setContent(inMessage);
		this.$.dialog.openPopup();
	},
	finishCopyToPhotos: function(inTapInfo, inSuccess, inPath) {
		var params = enyo.json.stringify({dontLaunch:true});
		if (inSuccess) {
			enyo.windows.addBannerMessage($L("Image Saved to Photos"),params);
		} else {
			enyo.windows.addBannerMessage($L("Error Saving Image"),params);
		}
	},
	finishShareImage: function(inTapInfo, inSuccess, inPath) {
		if (inSuccess) {
			var url = inTapInfo.imageUrl;
			var defaultTitle = url.indexOf("data:") >= 0 ? $L("Picture Link") : $L("Picture at ") + url;
			var title = inTapInfo.title || inTapInfo.altText || defaultTitle;
			var msg = $L("Here's a picture I think you'll like: <a href='{$src}'>{$title}</a>");
			msg = enyo.macroize(msg, {src: url, title: title});
			var s = url.lastIndexOf("/") + 1;
			var params = {
				summary: $L("Check out this picture..."),
				text: msg,
				attachments: [{name: url.substring(s), path: inPath}]
			};
			this.$.launchApplicationService.call({id: "com.palm.app.email", params: params});
		} else {
			var p = enyo.json.stringify({dontLaunch:true});
			enyo.windows.addBannerMessage($L("Error Sharing Image"),p);
		}
	},
	finishSetWallpaper: function(inTapInfo, inSuccess, inPath) {
		if (inSuccess) {
			this.$.importWallpaperService.call({target: inPath, scale: 1.0});
		} else {
			var p = enyo.json.stringify({dontLaunch:true});
			enyo.windows.addBannerMessage($L("Error Setting Wallpaper"),p);
		}
	},
	importedWallpaper: function(inSender, inResponse) {
		this.$.setWallpaperService.call({wallpaper: inResponse.wallpaper});
	},
	wallpaperError: function(inSender, inResponse) {
		this.openDialog($L("Error"), $L("Failed to set wallpaper"));
	},
	goBack: function() {
		if (this.canGoBack) {
			this.$.actionbar.goBack(0);
		} else {
			this.doClose();
		}
	},
	goForward: function() {
		this.$.actionbar.goForward(0);
	},
	reloadClick: function() {
	if(this.isErrorLoadFailed === true) {
		this.isErrorLoadFailed = false;
		this.setUrl(this.failedLoadUrl);
	}
	else
		this.$.view.callBrowserAdapter("reloadPage");
		//this.$.view.setZoom(this.$.view.getZoom() + 0.1);
	},
	stopClick: function() {
		this.log();
		this.$.view.callBrowserAdapter("stopLoad");
		this.$.actionbar.setProgress(0);
	},
	loadStarted: function() {
	   this.hideSelectionUI();
	   this._lastProgress = 0;
	   if (this._timeoutHandle != null) {
		   clearTimeout(this._timeoutHandle);
		   this._timeoutHandle = null;
	   }
	   this.isErrorLoadFailed = false;
	   this.$.actionbar.setLoading(true);
	},
	loadProgress: function(inSender, inProgress) {
		if (this._lastProgress < inProgress) {
			this.$.actionbar.setProgress(inProgress);
			this._lastProgress = inProgress;

			if (inProgress === 100) {
				this._timeoutHandle = setTimeout(enyo.hitch(this, "clearProgress"), 1000);
			}
			if (this.changedUrl && inProgress > 10) {
				if (!this.isQuickRedirect && this.url !== this.$.actionbar.getCurrentPage().url) {
					this.$.actionbar.setCurrentPage({title: this.title, url: this.url});
				}
				if (this.isQuickRedirect) this.isQuickRedirect = false;
				this.changedUrl = false;
				this.gotHistoryState(this.$.actionbar.getCanGoBack(), this.$.actionbar.getCanGoForward());
			}
		}
	},
	loadStopped: function() {
		this.doPageLoadStopped(this.url);
	},
	loadCompleted: function() {
		// empty
		if (this._lastProgress <= 50) this.isQuickRedirect = true;
	},
	clearProgress: function() {
		this.$.actionbar.setProgress(0);
		this.$.actionbar.setLoading(false);
		this._timeoutHandle = null;
	},
	browserError: function(inSender, inErrorCode, inMsg) {
		
		switch(inErrorCode){
			case this.WebKitErrors.ERR_SYS_FILE_DOESNT_EXIST:
				this.openDialog($L("Error"), $L('File does not exist.'));
				break;
			case this.WebKitErrors.ERR_CURL_COULDNT_RESOLVE_HOST:
				this.isErrorLoadFailed = true;
				this.failedLoadUrl = this.url;
				this.openDialog($L("Error"), $L('Unable to resolve host.'));
				break;
			case this.WebKitErrors.ERR_WK_NOINTERNET:
				this.isErrorLoadFailed = true;
				this.failedLoadUrl = this.url;
				this.openDialog($L("Error"), $L('No Internet Connection.'));
				break;
			case this.WebKitErrors.ERR_WK_FLOADER_CANCELLED:
				break;
			default:
				this.openDialog($L("Error"), $L("Unable to Load Page"));
				this.log("Unknown Handled Error: " + inMsg);
				break;
				
			}
		this.clearProgress();
	},
	createPageImages: function() {
		// The app chrome runs in LunaSysMgr's old WebKit (system OpenSSL 0.9.8) and CANNOT load remote https
		// favicons. So ask the WPE engine (modern TLS) to download the current site's favicon to a LOCAL file
		// via saveViewToFile -> BrowserPageWPE::renderToFile, and show that local path. The single-arg form
		// makes the adapter send renderToFile with the viewport rect (which the backend ignores — it fetches
		// the favicon, not a page snapshot). /var/... is the adapter's required safe dir.
		// The engine auto-downloads each site's favicon (PNG) into the app's OWN bundle at
		// faviconcache/fav_<host>.png — LunaSysMgr's file-access jailer blocks the app from reading
		// /var/luna/... but ALWAYS allows its own dir. We reference it by a RELATIVE path (resolves under the
		// app dir, same as the chrome images). Host sanitization must match the engine's atlas_favicon_dest_for.
		var m = (this.url || "").match(/^https?:\/\/([^\/]+)/i);
		var icon = m ? ("faviconcache/fav_" + m[1].replace(/[^A-Za-z0-9.\-]/g, "_") + ".png") : "";
		return {thumbnailFile: icon, iconFile32: icon, iconFile64: icon};
	},
	deleteImages: function(inImages) {
		for (var i=0, image; image=inImages[i]; i++) {
			this.log(image);
			this.viewCall("deleteImage", [image]);
		}
	}
})
