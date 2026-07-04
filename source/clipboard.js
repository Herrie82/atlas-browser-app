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

enyo.setClipboard = function(inText) {
	var n = document.createElement("textarea");
	n.style.cssText = "position: absolute; height: 0px; width: 0px;";
	n.value = inText;
	document.body.appendChild(n);
	n.select();
	document.execCommand("cut");
	document.body.removeChild(n);
}

// Read the system clipboard: paste into a throwaway textarea and read it back. Works here because this
// runs in LunaSysMgr's (trusted) WebKit where execCommand("paste") isn't blocked.
enyo.getClipboard = function() {
	// A real (tiny, transparent) focusable textarea — a 0x0 one won't accept the paste. Focus + select it,
	// capture the "paste" event's clipboardData, and also read back the value as a fallback.
	var n = document.createElement("textarea");
	n.style.cssText = "position: fixed; left: 0px; top: 0px; width: 4px; height: 4px; opacity: 0; z-index: -1; border: 0; padding: 0;";
	n.value = "";
	document.body.appendChild(n);
	var v = "";
	var onPaste = function(e) {
		try {
			var cd = e.clipboardData || window.clipboardData;
			if (cd) { v = cd.getData("text/plain") || cd.getData("Text") || ""; }
		} catch (err) {}
	};
	n.addEventListener("paste", onPaste, true);
	n.focus();
	n.select();
	try { document.execCommand("paste"); } catch (e) {}
	n.removeEventListener("paste", onPaste, true);
	if (!v) { v = n.value || ""; }
	document.body.removeChild(n);
	return v;
}