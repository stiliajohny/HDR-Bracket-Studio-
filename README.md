# HDR Bracket Studio

Tauri 2 + React + Rust scaffold for a Lightroom-inspired desktop HDR workflow.

## Implemented
- Recursive folder scan for common DSLR RAW / JPEG / TIFF extensions
- EXIF metadata extraction via external ExifTool
- Exposure-value calculation (EV100)
- Non-overlapping bracket suggestions for 3, 5 or 7 frames
- Configurable capture window and minimum EV span
- Selection/review UI and unmatched-photo list
- Read-only operations: **original photographs are not modified**

## Requirements
- Node.js 20+ and npm
- Rust toolchain and Tauri 2 OS dependencies
- ExifTool available on PATH

## Run
```bash
npm install
npm run tauri dev
```

## Current limitations
This is an EXIF metadata grouping prototype. Image thumbnails, exposure-invariant similarity, RAW decoding, alignment, deghosting, HDR fusion and export are not implemented. Confidence scores are heuristics, not calibrated probabilities.
