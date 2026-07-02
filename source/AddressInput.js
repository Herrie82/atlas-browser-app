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
	name: "AddressInput",
	kind: enyo.HFlexBox,
	align: "center", 
	published: {
		url: "",
		loading: false
	},
	events: {
		onBlur: "",
		onInputChange: "",
		onAddressInputFocused: "",
		onAddressInputBlurred: "",
		onGo: "",
		onStop: "",
		onRefresh: "",
		onAddBookmark: "",
		onDeleteBookmark: ""
	},
	chrome: [
		
		{kind: "InputBox", layoutKind: "HFlexLayout", flex: 1, className: "enyo-tool-input", focusClassName: "enyo-tool-input-focus", spacingClassName: "enyo-tool-input-spacing", components: [
			{name: "secureLock", kind: enyo.CustomButton, showing: false, className: "secure-lock"},
			
			{name: "userinput", kind: "Input", flex: 1, styled: false, inputType: "url", width: "100%", spellcheck: false, autocorrect: false, autoCapitalize: "lowercase", autoWordComplete: false, hint: $L("Enter URL or search terms"), selectAllOnFocus: true,
				onfocus: "selectInput",
				onblur: "deselectInput",
				onkeydown: "inputKeydown",
				oninput: "inputChange",
			},
			{name: "refreshButton", kind: "CustomButton", showing: false, className: "addressbar-button refresh-button", onclick: "doRefresh"},
			{name: "clearButton", kind: "CustomButton", showing: true, className: "addressbar-button stop-button", onmousedown: "clearInput"},
			{name: "stopButton", kind: "CustomButton", showing: false, className: "addressbar-button stop-button", onclick: "doStop"},
			{name: "favButton", kind: "CustomButton", toggling: true, showing: true, className: "addressbar-button fav-button", onclick: "addDeleteBookmark"}
		]},
		{name: "bookmarksService", kind: "DbService", method: "find", dbKind: "com.palm.browserbookmarks:1", subscribe: true, onSuccess: "gotBookmarks", onWatch: "gotBookmarks", reCallWatches: true}
	],
	//* @protected
	_leftButton: "",
	_rightButton: "clearButton",
	bookmark: null,
	create: function() {
		this.inherited(arguments);
		this.checkBookmarks();
	},
	// Query the bookmarks DB for the current url; the subscription keeps the star live.
	checkBookmarks: function() {
		var u = this.url;
		if (!u) {
			return;
		}
		this.$.bookmarksService.call({query: {where: [{prop: "url", op: "=", val: u}]}});
	},
	gotBookmarks: function(inSender, inResponse) {
		if (inResponse && inResponse.results && inResponse.results.length) {
			this.$.favButton.setDepressed(true);
			this.bookmark = inResponse.results[0];
		} else {
			this.$.favButton.setDepressed(false);
			this.bookmark = null;
		}
	},
	addDeleteBookmark: function() {
		// On webOS a single tap can deliver BOTH a touch-click and a mouse-click, firing this twice and
		// adding two bookmarks. Debounce: ignore a second trigger within 700ms.
		var now = (new Date()).getTime();
		if (this._lastFavTap && (now - this._lastFavTap) < 700) { return; }
		this._lastFavTap = now;
		// The app owns the actual DB write; route up to BrowserApp.addBookmark/deleteBookmark.
		if (this.bookmark) {
			this.doDeleteBookmark(this.bookmark);
		} else {
			this.doAddBookmark();
		}
	},
	selectInput: function() {
		this.changeButtons();
		this.doAddressInputFocused();
	},
	deselectInput: function() {
		if (this.$.userinput.getValue() === "") {
			this.$.userinput.setValue(this.url);
		}
		this.changeButtons();
		this.doBlur();
		this.doAddressInputBlurred();
	},
	inputChange: function(inSender, inEvent, inValue) {
		this.changeButtons();
		this.doInputChange(inValue);
	},
	inputKeydown: function(inSender, inEvent) {
		if (inEvent.keyCode == 13) {
			this.go();
		}
	},
	urlChanged: function() {
		if (this.url) {
			if (!this.hasFocus()) {
				this.$.userinput.setValue(this.url);
			}
			this.changeButtons();
		}
		this.checkBookmarks();
	},
	loadingChanged: function() {
		this.changeButtons();
	},
	changeButtons: function() {
		this.showLeftButton("");
		if (this.hasFocus() && this.$.userinput.getValue().length >= 0) {
			this.showRightButton("clearButton");
		} else {
			if (this.url.toLowerCase().substring(0, 8) === "https://") {
				this.showLeftButton("secureLock");
			}
			if (this.loading) {
				this.showRightButton("stopButton");
			} else {
				this.showRightButton("refreshButton");
			}
		}
	},

	// need an IxD for secure lock icon (wireframe b5)
	showLeftButton: function(inButton) {
		this.showButton(inButton, this._leftButton);
		this._leftButton = inButton;
	},

	showRightButton: function(inButton) {
		this.showButton(inButton, this._rightButton);
		this._rightButton = inButton;
	},
	showButton: function(inButton, inOldButton) {
		if (inOldButton !== "") {
			this.$[inOldButton].hide();
		}
		if (inButton !== "") {
			this.$[inButton].show();
		}
	},
	go: function() {
		this.setLoading(true);
		var value = this.getUserInput(true);
		this.doGo(value);
		document.activeElement.blur();
		this.checkBookmarks();
	},
	getUserInput: function(inRaw) {
		var value = enyo.string.trim(this.$.userinput.getValue());
		if (!inRaw) {
			return enyo.string.escapeHtml(value);
		} else {
			return value;
		}
	},
	clearInput: function() {
		this.$.userinput.setValue("");
		// input is blurred here causing the keyboard to reappear
		this.$.userinput.forceFocus();
	},
	forceFocus: function() {
		this.$.userinput.forceFocus();
	},
	//* public
	hasFocus: function() {
		return document.activeElement.tagName == "INPUT";
	}
});