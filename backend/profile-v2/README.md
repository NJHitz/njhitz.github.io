# Family profile workflow (v2 only)

## Delivery status

Implemented source and tests: verified-account sign-in UI, manually reviewed ownership claims, persistent drafts, frozen submissions, per-profile staff moderation, revocation, and a v2-only published projection. **Not activated**: Firebase project configuration and a new Apps Script deployment are still required. No live sheet has been modified by this implementation.

Video uploads, expiring invitation emails, staff-wide queue navigation, and player-slug aliases are later milestones. This phase provides an existing-video-link editor, not direct upload. Do not send invitations or configure broad Drive access as part of initial setup.

## Architecture

- GitHub Pages serves `player-manage-v2.html`. The only link is from the unlisted v2 profile. Neither page is an access boundary; authentication and authorization are enforced by the service.
- Firebase Authentication supports Google sign-in and verified email/password accounts. The browser uses in-memory authentication persistence. No identity tokens or private drafts are stored in localStorage.
- A **new** Apps Script project hosts `Core.js`, `Service.js`, and `appsscript.json`. Do not add duplicate `doGet`/`doPost` functions to the existing intake, calendar or gallery projects.
- The service validates each ID token with Firebase's `accounts:lookup` endpoint and additionally checks project, issuer, subject, expiry, auth time and account revocation timestamp. Local JWT decoding alone is never accepted as authentication. Verification of disabled accounts and email verification comes from Firebase's response.
- Google Sheets holds a private, append-only `ProfileV2Events` tab. Each event is one JSON cell. Serialized records start with `{`, so editable text is not interpreted as a Sheet formula. All changes use ScriptLock and optimistic versions; only one deployment/project may write this log.
- Existing `Profiles_2026` rows are read only. Only unique rows with `Status = Active` and an exact slug match may initialize a v2 profile. The first authorized mutation snapshots the existing allowlisted published fields and assigns a permanent playerId. Existing guardian contacts, family notes and birth dates are never included in the new public projection.
- Published v2 changes live in the event log; the original profile and intake remain unchanged. After activation, v2 reads the new service while the original page continues reading the legacy endpoint.
- Staff accounts come only from server Script Properties. A submitted email, role, permission or publication status never establishes staff authority.

## One-time activation

1. Select a dedicated Firebase project or explicitly approved existing project and register a web app. Enable Google and Email/Password providers, email verification, email-enumeration protection, an appropriate password policy, and the authorized domains `njhitz.org` and `www.njhitz.org` as needed. Use a dedicated project to avoid unexpected changes to other apps. Confirm current Firebase quotas/billing in that project's console.
2. Create a **new** standalone Apps Script project under NJ Hitz's Workspace account. Add Core.js and Service.js as script files and use the supplied manifest. Do not replace an existing project's files.
3. Set private Script Properties:
   - `SPREADSHEET_ID`: the existing recruit-intake workbook's ID.
   - `FIREBASE_API_KEY`: the selected web app's API key (same project as the client). Ensure Identity Toolkit server calls can use the key; browser-referrer-only restrictions will block Apps Script.
   - `FIREBASE_PROJECT_ID`: exact project ID.
   - `ADMIN_EMAILS`: comma-separated, explicitly confirmed staff emails. Do not guess staff identities. Accounts must verify their email.
4. Confirm the workbook is private to authorized NJ Hitz staff. Run `setupProfileV2` once as the owner. It only creates the `ProfileV2Events` tab and header; it never edits existing sheets. Do not rename, sort, edit or delete event rows. Do not run setup against a template or copied workbook by accident.
5. Deploy the new script as a web app, executing as its owner. External parent accounts need access to its request endpoint; all private actions still require verified Firebase tokens. Confirm this publication and Google authorization in the owner's account. Keep Workspace policies in place. Record the returned `/exec` URL.
6. Populate the public `scripts/profile-v2-config.js` with the Firebase web config and returned deployment URL. Firebase web config is not a service credential. Never commit a private key, OAuth access token, service-account file or guardian data. Keep `enabled: false` until end-to-end tests pass.
7. Test a deployed staging configuration with authorized staff/test accounts. Test the ContentService redirect and CORS path from the actual website in signed-in and signed-out browsers. Private API calls use POST bodies and omit ambient credentials; never put identity tokens in query strings or use JSONP for private responses.
8. Enable configuration for v2 only after the checks below pass. Roll back by setting `enabled: false`: v2 returns to the legacy public endpoint, portal actions stop, and the original website remains unchanged. This rollback hides newly approved v2-only edits; their history remains in the event log.

## End-to-end checks required before activation

- Sign in with Google and email/password. Unverified, disabled, expired, revoked and wrong-project identities are denied by the deployed service.
- Unclaimed accounts cannot read drafts or publish. A parent cannot grant access or assign roles. Staff confirm the family relationship against a trusted roster before granting a claim.
- Approved guardians can reopen drafts. Multiple guardians have separate drafts. No changes appear on either public profile before approval.
- Staff review before/after values. Approval publishes the frozen submission only; later edits remain private. Reject/request corrections and revoke access work.
- A second guardian's stale submission cannot overwrite an approved revision. Refresh conflicts without losing the previously saved draft.
- Public responses exclude private emails when opt-in is No, all guardian records, claims, drafts, reviewer identities and moderation notes. Empty/missing opt-in means no contact publication.
- V2 preserves the 420px graphic, class/year, gold jersey number and QR sharing. The original profile, intake, calendar, and gallery continue working.
- Restrict event-tab editors to staff, monitor Apps Script/Firebase quotas, and establish backup/retention and abuse controls before inviting the whole program. Archive/compaction is not implemented; the log is intended for an initial controlled rollout and reads grow with event history.

## Verification performed in the repository

Run `node --test tests/profile-v2.test.cjs` from the repository root. The tests cover authorization, email verification, staff-only grants, claim identity binding, immutable submissions, stale review conflicts, multiple guardians, revocation, field allowlists, contact privacy, unsafe links and ID-token adapter failures. Firebase, Google Sheets, CORS and email delivery are mocked or unavailable here; these tests are not a substitute for the deployed checks above.

## API

- `GET ?slug=...`: allowlisted published profile only, compatible `{ok, player}` shape.
- `POST`: JSON serialized as text/plain with `idToken`, `slug`, `action`.
- `read`: actor-specific view and current version.
- `claim`: `version`, relationship `note`; never grants access.
- `grant` / `denyClaim`: staff only, target `uid`, `version`; grant additionally requires `confirmRelationship: true`.
- `revoke`: staff only, target `uid`, `version`.
- `save`: authorized family/staff, `version`, published `base`, editable `fields`.
- `submit`: authorized family/staff, `version`; freezes the server-saved draft, not request-supplied fields.
- `review`: staff only, `version`, submission `id`, `decision` (approved/rejected), `note` (required for rejection).

Adding or accepting a new player slug is a staff migration, not a family edit. Preserve the event's permanent playerId and add an explicit alias migration before changing names/jerseys in the source sheet; this first phase does not infer identity from similar names.


## Moderation email and Drive clips

After replacing Code.gs with scripts/gc-stats-v2.js + Core.js + Service.js and updating appsscript.json,
run `setupMediaAndNotificationsV2` as the project owner. It creates a private
`NJ Hitz Profile Videos V2` folder, stores VIDEO_FOLDER_ID, and creates a
10-minute retry trigger. NOTIFICATIONS_FROM prevents retroactive alerts for
old submissions. Keep the trigger owned by the same account as the deployment.
Deploy a new version on the existing deployment; preserve its URL and access.

New permissions: Google Drive management, sending email through MailApp, and
managing Apps Script triggers. DriveApp requires the full Drive scope even
though this service operates only on its configured folder and recorded files.
No Gmail read permission is used.

Each successful submission sends info@njhitz.org an email with player name,
jersey, team, graduation year, authenticated submitter, timestamp, changed field
names, clip count, and a direct staff management link. Draft saves do not email.
Mail failures do not undo a submission; the event log is the retry outbox.
MAIL_SENT_<revision> markers prevent normal duplicate deliveries. An interruption
between sending and marking may cause a duplicate notification.

Uploads: MP4/MOV/WebM, up to 25 MiB per clip, 50 active clips per player.
The adapter checks authorization, version, size, MIME and container signature.
Files are created privately. A clip belongs to its uploader, appears only in
that user's/staff's private view, and enters moderation with their next profile
submission. Staff reviews the immutable text + clip revision together.
Only approval grants view-by-link Drive access and includes the clip in the
public JSON. Rejected clips remain private and can be removed or resubmitted.
Removal here applies only to unsubmitted/rejected clips; it hides their record
without permanently deleting the Drive file. Public clip removal and large-file
resumable uploads are future work. Approved clips may need Drive processing time;
Workspace policies must permit external view-by-link access for embeds.

The upload section remains hidden when the deployed backend does not yet expose
its media model. Existing profile data and the legacy intake service are unchanged.


## GameChanger season snapshots

Code.gs source order: `scripts/gc-stats-v2.js`, `backend/profile-v2/Core.js`,
then `backend/profile-v2/Service.js`. No additional OAuth scopes are needed.
The shared CSV/schema module is also loaded by the management page and helper;
copy it into the helper before rebuilding its ZIP if the schema changes.

Pasting a GC URL validates/stores the team ID and player GUID; it does not grant
access to private GC data. The supported ingestion route is an authorized CSV
export (or the helper reading the existing export in the user's own GC session).
Team Staff export availability is controlled by GameChanger. The helper never
reads/transfers authentication tokens, cookies, passwords, or private API state.
Live capture needs a signed-in GC validation run; CSV parsing uses the original
GameChanger section/header format and is covered by fixture tests.

Only the matching player's 10 batting and 6 pitching metrics leave the browser.
The source URL, player name/jersey, team name, season label, explicit season end
date, full-season confirmation, and import/approval timestamps are retained.
Treat snapshots as family-supplied evidence. Staff must compare the identity,
team/season and unfiltered totals before approval. A source URL or CSV is not a
cryptographic attestation by GameChanger. Missing values stay blank; zero-innings
non-pitchers do not acquire fabricated pitching records. Rates are copied from
the export, not recomputed from rounded figures; innings retain .0/.1/.2 notation.

`stageSeason` stores a private per-user snapshot with a published base version.
Submit freezes those snapshots with the text/video revision and clears staged
imports. Approval upserts by GC team ID + player GUID; other season rows survive.
Rejected/stale submissions cannot overwrite published stats. Re-import to refresh
or correct a season. Up to 20 source seasons are accepted per profile. There is
no background GC synchronization. Legacy sheet seasons remain a display fallback,
and the existing v1 profile is unchanged. The public tables show team/season and
all requested columns; cards show the newest available batting/pitching season,
using explicit end dates for imports and year/season ordering for legacy rows.


## Activity indicator and statistic removals

The portal shows a fixed, accessible progress indicator for all managed actions,
including initial profile loads. Nested requests keep it visible for the full
operation and show the current phase. Controls remain disabled until all phases
finish; error paths clear the indicator and re-enable the applicable controls.

Published GC seasons and legacy batting/pitching rows can be marked for removal.
`stageStatRemoval` records an owner/staff-authorized, versioned target from the
server's current published state; the client cannot invent the target snapshot.
`cancelStatRemoval` undoes the actor's unsubmitted request. Submit freezes the
removals with the rest of the revision and emails their labels to moderators.
Only an approved, current revision applies removals. Imported seasons receive
an audited tombstone; legacy sections are suppressed in the v2 public projection.
The source Sheet and original v1 site are untouched. Re-importing a removed GC
season can restore it through review. The portal exposes legacy rows separately
as Legacy batting / Legacy pitching, so one can be removed without suppressing
the other. Stale removal requests remain visible so the user can cancel them.
