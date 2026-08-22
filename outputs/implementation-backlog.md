# Ryfields MVP Implementation Backlog

Status: Foundation authorised on 14 July 2026.

## Phase 1 — Foundation

- Installable React/TypeScript PWA with responsive member and staff layouts
- Accessible design tokens, light/dark/system theme and reusable controls
- Firebase environment configuration with safe local placeholders
- Authentication provider and protected role-aware routes
- Deny-by-default Firestore rules and shared domain contracts
- Netlify SPA/security configuration
- Automated type-check, unit-test and production-build commands

Acceptance: the app builds cleanly, is usable at phone and desktop sizes, provides offline application-shell behaviour, and unauthenticated users cannot enter protected areas.

## Phase 2 — Members

- Registration, member lifecycle, membership types, member search and notes
- Audited staff edits and member-safe self-service profile

## Phase 3 — Payments

- GoCardless sandbox onboarding, first payment, mandates, subscriptions and verified idempotent webhooks
- Payment history, failed-payment workflow and mandate cancellation

## Phase 4 — Classes

- Templates and dated sessions, instructors, capacity, bookings, waiting list, cancellation and register

## Phase 5 — Check-in and portal

- Rotating venue QR scanned by the authenticated member
- Live type-ahead member search fallback for staff
- Automatic checkout exactly one hour after check-in
- Digital membership card, visits, bookings, payments and profile

Acceptance: expired/replayed QR challenges fail; inactive members cannot check in; duplicate open visits are blocked; type-ahead results are permission-limited; each accepted visit becomes closed after one hour even if the scheduled worker is delayed.

## Phase 6 — Dashboard and reports

- Live operational dashboard, daily aggregates and audited CSV exports

## Phase 7 — Hardening and launch

- Accessibility, performance, recovery, privacy/security review, migration rehearsal and production cutover
