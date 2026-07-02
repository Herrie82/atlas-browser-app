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
	name: "BrowserContextMenu",
	kind: "PopupSelect",
	published: {
		view: ""
	},
	events: {
		onItemClick: ""
	},
	tapInfo: {link: true, image: true},
	linkItems: [
		{caption: $L("Open In New Card"), value:"newCardClick"},
		{caption: $L("Reading Mode"), value:"readerLinkClick"},
		{caption: $L("Share Link"), value:"shareLinkClick"},
		{caption: $L("Copy URL"), value:"copyLinkClick"},
        {caption: $L("Download Link"), value:"downloadlinkClick"}
	],
	imageItems: [
		{caption: $L("Save Image"), value: "copyToPhotosClick"},
		{caption: $L("Set Wallpaper"), value: "setWallpaperClick"},
		{caption: $L("Share Image"), value: "shareImageClick"},
		{caption: $L("Copy Image URL"), value: "copyImageUrlClick"}
	],
	// Shown when the long-press did not land on a link or image (plain page/text),
	// or when the engine hit-test isn't available. These act on the current page.
	pageItems: [
		{caption: $L("Open In New Card"), value: "pageNewCardClick"},
		{caption: $L("Reading Mode"), value: "pageReaderClick"},
		{caption: $L("Share Link"), value: "pageShareClick"},
		{caption: $L("Copy URL"), value: "pageCopyLinkClick"}
	],
	openAtTap: function(inEvent, inTapInfo) {
		this.tapPosition = {left: inEvent.pageX, top: inEvent.pageY};
		this.tapInfo = inTapInfo;
		if (!this.view) {
			return;
		}
		this._handled = false;   // arm one-shot: a fresh menu allows exactly one action
		var items = this.makeItems();
		if (items) {
			this.setItems(items);
			this.openNear(this.tapPosition);
		}
	},
	makeItems: function() {
		var items;
		if (this.tapInfo.isLink) {
			var uri = enyo.uri.parseUri(this.tapInfo.linkUrl);
			if (uri.scheme && enyo.uri.isValidScheme(uri)) {
				items = [].concat(this.linkItems);
			}
		}
		if (this.tapInfo.isImage) {
			items = (items || []).concat(this.imageItems);
		}
		// Nothing actionable at the point (or no engine hit-test): fall back to
		// page-level actions so the long-press menu is never empty.
		if (!items) {
			items = [].concat(this.pageItems);
		}
		return items;
	},
	menuItemClick: function(inSender) {
		// PopupSelect delivers a menu-item tap twice (tap + click) on LunaCE, which fired every
		// action twice (2 cards, 2 downloads, 2 colliding image saves). One-shot per menu open.
		if (this._handled) {
			return;
		}
		this._handled = true;
		this.doItemClick(inSender.getValue(), this.tapInfo, this.tapPosition);
		this.close();
	}
});
