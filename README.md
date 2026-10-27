# HDR Bracket Studio

One React application for Tauri 2 and GitHub Pages, with browser EXIF and desktop ExifTool adapters.

## HDR merge engine
1. Exposure normalization from EXIF EV100 or shutter times
2. Approximate linearization of sRGB JPEG/PNG values
3. Optional median-threshold bitmap translation alignment
4. Exposure-weighted linear-light radiance merge that rejects clipped inputs
5. Heuristic Low/Medium/High motion deghosting against the reference exposure
6. Auto tone, manual exposure compensation and highlight compression
7. SDR JPEG preview and Radiance RGBE `.hdr` export

All processing is local; originals are not modified.

**Not Lightroom parity:** This is a JPEG-based approximation, not Adobe's proprietary RAW merge. Source JPEGs already contain tone curves/clipping. Auto align corrects translation only, not rotation/parallax. Deghosting is heuristic. Radiance RGBE is HDR but is not a DNG or a full-precision RAW export.

## Run
```bash
npm install
npm run build:web
npm run tauri dev
```

GitHub Pages: https://stiliajohny.github.io/HDR-Bracket-Studio-/

Desktop EXIF import requires ExifTool on PATH. Processing requires browser-decodable JPEG/PNG/WebP in both modes. RAW camera files must be developed externally with EXIF retained.

## Desktop/web feature parity

The **same** `src/main.tsx` React interface, `src/platform.ts` grouping algorithm,
and `src/hdr.ts` HDR engine are used for website and Tauri builds.

- Website: browser directory picker and `exifr` for metadata.
- Desktop: native directory picker and ExifTool for metadata; native read-only
  JPEG/PNG/WebP access restricted to the selected folder, so previews and merge
  run without a second manual file-selection step.
- Both: stack selection, thumbnail/filmstrip preview, Auto Align, Auto Tone,
  deghosting, exposure/highlight controls, JPEG and .hdr export.
- Camera RAW development and DNG merging remain **unsupported on both**.
- Metadata coverage differs between ExifTool and the browser parser; the
  grouping rules and image-merging implementation do not differ.

Desktop requirements: Rust, Tauri system dependencies, and `exiftool` on PATH.
The desktop adapter refuses raster files outside the selected folder and
limits reads to 64 MiB per file.

```bash
npm install
npm run build:web   # GitHub Pages frontend
npm run build       # Tauri production frontend
npm run tauri dev   # Desktop app
```

`.github/workflows/desktop-check.yml` checks the common frontend and Tauri Rust code.

## Metadata inspector (web and Tauri)

The same React EXIF inspector is docked beneath the filmstrip in both targets.
Use **View → Show metadata panel** (or keyboard shortcut **I**) to toggle it.
Use **View → Metadata display → Compact/Detailed**, or the selector on the dock,
to change between basic exposure information and the full capture details.

Visible fields include filename, local capture timestamp, camera, lens, shutter
speed, f-number, ISO, exposure compensation, focal length, EV100 and dimensions
when provided by the source metadata. Missing EXIF values are shown as `—`.
The inspector follows the selected source frame, including while an HDR preview
is open, and never edits the source image.

The application also has shared **File / View / Photo** in-app menus for
importing, detecting, merging and exporting. They are identical in the browser
and Tauri rather than relying on platform-specific native menus.

## EXIF text imprint on the photograph (web and desktop)

Open **Photo → EXIF text on photo…**, or expand **EXIF on Photo** in the
right-hand panel. Enable the overlay to see it on the selected original frame
or merged HDR preview. Select any of four corners on the square location
picker; choose Black/White, White/Black, White text, or Black text, and tick
which EXIF fields should be rendered. Fields missing from the original
metadata are excluded rather than invented.

The overlaid preview is non-destructive and updates without re-merging.
**Export JPEG** embeds the chosen caption in a new image. **Export .HDR**
continues to write the original uncluttered radiance data; source photos
are not modified. For merged images, EXIF fields come from the stack's
middle exposure. This is an on-image caption, not a rewrite of the JPEG
metadata tags themselves.

All formatting and canvas rendering live in `src/ExifOverlay.tsx` and
are shared between the web application and Tauri.

## Tauri application icons and EXIF caption sizes

Tauri application icons (PNG, Windows ICO, macOS ICNS) are generated
automatically from `scripts/generate-icons.mjs` with Node built-ins.
`npm run build` and Tauri's development command run the generator before
Rust compilation. To run `cargo check` independently, run
`npm run generate:icons` at least once first. Generated assets are not
committed because every checkout produces identical files.

In **Photo → EXIF text on photo…**, the Text size control now offers
**Small / Medium / Large**. The same selection immediately updates the photo
preview and the caption embedded into exported JPEGs on web and desktop.
Radiance HDR files remain unaltered.
