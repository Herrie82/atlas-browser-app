//   Password edit dialog. A top-level ModalDialog sibling (like BookmarkDialog) — NOT nested inside
//   PasswordList. Nesting it inside the list (inside the Toaster) made its Save/Cancel clicks bubble
//   through the Toaster (a dismiss-on-outside-click Popup), which closed the whole drawer after an edit.
//   It is self-contained: setItem(login) populates it, and it writes the change to the logins store
//   itself (PasswordList's subscription then refreshes the list).

enyo.kind({
	name: "PasswordEditDialog",
	kind: "ModalDialog",
	published: {
		item: null
	},
	components: [
		{name: "loginsService", kind: "DbService", dbKind: "org.webosports.logins:1"},
		{name: "hostLabel", className: "browser-dialog-body enyo-text-body", style: "margin-bottom: 8px;"},
		{name: "userInput", kind: "Input", hint: $L("Username"), insetClass: "enyo-flat-shadow",
			autoCapitalize: "lowercase", autocorrect: false, spellcheck: false, selectAllOnFocus: true},
		{name: "passInput", kind: "Input", hint: $L("Password"), insetClass: "enyo-flat-shadow", inputType: "password",
			autoCapitalize: "none", autocorrect: false, spellcheck: false, selectAllOnFocus: true},
		{name: "showPassButton", kind: "NoFocusButton", className: "enyo-button", caption: $L("Show password"),
			onclick: "toggleShowPass", style: "margin: 2px 0 6px 0;"},
		{kind: enyo.VFlexBox, style: "margin-top: 8px;", components: [
			{name: "saveButton", flex: 1, kind: "NoFocusButton", className: "enyo-button-dark", caption: $L("Save"), onclick: "saveClick"},
			{kind: "NoFocusButton", flex: 1, caption: $L("Delete password"), className: "enyo-button-negative", onclick: "deleteClick"},
			{kind: "NoFocusButton", flex: 1, caption: $L("Cancel"), onclick: "cancelClick"}
		]}
	],
	componentsReady: function() {
		this.inherited(arguments);
		this.itemChanged();
	},
	//* Populate from the login record and reset to masked. Called via setItem() before openAtCenter().
	itemChanged: function() {
		if (this.lazy || !this.$.hostLabel) { return; }
		var it = this.item || {};
		this.$.hostLabel.setContent(it.host || it.title || it.url || "");
		this.$.userInput.setValue(it.username || "");
		this._showing = false;
		this.$.showPassButton.setCaption($L("Show password"));
		this._applyMask("password");
		this.$.passInput.setValue(it.password || "");
	},
	//* Set the inner <input>'s type directly on the DOM node. NEVER use setInputType here: it calls
	//* Input.inputTypeChanged -> render() -> node.innerHTML on the <input> (a void element that can't
	//* take innerHTML) -> NO_MODIFICATION_ALLOWED_ERR on the 2nd open (once a node exists), which aborted
	//* itemChanged and left the dialog unopenable.
	_applyMask: function(t) {
		var inner = this.$.passInput.$.input;
		var n = inner && inner.hasNode();
		if (n) { n.type = t; }
		this.$.passInput.inputType = t;
	},
	//* Reveal/mask the password via a toggle button (buttons fire onclick reliably; the CheckBox did not).
	//* setInputType drives the inner <input>'s type (Input.inputTypeChanged re-renders it), value restored.
	//* LunaCE dispatches each tap as BOTH a touch and a mouse event, so button onclick fires 2-4x per
	//* physical tap. Suppress repeats of the same action within 400ms so a toggle nets one flip (not zero).
	_debounced: function(key) {
		var now = (new Date()).getTime();
		if (this._clickTs && this._clickTs[key] && (now - this._clickTs[key]) < 400) { return true; }
		this._clickTs = this._clickTs || {};
		this._clickTs[key] = now;
		return false;
	},
	toggleShowPass: function() {
		if (this._debounced("show")) { return; }
		this._showing = !this._showing;
		this._applyMask(this._showing ? "text" : "password");
		this.$.showPassButton.setCaption(this._showing ? $L("Hide password") : $L("Show password"));
	},
	saveClick: function() {
		if (this._debounced("save")) { return; }
		var it = this.item;
		if (it && it._id) {
			it.username = this.$.userInput.getValue();
			it.password = this.$.passInput.getValue();
			it.date = (new Date()).getTime();
			this.$.loginsService.call({objects: [it]}, {method: "merge"});
		}
		this.close();
	},
	deleteClick: function() {
		if (this._debounced("del")) { return; }
		var it = this.item;
		this.close();
		if (it && it._id) {
			this.$.loginsService.call({ids: [it._id]}, {method: "del"});
		}
	},
	cancelClick: function() {
		if (this._debounced("cancel")) { return; }
		this.close();
	},
	close: function() {
		this.inherited(arguments);
		this.$.userInput.forceBlur();
		this.$.passInput.forceBlur();
	}
});
