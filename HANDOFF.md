# Ryfields Gym app — working brief / handoff

You are picking up an in-progress gym management web app. Read this whole file before changing anything. Work in small batches, keep everything building, and **test on the local dev server before deploying**.

## 1. What it is
A members' gym management PWA for Ryfields Gym (Warrington, UK). Two experiences in one app, routed by the signed-in user's role:
- **Staff/admin dashboard** (StaffShell) — members, classes, payments, check-in, reports, events, audit.
- **Member portal** (MemberPortal) — membership card, class booking, check-in, profile, events, busy-times, happiness feedback.

Stack: **Vite + React + TypeScript** PWA, **pnpm** workspace, **Firebase/Firestore** (project `ryfields-gym`), backend as **Netlify Functions** wrapping Firebase-callable-style handlers, deployed on **Netlify** (site `ryfields-gym`, live at https://ryfields-gym.netlify.app). Client uses the Firestore Web SDK directly for reads (guarded by security rules); all writes go through the backend (Admin SDK, bypasses rules).

## 2. Repo layout (root: `C:\Users\pwpt\Documents\ryfields-gym-app`)
- `src/` — frontend. `src/app/App.tsx` (routing, StaffShell, InstructorShell, CheckIn, ErrorBoundary), `src/features/*` (members, classes, dashboard, payments, reports, portal, memberships, auth, legal), `src/styles.css` (ONE big stylesheet, mostly minified one-liners + appended blocks).
- `functions/src/` — backend handlers (`callable/*.ts`, `scheduled/*.ts`, `shared/*.ts`). Built to `functions/lib/` by `tsc -p functions`.
- `netlify/functions/` — Netlify entrypoints. `api.ts` = the dispatcher for ALL callables (has an **allowlist** — add new callable names here). Others are scheduled functions (cron via `export const config={schedule:'...'}`).
- `firestore.rules` — security rules. **Cannot be deployed via CLI** (see §5).
- `scripts/` — one-off data scripts (`.mjs`, run with plain `node`).

## 3. Local dev + testing (DO THIS, not draft deploys — deploys cost the owner money)
Run the whole app locally against the LIVE Firestore with `netlify dev` on port 8888:
```
cd C:\Users\pwpt\Documents\Apps\ryfields-gym-app
# env required or Admin-SDK functions fail:
set GOOGLE_APPLICATION_CREDENTIALS=C:\Users\pwpt\Documents\Apps\ryfields-gym-app\.secrets\ryfields-gym-firebase-adminsdk-fbsvc-7671db904e.json
set ADMIN_EMAIL=warby697@gmail.com
node node_modules/netlify-cli/bin/run.js dev --port 8888 --target-port 5173
# open http://localhost:8888
```
(`netlify.toml [dev]` already sets vite on 5173, netlify on 8888.) Frontend hot-reloads; **after editing anything in `functions/src`, rebuild lib**: `node_modules/.bin/tsc -p functions` (netlify dev then reloads the function). Real login works on localhost (Firebase authorized domains include localhost). GoCardless DD redirect points at the prod URL, so that one round-trip won't complete locally — everything else does.

If port 8888 is stuck from a previous run, kill the PID holding it, then restart.

Always run before committing/deploying: `node_modules/.bin/tsc -b && node_modules/.bin/tsc -p functions && node_modules/.bin/vite build` — all three must pass.

## 4. Deploy to production (ONLY when the owner asks — it uses paid Netlify credits)
```
node_modules/.bin/netlify deploy --build --prod
```
The Netlify build command is `npm run build` = `tsc -b && tsc -p functions/tsconfig.json && vite build`, so functions/lib is rebuilt during deploy. Netlify CLI is already authed as warby697@gmail.com. Verify after: site should return 200, and `POST /.netlify/functions/api?name=gymOccupancy` with an empty body returns `{"error":"Sign-in is required."}` (means the API + firebase-admin init are working). Env vars (FIREBASE_ADMIN_*, ADMIN_EMAIL, GOCARDLESS_*, STRIPE_*, APP_BASE_URL) are already set in Netlify.

## 5. Firestore rules — MUST be republished by a human
The service account can't deploy rules via CLI. When you add/change a client-read collection in `firestore.rules`, the OWNER must paste the file into Firebase Console → Firestore → Rules → Publish. Tell them explicitly whenever rules change. Features that read a collection with no published rule fail softly (empty UI), they don't crash. Collections the client reads: members, membershipTypes, classSessions(+bookings/attendance), visits, payments, events, busyTimes, sessionFeedback, noticeBoard, reportSnapshots, dailyMetrics, classTemplates, locations, mandates, subscriptions, auditLogs.

## 6. Data scripts / conventions
- Service-account key: `C:\Users\pwpt\Documents\Apps\ryfields-gym-app\.secrets\ryfields-gym-firebase-adminsdk-fbsvc-7671db904e.json` (gitignored; NEVER print or commit it).
- One-off scripts: write a temp `.mjs` in the repo, `initializeApp({credential:cert(key)})`, do the work, delete it. Always read-and-confirm before mutating live data, and guard updates on expected values.
- Member number counter: `counters/members` field `next`. Names stored Title Case (see `functions/src/shared/text.ts`).

## 7. Conventions & gotchas (respect these or you'll break things)
- **Adding a backend callable**: create/extend `functions/src/callable/*.ts`, export it from `functions/src/index.ts`, AND add its name to the allowlist in `netlify/functions/api.ts`. All three or it 404s.
- **No composite indexes**: the admin SA can't deploy Firestore indexes. NEVER write a query needing one (equality + orderBy on a different field, etc.). Pattern used throughout: query by a single field, sort/filter in JS. (This is why cancel/feedback/min-check queries avoid `orderBy`.)
- **Firestore transactions**: ALL reads before ANY writes. (A read-after-write caused the earlier "cancel class" crash.)
- Many components are dense single-line JSX — match the surrounding style; don't reformat whole files.
- CSS lives in `src/styles.css`; new rules are appended in labelled blocks. Later rules win. Watch for old broad selectors leaking (e.g. a bare `nav{}` rule once polluted the mobile tab bar).
- Demo mode: when `VITE_FIREBASE_PROJECT_ID` is unset the app runs with fake data as an admin (used by the `ryfields-demo` vite config) — good for quick staff-UI checks without login, but member portal isn't reachable there.

## 8. Domain model you must not regress
- **Membership plans** (`membershipTypes`, field `classAccessPolicy`): gym / annual / teen = `weekly_class` (1 free class credit/week, banks to max 3, renews **Sunday 6pm** via `netlify/functions/weekly-class-credits.ts`); **gym_plus = `all` = UNLIMITED classes (never uses/needs credits)**; `classes_only` also unlimited. Real prices: Gym £25/mo, Annual £250/yr, Gym Plus £40/mo, Teen £10/mo, drop-in class £5.
- **Booking** (`bookClass`): unlimited plans book free; everyone else (incl. no-membership prospects) spends one `classCredits`; 0 credits → error prompting Sunday-6pm renewal / buy a pass / upgrade. Ticketed **event** sessions have `creditExempt:true` and never cost a credit.
- **Cancellation** (`cancelClassBooking`, takes a `reason`): allowed until the class starts. Credit refunded if cancelled >12h before (or was waitlisted); cancelling a confirmed booking **within 12h forfeits the credit** (`creditForfeited:true`). Gym Plus loses nothing. Member sees a cancel modal with the 12h warning + reason chips.
- **Auto-cancel** (`netlify/functions/class-minimum-check.ts`, every 15 min): a class starting in ~1h with <3 bookings is cancelled and everyone's credits refunded.
- **Archive/retention** (`netlify/functions/archive-cleanup.ts`, daily): past classes+events older than 60 days are deleted (with their bookings) — a 2-month audit trail. Staff "Past · who came" view + the Register (booked/attended/didn't-attend) are the attendance report.
- **Payments**: GoCardless + Stripe webhooks (`netlify/functions/*-webhook.ts`) auto-update `membershipStatus` (failed→payment_failed, success→active) so members drop off the payment-issues list automatically. Payment docs are matched to members by `gocardlessCustomerId`/`stripeCustomerId`; household DDs can attribute several payments to one member.

## 9. DO NOT REVERT — the Reports "active members" fix (2026-07-21)
`src/features/reports/ReportsPage.tsx` was changed so the **Active members** headline is computed LIVE from the `members` collection as `active + payment_failed` (same rule as the Dashboard), instead of the stale overnight `dailyMetrics.activeMembers` (which was strict-active only and lagged — it showed 158 while the live figure was higher). The page now subscribes to `members`, computes `liveActive`, shows it with an "Active + retrying · N registered" note, always renders the summary, and only gates the income/visit charts behind `dailyMetrics`. Keep this behaviour. If you touch Reports, do not go back to reading `activeMembers` off the snapshot for the headline.

## 10. Current state (as of 2026-07-21)
- Prod is live with everything through batch 6. 163 members (159 active, 3 payment_failed, 1 cancelled).
- Test accounts: **Rebecca Warburton** (beckywarburton1982@gmail.com) = 2nd ADMIN (created passwordless; she signs in via "Forgot password?"). **Harry Potter** (ryfieldsgym@gmail.com) = unclaimed member-test record RYF-1173, no membership, **10 class passes** — he self-registers → claims → tests booking + the missing-info prompts. Admin owner = Paul (warby697@gmail.com, displayName "Paul Warburton").
- MEGA Line Dancing Party (1 Aug) exists as a credit-exempt event linked to a session.

## 11. Open / next work
- **Stripe shop** (biggest remaining): Gym Day Pass £6 + "you'd save £X/mo on membership" prompt, class pass packs (buy 1 / buy 3), Gym Plus upgrade. Wire the existing `/shop` stub (MemberShop in MemberPortal.tsx) and add a `checkout.session.completed` webhook. Event tickets are currently free-but-bookable; add pricing when the shop lands.
- Engagement/goals tracking (weight/strength), notice board, birthdays, busy-times polish.

Golden rules: build after every change (all three tsc/vite commands), test on localhost:8888, only deploy to prod when the owner says so, tell the owner when firestore.rules needs republishing, and never touch the service-account key or commit secrets.
