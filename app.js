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
let watch = null, wake = null, karte = null, ebene = null, liveL = null, pos = null, lastSave = 0, bearbeite = null;
fluege.forEach(f => { f.id ??= nid(); });

const SEITEN = ["dashboard", "fahrt", "flugbuch", "karte", "wetter", "einstellungen"];
function zeige(id) {
  id = id === "fahrt-erfassen" ? "fahrt" : id;
  if (!SEITEN.includes(id)) id = "dashboard";
  document.querySelectorAll(".seite").forEach(s => s.hidden = s.id !== id);
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.s === id));
  history.replaceState(null, "", "#" + id);
  scrollTo(0, 0);
  if (id === "karte") kartePrep();
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

function punkt(p) {
  if (!aktiv) return;
  const c = p.coords;
  pos = { lat: c.latitude, lng: c.longitude, hoehe: c.altitude, speed: c.speed == null ? null : Math.max(0, c.speed), genauigkeit: c.accuracy };
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
  $("stopB").disabled = !aktiv;
  $("hinweis").hidden = ok;
  status(aktiv ? "● Fahrt läuft" : "Keine Fahrt aktiv");
  liveAnzeige();
}

function liveAnzeige() {
  const t = aktiv?.t || [];
  let d = 0;
  for (let i = 1; i < t.length; i++) d += km(t[i - 1], t[i]);
  const min = aktiv ? (Date.now() - new Date(aktiv.f.startzeit)) / 6e4 : 0;
  const v = (a, b) => `<div class="kpi"><small>${a}</small><b>${b}</b></div>`;
  $("live").innerHTML = v("Zeit", dur(min)) + v("Strecke", num(d, 1) + " km") +
    v("Höhe", Number.isFinite(pos?.hoehe) ? Math.round(pos.hoehe) + " m" : "–") +
    v("Tempo", pos?.speed != null ? num(pos.speed * 3.6) + " km/h" : "–") +
    v("Genauigkeit", pos ? "±" + Math.round(pos.genauigkeit) + " m" : "–");
  if (pos) $("posInfo").textContent = `${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)} · Höhe ${Number.isFinite(pos.hoehe) ? Math.round(pos.hoehe) + " m" : "–"} · ±${Math.round(pos.genauigkeit)} m`;
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
    $("dlg").showModal();
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
    karte = L.map("map").setView([47.28, 15.97], 8);
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }),
      sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 18, attribution: "Esri" });
    osm.addTo(karte);
    L.control.layers({ Karte: osm, Satellit: sat }).addTo(karte);
    ebene = L.layerGroup().addTo(karte); liveL = L.layerGroup().addTo(karte);
  }
  setTimeout(() => { karte.invalidateSize(); zeichne(fluege); liveKarte(); }, 50);
}
function zeichne(l) {
  if (!karte) return;
  ebene.clearLayers();
  const b = [];
  l.forEach(f => {
    const t = (f.track || []).map(p => [p.lat, p.lng]);
    if (t.length > 1) { L.polyline(t, { color: "#4cc9f0", weight: 3 }).addTo(ebene); b.push(...t); }
    if (Number.isFinite(f.startLat)) { L.circleMarker([f.startLat, f.startLng], { radius: 7, color: "#3ddc97" }).addTo(ebene).bindPopup("Start: " + esc(f.startOrt || "")); b.push([f.startLat, f.startLng]); }
    if (Number.isFinite(f.landeLat)) L.circleMarker([f.landeLat, f.landeLng], { radius: 7, color: "#ff6b6b" }).addTo(ebene).bindPopup("Landung: " + esc(f.landeOrt || ""));
  });
  if (b.length) karte.fitBounds(b, { padding: [30, 30], maxZoom: 14 });
}
function liveKarte() {
  if (!karte || $("karte").hidden && $("fahrt").hidden) return;
  liveL.clearLayers();
  if (aktiv?.t.length > 1) L.polyline(aktiv.t.map(p => [p.lat, p.lng]), { color: "#ffb703", weight: 4 }).addTo(liveL);
  if (pos) L.circleMarker([pos.lat, pos.lng], { radius: 8, color: "#fff", fillColor: "#ffb703", fillOpacity: 1 }).addTo(liveL);
}
$("allB").onclick = () => zeichne(fluege);
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
$("stopB").onclick = () => { if (confirm("Fahrt jetzt beenden und speichern?")) ende(); };
window.addEventListener("online", orteNachladen);
window.addEventListener("hashchange", () => zeige(location.hash.slice(1)));
window.addEventListener("resize", () => { karte?.invalidateSize(); hoehe(); });
setInterval(() => { $("uhr").textContent = new Date().toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }); if (aktiv && !$("fahrt").hidden) liveAnzeige(); }, 1000);

render(); ui();
zeige(location.hash.slice(1));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
orteNachladen();
if (aktiv) {
  if (confirm("Eine unterbrochene Fahrt wurde gefunden. Fortsetzen?\n(Abbrechen = Fahrt jetzt beenden und speichern)")) { zeige("fahrt"); aufnehmen(); }
  else ende();
}
