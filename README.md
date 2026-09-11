# Inkleaf Notes

A modern, Word-style notepad PWA with rich-text editing, folders, favorites,
autosave, Google sign-in, **Firebase Cloud Firestore sync**, and offline support.

## What is synced

When you sign in with the same Google account on your PC, phone, iPhone, iPad,
or another supported browser, your notes are stored under your Firebase user ID
and synchronized through Cloud Firestore. Changes made on one device appear on
other devices after they connect.

Firestore also keeps a local cache, so the editor remains usable while offline
and queued changes can synchronize when the connection returns.

## Troubleshooting a "sync error"

This version adds an account chip in the top-right of the editor (shows who's
signed in, with a colored status dot) and a red banner that appears whenever
a cloud sync fails, with the real Firebase error code and a **Retry** button.
Open it and check the code shown — it maps to one of these almost every time:

| Error code | What it means | Fix |
|---|---|---|
| `auth/unauthorized-domain` | Your GitHub Pages domain isn't allowed to sign in. | Firebase Console → Authentication → Settings → Authorized domains → add your `*.github.io` domain (see step 1 below). |
| `permission-denied` | Firestore is rejecting reads/writes for this user. | The rules in `firestore.rules` were never **published**. Open Firebase Console → Firestore Database → Rules, paste the file's contents, click **Publish**. |
| `auth/operation-not-supported-in-this-environment` | Sign-in was attempted inside an iframe/embedded preview. | Open the deployed app in its own tab, not an embedded preview window. |
| `auth/network-request-failed` | The browser couldn't reach Google/Firebase. | Check your connection; also try disabling ad blockers/privacy extensions, which sometimes block Firebase/Google auth requests. |
| `failed-precondition` (from `enablePersistence`) | Offline cache couldn't start. | This is a warning, not fatal — it happens when the app is open in more than one tab. Safe to ignore, or close other tabs. |
| `firebase-init-failed` / "Firebase SDK/config missing" | The Firebase scripts never loaded at all. | Usually a network/ad-blocker issue, or the CDN `<script>` tags in `index.html` were edited/removed. Check the browser console for the actual failed request. |

If you see a different code, the banner text and browser console
(`Cloud sync error: ...`) will have the exact code and message — that's the
fastest way to pin it down further.

## iPhone/iPad: sign-in "does nothing" and reverts

This is a known iOS platform issue, not something misconfigured in Firebase.
This version now handles it as follows:

- **If you open the site in Safari directly** (not installed to your Home
  Screen): sign-in now tries a **popup** first on iOS instead of a full-page
  redirect. Redirect-based sign-in relies on Firebase reading data back from
  a different domain (`*.firebaseapp.com`) after the round trip, and iOS
  Safari's cross-site tracking protections frequently block that handshake
  silently — no error, it just "does nothing," which matches what you saw.
  A popup avoids that handshake entirely. If the popup is blocked, it falls
  back to redirect, and if *that* comes back with no session, you'll now see
  a clear on-screen message instead of silence.
- **If you installed the app to your Home Screen** (Add to Home Screen): Google
  sign-in **cannot complete inside that installed app on iOS** — this is an
  Apple WKWebView limitation, not something any code fix can work around.
  The app now detects this and tells you directly: open the site's URL in
  Safari itself (not the Home Screen icon), sign in there once, then reopen
  the installed app — since it's the same origin, it will already be signed
  in via the persisted session.

## 1. Firebase setup

This project is already configured for the Firebase project used by Inkleaf
Notes. The web client configuration is in `index.html`. Client-side Firebase
configuration is not a service-account secret; **never add a Firebase service
account private key to this repository**.

### Enable Google Authentication

In Firebase Console:

1. Open **Build → Authentication**.
2. Click **Get started** if necessary.
3. Open **Sign-in method**.
4. Enable **Google** and choose the support email.

### Enable Firestore

In Firebase Console:

1. Open **Build → Firestore Database**.
2. Click **Create database**.
3. Choose **Production mode**.
4. Select a suitable database region.

### Add your GitHub Pages domain

In **Authentication → Settings → Authorized domains**, add the domain used by
your GitHub Pages site, for example:

```text
ben-subalisid.github.io
```

Use your actual GitHub Pages domain. `localhost` can remain authorized for local
development.

## 2. Firestore Security Rules

Use rules like the following in **Firestore Database → Rules**. They ensure that
each signed-in user can only access their own notes.

```text
// See firestore.rules in this repository.
```

The included `firestore.rules` file contains the complete rules. Paste those
rules into the Firebase Console and click **Publish**.

## 3. Run locally

No build step is required. Any static file server works, for example:

```bash
cd notepad-pwa
python3 -m http.server 8080
```

Open `http://localhost:8080`. Opening `index.html` directly via `file://` is not
suitable for Firebase Authentication or the service worker.

## 4. Deploy to GitHub Pages

1. Create a GitHub repository and push the contents of this folder to its root.

```bash
git init
git add .
git commit -m "Inkleaf Notes PWA with Firebase sync"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

2. In GitHub, open **Settings → Pages**.
3. Choose **Deploy from a branch**.
4. Select `main` and `/ (root)`.
5. Save.

Your PWA will be available at:

```text
https://<your-username>.github.io/<your-repo>/
```

Then use your browser's **Install app** / **Add to Home Screen** option.

## 5. How synchronization works

Notes are stored as:

```text
users/{firebaseUser.uid}/notes/{noteId}
```

The app keeps a local cache for offline use and listens to the user's Firestore
notes collection for real-time changes. Guest mode still uses local storage.

## Features

- Rich text editing: headings, quote, code block, tables, bold/italic/underline/strikethrough, alignment, lists, text color, highlighting, links, and clear formatting.
- Sidebar organization: All Notes / Favorites / Recent plus five folders.
- Autosave approximately 600 ms after typing stops.
- Google sign-in through Firebase Authentication.
- Cross-device synchronization through Cloud Firestore.
- Offline Firestore/local caching.
- Installable PWA for phones, tablets, and desktops.
- GitHub Pages compatible; no build process required.
