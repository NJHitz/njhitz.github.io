# Tryout registration spam protection

The website submits to the existing Profile V2 Apps Script backend using `tryoutChallenge` and `tryoutRegister`. Include `TryoutRegistration.js` in the deployed bundle after RecruitingContact.js. No paid service or CAPTCHA account is required.

The backend reuses recruiting contact's signed ten-minute, purpose-bound challenges, three-second minimum age and SHA-256 proof. It checks the honeypot, validates all fields, accepts only configured positions and graduation years, and restricts birthdates to ages 5–22. First and last name are required. Non-US phone formats should contact staff.

Registration limits: 3/hour per normalized email or phone, 30/hour and 100/day globally. Apps Script does not supply a trustworthy client IP, so there is no claimed IP rate limiting. This raises the cost of automated spam; it is not proof of a human or a guarantee against targeted bots.

Rows append to the existing `Propective Tryout Form Responses` tab in the configured workbook. Existing columns A–K stay intact. L–N hold Registration ID, Notification status, and a SHA-256 payload fingerprint. Exact submissions deduplicate for 24 hours; a token cannot be reused with changed content. No player data is returned publicly. Spreadsheet formula prefixes are escaped.

Notifications go only to info@njhitz.org with parent Reply-To. They omit home address and birthdate. Failed notifications remain Pending and retry through the existing ten-minute `retryProfileNotificationsV2` trigger. A crash after mail acceptance but before marking Sent may cause a duplicate staff notification; the registration ID identifies it. A successful form receipt confirms the row is saved, not inbox delivery.

**Required cutover:** after the protected website is live, turn off Accepting responses on Google Form `1s1tdeW-mJwH-opOUOgQDQ0a-EMb6FABwuCY3OqrLuqs`. Set its closed message to direct visitors to https://njhitz.org/tryouts. Otherwise bots can continue posting directly to the legacy form URL. Do not reopen that public Google Form as a fallback. Keep existing responses and spreadsheet; no deletions are needed.

Run `node --test tests/*.test.cjs`. Tests mock mail and Sheets and do not send real notifications or add registrations. For a live end-to-end test, use an explicitly approved disposable registration and confirm the sheet row plus staff delivery.
