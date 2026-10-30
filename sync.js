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

  const status = (t, fehler) => ["cStatus", "torStatus"].forEach(id => { E(id).textContent = t; E(id).style.color = fehler ? "var(--gef)" : ""; });

  // Anmelde-Sperre: Die App ist erst nach Anmeldung und Freischaltung sichtbar. Die Freischaltung wird je Gerät gemerkt
  // (localStorage „zugang“), damit das Flugbuch auch ohne Netz startet; gesperrt wird nur bei eindeutigem Ergebnis.
  function tor(zustand) { // "laden" | "login" | "bestaetigen" | "warten" | null = App offen
    document.body.classList.toggle("gesperrt", !!zustand);
    E("tor").hidden = !zustand;
    E("torLaden").hidden = zustand !== "laden"; E("torLogin").hidden = zustand !== "login"; E("torWarten").hidden = zustand !== "warten"; E("torBest").hidden = zustand !== "bestaetigen";
    E("torMail").textContent = E("torMail2").textContent = user?.email || "";
    if (!zustand) window.dispatchEvent(new Event("resize")); // Karte und Höhenprofil nach dem Einblenden neu vermessen
  }
  async function zugangPruefen() { // true = freigeschaltet, false = wartet, null = keine Verbindung
    if (!adminUid || user.uid === adminUid) return true; // ohne Freigabe-Modus genügt die Anmeldung
    try {
      const { db, F } = await laden();
      if ((await F.getDoc(F.doc(db, "freigaben", user.uid))).exists()) { freigegeben = true; return true; }
      if (!angefragt) { await F.setDoc(F.doc(db, "anfragen", user.uid), { email: user.email, zeit: Date.now() }, { merge: true }); angefragt = true; }
      return false;
    } catch { return null; }
  }
  // Freischaltung nur mit bestätigter E-Mail-Adresse: sonst könnte sich jemand unter der Adresse eines Freundes registrieren
  // Automatisch höchstens eine Bestätigungs-E-Mail pro Tag und Konto (je Gerät gemerkt); „erneut senden“ geht immer
  const mailKey = () => "bestaetigungMail_" + user.uid;
  const mailFaellig = () => Date.now() - (+localStorage.getItem(mailKey()) || 0) > 864e5;
  async function emailBestaetigt() { // true, false oder null (keine Verbindung)
    if (!adminUid || user.uid === adminUid || user.emailVerified) return true;
    try {
      const { A } = await laden();
      await A.reload(user);
      if (!user.emailVerified) { if (mailFaellig()) { localStorage.setItem(mailKey(), String(Date.now())); await A.sendEmailVerification(user).catch(() => {}); } return false; }
      await user.getIdToken(true); // neues Token, damit die Firestore-Regeln die Bestätigung sehen
      return true;
    } catch { return null; }
  }
  async function einlassen() {
    const u = user, best = await emailBestaetigt();
    if (user !== u) return;
    const gemerkt = localStorage.getItem("zugang") === user.uid;
    if (best === false) { localStorage.removeItem("zugang"); tor("bestaetigen"); status(""); return; }
    if (best === null && !gemerkt) { tor("bestaetigen"); status("Keine Verbindung – bitte später erneut versuchen.", true); return; }
    const ok = await zugangPruefen();
    if (user !== u) return; // inzwischen abgemeldet oder Konto gewechselt
    if (ok === false) { localStorage.removeItem("zugang"); tor("warten"); status(""); return; }
    if (!ok && !gemerkt) { tor("warten"); status("Keine Verbindung – die Freischaltung kann gerade nicht geprüft werden.", true); return; }
    localStorage.setItem("zugang", user.uid); status(""); tor(null);
    if (adminUid && user.uid === adminUid) adminLaden();
    abgleichen();
  }
  const meldung = e => ({
    "auth/invalid-credential": "E-Mail oder Passwort ist falsch.", "auth/wrong-password": "E-Mail oder Passwort ist falsch.",
    "auth/user-not-found": "E-Mail oder Passwort ist falsch.", "auth/invalid-email": "Die E-Mail-Adresse ist ungültig.",
    "auth/email-already-in-use": "Diese E-Mail ist schon registriert. Bitte anmelden.", "auth/weak-password": "Das Passwort ist zu kurz (mindestens 6 Zeichen).",
    "auth/network-request-failed": "Keine Verbindung. Bitte später erneut versuchen.", "auth/too-many-requests": "Zu viele Versuche. Bitte ein paar Minuten warten.",
    "permission-denied": "Zugriff verweigert. Bitte die Firestore-Regeln prüfen."
  }[e?.code] || e?.message || "Unbekannter Fehler.");

  function ansicht() {
    E("cNote").hidden = konfiguriert;
    E("cOff").hidden = !konfiguriert || !!user;
    E("cOn").hidden = !user;
    if (user) { E("cMail").textContent = user.email; E("cUid").textContent = user.uid; }
    E("cAdmin").hidden = !(user && adminUid && user.uid === adminUid);
    E("cRueck").hidden = !(user && adminUid && user.uid !== adminUid);
  }

  async function laden() {
    if (fb) return fb;
    const [app, auth, fs] = await Promise.all(["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map(f => import(CDN + f)));
    const a = app.initializeApp(cfg);
    fb = { auth: auth.getAuth(a), A: auth, db: fs.getFirestore(a), F: fs };
    fb.auth.languageCode = "de"; // E-Mails zum Bestätigen und Zurücksetzen auf Deutsch
    return fb;
  }

  // Firestore: max. 1 MB je Dokument, deshalb sehr lange Tracks für die Cloud ausdünnen
  const bereinigt = f => {
    const t = f.track || [], s = Math.ceil(t.length / MAXPKT);
    const k = t.length <= MAXPKT ? f : { ...f, track: t.filter((_, i) => i % s === 0 || i === t.length - 1) };
    return JSON.parse(JSON.stringify(k)); // entfernt undefined
  };

  // Stand des letzten Abgleichs je Konto: server = jüngste Server-Änderungszeit, lokal = Startzeit des Abgleichs,
  // ids = Fahrten, die sicher in der Cloud liegen, voll = letzter vollständiger Abgleich
  const standKey = () => "syncStand_" + user.uid;
  async function abgleichen(vollErzwingen) {
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
      const metaRef = F.doc(db, "users", user.uid), col = F.collection(db, "users", user.uid, "fluege"), beginn = Date.now();
      // Sparsam: nur seit dem letzten Abgleich geänderte Fahrten lesen; vollständig beim ersten Mal, auf Knopfdruck und wöchentlich
      const st = localStorage.getItem("localUid") === user.uid ? load(standKey(), {}) : {};
      const voll = vollErzwingen === true || !st.server || beginn - (st.voll || 0) > 7 * 864e5;
      const [metaSnap, snap] = await Promise.all([F.getDoc(metaRef), F.getDocs(voll ? col : F.query(col, F.where("geaendert", ">=", F.Timestamp.fromMillis(st.server))))]);
      const meta = metaSnap.exists() ? metaSnap.data() : {};
      let server = voll ? 0 : st.server;
      const cloud = new Map(snap.docs.map(d => { const x = d.data(), t = x.geaendert?.toMillis?.() || 0; if (t > server) server = t; delete x.geaendert; return [d.id, x]; }));
      const ids = new Set(voll ? cloud.keys() : [...(st.ids || []), ...cloud.keys()]);
      const lokal = load("fluege", []), lmap = new Map(lokal.map(f => [f.id, f]));
      const cloudTote = new Set(meta.geloescht || []), tote = new Set([...cloudTote, ...load("geloescht", [])]);
      const neu = [], hoch = [];
      new Set([...cloud.keys(), ...lmap.keys()]).forEach(id => {
        if (tote.has(id)) return;
        const l = lmap.get(id), c = cloud.get(id), lb = l?.bearbeitet || 0;
        if (l && (!c || lb >= (c.bearbeitet || 0))) { neu.push(l); if (c ? lb > (c.bearbeitet || 0) : !ids.has(id) || lb > (st.lokal || 0)) hoch.push(l); }
        else if (l && Array.isArray(c.track) && (l.punkte || 0) > c.track.length) { const { track, ...rest } = c; neu.push({ ...rest, punkte: l.punkte }); } // lokale Spur ist genauer als die ausgedünnte Cloud-Kopie
        else neu.push(c);
      });
      for (const f of neu) { fahrtBereinigen(f); await spurAuslagern(f); } // Spuren aus der Cloud in IndexedDB, nicht in localStorage
      for (const id of tote) if (lmap.has(id)) trackLoeschen(id);
      const hat = o => Object.values(o || {}).some(Boolean); // gibt es überhaupt Einstellungen?
      let lz = +localStorage.getItem("metaZeit") || 0;
      const cz = meta.updatedAt || 0;
      if (!lz && hat(load("stammdaten", {}))) { lz = Date.now(); localStorage.setItem("metaZeit", String(lz)); } // schon vorhandene Einstellungen gelten als aktuell
      const cloudNeuer = cz > lz || (!lz && hat(meta.stammdaten)); // frisches Gerät übernimmt die Einstellungen aus der Cloud
      localStorage.setItem("geloescht", JSON.stringify([...tote]));
      if (cloudNeuer) localStorage.setItem("metaZeit", String(cz));
      cloudUebernehmen({ fluege: neu, ...(cloudNeuer ? { stamm: meta.stammdaten, mon: meta.monitor, theme: meta.theme } : {}) });
      for (const f of hoch) {
        // Spur aus IndexedDB mitschicken; fehlt sie lokal, bleibt die Spur in der Cloud erhalten (nur die übrigen Felder ergänzen)
        const t = await spur(f), d = { ...bereinigt({ ...f, track: t }), geaendert: F.serverTimestamp() }, ohne = !t.length && f.punkte > 1;
        if (ohne) delete d.track;
        await F.setDoc(F.doc(col, f.id), d, ohne ? { merge: true } : {}); ids.add(f.id);
      }
      for (const id of tote) if (cloud.has(id) || (ids.has(id) && !cloudTote.has(id))) { await F.deleteDoc(F.doc(col, id)); ids.delete(id); }
      await F.setDoc(metaRef, { geloescht: [...tote], updatedAt: cloudNeuer ? cz : lz, stammdaten: load("stammdaten", {}), monitor: load("monitorEinstellungen", {}), theme: load("theme", null) }, { merge: true });
      localStorage.setItem("localUid", user.uid);
      localStorage.setItem(standKey(), JSON.stringify({ server, lokal: beginn, voll: voll ? beginn : st.voll, ids: [...ids] }));
      status(`Zuletzt synchronisiert: ${new Date().toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })} · ${neu.length} Fahrten`);
    } catch (e) {
      if (e?.code === "permission-denied" && adminUid && user.uid !== adminUid) { freigegeben = false; localStorage.removeItem("zugang"); tor("warten"); status("Dein Konto ist nicht (mehr) freigeschaltet. Bitte beim Administrator nachfragen.", true); }
      else status(meldung(e), true);
    }
    laeuft = false;
    if (nochmal) { nochmal = false; abgleichen(); }
  }

  // Verfolger-Link: Position der laufenden Fahrt für das Rückholteam (Dokument live/{token}, mit dem Link 12 h lesbar).
  // Gesendet wird höchstens alle 10 s; die Spur wird mit ca. 30 m Abstand und höchstens 2000 Punkten mitgeschickt.
  const LIVEDAUER = 12 * 36e5, ZEICHEN = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let live = null, liveSpur = [], liveZuletzt = 0, liveSendet = false, liveFehler = false;
  const liveLaden = () => { live ??= load("verfolger", null); if (live && (live.uid !== user?.uid || Date.now() > live.ablauf)) { live = null; localStorage.removeItem("verfolger"); } return live; };
  const liveLink = () => new URL("verfolgen.html", location.href).href.split("#")[0] + "#" + live.token;
  function liveSpurErgaenzen(p) {
    const n = liveSpur.length;
    if (n && km({ lat: liveSpur[n - 2], lng: liveSpur[n - 1] }, p) < 0.03) return;
    liveSpur.push(rund(p.lat, 5), rund(p.lng, 5));
    if (liveSpur.length > 4000) liveSpur = liveSpur.filter((_, i) => Math.floor(i / 2) % 2 === 0 || i >= liveSpur.length - 2);
  }
  async function liveSenden(a, p, landung) {
    if (!liveLaden() || liveSendet) return;
    liveSendet = true; liveZuletzt = Date.now();
    try {
      if (!liveSpur.length) a.t.forEach(liveSpurErgaenzen); // nach Neuladen die Spur aus der Aufzeichnung übernehmen
      if (p) liveSpurErgaenzen(p);
      const { db, F } = await laden(), q = landung || p || a.t.at(-1) || {};
      await F.setDoc(F.doc(db, "live", live.token), { uid: user.uid, pilot: a.f.pilot || "", ballon: a.f.ballon || "", start: live.start, ablauf: live.ablauf, zeit: Date.now(),
        lat: rund(q.lat, 6), lng: rund(q.lng, 6), hoehe: rund(p?.hoehe, 0), speed: rund(p?.speed, 1), kurs: rund(p?.kurs, 0), genauigkeit: rund(p?.genauigkeit, 0),
        spur: liveSpur, status: landung ? "gelandet" : "fahrt", landung: landung ? { zeit: Date.now(), lat: rund(landung.lat, 6), lng: rund(landung.lng, 6) } : null });
      liveFehler = false;
    } catch { liveFehler = true; } // offline: beim nächsten Punkt erneut
    liveSendet = false;
  }
  window.verfolgerMoeglich = () => konfiguriert && !!user;
  window.verfolgerAktiv = () => !!liveLaden();
  window.verfolgerStatus = () => !liveLaden() ? "" : liveFehler ? "⚠ Position konnte zuletzt nicht gesendet werden (keine Verbindung?)" : liveZuletzt ? `Rückholteam sieht deine Position live · zuletzt gesendet vor ${Math.round((Date.now() - liveZuletzt) / 1000)} s` : "Wird gestartet …";
  window.verfolgerStart = (a, p) => { // liefert den Link sofort (das Teilen-Menü braucht den Fingertipp), gesendet wird im Hintergrund
    if (!liveLaden()) {
      const z = crypto.getRandomValues(new Uint8Array(24));
      live = { token: [...z].map(b => ZEICHEN[b % ZEICHEN.length]).join(""), uid: user.uid, start: Date.now(), ablauf: Date.now() + LIVEDAUER };
      localStorage.setItem("verfolger", JSON.stringify(live)); liveSpur = [];
    }
    liveSenden(a, p);
    return liveLink();
  };
  window.verfolgerPunkt = (a, p) => { if (user && liveLaden() && Date.now() - liveZuletzt >= 10000) liveSenden(a, p); };
  window.verfolgerEnde = async (a, landung) => {
    if (!user || !liveLaden()) return;
    for (let i = 0; liveSendet && i < 50; i++) await new Promise(r => setTimeout(r, 100)); // laufende Übertragung abwarten
    await liveSenden(a, null, landung);
    live = null; liveSpur = []; liveZuletzt = 0; localStorage.removeItem("verfolger");
  };

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
    tracksLeeren();
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
    try {
      const { db, F } = await laden(), r = (await F.getDocs(F.collection(db, "rueckmeldungen"))).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.zeit || 0) - (a.zeit || 0));
      E("aRueck").innerHTML = '<h3 style="margin-top:14px">Rückmeldungen</h3>' + (r.length ? r.map(x => `<div class="zeile"><span><b>${esc(x.email || "")}</b> · ${esc(new Date(x.zeit || 0).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" }))} · ${esc(x.version || "")}<br><span class="rm">${esc(x.text || "")}</span><br><small class="note">${esc(x.geraet || "")}</small></span><span><button data-a="rdel" data-uid="${esc(x.id)}" style="min-height:36px;padding:0 12px">Erledigt</button></span></div>`).join("") : '<p class="note">Keine Rückmeldungen.</p>');
    } catch (e) { E("aRueck").innerHTML = '<p class="note">Rückmeldungen: ' + esc(e?.code === "permission-denied" ? "Bitte die Firestore-Regeln aus der README aktualisieren." : meldung(e)) + "</p>"; }
  }
  async function adminAktion(e) {
    const bt = e.target.closest("button");
    if (!bt) return;
    try {
      const { db, F } = await laden(), uid = bt.dataset.uid;
      if (bt.dataset.a === "ok") { await F.setDoc(F.doc(db, "freigaben", uid), { email: bt.dataset.mail, zeit: Date.now() }); await F.deleteDoc(F.doc(db, "anfragen", uid)); }
      else if (bt.dataset.a === "nein") await F.deleteDoc(F.doc(db, "anfragen", uid));
      else if (bt.dataset.a === "sperr" && confirm("Den Zugang für dieses Konto sperren?")) await F.deleteDoc(F.doc(db, "freigaben", uid));
      else if (bt.dataset.a === "rdel") await F.deleteDoc(F.doc(db, "rueckmeldungen", uid));
    } catch (err) { status(meldung(err), true); }
    adminLaden();
  }

  // Konto löschen: Cloud-Daten, Anfrage/Freigabe und das Konto selbst (verlangt das Passwort)
  async function kontoLoeschen() {
    const { auth, A, db, F } = await laden(), u = auth.currentUser;
    await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, E("kPass").value));
    status("Konto wird gelöscht …");
    try { // ohne Freischaltung gibt es keine Cloud-Daten
      for (const d of (await F.getDocs(F.collection(db, "users", u.uid, "fluege"))).docs) await F.deleteDoc(F.doc(db, "users", u.uid, "fluege", d.id));
      await F.deleteDoc(F.doc(db, "users", u.uid));
    } catch (e) { if (e?.code !== "permission-denied") throw e; }
    for (const p of ["anfragen", "freigaben"]) await F.deleteDoc(F.doc(db, p, u.uid)).catch(() => {}); // Freigabe zuletzt, sonst fehlt das Recht für den Rest
    const lokal = E("kLokal").checked;
    await A.deleteUser(u);
    localStorage.removeItem("localUid"); localStorage.removeItem("syncStand_" + u.uid);
    if (lokal) lokalLoeschen(); else status("Konto gelöscht. Die Daten auf diesem Gerät sind noch vorhanden.");
  }
  async function rueckmeldung() {
    const text = E("rText").value.trim(), rs = E("rStatus");
    if (!text) { rs.textContent = "Bitte eine Nachricht eingeben."; return; }
    E("rSend").disabled = true; rs.textContent = "Wird gesendet …";
    try {
      const { db, F } = await laden();
      await F.setDoc(F.doc(db, "rueckmeldungen", nid()), { uid: user.uid, email: user.email, text, zeit: Date.now(), version: window.appVersion || "", geraet: navigator.userAgent.slice(0, 200) });
      E("rText").value = ""; rs.textContent = "Danke! Die Rückmeldung wurde gesendet.";
    } catch (e) { rs.textContent = e?.code === "permission-denied" ? "Senden ist noch nicht eingerichtet. Bitte dem Administrator Bescheid geben." : meldung(e); }
    E("rSend").disabled = false;
  }

  async function anmelden(neu, p = "c") { // p = "c" (Einstellungen) oder "tor" (Anmeldebildschirm)
    const mail = E(p === "c" ? "cEmail" : "torEmail").value.trim(), pw = E(p === "c" ? "cPass" : "torPass").value;
    if (!mail || !pw) return status("Bitte E-Mail und Passwort eingeben.", true);
    try {
      const { auth, A } = await laden();
      status(neu ? "Konto wird erstellt …" : "Anmeldung …");
      await (neu ? A.createUserWithEmailAndPassword(auth, mail, pw) : A.signInWithEmailAndPassword(auth, mail, pw));
      E("cPass").value = E("torPass").value = "";
    } catch (e) { status(meldung(e), true); }
  }

  async function start() {
    ansicht();
    if (!konfiguriert) return tor(null); // ohne Firebase gibt es keine Sperre
    tor(localStorage.getItem("zugang") ? null : "laden");
    E("cLogin").onclick = () => anmelden(false);
    E("cReg").onclick = () => anmelden(true);
    E("torAn").onclick = () => anmelden(false, "tor");
    E("torReg").onclick = () => anmelden(true, "tor");
    E("torNeu").onclick = E("torBestOk").onclick = () => { status("Wird geprüft …"); einlassen(); };
    E("torBestNeu").onclick = async () => { try { const { A } = await laden(); await A.sendEmailVerification(user); localStorage.setItem(mailKey(), String(Date.now())); status("Die E-Mail wurde erneut gesendet. Bitte auch im Spam-Ordner nachsehen."); } catch (e) { status(meldung(e), true); } };
    E("torBestAus").onclick = async () => { const { auth, A } = await laden(); await A.signOut(auth); };
    E("torAus").onclick = async () => { const { auth, A } = await laden(); await A.signOut(auth); };
    E("torReset").onclick = E("cReset").onclick = async e => {
      const mail = E(e.target.id === "torReset" ? "torEmail" : "cEmail").value.trim();
      if (!mail) return status("Bitte zuerst die E-Mail-Adresse eingeben.", true);
      try { const { auth, A } = await laden(); await A.sendPasswordResetEmail(auth, mail); status("E-Mail zum Zurücksetzen wurde gesendet."); } catch (e) { status(meldung(e), true); }
    };
    E("cSync").onclick = () => abgleichen(true);
    E("rSend").onclick = rueckmeldung;
    E("cDel").onclick = () => { if (aktiv) return alert("Bitte zuerst die laufende Fahrt beenden."); E("kPass").value = ""; E("kLokal").checked = false; E("kFehler").hidden = true; E("kDlg").returnValue = ""; E("kDlg").showModal(); };
    E("kOk").onclick = async e => { // Dialog bleibt bei Fehlern offen
      e.preventDefault();
      if (!E("kPass").value) { E("kFehler").textContent = "Bitte das Passwort eingeben."; E("kFehler").hidden = false; return; }
      E("kOk").disabled = true;
      try { await kontoLoeschen(); E("kDlg").close(); }
      catch (err) { E("kFehler").textContent = meldung(err); E("kFehler").hidden = false; }
      E("kOk").disabled = false;
    };
    E("aListe").onclick = E("aRueck").onclick = adminAktion; E("aRefresh").onclick = adminLaden;
    E("cOut").onclick = async () => { const { auth, A } = await laden(); await A.signOut(auth); status("Abgemeldet. Die Daten bleiben auf diesem Gerät."); };
    window.addEventListener("online", () => abgleichen());
    try {
      const { auth, A } = await laden();
      A.onAuthStateChanged(auth, async u => {
        user = u; freigegeben = false; angefragt = false; ansicht();
        if (!u) { localStorage.removeItem("zugang"); tor("login"); return; }
        if (!kontoPruefen()) { await A.signOut(auth); return; }
        einlassen();
      });
    } catch { // Firebase nicht ladbar (offline beim allerersten Start): mit gemerkter Freischaltung trotzdem öffnen
      if (localStorage.getItem("zugang")) tor(null);
      else { tor("login"); status("Für die erste Anmeldung ist eine Internetverbindung nötig.", true); }
    }
  }
  start();
})();
