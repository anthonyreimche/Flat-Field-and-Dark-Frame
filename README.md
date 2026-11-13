# Flat Field & Dark Frame

A Safelight extension that calibrates RAW photos with frames you shoot for the purpose.

- **Dark frame subtraction** takes out hot pixels, amp glow, banding and other fixed-pattern noise. Shoot one or more frames with the lens cap on, at the ISO, exposure time and (if you can) sensor temperature of your photos.
- **Flat-field correction** takes out lens falloff, colour shading in the corners and dust shadows. Shoot one or more frames of an evenly lit, featureless target with the lens, aperture and focal length of your photos.

Several frames of each make a cleaner master. Needs Safelight 3.2.4 or later.

## Using it

1. In Develop, open the **Flat Field & Dark Frame** panel and click **Calibration library…**.
2. **Add dark frames…** or **Add flat frames…** and pick the RAW files. They must come from one camera at one frame size, and flats from one lens. The library builds a master and shows what it was made from: camera, lens, aperture, focal length, ISO, exposure, temperature, date, the black level used, and how many hot pixels were found or how far the corners are lifted.
3. Turn on **Dark frame** and **Flat field** for a photo. **Automatic** picks the best master: the same camera and frame size, then for darks the nearest ISO, exposure time and temperature, and for flats the same lens and the nearest aperture and focal length. Pick a master by hand to override it for that photo. When nothing fits, the panel says why.
4. For the flat, **Blur** and **Blur radius** choose how much of it is used: a large radius corrects only the falloff, a small one also takes out dust spots. Vertical, horizontal and vertical + horizontal blurs keep line patterns in the flat. **Clip control** keeps the flat from lifting highlights past white.

To calibrate many photos at once, select them in the Library, right-click and choose **Match calibration frames**. Each RAW with a matching master gets both corrections, as one undo step. Photos never opened in Develop are left alone; open them once first.

Corrections are stored with each photo's edit, so undo, copy and paste, thumbnails and exports all carry them. Masters are kept in the app's local storage, not beside your photos. Turned off, the extension costs nothing.

## What it works on

RAW photos with a Bayer or X-Trans sensor. JPEG, TIFF and other rendered files have no sensor data left, and the panel says so. Monochrome, Foveon and linear (already demosaiced) DNG files are not supported.

Safelight hands extensions the RAW after demosaicing, so the corrections are made there, in the camera's own colour channels and sensor units:

- The decode's baseline tone, camera matrix and white balance are undone, the correction is made, and they are applied again. The matrix and white balance come from the photo's own file.
- The black level comes off once: the dark's signal above black is subtracted, never the black level itself. A body that keeps its black per channel in a masked border (Canon, for example) has it measured there.
- A hot pixel has already bled into its neighbours by the time the photo is decoded, so it is repaired from the pixels around it rather than subtracted.
- Banding finer than a few sensels can't be kept in the flat master, which is stored at about 768 blocks across.
- For an X-Trans flat the colour layout is worked out from the frame itself; when red and blue read too alike to tell apart, the library says so and corrects their shading together.

## Credits

The behaviour follows RawTherapee's dark frame and flat field tools (© the RawTherapee developers, GPL-3.0-or-later): subtracting the dark's signal above black, the flat's area, vertical, horizontal and vertical + horizontal blurs, normalizing to the frame's centre, and the matching rules.

Calibration frames and photos' sensor details are read with [LibRaw](https://www.libraw.org/) (LGPL-2.1 or CDDL-1.0) through [libraw-wasm](https://github.com/ybouane/LibRaw-Wasm) (ISC), shipped in `dist/libraw`.

## Development

`npm run check` typechecks, builds and runs the unit tests. `npm run test:gpu` runs the stage's GLSL on Safelight's WebGL test harness (headless Chromium on SwiftShader) against the CPU model; it needs a SafeLight checkout beside this folder or at `SAFELIGHT_CORE`.

Licensed under the GNU GPL v3 or later.
