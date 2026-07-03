//   CSV importer for Chrome / Google Password Manager exports.
//
//   Chrome (chrome://password-manager -> Export) writes a CSV with the header:
//       name,url,username,password
//   This reads such a file from a fixed device path (default /media/internal/atlas-logins.csv,
//   which is app-accessible), parses it (RFC-4180-ish: quoted fields, embedded commas/quotes,
//   CRLF), dedupes by url+username against the store and within the file, and bulk-inserts the
//   new rows into the org.webosports.logins:1 kind. Malformed rows are skipped.

enyo.kind({
	name: "LoginImporter",
	kind: enyo.Component,
	published: {
		filePath: "/media/internal/atlas-logins.csv",
		dbKind: "org.webosports.logins:1"
	},
	events: {
		//* onImportDone(inSender, inResult) where inResult = {added, skipped, total, error}
		onImportDone: ""
	},
	components: [
		{name: "loginsService", kind: "DbService", dbKind: "org.webosports.logins:1"}
	],
	//* @public
	//* Kick off the import. Reads the file, then continues in gotFile().
	run: function() {
		// Re-entry guard: the menu item can fire twice (webOS delivers touch+mouse click), which raced two
		// concurrent imports -> one "succeeded", the other "failed". Ignore a run while one is in progress.
		if (this.importing) {
			return;
		}
		this.importing = true;
		var self = this;
		enyo.xhrGet({
			url: "file://" + this.filePath,
			load: function(inResponse, inXhr) {
				self.gotFile(inResponse, inXhr);
			}
		});
	},
	//* Clear the in-progress guard, then notify listeners.
	finish: function(inResult) {
		this.importing = false;
		this.doImportDone(inResult);
	},
	//* @protected
	gotFile: function(inResponse, inXhr) {
		// file:// XHR gives status 0 on success; treat empty/failed reads as an error.
		if (!inResponse) {
			this.finish({added: 0, skipped: 0, total: 0, error: $L("Could not read ") + this.filePath});
			return;
		}
		this.parsed = this.parseRows(this.parseCsv(inResponse));
		if (!this.parsed.length) {
			this.finish({added: 0, skipped: 0, total: 0, error: $L("No logins found in the CSV file")});
			return;
		}
		// Load existing rows so we can dedupe by url+username before inserting. db8 (webOS 3.0.5) caps the
		// query "limit" at 500 — 5000 is rejected ("value out of range"), which failed the whole import.
		this.$.loginsService.call({query: {limit: 500}}, {method: "find", onSuccess: "gotExisting", onFailure: "dbFailure"});
	},
	gotExisting: function(inSender, inResponse) {
		var seen = {}, i, r;
		var results = (inResponse && inResponse.results) || [];
		for (i = 0; i < results.length; i++) {
			seen[this.dedupeKey(results[i].url, results[i].username)] = true;
		}
		var toAdd = [], skipped = 0;
		for (i = 0; i < this.parsed.length; i++) {
			r = this.parsed[i];
			var key = this.dedupeKey(r.url, r.username);
			if (seen[key]) {
				skipped++;
				continue;
			}
			seen[key] = true; // also dedupe duplicates within the file itself
			r._kind = this.dbKind;
			toAdd.push(r);
		}
		this.importResult = {added: toAdd.length, skipped: skipped, total: this.parsed.length};
		if (toAdd.length) {
			this.$.loginsService.call({objects: toAdd}, {method: "put", onSuccess: "putDone", onFailure: "dbFailure"});
		} else {
			this.finish(this.importResult);
		}
	},
	putDone: function() {
		this.finish(this.importResult);
	},
	dbFailure: function(inSender, inResponse) {
		this.finish({added: 0, skipped: 0, total: (this.parsed ? this.parsed.length : 0),
			error: (inResponse && inResponse.errorText) || $L("Database error")});
	},
	dedupeKey: function(inUrl, inUsername) {
		return (inUrl || "").toLowerCase() + "\n" + (inUsername || "");
	},
	//* Derive a bare host from a URL for host-keyed lookups.
	hostFromUrl: function(inUrl) {
		var m = (inUrl || "").match(/^[a-z]+:\/\/([^\/:?#]+)/i);
		return m ? m[1].toLowerCase() : (inUrl || "").toLowerCase();
	},
	//* Turn parsed CSV rows (array of string arrays) into login records. First row is
	//* the header; column order is taken from it so exports with a different order still work.
	parseRows: function(inRows) {
		if (!inRows.length) {
			return [];
		}
		var header = inRows[0];
		var col = {name: -1, url: -1, username: -1, password: -1};
		for (var h = 0; h < header.length; h++) {
			var name = (header[h] || "").toLowerCase().replace(/^﻿/, "").replace(/^"|"$/g, "").trim();
			if (col.hasOwnProperty(name)) {
				col[name] = h;
			}
		}
		// If the header wasn't recognized, assume the standard Chrome order.
		if (col.url < 0 && col.username < 0 && col.password < 0) {
			col = {name: 0, url: 1, username: 2, password: 3};
		}
		var out = [];
		for (var i = 1; i < inRows.length; i++) {
			var row = inRows[i];
			if (!row || (row.length == 1 && row[0] === "")) {
				continue; // blank line
			}
			var url = col.url >= 0 ? (row[col.url] || "") : "";
			var username = col.username >= 0 ? (row[col.username] || "") : "";
			var password = col.password >= 0 ? (row[col.password] || "") : "";
			var title = col.name >= 0 ? (row[col.name] || "") : "";
			// A usable login needs a url and at least one of username/password.
			if (!url || (!username && !password)) {
				continue; // malformed / unusable row -> skip
			}
			out.push({
				host: this.hostFromUrl(url),
				url: url,
				username: username,
				password: password,
				title: title || this.hostFromUrl(url),
				date: (new Date()).getTime()
			});
		}
		return out;
	},
	//* Robust CSV tokenizer. Returns an array of rows, each an array of field strings.
	parseCsv: function(inText) {
		var rows = [], row = [], field = "", inQuotes = false;
		var i = 0, len = inText.length, c;
		while (i < len) {
			c = inText.charAt(i);
			if (inQuotes) {
				if (c === '"') {
					if (inText.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
					inQuotes = false; i++; continue;
				}
				field += c; i++; continue;
			}
			if (c === '"') { inQuotes = true; i++; continue; }
			if (c === ',') { row.push(field); field = ""; i++; continue; }
			if (c === '\r') { i++; continue; }
			if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
			field += c; i++;
		}
		if (field.length > 0 || row.length > 0) {
			row.push(field);
			rows.push(row);
		}
		return rows;
	}
});
