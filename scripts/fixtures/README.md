# Synthetic darktable sigmoid reference

`sigmoid-gradient.tif` is a synthetic 128×512, 32-bit floating-point linear RGB ramp. Every row is neutral; its scene value sweeps from −12 EV to +8 EV around 18% gray. It contains no photograph or screenshot.

The adjacent XMP sidecar explicitly enables darktable 5.6.2's default sigmoid parameters (contrast 1.5, skew 0, white target 100%, black target 0.0152%). The fixture is used only by `npm run test:tone:reference`, which renders it with an isolated temporary darktable configuration and compares decoded 16-bit sRGB pixels against the curve implemented in `public/js/renderer.js`.

The CLI output is left in the system temporary directory for inspection. No project image, user darktable database, or screen capture is used.
