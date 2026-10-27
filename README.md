# HDR Bracket Studio

## Downloads

**[Download HDR Bracket Studio — latest release](https://github.com/stiliajohny/HDR-Bracket-Studio-/releases/latest)** · [All releases and changelogs](https://github.com/stiliajohny/HDR-Bracket-Studio-/releases) · [Web application](https://stiliajohny.github.io/HDR-Bracket-Studio-/)

Desktop release assets are automatically attached after the release pull request is merged:

| Platform | Package |
| --- | --- |
| Windows x64 | NSIS setup `.exe` |
| macOS Apple Silicon | `.dmg` |
| macOS Intel | `.dmg` |
| Linux x64 | `.AppImage` and `.deb` |

The desktop installers are currently **unsigned/unnotarized** and ExifTool
is a separate runtime prerequisite for desktop EXIF scanning.

### Conventional releases

Release Please opens a version-bump pull request when Conventional Commits
land on `master`. Merge that **release PR** to create a GitHub Release with
automatically generated release notes and `CHANGELOG.md`, and build the four
desktop installer variants in the **same Actions workflow**.

- `feat: add <feature>` → minor version bump
- `fix: correct <bug>` → patch version bump
- `feat!: change <contract>` → major version bump
- `docs:`, `chore:` → normally no application version bump

Package, Tauri and Cargo versions are updated together by Release Please.

Setup prerequisite: in **Settings → Actions → General → Workflow permissions**,
enable **Allow GitHub Actions to create and approve pull requests**. Enable
read/write `GITHUB_TOKEN` workflow permissions if repository or organisation
policy restricts them.

The first new release is prepared from the current `0.1.0` code baseline.
Releases are **not** published for every push: they become available when
a proposed release PR is merged and the installer jobs succeed.


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

Desktop EXIF scanning requires ExifTool on PATH. JPEG, PNG, WebP and camera DNG frames are usable in both targets. DNG development runs locally using LibRaw WebAssembly; other proprietary RAW formats are metadata-only for now.

## Desktop/web feature parity

The **same** `src/main.tsx` React interface, `src/platform.ts` grouping algorithm,
and `src/hdr.ts` HDR engine are used for website and Tauri builds.

- Website: browser directory picker and `exifr` for EXIF; LibRaw WebAssembly for DNG development.
- Desktop: native directory picker and ExifTool for metadata; read-only
  JPEG/PNG/WebP/DNG access restricted to the selected folder, so previews and merge
  run without a second manual file-selection step.
- Both: stack selection, thumbnail/filmstrip preview, Auto Align, Auto Tone,
  deghosting, exposure/highlight controls, JPEG and .hdr export.
- DNG RAW input is automatically developed in both targets for preview and merging; other camera RAW formats are metadata-only.
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

## EXIF placement, manual resizing and ribbon

The **EXIF on Photo** settings offer nine placement anchors (3×3): all four
corners, top/bottom centre, middle-left/middle-right and image centre.
Select **Bottom ribbon** to render a full-width dark strip along the *bottom
of the photograph*, independent of the nine anchors.

Choose Small/Medium/Large text or adjust the **Manual size** slider from
0.5% to 5.0% of image width (0.1% steps). The same relative scale is used
in the live photo preview and in the exported JPEG. JPEG export burns the
EXIF ribbon/text into a copy; no source or Radiance HDR data is changed.

## Live HDR image adjustments

The right-side **Image adjustments** panel now offers Brightness, Contrast,
Highlights, Shadows, Saturation and Temperature (cool/warm), each adjustable
from -100 to +100, plus **Reset**. Once a stack has been merged, the tone-mapped
HDR preview updates immediately without recomputing exposure alignment or
radiance fusion. The preview uses a maximum-width 1600px canvas for responsiveness;
JPEG export replays the same pixel transform at the selected full output size.

Adjustments are non-destructive and operate on the displayed SDR rendition.
The Radiance `.hdr` export stays unmodified. When enabled, the EXIF stamp is
drawn **after** the colour/tone adjustments during JPEG export.

The EXIF on Photo panel also includes **Show field labels**. Disable it to
display values such as `Sony A7 IV` and `100` instead of `Camera: Sony A7 IV`
and `ISO: 100`. The option applies to live on-photo text and JPEG export,
including the bottom ribbon layout.

Web and Tauri continue to use the same shared React and canvas implementation.

## DNG camera RAW support

**DNG is supported in the web app and Tauri desktop app.** Import a folder
containing exposure-bracketed `.dng` camera files and click **Find HDR
stacks**. Once a stack is selected, HDR Bracket Studio reads the original DNG
frames and develops them **locally** using a LibRaw WebAssembly worker
(`rawconvert-wasm`). Demosaicing, camera white balance and sRGB rendering run
on the device; the developed frames appear in the filmstrip and can be merged
with the existing HDR tools. The originals are never changed or uploaded.

The Tauri side uses `read_dng_photo` to transfer the original DNG via
binary IPC, limited to 256 MiB and restricted to the folder the user
explicitly scanned. Both targets use the exact same `src/dng.ts` decoder.
The `scripts/prepare-raw.mjs` build step copies the decoder's WASM and
worker assets to the appropriate public path, including the GitHub Pages
repository subpath.

### RAW quality and constraints

- **Actual RAW decode, not just an embedded preview:** LibRaw unpacks and
  demosaics the selected DNGs.
- **Current intermediate is half-resolution 8-bit sRGB.** The HDR merge
  normalises exposure and combines developed pixels; this is **not yet a
  true linear 16-bit RAW HDR merge or Lightroom HDR DNG equivalent**.
- DNG variants or cameras not recognised by the bundled LibRaw version may
  fail with a per-file error. EXIF capture time, aperture, shutter and ISO
  must be readable for automatic bracket grouping.
- Large RAW files are memory intensive. If development fails, try smaller
  DNGs or convert to JPEG externally and keep EXIF metadata.
- DNG remains input-only: exported results are SDR JPEG and Radiance
  `.hdr`. A DNG output/exporter is not provided.
- Other proprietary camera RAW formats (CR2, CR3, NEF, ARW etc.) remain
  metadata-scannable but do not use the DNG decoder in this release.

### Developing and building

```sh
npm install
npm run dev             # Copies the LibRaw assets and starts the web frontend
npm run build:web       # Includes WASM in the GitHub Pages dist output
npm run tauri dev       # Uses the same RAW decoder inside Tauri
npm run tauri build     # Generates icons and bundles RAW WASM assets
```

The bundled LibRaw library has its own upstream licensing terms (LGPL/CDDL).
Review the upstream license and distribution requirements when shipping
commercial binary releases.

## Fit-to-screen, zoom and navigator (web and Tauri)

The central image viewer uses decoded image dimensions to detect portrait,
landscape, square and panoramic aspect ratios automatically. **Fit** is the
default each time you select another photo/stack or switch between the
original and merged HDR result: the largest dimension fits the available
viewport without cropping or distorting the photo.

- **Mouse wheel / trackpad scroll:** zoom in or out around the pointer.
- **+ / − buttons:** zoom by 1.4×; the numeric display shows the approximate
  image-pixel percentage, not merely the multiplier over Fit.
- **Fit (F or 0):** restore the complete image and centre it.
- **100%:** show actual image pixels where available (up to the 32× limit).
- **Double-click:** jump between Fit and a 2× zoom.
- **Drag:** pan a zoomed photo, constrained so the image remains in the viewport.
- **Navigator / minimap:** always visible at the lower right, with a
  highlighted rectangle representing the viewport. Click or drag inside the
  navigator to pan the image. Arrow keys can also move the visible area.
- **Keyboard:** while the viewer is focused, F/0 to fit, +/− to zoom, and
  arrow keys to pan.

The same `src/PhotoViewport.tsx` is used in the web and Tauri interfaces.
It supports imported JPEG/PNG/WebP images, developed DNG previews, and
tone-mapped HDR output with live image adjustments and anchored EXIF overlays.
Zoom and pan affect the preview only; JPEG/HDR output dimensions do not
change with navigation.
