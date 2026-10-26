# HDR Bracket Studio

Tauri 2 + React + TypeScript + Rust starter for importing DSLR exposure brackets and suggesting HDR groups.

## Features
- Recursive DSLR photo folder scan (RAW, JPEG, TIFF)
- EXIF extraction using ExifTool
- Exposure value (EV100) calculation
- Automatic grouping of 3, 5 or 7-frame exposure brackets
- Configurable time window and EV span
- Review of candidate stacks and unmatched images
- Read-only import (originals are not modified)

## Run

Requires Rust, Node.js, npm, ExifTool and Tauri platform dependencies.

```bash
npm install
npm run tauri dev
```

## Status
Starter scaffold only. RAW decoding, alignment, HDR merging, deghosting and export are planned, not yet implemented.
