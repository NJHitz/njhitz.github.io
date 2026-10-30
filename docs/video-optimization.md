# Free browser-side video optimization

The Manage Profile upload workflow converts every accepted MP4, MOV or WebM clip on the uploader's device before invoking the existing authenticated upload endpoint. No Cloud Run, billable proxy, external conversion account or uploaded media sent to a CDN is involved. Drive remains the file store. The user's browser downloads the pinned single-thread FFmpeg processor from jsDelivr; first use downloads about 32 MB of processor assets.

## Output

- MP4 container with `+faststart`, H.264 Main level 4.0, yuv420p, AAC stereo at 128 kb/s if audio exists.
- Preserve aspect ratio, cap the long edge at 1280 pixels without upscaling, even dimensions, 30 fps.
- Strip embedded source metadata; clip title/category/caption remain the explicit profile fields.
- Input and output each must fit the existing 25 MiB restriction. A conversion failure, cancellation, timeout, unsupported device or output over the limit stops before any file upload. No raw HEVC bypass is silently used.
- Browser work runs in a worker. The screen reports processor loading, conversion progress and output verification. Cancel terminates the worker; sign-out or account change aborts conversion.
- After conversion, verify the H.264 video track and dimensions with FFprobe. Upload only the converted `video/mp4` file. The backend's existing identity, owner access, upload signature/size checks and private-draft/staff-review policy remain authoritative.
- Conversion uses the device's memory/CPU and may take several minutes. Low-memory phones may need a shorter clip or desktop browser. The limit and failure messages make this explicit.

## Modules

- `scripts/video-optimizer.mjs`: lazy processor download, SHA-256 checks, conversion, verification and cleanup.
- `scripts/vendor/ffmpeg-0.12.15/`: unmodified MIT wrapper and worker files, locally served so the module worker is same-origin.
- Core: `@ffmpeg/core` 0.12.10, ESM single-thread build; no SharedArrayBuffer or COOP/COEP dependency.
- `tools/video-optimizer-check.html`: unlinked/noindex local-processing test tool. It uploads no clip and writes no profile data.

## Existing clips

Replacing an original with a compatible MP4 requires approval and a backup first. Preserve the existing Drive ID to retain profile links and sharing settings. Do not bulk-replace other media without explicit instructions. The public player automatically falls back to Drive's preview for originals that expose no decodable picture in the browser.

## Verification

Unit tests cover input/output limits, H.264/AAC/faststart encoding settings, cancellation and the existing profile workflow. The existing 42.8-second 1280x720 HEVC/AAC clip was backed up, converted and verified playing in the live custom player. The browser upload optimizer was verified with a three-second extract of that source: H.264 output decoded at 1280x720, with successful completion and cancellation checks. Physical iOS/Android devices have not been tested. No extra test draft or approval email is needed for the conversion-only test.
