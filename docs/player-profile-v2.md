# Player profile v2 rollout

## Preview
/player-profile-v2?player=casey-dipaolo-32

This is a public, unlinked preview, not an access-controlled page. It has a noindex robots directive. Navigation, the original profile, intake page, existing data and Apps Script deployments are unchanged.

## Implemented
- Existing profile service and field mapping, visual styling, shared header/footer.
- Missing player parameter and failed/timed-out requests dismiss the loading overlay.
- Additive approved Drive video gallery: hidden when no compatible media exists.
- Safe DOM text rendering and validated Drive IDs for new gallery content.
- No sign-in, claim, edit or upload controls are enabled without server authorization.

## Video response contract
The existing public player response may add a videos array without breaking legacy clients:

```json
{
  "ok": true,
  "player": {
    "videos": [
      {
        "videoId": "stable-internal-id",
        "driveFileId": "actual-drive-file-id",
        "title": "Fielding highlights",
        "category": "Fielding",
        "recordedDate": "2026-10-29",
        "caption": "",
        "sortOrder": 0,
        "status": "approved"
      }
    ]
  }
}
```

The public service must return only published profile data and approved media. Browser status filtering is not security. Do not return drafts, invitation tokens, private guardian details or moderation notes. Videos require appropriate Workspace external sharing and Drive processing before publication. Drive embeds have browser/cookie and unsigned-viewer playback limits; test signed-out playback and keep the Open video fallback.

## Next backend milestone
Use a permanent playerId distinct from names, jerseys and slugs. Preserve existing slug URLs through an alias mapping.
- PlayerAccess: playerId, authenticated user ID, role, grant/revocation timestamps.
- ClaimInvitations: playerId, designated verified email, hashed single-use token, expiry, accepted timestamp. Admin review for unmatched email claims.
- ProfileRevisions: revisionId, playerId, base published revision, structured changes, draft/submitted/approved/rejected state, submitter, timestamps, reviewer and review notes.
- PlayerMedia: videoId, playerId, Drive fileId, metadata, revision association, moderation state. Keep pending uploads private.
- AuditLog: access grants, submissions, approvals, rejections, media changes.

Verify authentication and active PlayerAccess on every private read, write and upload request. Role checks and moderation state transitions must be server-side. Identity tokens should be verified by a supported backend. Never trust an email, playerId, role or status supplied by the browser. Keep service credentials off GitHub and out of client JS.

Drafts must not overwrite published records. Submission freezes the reviewed revision; approval checks its base version to prevent stale overwrites. Publish exactly the approved revision. Public output excludes unpublished removals/additions. Allow immediate consent withdrawal/unpublishing through an authorized route.

Large video uploads should use scoped resumable Drive uploads initiated by the backend, with file type/size validation, quota controls and ownership checks. The backend confirms the resulting file belongs to the authorized player and intended storage location. Never expose broad Drive credentials.

## Apps Script projects supplied by site owner
- Calendar: 1LQhGjQhIHNIQGgEEO1nHgEx64PvB-WqxnlJMq1bJeYkt96LNj5GHxia8
- Recruit intake: 1EvATP6ZHSAn6iTg0C-jrA5LCKVmiQWnJjvdOdNs9-j4yVRL8Y-v8xk5_
- Gallery: 19GwZfQi3uNmGFjWKeuUhGZzGpHJXtjRNmhOuxz7ibqEMXK9-OnBykMvA

Project source was not present in the repository during this change. Project editor links alone do not supply executable source or deploy permissions. Inspect the actual intake implementation before adding new actions; preserve all existing request/response contracts. Calendar and site gallery do not need changes for the initial profile work.

## Acceptance checks for the next milestone
- Unauthorized accounts cannot read or modify another player's draft or obtain upload access.
- Invitation email verification, expiry, single use, and manual claims tested.
- Two guardians and multiple children supported.
- Parents see current values and can save/reopen drafts.
- Pending changes and uploads remain absent from public API and public Drive access.
- Approving one frozen revision does not publish later edits.
- Rejected changes preserve the live profile.
- Legacy intake/profile/calendar/gallery behavior remains functional.

