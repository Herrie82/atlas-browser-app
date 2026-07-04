//   Form Autofill manager: a searchable list of saved autofill values (org.webosports.autofill:1) with
//   swipe-to-delete, tap-to-edit and an Add button. Mirrors PasswordList; the edit dialog is a top-level
//   sibling (AutofillEditDialog) reached via the onEditAutofill/onAddAutofill events so its buttons don't
//   dismiss the toaster drawer. Opened from the app menu ("Autofill").

enyo.kind({
	name: "AutofillList",
	kind: enyo.VFlexBox,
	className: "basic-back",
	events: {
		onClose: "",
		onEditAutofill: "",
		onAddAutofill: ""
	},
	components: [
		{name: "autofillService", kind: "DbService", dbKind: "org.webosports.autofill:1", reCallWatches: true,
			method: "find", onSuccess: "gotData", subscribe: true, onWatch: "refreshList"},
		{className: "box-center atlas-pw-search", components: [
			{name: "searchField", kind: "RoundedSearchInput", hint: $L("Search"),
				autoCapitalize: "lowercase", autocorrect: false, spellcheck: false, autoWordComplete: false,
				onchange: "processOnSearch", onCancel: "processOnCancel", keypressInputDelay: 300}
		]},
		{className: "atlas-list-separator"},
		{name: "list", kind: "DbList", flex: 1, onQuery: "listQuery", onSetupRow: "listSetupRow", components: [
			{name: "item", kind: "SwipeableItem", className: "atlas-pw-row", layoutKind: "HFlexLayout", tapHighlight: true,
				onclick: "itemClick", onConfirm: "deleteItem", components: [
				{name: "icon", kind: "Image", src: "images/autofill-row-icon.png"},
				{flex: 1, components: [
					{name: "label", className: "url-item-title enyo-text-ellipsis"},
					{name: "value", className: "url-item-url enyo-item-ternary enyo-text-ellipsis"}
				]}
			]}
		]},
		{name: "empty", className: "url-item-url", style: "padding: 16px; text-align: center;",
			content: $L("No autofill entries yet — tap + to add one"), showing: false},
		{kind: "Toolbar", components: [
			{kind: "GrabButton", onclick: "doClose"},
			{flex: 1, kind: "Control"},
			{icon: "images/chrome/menu-icon-add.png", onclick: "addClick", style: "margin-right:10px; top:1px"}
		]}
	],
	create: function() {
		this.inherited(arguments);
		this.filterString = undefined;
	},
	//* Do NOT auto-focus the search on open (avoids popping the VKB, which eats half the screen).
	listQuery: function(inSender, inQuery) {
		return this.$.autofillService.call({query: {limit: 500}});
	},
	gotData: function(inSender, inResponse, inRequest) {
		// ignore merge/put/del acks (no results) so an edit-save doesn't blank the list
		if (!inResponse || !inResponse.results) { return; }
		var results = inResponse.results;
		if (this.filterString) {
			var f = this.filterString.toLowerCase();
			results = results.filter(function(r) {
				return ((r.label || "").toLowerCase().indexOf(f) >= 0) ||
					((r.value || "").toLowerCase().indexOf(f) >= 0) ||
					((r.fieldtype || "").toLowerCase().indexOf(f) >= 0);
			});
		}
		results.sort(function(a, b) { return (a.label || "").localeCompare(b.label || ""); });
		this.$.empty.setShowing(results.length === 0 && !this.filterString);
		inResponse.results = results;
		this.$.list.queryResponse(inResponse, inRequest);
	},
	listSetupRow: function(inSender, inItem, inIndex) {
		this.$.label.setContent(inItem.label || inItem.value || "");
		this.$.value.setContent(inItem.value || "");
	},
	deleteItem: function(inSender, inIndex) {
		var item = this.$.list.fetch(inIndex);
		if (item && item._id) {
			this.$.autofillService.call({ids: [item._id]}, {method: "del"});
		}
	},
	//* Tap a row -> edit; the Add button -> a blank new entry. Both handled by the top-level dialog.
	itemClick: function(inSender, inEvent, inIndex) {
		var now = (new Date()).getTime();
		if (this._lastTap && (now - this._lastTap) < 500) { return; }
		this._lastTap = now;
		var item = this.$.list.fetch(inIndex);
		if (!item) { return; }
		this.doEditAutofill(item);
	},
	addClick: function() {
		var now = (new Date()).getTime();
		if (this._lastAdd && (now - this._lastAdd) < 500) { return; }
		this._lastAdd = now;
		this.doAddAutofill();
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
