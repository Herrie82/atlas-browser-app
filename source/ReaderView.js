//   Reading Mode (reader view) for the Atlas browser app.
//   Pure app-side: fetches the current page HTML via an enyo WebService,
//   extracts the main article with a Readability-style heuristic, and shows
//   a clean, large-font, distraction-free version. App-only, no BrowserServer.
//
//   Extraction pipeline (all string/regex + detached-<div> DOM; no DOMParser):
//     0. Detect cookie/consent "privacy gate" interstitials -> friendly note.
//     1. JSON-LD "articleBody" (schema.org NewsArticle/Article/BlogPosting).
//     2. Rich DOM extraction: strip boilerplate, score <p> clusters, climb to
//        the common container so bodies split across sibling <div>s stay whole.
//     3. Pure-string fallback: pull headings/paragraphs from <article> or body.
//     4. og:/meta description as a short summary.
//   Every stage is defensive and degrades gracefully; nothing throws.

enyo.kind({
	name: "ReaderView",
	kind: enyo.VFlexBox,
	className: "basic-back reader-view",
	published: {
		baseUrl: "",
		pageTitle: ""
	},
	events: {
		// fired when the user taps Done / wants to leave the reader
		onClose: "",
		// fired when the user taps a link inside the cleaned article
		onOpenUrl: ""
	},
	components: [
		{name: "fetch", kind: "WebService", handleAs: "text",
			onSuccess: "fetchSuccess", onFailure: "fetchFailure"},
		{kind: "Header", className: "enyo-header-dark reader-header", components: [
			{kind: enyo.HFlexBox, flex: 1, align: "center", components: [
				{name: "headerTitle", flex: 1, className: "reader-header-title", content: $L("Reading Mode")},
				{kind: "Button", caption: $L("Done"), className: "enyo-button-dark reader-done-btn", onclick: "closeClick"}
			]}
		]},
		{name: "scroller", kind: "Scroller", flex: 1, components: [
			{className: "reader-content", components: [
				{name: "loadingBox", showing: false, style: "text-align:center; padding:64px 16px;", components: [
					{name: "spinner", kind: "SpinnerLarge", showing: true, style: "display:inline-block;"},
					{name: "loadingText", style: "color:#888888; margin-top:18px; font-family:Prelude,sans-serif; font-size:16px;", content: $L("Extracting article…")}
				]},
				{name: "article", kind: "HtmlContent", onLinkClick: "articleLinkClick"}
			]}
		]}
	],
	//* @public
	// Load and render a URL in reading mode.
	load: function(inUrl, inTitle, inBrowser) {
		this.baseUrl = inUrl || "";
		this.pageTitle = inTitle || "";
		this._browser = inBrowser || null;
		this.$.headerTitle.setContent($L("Reading Mode"));
		this.$.loadingBox.setShowing(true);
		this.$.loadingText.setContent($L("Extracting article…"));
		this.$.article.setContent("");
		if (this.$.scroller.scrollTo) {
			this.$.scroller.scrollTo(0, 0);
		}
		// The BS extracts the CURRENT DOM on reader-open (BrowserApp triggers it) and pushes the
		// result into window.__atlasReaderMap keyed by URL — reads the consent-passed page the browser
		// already has, no re-fetch. Poll for it (arrives async ~1s); fall back to a direct fetch only
		// if nothing turns up (non-consent sites / no article DOM).
		if (!this._browser && this.baseUrl) {
			// Opened for a link (not the current page) — no loaded DOM to read; fetch it directly.
			this.$.fetch.setUrl(this.baseUrl);
			this.$.fetch.call();
			return;
		}
		this._readerTries = 0;
		this._readerTok = (this._readerTok || 0) + 1;
		this._readerPoll(this._readerTok);
	},
	_norm: function(u) { return (u || "").replace(/^[a-zA-Z]+:\/\//, "").replace(/[#?].*$/, "").replace(/\/+$/, ""); },
	_atlasReaderFor: function(inUrl) {
		var m = window.__atlasReaderMap;
		if (!m || !inUrl) { return null; }
		var n = this._norm(inUrl);
		for (var k in m) { if (this._norm(k) === n) { return m[k]; } }
		return null;
	},
	_readerWrap: function(html) {
		return '<div style="font-family:Prelude,\'Helvetica Neue\',sans-serif;font-size:17px;line-height:1.55;padding:14px 16px;color:#1a1a1a;">' + html + '</div>';
	},
	_readerSpinner: function(msg) {
		return this._readerWrap(
			'<div style="text-align:center;padding:44px 16px;">' +
			'<div style="display:inline-block;width:32px;height:32px;border:4px solid #dddddd;border-top-color:#555555;border-radius:50%;-webkit-animation:atlasSpin 0.9s linear infinite;"></div>' +
			'<p style="color:#888888;margin-top:16px;">' + this.escapeHtml(msg) + '</p></div>' +
			'<style>@-webkit-keyframes atlasSpin{to{-webkit-transform:rotate(360deg)}}</style>'
		);
	},
	_readerPoll: function(tok) {
		if (tok !== this._readerTok) { return; }   // superseded by a newer reader-open — stop (no flicker)
		// URL-keyed match first; fall back to the latest on-demand extraction (readerClick cleared it,
		// so any value here is this reader's fresh result — robust to redirect URL differences).
		var r = this._atlasReaderFor(this.baseUrl) || window.__atlasReaderLatest;
		if (r && r.html && r.html.length > 0) {
			this.$.loadingBox.setShowing(false);
			this.readerTitle = r.title || this.pageTitle || "";
			this.$.headerTitle.setContent(this.escapeHtml(this.readerTitle || $L("Reading Mode")));
			this.$.article.setContent(this._readerWrap(r.html));
			return;
		}
		// Article DOM may not be ready yet (JS/lazy render) — re-trigger extraction periodically so
		// opening reading mode early still fills in the moment the content appears.
		if (this._browser && (this._readerTries % 5) === 2) {
			try { this._browser.viewCall("findInPage", ["__ATLAS_EXTRACT__"]); } catch (e) {}
		}
		if (this._readerTries++ < 80) {   // ~20s at 250ms — the article can render late on heavy pages
			var self = this;
			setTimeout(function() { self._readerPoll(tok); }, 250);
			return;
		}
		// Gave up: don't re-fetch (cookieless fetch hits consent walls + gives a misleading
		// "no readable content"); the page just hasn't rendered an article yet.
		this.$.loadingBox.setShowing(false);
		this.$.article.setContent(this._readerWrap('<p style="color:#888888;">' +
			this.escapeHtml($L("Couldn't extract the article — the page may still be loading, or this isn't an article. Close and reopen Reading Mode to try again.")) + '</p>'));
	},
	//* @protected
	closeClick: function() {
		this.doClose();
		return true;
	},
	articleLinkClick: function(inSender, inUrl) {
		if (inUrl) {
			this.doOpenUrl(inUrl);
		}
		return true;
	},
	fetchFailure: function(inSender, inResponse, inRequest) {
		this.$.loadingBox.setShowing(false);
		var status = "";
		try { status = inRequest && inRequest.xhr ? inRequest.xhr.status : ""; } catch (e) {}
		this.$.article.setContent($L("Could not load the page for reading.") +
			" " + (status ? "(" + status + ")" : "") +
			"<br><br>" + this.escapeHtml(this.baseUrl));
	},
	fetchSuccess: function(inSender, inResponse, inRequest) {
		this.$.loadingBox.setShowing(false);
		var html = "";
		try {
			if (typeof inResponse === "string") {
				html = inResponse;
			} else if (inRequest && inRequest.xhr) {
				html = inRequest.xhr.responseText || "";
			}
		} catch (e) {
			html = "";
		}
		var out;
		try {
			out = this.extract(html);
		} catch (e) {
			out = "<p>" + this.escapeHtml($L("Could not extract the article.")) + "</p>";
		}
		this.$.headerTitle.setContent(this.escapeHtml(this.readerTitle || $L("Reading Mode")));
		this.$.article.setContent(this._readerWrap(out));
		if (this.$.scroller.scrollTo) {
			this.$.scroller.scrollTo(0, 0);
		}
	},

	// ---- extraction ----

	escapeHtml: function(s) {
		if (s === null || s === undefined) { return ""; }
		return String(s)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	},
	// Decode the handful of HTML entities we actually meet in article text.
	decodeEntities: function(s) {
		if (s === null || s === undefined) { return ""; }
		return String(s)
			.replace(/&#(\d+);/g, function(_, n) {
				var c = parseInt(n, 10);
				return (c >= 0 && c <= 0x10FFFF) ? String.fromCharCode(c) : "";
			})
			.replace(/&#x([0-9a-fA-F]+);/g, function(_, n) {
				var c = parseInt(n, 16);
				return (c >= 0 && c <= 0x10FFFF) ? String.fromCharCode(c) : "";
			})
			.replace(/&nbsp;/gi, " ")
			.replace(/&(?:apos|#0?39);/gi, "'")
			.replace(/&quot;/gi, '"')
			.replace(/&lt;/gi, "<")
			.replace(/&gt;/gi, ">")
			.replace(/&hellip;/gi, "…")
			.replace(/&mdash;/gi, "—")
			.replace(/&ndash;/gi, "–")
			.replace(/&euro;/gi, "€")
			.replace(/&amp;/gi, "&");
	},
	// Undo JSON string escaping (used for JSON-LD articleBody).
	unescapeJson: function(s) {
		if (!s) { return ""; }
		return String(s)
			.replace(/\\u([0-9a-fA-F]{4})/g, function(_, h) {
				return String.fromCharCode(parseInt(h, 16));
			})
			.replace(/\\n/g, "\n")
			.replace(/\\r/g, "\n")
			.replace(/\\t/g, " ")
			.replace(/\\"/g, '"')
			.replace(/\\\//g, "/")
			.replace(/\\\\/g, "\\");
	},
	// Does an HTML fragment carry a meaningful amount of readable text?
	hasText: function(h) {
		return !!h && h.replace(/<[^>]+>/g, "").replace(/\s+/g, "").length >= 25;
	},
	// Resolve a possibly-relative URL against the page's base URL.
	resolveUrl: function(rel) {
		if (!rel) { return rel; }
		rel = String(rel);
		if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(rel) || rel.indexOf("data:") === 0) {
			return rel;
		}
		var base = this.baseUrl || "";
		var m = base.match(/^([a-zA-Z][a-zA-Z0-9+.\-]*:)\/\/([^\/?#]*)/);
		if (!m) { return rel; }
		var scheme = m[1];
		var host = m[2];
		var origin = scheme + "//" + host;
		if (rel.indexOf("//") === 0) {
			return scheme + rel;
		}
		if (rel.charAt(0) === "/") {
			return origin + rel;
		}
		// directory of the base path
		var path = base.substring(origin.length);
		var q = path.search(/[?#]/);
		if (q >= 0) { path = path.substring(0, q); }
		var slash = path.lastIndexOf("/");
		var dir = slash >= 0 ? path.substring(0, slash + 1) : "/";
		if (dir.charAt(0) !== "/") { dir = "/" + dir; }
		return origin + dir + rel;
	},
	extract: function(html) {
		html = html || "";
		// Pull the document title before stripping <head>.
		var docTitle = this.pageTitle || "";
		var tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
		if (tm && tm[1]) {
			docTitle = this.decodeEntities(tm[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ")).replace(/^\s+|\s+$/g, "");
		}
		this.readerTitle = docTitle;

		// Build the title/source banner once; every branch reuses it.
		var titleHtml = "";
		if (docTitle) {
			titleHtml = "<h1 class=\"reader-title\">" + this.escapeHtml(docTitle) + "</h1>";
		}
		if (this.baseUrl) {
			var host = this.baseUrl.replace(/^[a-zA-Z]+:\/\//, "").replace(/\/.*$/, "");
			titleHtml += "<div class=\"reader-source\">" + this.escapeHtml(host) + "</div>";
		}

		// 0) Cookie / privacy consent interstitial: there is no article behind it
		// yet (the server 302s a cookieless request to a consent domain). Tell the
		// user plainly instead of the useless generic "no content" message.
		if (this.looksLikeConsentWall(html, docTitle)) {
			return titleHtml + "<p>" + this.escapeHtml($L("This page is showing a cookie or privacy consent screen, so there is no article to read yet. Open it in the normal browser, accept or decline the consent prompt, then try Reading Mode again.")) + "</p>";
		}

		// 1) JSON-LD articleBody -- the cleanest source when a site publishes it.
		var jsonBody = "";
		try { jsonBody = this.extractJsonLdBody(html); } catch (e) { jsonBody = ""; }
		if (this.hasText(jsonBody)) { return titleHtml + jsonBody; }

		// 2) Rich DOM extraction (keeps links, images, headings).
		var domOut = "";
		try { domOut = this.extractFromDom(html); } catch (e) { domOut = ""; }
		if (this.hasText(domOut)) { return titleHtml + domOut; }

		// 3) Pure-string fallback: works even if DOM parsing misbehaves.
		var strOut = "";
		try { strOut = this.extractFromString(html); } catch (e) { strOut = ""; }
		if (this.hasText(strOut)) { return titleHtml + strOut; }

		// 4) Last resort: a one-line summary from meta/og description.
		var desc = "";
		try { desc = this.metaDescription(html); } catch (e) { desc = ""; }
		if (desc) { return titleHtml + "<p>" + this.escapeHtml(desc) + "</p>"; }

		return titleHtml + "<p>" + this.escapeHtml($L("No readable article content was found on this page.")) + "</p>";
	},

	// A cookie/consent gate carries essentially no article paragraphs but is full
	// of consent-management (CMP) markers. Require BOTH so normal articles that
	// merely embed a CMP script are not mistaken for a wall.
	looksLikeConsentWall: function(html, title) {
		var t = (title || "").toLowerCase();
		if (/privacy gate|consent|cookiewall|cookie ?wall|toestemming|verwerkt je (persoons)?gegevens/.test(t)) {
			return true;
		}
		var h = String(html || "");
		var paraCount = (h.match(/<p[\s>]/gi) || []).length;
		if (paraCount >= 4) { return false; }
		var low = h.toLowerCase();
		var cmp = /myprivacy\.dpgmedia|privacygate|__tcfapi|didomi|sourcepoint|onetrust|cookiebot|usercentrics|trustarc|quantcast|consentmanager/.test(low);
		return cmp && paraCount < 3;
	},

	// Scan every application/ld+json block for the largest "articleBody".
	extractJsonLdBody: function(html) {
		var re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
		var m, best = "";
		while ((m = re.exec(html))) {
			var raw = m[1] || "";
			var bm = raw.match(/"articleBody"\s*:\s*"((?:\\.|[^"\\])*)"/);
			if (bm && bm[1] && bm[1].length > best.length) { best = bm[1]; }
		}
		if (!best) { return ""; }
		var text = this.decodeEntities(this.unescapeJson(best));
		if (text.replace(/\s+/g, "").length < 100) { return ""; }
		var parts = text.split(/\n+/);
		var out = "";
		for (var i = 0; i < parts.length; i++) {
			var p = parts[i].replace(/^\s+|\s+$/g, "");
			if (p) { out += "<p>" + this.escapeHtml(p) + "</p>"; }
		}
		return out || ("<p>" + this.escapeHtml(text) + "</p>");
	},

	// og:description / <meta name="description"> as a short summary of last resort.
	metaDescription: function(html) {
		var h = String(html || "");
		var m = h.match(/<meta[^>]+(?:property|name)\s*=\s*["'](?:og:description|description)["'][^>]*content\s*=\s*["']([^"']*)["']/i)
			|| h.match(/<meta[^>]+content\s*=\s*["']([^"']*)["'][^>]*(?:property|name)\s*=\s*["'](?:og:description|description)["']/i);
		if (m && m[1]) {
			return this.decodeEntities(m[1].replace(/\s+/g, " ")).replace(/^\s+|\s+$/g, "");
		}
		return "";
	},

	// Shared boilerplate strip used before both DOM and string extraction. Note
	// the <head> pattern requires '>' or whitespace after "head" so it can never
	// swallow an in-body <header>...</header> block.
	stripNoise: function(html) {
		return String(html || "")
			.replace(/<!--[\s\S]*?-->/g, "")
			.replace(/<script[\s\S]*?<\/script>/gi, "")
			.replace(/<style[\s\S]*?<\/style>/gi, "")
			.replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
			.replace(/<head(?:\s[^>]*)?>[\s\S]*?<\/head>/gi, "")
			.replace(/<link[^>]*>/gi, "")
			.replace(/<meta[^>]*>/gi, "")
			.replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
			.replace(/<svg[\s\S]*?<\/svg>/gi, "");
	},

	// Rich extraction through a detached <div> (innerHTML parse -- NOT DOMParser).
	extractFromDom: function(html) {
		var cleaned = this.stripNoise(html);
		// Neutralize image src so detached parsing does not fetch anything; we
		// restore (and absolutize) src when we build the output.
		cleaned = cleaned.replace(/<img\b/gi, "<img data-rdr=\"1\"")
			.replace(/\bsrc\s*=/gi, "data-rdrsrc=");

		// Grab the body if present.
		var bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
		var bodyHtml = bodyMatch ? bodyMatch[1] : cleaned;

		var root = document.createElement("div");
		root.innerHTML = bodyHtml;

		// Remove structural noise outright.
		this.removeTags(root, ["nav", "aside", "header", "footer", "form",
			"button", "input", "select", "textarea", "label", "fieldset",
			"figure", "figcaption", "object", "embed", "video", "audio", "canvas"]);
		this.removeByClassId(root, /(^|[\s_\-])(ad|ads|advert|sponsor|promo|share|social|comment|comments|reactie|reacties|sidebar|widget|related|nav|menu|breadcrumb|footer|header|banner|popup|modal|newsletter|subscribe|cookie|consent)([\s_\-]|$)/i);

		// Score candidates the Readability way, then climb to the common wrapper.
		var best = this.findArticle(root);
		var container = best || root;

		return this.serializeClean(container);
	},

	// Pure string/regex extraction: robust final fallback that needs no live DOM.
	// Prefers the largest <article>; else the <body>; pulls headings/paragraphs.
	extractFromString: function(html) {
		var cleaned = this.stripNoise(html);
		var bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
		var scope = bodyMatch ? bodyMatch[1] : cleaned;
		var frag = this.biggestTag(scope, "article")
			|| this.biggestTag(scope, "main")
			|| scope;
		return this.paragraphsFromHtml(frag);
	},

	// Largest inner HTML of a given tag (non-nested assumption; picks the biggest).
	biggestTag: function(str, tag) {
		var re = new RegExp("<" + tag + "\\b[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "gi");
		var m, best = "";
		while ((m = re.exec(str))) {
			if (m[1] && m[1].length > best.length) { best = m[1]; }
		}
		return best;
	},

	// Convert a raw HTML fragment to clean heading/paragraph HTML by regex only.
	paragraphsFromHtml: function(frag) {
		if (!frag) { return ""; }
		var s = String(frag)
			.replace(/<(script|style|nav|header|footer|aside|form|figure|figcaption)\b[\s\S]*?<\/\1>/gi, "")
			.replace(/<!--[\s\S]*?-->/g, "");
		var out = "";
		var re = /<(h[1-6]|p|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
		var m;
		while ((m = re.exec(s))) {
			var tag = m[1].toLowerCase();
			var inner = this.decodeEntities(
				m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
			).replace(/^\s+|\s+$/g, "");
			var isHeading = tag.charAt(0) === "h";
			if (inner.length < (isHeading ? 3 : 20)) { continue; }
			if (isHeading) {
				out += "<h2>" + this.escapeHtml(inner) + "</h2>";
			} else if (tag === "li") {
				out += "<p>• " + this.escapeHtml(inner) + "</p>";
			} else {
				out += "<p>" + this.escapeHtml(inner) + "</p>";
			}
		}
		return out;
	},
	removeTags: function(root, tags) {
		for (var t = 0; t < tags.length; t++) {
			var els = root.getElementsByTagName(tags[t]);
			// live list: iterate from the end
			for (var i = els.length - 1; i >= 0; i--) {
				var el = els[i];
				if (el.parentNode) { el.parentNode.removeChild(el); }
			}
		}
	},
	removeByClassId: function(root, re) {
		var all = root.getElementsByTagName("*");
		var doomed = [];
		for (var i = 0; i < all.length; i++) {
			var el = all[i];
			var sig = (el.className || "") + " " + (el.id || "");
			if (sig.replace(/\s+/g, "") && re.test(sig)) {
				// keep big text blocks even if loosely matched
				var txt = (el.textContent || "").length;
				if (txt < 200) { doomed.push(el); }
			}
		}
		for (var j = 0; j < doomed.length; j++) {
			if (doomed[j].parentNode) { doomed[j].parentNode.removeChild(doomed[j]); }
		}
	},
	textLen: function(node) {
		return (node.textContent || "").replace(/\s+/g, " ").length;
	},
	linkDensity: function(node) {
		var total = this.textLen(node);
		if (!total) { return 0; }
		var links = node.getElementsByTagName("a");
		var linkLen = 0;
		for (var i = 0; i < links.length; i++) {
			linkLen += this.textLen(links[i]);
		}
		return linkLen / total;
	},
	// Sum of text from qualifying paragraphs contained in an element.
	paraText: function(node) {
		var ps = node.getElementsByTagName("p");
		var n = 0;
		for (var i = 0; i < ps.length; i++) {
			var l = this.textLen(ps[i]);
			if (l >= 25) { n += l; }
		}
		return n;
	},
	findArticle: function(root) {
		// Prefer an explicit <article> or <main> with real text.
		var prefer = ["article", "main"];
		for (var p = 0; p < prefer.length; p++) {
			var els = root.getElementsByTagName(prefer[p]);
			var pick = null, pickLen = 0;
			for (var i = 0; i < els.length; i++) {
				var l = this.textLen(els[i]);
				if (l > pickLen) { pickLen = l; pick = els[i]; }
			}
			if (pick && pickLen > 250) { return this.climb(pick, root); }
		}
		// Paragraph-density scoring.
		var paras = root.getElementsByTagName("p");
		var seen = [];
		for (var k = 0; k < paras.length; k++) {
			var par = paras[k];
			var tl = this.textLen(par);
			if (tl < 25) { continue; }
			var parent = par.parentNode;
			if (!parent || parent.nodeType !== 1) { continue; }
			var text = (par.textContent || "");
			var commas = text.split(",").length - 1;
			var add = 1 + commas + Math.min(Math.floor(tl / 100), 3);
			if (parent._rdrScore === undefined) {
				parent._rdrScore = 0; seen.push(parent);
			}
			parent._rdrScore += add;
			var gp = parent.parentNode;
			if (gp && gp.nodeType === 1) {
				if (gp._rdrScore === undefined) { gp._rdrScore = 0; seen.push(gp); }
				gp._rdrScore += add / 2;
			}
		}
		var best = null, bestScore = 0;
		for (var s = 0; s < seen.length; s++) {
			var node = seen[s];
			var score = node._rdrScore * (1 - this.linkDensity(node));
			if (score > bestScore) { bestScore = score; best = node; }
		}
		// cleanup expandos
		for (var c = 0; c < seen.length; c++) {
			try { delete seen[c]._rdrScore; } catch (e) { seen[c]._rdrScore = undefined; }
		}
		if (best && bestScore > 0) { return this.climb(best, root); }
		// Fallback: the block element with the most text.
		var blocks = root.getElementsByTagName("div");
		var fb = null, fbLen = 0;
		for (var b = 0; b < blocks.length; b++) {
			var bl = this.textLen(blocks[b]);
			if (bl > fbLen) { fbLen = bl; fb = blocks[b]; }
		}
		return fb || root;
	},
	// Many sites split the article across sibling <div>s (intro block + body
	// block, e.g. Tweakers' "article largeWidth" + "pos1 loading"). The density
	// winner is only one of them, so climb to a parent while doing so pulls in
	// materially more paragraph text without turning into a link-heavy wrapper.
	climb: function(node, root) {
		var guard = 0;
		while (node && node.parentNode && node.parentNode.nodeType === 1 &&
				node.parentNode !== root && guard < 4) {
			var parent = node.parentNode;
			var childText = this.paraText(node);
			var parentText = this.paraText(parent);
			if (parentText > childText * 1.25 && this.linkDensity(parent) < 0.4) {
				node = parent;
				guard++;
			} else {
				break;
			}
		}
		return node;
	},
	// Keep only readable elements, drop the rest, absolutize img/links.
	serializeClean: function(container) {
		var clone = container.cloneNode(true);
		// Drop residual noise inside the chosen container.
		this.removeTags(clone, ["nav", "aside", "header", "footer", "form",
			"button", "input", "select", "textarea", "script", "style", "ins"]);
		this.removeByClassId(clone, /(^|[\s_\-])(ad|ads|advert|sponsor|share|social|comment|comments|reactie|reacties|sidebar|widget|related|nav|menu|caption|credit)([\s_\-]|$)/i);
		// Absolutize anchors.
		var anchors = clone.getElementsByTagName("a");
		for (var a = 0; a < anchors.length; a++) {
			var href = anchors[a].getAttribute("href");
			if (href) { anchors[a].setAttribute("href", this.resolveUrl(href)); }
		}
		// Restore + absolutize images.
		var imgs = clone.getElementsByTagName("img");
		for (var im = imgs.length - 1; im >= 0; im--) {
			var img = imgs[im];
			var rs = img.getAttribute("data-rdrsrc");
			if (rs) {
				img.setAttribute("src", this.resolveUrl(rs));
				img.removeAttribute("data-rdrsrc");
				img.removeAttribute("data-rdr");
			} else {
				if (img.parentNode) { img.parentNode.removeChild(img); }
			}
		}
		// Strip inline styles/classes that could fight the reader theme.
		var all = clone.getElementsByTagName("*");
		for (var x = 0; x < all.length; x++) {
			all[x].removeAttribute && all[x].removeAttribute("style");
			all[x].removeAttribute && all[x].removeAttribute("class");
			all[x].removeAttribute && all[x].removeAttribute("id");
			all[x].removeAttribute && all[x].removeAttribute("width");
			all[x].removeAttribute && all[x].removeAttribute("height");
		}
		return clone.innerHTML;
	}
});
