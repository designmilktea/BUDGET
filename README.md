# Daily Budget

The agreed calculator-based daily budget app, deployed at https://designmilktea.github.io/BUDGET/.

## Run and deploy

No build dependencies are required. Use a static HTTP server for local development.

```
npm run check
npm test
npm run build
```

The existing `.github/workflows/deploy.yml` is preserved. A push to `main` runs checks and tests, packages `dist/`, and deploys through GitHub Pages. All local asset URLs are relative to support `/BUDGET/`.

## Firebase

Project: `tokyo-budget`. Firebase web configuration in `src/firebase.js` is public client configuration; it is not an admin credential.

Enable the Google provider in Firebase Authentication and authorize `designmilktea.github.io` (plus local development hosts when needed). Publish the repository's `firestore.rules` to the default database. Alternatively, with an authenticated Firebase CLI, run `firebase deploy --only firestore:rules --project tokyo-budget`.

Users sign in through Settings. Each account reads and writes only its own data:

- `users/{uid}/budgetApps/daily`: current day, latest default budget, cart, purchases, calculator, settings, and UI state. A revision transaction prevents stale devices from overwriting newer cloud changes.
- `users/{uid}/budgetHistory/{YYYY-MM-DD}`: historical snapshots stored separately to avoid accumulating all history in one Firestore document.

Snapshots are JSON strings inside validated, owner-only documents. There is no public read access and no analytics integration. The old application's Firestore documents are not deleted or imported.

Browser data and pending cloud writes are scoped by account. Guest data remains separate. A new cloud account imports the current browser snapshot; existing cloud accounts restore their cloud snapshot. Closing the browser retains pending writes. Offline edits retry when connectivity returns. An unresolved concurrent-device conflict leaves both the cloud data and the local pending copy intact, and shows an error instead of silently overwriting either. Automatic field-level merging is not implemented.

Sign-in state persists in the browser. Signing out returns to the separate guest workspace. Website storage is origin-specific: data on the previous `chatgpt.site` URL cannot automatically transfer to GitHub Pages. Browser storage cleared by the user removes guest data and any unsynced pending copies; synced records remain in Firebase.

## App behavior

- JPY uses whole yen. Fresh users start with a ¥1,000 daily budget and no sample purchases.
- Quick entry is the default; the orange `+` adds to the active entry destination. The full calculator remains available in Settings.
- The cart/receipt icon beside Settings switches destination. The Considering list is one horizontal row. Item and purchase names support double-click/double-tap editing.
- Checkout groups selected items into one expandable purchase. Purchase deletion requires confirmation.
- The local date determines midnight. Yesterday's records are retained; unpurchased cart items carry forward deselected. New days use the latest daily budget. Changing today's budget never changes historical budgets.
- Previous days are read-only and accessed through Settings. The original animated empty-cart GIF is preserved.

## Verification

Tests cover budget arithmetic, same-day reopening, midnight rollover, historical budgets, grouped checkout, cancellation/deletion, account isolation, queued cloud writes, and stale-revision protection. Firebase end-to-end verification also requires the project's live Google sign-in provider, authorized domain, and published Firestore rules.
