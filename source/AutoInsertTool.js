//   Per-site saved logins: the "armed" auto-insert toaster.
//   Ported from com.maklesoft.browser/source/AutoInsertTool.js.
//
//   Once armed (open) with a username/password, the Browser inserts the current
//   radio-selected value into the focused editable field via WebView.insertStringAtCursor(),
//   then flips the selection to the password for the next focused field.

enyo.kind({
	name: "AutoInsertTool",
	kind: "Toaster",
	lazy: false,
	dismissWithClick: false,
	className: "auto-insert-box",
	published: {
		username: "",
		password: "",
		title: $L("auto insert"),
		value: "",
		disabled: true
	},
	titleChanged: function() {
		this.$.title.setContent(this.title);
	},
	usernameChanged: function() {
		this.$.usernameButton.setValue(this.username);
		this.valueChanged();
	},
	passwordChanged: function() {
		this.$.passwordButton.setValue(this.password);
		this.valueChanged();
	},
	valueChanged: function() {
		this.$.radioGroup.setValue(this.value);
	},
	disabledChanged: function() {
		this.$.usernameButton.setDisabled(this.disabled);
		this.$.passwordButton.setDisabled(this.disabled);
	},
	create: function() {
		this.inherited(arguments);
		this.$.usernameButton.setValue(this.username);
		this.$.passwordButton.setValue(this.password);
		this.$.title.setContent(this.title);
		this.setValue(this.username);
		this.disabledChanged();
	},
	radioButtonChanged: function() {
		this.setValue(this.$.radioGroup.getValue());
	},
	open: function() {
		this.inherited(arguments);
		this.setDisabled(false);
		enyo.keyboard.setManualMode(true);
	},
	close: function() {
		this.inherited(arguments);
		this.setDisabled(true);
		enyo.keyboard.setManualMode(false);
	},
	components: [{
		kind: "HFlexBox", align: "center", components: [{
			name: "title", flex: 1, className: "auto-insert-title enyo-text-ellipsis"
		},
		{kind: "CustomButton", className: "bookmark-grid-button stop-button", onclick: "close"}]
	},{
		className: "auto-insert-hint", content: $L("Tap on an input field to auto fill your data!")
	},{
		kind: "RadioGroup", onChange: "radioButtonChanged",
		components: [{
			label: $L("username"), name: "usernameButton"
		},{
			label: $L("password"), name: "passwordButton"
		}]
	}]
});
