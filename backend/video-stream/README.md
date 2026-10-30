# NJ Hitz video streaming service

Status: implemented and locally tested; **not deployed or live-validated**. The website retains Drive embeds until `videoStreamBase` is configured. Do not activate it before the checks below pass.

The custom HTML5 player (`scripts/profile-video-player.js` and `.css`) uses only in-video controls. Controls auto-hide after 1.2 seconds while playing, a tap toggles them immediately, and pausing/seeking keeps them available. Nearby clips automatically prepare metadata with IntersectionObserver. It supports inline mobile playback, keyboard controls, scrubbing, sound, replay, native fullscreen where available and an in-page fullscreen fallback. No Load/Expand/Stop buttons appear outside the footage.

## Data path

Browser -> `GET /v1/video/{player-slug}/{Drive-file-ID}` -> existing public Apps Script profile projection -> Drive API metadata + media.

Each request verifies the exact clip is currently published as approved for that player. Draft clips, arbitrary upstream URLs and arbitrary Drive files cannot be requested. The endpoint uses a server-side API key restricted to the Drive API to read **already public** approved files; it does not grant access to the organization's private Drive. This access path must be verified with the real project/key and an actual approved clip before rollout.

- GET and HEAD; single bounded/open/suffix byte ranges, HTTP 206/416 and Content-Range.
- 25 MiB per file; MP4, WebM and MOV metadata allowlist. MOV/HEVC and other codecs may fail on some devices; the internal error panel offers the working Drive player as a fallback. MP4 with H.264/AAC is preferred for compatibility. No transcoder is included.
- Byte streams use backpressure, abort on disconnect and timeout at 90 seconds.
- API key stays on the server. No Google account tokens, credentials, secret URLs or upstream error payloads are returned to viewers.
- CORS permits only njhitz.org and www.njhitz.org. CORS is not an authentication or anti-hotlinking boundary; approved media is already public.
- No publication cache: each range request rechecks approval. Active playback requests already in progress can finish if a moderator subsequently removes a clip.
- `/healthz` reports configuration only, not Drive connectivity. Deployment is not considered verified merely because health returns 200.

## Deployment prerequisites (NJ Hitz Org / nj-hitz-org)

1. An authorized Google Cloud session and a project with billing already enabled. Do not attach a billing account or change billing without the owner's approval. Cloud Run, builds, registry, Secret Manager and network traffic can incur charges; zero minimum instances is not a guarantee of zero cost.
2. Enable Cloud Run, Cloud Build, Artifact Registry, Google Drive API and Secret Manager as required by the chosen deployment method.
3. Create a **dedicated server API key restricted to Google Drive API**. Do not reuse the Firebase browser key. Store it directly in Secret Manager as `njhitz-drive-api-key`; do not paste it into chat, commit it, put it in a public environment file, or print it in logs. Restrict quotas to the expected traffic.
4. A dedicated runtime service account, e.g. `njhitz-video-stream@nj-hitz-org.iam.gserviceaccount.com`, with Secret Accessor on that one secret. It needs no Drive folder share, no domain-wide delegation and no project Editor role. Builder/deployer IAM must follow the Cloud Run source-deployment docs. No credentials file is needed in the container.
5. Existing moderation grants Anyone-with-link view to approved files. Confirm that API-key access to the actual approved file supports metadata and `alt=media` ranges. If the organization's policy prevents it, keep the feature disabled and design a separately approved scoped authentication path; do not widen Workspace or Drive permissions automatically.

## Deployment command

From the repository root in an authorized Cloud Shell, after the prerequisites above are fulfilled:

```bash
gcloud run deploy njhitz-video-stream \
  --project nj-hitz-org \
  --region us-central1 \
  --source backend/video-stream \
  --service-account njhitz-video-stream@nj-hitz-org.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --concurrency 8 \
  --cpu 1 \
  --memory 256Mi \
  --timeout 90 \
  --set-secrets DRIVE_API_KEY=njhitz-drive-api-key:latest
```

This is a public endpoint serving only already-public approved clips, with no private-profile actions. Confirm the public service configuration and secret access before executing deployment. The two-instance bound limits scaling but is not a spending cap or global rate limit. Configure quota/budget alerts; alerts do not stop charges.

`PROFILE_ENDPOINT` defaults to the existing NJ Hitz v2 Apps Script deployment and can be set to another trusted script.google.com `/macros/s/.../exec` endpoint. Do not configure an arbitrary URL. There are no other required runtime variables besides `DRIVE_API_KEY` and Cloud Run's `PORT`.

## Required rollout checks

Use an actual approved MP4, with this currently approved example (recheck the public profile first):

- Player slug: `leah-taylor-31`
- File ID: `1AT0Hf3J16sM2EmcqUbyMsPU1vET1XNmm`

With the Cloud Run URL returned by deployment:

```bash
stream_origin='https://ACTUAL-SERVICE-URL.run.app'
curl --fail --head "$stream_origin/v1/video/leah-taylor-31/1AT0Hf3J16sM2EmcqUbyMsPU1vET1XNmm"
curl --fail --range 0-1023 --output /tmp/njhitz-video-range.bin --dump-header /tmp/njhitz-video-range.headers "$stream_origin/v1/video/leah-taylor-31/1AT0Hf3J16sM2EmcqUbyMsPU1vET1XNmm"
```

Check 200 HEAD / correct media type and length, then 206 with exactly 1024 bytes and `Content-Range`. Test suffix and unsatisfiable ranges. Confirm a draft ID and an unrelated public Drive ID return 404. Never bypass the approval check for testing. Check that API keys are absent from client requests and responses.

Only then set `videoStreamBase` in `scripts/profile-v2-config.js` to the actual HTTPS service origin and bump that config script's cache version in `player-profile-v2.html`. Verify playback, seek near the end before full download, replay, mute, tap-to-hide, 1.2-second auto-hide, rotation, fullscreen/exit, keyboard controls and fallback in iOS Safari and Android Chrome. Check multiple clips, poor network recovery and removal of a published clip. Keep the legacy v1 page untouched.

Rollback: set `videoStreamBase` back to `''` and bump the config cache version. The v2 page returns to the original Drive preview. Do not delete any Drive files.

## Local tests

```bash
node --test backend/video-stream/test/*.test.mjs
node --test tests/*.test.cjs
```

Stream tests use mocked Drive/profile responses over a real local HTTP server. Player tests simulate browser media events. They verify implementation logic, not real Drive API access, codecs, browser rendering or physical-device playback.
