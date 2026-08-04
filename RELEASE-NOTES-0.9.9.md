# Atlas Web — Release Notes 0.9.9

A fresh-install fix. If 0.9.8 installed and browsed fine for you, this changes nothing you will notice —
but if you hit a browser that opened and then rendered nothing, this is the fix.

## 🩹 Fresh installs could land without the GPU driver

On some devices, installing 0.9.8 left the engine's library directory without `libEGL.so.1` and
`libGLESv2.so.2`. The browser started, the card opened, and no page ever rendered.

The installer copies the device's own Adreno driver into the app's library directory under the names the
engine links against. It did that with a plain `cp` and never checked the result, so on any device where
the expected source file was absent the copy failed **silently** and the install completed "successfully"
with no GPU driver in place.

Three changes, all in the installer and the packaging:

- **Falls back to the bundled copy.** The package already carries the driver, so if the device's copy
  cannot be read the installer uses that instead of leaving the directory empty.
- **Stages the unversioned `libEGL.so`.** The vendor GLESv2 blob asks for the *unversioned* name, and up
  to now that only resolved by luck — either the versioned library happened to satisfy it, or the loader
  fell through to a system path that not every device has. It is now staged locally, so neither is needed.
- **Says so when something is wrong.** Missing driver files are now reported in the install log instead
  of passing quietly, and the package build itself refuses to produce an ipk that lacks them.

## Requirements

Unchanged from 0.9.8: community **OpenSSL 1.1** (`/usr/lib/ssl11`) and the device Adreno GL driver.
Install with Preware / WebOS Quick Install (runs postinst). Never touches the stock Palm
BrowserServer / WebKit.
