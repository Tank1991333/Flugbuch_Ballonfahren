"use strict";
const $ = id => document.getElementById(id);
const load = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? f; } catch { return f; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { alert("Speichern fehlgeschlagen (Speicher voll?). Bitte Backup erstellen."); return false; } };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v, d = 0) => Number.isFinite(v) ? v.toLocaleString("de-AT", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–";
const dur = m => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, "0")}m`;
const datum = iso => new Date(iso).toLocaleString("de-AT", { dateStyle: "medium", timeStyle: "short" });
const nid = () => crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random();
const km = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };

// Datenschlüssel bleiben kompatibel zur alten Version
let fluege = load("fluege", []);
let stamm = load("stammdaten", {});
let mon = { zeitraumMonate: 24, erforderlicheStunden: 6, erforderlicheLandungen: 10, ...load("monitorEinstellungen", {}) };
let aktiv = load("aktiveFahrt", null); // {f: Fahrt, t: Trackpunkte} – überlebt Neuladen/Absturz
let stile = [], stilNr = 0, zentriert = false, standbyId = null, folgeBis = 0, watch = null, wake = null, karte = null, ebene = null, liveL = null, pos = null, lastSave = 0, bearbeite = null;
fluege.forEach(f => { f.id ??= nid(); });

const SEITEN = ["dashboard", "fahrt", "flugbuch", "karte", "wetter", "einstellungen"];
function zeige(id) {
  id = id === "fahrt-erfassen" ? "fahrt" : id;
  if (!SEITEN.includes(id)) id = "dashboard";
  document.querySelectorAll(".seite").forEach(s => s.hidden = s.id !== id);
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.s === id));
  history.replaceState(null, "", "#" + id);
  scrollTo(0, 0);
  if (id === "karte" || id === "fahrt") { $(id === "fahrt" ? "fbox" : "kbox").prepend($("map")); kartePrep(); }
  if (id === "fahrt") standbyStart(); else standbyStop();
  if (id === "wetter") wetter();
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
  if (c.accuracy <= 100) {
    const q = { ...pos, zeit: new Date(p.timestamp).toISOString() }, l = aktiv.t.at(-1);
    if (!l || km(l, q) >= 0.003) aktiv.t.push(q);
  }
  if (Date.now() - lastSave > 4000) { lastSave = Date.now(); save("aktiveFahrt", aktiv); }
  liveAnzeige();
}

function start() {
  if (aktiv) return;
  if (!navigator.geolocation) return alert("GPS wird von diesem Browser nicht unterstützt.");
  if (!stamm.pilot || !stamm.ballon) { zeige("einstellungen"); return alert("Bitte zuerst Pilot und Ballon-Kennzeichen eintragen."); }
  status("Startposition wird ermittelt …");
  navigator.geolocation.getCurrentPosition(p => {
    const now = new Date().toISOString();
    aktiv = { f: { id: nid(), datum: now, startzeit: now, pilot: stamm.pilot, ballon: stamm.ballon, ballontyp: stamm.ballontyp || "", startLat: p.coords.latitude, startLng: p.coords.longitude, startOrt: null }, t: [] };
    lastSave = 0;
    aufnehmen();
    punkt(p);
    save("aktiveFahrt", aktiv);
    orteNachladen(); // im Hintergrund, blockiert den Start nicht
  }, e => { status("❌ " + fehler(e)); ui(); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
}

function aufnehmen() {
  watch = navigator.geolocation.watchPosition(punkt, () => status("● Fahrt läuft – GPS vorübergehend gestört"), { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  standbyStop();
  wakeLock();
  ui();
}

function ende() {
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
  f.track = t;
  f.maxHoehe = h.length ? Math.round(Math.max(...h)) : 0;
  f.minHoehe = h.length ? Math.round(Math.min(...h)) : 0;
  f.avgHoehe = h.length ? Math.round(h.reduce((a, b) => a + b, 0) / h.length) : 0;
  f.maxSpeed = s.length ? +(Math.max(...s) * 3.6).toFixed(1) : 0;
  f.avgSpeed = +(d / (f.flugzeit / 60)).toFixed(1);
  f.landungen = Math.max(1, parseInt($("landungen").value, 10) || 1);
  f.bemerkung = $("bemerkung").value.trim();
  fluege.push(f);
  if (!save("fluege", fluege)) { fluege.pop(); aufnehmen(); return; } // Fahrt bleibt erhalten
  localStorage.removeItem("aktiveFahrt");
  aktiv = null;
  wakeEnde();
  $("bemerkung").value = ""; $("landungen").value = 1;
  ui(); render(); orteNachladen();
  zeige("flugbuch");
}

async function wakeLock() {
  try { if (aktiv && !wake && "wakeLock" in navigator) { wake = await navigator.wakeLock.request("screen"); wake.onrelease = () => { wake = null; }; } } catch { wake = null; }
}
const wakeEnde = () => { wake?.release().catch(() => {}); wake = null; };
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wakeLock(); });

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
  liveAnzeige();
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
  set("kH", Number.isFinite(pos?.hoehe) ? Math.round(pos.hoehe) : "0"); set("kHs", `MAX ${Math.round(hmax)} m`);
  set("kR", Number.isFinite(pos?.kurs) ? Math.round(pos.kurs) + "°" : "–"); set("kRu", Number.isFinite(pos?.kurs) ? RICHT[Math.round(pos.kurs / 45) % 8] : "–");
  set("kA", pos ? "±" + Math.round(pos.genauigkeit) : "±0");
  set("sDauer", `${p2(Math.floor(sek / 3600))}:${p2(Math.floor(sek / 60) % 60)}:${p2(sek % 60)}`);
  set("sStrecke", num(d, 2) + " km"); set("sSteig", num(Math.max(0, vs), 1) + " m/s"); set("sSink", num(Math.max(0, -vs), 1) + " m/s");
  set("sMaxH", Math.round(hmax) + " m"); set("sMaxV", num(vmax) + " km/h");
  const info = pos ? `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} · GPS ±${Math.round(pos.genauigkeit)} m` : "Standort wird ermittelt …";
  set("chip", info); set("posInfo", info);
  set("gpsB", pos ? "GPS AKTIV" : "GPS SUCHT …"); $("gpsB").classList.toggle("on", !!pos);
  if (!$("fahrt").hidden) hoehe();
  liveKarte();
}

function hoehe() {
  const c = $("hoehe"), w = c.clientWidth, h = c.clientHeight, r = devicePixelRatio || 1;
  if (!w) return;
  c.width = w * r; c.height = h * r;
  const x = c.getContext("2d");
  x.scale(r, r); x.font = "11px sans-serif"; x.fillStyle = "#8fa3b8"; x.strokeStyle = "#4cc9f0"; x.lineWidth = 2;
  const v = (aktiv?.t || []).map(p => p.hoehe).filter(Number.isFinite);
  if (v.length < 2) { x.fillText("Noch keine Höhendaten", 10, 20); return; }
  const mn = Math.min(...v), mx = Math.max(...v), sp = Math.max(mx - mn, 10);
  x.beginPath();
  v.forEach((a, i) => { const px = 10 + i / (v.length - 1) * (w - 20), py = h - 18 - (a - mn) / sp * (h - 36); i ? x.lineTo(px, py) : x.moveTo(px, py); });
  x.stroke();
  x.fillText(Math.round(mx) + " m", 10, 12); x.fillText(Math.round(mn) + " m", 10, h - 4);
}

function render() {
  const sum = fluege.reduce((a, f) => ({ m: a.m + (f.flugzeit || 0), k: a.k + (f.strecke || 0), l: a.l + (f.landungen || 0) }), { m: 0, k: 0, l: 0 });
  const kp = (a, b) => `<div class="kpi"><small>${a}</small><b>${b}</b></div>`;
  $("kpis").innerHTML = kp("Fahrten", fluege.length) + kp("Landungen", sum.l) + kp("Flugzeit", dur(sum.m)) + kp("Kilometer", num(sum.k, 1));

  const grenze = new Date(); grenze.setMonth(grenze.getMonth() - mon.zeitraumMonate);
  const im = fluege.filter(f => new Date(f.startzeit) >= grenze);
  const mi = im.reduce((a, f) => a + (f.flugzeit || 0), 0) / 60, li = im.reduce((a, f) => a + (f.landungen || 0), 0);
  const bar = (t, i, s) => { const p = s > 0 ? Math.min(100, i / s * 100) : 100; return `<div class="bar"><span>${t}: ${num(i, 1).replace(",0", "")} / ${s}</span><i><u style="width:${p}%" class="${p >= 100 ? "ok" : ""}"></u></i></div>`; };
  $("monitor").innerHTML = `<h2>Aktivitätsmonitor · ${mon.zeitraumMonate} Monate</h2>` + bar("Flugstunden", mi, mon.erforderlicheStunden) + bar("Landungen", li, mon.erforderlicheLandungen) +
    `<p class="note">Nächste Wartung: ${stamm.maintenance ? esc(new Date(stamm.maintenance).toLocaleDateString("de-AT")) : "nicht festgelegt"}</p>`;

  const top = k => fluege.reduce((m, f) => Math.max(m, f[k] || 0), 0);
  $("rekorde").innerHTML = "<h2>Rekorde</h2>" + [["Max. Höhe", top("maxHoehe") + " m"], ["Längste Fahrt", dur(top("flugzeit"))], ["Weiteste Strecke", num(top("strecke"), 1) + " km"], ["Max. Tempo", num(top("maxSpeed"), 1) + " km/h"]].map(([a, b]) => `<p><span>${a}</span><b>${b}</b></p>`).join("");

  $("liste").innerHTML = fluege.length
    ? [...fluege].sort((a, b) => new Date(b.startzeit) - new Date(a.startzeit)).map(f => `<article class="card"><h3>${esc(datum(f.startzeit))}</h3>
      <p>${esc(f.startOrt || "Ort wird ermittelt …")} → ${esc(f.landeOrt || "…")}</p>
      <p class="m">${dur(f.flugzeit || 0)} · ${num(f.strecke, 1)} km · max. ${f.maxHoehe || 0} m · ${f.landungen || 1} Landung(en) · ${esc(f.ballon)}</p>
      ${f.bemerkung ? `<p>${esc(f.bemerkung)}</p>` : ""}
      <div class="row"><button data-a="karte" data-id="${esc(f.id)}">Karte</button><button data-a="edit" data-id="${esc(f.id)}">Bearbeiten</button><button data-a="del" data-id="${esc(f.id)}" class="gef">Löschen</button></div></article>`).join("")
    : '<p class="leer">Noch keine Fahrten gespeichert.</p>';
}

$("liste").onclick = e => {
  const b = e.target.closest("button"), f = b && fluege.find(x => x.id === b.dataset.id);
  if (!f) return;
  if (b.dataset.a === "del") {
    if (confirm("Diese Fahrt wirklich löschen?")) { fluege = fluege.filter(x => x !== f); save("fluege", fluege); render(); }
  } else if (b.dataset.a === "edit") {
    bearbeite = f;
    $("ePilot").value = f.pilot || ""; $("eBallon").value = f.ballon || ""; $("eStart").value = f.startOrt || ""; $("eLande").value = f.landeOrt || "";
    $("eLand").value = f.landungen || 1; $("eBem").value = f.bemerkung || "";
    $("dlg").returnValue = ""; $("dlg").showModal();
  } else { zeige("karte"); setTimeout(() => zeichne([f]), 120); }
};
$("dlg").addEventListener("close", () => {
  if ($("dlg").returnValue === "ok" && bearbeite) {
    Object.assign(bearbeite, { pilot: $("ePilot").value.trim(), ballon: $("eBallon").value.trim().toUpperCase(), startOrt: $("eStart").value.trim(), landeOrt: $("eLande").value.trim(), landungen: Math.max(1, parseInt($("eLand").value, 10) || 1), bemerkung: $("eBem").value.trim() });
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
    hybrid.addTo(karte); stile = [hybrid, standard];
    L.control.layers({ Hybrid: hybrid, Standard: standard }, null, { position: "topright" }).addTo(karte);
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
    if (!$("karte").hidden && !aktiv) zeichne(fluege); else folgeBis = 0;
    liveKarte();
  }, 50);
}
const pin = c => L.divIcon({ className: "", html: `<i class="pin ${c}"></i>`, iconSize: [20, 20], iconAnchor: [10, 10] });
const linie = (t, farbe, g) => {
  L.polyline(t, { color: "#000", weight: 8, opacity: .35, lineCap: "round", lineJoin: "round" }).addTo(g);
  L.polyline(t, { color: farbe, weight: 4, lineCap: "round", lineJoin: "round" }).addTo(g);
};
function zeichne(l) {
  if (!karte) return;
  ebene.clearLayers();
  const b = [];
  l.forEach(f => {
    const t = (f.track || []).map(p => [p.lat, p.lng]);
    if (t.length > 1) { linie(t, "#4cc9f0", ebene); b.push(...t); }
    if (Number.isFinite(f.startLat)) { L.marker([f.startLat, f.startLng], { icon: pin("start") }).addTo(ebene).bindPopup("<b>Start</b><br>" + esc(f.startOrt || "–")); b.push([f.startLat, f.startLng]); }
    if (Number.isFinite(f.landeLat)) L.marker([f.landeLat, f.landeLng], { icon: pin("landung") }).addTo(ebene).bindPopup("<b>Landung</b><br>" + esc(f.landeOrt || "–"));
    (f.marken || []).forEach(m => L.marker([m.lat, m.lng], { icon: pin("marke") }).addTo(ebene).bindPopup("<b>Markierung</b><br>" + esc(datum(m.zeit))));
  });
  if (b.length) karte.fitBounds(b, { padding: [30, 30], maxZoom: 14 });
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
  $("folgeB").textContent = !aktiv ? "◎ Folgen" : Date.now() >= folgeBis ? "◎ Folgt dir …" : "◎ Zurück zu mir";
}
$("allB").onclick = () => { folgeBis = Date.now() + 10000; zeichne(fluege); };
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
["pilot", "ballon", "ballontyp", "maintenance"].forEach(k => {
  const el = $(k); el.value = stamm[k] || "";
  el.onchange = () => { stamm[k] = k === "ballon" ? el.value.trim().toUpperCase() : el.value.trim(); el.value = stamm[k]; save("stammdaten", stamm); ui(); render(); };
});
Object.entries({ mZ: "zeitraumMonate", mS: "erforderlicheStunden", mL: "erforderlicheLandungen" }).forEach(([id, k]) => {
  $(id).value = mon[k];
  $(id).onchange = () => { const v = parseFloat($(id).value); if (v >= 0) mon[k] = v; $(id).value = mon[k]; save("monitorEinstellungen", mon); render(); };
});
$("expB").onclick = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ version: 2, fluege, stammdaten: stamm, monitor: mon }, null, 1)], { type: "application/json" }));
  a.download = `ballonflugbuch-${new Date().toISOString().slice(0, 10)}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};
$("imp").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const d = JSON.parse(await file.text()), l = Array.isArray(d) ? d : d.fluege;
    if (!Array.isArray(l)) throw 0;
    const key = x => [x.startzeit, x.ballon, x.pilot].join("|").toLowerCase(), have = new Set(fluege.map(key));
    let n = 0;
    for (const x of l) if (x?.startzeit && !have.has(key(x))) { x.id ??= nid(); fluege.push(x); have.add(key(x)); n++; }
    save("fluege", fluege); render();
    alert(`${n} neue Fahrt(en) importiert, ${l.length - n} Duplikat(e) übersprungen.`);
  } catch { alert("Die Datei ist kein gültiges JSON-Backup."); }
  e.target.value = "";
};

// ---------- Start ----------
document.querySelectorAll("nav button").forEach(b => b.onclick = () => zeige(b.dataset.s));
$("startB").onclick = start;
$("stopB").onclick = () => { $("endDlg").returnValue = ""; $("endDlg").showModal(); };
$("endDlg").addEventListener("close", () => { if ($("endDlg").returnValue === "ok") ende(); });
$("mB").onclick = () => {
  if (!aktiv || !pos) return status("Markierungen sind nur während der Aufzeichnung möglich.");
  (aktiv.f.marken ??= []).push({ lat: pos.lat, lng: pos.lng, hoehe: pos.hoehe, zeit: new Date().toISOString() });
  save("aktiveFahrt", aktiv); liveKarte(); status(`Markierung ${aktiv.f.marken.length} gesetzt`);
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

render(); ui();
zeige(location.hash.slice(1));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
orteNachladen();
if (aktiv) {
  if (confirm("Eine unterbrochene Fahrt wurde gefunden. Fortsetzen?\n(Abbrechen = Fahrt jetzt beenden und speichern)")) { zeige("fahrt"); aufnehmen(); }
  else ende();
}
