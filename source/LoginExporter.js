//   CSV exporter for saved web logins (org.webosports.logins:1). Writes a Chrome / Google Password
//   Manager compatible file (header: name,url,username,password) to a fixed device path
//   (default /media/internal/atlas-logins.csv, which is app-accessible AND the same path LoginImporter
//   reads), so the export round-trips back through import. The file is written with a file:// PUT XHR
//   (the webOS write counterpart of LoginImporter's file:// GET).

enyo.kind({
	name: "LoginExporter",
	kind: enyo.Component,
	published: {
		filePath: "/media/internal/atlas-logins.csv",
		dbKind: "org.webosports.logins:1"
	},
	events: {
		//* onExportDone(inSender, inResult) where inResult = {count, path, ok, error}
		onExportDone: ""
	},
	components: [
		{name: "loginsService", kind: "DbService", dbKind: "org.webosports.logins:1"}
	],
	//* @public
	run: function() {
		// Re-entry guard: the toolbar button can fire twice (touch+mouse) — ignore a run in progress.
		if (this.exporting) {
			return;
		}
		this.exporting = true;
		// db8 (webOS 3.0.5) caps the query "limit" at 500.
		this.$.loginsService.call({query: {limit: 500}}, {method: "find", onSuccess: "gotRows", onFailure: "dbFailure"});
	},
	//* @protected
	gotRows: function(inSender, inResponse) {
		var rows = (inResponse && inResponse.results) || [];
		var csv = this.buildCsv(rows);
		var self = this;
		enyo.xhr.request({
			url: "file://" + this.filePath,
			method: "PUT",
			body: csv,
			callback: function(inText, inXhr) {
				self.exporting = false;
				// file:// writes report status 0 on success (no HTTP status); 2xx if a status is present.
				var st = inXhr ? inXhr.status : 0;
				var ok = (st === 0 || (st >= 200 && st < 300));
				self.doExportDone({count: rows.length, path: self.filePath, ok: ok,
					error: ok ? "" : ($L("Could not write ") + self.filePath)});
			}
		});
	},
	dbFailure: function(inSender, inResponse) {
		this.exporting = false;
		this.doExportDone({count: 0, path: this.filePath, ok: false,
			error: (inResponse && inResponse.errorText) || $L("Database error")});
	},
	//* One CSV field: quote + escape if it contains comma, quote or newline (RFC-4180).
	csvField: function(inVal) {
		var v = (inVal == null) ? "" : ("" + inVal);
		if (/[",\n\r]/.test(v)) {
			v = '"' + v.replace(/"/g, '""') + '"';
		}
		return v;
	},
	//* Build the CSV text (Chrome-compatible column order) from the login rows.
	buildCsv: function(inRows) {
		var out = ["name,url,username,password"];
		for (var i = 0; i < inRows.length; i++) {
			var r = inRows[i];
			out.push([
				this.csvField(r.title || r.host || ""),
				this.csvField(r.url || ""),
				this.csvField(r.username || ""),
				this.csvField(r.password || "")
			].join(","));
		}
		return out.join("\r\n") + "\r\n";
	}
});
