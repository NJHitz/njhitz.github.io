# FFmpeg.wasm

Unmodified JavaScript ES module wrapper from `@ffmpeg/ffmpeg` 0.12.15 (MIT).
Copyright (c) 2019 Jerome Wu. See LICENSE.
Source: https://github.com/ffmpegwasm/ffmpeg.wasm
NPM package: https://www.npmjs.com/package/@ffmpeg/ffmpeg/v/0.12.15

The separate single-threaded core is loaded on demand, unmodified, from jsDelivr's pinned `@ffmpeg/core` 0.12.10 distribution. The JS and WebAssembly downloads are SHA-256 checked against the official npm package before execution. They are not stored in this repository. Video data is processed locally and is not sent to jsDelivr.

The core contains FFmpeg and libraries including x264, under their respective licenses, including GPL. Upstream source/build instructions and license information:
- https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10
- https://github.com/ffmpegwasm/ffmpeg.wasm/blob/main/apps/website/docs/faq.md
- https://ffmpeg.org/legal.html
