"use strict";
const $ = id => document.getElementById(id);
const load = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? f; } catch { return f; } };
const SYNCKEYS = ["fluege", "geloescht", "stammdaten", "monitorEinstellungen", "theme"];
const save = (k, v, leise) => { try { localStorage.setItem(k, JSON.stringify(v)); if (SYNCKEYS.includes(k)) window.cloudGeaendert?.(k); return true; } catch { if (!leise) alert("Speichern fehlgeschlagen (Speicher voll?). Bitte Backup erstellen."); return false; } };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nb = s => String(s).replace(/(\d) (?=\S)/g, "$1\u00a0"); // Zahl und Einheit nicht trennen (z. B. „44 °C“)
const num = (v, d = 0) => Number.isFinite(v) ? v.toLocaleString("de-AT", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–";
const dur = m => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
const datum = iso => new Date(iso).toLocaleString("de-AT", { dateStyle: "medium", timeStyle: "short" });
const nid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random();
const km = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };

// UTM-Koordinaten (WGS84) für alle Koordinatenanzeigen der App
function utm(lat, lng) {
  const zone = Math.floor((lng + 180) / 6) + 1, r = Math.PI / 180, a = 6378137, e2 = 0.00669438, k0 = 0.9996;
  const phi = lat * r, ep2 = e2 / (1 - e2), N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2;
  const A = Math.cos(phi) * (lng - ((zone - 1) * 6 - 177)) * r;
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - 35 * e2 ** 3 / 3072 * Math.sin(6 * phi));
  const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  const Nn = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720)) + (lat < 0 ? 1e7 : 0);
  return { zone: zone + (lat < 0 ? "S" : "N"), e: Math.round(E), n: Math.round(Nn) };
}
function utmText(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "–";
  const u = utm(lat, lng);
  return `UTM ${u.zone} · ${u.e} E · ${u.n} N`;
}

// GPS-Spuren liegen in IndexedDB (Platz für Tausende Fahrten), alles andere in localStorage (ca. 5 MB).
// Fehlt IndexedDB, bleibt die Spur wie früher an der Fahrt (f.track).
let idbP = null;
const idb = () => idbP ||= new Promise((ok, no) => {
  const r = indexedDB.open("ballonflugbuch", 1);
  r.onupgradeneeded = () => { r.result.createObjectStore("tracks"); r.result.createObjectStore("sicherung"); };
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
const idbTx = async (store, mode, fn) => { const db = await idb(); return new Promise((ok, no) => { const tx = db.transaction(store, mode), q = fn(tx.objectStore(store)); tx.oncomplete = () => ok(q?.result); tx.onerror = tx.onabort = () => no(tx.error); }); };
const trackSpeichern = (id, t) => idbTx("tracks", "readwrite", s => s.put(t, id));
const trackHolen = id => idbTx("tracks", "readonly", s => s.get(id)).then(t => t || []).catch(() => []);
const trackLoeschen = id => idbTx("tracks", "readwrite", s => s.delete(id)).catch(() => {});
const tracksLeeren = () => idbTx("tracks", "readwrite", s => s.clear()).catch(() => {});
const spur = async f => f.track?.length ? f.track : trackHolen(f.id);
const hatTrack = f => Math.max(f.punkte || 0, (f.track || []).length) > 1;
async function spurAuslagern(f) { // Spur in IndexedDB, an der Fahrt bleibt nur die Anzahl der Punkte
  if (!Array.isArray(f.track)) return;
  try { await trackSpeichern(f.id, f.track); f.punkte = f.track.length; delete f.track; } catch { /* Fallback: Spur bleibt an der Fahrt */ }
}
// Einmaliger Umzug der Spuren aus localStorage (mit Sicherung der alten Daten, Prüfung vor dem Entfernen)
async function tracksUmziehen() {
  const mit = fluege.filter(f => Array.isArray(f.track));
  if (!mit.length) return;
  try {
    await idbTx("sicherung", "readwrite", s => s.put(localStorage.getItem("fluege"), "fluege-vor-umzug"));
    for (const f of mit) await trackSpeichern(f.id, f.track);
    for (const f of mit) if ((await idbTx("tracks", "readonly", s => s.get(f.id)))?.length !== f.track.length) throw new Error("Prüfung fehlgeschlagen");
    for (const f of mit) { f.punkte = f.track.length; delete f.track; }
    localStorage.setItem("fluege", JSON.stringify(fluege)); // nur Speicherort geändert, kein neuer Abgleich nötig
    render();
  } catch { /* bleibt im alten Speicher, beim nächsten Start neuer Versuch */ }
}

// Datenschlüssel bleiben kompatibel zur alten Version
let fluege = load("fluege", []);
let stamm = load("stammdaten", {});
let mon = { zeitraumMonate: 24, erforderlicheStunden: 6, erforderlicheLandungen: 10, ...load("monitorEinstellungen", {}) };
let aktiv = load("aktiveFahrt", null); // {f: Fahrt, t: Trackpunkte} – überlebt Neuladen/Absturz
let stile = [], stilNr = 0, zentriert = false, standbyId = null, folgeBis = 0, watch = null, wake = null, karte = null, ebene = null, liveL = null, pos = null, lastSave = 0, bearbeite = null;
fluege.forEach(f => { f.id ??= nid(); });

const SEITEN = ["dashboard", "fahrt", "flugbuch", "karte", "wetter", "rechner", "trajektoren", "ausruestung", "gas", "einstellungen"];
function zeige(id) {
  menue(false);
  replayStop();
  id = id === "fahrt-erfassen" ? "fahrt" : id;
  if (!SEITEN.includes(id)) id = "dashboard";
  document.querySelectorAll(".seite").forEach(s => s.hidden = s.id !== id);
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.s === id));
  history.replaceState(null, "", "#" + id);
  scrollTo(0, 0);
  if (id === "karte" || id === "fahrt") { $(id === "fahrt" ? "fbox" : "kbox").prepend($("map")); kartePrep(); }
  if (id === "fahrt") standbyStart(); else standbyStop();
  if (id === "wetter") wetter();
  if (id === "trajektoren") trajektorenOeffnen();
  if (id === "rechner") { rBallonFuellen(); gSelRender(); zRender(); rechnen(); }
  if (id === "ausruestung") ausruestungRender();
  if (id === "gas") gasRender();
  if (id === "fahrt") hoehe();
}

// ---------- Orte: nie blockierend, fehlende werden später nachgeladen ----------
async function ort(lat, lng) {
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=de&lat=${lat}&lon=${lng}`, { signal: c.signal });
    const a = (await r.json()).address || {};
    return a.city || a.town || a.village || a.municipality || a.county || null;
  } catch { return null; }
}
let ortLaeuft = false;
async function orteNachladen() {
  if (ortLaeuft || !navigator.onLine) return;
  ortLaeuft = true;
  let g = false;
  for (const f of [aktiv?.f, ...fluege].filter(Boolean)) {
    for (const [k, la, ln] of [["startOrt", "startLat", "startLng"], ["landeOrt", "landeLat", "landeLng"]]) {
      if ((!f[k] || f[k] === "Unbekannt") && Number.isFinite(f[la])) {
        const o = await ort(f[la], f[ln]);
        if (o) { f[k] = o; g = true; }
        await new Promise(r => setTimeout(r, 1100)); // Nominatim: max. 1 Anfrage/Sekunde
      }
    }
  }
  ortLaeuft = false;
  if (g) { save("fluege", fluege); if (aktiv) save("aktiveFahrt", aktiv); render(); }
}

// ---------- Tracking ----------
const status = t => { $("status").textContent = t; };
const fehler = e => ({ 1: "Standortzugriff verweigert. Bitte im Browser erlauben.", 2: "Position nicht verfügbar.", 3: "Zeitüberschreitung bei der Standortabfrage." }[e.code] || "Standortfehler.");

const rund = (v, d) => Number.isFinite(v) ? +v.toFixed(d) : null;
// Laufende Fahrt sichern; ist der Gerätespeicher voll, läuft die Aufzeichnung im Arbeitsspeicher weiter (kein Hinweisfenster während der Fahrt)
const fahrtSichern = () => { if (!save("aktiveFahrt", aktiv, true)) status("⚠ Gerätespeicher voll – Fahrt läuft weiter, wird aber nicht zwischengespeichert. App nicht schließen!"); };
const posVon = c => ({ lat: c.latitude, lng: c.longitude, hoehe: c.altitude, speed: c.speed == null ? null : Math.max(0, c.speed), kurs: c.heading, genauigkeit: c.accuracy });
function standbyStart() { // Standortanzeige auf der Fahrt-Seite, auch ohne Aufzeichnung
  if (aktiv || standbyId !== null || !navigator.geolocation) return;
  standbyId = navigator.geolocation.watchPosition(p => { pos = posVon(p.coords); liveAnzeige(); }, () => { pos = null; liveAnzeige(); }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
function standbyStop() { if (standbyId !== null) navigator.geolocation.clearWatch(standbyId); standbyId = null; }
function punkt(p) {
  if (!aktiv) return;
  const c = p.coords;
  pos = posVon(c);
  if (c.accuracy <= 100) { // gerundet gespeichert (0,1 m genau), spart rund ein Drittel Speicher
    const q = { lat: rund(pos.lat, 6), lng: rund(pos.lng, 6), hoehe: rund(pos.hoehe, 1), speed: rund(pos.speed, 1), kurs: rund(pos.kurs, 0), genauigkeit: rund(pos.genauigkeit, 0), zeit: new Date(p.timestamp).toISOString() }, l = aktiv.t.at(-1);
    if (!l || km(l, q) >= 0.003) aktiv.t.push(q);
  }
  if (Date.now() - lastSave > 4000) { lastSave = Date.now(); fahrtSichern(); }
  liveAnzeige();
}

function start() {
  if (aktiv) return;
  if (!navigator.geolocation) return alert("GPS wird von diesem Browser nicht unterstützt.");
  if (!stamm.pilot || !stamm.ballon) { zeige("einstellungen"); return alert("Bitte zuerst Pilot und Ballon-Kennzeichen eintragen."); }
  status("Startposition wird ermittelt …");
  standbyStop(); // ein laufender Standby-Stream kann die Einmalabfrage blockieren
  navigator.geolocation.getCurrentPosition(p => {
    const now = new Date().toISOString();
    aktiv = { f: { id: nid(), datum: now, startzeit: now, pilot: stamm.pilot, ballon: stamm.ballon, ballontyp: stamm.ballontyp || "", startLat: p.coords.latitude, startLng: p.coords.longitude, startOrt: null }, t: [] };
    if (planFuerStart && Date.now() - planFuerStart.t < 60000) { // geplante Fahrt: Planung zur Fahrt speichern
      aktiv.f.plan = planFuerStart.plan; planFuerStart = null; planCheck = {}; planTraj = null; localStorage.removeItem("planTraj"); planSpeichern(); planAktualisieren();
    }
    lastSave = 0;
    aufnehmen();
    punkt(p);
    save("aktiveFahrt", aktiv);
    orteNachladen(); // im Hintergrund, blockiert den Start nicht
  }, e => { ui(); status("❌ " + fehler(e)); standbyStart(); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}

function aufnehmen() {
  watch = navigator.geolocation.watchPosition(punkt, () => status("● Fahrt läuft – GPS vorübergehend gestört"), { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  standbyStop();
  wakeLock();
  ui();
}

async function ende() {
  if (!aktiv) return;
  if (watch !== null) navigator.geolocation.clearWatch(watch);
  watch = null;
  const { f, t } = aktiv, end = new Date(), l = t.at(-1) || pos;
  if (l) { f.landeLat = l.lat; f.landeLng = l.lng; }
  let d = 0;
  for (let i = 1; i < t.length; i++) d += km(t[i - 1], t[i]);
  const h = t.map(p => p.hoehe).filter(Number.isFinite), s = t.map(p => p.speed).filter(Number.isFinite);
  f.endezeit = end.toISOString();
  f.flugzeit = Math.max(1, Math.round((end - new Date(f.startzeit)) / 6e4));
  f.strecke = +d.toFixed(1);
  f.track = t; // wird unten in IndexedDB ausgelagert
  f.maxHoehe = h.length ? Math.round(Math.max(...h)) : 0;
  f.minHoehe = h.length ? Math.round(Math.min(...h)) : 0;
  f.avgHoehe = h.length ? Math.round(h.reduce((a, b) => a + b, 0) / h.length) : 0;
  f.maxSpeed = s.length ? +(Math.max(...s) * 3.6).toFixed(1) : 0;
  f.avgSpeed = +(d / (f.flugzeit / 60)).toFixed(1);
  f.landungen = Math.max(1, parseInt($("landungen").value, 10) || 1);
  f.bemerkung = $("bemerkung").value.trim();
  let gk = 0; // Gasverbrauch dieser Fahrt je Flasche, wird von der Flasche abgebucht
  document.querySelectorAll("#gasZeilen .gk").forEach(inp => {
    const v = zf(inp.value);
    if (v <= 0) return;
    gk += v;
    const fl = (stamm.flaschen || []).find(x => x.id === (inp.dataset.id || document.getElementById("gasFl")?.value));
    if (fl) { fl.fuell = String(Math.max(0, Math.round((zf(fl.fuell) - v) * 10) / 10)); (f.gasDetails ||= []).push({ name: fl.name, kg: v }); }
  });
  if (gk > 0) { f.gas = gk; save("stammdaten", stamm); }
  f.bearbeitet = Date.now();
  await spurAuslagern(f);
  fluege.push(f);
  if (!save("fluege", fluege)) { fluege.pop(); aufnehmen(); return; } // Fahrt bleibt erhalten
  localStorage.removeItem("aktiveFahrt");
  aktiv = null;
  wakeEnde();
  $("bemerkung").value = ""; $("landungen").value = 1; $("gasZeilen").innerHTML = "";
  ui(); render(); orteNachladen();
  zeige("flugbuch");
}

// Bildschirm während der Aufzeichnung anlassen (Wake Lock); die Anzeige im Cockpit zeigt, ob der Browser das erlaubt
let wakeBittet = false;
async function wakeLock() {
  if (!aktiv || wake || wakeBittet) return;
  wakeBittet = true;
  try { if ("wakeLock" in navigator) { wake = await navigator.wakeLock.request("screen"); wake.onrelease = () => { wake = null; wakeAnzeige(); }; } } catch { wake = null; }
  wakeBittet = false; wakeAnzeige();
}
const wakeEnde = () => { wake?.release().catch(() => {}); wake = null; wakeAnzeige(); };
function wakeAnzeige() {
  const h = $("wakeH");
  h.hidden = !aktiv || wakeBittet || document.visibilityState !== "visible";
  h.style.color = wake ? "var(--ok)" : "var(--warn)";
  h.textContent = wake ? "☀ Bildschirm bleibt während der Aufzeichnung an." : "⚠ Bildschirm kann ausgehen – bitte die automatische Bildschirmsperre am Gerät selbst abschalten.";
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") wakeLock();
  else if (aktiv) fahrtSichern(); // beim Wechsel in den Hintergrund sofort sichern (Handy kann die App beenden)
});

// ---------- Anzeige ----------
function ui() {
  const ok = !!(stamm.pilot && stamm.ballon);
  $("startB").disabled = !!aktiv || !ok;
  $("startB").textContent = aktiv ? "● Aufzeichnung läuft" : "▶ Aufzeichnung starten";
  $("stopB").disabled = !aktiv;
  $("hinweis").hidden = ok;
  $("fdot").className = aktiv ? "dot on" : "dot";
  $("fstate").textContent = aktiv ? "AUFZEICHNUNG" : "BEREIT";
  status(aktiv ? "Fahrt läuft" : "Keine Aufzeichnung");
  wakeAnzeige(); liveAnzeige();
}

const RICHT = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"], p2 = n => String(n).padStart(2, "0");
function liveAnzeige() {
  const t = aktiv?.t || [], set = (id, v) => { $(id).textContent = v; };
  let d = 0;
  for (let i = 1; i < t.length; i++) d += km(t[i - 1], t[i]);
  const sek = aktiv ? Math.max(0, Math.floor((Date.now() - new Date(aktiv.f.startzeit)) / 1000)) : 0;
  const sp = t.map(p => p.speed).filter(Number.isFinite), hs = t.map(p => p.hoehe).filter(Number.isFinite);
  const vmax = sp.length ? Math.max(...sp) * 3.6 : 0, vavg = sek > 0 ? d / (sek / 3600) : 0, hmax = hs.length ? Math.max(...hs) : 0;
  let vs = 0;
  const l = t.at(-1);
  for (let i = t.length - 2; l && i >= 0; i--) { // Steig-/Sinkrate über ca. 8 Sekunden
    const dt = (new Date(l.zeit) - new Date(t[i].zeit)) / 1000;
    if (dt >= 8) { if (Number.isFinite(l.hoehe) && Number.isFinite(t[i].hoehe)) vs = (l.hoehe - t[i].hoehe) / dt; break; }
  }
  set("kV", pos?.speed != null ? num(pos.speed * 3.6) : "0"); set("kVs", `Ø ${num(vavg)} · MAX ${num(vmax)} km/h`);
  set("kH", Number.isFinite(pos?.hoehe) ? Math.round(pos.hoehe) : "0"); set("kHs", `MAX ${Math.round(hmax)} m` + (bodenH != null && Number.isFinite(pos?.hoehe) ? ` · AGL ca. ${Math.round(pos.hoehe - bodenH)} m` : ""));
  set("kR", Number.isFinite(pos?.kurs) ? Math.round(pos.kurs) + "°" : "–"); set("kRu", Number.isFinite(pos?.kurs) ? RICHT[Math.round(pos.kurs / 45) % 8] : "–");
  set("kA", pos ? "±" + Math.round(pos.genauigkeit) : "±0");
  set("sDauer", `${p2(Math.floor(sek / 3600))}:${p2(Math.floor(sek / 60) % 60)}:${p2(sek % 60)}`);
  set("sStrecke", num(d, 2) + " km"); set("sSteig", num(Math.max(0, vs), 1) + " m/s"); set("sSink", num(Math.max(0, -vs), 1) + " m/s");
  set("sMaxH", Math.round(hmax) + " m"); set("sMaxV", num(vmax) + " km/h");
  const info = pos ? `${utmText(pos.lat, pos.lng)} · GPS ±${Math.round(pos.genauigkeit)} m` : "Standort wird ermittelt …";
  set("chip", info); set("posInfo", info);
  set("gpsB", pos ? "GPS AKTIV" : "GPS SUCHT …"); $("gpsB").classList.toggle("on", !!pos);
  if (!$("fahrt").hidden) { hoehe(); bodenhoehe(); }
  liveKarte();
}

function hoehe() {
  const c = $("hoehe"), w = c.clientWidth, h = c.clientHeight, r = devicePixelRatio || 1;
  if (!w) return;
  c.width = w * r; c.height = h * r;
  const x = c.getContext("2d");
  x.scale(r, r); x.font = "11px sans-serif"; const cs = getComputedStyle(document.documentElement); x.fillStyle = cs.getPropertyValue("--mut"); x.strokeStyle = cs.getPropertyValue("--acc2"); x.lineWidth = 2;
  const v = (aktiv?.t || []).map(p => p.hoehe).filter(Number.isFinite);
  if (v.length < 2) { x.fillText("Noch keine Höhendaten", 10, 20); return; }
  const mn = Math.min(...v), mx = Math.max(...v), sp = Math.max(mx - mn, 10);
  x.beginPath();
  v.forEach((a, i) => { const px = 10 + i / (v.length - 1) * (w - 20), py = h - 18 - (a - mn) / sp * (h - 36); i ? x.lineTo(px, py) : x.moveTo(px, py); });
  x.stroke();
  x.fillText(Math.round(mx) + " m", 10, 12); x.fillText(Math.round(mn) + " m", 10, h - 4);
}

function render() {
  auswahlFuellen(); ausruestungRender(); termineRender(); gasRender(); vRender(); fwKnopf(); speicherAnzeige();
  const sum = fluege.reduce((a, f) => ({ m: a.m + (f.flugzeit || 0), k: a.k + (f.strecke || 0), l: a.l + (f.landungen || 0) }), { m: 0, k: 0, l: 0 });
  const kp = (a, b) => `<div class="kpi"><small>${a}</small><b>${b}</b></div>`;
  $("kpis").innerHTML = kp("Fahrten", fluege.length) + kp("Landungen", sum.l) + kp("Flugzeit", dur(sum.m)) + kp("Kilometer", num(sum.k, 1));

  const grenze = new Date(); grenze.setMonth(grenze.getMonth() - mon.zeitraumMonate);
  const im = fluege.filter(f => new Date(f.startzeit) >= grenze);
  const mi = im.reduce((a, f) => a + (f.flugzeit || 0), 0) / 60, li = im.reduce((a, f) => a + (f.landungen || 0), 0);
  const bar = (t, i, s) => { const p = s > 0 ? Math.min(100, i / s * 100) : 100; return `<div class="bar"><span>${t}: ${num(i, 1).replace(",0", "")} / ${s}</span><i><u style="width:${p}%" class="${p >= 100 ? "ok" : ""}"></u></i></div>`; };
  $("monitor").innerHTML = `<h2>Aktivitätsmonitor · ${mon.zeitraumMonate} Monate</h2>` + bar("Flugstunden", mi, mon.erforderlicheStunden) + bar("Landungen", li, mon.erforderlicheLandungen) +
    (w => `<p class="note">Nächste Wartung: ${w ? esc(new Date(w + "T00:00:00").toLocaleDateString("de-AT")) : "nicht festgelegt"}</p>`)(stamm.maintenance || (stamm.ausruestung || []).find(g => g.ballon === stamm.ballon)?.wartung);

  const top = k => fluege.reduce((m, f) => Math.max(m, f[k] || 0), 0);
  $("rekorde").innerHTML = "<h2>Rekorde</h2>" + [["Max. Höhe", top("maxHoehe") + " m"], ["Längste Fahrt", dur(top("flugzeit"))], ["Weiteste Strecke", num(top("strecke"), 1) + " km"], ["Max. Tempo", num(top("maxSpeed"), 1) + " km/h"]].map(([a, b]) => `<p><span>${a}</span><b>${b}</b></p>`).join("");

  $("liste").innerHTML = fluege.length
    ? [...fluege].sort((a, b) => new Date(b.startzeit) - new Date(a.startzeit)).map(f => {
      const ort = Number.isFinite(f.startLat), track = hatTrack(f), b = (a, t, c = "") => `<button data-a="${a}" data-id="${esc(f.id)}"${c ? ` class="${c}"` : ""}>${t}</button>`;
      return `<article class="card"><h3>${esc(datum(f.startzeit))}${f.manuell ? ' <span class="badge">nachgetragen</span>' : ""}</h3>
      <p>${esc(f.startOrt || (ort ? "Ort wird ermittelt …" : "–"))} → ${esc(f.landeOrt || (ort ? "…" : "–"))}</p>
      <p class="m">${dur(f.flugzeit || 0)} · ${num(f.strecke, 1)} km${track ? ` · max. ${f.maxHoehe || 0} m` : ""} · ${f.landungen || 1} Landung(en) · ${esc(f.pilot)} · ${esc(f.ballon)}${f.gas ? ` · Gas ${kg1(f.gas)} kg` : ""}</p>
      ${ort ? `<p class="m">Start ${utmText(f.startLat, f.startLng)}<br>Landung ${utmText(f.landeLat, f.landeLng)}</p>` : ""}${planHtml(f.plan)}
      ${f.bemerkung ? `<p>${esc(f.bemerkung)}</p>` : ""}
      <div class="row">${ort ? b("karte", "Karte") : ""}${track ? b("play", "Abspielen") + b("gpx", "GPX") : ""}${b("edit", "Bearbeiten")}${b("del", "Löschen", "gef")}</div></article>`;
    }).join("")
    : '<p class="leer">Noch keine Fahrten gespeichert.</p>';
}

$("liste").onclick = e => {
  const b = e.target.closest("button"), f = b && fluege.find(x => x.id === b.dataset.id);
  if (!f) return;
  if (b.dataset.a === "del") {
    if (confirm("Diese Fahrt wirklich löschen?")) { fluege = fluege.filter(x => x !== f); trackLoeschen(f.id); save("geloescht", [...load("geloescht", []), f.id]); save("fluege", fluege); render(); }
  } else if (b.dataset.a === "edit") fahrtDialog(f);
  else if (b.dataset.a === "gpx") gpxExport(f);
  else if (b.dataset.a === "play") { zeige("karte"); setTimeout(() => abspielen(f), 150); }
  else { zeige("karte"); setTimeout(() => zeichne([f]), 120); }
};
// Bearbeiten und Nachtragen (Fahrt ohne GPS, z. B. aus dem Papierflugbuch) im selben Dialog
const tagText = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, zeitText = d => `${p2(d.getHours())}:${p2(d.getMinutes())}`;
const fahrtEnde = f => new Date(f.endezeit || +new Date(f.startzeit) + (f.flugzeit || 0) * 6e4);
function fahrtDialog(f) {
  bearbeite = f || null;
  const s = f ? new Date(f.startzeit) : null;
  $("dlgT").textContent = f ? "Fahrt bearbeiten" : "Fahrt nachtragen";
  $("eDatum").value = tagText(s || new Date()); $("eStartZ").value = s ? zeitText(s) : ""; $("eEndeZ").value = f ? zeitText(fahrtEnde(f)) : "";
  $("ePilot").value = f ? f.pilot || "" : stamm.pilot || ""; $("eBallon").value = f ? f.ballon || "" : stamm.ballon || "";
  $("eStart").value = f?.startOrt || ""; $("eLande").value = f?.landeOrt || ""; $("eLand").value = f?.landungen || 1;
  $("eKm").value = f?.strecke || ""; $("eBem").value = f?.bemerkung || ""; $("eGas").value = f?.gas || "";
  $("eFehler").hidden = true; $("dlg").returnValue = ""; $("dlg").showModal();
}
function fahrtZeiten() { // {start, ende} oder Fehlertext
  const d = $("eDatum").value, a = $("eStartZ").value, b = $("eEndeZ").value;
  if (!d || !a || !b) return "Bitte Datum, Start- und Landezeit eintragen.";
  const start = new Date(`${d}T${a}`), ende = new Date(`${d}T${b}`);
  return ende > start ? { start, ende } : "Die Landung muss nach dem Start liegen.";
}
$("fNach").onclick = () => fahrtDialog();
$("eOk").onclick = e => { // Dialog bleibt bei fehlenden Angaben offen
  const z = fahrtZeiten(), fehlt = typeof z === "string" ? z : !$("ePilot").value.trim() || !$("eBallon").value.trim() ? "Bitte Pilot und Ballon eintragen." : "";
  if (fehlt) { e.preventDefault(); $("eFehler").textContent = fehlt; $("eFehler").hidden = false; }
};
$("dlg").addEventListener("close", () => {
  if ($("dlg").returnValue === "ok") {
    const f = bearbeite || { id: nid(), track: [], maxHoehe: 0, manuell: true }, z = fahrtZeiten();
    // unveränderte Zeiten nicht überschreiben (GPS-Fahrten haben Sekunden)
    if (!bearbeite || tagText(new Date(f.startzeit)) + zeitText(new Date(f.startzeit)) + zeitText(fahrtEnde(f)) !== $("eDatum").value + $("eStartZ").value + $("eEndeZ").value)
      Object.assign(f, { datum: z.start.toISOString(), startzeit: z.start.toISOString(), endezeit: z.ende.toISOString(), flugzeit: Math.round((z.ende - z.start) / 6e4) });
    Object.assign(f, { bearbeitet: Date.now(), pilot: $("ePilot").value.trim(), ballon: $("eBallon").value.trim().toUpperCase(), startOrt: $("eStart").value.trim(), landeOrt: $("eLande").value.trim(), landungen: Math.max(1, parseInt($("eLand").value, 10) || 1), strecke: +zf($("eKm").value).toFixed(1), bemerkung: $("eBem").value.trim(), gas: zf($("eGas").value) > 0 ? zf($("eGas").value) : undefined });
    f.avgSpeed = f.flugzeit ? +(f.strecke / (f.flugzeit / 60)).toFixed(1) : 0;
    if (!bearbeite) { f.ballontyp = (stamm.ausruestung || []).find(x => x.ballon === f.ballon)?.ballontyp || ""; fluege.push(f); }
    save("fluege", fluege); render();
  }
  bearbeite = null;
});

// ---------- Karte ----------
function kartePrep() {
  if (typeof L === "undefined") { $("map").textContent = "Die Karte benötigt beim ersten Start eine Internetverbindung."; return; }
  if (!karte) {
    karte = L.map("map", { zoomControl: false, attributionControl: false }).setView([47.28, 15.97], 8);
    const esri = p => "https://server.arcgisonline.com/ArcGIS/rest/services/" + p + "/MapServer/tile/{z}/{y}/{x}",
      standard = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }),
      hybrid = L.layerGroup([ // Luftbild mit Straßen und Ortsnamen
        L.tileLayer(esri("World_Imagery"), { maxZoom: 18, attribution: "© Esri" }),
        L.tileLayer(esri("Reference/World_Transportation"), { maxZoom: 18 }),
        L.tileLayer(esri("Reference/World_Boundaries_and_Places"), { maxZoom: 18 })
      ]);
    // Luftfahrt-Ebene (VFR, open flightmaps): zuschaltbar über Standard/Hybrid, Auswahl wird gemerkt; nicht amtlich
    const luft = L.tileLayer("https://nwy-tiles-api.prod.newaydata.com/tiles/{z}/{x}/{y}.png?path=latest/aero/latest", { maxNativeZoom: 11, maxZoom: 19, zIndex: 5, attribution: '<a href="https://www.openflightmaps.org" target="_blank" rel="noopener">open flightmaps</a> (nicht amtlich)' });
    hybrid.addTo(karte); stile = [hybrid, standard];
    if (load("luftEbene", false)) luft.addTo(karte);
    const ebenen = L.control.layers({ Hybrid: hybrid, Standard: standard }, { "Luftfahrt (VFR)": luft }, { position: "topright" }).addTo(karte);
    // Menü nur per Tipp öffnen (Tipp auf die Karte schließt es): am Handy klappte es sonst über Maus-Ersatzereignisse sofort wieder zu
    L.DomEvent.off(ebenen.getContainer(), { mouseenter: ebenen._expandSafely, mouseleave: ebenen.collapse }, ebenen);
    karte.on("overlayadd overlayremove", e => { if (e.layer === luft) localStorage.setItem("luftEbene", String(e.type === "overlayadd")); });
    L.control.zoom({ position: "topleft" }).addTo(karte);
    L.control.scale({ position: "bottomright", imperial: false }).addTo(karte);
    L.control.attribution({ prefix: false, position: "bottomright" }).addTo(karte);
    ebene = L.layerGroup().addTo(karte); liveL = L.layerGroup().addTo(karte);
    // Eigene Bedienung (Verschieben, Zoomen, Buttons) pausiert das Folgen für 10 Sekunden
    ["pointerdown", "pointerup", "wheel"].forEach(ev => karte.getContainer().addEventListener(ev, () => { folgeBis = Date.now() + 10000; }, { passive: true }));
  }
  setTimeout(() => {
    karte.invalidateSize();
    zentriert = false;
    if (!$("fahrt").hidden) ebene.clearLayers(); // Fahrt-Seite: nur die aktuelle Fahrt, keine gespeicherten Tracks
    else zeichne(kartenFluege(), !aktiv);       // Karte-Seite: ausgewählte Fahrten (während einer Fahrt ohne Kartensprung)
    if (aktiv) folgeBis = 0;
    liveKarte();
  }, 50);
}
const pin = c => L.divIcon({ className: "", html: `<i class="pin ${c}"></i>`, iconSize: [20, 20], iconAnchor: [10, 10] });
const linie = (t, farbe, g) => {
  L.polyline(t, { color: "#000", weight: 8, opacity: .35, lineCap: "round", lineJoin: "round" }).addTo(g);
  L.polyline(t, { color: farbe, weight: 4, lineCap: "round", lineJoin: "round" }).addTo(g);
};
// Jede Fahrt bekommt eine eigene Farbe (Reihenfolge wie in der Auswahl), Antippen der Linie zeigt die Fahrt
const TRACKFARBEN = ["#4cc9f0", "#f72585", "#ffb703", "#80ed99", "#b388ff", "#ff7b54", "#00b4d8", "#e9c46a"];
const trackFarbe = i => TRACKFARBEN[i % TRACKFARBEN.length];
let zeichneNr = 0;
async function zeichne(l, anpassen = true) {
  if (!karte) return;
  const nr = ++zeichneNr, spuren = await Promise.all(l.map(f => hatTrack(f) ? spur(f) : []));
  if (nr !== zeichneNr) return; // inzwischen neuere Auswahl
  ebene.clearLayers();
  const b = [];
  l.forEach((f, i) => {
    const t = spuren[i].map(p => [p.lat, p.lng]), info = `<b>${esc(datum(f.startzeit))}</b><br>${esc(f.startOrt || "–")} → ${esc(f.landeOrt || "–")}<br>${dur(f.flugzeit || 0)} · ${num(f.strecke, 1)} km`;
    if (t.length > 1) { linie(t, trackFarbe(i), ebene); L.polyline(t, { opacity: 0, weight: 18 }).addTo(ebene).bindPopup(info); b.push(...t); }
    if (Number.isFinite(f.startLat)) { L.marker([f.startLat, f.startLng], { icon: pin("start") }).addTo(ebene).bindPopup("<b>Start</b> · " + info + "<br>" + utmText(f.startLat, f.startLng)); b.push([f.startLat, f.startLng]); }
    if (Number.isFinite(f.landeLat)) L.marker([f.landeLat, f.landeLng], { icon: pin("landung") }).addTo(ebene).bindPopup("<b>Landung</b> · " + info + "<br>" + utmText(f.landeLat, f.landeLng));
    (f.marken || []).forEach(m => L.marker([m.lat, m.lng], { icon: pin("marke") }).addTo(ebene).bindPopup("<b>Markierung</b><br>" + esc(datum(m.zeit)) + "<br>" + utmText(m.lat, m.lng)));
  });
  if (b.length && anpassen) karte.fitBounds(b, { padding: [30, 30], maxZoom: 14 });
}
function liveKarte() {
  if (!karte || $("karte").hidden && $("fahrt").hidden) return;
  liveL.clearLayers();
  if (aktiv?.t.length > 1) linie(aktiv.t.map(p => [p.lat, p.lng]), "#ffb703", liveL);
  (aktiv?.f.marken || []).forEach(m => L.marker([m.lat, m.lng], { icon: pin("marke"), interactive: false }).addTo(liveL));
  if (pos) {
    L.circle([pos.lat, pos.lng], { radius: pos.genauigkeit || 0, color: "#4cc9f0", weight: 1, fillOpacity: .1, interactive: false }).addTo(liveL);
    L.marker([pos.lat, pos.lng], { icon: pin("live"), interactive: false }).addTo(liveL);
    if ((aktiv || !$("fahrt").hidden) && Date.now() >= folgeBis) {
      if (!zentriert) { karte.setView([pos.lat, pos.lng], 15); zentriert = true; }
      else karte.panTo([pos.lat, pos.lng], { animate: true, duration: .5 });
    }
  }
  $("folgeB").hidden = !aktiv; // Folgen gibt es nur während einer Aufzeichnung
  $("folgeB").textContent = Date.now() >= folgeBis ? "◎ Folgt dir …" : "◎ Zurück zu mir";
}
// Auswahl der Fahrten auf der Karte (pro Gerät): null = alle, auch künftige; sonst Liste der IDs
const mitOrt = f => Number.isFinite(f.startLat) || hatTrack(f);
const kartenFluege = () => { const w = load("kartenAuswahl", null); return [...fluege].filter(mitOrt).filter(f => !w || w.includes(f.id)).sort((a, b) => new Date(b.startzeit) - new Date(a.startzeit)); };
function fwKnopf() { const n = fluege.filter(mitOrt).length, w = load("kartenAuswahl", null); $("fwB").textContent = w ? `Fahrten: ${kartenFluege().length} von ${n}` : `Fahrten: alle (${n})`; }
function fwFarben() { let i = 0; document.querySelectorAll("#fwListe input").forEach(c => { c.parentNode.querySelector(".fk").style.background = c.checked ? trackFarbe(i++) : "transparent"; }); }
$("fwB").onclick = () => {
  const alle = [...fluege].filter(mitOrt).sort((a, b) => new Date(b.startzeit) - new Date(a.startzeit)), w = load("kartenAuswahl", null);
  $("fwListe").innerHTML = alle.length ? alle.map(f => `<label class="chk"><input type="checkbox" data-id="${esc(f.id)}"${!w || w.includes(f.id) ? " checked" : ""}><span><i class="fk"></i>${esc(datum(f.startzeit))}<small>${esc(f.startOrt || "–")} → ${esc(f.landeOrt || "–")} · ${dur(f.flugzeit || 0)} · ${esc(f.ballon)}</small></span></label>`).join("")
    : '<p class="note">Noch keine Fahrt mit Positionsdaten. Nachgetragene Fahrten ohne GPS erscheinen nicht auf der Karte.</p>';
  fwFarben(); $("fwDlg").returnValue = ""; $("fwDlg").showModal();
};
$("fwListe").onchange = fwFarben;
$("fwDlg").querySelector(".row").onclick = e => {
  const w = e.target.closest("[data-w]")?.dataset.w, jahr = String(new Date().getFullYear());
  if (!w) return;
  document.querySelectorAll("#fwListe input").forEach((c, i) => { const f = fluege.find(x => x.id === c.dataset.id); c.checked = w === "alle" || (w === "5" && i < 5) || (w === "jahr" && tagText(new Date(f.startzeit)).startsWith(jahr)); });
  fwFarben();
};
$("fwDlg").addEventListener("close", () => {
  if ($("fwDlg").returnValue !== "ok") return;
  const c = [...document.querySelectorAll("#fwListe input")], ids = c.filter(x => x.checked).map(x => x.dataset.id);
  if (ids.length === c.length) localStorage.removeItem("kartenAuswahl"); else localStorage.setItem("kartenAuswahl", JSON.stringify(ids));
  fwKnopf(); replayStop(); replayF = null; folgeBis = Date.now() + 10000; zeichne(kartenFluege());
});
$("playB").onclick = () => {
  if (replayT) return replayStop();
  const letzte = replayF || kartenFluege().find(hatTrack);
  if (letzte) abspielen(letzte); else alert("Es gibt noch keine Fahrt zum Abspielen.");
};
$("folgeB").onclick = () => { folgeBis = 0; liveKarte(); };
$("posB").onclick = () => {
  if (!karte) return;
  navigator.geolocation.getCurrentPosition(p => {
    const c = p.coords;
    pos = { lat: c.latitude, lng: c.longitude, hoehe: c.altitude, speed: c.speed == null ? null : Math.max(0, c.speed), genauigkeit: c.accuracy };
    liveAnzeige(); liveKarte(); karte.setView([pos.lat, pos.lng], 14);
  }, e => { $("posInfo").textContent = "❌ " + fehler(e); }, { enableHighAccuracy: true, timeout: 15000 });
};

// ---------- Wetter (Open-Meteo, kostenlos, ohne Schlüssel) ----------
const holePos = () => new Promise(res => navigator.geolocation.getCurrentPosition(
  q => res({ lat: q.coords.latitude, lng: q.coords.longitude }), () => res({ lat: 47.28, lng: 15.97 }), { timeout: 10000, maximumAge: 600000 }));
async function wetter() {
  const box = $("wetterBox");
  box.textContent = "Wetterdaten werden geladen …";
  try {
    const p = pos || await holePos();
    const d = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_80m&daily=sunrise,sunset&wind_speed_unit=kmh&timezone=auto&forecast_days=1`)).json();
    const c = d.current, r = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"][Math.round(c.wind_direction_10m / 45) % 8];
    const w = c.wind_speed_10m, bew = w <= 15 ? ["günstig", "ok"] : w <= 25 ? ["grenzwertig", "warn"] : ["ungünstig", "gef"];
    const z = (a, b) => `<p style="display:flex;justify-content:space-between"><span>${a}</span><b>${b}</b></p>`;
    box.innerHTML = z("🌡 Temperatur", num(c.temperature_2m, 1) + " °C") + z("💨 Wind (10 m)", num(w) + " km/h") + z("💨 Wind (80 m)", num(c.wind_speed_80m) + " km/h") +
      z("Böen", num(c.wind_gusts_10m) + " km/h") + z("🧭 Richtung", r + " (" + Math.round(c.wind_direction_10m) + "°)") +
      z("🌅 Sonnenaufgang", d.daily.sunrise[0].slice(11)) + z("🌇 Sonnenuntergang", d.daily.sunset[0].slice(11)) +
      `<p class="status ${bew[1]}" style="color:var(--${bew[1] === "ok" ? "ok" : bew[1]})">Bodenwind: ${bew[0]}</p>`;
  } catch { box.textContent = "Wetterdaten sind offline nicht verfügbar."; }
}
$("wetterB").onclick = wetter;

// ---------- Einstellungen, Backup, Import ----------
// Auswahllisten: zuletzt benutzte Piloten/Ballone plus alle aus dem Flugbuch
function auswahlFuellen() {
  const alt = [...fluege].sort((a, b) => new Date(b.startzeit) - new Date(a.startzeit));
  const quellen = [...(stamm.piloten || []).map(p => ({ pilot: p })), ...(stamm.ballone || []), ...alt];
  const P = [...new Set(quellen.map(x => x.pilot).filter(Boolean))], B = new Map();
  quellen.forEach(x => { if (x.ballon && !B.has(x.ballon)) B.set(x.ballon, x); });
  const opt = (v, t, sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(t)}</option>`;
  $("pilotSel").innerHTML = opt("", "Gespeicherten Piloten wählen …") + P.map(p => opt(p, p, p === stamm.pilot)).join("");
  $("ballonSel").innerHTML = opt("", "Gespeicherten Ballon wählen …") + [...B.values()].map(x => opt(x.ballon + "|" + (x.ballontyp || ""), x.ballon + (x.ballontyp ? " · " + x.ballontyp : ""), x.ballon === stamm.ballon)).join("");
}
function stammSpeichern() {
  stamm.pilot = $("pilot").value.trim(); stamm.ballon = $("ballon").value.trim().toUpperCase();
  stamm.ballontyp = $("ballontyp").value.trim(); stamm.maintenance = $("maintenance").value;
  stamm.volumen = $("volumen").value.trim(); stamm.leergewicht = $("leergewicht").value.trim(); stamm.maxtemp = $("maxtemp").value.trim();
  $("ballon").value = stamm.ballon;
  if (stamm.ballon) { // aktiver Ballon steht auch in der Ausrüstung (Kennzeichen entscheidet)
    const L = stamm.ausruestung ||= [];
    let g = L.find(x => x.ballon === stamm.ballon);
    if (!g) { g = { id: nid() }; L.push(g); }
    Object.assign(g, { ballon: stamm.ballon, ballontyp: stamm.ballontyp, volumen: stamm.volumen, leergewicht: stamm.leergewicht, maxtemp: stamm.maxtemp, wartung: stamm.maintenance });
  }
  const vorn = (liste, x, key) => [x, ...(liste || []).filter(y => key(y) !== key(x))].slice(0, 10);
  if (stamm.pilot) stamm.piloten = vorn(stamm.piloten, stamm.pilot, y => y);
  if (stamm.ballon) stamm.ballone = vorn(stamm.ballone, { ballon: stamm.ballon, ballontyp: stamm.ballontyp }, y => y.ballon); // ein Eintrag pro Kennzeichen, zuletzt gesetzter Typ gewinnt
  save("stammdaten", stamm); ui(); render();
}
["pilot", "ballon", "ballontyp", "maintenance", "volumen", "leergewicht", "maxtemp"].forEach(k => { $(k).value = stamm[k] || ""; $(k).onchange = stammSpeichern; });
$("pilotSel").onchange = () => { if ($("pilotSel").value) { $("pilot").value = $("pilotSel").value; stammSpeichern(); } };
$("ballonSel").onchange = () => {
  const v = $("ballonSel").value;
  if (!v) return;
  const [b, t] = v.split("|");
  $("ballon").value = b; $("ballontyp").value = t; stammSpeichern();
};
Object.entries({ mZ: "zeitraumMonate", mS: "erforderlicheStunden", mL: "erforderlicheLandungen" }).forEach(([id, k]) => {
  $(id).value = mon[k];
  $(id).onchange = () => { const v = parseFloat($(id).value); if (v >= 0) mon[k] = v; $(id).value = mon[k]; save("monitorEinstellungen", mon); render(); };
});
$("expB").onclick = async () => { // Backup enthält die Spuren aus IndexedDB
  const voll = await Promise.all(fluege.map(async f => hatTrack(f) ? { ...f, track: await spur(f) } : f));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ version: 3, fluege: voll, stammdaten: stamm, monitor: mon }, null, 1)], { type: "application/json" }));
  a.download = `ballonflugbuch-${tagText(new Date())}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
$("imp").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const name = file.name.toLowerCase(), text = await file.text();
    if (name.endsWith(".gpx") || name.endsWith(".igc")) {
      const f = fahrtAusTrack(name.endsWith(".igc") ? parseIgc(text) : parseGpx(text), file.name);
      if (fluege.some(x => x.ballon === f.ballon && Math.abs(new Date(x.startzeit) - new Date(f.startzeit)) < 12e4)) throw new Error("Diese Fahrt ist bereits im Flugbuch.");
      await spurAuslagern(f);
      fluege.push(f); save("fluege", fluege); render(); orteNachladen();
      e.target.value = "";
      return alert(`Fahrt aus ${file.name} importiert (${f.strecke} km, ${f.flugzeit} min).`);
    }
    const d = JSON.parse(text), l = Array.isArray(d) ? d : d.fluege;
    if (!Array.isArray(l)) throw 0;
    const key = x => [x.startzeit, x.ballon, x.pilot].join("|").toLowerCase(), have = new Set(fluege.map(key)), ids = new Set(fluege.map(x => x.id));
    let n = 0;
    for (const x of l) if (x?.startzeit && !have.has(key(x)) && !ids.has(x.id)) { x.id ??= nid(); await spurAuslagern(x); fluege.push(x); have.add(key(x)); ids.add(x.id); n++; }
    save("fluege", fluege); render();
    alert(`${n} neue Fahrt(en) importiert, ${l.length - n} Duplikat(e) übersprungen.`);
  } catch (err) { alert(err instanceof SyntaxError ? "Die Datei ist kein gültiges Backup." : err.message); }
  e.target.value = "";
};

// Daten aus der Cloud übernehmen (von sync.js aufgerufen); schreibt direkt, ohne neuen Abgleich auszulösen
// ---------- Höhe über Grund (Geländehöhe von Open-Meteo, kostenlos) ----------
let bodenH = null, bodenPos = null, bodenZeit = 0;
async function bodenhoehe() {
  if (!pos || !navigator.onLine) return;
  if (bodenPos && km(bodenPos, pos) < 0.3 && Date.now() - bodenZeit < 120000) return;
  bodenZeit = Date.now(); bodenPos = { lat: pos.lat, lng: pos.lng };
  try {
    const d = await (await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${pos.lat}&longitude=${pos.lng}`)).json();
    bodenH = Number.isFinite(+d.elevation?.[0]) ? +d.elevation[0] : null;
  } catch { bodenH = null; }
}

// ---------- GPX-Export, GPX/IGC-Import, Wiedergabe ----------
function gpxText(f, track) {
  const x = s => String(s ?? "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const pt = p => `<trkpt lat="${p.lat}" lon="${p.lng}">${Number.isFinite(p.hoehe) ? `<ele>${p.hoehe.toFixed(1)}</ele>` : ""}<time>${p.zeit}</time></trkpt>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Ballonflugbuch" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    (f.marken || []).map(m => `<wpt lat="${m.lat}" lon="${m.lng}"><time>${m.zeit}</time><name>Markierung</name></wpt>\n`).join("") +
    `<trk><name>${x(datum(f.startzeit))} ${x(f.startOrt)}</name><trkseg>\n${track.map(pt).join("\n")}\n</trkseg></trk>\n</gpx>\n`;
}
async function gpxExport(f) {
  const t = await spur(f);
  if (!t.length) return alert("Diese Fahrt hat keinen Track.");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([gpxText(f, t)], { type: "application/gpx+xml" }));
  a.download = `fahrt-${tagText(new Date(f.startzeit))}.gpx`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function parseGpx(text) {
  const x = new DOMParser().parseFromString(text, "application/xml");
  if (x.querySelector("parsererror")) throw new Error("Ungültige GPX-Datei.");
  const t = [...x.getElementsByTagName("trkpt")].map(p => {
    const ele = p.getElementsByTagName("ele")[0]?.textContent, zeit = p.getElementsByTagName("time")[0]?.textContent;
    return { lat: +p.getAttribute("lat"), lng: +p.getAttribute("lon"), hoehe: ele ? +ele : null, genauigkeit: null, zeit: zeit && !isNaN(new Date(zeit)) ? new Date(zeit).toISOString() : null };
  }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.zeit);
  if (t.length < 2) throw new Error("Die GPX-Datei enthält keinen Track mit Zeitstempeln.");
  return t;
}
function parseIgc(text) {
  const zl = text.split(/\r?\n/), d = zl.find(l => l.startsWith("HFDTE"))?.match(/(\d{2})(\d{2})(\d{2})/);
  if (!d) throw new Error("In der IGC-Datei fehlt das Datum.");
  let tag = Date.UTC(2000 + +d[3], +d[2] - 1, +d[1]), last = -1;
  const t = [];
  zl.forEach(l => {
    const m = l.match(/^B(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})([NS])(\d{3})(\d{2})(\d{3})([EW])A(-\d{4}|\d{5})(-\d{4}|\d{5})/);
    if (!m) return;
    const sek = +m[1] * 3600 + +m[2] * 60 + +m[3];
    if (last >= 0 && sek < last) tag += 864e5; // Mitternachtsübergang
    last = sek;
    t.push({ lat: (+m[4] + (+m[5] + m[6] / 1000) / 60) * (m[7] === "S" ? -1 : 1), lng: (+m[8] + (+m[9] + m[10] / 1000) / 60) * (m[11] === "W" ? -1 : 1),
      hoehe: +m[13] || +m[12], genauigkeit: null, zeit: new Date(tag + sek * 1000).toISOString() });
  });
  if (t.length < 2) throw new Error("Die IGC-Datei enthält keine gültigen Positionen.");
  return t;
}
function fahrtAusTrack(t, quelle) {
  let d = 0;
  for (let i = 1; i < t.length; i++) {
    d += km(t[i - 1], t[i]);
    if (!Number.isFinite(t[i].speed)) { const dt = (new Date(t[i].zeit) - new Date(t[i - 1].zeit)) / 1000; t[i].speed = dt > 0 ? km(t[i - 1], t[i]) * 1000 / dt : 0; }
  }
  t[0].speed ??= 0;
  const h = t.map(p => p.hoehe).filter(Number.isFinite), s = t.map(p => p.speed);
  const min = Math.max(1, Math.round((new Date(t.at(-1).zeit) - new Date(t[0].zeit)) / 6e4));
  return { id: nid(), datum: t[0].zeit, startzeit: t[0].zeit, endezeit: t.at(-1).zeit, pilot: stamm.pilot || "", ballon: stamm.ballon || "", ballontyp: stamm.ballontyp || "",
    startLat: t[0].lat, startLng: t[0].lng, landeLat: t.at(-1).lat, landeLng: t.at(-1).lng, flugzeit: min, strecke: +d.toFixed(1), track: t,
    maxHoehe: h.length ? Math.round(Math.max(...h)) : 0, minHoehe: h.length ? Math.round(Math.min(...h)) : 0, avgHoehe: h.length ? Math.round(h.reduce((a, b) => a + b, 0) / h.length) : 0,
    maxSpeed: +(Math.max(...s) * 3.6).toFixed(1), avgSpeed: +(d / (min / 60)).toFixed(1), landungen: 1, bemerkung: "Import: " + quelle, bearbeitet: Date.now() };
}

let replayT = null, replayM = null, replayF = null;
function replayStop() {
  clearInterval(replayT); replayT = null;
  replayM?.remove(); replayM = null;
  const b = document.getElementById("playB"); if (b) b.textContent = "▶ Wiedergabe";
}
async function abspielen(f) {
  const t = await spur(f);
  if (!karte || t.length < 2) return alert("Für die Wiedergabe werden Karte und Track benötigt.");
  replayStop(); replayF = f; zeichne([f]);
  const t0 = new Date(t[0].zeit).getTime(), dauer = new Date(t.at(-1).zeit).getTime() - t0, tempo = 30; // 30-fache Geschwindigkeit
  replayM = L.marker([t[0].lat, t[0].lng], { icon: pin("live"), interactive: false }).addTo(karte);
  let ms = 0, i = 0;
  $("playB").textContent = "■ Stopp";
  replayT = setInterval(() => {
    ms = Math.min(dauer, ms + 250 * tempo);
    while (i < t.length - 1 && new Date(t[i + 1].zeit).getTime() - t0 <= ms) i++;
    const p = t[i];
    replayM.setLatLng([p.lat, p.lng]);
    $("posInfo").textContent = `Wiedergabe ${dur(ms / 6e4)} · Höhe ${Number.isFinite(p.hoehe) ? Math.round(p.hoehe) + " m" : "–"} · ${Number.isFinite(p.speed) ? num(p.speed * 3.6) + " km/h" : "–"}`;
    if (ms >= dauer) { clearInterval(replayT); replayT = null; $("playB").textContent = "▶ Nochmal"; }
  }, 250);
}

// ---------- Gas: Flaschen, Nachfüllungen, Verbrauch ----------
const zf = v => parseFloat(String(v ?? "").replace(",", ".")) || 0;
const kg1 = v => num(zf(v), 1).replace(",0", "");
const fFelder = { fName: "name", fKap: "kap", fTara: "tara", fFuell: "fuell", fPruef: "pruefung", fNotiz: "notiz" };
let fBearb = null, nFlasche = null;
const flaschenName = id => (stamm.flaschen || []).find(x => x.id === id)?.name || "Flasche";
function gasFlFuellen() { // Verbrauch je Flasche der geplanten Fahrt, sonst einfache Eingabe
  const pf = aktiv?.f.plan?.flaschen || [], inp = (id, ph) => `<input class="gk" data-id="${esc(id)}" type="number" min="0" step="0.5" inputmode="decimal"${ph ? ` placeholder="${esc(ph)}"` : ""}>`;
  $("gasZeilen").innerHTML = pf.length
    ? pf.map(x => `<label>Gasverbrauch ${esc(x.name)} (kg)${inp(x.id, `vorher ${kg1(x.gas)} kg`)}</label>`).join("")
    : `<label>Gasverbrauch (kg, optional)${inp("")}</label><label>Von Flasche abbuchen<select id="gasFl"><option value="">nicht abbuchen</option>${(stamm.flaschen || []).map(x => `<option value="${esc(x.id)}">${esc(x.name)} (${kg1(x.fuell)} kg)</option>`).join("")}</select></label>`;
}
function gasRender() {
  const F = stamm.flaschen || [], vorrat = F.reduce((s, x) => s + zf(x.fuell), 0), kap = F.reduce((s, x) => s + zf(x.kap), 0);
  const mit = fluege.filter(f => zf(f.gas) > 0), kgSum = mit.reduce((s, f) => s + zf(f.gas), 0), std = mit.reduce((s, f) => s + (f.flugzeit || 0), 0) / 60;
  const proFahrt = mit.length ? kgSum / mit.length : 0, proH = std > 0 ? kgSum / std : 0;
  const L = [...(stamm.gasLog || [])].sort((a, b) => String(b.datum).localeCompare(String(a.datum)));
  const kosten = L.reduce((s, e) => s + zf(e.preis), 0), kgPreis = L.filter(e => zf(e.preis) > 0).reduce((s, e) => s + zf(e.kg), 0), eurKg = kgPreis ? kosten / kgPreis : 0;
  const kp = (a, b, c) => `<div class="kpi"><small>${a}</small><b>${b}</b>${c ? `<small>${c}</small>` : ""}</div>`;
  $("gSumm").innerHTML = kp("Vorrat", `${kg1(vorrat)} kg`, kap ? `von ${kg1(kap)} kg` : "") + kp("Ø je Fahrt", proFahrt ? `${kg1(proFahrt)} kg` : "–", mit.length ? `${mit.length} ${mit.length === 1 ? "Fahrt" : "Fahrten"}` : "noch keine Angabe") +
    kp("Ø je Flugstunde", proH ? `${kg1(proH)} kg` : "–", proH && eurKg ? `ca. ${num(proH * eurKg, 2)} €` : "") + kp("Reicht noch für", proH && vorrat ? `${num(vorrat / proH, 1)} h` : "–", "bei gleichem Verbrauch");
  $("fListe").innerHTML = F.length ? F.map(x => {
    const p = zf(x.kap) > 0 ? Math.min(100, zf(x.fuell) / zf(x.kap) * 100) : 0, b = (a, t, c = "") => `<button data-a="${a}" data-id="${esc(x.id)}"${c ? ` class="${c}"` : ""}>${t}</button>`;
    return `<article class="card"><h3>${esc(x.name)}</h3>
      <div class="bar"><span>${kg1(x.fuell)} von ${kg1(x.kap)} kg Gas · ${num(p)} %${zf(x.tara) ? ` · mit Flasche ${kg1(zf(x.tara) + zf(x.fuell))} kg` : ""}</span><i><u style="width:${p}%"${p >= 20 ? ' class="ok"' : ""}></u></i></div>
      ${terminZeile(x.pruefung, "Prüfung")}${x.notiz ? `<p class="m">${esc(x.notiz)}</p>` : ""}
      <div class="row">${b("fill", "Nachfüllen", "ok")}${b("edit", "Bearbeiten")}${b("del", "Löschen", "gef")}</div></article>`;
  }).join("") : '<p class="leer">Noch keine Gasflasche eingetragen.</p>';
  $("gLog").innerHTML = L.length ? L.slice(0, 8).map(e => `<div class="zeile"><span>${esc(new Date(e.datum + "T00:00:00").toLocaleDateString("de-AT"))} · ${esc(flaschenName(e.flasche))}${e.notiz ? " · " + esc(e.notiz) : ""}</span><b>${nb(`${kg1(e.kg)} kg${zf(e.preis) > 0 ? ` · ${num(zf(e.preis), 2)} €` : ""}`)}</b></div>`).join("") +
    (kosten ? `<div class="zeile"><span>Kosten gesamt</span><b>${nb(`${num(kosten, 2)} €${eurKg ? ` · Ø ${num(eurKg, 2)} €/kg` : ""}`)}</b></div>` : "") : '<p class="note">Noch keine Nachfüllung eingetragen.</p>';
  gSelRender();
}
function fDialog(x) {
  fBearb = x || null;
  Object.entries(fFelder).forEach(([id, k]) => { $(id).value = x?.[k] ?? ""; });
  $("fDlg").returnValue = ""; $("fDlg").showModal();
}
function nDialog(x) {
  nFlasche = x;
  $("nKg").value = String(Math.max(0, Math.round((zf(x.kap) - zf(x.fuell)) * 10) / 10)); $("nPreis").value = ""; $("nNotiz").value = "";
  const h = new Date(); $("nDatum").value = `${h.getFullYear()}-${p2(h.getMonth() + 1)}-${p2(h.getDate())}`; // lokales Datum, nicht UTC
  $("nDlg").returnValue = ""; $("nDlg").showModal();
}
$("fNeu").onclick = () => fDialog();
$("fListe").onclick = e => {
  const bt = e.target.closest("button"), x = bt && (stamm.flaschen || []).find(y => y.id === bt.dataset.id);
  if (!x) return;
  if (bt.dataset.a === "fill") nDialog(x);
  else if (bt.dataset.a === "edit") fDialog(x);
  else if (confirm(`${x.name} löschen? Die Nachfüllungen bleiben im Verlauf erhalten.`)) { stamm.flaschen = stamm.flaschen.filter(y => y !== x); save("stammdaten", stamm); render(); }
};
$("fDlg").addEventListener("close", () => {
  if ($("fDlg").returnValue !== "ok") return;
  const n = {};
  Object.entries(fFelder).forEach(([id, k]) => { n[k] = $(id).value.trim(); });
  if (!n.name) return alert("Bitte einen Namen eintragen, zum Beispiel Flasche 1.");
  const L = stamm.flaschen ||= [];
  if (fBearb) Object.assign(fBearb, n); else L.push({ id: nid(), ...n });
  fBearb = null; save("stammdaten", stamm); render();
});
$("nDlg").addEventListener("close", () => {
  if ($("nDlg").returnValue !== "ok" || !nFlasche) return;
  const kg = zf($("nKg").value), x = nFlasche;
  if (!(kg > 0)) return alert("Bitte die nachgefüllte Menge in kg eintragen.");
  x.fuell = String(Math.round(Math.min(zf(x.kap) || Infinity, zf(x.fuell) + kg) * 10) / 10);
  (stamm.gasLog ||= []).push({ id: nid(), datum: $("nDatum").value || new Date().toISOString().slice(0, 10), flasche: x.id, kg, preis: $("nPreis").value.trim(), notiz: $("nNotiz").value.trim() });
  nFlasche = null; save("stammdaten", stamm); render();
});

// ---------- Ausrüstung: mehrere Ballone mit Terminen ----------
const gFelder = { gBallon: "ballon", gTyp: "ballontyp", gVol: "volumen", gLeer: "leergewicht", gMax: "maxtemp", gWart: "wartung", gPruef: "pruefung", gNotiz: "notiz" };
let gBearb = null;
function tage(d) {
  if (!d) return null;
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((new Date(d + "T00:00:00") - h) / 864e5);
}
function terminZeile(d, name) {
  const t = tage(d);
  if (t === null) return "";
  const f = t < 0 ? "gef" : t <= WARNTAGE ? "warn" : "ok", txt = t < 0 ? `überfällig seit\u00a0${-t} ${t === -1 ? "Tag" : "Tagen"}` : t === 0 ? "heute fällig" : `noch\u00a0${t} ${t === 1 ? "Tag" : "Tage"}`;
  return `<div class="zeile"><span>${esc(name)}: ${esc(new Date(d + "T00:00:00").toLocaleDateString("de-AT"))}</span><b style="color:var(--${f})">${nb(txt)}</b></div>`;
}
function ausruestungRender() {
  // Altbestand: der in den Einstellungen eingetragene Ballon wird einmalig in die Ausrüstung übernommen
  if (stamm.ballon && !(stamm.ausruestung || []).some(x => x.ballon === stamm.ballon)) {
    (stamm.ausruestung ||= []).push({ id: nid(), ballon: stamm.ballon, ballontyp: stamm.ballontyp || "", volumen: stamm.volumen || "", leergewicht: stamm.leergewicht || "", maxtemp: stamm.maxtemp || "", wartung: stamm.maintenance || "" });
    localStorage.setItem("stammdaten", JSON.stringify(stamm));
  }
  const L = stamm.ausruestung || [], b = (id, a, t, c = "") => `<button data-a="${a}" data-id="${esc(id)}"${c ? ` class="${c}"` : ""}>${t}</button>`;
  $("gListe").innerHTML = L.length ? L.map(g => {
    const aktiv = g.ballon === stamm.ballon;
    return `<article class="card"><h3>${esc(g.ballon)}${g.ballontyp ? " · " + esc(g.ballontyp) : ""}${aktiv ? ' <span class="badge">aktiv</span>' : ""}</h3>
      <p class="m">${g.volumen ? esc(g.volumen) + " m³" : "Volumen –"} · Leergewicht ${g.leergewicht ? esc(g.leergewicht) + " kg" : "–"} · max. ${g.maxtemp ? esc(g.maxtemp) + " °C" : "–"}</p>
      ${terminZeile(g.wartung, "Wartung")}${terminZeile(g.pruefung, "Nachprüfung")}${g.notiz ? `<p class="m">${esc(g.notiz)}</p>` : ""}
      <div class="row">${aktiv ? "" : b(g.id, "aktiv", "Aktiv setzen", "ok")}${b(g.id, "edit", "Bearbeiten")}${b(g.id, "del", "Löschen", "gef")}</div></article>`;
  }).join("") : '<p class="leer">Noch kein Ballon eingetragen.</p>';
  rBallonFuellen();
}
// Gerätespeicher (Browser, ca. 5 Mio. Zeichen je Website): Anzeige in den Einstellungen, Warnung auf der Startseite ab 70 %
function speicherAnzeige() {
  let n = 0;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || "").length; } } catch { return; }
  const p = Math.round(n / 5e6 * 100);
  $("speicher").textContent = `Fahrten und Einstellungen: ${num(n / 1e6, 1)} von ca. 5 MB (${p} %).`;
  navigator.storage?.estimate?.().then(e => { $("speicher").textContent += ` GPS-Spuren und App: ${num(e.usage / 1e6, 1)} MB, frei ca. ${num((e.quota - e.usage) / 1e9, 1)} GB.`; }).catch(() => {});
  $("speicherWarn").hidden = p < 70;
  $("speicherWarn").textContent = `⚠ Der Speicher für Fahrten und Einstellungen ist zu ${p} % belegt. Bitte unter Einstellungen ein Backup erstellen.`;
}
// Startseite: Pilot mit Lizenz und alle Fristen (Pilot, Ballone, Flaschen, Fahrzeuge), die nächste zuerst
function termineRender() {
  const f = [], p = stamm.profil || {}, add = (d, n) => { const t = tage(d); if (t !== null) f.push({ t, d, n }); };
  add(p.check, "Checkfahrt"); add(p.medical, "Medical");
  (p.eigene || []).forEach(x => add(x.datum, x.name + (x.wert ? ` (${x.wert})` : "") || "Eintrag"));
  (stamm.ausruestung || []).forEach(g => { add(g.wartung, `${g.ballon} · Wartung`); add(g.pruefung, `${g.ballon} · Nachprüfung`); });
  (stamm.flaschen || []).forEach(x => add(x.pruefung, `${x.name} · Prüfung`));
  (stamm.fahrzeuge || []).forEach(x => add(x.pruefung, `${x.art} ${x.kennzeichen || x.name} · Prüfung`));
  const info = (p.eigene || []).filter(x => x.name && x.wert && !x.datum).map(x => `<p class="pinfo m">${esc(x.name)}: ${esc(x.wert)}</p>`).join("");
  const kopf = p.name || p.lizenz ? `<p class="pkopf"><b>${esc(p.name || stamm.pilot || "")}</b>${p.lizenz ? ` · Lizenz ${esc(p.lizenz)}` : ""}</p>` : "";
  $("termine").hidden = !(kopf || info || f.length);
  $("termine").classList.toggle("dringend", f.some(x => x.t <= WARNTAGE));
  $("termine").innerHTML = `<h2>${kopf || info ? "Pilot &amp; Fristen" : "Fristen"}</h2>` + kopf + info + f.sort((a, b) => a.t - b.t).map(x => terminZeile(x.d, x.n)).join("");
}

// Pilotenprofil des Kontoinhabers (Name, Lizenz, Checkfahrt, Medical, eigene Einträge), wird mit den Stammdaten abgeglichen
function profilRender() {
  const p = stamm.profil || {};
  $("prName").value = p.name || ""; $("prName").placeholder = stamm.pilot || ""; $("prLizenz").value = p.lizenz || "";
  $("prCheck").value = p.check || ""; $("prMedical").value = p.medical || "";
  $("prEigene").innerHTML = (p.eigene || []).map(x => `<div class="prow" data-id="${esc(x.id)}"><input class="pn" value="${esc(x.name)}" placeholder="Bezeichnung" aria-label="Bezeichnung" autocomplete="off"><input class="pw" value="${esc(x.wert)}" placeholder="Wert / Nummer" aria-label="Wert" autocomplete="off"><input class="pd" type="date" value="${esc(x.datum)}" aria-label="Gültig bis"><button class="zx" aria-label="Eintrag entfernen">✕</button></div>`).join("");
}
function profilSpeichern() {
  stamm.profil = { name: $("prName").value.trim(), lizenz: $("prLizenz").value.trim(), check: $("prCheck").value, medical: $("prMedical").value,
    eigene: [...document.querySelectorAll("#prEigene .prow")].map(r => ({ id: r.dataset.id, name: r.querySelector(".pn").value.trim(), wert: r.querySelector(".pw").value.trim(), datum: r.querySelector(".pd").value })).filter(x => x.name || x.wert || x.datum) };
  save("stammdaten", stamm); termineRender();
}
$("prK").addEventListener("change", e => { if (e.target.matches("input")) profilSpeichern(); });
$("prNeu").onclick = () => {
  $("prEigene").insertAdjacentHTML("beforeend", `<div class="prow" data-id="${nid()}"><input class="pn" placeholder="Bezeichnung" aria-label="Bezeichnung" autocomplete="off"><input class="pw" placeholder="Wert / Nummer" aria-label="Wert" autocomplete="off"><input class="pd" type="date" aria-label="Gültig bis"><button class="zx" aria-label="Eintrag entfernen">✕</button></div>`);
  $("prEigene").lastElementChild.querySelector(".pn").focus();
};
$("prEigene").onclick = e => { const b = e.target.closest(".zx"); if (b) { b.closest(".prow").remove(); profilSpeichern(); } };
function rBallonFuellen() {
  const L = stamm.ausruestung || [];
  $("rBallon").innerHTML = L.length ? L.map(g => `<option value="${esc(g.id)}"${g.ballon === stamm.ballon ? " selected" : ""}>${esc(g.ballon)}${g.ballontyp ? " · " + esc(g.ballontyp) : ""}${g.volumen ? " · " + esc(g.volumen) + " m³" : ""}</option>`).join("") : '<option value="">Noch kein Ballon</option>';
  const g = L.find(x => x.id === $("rBallon").value) || L.find(x => x.ballon === stamm.ballon);
  $("rBInfo").innerHTML = g ? `<p class="m">${g.volumen ? esc(g.volumen) + " m³" : "Volumen –"} · Leergewicht ${g.leergewicht ? esc(g.leergewicht) + " kg" : "–"} · max. ${g.maxtemp ? esc(g.maxtemp) + " °C" : "–"}</p>${terminZeile(g.wartung, "Wartung")}${terminZeile(g.pruefung, "Nachprüfung")}` : '<p class="warn">Bitte unter Ausrüstung einen Ballon anlegen.</p>';
}
function aktivSetzen(g) {
  $("ballon").value = g.ballon; $("ballontyp").value = g.ballontyp || ""; $("volumen").value = g.volumen || "";
  $("leergewicht").value = g.leergewicht || ""; $("maxtemp").value = g.maxtemp || ""; $("maintenance").value = g.wartung || "";
  stammSpeichern();
}
function gDialog(g) {
  gBearb = g || null;
  Object.entries(gFelder).forEach(([id, k]) => { $(id).value = g?.[k] || ""; });
  $("gDlg").returnValue = ""; $("gDlg").showModal();
}
$("gNeu").onclick = () => gDialog();
$("rBallon").onchange = () => { const g = (stamm.ausruestung || []).find(x => x.id === $("rBallon").value); if (g) { aktivSetzen(g); rechnen(); } };
$("gListe").onclick = e => {
  const bt = e.target.closest("button"), g = bt && (stamm.ausruestung || []).find(x => x.id === bt.dataset.id);
  if (!g) return;
  if (bt.dataset.a === "aktiv") aktivSetzen(g);
  else if (bt.dataset.a === "edit") gDialog(g);
  else if (confirm(`Ballon ${g.ballon} aus der Ausrüstung löschen? Bereits gespeicherte Fahrten bleiben erhalten.`)) {
    if (g.ballon === stamm.ballon) ["ballon", "ballontyp", "volumen", "leergewicht", "maxtemp", "maintenance"].forEach(k => { stamm[k] = ""; $(k).value = ""; }); // aktiver Ballon: Einstellungen leeren
    stamm.ausruestung = stamm.ausruestung.filter(x => x !== g); save("stammdaten", stamm); render();
  }
};
$("gDlg").addEventListener("close", () => {
  if ($("gDlg").returnValue !== "ok") return;
  const n = {};
  Object.entries(gFelder).forEach(([id, k]) => { n[k] = $(id).value.trim(); });
  n.ballon = n.ballon.toUpperCase();
  const L = stamm.ausruestung ||= [];
  if (!n.ballon) return alert("Bitte ein Kennzeichen eintragen.");
  if (L.some(x => x !== gBearb && x.ballon === n.ballon)) return alert("Dieser Ballon ist schon vorhanden.");
  const war = gBearb && gBearb.ballon === stamm.ballon;
  let g = gBearb;
  if (g) Object.assign(g, n); else { g = { id: nid(), ...n }; L.push(g); }
  gBearb = null;
  if (war) aktivSetzen(g); else { save("stammdaten", stamm); render(); }
});

// ---------- Fahrzeuge: Auto und Anhänger mit Prüfterminen ----------
const WARNTAGE = 28; // Hinweis auf der Startseite 4 Wochen vor Ablauf
const vFelder = { vArt: "art", vName: "name", vKz: "kennzeichen", vPruef: "pruefung", vNotiz: "notiz" };
let vBearb = null;
function vRender() {
  const V = stamm.fahrzeuge || [];
  $("vListe").innerHTML = V.length ? V.map(x => `<article class="card"><h3>${esc(x.art)} · ${esc(x.name)}${x.kennzeichen ? " · " + esc(x.kennzeichen) : ""}</h3>
    ${terminZeile(x.pruefung, "Prüfung (Pickerl)")}${x.notiz ? `<p class="m">${esc(x.notiz)}</p>` : ""}
    <div class="row"><button data-a="edit" data-id="${esc(x.id)}">Bearbeiten</button><button data-a="del" data-id="${esc(x.id)}" class="gef">Löschen</button></div></article>`).join("") : '<p class="leer">Noch kein Fahrzeug eingetragen.</p>';
}
function vDialog(x) {
  vBearb = x || null;
  Object.entries(vFelder).forEach(([id, k]) => { $(id).value = x?.[k] ?? (k === "art" ? "Auto" : ""); });
  $("vDlg").returnValue = ""; $("vDlg").showModal();
}
$("vNeu").onclick = () => vDialog();
$("vListe").onclick = e => {
  const bt = e.target.closest("button"), x = bt && (stamm.fahrzeuge || []).find(y => y.id === bt.dataset.id);
  if (!x) return;
  if (bt.dataset.a === "edit") vDialog(x);
  else if (confirm(`${x.art} ${x.name} löschen?`)) { stamm.fahrzeuge = stamm.fahrzeuge.filter(y => y !== x); save("stammdaten", stamm); render(); }
};
$("vDlg").addEventListener("close", () => {
  if ($("vDlg").returnValue !== "ok") return;
  const n = {};
  Object.entries(vFelder).forEach(([id, k]) => { n[k] = $(id).value.trim(); });
  if (!n.name && !n.kennzeichen) return alert("Bitte eine Bezeichnung oder ein Kennzeichen eintragen.");
  n.name = n.name || n.kennzeichen;
  const L = stamm.fahrzeuge ||= [];
  if (vBearb) Object.assign(vBearb, n); else L.push({ id: nid(), ...n });
  vBearb = null; save("stammdaten", stamm); render();
});

// ---------- Auftriebsrechner (Gasgleichung, ISA-Näherung) ----------
function rechnen() {
  const zahl = id => parseFloat(String($(id).value).replace(",", ".")), box = $("rErg");
  const V = parseFloat(stamm.volumen), leer = parseFloat(stamm.leergewicht) || 0, maxT = parseFloat(stamm.maxtemp);
  if (!(V > 0)) { planErg = null; box.innerHTML = '<p class="warn">Bitte unter Ausrüstung beim Ballon Hüllenvolumen und Leergewicht eintragen.</p>'; planAktualisieren(); return; }
  const Ta = zahl("rT"), h = zahl("rH"), qnh = zahl("rQ") || 1013.25, Ti = zahl("rI"), last = zulSumme() + gasLast();
  if (![Ta, h, Ti].every(Number.isFinite)) { planErg = null; box.innerHTML = '<p class="note">Bitte Außentemperatur, Starthöhe und Hüllentemperatur eintragen.</p>'; planAktualisieren(); return; }
  planSpeichern();
  const R = 287.05, p = qnh * Math.pow(1 - 2.25577e-5 * h, 5.25588) * 100;           // Luftdruck in Pa
  const rhoA = p / (R * (Ta + 273.15)), rhoI = p / (R * (Ti + 273.15));
  const brutto = V * (rhoA - rhoI), nutz = brutto - leer, frei = nutz - last;
  const rhoN = rhoA - (leer + last) / V, tN = rhoN > 0 ? p / (R * rhoN) - 273.15 : null; // nötige Hüllentemperatur zum Schweben
  planErg = { p: p / 100, brutto, leer, nutz, last, frei, tN, maxT: maxT || null, bed: { T: Ta, h, qnh, Ti } };
  const z = (a, b, c) => `<div class="zeile"><span>${a}</span><b${c ? ` style="color:var(--${c})"` : ""}>${nb(b)}</b></div>`;
  let urteil = "";
  if (tN === null) urteil = z("Bewertung", "Nicht erreichbar: Last zu groß", "gef");
  else if (maxT > 0) urteil = tN > maxT ? z("Bewertung", `Reicht nicht: nötig ${num(tN)} °C, max. ${num(maxT)} °C`, "gef") : z("Reserve bis max. Hüllentemperatur", `${num(maxT - tN)} °C`, maxT - tN < 10 ? "warn" : "ok");
  box.innerHTML = z("Luftdruck am Startplatz", `${num(p / 100, 1)} hPa`) + z("Luftdichte außen / innen", `${num(rhoA, 3)} / ${num(rhoI, 3)} kg/m³`) +
    z("Auftrieb je m³", `${num(rhoA - rhoI, 3)} kg`) + z("Bruttoauftrieb", `${num(brutto)} kg`) + z("abzüglich Leergewicht", `${num(leer)} kg`) +
    z("Nutzlast (maximale Zuladung)", `${num(nutz)} kg`) + zulZeilen(z) + gasZeilen(z) + z("Zuladung gesamt", `${num(last)} kg`) +
    z("Freier Auftrieb", `${num(frei)} kg`, frei < 0 ? "gef" : "ok") + z("Nötige Hüllentemperatur zum Schweben", tN === null ? "–" : `${num(tN)} °C`) + urteil;
  planAktualisieren();
}
// ---------- Fahrtplanung: Checkliste, Gasflaschen je Fahrt, Planung wird zur Fahrt gespeichert ----------
let planSel = [], planCheck = {}, planTraj = null, planErg = null, planFuerStart = null;
const PLANMANUELL = [["w", "Wetter und Windprofil geprüft"], ["l", "Luftraum und NOTAM geprüft"], ["b", "Brenner, Flaschen und Armaturen geprüft"], ["p", "Passagiere eingewiesen"], ["f", "Funk und Handy geladen"], ["r", "Rückholteam informiert"]];
const selFlaschen = () => planSel.map(id => (stamm.flaschen || []).find(y => y.id === id)).filter(Boolean);
const gasLast = () => selFlaschen().reduce((s, x) => s + zf(x.tara) + zf(x.fuell), 0);
const planSpeichern = () => save("auftrieb", { rT: $("rT").value, rH: $("rH").value, rQ: $("rQ").value, rI: $("rI").value, zul, sel: planSel, check: planCheck });
function gasZeilen(z) {
  return selFlaschen().map(x => z("· " + esc(x.name), `${kg1(x.fuell)} kg Gas + ${kg1(x.tara)} kg Flasche = ${kg1(zf(x.fuell) + zf(x.tara))} kg`)).join("");
}
function gSelRender() {
  const F = stamm.flaschen || [];
  planSel = planSel.filter(id => F.some(x => x.id === id));
  $("gSel").innerHTML = F.length ? F.map(x => {
    const t = tage(x.pruefung);
    return `<label class="chk"><input type="checkbox" data-id="${esc(x.id)}"${planSel.includes(x.id) ? " checked" : ""}><span>${esc(x.name)} · ${kg1(x.fuell)} von ${kg1(x.kap)} kg Gas · gesamt ${kg1(zf(x.tara) + zf(x.fuell))} kg${t !== null && t < 0 ? ' · <b style="color:var(--gef)">Prüfung überfällig</b>' : ""}</span></label>`;
  }).join("") : '<p class="note">Noch keine Gasflasche angelegt.</p>';
}
function planPruefen() {
  const L = stamm.ausruestung || [], g = L.find(x => x.id === $("rBallon").value) || L.find(x => x.ballon === stamm.ballon), F = selFlaschen();
  const ueber = d => tage(d) !== null && tage(d) < 0, zs = zulSumme(), fz = stamm.fahrzeuge || [];
  return [
    { text: "Ballon gewählt", ok: !!g && !ueber(g.wartung) && !ueber(g.pruefung), detail: !g ? "kein Ballon" : ueber(g.wartung) ? "Wartung überfällig" : ueber(g.pruefung) ? "Nachprüfung überfällig" : g.ballon },
    { text: "Gasflaschen gewählt", ok: F.length > 0 && !F.some(x => ueber(x.pruefung)) && F.every(x => zf(x.fuell) > 0), detail: !F.length ? "keine Flasche" : F.some(x => ueber(x.pruefung)) ? "Flaschenprüfung überfällig" : F.some(x => zf(x.fuell) <= 0) ? "Flasche leer" : `${F.length} Flasche(n), ${kg1(F.reduce((s, x) => s + zf(x.fuell), 0))} kg Gas` },
    { text: "Besatzung und Zuladung eingetragen", ok: zs > 0, detail: zs > 0 ? `${num(zs)} kg` : "keine Gewichte" },
    { text: "Auftrieb ausreichend", ok: !!planErg && planErg.frei >= 0 && planErg.tN !== null && !(planErg.maxT && planErg.tN > planErg.maxT), detail: !planErg ? "nicht berechnet" : `${num(planErg.frei)} kg frei` },
    { text: "Trajektoren berechnet", ok: !!planTraj && Date.now() - planTraj.erstellt < 6 * 36e5, detail: !planTraj ? "noch nicht" : Date.now() - planTraj.erstellt >= 6 * 36e5 ? "älter als 6 Stunden" : "aktuell" },
    ...(fz.length ? [{ text: "Auto und Anhänger geprüft", ok: !fz.some(x => ueber(x.pruefung)), detail: fz.some(x => ueber(x.pruefung)) ? "Prüfung überfällig" : `${fz.length} Fahrzeug(e) in Ordnung` }] : [])
  ];
}
function planAktualisieren() {
  const row = x => `<div class="zeile"><span>${x.ok ? "✓" : "✕"} ${x.text}</span><b style="color:var(--${x.ok ? "ok" : "gef"})">${esc(x.detail)}</b></div>`;
  $("pCheck").innerHTML = planPruefen().map(row).join("") + PLANMANUELL.map(([k, t]) => `<label class="chk"><input type="checkbox" data-k="${k}"${planCheck[k] ? " checked" : ""}><span>${t}</span></label>`).join("");
  const t = planTraj;
  $("pTraj").innerHTML = t ? `<p class="m">Berechnet für ${esc(new Date(t.start).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" }))} · ${dur(t.dauer * 60)} · ${esc(utmText(t.lat, t.lon))}</p><div class="tabelle"><table><thead><tr><th>Höhe</th><th>Richtung</th><th>Tempo</th><th>Entfernung</th></tr></thead><tbody>${t.rows.map(r => `<tr><td>${r.h} m</td><td>${r.richtung}°</td><td>${num(r.tempo, 1)} km/h</td><td>${num(r.dist, 2)} km</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="note">Noch nicht berechnet. Das Ergebnis wird zur Fahrt gespeichert.</p>';
}
function planSnapshot() {
  const g = (stamm.ausruestung || []).find(x => x.id === $("rBallon").value) || {}, a = planErg;
  return { erstellt: new Date().toISOString(), ballon: { ballon: g.ballon, ballontyp: g.ballontyp, volumen: g.volumen, leergewicht: g.leergewicht, maxtemp: g.maxtemp },
    flaschen: selFlaschen().map(x => ({ id: x.id, name: x.name, gas: zf(x.fuell), tara: zf(x.tara) })),
    zuladung: zul.filter(x => zf(x.a) * zf(x.k) > 0).map(x => ({ n: x.n, a: zf(x.a), k: zf(x.k) })),
    bedingungen: a?.bed || null, auftrieb: a ? { last: a.last, brutto: a.brutto, nutz: a.nutz, frei: a.frei, tN: a.tN, maxT: a.maxT, p: a.p } : null,
    check: { ...planCheck }, traj: planTraj };
}
function planStarten() {
  const offen = planPruefen().filter(x => !x.ok);
  if (offen.length && !confirm("Noch offen:\n• " + offen.map(x => `${x.text} (${x.detail})`).join("\n• ") + "\n\nTrotzdem starten?")) return;
  const g = (stamm.ausruestung || []).find(x => x.id === $("rBallon").value);
  if (g && g.ballon !== stamm.ballon) aktivSetzen(g);
  planFuerStart = { t: Date.now(), plan: planSnapshot() };
  zeige("fahrt");
  start();
}
function planTrajSpeichern(t) { planTraj = t; planSpeichern(); planAktualisieren(); }
function planHtml(p) {
  if (!p) return "";
  const z = (a, b) => `<div class="zeile"><span>${a}</span><b>${b}</b></div>`, a = p.auftrieb, b = p.ballon || {}, bd = p.bedingungen, k1 = v => num(zf(v), 1).replace(",0", "");
  return `<details class="plan"><summary>Planung ansehen</summary>` +
    z("Ballon", esc([b.ballon, b.ballontyp, b.volumen ? b.volumen + " m³" : ""].filter(Boolean).join(" · "))) +
    (p.flaschen || []).map(x => z("· " + esc(x.name), `${k1(x.gas)} kg Gas + ${k1(x.tara)} kg Flasche`)).join("") +
    (p.zuladung || []).map(x => z("· " + esc(x.n || "Position"), `${k1(zf(x.a) * zf(x.k))} kg`)).join("") +
    (a ? z("Zuladung gesamt", `${num(a.last)} kg`) + z("Bruttoauftrieb / frei", `${num(a.brutto)} / ${num(a.frei)} kg`) + z("Nötige Hüllentemperatur", a.tN == null ? "–" : `${num(a.tN)} °C`) : "") +
    (bd ? z("Bedingungen", `${k1(bd.T)} °C · ${num(bd.h)} m · QNH ${k1(bd.qnh)} hPa · Hülle ${num(bd.Ti)} °C`) : "") +
    (p.traj ? `<p class="m">Trajektoren für ${esc(new Date(p.traj.start).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" }))}, ${dur(p.traj.dauer * 60)}</p><div class="tabelle"><table><thead><tr><th>Höhe</th><th>Richtung</th><th>Tempo</th><th>Entfernung</th></tr></thead><tbody>${p.traj.rows.map(r => `<tr><td>${r.h} m</td><td>${r.richtung}°</td><td>${k1(r.tempo)} km/h</td><td>${num(r.dist, 2)} km</td></tr>`).join("")}</tbody></table></div>` : "") +
    (p.check && Object.values(p.check).some(Boolean) ? z("Checkliste", `${Object.values(p.check).filter(Boolean).length} von ${PLANMANUELL.length} abgehakt`) : "") + `</details>`;
}
$("gSel").addEventListener("change", e => {
  const id = e.target.dataset.id;
  if (!id) return;
  planSel = e.target.checked ? [...new Set([...planSel, id])] : planSel.filter(x => x !== id);
  rechnen();
});
$("pCheck").addEventListener("change", e => { const k = e.target.dataset.k; if (k) { planCheck[k] = e.target.checked; planSpeichern(); } });
$("gVerw").onclick = () => zeige("gas"); $("pTrajB").onclick = () => zeige("trajektoren"); $("pStart").onclick = planStarten;

// Zuladung: einzelne Positionen mit Anzahl und Gewicht je Stück
let zul = [];
const zulSumme = () => zul.reduce((s, x) => s + (parseFloat(x.a) || 0) * (parseFloat(x.k) || 0), 0);
function zulZeilen(z) {
  return zul.filter(x => (parseFloat(x.a) || 0) * (parseFloat(x.k) || 0) > 0).map(x => {
    const a = parseFloat(x.a) || 0, k = parseFloat(x.k) || 0;
    return z("· " + esc(x.n || "Position"), `${a !== 1 ? `${num(a)} × ${num(k, 1).replace(",0", "")} = ` : ""}${num(a * k)} kg`);
  }).join("");
}
function zRender() {
  $("zList").innerHTML = '<div class="zkopf"><span>Bezeichnung</span><span>Anz.</span><span>kg/Stk.</span><span>Summe</span><span></span></div>' + zul.map((x, i) =>
    `<div class="zrow" data-i="${i}"><input class="zn" value="${esc(x.n)}" aria-label="Bezeichnung" autocomplete="off"><input class="za" type="number" min="0" step="1" value="${esc(x.a)}" placeholder="Anz." aria-label="Anzahl" inputmode="numeric"><input class="zk" type="number" min="0" step="0.5" value="${esc(x.k)}" placeholder="kg" aria-label="Gewicht je Stück in kg" inputmode="decimal"><span class="zs">${num((parseFloat(x.a) || 0) * (parseFloat(x.k) || 0))} kg</span><button class="zx" aria-label="Position entfernen">✕</button></div>`).join("");
  $("zSumme").textContent = num(zulSumme()) + " kg";
}
$("zList").addEventListener("input", e => {
  const r = e.target.closest(".zrow");
  if (!r) return;
  const i = +r.dataset.i;
  zul[i] = { n: r.querySelector(".zn").value, a: r.querySelector(".za").value, k: r.querySelector(".zk").value };
  r.querySelector(".zs").textContent = num((parseFloat(zul[i].a) || 0) * (parseFloat(zul[i].k) || 0)) + " kg";
  $("zSumme").textContent = num(zulSumme()) + " kg";
  rechnen();
});
$("zList").addEventListener("click", e => { const b = e.target.closest(".zx"); if (b) { zul.splice(+b.closest(".zrow").dataset.i, 1); zRender(); rechnen(); } });
const zAdd = n => { zul.push({ n, a: 1, k: "" }); zRender(); rechnen(); };
$("zPass").onclick = () => zAdd("Passagier"); $("zGas").onclick = () => zAdd("Gepäck"); $("zFl").onclick = () => zAdd("Instrumente / Funk"); $("zNeu").onclick = () => zAdd("Sonstiges");
(() => {
  const g = load("auftrieb", {});
  ["rT", "rH", "rQ", "rI"].forEach(id => { if (g[id] !== undefined) $(id).value = g[id]; $(id).oninput = rechnen; });
  zul = (Array.isArray(g.zul) ? g.zul : [{ n: "Pilot", a: 1, k: "" }, { n: "Passagier", a: 1, k: "" }]).filter(x => !x.fl && !/^Gasflasche/i.test(x.n || "")); // Gas kommt jetzt aus der Flaschenwahl
  planSel = Array.isArray(g.sel) ? g.sel : []; planCheck = g.check || {}; planTraj = load("planTraj", null);
  zRender();
})();

function cloudUebernehmen(d) {
  if (d.fluege) { fluege = d.fluege; localStorage.setItem("fluege", JSON.stringify(fluege)); }
  if (d.stamm) {
    stamm = d.stamm; localStorage.setItem("stammdaten", JSON.stringify(stamm));
    ["pilot", "ballon", "ballontyp", "maintenance", "volumen", "leergewicht", "maxtemp"].forEach(k => { $(k).value = stamm[k] || ""; });
    profilRender();
  }
  if (d.mon) {
    mon = { zeitraumMonate: 24, erforderlicheStunden: 6, erforderlicheLandungen: 10, ...d.mon }; localStorage.setItem("monitorEinstellungen", JSON.stringify(mon));
    $("mZ").value = mon.zeitraumMonate; $("mS").value = mon.erforderlicheStunden; $("mL").value = mon.erforderlicheLandungen;
  }
  if (d.theme) { localStorage.setItem("theme", JSON.stringify(d.theme)); theme(d.theme, false); }
  render(); ui();
}

// ---------- Start ----------
document.querySelectorAll("nav button").forEach(b => b.onclick = () => zeige(b.dataset.s));
function menue(auf) { // Seitenmenü öffnen/schließen
  $("menue").classList.toggle("offen", auf); $("schleier").classList.toggle("offen", auf);
  $("menuB").setAttribute("aria-expanded", String(auf)); $("menuB").textContent = auf ? "✕" : "☰";
}
$("menuB").onclick = () => menue(!$("menue").classList.contains("offen"));
$("schleier").onclick = () => menue(false);
document.addEventListener("keydown", e => { if (e.key === "Escape") menue(false); });
$("startB").onclick = start;
$("stopB").onclick = () => { gasFlFuellen(); $("endDlg").returnValue = ""; $("endDlg").showModal(); };
$("endDlg").addEventListener("close", () => { if ($("endDlg").returnValue === "ok") ende(); });
$("mB").onclick = () => {
  if (!aktiv || !pos) return status("Markierungen sind nur während der Aufzeichnung möglich.");
  (aktiv.f.marken ??= []).push({ lat: pos.lat, lng: pos.lng, hoehe: pos.hoehe, zeit: new Date().toISOString() });
  fahrtSichern(); liveKarte(); status(`Markierung ${aktiv.f.marken.length} gesetzt`);
};
$("zB").onclick = () => { folgeBis = 0; if (pos && karte) karte.setView([pos.lat, pos.lng], Math.max(karte.getZoom(), 15)); liveKarte(); };
$("tB").onclick = () => {
  const b = (aktiv?.t || []).map(p => [p.lat, p.lng]);
  folgeBis = Date.now() + 10000;
  if (karte && b.length > 1) karte.fitBounds(b, { padding: [30, 30], maxZoom: 16 });
};
$("sB").onclick = () => { if (!karte) return; const i = Math.max(0, stile.findIndex(l => karte.hasLayer(l))); karte.removeLayer(stile[i]); stilNr = (i + 1) % stile.length; stile[stilNr].addTo(karte); };
window.addEventListener("online", orteNachladen);
window.addEventListener("hashchange", () => zeige(location.hash.slice(1)));
window.addEventListener("resize", () => { karte?.invalidateSize(); hoehe(); });
setInterval(() => { $("uhr").textContent = new Date().toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }); $("fuhr").textContent = new Date().toLocaleTimeString("de-AT"); if (aktiv && !$("fahrt").hidden) liveAnzeige(); }, 1000);

// Design: hell/dunkel umschaltbar, Auswahl wird gemerkt (Start: Systemeinstellung)
function theme(t, merken) {
  document.documentElement.dataset.theme = t;
  $("themeB").textContent = t === "dunkel" ? "☀" : "☾";
  $("themeB").setAttribute("aria-label", t === "dunkel" ? "Zum hellen Design wechseln" : "Zum dunklen Design wechseln");
  document.querySelector('meta[name="theme-color"]').content = t === "dunkel" ? "#1A1411" : "#FFF8EF";
  if (merken) save("theme", t);
  hoehe();
}
$("themeB").onclick = () => theme(document.documentElement.dataset.theme === "dunkel" ? "hell" : "dunkel", true);
theme(document.documentElement.dataset.theme || "hell", false);
profilRender(); render(); ui();
zeige(location.hash.slice(1));
// Neue Version: der Service Worker übernimmt sofort, die Seite läuft aber noch mit dem alten Stand -> Hinweis zum Neuladen
if ("serviceWorker" in navigator) {
  const hatteSw = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").then(r => document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") r.update().catch(() => {}); })).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hatteSw) $("update").hidden = false; });
}
$("updateB").onclick = () => location.reload();
window.appVersion = "–";
if ("caches" in window) caches.keys().then(k => { window.appVersion = k.filter(x => x.startsWith("bfb-")).sort().at(-1) || "–"; $("version").textContent = window.appVersion; }).catch(() => {});

// Erste Schritte für neue Nutzer (pro Gerät einmal, über Einstellungen wieder aufrufbar)
let installEvent = null;
const installiert = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function willkommen(zeigen) {
  $("willkommen").hidden = !zeigen;
  $("wInstall").hidden = installiert();
  $("wInstallT").textContent = /iPhone|iPad|iPod/.test(navigator.userAgent) ? "In Safari unten auf Teilen (□↑) tippen, dann „Zum Home-Bildschirm“." : "Im Browser-Menü (⋮) „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.";
  $("wInstallB").hidden = !installEvent;
}
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvent = e; $("wInstallB").hidden = false; });
$("wInstallB").onclick = async () => { if (!installEvent) return; installEvent.prompt(); await installEvent.userChoice.catch(() => {}); installEvent = null; willkommen(!$("willkommen").hidden); };
$("willkommen").addEventListener("click", e => {
  const z = e.target.closest("[data-z]")?.dataset.z;
  if (z) { zeige("einstellungen"); if (z === "konto") $("kontoK").scrollIntoView(); }
});
$("wOk").onclick = () => { localStorage.setItem("willkommen", "1"); willkommen(false); };
$("wZeigen").onclick = () => { zeige("dashboard"); willkommen(true); };
willkommen(!localStorage.getItem("willkommen") && !stamm.pilot && !fluege.length); // nur bei neuen Nutzern

// Alle Daten auf diesem Gerät löschen (Cloud-Daten bleiben erhalten)
async function lokalLoeschen() {
  await tracksLeeren();
  Object.keys(localStorage).filter(k => k !== "theme").forEach(k => localStorage.removeItem(k));
  location.replace(location.pathname); // neu starten, auf der Übersicht mit den ersten Schritten
}
$("lokalDel").onclick = () => {
  if (aktiv) return alert("Bitte zuerst die laufende Fahrt beenden.");
  if (confirm("Alle Fahrten, Ausrüstung und Einstellungen auf diesem Gerät löschen?\nMit Konto bleiben die Daten in der Cloud erhalten und kommen nach dem Anmelden zurück. Ohne Konto sind sie endgültig weg.")) lokalLoeschen();
};
orteNachladen();
tracksUmziehen();
navigator.storage?.persist?.().catch(() => {}); // Browser bitten, die Daten nicht automatisch zu löschen
if (aktiv) {
  if (confirm("Eine unterbrochene Fahrt wurde gefunden. Fortsetzen?\n(Abbrechen = Fahrt jetzt beenden und speichern)")) { zeige("fahrt"); aufnehmen(); }
  else ende();
}
