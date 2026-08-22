# Ryfields Gym Management System — Architecture Plan

Status: **Approved with amended check-in flow — 14 July 2026**

## 1. Product scope

Ryfields will be one installable, mobile-first Progressive Web App with role-specific experiences for members, staff, instructors and administrators. It will replace member spreadsheets, Bookwhen class booking and manual GoCardless administration while retaining GoCardless as the payment processor.

### MVP

- Secure sign-in and role-based access
- Member records, membership lifecycle, search and staff notes
- GoCardless onboarding, mandates, subscriptions, payments and webhook-driven status
- Recurring class timetable, dated class sessions, capacity, bookings, waitlists, cancellations and attendance
- Member portal, digital QR membership card and profile editing
- Venue QR check-in, live member-name fallback search and visit history
- Live operational dashboard and core reports
- Light/dark themes, responsive layout and installable PWA

### Explicitly deferred

NFC cards, personal-training bookings, nutrition, shop, push notifications, referrals and loyalty rewards. The data model will allow these to be added without redesigning member identity or payments.

## 2. Recommended architecture

### Front end

- React with TypeScript and Vite
- React Router for public, member and staff route groups
- Firebase Web SDK for authentication and real-time Firestore listeners
- TanStack Query only for server-callable workflows and cached non-realtime data; Firestore listeners remain the source for live screens
- React Hook Form plus Zod for validated forms
- A reusable accessible component layer and design tokens for themes
- PWA manifest and service worker; cache only the application shell and safe reference data

### Firebase back end

- Firebase Authentication for identity
- Firestore for operational data
- Netlify Functions in TypeScript for privileged mutations, future GoCardless calls/webhooks, scheduled jobs and report aggregation
- Firebase App Check on the web app and callable/HTTP endpoints where supported
- Cloud Scheduler-triggered functions for maintenance and reconciliations
- Firebase Emulator Suite for local development and integration testing

### Hosting and delivery

- Netlify hosts the built React application and supplies SPA redirects and security headers
- Firebase remains the API, authentication and database platform
- Separate Firebase projects and GoCardless credentials for development/staging and production
- Automated checks on pull requests; production deployment only from the protected main branch

### Trust boundary

The browser may read authorised data and request actions. It must never directly create payment records, change payment-derived membership status, override capacity, promote waitlists, or process check-ins. Those operations run in authenticated Netlify Functions using Firebase Admin, transactions and role checks.

GoCardless is authoritative for mandates and payment outcomes. Firestore stores identifiers, amounts, dates and statuses—not bank account details. Webhooks are verified, stored idempotently and then applied to local projections.

## 3. Roles and permissions

| Role | Main access |
|---|---|
| Member | Own profile, membership, bookings, visits and payment history; public timetable |
| Instructor | Assigned sessions and attendance registers; limited member identity needed for classes |
| Staff | Member administration, bookings, check-in and operational dashboards |
| Admin | All staff access plus membership products, users/roles, class setup, reports and configuration |

Firebase custom claims provide coarse roles. Firestore staff profiles hold display and operational details. A role change is performed only by an admin function and written to an audit log. “Suspended” refers to membership state, not an authentication role.

## 4. Application areas and routes

- Public: `/`, `/login`, `/register`, `/forgot-password`, `/payment/return`
- Member: `/app`, `/app/card`, `/app/classes`, `/app/bookings`, `/app/payments`, `/app/profile`
- Staff: `/staff`, `/staff/members`, `/staff/members/:id`, `/staff/classes`, `/staff/classes/:sessionId`, `/staff/check-in`, `/staff/reports`
- Admin: `/admin/membership-types`, `/admin/class-templates`, `/admin/users`, `/admin/settings`, `/admin/audit`

The layouts are distinct but share the same design system. Navigation is bottom-tab based on phones and a sidebar on larger screens.

## 5. Proposed folder structure

```text
/
├─ apps/
│  └─ web/
│     ├─ public/                 # icons, manifest-safe static assets
│     └─ src/
│        ├─ app/                 # providers, router, layouts, error boundaries
│        ├─ components/          # shared accessible UI components
│        ├─ features/
│        │  ├─ auth/
│        │  ├─ members/
│        │  ├─ memberships/
│        │  ├─ payments/
│        │  ├─ classes/
│        │  ├─ bookings/
│        │  ├─ check-in/
│        │  ├─ dashboard/
│        │  └─ reports/
│        ├─ hooks/
│        ├─ lib/                 # Firebase client, dates, formatting, errors
│        ├─ styles/              # tokens, themes, global styles
│        └─ types/
├─ functions/
│  └─ src/
│     ├─ callable/               # authenticated application commands
│     ├─ webhooks/gocardless/
│     ├─ scheduled/
│     ├─ triggers/
│     ├─ services/               # domain and integration services
│     ├─ repositories/           # Firestore access
│     ├─ validation/
│     └─ shared/
├─ packages/
│  ├─ contracts/                 # shared schemas, DTOs, enums
│  └─ config/                    # shared lint/TypeScript configuration
├─ firestore.rules
├─ firestore.indexes.json
├─ firebase.json
├─ netlify.toml
├─ docs/
└─ tests/                        # rules, integration and end-to-end tests
```

This is a small monorepo: the web app and functions can deploy independently while sharing validated contracts.

## 6. Firestore schema

All timestamps are Firestore timestamps in UTC. Money is stored as integer minor units plus ISO currency. Records include `createdAt` and `updatedAt` where applicable. Sensitive staff notes are not embedded in member-readable documents.

### Identity and members

`users/{uid}`

- `email`, `displayName`, `role`, `memberId?`, `active`, `lastLoginAt`
- Staff/admin readable; the owner can read a deliberately restricted public profile or an equivalent member-safe projection

`members/{memberId}`

- `authUid?`, `memberNumber`, `firstName`, `lastName`, `email`, `phone?`, `dateOfBirth?`, `address?`
- `emergencyContact?`, `marketingConsent`, `termsAcceptedAt`
- `membershipTypeId`, `membershipStatus`, `membershipStartedAt`, `membershipEndsAt?`
- `gocardlessCustomerId?`, `gocardlessMandateId?`, `gocardlessSubscriptionId?`
- `searchTokens`, `createdAt`, `updatedAt`

Membership status enum: `pending_payment | active | suspended | cancelled | payment_failed`. A server-side state transition service controls changes.

`members/{memberId}/notes/{noteId}`

- `body`, `category`, `authorUid`, `createdAt`, `updatedAt?`
- Staff/admin only; never visible to members

`members/{memberId}/statusHistory/{eventId}`

- `from`, `to`, `reason`, `source`, `actorUid?`, `effectiveAt`

`membershipTypes/{typeId}`

- `name`, `description`, `priceMinor`, `currency`, `billingInterval`, `active`
- `classAccessPolicy`, `joiningFeeMinor?`, `gocardlessPlanReference?`

### Payments

`payments/{paymentId}` (document ID normally the GoCardless payment ID)

- `memberId`, `provider`, `providerPaymentId`, `mandateId?`, `subscriptionId?`
- `amountMinor`, `currency`, `status`, `chargeDate?`, `paidOutAt?`, `failureCode?`, `failureMessage?`
- `createdAt`, `updatedAt`

`mandates/{mandateId}`

- `memberId`, `providerMandateId`, `status`, `scheme`, `createdAt`, `updatedAt`

`subscriptions/{subscriptionId}`

- `memberId`, `membershipTypeId`, `providerSubscriptionId`, `status`
- `amountMinor`, `currency`, `interval`, `nextPaymentDate?`, `createdAt`, `updatedAt`

`paymentEvents/{providerEventId}`

- Raw-minimal provider event metadata/payload needed for traceability, `action`, `resourceType`, `resourceId`, `receivedAt`, `processedAt?`, `processingStatus`, `error?`
- Provider event ID makes webhook ingestion idempotent

No member can write any of these collections. Member-facing payment history is a filtered read or safe projection containing no provider-internal data.

### Classes and booking

`classTemplates/{templateId}`

- `name`, `description`, `durationMinutes`, `defaultCapacity`, `location`, `active`
- `recurrenceRule`, `defaultInstructorIds`, `bookingOpenDays`, `cancellationCutoffMinutes`

`classSessions/{sessionId}`

- `templateId`, `nameSnapshot`, `startsAt`, `endsAt`, `locationSnapshot`
- `instructorIds`, `capacity`, `bookedCount`, `waitlistCount`, `status`
- `bookingOpensAt`, `bookingClosesAt`, `cancellationCutoffAt`

`classSessions/{sessionId}/bookings/{memberId}`

- `memberId`, `status`, `position?`, `bookedAt`, `cancelledAt?`, `promotedAt?`, `source`
- Status: `confirmed | waitlisted | cancelled | attended | no_show`
- Member ID as document ID prevents duplicate live bookings

`classSessions/{sessionId}/attendance/{memberId}`

- `memberId`, `markedByUid`, `markedAt`, `method`

Bookings are created/cancelled by transactional Netlify Functions. The transaction checks membership eligibility, booking window, duplicates and capacity, then atomically updates counters. Cancellation promotes the earliest eligible waitlisted member.

### Check-in

`visits/{visitId}`

- `memberId`, `checkedInAt`, `scheduledCheckoutAt`, `checkedOutAt?`, `locationId`, `method`, `checkedInByUid?`, `classSessionId?`
- `checkoutReason?` (`automatic | manual | corrected`)
- Immutable after checkout except tightly controlled correction metadata

`locations/{locationId}`

- `name`, `timezone`, `active`

`checkInDisplays/{locationId}` stores only the current display state and rotation timestamp. A server-generated, short-lived signed challenge is rendered as the venue QR and rotates regularly. The QR contains no member identity. An authenticated member scans it with their own phone; the server validates the challenge, location, expiry and active membership before creating a visit. A staff-facing type-ahead search provides a fallback: matching active members appear as the name is typed and staff select the intended member. Every accepted visit receives a checkout time one hour after check-in. A scheduled function marks overdue open visits as automatically checked out; reads also treat an elapsed visit as closed so delayed scheduling cannot extend access state.

### Reporting, configuration and audit

`dailyMetrics/{yyyy-mm-dd}`

- Counts and totals for active/new/cancelled members, income, failed payments, visits and class attendance

`settings/public` and `settings/private`

- Gym branding and public policies are separated from integration/configuration metadata
- Secrets remain in Firebase/Google Secret Manager, never Firestore

`auditLogs/{logId}`

- `actorUid`, `action`, `entityType`, `entityId`, `before?`, `after?`, `occurredAt`, `requestId?`
- Append-only and admin readable

## 7. Key workflows

### New member and first payment

1. Member creates an authenticated account and verifies email.
2. They complete registration, consent and membership selection.
3. A server function creates the local pending member and GoCardless customer/billing request.
4. The browser redirects to the hosted GoCardless Instant Bank Pay/authorisation flow.
5. Return to Ryfields shows “processing”; it does not assume success from the redirect.
6. Verified GoCardless webhooks create/update the mandate, first payment and subscription.
7. Membership becomes active only when the agreed qualifying provider event is received.
8. The member sees an active digital card and may book/check in.

### Monthly Direct Debit

1. GoCardless schedules and collects under the mandate.
2. Webhooks update payment projections.
3. Confirmed failure changes membership to `payment_failed` according to the agreed grace policy and alerts staff in-app.
4. Recovery/success can restore active status under explicit transition rules.
5. A cancelled/expired mandate stops future collections and flags the member for action; it does not erase history.

### Class booking

1. Member views eligible upcoming sessions in their local timezone.
2. Server validates membership, access policy, booking window and conflicts.
3. Space available: confirmed booking. Full: ordered waitlist entry.
4. Cancellation before cutoff triggers transactional promotion of the earliest eligible waitlisted member.
5. Instructor/staff marks attendance; visit history can optionally link to the class.

### Gym check-in

1. The check-in display shows a short-lived venue QR that rotates automatically.
2. The member opens the Ryfields app and scans the venue QR with their own phone.
3. The server validates the signed challenge, location, expiry, replay protection and current membership state.
4. Active: a visit is created and both member and venue display receive a clear success confirmation.
5. Pending, suspended, cancelled or payment failed: no visit is created and a safe reason is shown.
6. As a fallback, staff type a member's name; matching names appear live and staff confirm the correct member.
7. The visit automatically checks out after one hour, with an optional earlier manual staff checkout.

### Staff member administration

1. Staff searches by normalised name, email, phone or member number.
2. Staff sees profile, membership, payment summary, bookings, visits, status history and private notes in permission-aware tabs.
3. Permitted edits are validated and audited.
4. Financial status changes remain server-controlled; exceptional overrides require admin permission and a reason.

## 8. Dashboards and reports

Operational screens use live queries for today’s classes, attendance and payment failures. Historical reporting reads pre-aggregated daily metrics to avoid costly full-collection scans.

- Active membership: current status counts and change over time
- Income: successful payment totals by settlement/charge date, with failed/refunded amounts separated
- Attendance: visits and class attendance by date/time
- Popular classes: utilisation, waitlist demand and cancellation/no-show rate
- Visit frequency: visits per active member and inactive-member cohorts

CSV export is generated server-side with role checks and an audit entry. Metric definitions will be documented so dashboard and reports never disagree.

## 9. Security and privacy

- Deny-by-default Firestore and Storage rules
- Members can read only their safe records; sensitive notes, webhook events and audit logs are staff/admin only
- Privileged mutations use callable functions and verify authentication, role, App Check and validated input
- GoCardless webhook signatures are verified before acknowledgement; duplicate and out-of-order events are handled
- Secrets use Secret Manager and are split by environment
- No bank details, payment credentials or webhook secret in the client or Firestore
- Minimal personal data, explicit retention rules, account export/correction process and restricted audit access
- Security headers, dependency scanning, rate limiting/abuse controls and structured error logging
- Offline PWA caching excludes member/payment data; sign-out clears local application state

## 10. Reliability and observability

- Correlation/request IDs across functions, provider calls and audit logs
- Structured logs and alerts for webhook failures, repeated payment processing errors and scheduled-job failure
- Webhook processing uses idempotent event documents and retry-safe handlers
- A scheduled reconciliation compares recent GoCardless resources with local projections
- Firestore transactions protect capacity, counters and membership transitions
- Backups/export policy and a tested restore procedure before launch

## 11. Testing strategy

- Unit tests for validation, membership state transitions, pricing and waitlist rules
- Firestore Rules tests for every role and sensitive collection
- Emulator integration tests for registration, booking races, cancellation promotion, check-in and webhook idempotency
- Contract tests against GoCardless sandbox fixtures
- End-to-end tests for the main member and staff journeys, including QR expiry/rotation, replay attempts, live search and one-hour checkout, on phone and desktop viewports
- Accessibility checks targeting WCAG 2.2 AA
- PWA install/offline-shell tests and cross-browser QR camera testing

## 12. Delivery phases

1. Foundation: environments, design system, auth, roles, rules, CI and PWA shell
2. Members: registration, products, lifecycle, search, notes and audit
3. Payments: GoCardless sandbox, hosted payment flow, subscriptions, webhooks, history and failures
4. Classes: templates, session generation, timetable, booking, waitlist and register
5. Portal/check-in: card, QR token, scanner, visits and profile
6. Dashboard/reports: live operations, aggregates and exports
7. Hardening: accessibility, privacy, performance, recovery, security review and launch migration

Each phase requires automated tests, staging acceptance and written acceptance criteria before production release.

## 13. Data migration and launch

- Inventory and clean existing spreadsheets, Bookwhen exports and GoCardless customer/mandate references
- Define a deterministic member-number and deduplication policy
- Dry-run import into staging with reconciliation totals and an exception report
- Import existing provider IDs; never recreate valid mandates unnecessarily
- Agree a booking cutover window and communicate it to members
- Run final import, reconciliation and staff smoke test before opening the new portal
- Retain read-only legacy exports for the agreed legal/operational period

## 14. Decisions required before implementation

Approval of this plan also needs answers to these product decisions:

1. Are members self-registering, staff-invited, or both?
2. What membership products, prices, billing dates, joining fees and class entitlements exist?
3. Exactly which GoCardless first-payment flow is enabled for the Ryfields account, and when should membership activate: payment submitted, confirmed, or paid out?
4. Is there a payment-failure grace period, and what event restores access?
5. What are the class booking window, cancellation cutoff, waitlist notification method and no-show policy?
6. May instructors see member phone/email, or only names and attendance status?
7. What duplicate check-in window and staff override rules should apply? (Default proposal: block a second open visit and allow staff/admin correction with a reason.)
8. Which current datasets will be migrated, and approximately how many members/bookings/payments are involved?
9. What legal entity, privacy notice, retention periods and minimum member age/guardian rules apply?
10. Does Ryfields operate one location and timezone, or should multi-location support be active at launch?

## 15. Approval gate

Architecture approval was received on 14 July 2026. Foundation work may begin using documented defaults for unanswered product decisions. Payment integration, production data migration and launch remain gated until their relevant business answers and credentials are supplied.

- This architecture is approved or amended
- The ten product decisions above are answered
- GoCardless sandbox access and existing-data samples are available
- MVP acceptance criteria and launch ownership are agreed

After approval, the next artifact should be a prioritised implementation backlog with acceptance criteria, followed by the foundation phase—not an uncontrolled full-app code generation pass.
