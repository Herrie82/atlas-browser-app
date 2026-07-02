//   Per-site saved logins: the "Logins available!" picker toaster.
//   Ported from com.maklesoft.browser/source/LoginSelect.js.
//
//   Shown when the current host has one or more saved logins. Tapping the toggle
//   reveals the list; selecting a login fires onLoginSelected with that record.

enyo.kind({
	name: "LoginSelect",
	kind: "Toaster",
	className: "login-select",
	lazy: false,
	dismissWithClick: false,
	published: {
		logins: []
	},
	events: {
		onLoginSelected: ""
	},
	create: function() {
		this.inherited(arguments);
		this.loginsChanged();
	},
	loginsChanged: function() {
		this.$.list.render();
	},
	listSetupRow: function(sender, index) {
		var login = this.logins[index];
		if (login) {
			this.$.item.setContent(login.title || login.text || login.username);
			if (index == 0) {
				this.$.item.addClass("enyo-first");
			} else {
				this.$.item.removeClass("enyo-first");
			}
			return true;
		}
	},
	toggleDrawer: function() {
		this.$.listDrawer.setOpen(!this.$.listDrawer.getOpen());
	},
	loginClick: function(sender, event) {
		this.doLoginSelected(this.logins[event.rowIndex]);
		this.$.toggleButton.setDepressed(false);
		this.$.listDrawer.setOpen(false);
	},
	close: function() {
		this.inherited(arguments);
		this.$.toggleButton.setDepressed(false);
		this.$.listDrawer.setOpen(false);
	},
	components: [
		{name: "listDrawer", kind: "BasicDrawer", open: false, style: "height: 100px", components: [
			{name: "list", kind: "VirtualRepeater", onSetupRow: "listSetupRow", components: [
				{name: "item", kind: "Item", className: "enyo-text-ellipsis", tapHighlight: true, onclick: "loginClick"}
			]}
		]},
		{kind: "HFlexBox", align: "center", components: [
			{name: "toggleButton", kind: "Button", flex: 1, className: "enyo-button-dark", caption: $L("Logins available!"), toggling: true, onclick: "toggleDrawer"},
			{kind: "CustomButton", className: "bookmark-grid-button stop-button", onclick: "close"}
		]}
	]
});
