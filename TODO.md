# Task Tracker

- [x] Move inline scripts in `index.html` into external JS file and load with `defer` (resolved 8500+ lines inline script into `js/app.js`).
- [x] Fix UTF-16LE encoding issue on `index.html` (converted to clean UTF-8).
- [x] Integrate Aptabase Analytics SDK (`js/aptabase.js`) with App Key `A-US-4851614753`.
- [x] Update Content Security Policy in `firebase.json` for Aptabase endpoints.
- [x] Configure Progressive Web App manifest (`manifest.json`), icons, and service worker (`sw.js`) for Microsoft Store packaging.
- [x] Vendor Bootstrap / jsPDF locally (eliminate CDN Tracking Prevention warnings); bump asset `?v=` to 2.4.
- [x] Add eng doc pack: `CLAUDE.md`, `README.md`, `ENGINEERING.md` (structure / policy / planning / execution / safety).
- [x] Guard `stage3d.js` rebuild/environment/lighting against pre-init calls from `updatePixelMap` (`if (!scene) return`); bump asset `?v=` to 2.5.
- [x] Skip `/__/firebase/init.js` on local/dev hosts; guard `firebase.initializeApp` when SDK missing; bump `?v=` to 2.6.
- [x] Password-change form a11y: hidden username/email field (`#passwordChangeUsername`) populated on profile modal open.
- [ ] Restore Firebase Auth / Firestore / Storage compat SDKs under `js/vendor/` and load from `index.html` (CDN tags were removed in the vendor pass; without them the app stays in `__IS_DEMO__`).
- [ ] Add secure Firebase Firestore and Storage rules files, and wire them in `firebase.json`.
- [ ] Bridge `app.js` `state` → `stage3d.js` (`window.state` is read but never assigned; engineering specs fall back to defaults).
- [ ] Introduce automated security-focused linting via ESLint security plugin.
- [ ] Optional: archive/delete unused `js/main.js` and stale `public/` Firebase starter once confirmed safe.
