"use strict";
// Konto & Synchronisierung: Firebase Auth (E-Mail/Passwort) + Firestore (kostenloser Spark-Tarif).
// Die App arbeitet immer lokal weiter; die Cloud gleicht im Hintergrund ab. Ohne Konfiguration bleibt alles lokal.
(() => {
  const CDN = "https://www.gstatic.com/firebasejs/10.14.1/", MAXPKT = 4000;
  const cfg = window.FIREBASE_CONFIG || {};
  const konfiguriert = !!(cfg.apiKey && cfg.projectId && cfg.appId);
  const adminUid = cfg.adminUid || ""; // gesetzt = Freigabe-Modus: nur freigeschaltete Konten synchronisieren
  const E = id => document.getElementById(id);
  let fb = null, user = null, timer = null, laeuft = false, nochmal = false, freigegeben = false, angefragt = false;

  const status = (t, fehler) => { E("cStatus").textContent = t; E("cStatus").style.color = fehler ? "var(--gef)" : ""; };
  const meldung = e => ({
    "auth/invalid-credential": "E-Mail oder Passwort ist falsch.", "auth/wrong-password": "E-Mail oder Passwort ist falsch.",
    "auth/user-not-found": "E-Mail oder Passwort ist falsch.", "auth/invalid-email": "Die E-Mail-Adresse ist ungültig.",
    "auth/email-already-in-use": "Diese E-Mail ist schon registriert. Bitte anmelden.", "auth/weak-password": "Das Passwort ist zu kurz (mindestens 6 Zeichen).",
    "auth/network-request-failed": "Keine Verbindung. Bitte später erneut versuchen.", "auth/too-many-requests": "Zu viele Versuche. Bitte kurz warten.",
    "permission-denied": "Zugriff verweigert. Bitte die Firestore-Regeln prüfen."
  }[e?.code] || e?.message || "Unbekannter Fehler.");

  function ansicht() {
    E("cNote").hidden = konfiguriert;
    E("cOff").hidden = !konfiguriert || !!user;
    E("cOn").hidden = !user;
    if (user) { E("cMail").textContent = user.email; E("cUid").textContent = user.uid; }
    E("cAdmin").hidden = !(user && adminUid && user.uid === adminUid);
  }

  async function laden() {
    if (fb) return fb;
    const [app, auth, fs] = await Promise.all(["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map(f => import(CDN + f)));
    const a = app.initializeApp(cfg);
    fb = { auth: auth.getAuth(a), A: auth, db: fs.getFirestore(a), F: fs };
    return fb;
  }

  // Firestore: max. 1 MB je Dokument, deshalb sehr lange Tracks für die Cloud ausdünnen
  const bereinigt = f => {
    const t = f.track || [], s = Math.ceil(t.length / MAXPKT);
    const k = t.length <= MAXPKT ? f : { ...f, track: t.filter((_, i) => i % s === 0 || i === t.length - 1) };
    return JSON.parse(JSON.stringify(k)); // entfernt undefined
  };

  async function abgleichen() {
    if (!user) return;
    if (laeuft) { nochmal = true; return; }
    laeuft = true; status("Synchronisiere …");
    try {
      const { db, F } = await laden();
      if (adminUid && user.uid !== adminUid && !freigegeben) { // Freigabe prüfen, sonst Anfrage an den Administrator
        const fr = await F.getDoc(F.doc(db, "freigaben", user.uid));
        if (!fr.exists()) {
          if (!angefragt) { await F.setDoc(F.doc(db, "anfragen", user.uid), { email: user.email, zeit: Date.now() }, { merge: true }); angefragt = true; }
          status("Dein Konto wartet auf Freischaltung durch den Administrator. Bis dahin arbeitet die App lokal weiter.");
          laeuft = false; return;
        }
        freigegeben = true;
      }
      const metaRef = F.doc(db, "users", user.uid), col = F.collection(db, "users", user.uid, "fluege");
      const [metaSnap, snap] = await Promise.all([F.getDoc(metaRef), F.getDocs(col)]);
      const meta = metaSnap.exists() ? metaSnap.data() : {};
      const cloud = new Map(snap.docs.map(d => [d.id, d.data()]));
      const lokal = load("fluege", []), lmap = new Map(lokal.map(f => [f.id, f]));
      const tote = new Set([...(meta.geloescht || []), ...load("geloescht", [])]);
      const neu = [], hoch = [];
      new Set([...cloud.keys(), ...lmap.keys()]).forEach(id => {
        if (tote.has(id)) return;
        const l = lmap.get(id), c = cloud.get(id);
        if (l && (!c || (l.bearbeitet || 0) >= (c.bearbeitet || 0))) { neu.push(l); if (!c || (l.bearbeitet || 0) > (c.bearbeitet || 0)) hoch.push(l); }
        else neu.push(c);
      });
      const hat = o => Object.values(o || {}).some(Boolean); // gibt es überhaupt Einstellungen?
      let lz = +localStorage.getItem("metaZeit") || 0;
      const cz = meta.updatedAt || 0;
      if (!lz && hat(load("stammdaten", {}))) { lz = Date.now(); localStorage.setItem("metaZeit", String(lz)); } // schon vorhandene Einstellungen gelten als aktuell
      const cloudNeuer = cz > lz || (!lz && hat(meta.stammdaten)); // frisches Gerät übernimmt die Einstellungen aus der Cloud
      localStorage.setItem("geloescht", JSON.stringify([...tote]));
      if (cloudNeuer) localStorage.setItem("metaZeit", String(cz));
      cloudUebernehmen({ fluege: neu, ...(cloudNeuer ? { stamm: meta.stammdaten, mon: meta.monitor, theme: meta.theme } : {}) });
      for (const f of hoch) await F.setDoc(F.doc(col, f.id), bereinigt(f));
      for (const id of tote) if (cloud.has(id)) await F.deleteDoc(F.doc(col, id));
      await F.setDoc(metaRef, { geloescht: [...tote], updatedAt: cloudNeuer ? cz : lz, stammdaten: load("stammdaten", {}), monitor: load("monitorEinstellungen", {}), theme: load("theme", null) }, { merge: true });
      localStorage.setItem("localUid", user.uid);
      status(`Zuletzt synchronisiert: ${new Date().toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })} · ${neu.length} Fahrten`);
    } catch (e) { status(meldung(e), true); }
    laeuft = false;
    if (nochmal) { nochmal = false; abgleichen(); }
  }

  // wird von app.js nach jedem lokalen Speichern aufgerufen
  window.cloudGeaendert = k => {
    if (!["fluege", "geloescht"].includes(k)) localStorage.setItem("metaZeit", String(Date.now()));
    if (!user) return;
    clearTimeout(timer); timer = setTimeout(abgleichen, 3000);
  };

  // Schutz: Daten eines anderen Kontos dürfen nie in dieses Konto hochgeladen werden
  function kontoPruefen() {
    const lu = localStorage.getItem("localUid");
    if (!lu || lu === user.uid) return true;
    if (!confirm("Auf diesem Gerät liegen Daten eines anderen Kontos. Sie werden hier entfernt und durch die Daten dieses Kontos ersetzt. Fortfahren?")) return false;
    ["fluege", "stammdaten", "monitorEinstellungen", "geloescht", "metaZeit", "localUid"].forEach(k => localStorage.removeItem(k));
    cloudUebernehmen({ fluege: [], stamm: {}, mon: { zeitraumMonate: 24, erforderlicheStunden: 6, erforderlicheLandungen: 10 } });
    return true;
  }

  // Administrator: Anfragen freischalten oder ablehnen, Freigaben sperren
  async function adminLaden() {
    try {
      const { db, F } = await laden();
      const [a, f] = await Promise.all([F.getDocs(F.collection(db, "anfragen")), F.getDocs(F.collection(db, "freigaben"))]);
      const frei = new Map(f.docs.map(d => [d.id, d.data()])), offen = a.docs.filter(d => !frei.has(d.id));
      const b = (akt, uid, mail, t, c = "") => `<button data-a="${akt}" data-uid="${esc(uid)}" data-mail="${esc(mail || "")}"${c ? ` class="${c}"` : ""} style="min-height:36px;padding:0 12px">${t}</button>`;
      const z = (uid, mail, knoepfe) => `<div class="zeile"><span>${esc(mail || uid)}</span><span>${knoepfe}</span></div>`;
      E("aListe").innerHTML = "<h3>Offene Anfragen</h3>" + (offen.length ? offen.map(d => z(d.id, d.data().email, b("ok", d.id, d.data().email, "Freischalten", "ok") + " " + b("nein", d.id, "", "Ablehnen"))).join("") : '<p class="note">Keine offenen Anfragen.</p>') +
        '<h3 style="margin-top:14px">Freigeschaltet</h3>' + (frei.size ? [...frei].map(([uid, x]) => z(uid, x.email, b("sperr", uid, "", "Sperren", "gef"))).join("") : '<p class="note">Noch niemand freigeschaltet.</p>');
    } catch (e) { E("aListe").textContent = meldung(e); }
  }
  async function adminAktion(e) {
    const bt = e.target.closest("button");
    if (!bt) return;
    try {
      const { db, F } = await laden(), uid = bt.dataset.uid;
      if (bt.dataset.a === "ok") { await F.setDoc(F.doc(db, "freigaben", uid), { email: bt.dataset.mail, zeit: Date.now() }); await F.deleteDoc(F.doc(db, "anfragen", uid)); }
      else if (bt.dataset.a === "nein") await F.deleteDoc(F.doc(db, "anfragen", uid));
      else if (bt.dataset.a === "sperr" && confirm("Den Zugang für dieses Konto sperren?")) await F.deleteDoc(F.doc(db, "freigaben", uid));
    } catch (err) { status(meldung(err), true); }
    adminLaden();
  }

  async function anmelden(neu) {
    const mail = E("cEmail").value.trim(), pw = E("cPass").value;
    if (!mail || !pw) return status("Bitte E-Mail und Passwort eingeben.", true);
    try {
      const { auth, A } = await laden();
      status(neu ? "Konto wird erstellt …" : "Anmeldung …");
      await (neu ? A.createUserWithEmailAndPassword(auth, mail, pw) : A.signInWithEmailAndPassword(auth, mail, pw));
      E("cPass").value = "";
    } catch (e) { status(meldung(e), true); }
  }

  async function start() {
    ansicht();
    if (!konfiguriert) return;
    E("cLogin").onclick = () => anmelden(false);
    E("cReg").onclick = () => anmelden(true);
    E("cReset").onclick = async () => {
      const mail = E("cEmail").value.trim();
      if (!mail) return status("Bitte zuerst die E-Mail-Adresse eingeben.", true);
      try { const { auth, A } = await laden(); await A.sendPasswordResetEmail(auth, mail); status("E-Mail zum Zurücksetzen wurde gesendet."); } catch (e) { status(meldung(e), true); }
    };
    E("cSync").onclick = abgleichen;
    E("aListe").onclick = adminAktion; E("aRefresh").onclick = adminLaden;
    E("cOut").onclick = async () => { const { auth, A } = await laden(); await A.signOut(auth); status("Abgemeldet. Die Daten bleiben auf diesem Gerät."); };
    window.addEventListener("online", abgleichen);
    try {
      const { auth, A } = await laden();
      A.onAuthStateChanged(auth, async u => {
        user = u; freigegeben = false; angefragt = false; ansicht();
        if (!u) return;
        if (adminUid && u.uid === adminUid) adminLaden();
        if (!kontoPruefen()) { await A.signOut(auth); return; }
        abgleichen();
      });
    } catch { status("Cloud derzeit nicht erreichbar. Die App arbeitet lokal weiter."); }
  }
  start();
})();
