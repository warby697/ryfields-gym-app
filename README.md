# Ryfields Gym Management System

Mobile-first React PWA using the same deployment pattern as Squadron Ops:

- Netlify hosts the Vite PWA and protected server functions.
- Firebase Authentication provides member and staff sign-in.
- Firestore provides real-time operational data.
- Netlify scheduled functions generate classes and reports and automatically check members out.
- GoCardless code is preserved but disabled until sandbox credentials are available.

## Local development

1. Copy `.env.example` to `.env.local` and provide the Firebase web configuration.
2. Install dependencies with `pnpm install`.
3. Compile the backend library with `pnpm --dir functions build`.
4. Start the app with `pnpm dev` for UI work, or `netlify dev` for end-to-end function work.

The UI uses clearly labelled demonstration data when Firebase is not configured.

## Verification

- Complete production build: `pnpm build`
- Backend tests: `pnpm --dir functions test`
- Firestore Rules tests: `pnpm test:rules` (requires Java for the Firestore emulator)
- Netlify packaging: `netlify build --offline` after the site is linked

## Production configuration

Public browser-build values are listed in `.env.example`. Netlify also needs these server-only values:

- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`
- `ADMIN_EMAIL`

The prepared deployment helper validates and sets them. Never prefix a private value with `VITE_`.

No bank details or payment credentials are stored in Firestore or exposed to the browser. GoCardless remains disabled until its dedicated integration is tested and approved.
