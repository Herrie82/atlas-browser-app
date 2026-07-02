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
	name: "StartPage",
	kind: enyo.VFlexBox,
	className: "startpage",
	published: {
		url: "",
		searchPreferences: {},
		defaultSearch: ""
	},
	events: {
		onUrlChange: "",
		onOpenBookmarks: "",
		onNewCard: ""
	},
	components: [
		{name: "actionbar", kind: "ActionBar", canShare: false, onLoad: "addressSelect", onOpenBookmarks: "doOpenBookmarks", onNewCard: "doNewCard"},
		{name: "bookmarksService", kind: "DbService", dbKind: "com.palm.browserbookmarks:1", reCallWatches: true, method: "find",
			onSuccess: "gotBookmarks", subscribe: true, onWatch: "refreshBookmarks"},
		// Separate (un-subscribed) handle for writes (del/merge) so we don't disturb the
		// subscribed "find" above; the subscription's onWatch picks up the change and refreshes.
		{name: "bookmarksWriteService", kind: "DbService", dbKind: "com.palm.browserbookmarks:1", reCallWatches: true},
		{name: "scroller", kind: "Scroller", flex: 1, className: "startpage-grid-scroller", components: [
			{name: "grid", className: "startpage-grid"},
			{name: "empty", className: "startpage-empty", showing: false, allowHtml: true,
				content: $L("No bookmarks yet &mdash; bookmark a page with the &#9733;")}
		]},
		// Long-press context menu for a tile.
		{name: "tileMenu", kind: "Menu", className: "startpage-tile-menu", onClose: "tileMenuClosed", components: [
			{caption: $L("Open"), onclick: "menuOpen"},
			{caption: $L("Open in New Card"), onclick: "menuOpenNewCard"},
			{caption: $L("Remove Bookmark"), onclick: "menuRemove"}
		]}
	],
	//* @protected
	create: function() {
		this.inherited(arguments);
		this.bookmarks = [];
		this.tileControls = [];
		this.dragging = false;
		this.suppressTap = false;
		this.searchPreferencesChanged();
		this.defaultSearchChanged();
		this.refreshBookmarks();
	},
	addressSelect: function(inSender, inUrl) {
		this.doUrlChange(inUrl);
	},
	showingChanged: function() {
		this.inherited(arguments);
		// Always focus the action bar when start page is shown.
		if (this.showing) {
			this.$.actionbar.forceFocus();
			// Pick up bookmarks added/removed while we were hidden.
			this.refreshBookmarks();
		} else {
			this.$.actionbar.forceBlur();
		}
	},
	urlChanged: function() {
		this.$.actionbar.setUrl(this.url);
	},
	searchPreferencesChanged: function() {
		this.$.actionbar.setSearchPreferences(this.searchPreferences);
	},
	defaultSearchChanged: function() {
		this.$.actionbar.setDefaultSearch(this.defaultSearch);
	},
	//* @protected
	// Bookmark grid
	refreshBookmarks: function() {
		// Order by the user's manual arrangement ("idx" is an indexed prop on the kind).
		this.$.bookmarksService.call({query: {orderBy: "idx", limit: 100}});
	},
	gotBookmarks: function(inSender, inResponse) {
		this.bookmarks = (inResponse && inResponse.results) || [];
		this.buildTiles();
	},
	buildTiles: function() {
		if (!this.hasNode()) {
			return;
		}
		this.$.grid.destroyControls();
		this.tileControls = [];
		var bmarks = this.bookmarks || [];
		this.$.empty.setShowing(bmarks.length === 0);
		for (var i = 0, b; (b = bmarks[i]); i++) {
			this.createBookmarkTile(b, i);
		}
		this.$.grid.render();
	},
	createBookmarkTile: function(inBookmark, inIndex) {
		// In Isis the favicon is a RELATIVE path (e.g. "faviconcache/fav_<host>.png")
		// that resolves under the app dir; use it directly as the Image src.
		var icon = inBookmark.iconFile32 || inBookmark.iconFile64 || inBookmark.thumbnailFile;
		var title = inBookmark.title || inBookmark.url || "";
		// The first-letter placeholder is ALWAYS rendered; it sits underneath the
		// favicon and shows through when there's no favicon or the file is
		// missing/broken (see iconError).
		var thumbComponents = [
			{className: "startpage-tile-letter", content: this.firstLetter(title)}
		];
		if (icon) {
			// The favicon is layered over the letter placeholder. enyo.Image bubbles a
			// native "error" event as "onerror"; if the file is missing/broken we hide
			// the image (iconError) so the letter shows instead of a broken-image glyph.
			thumbComponents.push({kind: "Image", className: "startpage-tile-icon", src: icon, onerror: "iconError"});
		}
		var tile = this.$.grid.createComponent({
			kind: enyo.VFlexBox, className: "startpage-tile", align: "center", pack: "center",
			bmIndex: inIndex, onclick: "tileClick",
			onmousehold: "tileHold",
			ondragstart: "tileDragStart", ondrag: "tileDrag", ondragfinish: "tileDragFinish",
			components: [
				{className: "startpage-tile-thumb", layoutKind: "VFlexLayout", align: "center", pack: "center", components: thumbComponents},
				{className: "startpage-tile-title", content: title}
			]
		}, {owner: this});
		this.tileControls[inIndex] = tile;
	},
	iconError: function(inSender) {
		// Broken/missing favicon: hide the image so the letter placeholder underneath
		// shows through. inSender is the enyo.Image whose load failed.
		var node = inSender && inSender.hasNode();
		if (node) {
			node.style.display = "none";
		}
		return true;
	},
	firstLetter: function(inText) {
		var t = (inText || "").replace(/^\s*(https?:\/\/)?(www\.)?/i, "");
		return (t.charAt(0) || "?").toUpperCase();
	},
	tileClick: function(inSender) {
		// onclick is declared on the tile, so inSender is the tile (clicks on the
		// image/label child bubble up to it). bmIndex maps back to the record.
		// A tap navigates; a preceding hold (menu) or drag (reorder) must NOT navigate.
		if (this.suppressTap || this.dragging) {
			this.suppressTap = false;
			return true;
		}
		var bookmark = this.bookmarks && this.bookmarks[inSender.bmIndex];
		if (bookmark && bookmark.url) {
			// Reuse the existing nav path: onUrlChange -> BrowserApp.processUrlChange -> setUrl.
			this.doUrlChange(bookmark.url);
		}
		return true;
	},
	//* @protected
	// Long-press context menu ------------------------------------------------
	tileHold: function(inSender, inEvent) {
		if (this.dragging) {
			return true;
		}
		// Swallow the click that the ensuing "up" may generate after a hold.
		this.suppressTap = true;
		this.menuBookmark = this.bookmarks && this.bookmarks[inSender.bmIndex];
		if (!this.menuBookmark) {
			return true;
		}
		this.$.tileMenu.openAtControl(inSender, {top: 10});
		return true;
	},
	tileMenuClosed: function() {
		// Guarantee the flag can't get wedged if no stray click ever arrives.
		this.suppressTap = false;
	},
	menuOpen: function() {
		var b = this.menuBookmark;
		this.$.tileMenu.close();
		if (b && b.url) {
			this.doUrlChange(b.url);
		}
		return true;
	},
	menuOpenNewCard: function(inSender, inEvent) {
		var b = this.menuBookmark;
		this.$.tileMenu.close();
		if (b && b.url) {
			// Mirror BrowserApp.newCardClick, but launch the new card straight at the
			// bookmark URL (the plain onNewCard event opens a blank card).
			enyo.windows.openWindow("index.html", null, {target: b.url, _isisInApp: 1});
		}
		return true;
	},
	menuRemove: function() {
		var b = this.menuBookmark;
		this.$.tileMenu.close();
		if (b && b._id) {
			// db8 delete by _id; the subscribed find's onWatch refreshes the grid.
			this.$.bookmarksWriteService.call({ids: [b._id]}, {method: "del"});
		}
		return true;
	},
	//* @protected
	// Drag-and-drop reorder --------------------------------------------------
	eventClientX: function(inEvent) {
		if (inEvent && typeof inEvent.clientX == "number") { return inEvent.clientX; }
		if (inEvent && typeof inEvent.pageX == "number") { return inEvent.pageX - (window.pageXOffset || 0); }
		return 0;
	},
	eventClientY: function(inEvent) {
		if (inEvent && typeof inEvent.clientY == "number") { return inEvent.clientY; }
		if (inEvent && typeof inEvent.pageY == "number") { return inEvent.pageY - (window.pageYOffset || 0); }
		return 0;
	},
	tileDragStart: function(inSender, inEvent) {
		// If the menu is up, a drag just dismisses it (don't reorder).
		if (this.$.tileMenu.showing) {
			this.$.tileMenu.close();
			return true;
		}
		if (this.bookmarks.length < 2) {
			return true; // nothing to reorder
		}
		this.dragging = true;
		this.suppressTap = true;
		this.dragFromIndex = inSender.bmIndex;
		this.dragTargetIndex = inSender.bmIndex;
		this.dragTile = inSender;
		this.dragStartX = this.eventClientX(inEvent);
		this.dragStartY = this.eventClientY(inEvent);
		var n = inSender.hasNode();
		if (n) {
			n.className += " startpage-tile-dragging";
		}
		// Returning true claims the gesture so the enclosing Scroller doesn't scroll.
		return true;
	},
	tileDrag: function(inSender, inEvent) {
		if (!this.dragging) {
			return true;
		}
		var x = this.eventClientX(inEvent);
		var y = this.eventClientY(inEvent);
		var n = this.dragTile && this.dragTile.hasNode();
		if (n) {
			n.style.webkitTransform = "translate(" + (x - this.dragStartX) + "px," + (y - this.dragStartY) + "px) scale(1.08)";
		}
		this.updateDropTarget(x, y);
		return true;
	},
	updateDropTarget: function(x, y) {
		var target = this.dragTargetIndex;
		for (var i = 0, c, node; (c = this.tileControls[i]); i++) {
			// Skip the lifted tile: it's translated under the finger so its rect
			// would otherwise always match first.
			if (i === this.dragFromIndex) { continue; }
			node = c.hasNode();
			if (!node) { continue; }
			var r = node.getBoundingClientRect();
			if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
				target = i;
				break;
			}
		}
		if (target !== this.dragTargetIndex) {
			this.setDropHighlight(this.dragTargetIndex, false);
			this.dragTargetIndex = target;
			if (target !== this.dragFromIndex) {
				this.setDropHighlight(target, true);
			}
		}
	},
	setDropHighlight: function(inIndex, inOn) {
		var c = this.tileControls[inIndex];
		var node = c && c.hasNode();
		if (!node) { return; }
		if (inOn) {
			if (node.className.indexOf("startpage-tile-drop-target") < 0) {
				node.className += " startpage-tile-drop-target";
			}
		} else {
			node.className = node.className.replace(/\s*startpage-tile-drop-target/g, "");
		}
	},
	tileDragFinish: function(inSender, inEvent) {
		if (!this.dragging) {
			return true;
		}
		this.dragging = false;
		var from = this.dragFromIndex;
		var to = this.dragTargetIndex;
		// Clear transient visual state.
		this.setDropHighlight(to, false);
		var n = this.dragTile && this.dragTile.hasNode();
		if (n) {
			n.style.webkitTransform = "";
			n.className = n.className.replace(/\s*startpage-tile-dragging/g, "");
		}
		this.dragTile = null;
		if (to !== from && to >= 0 && to < this.bookmarks.length) {
			this.commitReorder(from, to);
		}
		return true;
	},
	commitReorder: function(inFrom, inTo) {
		// Move the record in the local array, then renumber idx = 0..n-1 across the
		// whole set and merge in one batch so the order survives reload.
		var order = this.bookmarks.slice();
		var moved = order.splice(inFrom, 1)[0];
		order.splice(inTo, 0, moved);
		var objs = [];
		for (var i = 0; i < order.length; i++) {
			order[i].idx = i;
			objs.push({_id: order[i]._id, idx: i});
		}
		this.bookmarks = order;
		// Instant local feedback; the subscribed find will re-confirm the same order.
		this.buildTiles();
		if (objs.length) {
			this.$.bookmarksWriteService.call({objects: objs}, {method: "merge"});
		}
	},
	//* @public
	resize: function() {
		this.$.actionbar.resize();
	},
	getUrl: function() {
		return this.$.actionbar.getUrl();
	}
});
