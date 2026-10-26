# HDR Bracket Studio

One React + TypeScript UI for **Tauri 2 desktop** and **GitHub Pages website**, with a platform-specific photo-import/EXIF adapter.

## Website
The site runs entirely in the browser and does not upload photographs to any server. Select a folder using the browser's directory picker. Uses `exifr` to extract supported metadata. Browser RAW EXIF support varies by format and file. Unreadable images appear as unmatched.

```bash
npm install
npm run dev
npm run build:web
```

Production URL (after enabling Pages): https://stiliajohny.github.io/HDR-Bracket-Studio-/

Set **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow `.github/workflows/pages.yml` deploys on pushes to `master`.

## Desktop
Requires Rust, Tauri OS dependencies and ExifTool on PATH.

```bash
npm install
npm run tauri dev
```

## Shared features
- Import photo folders and inspect metadata
- Suggest 3, 5 or 7 exposure stacks
- Capture-time and EV-range settings
- Review / select groups and inspect unmatched images
- Read-only processing (never modifies originals)

## Limitations
This remains a **bracket detection prototype**. Neither target implements HDR merging, alignment, RAW development, thumbnails or exporting. The two metadata adapters differ (ExifTool on desktop and exifr in browser) and may recognize different RAW formats; grouping follows the same heuristic. Confidence scores are not calibrated probabilities.
