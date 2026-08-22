# Ryfields Gym launch order

The Firestore schema must be published before the Netlify app. This prevents a new customer build from requesting booking data before its security rule and collection-group index exist.

1. Run `npm test` and `npm run build` locally.
2. Run `npm run deploy:firestore-schema` and wait until Firebase reports the index as enabled.
3. Run `npm run verify:firestore-schema` to confirm the required local rule and index are still present.
4. Deploy the Netlify production build once.
5. Test one member account, one Gym Plus account, one non-member account and one admin account.

Do not reverse steps 2 and 4. The customer app now shows a clear live-data warning if a production rule, index or connection fails; it must never present that failure as an empty bookings/shop list.
