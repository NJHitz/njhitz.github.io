# Direct Drive playback: no paid intermediary

Status: code staged, **not live-validated or activated**. The optional `driveVideoApiKey` in `scripts/profile-v2-config.js` is empty, so the existing automatic lazy-loaded Drive iframe remains active. Cloud Run is paused; do not enable billing, Cloud Build, Secret Manager or deploy the video-stream service for this approach.

The browser can attempt to play an approved public file directly via Drive API `files.get?alt=media&key=...` in our existing HTML5 player. This avoids proxying media through a billable server. Google's standard Drive API use is documented as no additional cost, subject to usage limits. API-key authentication supports publicly shared Workspace data. Actual browser playback, seeking, referrer restrictions, media headers, resource keys and codecs still need live verification; this is not a guaranteed streaming service or an assertion that every browser/file will work.

1. In Cloud Shell for the correct project, enable only Drive API:

   `gcloud services enable drive.googleapis.com --project=nj-hitz`

2. Create a NEW key named `NJ Hitz Public Video Player` under APIs & Services -> Credentials. Do not reuse the Firebase key or any server key previously created.
3. Set API restriction to **Google Drive API**. Set application restriction to **Websites**, allowing these referrers:
   - `https://njhitz.org`
   - `https://njhitz.org/*`
   - `https://www.njhitz.org`
   - `https://www.njhitz.org/*`
4. This is a public browser configuration value, visible to website visitors. It identifies API usage; it must not authorize private account data. Never put a service-account key, OAuth token, or server-only credential in this field.
5. Set `driveVideoApiKey` to this restricted browser key. Bump the config script cache version in `player-profile-v2.html` for activation. Test first with an approved clip and a signed-out browser. The site renders native videos only from the backend's approved public video list. Private/draft file sharing must remain private; do not share an entire folder to make playback work.
6. On iOS Safari and Android Chrome, verify metadata preparation near the viewport, playback, immediate tap-to-hide/show, 1.2-second auto-hide, scrub near the end, fullscreen/exit and replay. Test a disabled/restricted key and an incompatible clip: the error overlay must offer the original Drive player.
7. If Drive refuses direct playback, set `driveVideoApiKey` back to `''` and bump the cache version. Do not weaken browser security or key restrictions to make it work. Reassess a genuinely free delivery option within its limits; do not silently reactivate Cloud Run.

Standard API use can hit quota limits and return errors instead of serving the video. This design does not promise unlimited availability. Drive's storage allowance and browser streaming compatibility are separate considerations.

References:
- https://developers.google.com/workspace/drive/api/guides/limits
- https://developers.google.com/workspace/guides/create-credentials
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get
- https://docs.cloud.google.com/docs/authentication/api-keys
