# Website contact inbox

The homepage Contact NJ HITZ modal uses `siteContactChallenge` and `siteContact` on the existing Apps Script endpoint. It has no Formspree or reCAPTCHA dependency. Include SiteContact.js after the existing recruiting and tryout modules; run setupSiteContactV2 once, then update the existing web-app deployment to a new version without changing access or execution identity.

WebsiteContactMessages in the configured private workbook stores Received at, Message ID, Name, Email, Phone, Message, Notification status and Fingerprint. Sharing stays inherited from that workbook. No public API reads this inbox. Do not put these rows into a public feed or repository. Keep Formspree historical submissions in place; this change does not delete or disable the external Formspree account or endpoint.

All requests must pass server-side field validation, honeypot, signed expiring purpose-bound challenge and SHA-256 proof. Separate limits use the tryout rules: 3 messages/hour per normalized email or phone, 30/hour and 100/day globally. The server fixes recipient info@njhitz.org and subject NJ HITZ Website — Contact Form; Reply-To is the validated visitor email. Client-supplied destinations and subject are ignored. No automatic sender copy is sent.

Save occurs before email. Nonce replay with altered content is rejected; exact retries deduplicate for 24 hours even with a new challenge. Accepted means saved. `sent` means MailApp accepted the notification, not confirmed inbox delivery. The UI reports received when mail is queued and sent when accepted. It retains inputs on error. Submission shows progress and prevents closing while pending.

Pending notifications retry through existing retryProfileNotificationsV2, at most five per run. A crash after sending but before marking Sent can duplicate an email; the stable Message ID identifies it. No message text or addresses are logged. Quota is shared with other scripts running under the same account. Inbox retention can be managed by staff.

Run node --test tests/*.test.cjs. Unit tests mock Sheets and mail; they do not send real messages. An end-to-end production delivery test requires an explicitly authorized test message. Do not remove the old Formspree service until the updated GitHub Pages deployment is verified live.
