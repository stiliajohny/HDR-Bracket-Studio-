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
