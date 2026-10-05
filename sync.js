"use strict";
// Konto & Synchronisierung: Firebase Auth (E-Mail/Passwort) + Firestore (kostenloser Spark-Tarif).
// Die App arbeitet immer lokal weiter; die Cloud gleicht im Hintergrund ab. Ohne Konfiguration bleibt alles lokal.
(() => {
  const CDN = "https://www.gstatic.com/firebasejs/10.14.1/", MAXPKT = 4000;
  const cfg = window.FIREBASE_CONFIG || {};
  const konfiguriert = !!(cfg.apiKey && cfg.projectId && cfg.appId);
  const E = id => document.getElementById(id);
  let fb = null, user = null, timer = null, laeuft = false, nochmal = false;

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
    if (user) E("cMail").textContent = user.email;
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
    E("cOut").onclick = async () => { const { auth, A } = await laden(); await A.signOut(auth); status("Abgemeldet. Die Daten bleiben auf diesem Gerät."); };
    window.addEventListener("online", abgleichen);
    try {
      const { auth, A } = await laden();
      A.onAuthStateChanged(auth, async u => {
        user = u; ansicht();
        if (!u) return;
        if (!kontoPruefen()) { await A.signOut(auth); return; }
        abgleichen();
      });
    } catch { status("Cloud derzeit nicht erreichbar. Die App arbeitet lokal weiter."); }
  }
  start();
})();
