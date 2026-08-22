# Ryfields Gym MVP verification report

Verified: 15 July 2026

## Outcome

The MVP is implemented and builds as an installable, mobile-first React PWA. It now follows the proven Squadron Ops deployment model: Netlify hosts the PWA and protected functions, while Firebase provides Authentication and Firestore.

Firebase Authentication and Firestore are configured, and the database rules and indexes are deployed. Publishing the app now only requires linking Netlify and supplying a Firebase service account; GoCardless remains deliberately disabled.

## Requirement coverage

| Area | Status | Evidence |
| --- | --- | --- |
| Member management | Complete | Registration, live member search, edit, membership states, private live notes and status history |
| Membership products | Complete | Create and edit products, pricing, access policy and active availability |
| Payments | Preserved but disabled | GoCardless code is retained; production registration completes without payment while sandbox access is unavailable |
| Classes | Complete | Timetable, instructor names, capacity, booking, waiting list, cancellation, promotion and attendance |
| Member portal | Complete | Digital card and QR, status, bookings, payments, profile and visit history |
| Check-in | Complete | Rotating 45-second venue QR, live type-ahead name fallback, inactive-member prevention and one-hour automatic checkout |
| Dashboard | Complete | Live members, income, failures, new members, classes and current attendance |
| Reports | Complete | Membership, income, attendance, popular classes, visit frequency and CSV export |
| Authentication and roles | Complete | Firebase Authentication with member, instructor, staff and admin route separation |
| Firestore updates | Complete | Live subscriptions are used for operational screens |
| Payment-data handling | Complete | Only GoCardless references and statuses are stored; no bank details are accepted or persisted |
| PWA and deployment | Complete pending deployment | Manifest, icons, generated service worker, responsive layout, Netlify redirects and security headers |
| Theme | Complete | Persistent light and dark modes |
| Import/migration | Complete | Dry-run-first CSV member migration with validation report and staging seed script |

## Verification performed

- Web TypeScript compilation: passed.
- Production PWA build: passed; 1,849 modules transformed and 23 resources precached.
- Shared protected backend TypeScript compilation: passed.
- Netlify function entry-point TypeScript compilation: passed.
- Backend and Netlify gateway automated tests: 18 passed across seven test files.
- Production-server smoke test: `/`, `/members`, `/manifest.webmanifest` and `/sw.js` all returned HTTP 200.
- Member CSV template migration dry run: one valid row, zero validation issues, no writes performed.

## Launch-only checks

These are deliberately left for the real service accounts:

1. Generate a Firebase service account and run the prepared Netlify setup/deployment helper.
2. Create the first Firebase Authentication user; the one-time authenticated bootstrap applies its admin claim.
3. Configure App Check after the final Netlify domain is known.
4. Connect GoCardless sandbox later, then enable its dedicated Netlify function and webhook.
5. Import the final cleaned member CSV using dry-run mode first.
6. Run the launch checklist, including phone installation, venue QR scanning and webhook replay tests.

## Known verification constraint

The Firestore rules test suite is included but could not be executed on this workstation because a Java runtime is not installed. The rules are deny-by-default and protected writes are routed through authenticated Netlify Functions using Firebase Admin. Run `pnpm test:rules` once Java 21 or newer is available, before production launch.
