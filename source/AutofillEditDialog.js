//   Autofill entry edit dialog. Top-level ModalDialog sibling (like PasswordEditDialog / BookmarkDialog)
//   so its buttons don't dismiss the toaster. Self-contained: setItem(entry) populates it, and it writes
//   the change to org.webosports.autofill:1 itself (AutofillList's subscription then refreshes).
//   A blank item ({} with no _id) means "add a new entry".

enyo.kind({
	name: "AutofillEditDialog",
	kind: "ModalDialog",
	published: {
		item: null
	},
	components: [
		{name: "autofillService", kind: "DbService", dbKind: "org.webosports.autofill:1"},
		{name: "labelInput", kind: "Input", hint: $L("Label (e.g. Home email)"), insetClass: "enyo-flat-shadow",
			autoCapitalize: "words", autocorrect: false, spellcheck: false, selectAllOnFocus: true},
		{name: "typeSelector", kind: "ListSelector", label: $L("Type"), value: "email", onChange: "typeChanged", items: [
			{caption: $L("Full name"), value: "name"},
			{caption: $L("Email"), value: "email"},
			{caption: $L("Phone"), value: "phone"},
			{caption: $L("Address"), value: "address"},
			{caption: $L("City"), value: "city"},
			{caption: $L("Postal code"), value: "zip"},
			{caption: $L("Country"), value: "country"},
			{caption: $L("Organization"), value: "org"},
			{caption: $L("Other"), value: "other"}
		]},
		{name: "valueInput", kind: "Input", hint: $L("Value"), insetClass: "enyo-flat-shadow",
			autoCapitalize: "none", autocorrect: false, spellcheck: false, selectAllOnFocus: true},
		{kind: enyo.VFlexBox, style: "margin-top: 8px;", components: [
			{name: "saveButton", flex: 1, kind: "NoFocusButton", className: "enyo-button-dark", caption: $L("Save"), onclick: "saveClick"},
			{name: "deleteButton", flex: 1, kind: "NoFocusButton", caption: $L("Delete"), className: "enyo-button-negative", onclick: "deleteClick"},
			{kind: "NoFocusButton", flex: 1, caption: $L("Cancel"), onclick: "cancelClick"}
		]}
	],
	componentsReady: function() {
		this.inherited(arguments);
		this.itemChanged();
	},
	itemChanged: function() {
		if (this.lazy || !this.$.labelInput) { return; }
		var it = this.item || {};
		this.$.labelInput.setValue(it.label || "");
		this.$.valueInput.setValue(it.value || "");
		this.$.typeSelector.setValue(it.fieldtype || "email");
		// hide Delete for a brand-new (unsaved) entry
		this.$.deleteButton.setShowing(!!it._id);
	},
	typeChanged: function() {},
	//* LunaCE double-fires taps; suppress repeats of the same action within 400ms.
	_debounced: function(key) {
		var now = (new Date()).getTime();
		if (this._clickTs && this._clickTs[key] && (now - this._clickTs[key]) < 400) { return true; }
		this._clickTs = this._clickTs || {};
		this._clickTs[key] = now;
		return false;
	},
	saveClick: function() {
		if (this._debounced("save")) { return; }
		var it = this.item || {};
		var label = this.$.labelInput.getValue();
		var value = this.$.valueInput.getValue();
		if (!value) { this.close(); return; }   // nothing to save
		it.label = label || value;
		it.value = value;
		it.fieldtype = this.$.typeSelector.getValue();
		it.searchText = (it.label || "") + " " + (it.value || "") + " " + (it.fieldtype || "");
		it.date = (new Date()).getTime();
		if (!it._kind) { it._kind = "org.webosports.autofill:1"; }
		this.$.autofillService.call({objects: [it]}, {method: it._id ? "merge" : "put"});
		this.close();
	},
	deleteClick: function() {
		if (this._debounced("del")) { return; }
		var it = this.item;
		this.close();
		if (it && it._id) {
			this.$.autofillService.call({ids: [it._id]}, {method: "del"});
		}
	},
	cancelClick: function() {
		if (this._debounced("cancel")) { return; }
		this.close();
	},
	close: function() {
		this.inherited(arguments);
		this.$.labelInput.forceBlur();
		this.$.valueInput.forceBlur();
	}
});
