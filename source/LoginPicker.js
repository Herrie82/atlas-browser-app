//   Modal picker shown only when a site has MORE THAN ONE saved login. Lists them
//   (username + host); tapping one fires onPick(login) and the Browser fills the form.

enyo.kind({
	name: "LoginPicker",
	kind: "Popup",
	modal: true,
	scrim: true,
	dismissWithClick: true,
	className: "login-picker enyo-bg-dark",
	published: {
		logins: []
	},
	events: {
		onPick: ""
	},
	components: [
		{className: "login-picker-title", content: $L("Choose a login")},
		{kind: "Scroller", className: "login-picker-scroller", components: [
			{name: "list", kind: "VirtualRepeater", onSetupRow: "setupRow", components: [
				{name: "item", kind: "Item", tapHighlight: true, className: "login-picker-item enyo-text-ellipsis", onclick: "itemClick"}
			]}
		]}
	],
	loginsChanged: function() {
		this.$.list.render();
	},
	open: function() {
		this.inherited(arguments);
		this.$.list.render();
	},
	setupRow: function(inSender, inIndex) {
		var l = this.logins[inIndex];
		if (!l) {
			return false;
		}
		var user = l.username || $L("(no username)");
		var host = l.host || l.url || "";
		this.$.item.setContent(host ? (user + "  —  " + host) : user);
		return true;
	},
	itemClick: function(inSender, inEvent) {
		var l = this.logins[inEvent.rowIndex];
		this.close();
		if (l) {
			this.doPick(l);
		}
	}
});
