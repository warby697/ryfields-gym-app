# Ryfields Gym launch checklist

Updated 22 July 2026. Nothing in this review was deployed.

## Verified locally

- Production-equivalent Netlify build completes and bundles all 16 functions.
- Frontend and backend TypeScript checks pass.
- All 12 automated domain, payment, webhook-helper and API-authentication tests pass.
- Customer-facing source contains no temporary event, test-mode, preview, stub, TODO or "coming soon" wording.
- The login and first-time registration wording is correct for Ryfields Gym.
- A 390px phone viewport has no horizontal overflow on the signed-out journey.
- The live site responds and both deployed webhook URLs exist (safe GET checks return the expected 405).
- Production `APP_BASE_URL` is `https://ryfields-gym.netlify.app`.
- Required Netlify environment variables are present for Firebase, Stripe, GoCardless and Resend.
- GoCardless is configured for live use and the explicit live-upgrade switch is enabled.
- Line Dancing Party capacity is confirmed as 60.
- Paid Stripe event checkout was completed locally: payment recorded, ticket issued and capacity updated.

## Safety hardening completed in this review

- GoCardless environment and enable-switch values are now case-insensitive (`LIVE` / `YES` work correctly).
- An old subscription cancellation can no longer cancel a member after a Gym Plus replacement is linked.
- The replacement subscription is linked before the old subscription is cancelled, closing the webhook race window.
- Failed GoCardless webhook processing now returns an error so GoCardless retries it.
- Cancelled members can reactivate after successfully completing a new Direct Debit setup.
- Abandoned paid-event reservations have a five-minute cleanup failsafe as well as Stripe's expiry webhook.
- The required reservation-expiry Firestore index is included in `firestore.indexes.json`.
- Low-number cancellation emails are idempotent: an immediate successful email is marked sent; a failed send is recovered by the outbox scanner.

## Required immediately before launch

- Deploy the updated Firestore rules and indexes, including the new reservation-expiry index.
- Make the single planned Netlify production deployment.
- Confirm the Stripe production endpoint subscribes to:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `charge.refunded`
  - `charge.dispute.created`
- Confirm the GoCardless production webhook points to `/.netlify/functions/gocardless-webhook` with the matching secret.
- Confirm scheduled functions appear in Netlify after deployment.

## Controlled live acceptance checks

- Complete one controlled Harry/Tessa Gym-to-Gym-Plus upgrade and verify:
  - Stripe takes the quoted pro-rata amount.
  - A £40 GoCardless subscription is created for the existing payment date.
  - The old subscription is cancelled.
  - The member remains active and displays Gym Plus.
- Complete one low-value Stripe shop purchase and verify receipt, order fulfilment and staff notification.
- Check a class and an event Facebook share using a fresh versioned URL so Facebook fetches the new preview.
- Check the seven-item customer navigation on a real phone.
- Test one class booking/cancellation and one free event booking/cancellation.
- Test one low-number class cancellation email to a controlled account.

## Known local test limitation

- Firestore rules emulator tests are present, but Java is not installed on this computer, so the emulator cannot start. The rules were manually reviewed; the automated rules suite should be run when Java is available.
