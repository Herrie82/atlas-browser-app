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

// NOTE: clipboard access goes through the enyo framework's enyo.dom.setClipboard / enyo.dom.getClipboard
// (the latter uses the platform's async PalmSystem.paste(), which is the only path that reads the SYSTEM
// clipboard cross-app — execCommand("paste") is blocked in the app context). This legacy helper is kept
// for compatibility with any old caller of the bare enyo.setClipboard.
enyo.setClipboard = function(inText) {
	if (enyo.dom && enyo.dom.setClipboard) { enyo.dom.setClipboard(inText); return; }
	var n = document.createElement("textarea");
	n.style.cssText = "position: absolute; height: 0px; width: 0px;";
	n.value = inText;
	document.body.appendChild(n);
	n.select();
	document.execCommand("cut");
	document.body.removeChild(n);
}