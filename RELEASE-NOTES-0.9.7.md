# Atlas Web — Release Notes 0.9.7

Adds real motion & orientation sensor support on top of 0.9.6.

## 🧭 Motion & orientation sensors
- **DeviceOrientation** — now full **3-axis**: β/γ tilt from the accelerometer plus a **tilt-compensated
  compass heading (α)** derived from the magnetometer. Events fire with live data as you tilt/turn the
  device, and no longer freeze on portrait rotation.
- **DeviceMotion** — `accelerationIncludingGravity` + `rotationRate` from the real accelerometer + gyroscope.
- **Generic Sensor API** — `Accelerometer`, `Gyroscope`, `Magnetometer`, and `LinearAccelerationSensor`
  (`new Accelerometer(); s.start(); s.onreading = …`), backed by the same live sensor stream. Not stubs —
  they deliver real readings. (html5test **Sensors 5/5**.)

### How it works
A small system-glibc helper daemon (`atlas-sensord`) reads the TouchPad's HAL sensors (accelerometer,
gyroscope, magnetometer, linear acceleration) — which the browser engine's private glibc can't reach — and
streams them to the engine, which feeds the web APIs. The daemon autostarts on boot.

### Note
The compass heading tracks rotation correctly but its absolute "north" reference may be offset until the
magnetometer is calibrated (uncalibrated eCompass).

## Requirements
Unchanged from 0.9.6: community **OpenSSL 1.1** (`/usr/lib/ssl11`) and the device Adreno GL driver. Install
with Preware / WebOS Quick Install (runs postinst). Never touches the stock Palm BrowserServer / WebKit.
