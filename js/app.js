(() => {
  "use strict";

  // ---------- Folders (fixed, color-coded categories) ----------
  const FOLDERS = [
    { id: "school", label: "School", color: "#2F6FED" },
    { id: "work", label: "Work", color: "#7A5AF8" },
    { id: "personal", label: "Personal", color: "#F04438" },
    { id: "ideas", label: "Ideas", color: "#FDB022" },
    { id: "finance", label: "Finance", color: "#12B76A" },
  ];
  const folderById = (id) => FOLDERS.find((f) => f.id === id) || null;

  // ---------- Elements ----------
  const editor = document.getElementById("editor");
  const noteTitle = document.getElementById("noteTitle");
  const noteDate = document.getElementById("noteDate");
  const noteList = document.getElementById("noteList");
  const searchInput = document.getElementById("searchInput");
  const newNoteBtn = document.getElementById("newNoteBtn");
  const saveStatus = document.getElementById("saveStatus");
  const wordCount = document.getElementById("wordCount");
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  const sidebarBackdrop = document.getElementById("sidebarBackdrop");
  const navSection = document.getElementById("navSection");
  const folderList = document.getElementById("folderList");
  const folderSelect = document.getElementById("folderSelect");
  const favoriteBtn = document.getElementById("favoriteBtn");
  const deleteNoteBtn = document.getElementById("deleteNoteBtn");
  const countAll = document.getElementById("countAll");
  const countFav = document.getElementById("countFav");
  const countRecent = document.getElementById("countRecent");
  const blockFormat = document.getElementById("blockFormat");
  const fontSize = document.getElementById("fontSize");
  const textColor = document.getElementById("textColor");
  const highlightColor = document.getElementById("highlightColor");
  const signedOutBox = document.getElementById("signedOutBox");
  const signedInBox = document.getElementById("signedInBox");
  const signInBtn = document.getElementById("signInBtn");
  const signOutBtn = document.getElementById("signOutBtn");
  const userAvatar = document.getElementById("userAvatar");
  const userName = document.getElementById("userName");
  const authModal = document.getElementById("authModal");
  const authModalSignInBtn = document.getElementById("authModalSignInBtn");
  const authContinueBtn = document.getElementById("authContinueBtn");
  const authCloseBtn = document.getElementById("authCloseBtn");
  const accountChip = document.getElementById("accountChip");
  const accountChipBtn = document.getElementById("accountChipBtn");
  const chipAvatar = document.getElementById("chipAvatar");
  const chipLabel = document.getElementById("chipLabel");
  const accountMenu = document.getElementById("accountMenu");
  const accountMenuName = document.getElementById("accountMenuName");
  const accountMenuSub = document.getElementById("accountMenuSub");
  const accountMenuSignIn = document.getElementById("accountMenuSignIn");
  const accountMenuSignOut = document.getElementById("accountMenuSignOut");
  const syncBanner = document.getElementById("syncBanner");
  const syncBannerText = document.getElementById("syncBannerText");
  const syncBannerRetry = document.getElementById("syncBannerRetry");
  const syncBannerDismiss = document.getElementById("syncBannerDismiss");
  let authPromptDismissed = sessionStorage.getItem("inkleaf.authPromptDismissed") === "1";
  let authStateResolved = false;

  // Wait for Firebase to restore the previous login before showing signed-out UI.
  // This prevents the sign-in prompt from flashing on reload when the user is already signed in.
  signedOutBox.classList.add("hidden");
  signedInBox.classList.add("hidden");

  // ---------- Firebase + local storage ----------
  const GUEST_KEY = "guest";
  let currentUserKey = GUEST_KEY;
  const storageKey = () => `inkleaf.notes.${currentUserKey}`;

  let firebaseReady = false;
  let firebaseAuth = null;
  let firestore = null;
  let firebaseUser = null;
  let unsubscribeNotes = null;
  let cloudSyncStarted = false;
  let applyingCloudSnapshot = false;

  function loadNotes() {
    try {
      const raw = localStorage.getItem(storageKey());
      const parsed = raw ? JSON.parse(raw) : [];
      return parsed.map((n) => ({ folder: null, pinned: false, ...n }));
    } catch (e) {
      console.error("Failed to load notes", e);
      return [];
    }
  }

  function persistNotes() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(notes));
    } catch (e) {
      console.error("Failed to persist notes locally", e);
    }
  }

  // ---------- Friendly error messages ----------
  function friendlyAuthError(code) {
    const map = {
      "auth/unauthorized-domain": "This site's domain isn't authorized for Google sign-in yet. In the Firebase console, go to Authentication → Settings → Authorized domains and add this domain.",
      "auth/operation-not-supported-in-this-environment": "Google sign-in doesn't work inside an embedded preview or iframe. Open this app in its own browser tab and try again.",
      "auth/network-request-failed": "Couldn't reach Google/Firebase. Check your internet connection, or an ad blocker/privacy extension may be blocking the request.",
      "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow popups for this site and try again.",
      "auth/web-storage-unsupported": "Your browser is blocking the storage sign-in needs — this happens in some private/incognito modes or with strict cookie-blocking settings.",
      "auth/cancelled-popup-request": null,
      "auth/popup-closed-by-user": null,
    };
    return map[code] ?? null;
  }

  function friendlySyncError(code) {
    const map = {
      "permission-denied": "Firestore is rejecting these reads/writes. Make sure the rules in firestore.rules have been pasted into Firebase Console → Firestore Database → Rules and published.",
      "unavailable": "Can't reach Firestore right now — check your connection.",
      "failed-precondition": "Offline storage couldn't start, often because this app is open in more than one tab. Close other tabs and reload.",
      "unauthenticated": "Your sign-in session expired. Try signing in again.",
      "resource-exhausted": "Firestore's free-tier quota may have been hit for today.",
    };
    return map[code] ?? null;
  }

  // ---------- Sync status: topbar text + account chip dot + error banner ----------
  let lastSyncError = null;

  function setChipStatus(status) {
    accountChip.classList.remove("status-synced", "status-syncing", "status-error", "status-local");
    accountChip.classList.add(`status-${status}`);
  }

  function showSyncBanner(err) {
    const code = err?.code || "unknown-error";
    const friendly = friendlySyncError(code);
    syncBannerText.textContent = friendly || `Couldn't sync to the cloud (${code}). Your notes are still saved on this device.`;
    syncBanner.classList.remove("hidden");
  }
  function hideSyncBanner() { syncBanner.classList.add("hidden"); }

  function setCloudStatus(state, err) {
    if (state === "syncing") {
      saveStatus.textContent = "Syncing…";
      saveStatus.classList.remove("saved", "offline");
      saveStatus.classList.add("saving");
      setChipStatus("syncing");
      hideSyncBanner();
    } else if (state === "offline") {
      setSaveStatus("offline");
      setChipStatus(firebaseUser ? "syncing" : "local");
    } else if (state === "error") {
      saveStatus.textContent = "Saved locally • sync error";
      saveStatus.classList.remove("saving", "saved");
      saveStatus.classList.add("offline");
      setChipStatus("error");
      lastSyncError = err || null;
      if (err) console.error("Cloud sync error:", err.code || err);
      showSyncBanner(err);
    } else {
      setSaveStatus(navigator.onLine ? "saved" : "offline");
      setChipStatus(firebaseUser ? "synced" : "local");
      hideSyncBanner();
    }
  }

  syncBannerDismiss.addEventListener("click", hideSyncBanner);
  syncBannerRetry.addEventListener("click", () => {
    hideSyncBanner();
    if (firebaseUser) {
      cloudSyncStarted = false;
      startCloudSync(notes.slice());
    } else {
      setCloudStatus("saved");
    }
  });

  function noteRef(noteId) {
    if (!firebaseUser || !firestore) return null;
    return firestore.collection("users").doc(firebaseUser.uid).collection("notes").doc(noteId);
  }

  async function writeNoteToCloud(note) {
    if (!firebaseUser || !firestore || applyingCloudSnapshot) return;
    try {
      setCloudStatus("syncing");
      await noteRef(note.id).set({
        id: note.id,
        title: note.title || "",
        content: note.content || "",
        folder: note.folder || null,
        pinned: !!note.pinned,
        createdAt: Number(note.createdAt) || Date.now(),
        updatedAt: Number(note.updatedAt) || Date.now(),
      }, { merge: true });
      setCloudStatus("saved");
    } catch (e) {
      console.error("Cloud note save failed", e);
      setCloudStatus("error", e);
    }
  }

  async function deleteNoteFromCloud(noteId) {
    if (!firebaseUser || !firestore || applyingCloudSnapshot) return;
    try {
      setCloudStatus("syncing");
      await noteRef(noteId).delete();
      setCloudStatus("saved");
    } catch (e) {
      console.error("Cloud note delete failed", e);
      setCloudStatus("error", e);
    }
  }

  function queueCloudWrite(note) {
    if (firebaseUser) writeNoteToCloud(note);
  }

  async function mergeLocalNotesIntoCloud(localNotes, cloudDocs) {
    const merged = new Map(cloudDocs.map((n) => [n.id, n]));
    for (const local of localNotes) {
      const cloud = merged.get(local.id);
      if (!cloud || Number(local.updatedAt || 0) > Number(cloud.updatedAt || 0)) {
        merged.set(local.id, local);
      }
    }
    const result = [...merged.values()];
    const batch = firestore.batch();
    for (const note of result) {
      const ref = noteRef(note.id);
      batch.set(ref, {
        id: note.id, title: note.title || "", content: note.content || "",
        folder: note.folder || null, pinned: !!note.pinned,
        createdAt: Number(note.createdAt) || Date.now(),
        updatedAt: Number(note.updatedAt) || Date.now(),
      }, { merge: true });
    }
    if (result.length) await batch.commit();
    return result;
  }

  async function startCloudSync(localNotesBeforeSignIn) {
    if (!firebaseUser || !firestore || cloudSyncStarted) return;
    cloudSyncStarted = true;
    setCloudStatus("syncing");
    try {
      const snap = await firestore.collection("users").doc(firebaseUser.uid).collection("notes").get();
      const cloudNotes = snap.docs.map((d) => ({ folder: null, pinned: false, ...d.data(), id: d.id }));

      // First sign-in: preserve local notes by merging them into the cloud.
      if (localNotesBeforeSignIn.length && !snap.size) {
        notes = await mergeLocalNotesIntoCloud(localNotesBeforeSignIn, []);
        persistNotes();
      } else if (localNotesBeforeSignIn.length) {
        notes = await mergeLocalNotesIntoCloud(localNotesBeforeSignIn, cloudNotes);
        persistNotes();
      } else {
        notes = cloudNotes;
        persistNotes();
      }

      activeId = notes[0]?.id ?? null;
      renderAll();

      if (unsubscribeNotes) unsubscribeNotes();
      unsubscribeNotes = firestore.collection("users").doc(firebaseUser.uid).collection("notes")
        .onSnapshot((snapshot) => {
          applyingCloudSnapshot = true;
          try {
            notes = snapshot.docs.map((d) => ({ folder: null, pinned: false, ...d.data(), id: d.id }))
              .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
            persistNotes();
            if (!getNote(activeId)) activeId = notes[0]?.id ?? null;
            renderAll();
            setCloudStatus("saved");
          } finally {
            applyingCloudSnapshot = false;
          }
        }, (error) => {
          console.error("Cloud sync listener failed", error);
          setCloudStatus("error", error);
        });
    } catch (e) {
      console.error("Cloud sync initialization failed", e);
      // Keep local notes usable even if Firestore is temporarily unavailable.
      notes = localNotesBeforeSignIn;
      persistNotes();
      activeId = notes[0]?.id ?? null;
      renderAll();
      setCloudStatus("error", e);
    }
  }

  async function initFirebase() {
    try {
      if (!window.firebase || !window.FIREBASE_CONFIG) throw new Error("Firebase SDK/config missing");
      const app = firebase.initializeApp(window.FIREBASE_CONFIG);
      firebaseAuth = firebase.auth();
      firestore = firebase.firestore();
      firebaseReady = true;

      // Firestore's local persistence keeps notes available offline and queues writes.
      try { await firestore.enablePersistence({ synchronizeTabs: true }); }
      catch (e) { console.warn("Firestore persistence could not be enabled:", e.code || e); }

      try {
        await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      } catch (e) {
        console.warn("Auth persistence could not be enabled:", e.code || e);
      }

      // Complete a redirect sign-in if Google returned to this GitHub Pages app.
      try {
        await firebaseAuth.getRedirectResult();
      } catch (e) {
        console.error("getRedirectResult failed:", e?.code || e);
        if (e && e.code) showAuthError(e);
      }

      firebaseAuth.onAuthStateChanged(async (user) => {
        authStateResolved = true;
        if (unsubscribeNotes) { unsubscribeNotes(); unsubscribeNotes = null; }
        cloudSyncStarted = false;
        firebaseUser = user;

        if (user) {
          const localBefore = notes.slice();
          currentUserKey = user.uid;
          notes = loadNotes();

          // Migrate notes from the previous email-namespaced version of the app
          // when available. This also preserves notes created before Firebase sync.
          if (!notes.length && user.email) {
            try {
              const legacyRaw = localStorage.getItem(`inkleaf.notes.${user.email}`);
              if (legacyRaw) {
                const legacyNotes = JSON.parse(legacyRaw);
                if (Array.isArray(legacyNotes)) notes = legacyNotes.map((n) => ({ folder: null, pinned: false, ...n }));
              }
            } catch (e) { console.warn("Could not migrate legacy notes:", e); }
          }

          // If the UID cache and legacy cache are empty, use the notes that were on screen before login.
          if (!notes.length && localBefore.length) notes = localBefore;
          persistNotes();
          applySignedInUI({
            name: user.displayName || "Signed in",
            email: user.email || "",
            picture: user.photoURL || ""
          });
          activeId = notes[0]?.id ?? null;
          renderAll();
          await startCloudSync(notes.slice());
        } else {
          currentUserKey = GUEST_KEY;
          notes = loadNotes();
          activeId = notes[0]?.id ?? null;
          applySignedOutUI();
          renderAll();
          if (!notes.length) createNote();
          // Give first-time visitors a clear, professional choice to enable sync.
          // Only offer sign-in after Firebase has definitively confirmed that no account is signed in.
          if (!authPromptDismissed) setTimeout(showAuthPrompt, 350);
        }
      });
    } catch (e) {
      console.error("Firebase initialization failed", e);
      firebaseReady = false;
      authStateResolved = true;
      applySignedOutUI();
      chipLabel.textContent = "Sync unavailable";
      accountMenuSub.textContent = "The Firebase SDK failed to load — sync is off. Notes are still saved on this device.";
      signInBtn.title = "Firebase could not be initialized. Check the Firebase configuration.";
      showSyncBanner({ code: e?.code || "firebase-init-failed", message: e?.message || String(e) });
    }
  }

  let notes = loadNotes();
  let activeId = notes[0]?.id ?? null;
  let currentView = "all"; // "all" | "favorites" | "recent" | { folder: id }

  // ---------- Utilities ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const RECENT_WINDOW = 7 * 86400000;

  function plainTextOf(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || "").trim();
  }

  function countWords(text) {
    const trimmed = text.trim();
    return trimmed ? trimmed.split(/\s+/).length : 0;
  }

  function formatRelativeTime(ts) {
    const diff = Date.now() - ts;
    const min = 60000, hr = 3600000, day = 86400000;
    if (diff < min) return "just now";
    if (diff < hr) return `${Math.floor(diff / min)}m ago`;
    if (diff < day) return `${Math.floor(diff / hr)}h ago`;
    if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  function formatFullDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  // ---------- Note CRUD ----------
  function getNote(id) { return notes.find((n) => n.id === id) || null; }

  function createNote() {
    const note = {
      id: uid(), title: "", content: "", folder: null, pinned: false,
      updatedAt: Date.now(), createdAt: Date.now(),
    };
    notes.unshift(note);
    persistNotes();
    queueCloudWrite(note);
    activeId = note.id;
    renderAll();
    closeSidebarMobile();
    noteTitle.focus();
  }

  function deleteNote(id) {
    notes = notes.filter((n) => n.id !== id);
    persistNotes();
    deleteNoteFromCloud(id);
    if (activeId === id) activeId = notes[0]?.id ?? null;
    renderAll();
  }

  function selectNote(id) {
    activeId = id;
    renderAll();
    closeSidebarMobile();
  }

  function toggleFavorite(id) {
    const note = getNote(id);
    if (!note) return;
    note.pinned = !note.pinned;
    persistNotes();
    queueCloudWrite(note);
    renderAll();
  }

  // ---------- Filtering ----------
  function notesForView() {
    if (currentView === "favorites") return notes.filter((n) => n.pinned);
    if (currentView === "recent") return notes.filter((n) => Date.now() - n.updatedAt < RECENT_WINDOW);
    if (currentView && typeof currentView === "object" && currentView.folder) {
      return notes.filter((n) => n.folder === currentView.folder);
    }
    return notes;
  }

  function applySearch(list) {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (n) => n.title.toLowerCase().includes(query) || plainTextOf(n.content).toLowerCase().includes(query)
    );
  }

  // ---------- Rendering ----------
  function renderCounts() {
    countAll.textContent = notes.length;
    countFav.textContent = notes.filter((n) => n.pinned).length;
    countRecent.textContent = notes.filter((n) => Date.now() - n.updatedAt < RECENT_WINDOW).length;
  }

  function renderNavActive() {
    navSection.querySelectorAll(".nav-item").forEach((btn) => {
      const isObjView = typeof currentView === "object";
      btn.classList.toggle("active", !isObjView && btn.dataset.view === currentView);
    });
    folderList.querySelectorAll(".folder-item").forEach((li) => {
      const isFolderView = typeof currentView === "object" && currentView.folder === li.dataset.folder;
      li.classList.toggle("active", isFolderView);
    });
  }

  function renderFolderList() {
    folderList.innerHTML = "";
    for (const f of FOLDERS) {
      const count = notes.filter((n) => n.folder === f.id).length;
      const li = document.createElement("li");
      li.className = "folder-item";
      li.dataset.folder = f.id;
      li.innerHTML = `
        <span class="folder-dot" style="background:${f.color}"></span>
        <span class="folder-name">${f.label}</span>
        <span class="nav-count">${count}</span>
      `;
      li.addEventListener("click", () => {
        currentView = { folder: f.id };
        renderAll();
      });
      folderList.appendChild(li);
    }
  }

  function renderNoteList() {
    const list = applySearch(notesForView()).sort((a, b) => b.updatedAt - a.updatedAt);
    noteList.innerHTML = "";

    if (list.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-list";
      li.textContent = searchInput.value.trim() ? "No notes match your search." : "No notes here yet.";
      noteList.appendChild(li);
      return;
    }

    for (const note of list) {
      const li = document.createElement("li");
      li.className = "note-item" + (note.id === activeId ? " active" : "");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(note.id === activeId));

      const title = document.createElement("div");
      title.className = "note-item-title";
      title.textContent = note.title || "Untitled note";

      const preview = document.createElement("div");
      preview.className = "note-item-preview";
      preview.textContent = plainTextOf(note.content) || "No additional text";

      const meta = document.createElement("div");
      meta.className = "note-item-meta";
      meta.textContent = formatRelativeTime(note.updatedAt);

      const star = document.createElement("button");
      star.className = "note-item-star" + (note.pinned ? " favorited" : "");
      star.setAttribute("aria-label", note.pinned ? "Remove from favorites" : "Add to favorites");
      star.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="${note.pinned ? "currentColor" : "none"}"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
      star.addEventListener("click", (e) => { e.stopPropagation(); toggleFavorite(note.id); });

      li.append(star, title, preview, meta);
      li.addEventListener("click", () => selectNote(note.id));
      noteList.appendChild(li);
    }
  }

  function renderFolderSelect() {
    folderSelect.innerHTML = `<option value="">No folder</option>` +
      FOLDERS.map((f) => `<option value="${f.id}">${f.label}</option>`).join("");
    const note = getNote(activeId);
    folderSelect.value = note?.folder || "";
    folderSelect.disabled = !note;
  }

  function renderEditor() {
    const note = getNote(activeId);
    if (!note) {
      noteTitle.value = "";
      noteDate.textContent = "";
      editor.innerHTML = "";
      noteTitle.disabled = true;
      editor.contentEditable = "false";
      favoriteBtn.disabled = true;
      deleteNoteBtn.disabled = true;
      updateWordCount("");
      return;
    }
    noteTitle.disabled = false;
    editor.contentEditable = "true";
    favoriteBtn.disabled = false;
    deleteNoteBtn.disabled = false;
    noteTitle.value = note.title;
    noteDate.textContent = formatFullDate(note.createdAt);
    editor.innerHTML = note.content;
    favoriteBtn.classList.toggle("favorited", !!note.pinned);
    favoriteBtn.querySelector("svg").setAttribute("fill", note.pinned ? "currentColor" : "none");
    updateWordCount(plainTextOf(note.content));
    setSaveStatus("saved");
  }

  function updateWordCount(text) {
    const n = countWords(text);
    wordCount.textContent = `${n} word${n === 1 ? "" : "s"}`;
  }

  function renderAll() {
    renderCounts();
    renderFolderList();
    renderNavActive();
    renderNoteList();
    renderFolderSelect();
    renderEditor();
  }

  // ---------- Autosave ----------
  let saveTimer = null;
  const SAVE_DELAY = 600;

  function setSaveStatus(state) {
    saveStatus.classList.remove("saving", "saved", "offline");
    if (state === "saving") { saveStatus.textContent = "Saving…"; saveStatus.classList.add("saving"); }
    else if (state === "offline") { saveStatus.textContent = "Saved locally (offline)"; saveStatus.classList.add("offline"); }
    else { saveStatus.textContent = "All changes saved"; saveStatus.classList.add("saved"); }
  }

  function scheduleSave() {
    setSaveStatus("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveActiveNote, SAVE_DELAY);
  }

  function saveActiveNote() {
    const note = getNote(activeId);
    if (!note) return;
    note.title = noteTitle.value;
    note.content = editor.innerHTML;
    note.updatedAt = Date.now();
    persistNotes();
    queueCloudWrite(note);
    renderCounts();
    renderFolderList();
    renderNoteList();
    updateWordCount(plainTextOf(note.content));
    setSaveStatus(navigator.onLine ? "saved" : "offline");
  }

  function flushSave() { clearTimeout(saveTimer); saveActiveNote(); }

  window.addEventListener("beforeunload", flushSave);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });
  noteTitle.addEventListener("input", scheduleSave);
  editor.addEventListener("input", scheduleSave);
  noteTitle.addEventListener("blur", flushSave);
  editor.addEventListener("blur", flushSave);
  window.addEventListener("online", () => setSaveStatus("saved"));
  window.addEventListener("offline", () => setSaveStatus("offline"));

  // ---------- Topbar actions ----------
  favoriteBtn.addEventListener("click", () => { if (activeId) toggleFavorite(activeId); });

  folderSelect.addEventListener("change", () => {
    const note = getNote(activeId);
    if (!note) return;
    note.folder = folderSelect.value || null;
    note.updatedAt = Date.now();
    persistNotes();
    queueCloudWrite(note);
    renderCounts();
    renderFolderList();
    renderNavActive();
    renderNoteList();
  });

  deleteNoteBtn.addEventListener("click", () => {
    const note = getNote(activeId);
    if (!note) return;
    if (confirm(`Delete "${note.title || "Untitled note"}"? This can't be undone.`)) deleteNote(note.id);
  });

  // ---------- Toolbar / formatting ----------
  document.querySelectorAll(".tb-btn[data-cmd]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const cmd = btn.dataset.cmd;
      editor.focus();
      if (cmd === "createLink") {
        const url = prompt("Link URL:", "https://");
        if (url) document.execCommand(cmd, false, url);
      } else if (cmd === "insertTable") {
        const rows = 3, cols = 3;
        let html = '<table><tbody>';
        for (let r = 0; r < rows; r++) {
          html += "<tr>";
          for (let c = 0; c < cols; c++) html += r === 0 ? "<th>Header</th>" : "<td>Cell</td>";
          html += "</tr>";
        }
        html += "</tbody></table><p><br></p>";
        document.execCommand("insertHTML", false, html);
      } else {
        document.execCommand(cmd, false, null);
      }
      scheduleSave();
      syncToolbarState();
    });
  });

  blockFormat.addEventListener("change", () => {
    editor.focus();
    document.execCommand("formatBlock", false, `<${blockFormat.value}>`);
    scheduleSave();
  });
  fontSize.addEventListener("change", () => {
    editor.focus();
    document.execCommand("fontSize", false, fontSize.value);
    scheduleSave();
  });
  textColor.addEventListener("input", () => {
    editor.focus();
    document.execCommand("foreColor", false, textColor.value);
    scheduleSave();
  });
  highlightColor.addEventListener("input", () => {
    editor.focus();
    document.execCommand("hiliteColor", false, highlightColor.value);
    scheduleSave();
  });

  function syncToolbarState() {
    ["bold", "italic", "underline", "strikeThrough", "justifyLeft", "justifyCenter"].forEach((cmd) => {
      const btn = document.querySelector(`.tb-btn[data-cmd="${cmd}"]`);
      if (!btn) return;
      try { btn.classList.toggle("active", document.queryCommandState(cmd)); } catch (e) { /* ignore */ }
    });
  }
  editor.addEventListener("keyup", syncToolbarState);
  editor.addEventListener("mouseup", syncToolbarState);
  editor.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); flushSave(); }
  });

  // ---------- Nav / folders / search ----------
  newNoteBtn.addEventListener("click", createNote);
  searchInput.addEventListener("input", renderNoteList);
  navSection.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => { currentView = btn.dataset.view; renderAll(); });
  });

  // ---------- Mobile sidebar drawer ----------
  function isMobile() { return window.matchMedia("(max-width: 900px)").matches; }
  function openSidebarMobile() {
    sidebar.classList.add("open");
    if (isMobile()) { sidebarBackdrop.classList.add("open"); sidebarToggle.classList.add("hidden"); }
  }
  function closeSidebarMobile() {
    if (isMobile()) {
      sidebar.classList.remove("open");
      sidebarBackdrop.classList.remove("open");
      sidebarToggle.classList.remove("hidden");
    }
  }
  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.contains("open") ? closeSidebarMobile() : openSidebarMobile();
  });
  sidebarBackdrop.addEventListener("click", closeSidebarMobile);

  // ---------- Firebase Google Sign-In ----------
  const AUTH_MODAL_TITLE_EL = document.getElementById("authModalTitle");
  const AUTH_MODAL_TEXT_EL = document.getElementById("authModalText");
  const AUTH_MODAL_DEFAULT_TITLE = AUTH_MODAL_TITLE_EL?.textContent || "";
  const AUTH_MODAL_DEFAULT_TEXT = AUTH_MODAL_TEXT_EL?.innerHTML || "";

  function resetAuthModalCopy() {
    if (AUTH_MODAL_TITLE_EL) AUTH_MODAL_TITLE_EL.textContent = AUTH_MODAL_DEFAULT_TITLE;
    if (AUTH_MODAL_TEXT_EL) AUTH_MODAL_TEXT_EL.innerHTML = AUTH_MODAL_DEFAULT_TEXT;
  }

  function applySignedInUI(profile) {
    signedOutBox.classList.add("hidden");
    signedInBox.classList.remove("hidden");
    userAvatar.src = profile.picture || "";
    userAvatar.alt = profile.name || profile.email || "Account";
    userName.textContent = profile.name || profile.email || "Signed in";

    accountChip.classList.add("signed-in");
    if (profile.picture) {
      chipAvatar.src = profile.picture;
      chipAvatar.classList.remove("hidden");
    } else {
      chipAvatar.classList.add("hidden");
    }
    chipLabel.textContent = profile.name || profile.email || "Signed in";
    accountMenuName.textContent = profile.name || "Signed in";
    accountMenuSub.textContent = profile.email ? `Synced as ${profile.email}` : "Synced across your devices";
    accountMenuSignIn.classList.add("hidden");
    accountMenuSignOut.classList.remove("hidden");
    setChipStatus("synced");
    resetAuthModalCopy();
  }

  function applySignedOutUI() {
    signedInBox.classList.add("hidden");
    signedOutBox.classList.remove("hidden");

    accountChip.classList.remove("signed-in");
    chipAvatar.classList.add("hidden");
    chipLabel.textContent = "Not signed in";
    accountMenuName.textContent = "Not signed in";
    accountMenuSub.textContent = "Notes are saved on this device only.";
    accountMenuSignIn.classList.remove("hidden");
    accountMenuSignOut.classList.add("hidden");
    setChipStatus("local");
  }

  function closeAccountMenu() {
    accountMenu.classList.add("hidden");
    accountChipBtn.setAttribute("aria-expanded", "false");
  }
  function toggleAccountMenu() {
    const isHidden = accountMenu.classList.contains("hidden");
    if (isHidden) {
      accountMenu.classList.remove("hidden");
      accountChipBtn.setAttribute("aria-expanded", "true");
    } else {
      closeAccountMenu();
    }
  }
  accountChipBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleAccountMenu(); });
  document.addEventListener("click", (e) => { if (!accountChip.contains(e.target)) closeAccountMenu(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAccountMenu(); });

  function showAuthPrompt() {
    if (!authModal || authPromptDismissed || firebaseUser || !authStateResolved) return;
    authModal.hidden = false;
    document.body.classList.add("auth-open");
    setTimeout(() => authModalSignInBtn?.focus(), 60);
  }

  function hideAuthPrompt(remember = true) {
    if (!authModal) return;
    authModal.hidden = true;
    document.body.classList.remove("auth-open");
    resetAuthModalCopy();
    if (remember) {
      authPromptDismissed = true;
      sessionStorage.setItem("inkleaf.authPromptDismissed", "1");
    }
  }

  function showAuthError(error) {
    const code = error?.code || "unknown-error";
    const message = error?.message || "An unknown authentication error occurred.";
    console.error("Google sign-in failed:", { code, message, error });
    setChipStatus("error");

    const hint = friendlyAuthError(code);
    if (hint === null && (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request")) {
      return; // User-initiated cancellation — not a real error, nothing to show.
    }

    // Keep the error inside the app instead of using a browser alert.
    if (authModal) {
      if (AUTH_MODAL_TITLE_EL) AUTH_MODAL_TITLE_EL.textContent = "We couldn't sign you in.";
      if (AUTH_MODAL_TEXT_EL) {
        const escaped = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        AUTH_MODAL_TEXT_EL.innerHTML = hint
          ? `${hint}<br><small>Error code: <code>${code}</code></small>`
          : `Please try again. <strong>Error:</strong> ${code}.<br><small>${escaped}</small>`;
      }
      authModal.hidden = false;
      document.body.classList.add("auth-open");
      setTimeout(() => authModalSignInBtn?.focus(), 60);
    } else {
      alert(`Google sign-in failed: ${code}\n${message}`);
    }
  }

  async function signInWithGoogle() {
    if (!firebaseReady || !firebaseAuth) {
      showAuthError({ code: "firebase-not-ready", message: "Firebase is still loading, or its SDK failed to load (check ad blockers / network). Please try again in a moment." });
      return;
    }

    try {
      signInBtn.disabled = true;
      if (authModalSignInBtn) authModalSignInBtn.disabled = true;
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });

      // Redirect is used for every device. It avoids popup blockers and is reliable
      // on desktop, iPhone, iPad, and Android when hosted on GitHub Pages.
      await firebaseAuth.signInWithRedirect(provider);
    } catch (e) {
      if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
        showAuthError(e);
      }
      signInBtn.disabled = false;
      if (authModalSignInBtn) authModalSignInBtn.disabled = false;
    }
  }

  async function doSignOut() {
    try {
      if (firebaseAuth) await firebaseAuth.signOut();
    } catch (e) {
      console.error("Sign out failed", e);
    }
  }

  signInBtn.addEventListener("click", signInWithGoogle);
  authModalSignInBtn?.addEventListener("click", signInWithGoogle);
  authContinueBtn?.addEventListener("click", () => hideAuthPrompt(true));
  authCloseBtn?.addEventListener("click", () => hideAuthPrompt(true));
  accountMenuSignIn.addEventListener("click", () => { closeAccountMenu(); signInWithGoogle(); });
  accountMenuSignOut.addEventListener("click", () => { closeAccountMenu(); doSignOut(); });
  signOutBtn.addEventListener("click", doSignOut);

  authModal?.querySelector(".auth-modal-backdrop")?.addEventListener("click", () => hideAuthPrompt(true));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && authModal && !authModal.hidden) hideAuthPrompt(true);
  });

  // ---------- Service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker registration failed:", err));
    });
  }

  // ---------- Init ----------
  // Firebase owns authentication and cross-device synchronization. Guest mode
  // continues to use localStorage until the user signs in.
  applySignedOutUI();
  if (notes.length === 0) createNote();
  else renderAll();
  window.addEventListener("load", initFirebase);
})();
