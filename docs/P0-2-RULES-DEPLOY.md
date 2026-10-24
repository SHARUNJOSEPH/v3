# P0-2 — Firestore & Storage rules deploy

**Status:** Rules authored + wired in `firebase.json`. Deploy requires Firebase CLI + project access.  
**Project:** `grid-945d4` (from `config/firebase-config.js`)

## What was added

| File | Purpose |
|---|---|
| `firestore.rules` | Owner-only `profiles/{uid}`; default deny |
| `storage.rules` | Public read `branding/**`; owner R/W `users/{uid}/**` (&lt;10MB); default deny |
| `firebase.json` | `"firestore.rules"` + `"storage.rules"` entries |

## App path coverage

| Client usage | Rule |
|---|---|
| `db.collection('profiles').doc(uid)` | Owner read/write |
| `storage.ref('branding/mediapro/logo.png\|webp')` | Public read, no client write |

## Deploy (from repo root, with Firebase CLI logged in)

```bash
# Preview / dry-check locally in Console emulator if preferred, then:
firebase deploy --only firestore:rules,storage --project grid-945d4
```

Or with CI token (same secrets as Hosting):

```bash
firebase deploy --only firestore:rules,storage \
  --project "$FIREBASE_PROJECT_ID" \
  --token "$FIREBASE_TOKEN"
```

## Negative tests (manual / Console)

1. Signed out → `profiles/{any}` get/set → **denied**  
2. User A signed in → read/write `profiles/{A}` → **allowed**  
3. User A → read/write `profiles/{B}` → **denied**  
4. Anyone → getDownloadURL `branding/mediapro/logo.png` → **allowed**  
5. Signed-in user → upload to `branding/...` → **denied**  
6. User A → upload under `users/{A}/...` (&lt;10MB) → **allowed** (future path)

## Safety notes

- Deploying rules is **breaking** if production previously had open rules and other clients wrote outside `profiles/{uid}`. Audit Console data before deploy.  
- Hosting deploy alone does **not** publish rules — use the commands above.  
- After deploy, smoke profile save/load in the app (not demo mode).
