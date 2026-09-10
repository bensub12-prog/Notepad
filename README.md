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
