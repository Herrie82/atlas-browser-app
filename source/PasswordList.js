//   Password manager: a searchable list of saved web logins (org.webosports.logins:1) with
//   swipe-to-delete, mirroring HistoryList (SwipeableItem + DbList) and the system timezone
//   picker's RoundedSearchInput + client-side filter. Opened from the app menu ("Passwords").

enyo.kind({
	name: "PasswordList",
	kind: enyo.VFlexBox,
	className: "basic-back",
	events: {
		onClose: "",
		onEditPassword: ""
	},
	components: [
		{name: "loginsService", kind: "DbService", dbKind: "org.webosports.logins:1", reCallWatches: true,
			method: "find", onSuccess: "gotData", subscribe: true, onWatch: "refreshList"},
		{kind: "Header", className: "enyo-header-dark", layoutKind: "HFlexLayout", align: "center", components: [
			{kind: "Image", src: "images/chrome/secure-lock.png", style: "margin: 0 8px;"},
			{content: $L("Passwords"), className: "header-title"}
		]},
		{className: "box-center atlas-pw-search", components: [
			{name: "searchField", kind: "RoundedSearchInput", hint: $L("Search"),
				autoCapitalize: "lowercase", autocorrect: false, spellcheck: false, autoWordComplete: false,
				onchange: "processOnSearch", onCancel: "processOnCancel", keypressInputDelay: 300}
		]},
		{name: "list", kind: "DbList", flex: 1, onQuery: "listQuery", onSetupRow: "listSetupRow", components: [
			{name: "item", kind: "SwipeableItem", className: "atlas-pw-row", layoutKind: "HFlexLayout", tapHighlight: true,
				onclick: "itemClick", onConfirm: "deleteItem", components: [
				{name: "icon", kind: "Image", src: "images/chrome/secure-lock.png"},
				{flex: 1, components: [
					{name: "host", className: "url-item-title enyo-text-ellipsis"},
					{name: "username", className: "url-item-url enyo-item-ternary enyo-text-ellipsis"}
				]}
			]}
		]},
		// Tap a row -> ask the app to open the (top-level) edit dialog for this login. The dialog must live
		// OUTSIDE the Toaster, or its Save/Cancel clicks bubble through it and dismiss the drawer.
		{name: "empty", className: "url-item-url", style: "padding: 16px; text-align: center;",
			content: $L("No saved passwords"), showing: false},
		{kind: "Toolbar", components: [
			{kind: "GrabButton", onclick: "doClose"},
			{flex: 1, kind: "Control"}
		]}
	],
	create: function() {
		this.inherited(arguments);
		this.filterString = undefined;
	},
	//* When shown as a toaster drawer over the start page, the start page's address bar holds
	//* keyboard focus (StartPage.showingChanged forceFocus'es it), so tapping our search does
	//* nothing until a real page is loaded. Release that focus and grab it for our search field.
	showingChanged: function() {
		this.inherited(arguments);
		if (this.showing) {
			if (document.activeElement && document.activeElement.blur) {
				document.activeElement.blur();
			}
			enyo.asyncMethod(this, "focusSearch");
		}
	},
	focusSearch: function() {
		if (this.$.searchField && this.$.searchField.forceFocus) {
			this.$.searchField.forceFocus();
		}
	},
	//* DbList wants data: load all logins (usually few) and filter client-side in gotData.
	listQuery: function(inSender, inQuery) {
		return this.$.loginsService.call({query: {limit: 500}});
	},
	gotData: function(inSender, inResponse, inRequest) {
		// merge/del acks come back through this same service's onSuccess but carry no `results`;
		// ignore them so an edit-save doesn't transiently blank the list (the subscription re-fires
		// with the real data). Only genuine find responses have a results array.
		if (!inResponse || !inResponse.results) { return; }
		var results = (inResponse && inResponse.results) || [];
		if (this.filterString) {
			var f = this.filterString.toLowerCase();
			results = results.filter(function(r) {
				return ((r.host || "").toLowerCase().indexOf(f) >= 0) ||
					((r.username || "").toLowerCase().indexOf(f) >= 0) ||
					((r.title || "").toLowerCase().indexOf(f) >= 0) ||
					((r.url || "").toLowerCase().indexOf(f) >= 0);
			});
		}
		results.sort(function(a, b) { return (a.host || "").localeCompare(b.host || ""); });
		this.$.empty.setShowing(results.length === 0 && !this.filterString);
		inResponse.results = results;
		this.$.list.queryResponse(inResponse, inRequest);
	},
	listSetupRow: function(inSender, inItem, inIndex) {
		this.$.host.setContent(inItem.host || inItem.title || inItem.url || "");
		this.$.username.setContent(inItem.username || $L("(no username)"));
	},
	//* Swipe -> confirm -> delete this login from the store.
	deleteItem: function(inSender, inIndex) {
		var item = this.$.list.fetch(inIndex);
		if (item && item._id) {
			this.$.loginsService.call({ids: [item._id]}, {method: "del"});
		}
	},
	//* Tap a row -> ask the app to open the top-level edit dialog for that login. (The db write + list
	//* refresh happen in the dialog + this list's subscription; nothing to do here but hand off the item.)
	//* LunaCE fires onclick 2-4x per physical tap, which would open+reopen the dialog into a bad state;
	//* suppress repeats within 500ms so one tap = one open.
	itemClick: function(inSender, inEvent, inIndex) {
		var now = (new Date()).getTime();
		if (this._lastTap && (now - this._lastTap) < 500) { return; }
		this._lastTap = now;
		var item = this.$.list.fetch(inIndex);
		if (!item) { return; }
		this.doEditPassword(item);
	},
	processOnSearch: function(inSender, inEvent, inValue) {
		this.filterString = (inValue && inValue.length) ? inValue : undefined;
		this.$.list.punt();
	},
	processOnCancel: function() {
		this.filterString = undefined;
		this.$.list.punt();
	},
	refreshList: function() {
		this.$.list.refresh();
	}
});
