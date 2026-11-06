# Daily budget

A compact, mobile-first budget app following UX V2.3. The projected balance stays at the top, selectable consideration items sit in the middle, and Spent Today expands at the bottom. Google sign-in connects each user's private Firestore records.

## Run locally

Use any static HTTP server in this directory. For example: `python3 -m http.server 8080`. Authorize the local hostname in Firebase Authentication before testing Google sign-in locally.

No build dependencies are required. `npm run check`, `npm test`, and `npm run build` validate and package the site.

## Deploy

Enable GitHub Pages with GitHub Actions as its source. The included workflow checks and deploys every push to main. Relative asset URLs support `/BUDGET/` hosting.

Firebase project: `tokyo-budget`. Google provider is enabled. Authorize `designmilktea.github.io` in Authentication settings, and publish `firestore.rules` to the default database. Firebase's web configuration in `src/store.js` is public client configuration, not an admin credential. Access is enforced by per-user Firestore rules. Never put service-account private keys in this repository.

## Behavior

- A new account starts with a zero budget; use the Budget button to set the daily amount. Amounts use the prototype's dollar display, with integer cents internally.
- Budget edits apply today and to future days; previous daily budget records remain unchanged. The user's device timezone defines midnight. Unpurchased cart items and selections carry forward. There is no unused-budget rollover.
- New cart items are selected by default. Optional names fall back to Item 1, Item 2, etc.
- Checkout atomically converts selected cart entries to purchases. Repeated or stale operations are rejected through document versions.
- Direct recording bypasses the consideration cart. Removing records is reversible using Undo; removed entries are retained in the database.
- Checkout and record operations require an online Firestore transaction. Errors are displayed; failed writes do not appear as successful purchases.
- Data is scoped under `users/{uid}`. No analytics integration is initialized.
