"use strict";

const FLIGHT_STORAGE_KEY = "fluege";
const MASTER_DATA_KEY = "stammdaten";
const MONITOR_STORAGE_KEY = "monitorEinstellungen";
const FLIGHT_SYNC_CHANNEL = "flugbuch-ballonfahren-sync";
const DEFAULT_CENTER = [47.28, 15.97];
const DEFAULT_ZOOM = 8;
const PAGE_IDS = ["dashboard", "fahrt-erfassen", "flugbuch", "karte", "statistiken", "wetter", "einstellungen"];
const MONITOR_DEFAULTS = Object.freeze({ zeitraumMonate: 24, erforderlicheStunden: 6, erforderlicheLandungen: 10 });

let fluegeSyncChannel = null;
let fluege = [];
let aktuellerFlug = null;
let trackpunkte = [];
let watchId = null;
let trackingMap = null;
let trackingLine = null;
let trackingMarker = null;
let routenKarte = null;
let routenLayer = null;
let timerId = null;
let diagramme = {};
let letztePosition = null;

const $ = (id) => document.getElementById(id);
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const text = (value, fallback = "") => value == null ? fallback : String(value);
const escapeHtml = (value) => text(value).replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]);

function ladeJson(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        return value === null ? fallback : JSON.parse(value);
    } catch (error) {
        console.error(`Daten für "${key}" konnten nicht geladen werden.`, error);
        return fallback;
    }
}

function speichereJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`Daten für "${key}" konnten nicht gespeichert werden.`, error);
        meldung("Speichern im Browser ist fehlgeschlagen.", "error");
        return false;
    }
}

function sichereDezimalzahl(value, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
    const normalized = typeof value === "string" ? value.replace(",", ".") : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function fluegeLaden() {
    const saved = ladeJson(FLIGHT_STORAGE_KEY, []);
    return Array.isArray(saved) ? saved.map(normalisiereFlug).filter(Boolean) : [];
}

function normalisiereFlug(flug) {
    if (!flug || typeof flug !== "object") return null;
    const track = Array.isArray(flug.trackpunkte) ? flug.trackpunkte.map(p => ({
        lat: num(p.lat ?? p.latitude), lng: num(p.lng ?? p.longitude), hoehe: num(p.hoehe ?? p.altitude),
        geschwindigkeit: num(p.geschwindigkeit ?? p.speed), genauigkeit: num(p.genauigkeit ?? p.accuracy),
        zeit: p.zeit || p.timestamp || new Date().toISOString()
    })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)) : [];
    return {
        id: text(flug.id, crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
        datum: flug.datum || flug.startzeit || new Date().toISOString(),
        startzeit: flug.startzeit || flug.datum || new Date().toISOString(),
        endzeit: flug.endzeit || flug.startzeit || flug.datum || new Date().toISOString(),
        dauerMinuten: Math.max(0, num(flug.dauerMinuten ?? flug.dauer)),
        streckeKm: Math.max(0, num(flug.streckeKm ?? flug.strecke)),
        landungen: Math.max(1, Math.round(num(flug.landungen, 1))),
        bemerkung: text(flug.bemerkung), pilot: text(flug.pilot), ballon: text(flug.ballon), ballontyp: text(flug.ballontyp),
        startort: text(flug.startort), landeort: text(flug.landeort),
        maxHoehe: Math.max(0, num(flug.maxHoehe)), maxGeschwindigkeit: Math.max(0, num(flug.maxGeschwindigkeit)),
        durchschnittGeschwindigkeit: Math.max(0, num(flug.durchschnittGeschwindigkeit)), trackpunkte: track
    };
}

function fluegeSpeichern() {
    if (speichereJson(FLIGHT_STORAGE_KEY, fluege)) {
        fluegeSyncChannel?.postMessage({ typ: "fluege-aktualisiert", zeit: Date.now() });
        aktualisiereAlleAnsichten();
    }
}

function formatDatum(value, mitZeit = false) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "–";
    return new Intl.DateTimeFormat("de-AT", mitZeit ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(d);
}

function formatDauer(minuten) {
    const total = Math.max(0, Math.round(num(minuten)));
    return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, "0")}m`;
}

function formatZahl(value, stellen = 1) {
    return num(value).toLocaleString("de-AT", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

function distanzKm(a, b) {
    const r = 6371;
    const rad = d => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(x));
}

function trackDistanz(punkte) {
    return punkte.slice(1).reduce((sum, p, i) => sum + distanzKm(punkte[i], p), 0);
}

function meldung(nachricht, typ = "working") {
    const el = $("status");
    if (!el) return;
    el.textContent = nachricht;
    el.className = `status-message compact status-${typ}`;
}

function setzeSeite(pageId) {
    const id = PAGE_IDS.includes(pageId) ? pageId : "dashboard";
    PAGE_IDS.forEach(page => {
        const section = $(page);
        if (!section) return;
        const aktiv = page === id;
        section.hidden = !aktiv;
        section.classList.toggle("active", aktiv);
    });
    document.querySelectorAll("[data-page-link]").forEach(button => button.classList.toggle("active", button.dataset.pageLink === id));
    const meta = {
        dashboard: ["Ballonflugbuch", "Deine Fahrten und Flugdaten auf einen Blick."],
        "fahrt-erfassen": ["Fahrt erfassen", "GPS-Aufzeichnung und Live-Karte."],
        flugbuch: ["Flugbuch", "Alle gespeicherten Fahrten."], karte: ["Karte", "Gespeicherte Flugstrecken."],
        statistiken: ["Statistiken", "Auswertung deiner Fahrten."], wetter: ["Wetter", "Aktuelle Bedingungen am Standort."],
        einstellungen: ["Einstellungen", "Persönliche Daten und Wartung."]
    }[id];
    if ($("pageTitle")) $("pageTitle").textContent = meta[0];
    if ($("pageDescription")) $("pageDescription").textContent = meta[1];
    schliesseMenue();
    requestAnimationFrame(() => {
        if (id === "fahrt-erfassen") { initialisiereTrackingKarte(); trackingMap?.invalidateSize(); }
        if (id === "karte") { initialisiereRoutenKarte(); routenKarte?.invalidateSize(); zeichneRouten(); }
        if (id === "statistiken") aktualisiereStatistiken();
        if (id === "wetter") ladeWetter();
    });
}

function oeffneMenue() {
    $("sidebar")?.classList.add("sidebar-open");
    $("menuButton")?.setAttribute("aria-expanded", "true");
    let backdrop = document.querySelector(".mobile-menu-backdrop");
    if (!backdrop) {
        backdrop = document.createElement("div"); backdrop.className = "mobile-menu-backdrop";
        backdrop.addEventListener("click", schliesseMenue); document.body.appendChild(backdrop);
    }
    requestAnimationFrame(() => backdrop.classList.add("visible"));
}

function schliesseMenue() {
    $("sidebar")?.classList.remove("sidebar-open");
    $("menuButton")?.setAttribute("aria-expanded", "false");
    const backdrop = document.querySelector(".mobile-menu-backdrop");
    if (backdrop) { backdrop.classList.remove("visible"); setTimeout(() => backdrop.remove(), 220); }
}

function initialisiereTrackingKarte() {
    if (trackingMap || !$("trackingMap") || typeof L === "undefined") return;
    trackingMap = L.map("trackingMap").setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(trackingMap);
    trackingLine = L.polyline([], { color: "#e8503e", weight: 4 }).addTo(trackingMap);
}

function initialisiereRoutenKarte() {
    if (routenKarte || !$("routenKarte") || typeof L === "undefined") return;
    routenKarte = L.map("routenKarte").setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    const standard = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" });
    const satellit = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Esri" });
    standard.addTo(routenKarte); L.control.layers({ Standard: standard, Satellit: satellit }).addTo(routenKarte);
    routenLayer = L.featureGroup().addTo(routenKarte);
}

function zeichneRouten() {
    if (!routenLayer) return;
    routenLayer.clearLayers();
    fluege.forEach((flug, index) => {
        const coords = flug.trackpunkte.map(p => [p.lat, p.lng]);
        if (!coords.length) return;
        const hue = (index * 67) % 360;
        const line = L.polyline(coords, { color: `hsl(${hue} 75% 55%)`, weight: 3 }).bindPopup(`<strong>${escapeHtml(formatDatum(flug.startzeit))}</strong><br>${formatZahl(flug.streckeKm)} km`);
        routenLayer.addLayer(line);
        routenLayer.addLayer(L.circleMarker(coords[0], { radius: 5, color: "#52cc76" }));
        routenLayer.addLayer(L.circleMarker(coords.at(-1), { radius: 5, color: "#e8503e" }));
    });
    if (routenLayer.getLayers().length) routenKarte.fitBounds(routenLayer.getBounds(), { padding: [25, 25] });
}

function starteFahrt() {
    if (aktuellerFlug || !navigator.geolocation) {
        meldung(navigator.geolocation ? "Eine Fahrt läuft bereits." : "GPS wird von diesem Browser nicht unterstützt.", "error"); return;
    }
    const stammdaten = ladeJson(MASTER_DATA_KEY, {});
    aktuellerFlug = { startzeit: new Date().toISOString(), pilot: text(stammdaten.pilotName), ballon: text(stammdaten.balloonName), ballontyp: text(stammdaten.balloonType) };
    trackpunkte = []; letztePosition = null;
    initialisiereTrackingKarte(); trackingLine?.setLatLngs([]);
    watchId = navigator.geolocation.watchPosition(verarbeitePosition, gpsFehler, { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 });
    timerId = setInterval(aktualisiereTrackingAnzeige, 1000);
    $("startButton").disabled = true; $("stopButton").disabled = false; $("saveButton").disabled = true;
    meldung("GPS-Aufzeichnung läuft.", "running"); aktualisiereTrackingAnzeige();
}

function verarbeitePosition(position) {
    if (!aktuellerFlug) return;
    const c = position.coords;
    const punkt = { lat: c.latitude, lng: c.longitude, hoehe: num(c.altitude), genauigkeit: num(c.accuracy), geschwindigkeit: Math.max(0, num(c.speed) * 3.6), zeit: new Date(position.timestamp).toISOString() };
    if (letztePosition && distanzKm(letztePosition, punkt) < 0.003 && num(c.accuracy) > 50) return;
    trackpunkte.push(punkt); letztePosition = punkt;
    const latLng = [punkt.lat, punkt.lng]; trackingLine?.addLatLng(latLng);
    if (!trackingMarker) trackingMarker = L.circleMarker(latLng, { radius: 7, color: "#2098e8", fillOpacity: 1 }).addTo(trackingMap);
    else trackingMarker.setLatLng(latLng);
    trackingMap?.setView(latLng, Math.max(trackingMap.getZoom(), 14));
    aktualisiereTrackingAnzeige(); aktualisiereHoehenprofil();
}

function gpsFehler(error) {
    const info = { 1: "Standortberechtigung wurde verweigert.", 2: "Standort ist derzeit nicht verfügbar.", 3: "GPS-Zeitüberschreitung." }[error.code] || error.message;
    meldung(info, "error");
}

function aktualisiereTrackingAnzeige() {
    const letzter = trackpunkte.at(-1);
    const dauerSek = aktuellerFlug ? Math.max(0, (Date.now() - new Date(aktuellerFlug.startzeit).getTime()) / 1000) : 0;
    if ($("trackingAltitude")) $("trackingAltitude").textContent = letzter ? Math.round(letzter.hoehe) : "--";
    if ($("trackingSpeed")) $("trackingSpeed").textContent = letzter ? formatZahl(letzter.geschwindigkeit) : "--";
    if ($("trackingFlightTime")) $("trackingFlightTime").textContent = `${String(Math.floor(dauerSek / 3600)).padStart(2,"0")}:${String(Math.floor(dauerSek % 3600 / 60)).padStart(2,"0")}`;
    if ($("trackingDistance")) $("trackingDistance").textContent = formatZahl(trackDistanz(trackpunkte));
}

function beendeFahrt() {
    if (!aktuellerFlug) return;
    aktuellerFlug.endzeit = new Date().toISOString();
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    clearInterval(timerId); watchId = null; timerId = null;
    $("startButton").disabled = false; $("stopButton").disabled = true; $("saveButton").disabled = trackpunkte.length === 0;
    meldung(trackpunkte.length ? "Fahrt beendet. Jetzt speichern." : "Keine GPS-Punkte aufgezeichnet.", trackpunkte.length ? "working" : "error");
}

async function speichereAktuelleFahrt() {
    if (!aktuellerFlug || !trackpunkte.length) return;
    const ende = aktuellerFlug.endzeit || new Date().toISOString();
    const dauerMinuten = Math.max(1, Math.round((new Date(ende) - new Date(aktuellerFlug.startzeit)) / 60000));
    const streckeKm = trackDistanz(trackpunkte);
    const start = trackpunkte[0], landung = trackpunkte.at(-1);
    const [startort, landeort] = await Promise.all([ermittleOrt(start), ermittleOrt(landung)]);
    const flug = normalisiereFlug({ ...aktuellerFlug, id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`, datum: aktuellerFlug.startzeit, endzeit: ende,
        dauerMinuten, streckeKm, landungen: sichereDezimalzahl($("landungen")?.value, 1, 1, 99), bemerkung: $("bemerkung")?.value.trim() || "",
        startort, landeort, maxHoehe: Math.max(...trackpunkte.map(p => p.hoehe)), maxGeschwindigkeit: Math.max(...trackpunkte.map(p => p.geschwindigkeit)),
        durchschnittGeschwindigkeit: dauerMinuten ? streckeKm / (dauerMinuten / 60) : 0, trackpunkte: [...trackpunkte] });
    fluege.unshift(flug); fluegeSpeichern();
    aktuellerFlug = null; trackpunkte = []; letztePosition = null; trackingLine?.setLatLngs([]); trackingMarker?.remove(); trackingMarker = null;
    $("saveButton").disabled = true; if ($("bemerkung")) $("bemerkung").value = ""; if ($("landungen")) $("landungen").value = "1";
    meldung("Fahrt wurde gespeichert.", "running"); aktualisiereTrackingAnzeige(); setzeSeite("flugbuch");
}

async function ermittleOrt(punkt) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(punkt.lat)}&lon=${encodeURIComponent(punkt.lng)}&zoom=10`;
        const response = await fetch(url, { headers: { "Accept-Language": "de" } });
        if (!response.ok) throw new Error(response.status);
        const data = await response.json();
        return data.address?.town || data.address?.village || data.address?.municipality || data.address?.city || data.display_name || `${punkt.lat.toFixed(4)}, ${punkt.lng.toFixed(4)}`;
    } catch { return `${punkt.lat.toFixed(4)}, ${punkt.lng.toFixed(4)}`; }
}

function aktualisiereDashboard() {
    const minuten = fluege.reduce((s, f) => s + f.dauerMinuten, 0), km = fluege.reduce((s, f) => s + f.streckeKm, 0), landungen = fluege.reduce((s, f) => s + f.landungen, 0);
    if ($("countFlights")) $("countFlights").textContent = fluege.length;
    if ($("countLandings")) $("countLandings").textContent = landungen;
    if ($("countMinutes")) $("countMinutes").textContent = formatDauer(minuten);
    if ($("countKm")) $("countKm").textContent = `${formatZahl(km)} km`;
    if ($("summaryList")) $("summaryList").innerHTML = [["Fahrten", fluege.length], ["Landungen", landungen], ["Flugzeit", formatDauer(minuten)], ["Strecke", `${formatZahl(km)} km`]].map(([a,b]) => `<div class="summary-row"><span>${a}</span><strong>${b}</strong></div>`).join("");
    const laengster = fluege.reduce((a,f) => !a || f.dauerMinuten > a.dauerMinuten ? f : a, null);
    const weitester = fluege.reduce((a,f) => !a || f.streckeKm > a.streckeKm ? f : a, null);
    const hoechster = fluege.reduce((a,f) => !a || f.maxHoehe > a.maxHoehe ? f : a, null);
    if ($("records")) $("records").innerHTML = [
        ["Längste Fahrt", laengster ? formatDauer(laengster.dauerMinuten) : "–", laengster ? formatDatum(laengster.startzeit) : "Keine Daten"],
        ["Weiteste Strecke", weitester ? `${formatZahl(weitester.streckeKm)} km` : "–", weitester ? formatDatum(weitester.startzeit) : "Keine Daten"],
        ["Größte Höhe", hoechster ? `${Math.round(hoechster.maxHoehe)} m` : "–", hoechster ? formatDatum(hoechster.startzeit) : "Keine Daten"]
    ].map(([a,b,c]) => `<div class="record"><span>${a}</span><strong>${b}</strong><small>${c}</small></div>`).join("");
    aktualisiereMonitor();
}

function aktualisiereMonitor() {
    const cfg = { ...MONITOR_DEFAULTS, ...ladeJson(MONITOR_STORAGE_KEY, {}) };
    const grenze = new Date(); grenze.setMonth(grenze.getMonth() - cfg.zeitraumMonate);
    const relevant = fluege.filter(f => new Date(f.startzeit) >= grenze);
    const stunden = relevant.reduce((s,f) => s + f.dauerMinuten, 0) / 60, landungen = relevant.reduce((s,f) => s + f.landungen, 0);
    if ($("monitorPeriodLabel")) $("monitorPeriodLabel").textContent = `${cfg.zeitraumMonate} MONATE`;
    if ($("aktivitaetsmonitorInhalt")) $("aktivitaetsmonitorInhalt").innerHTML = `
        <div class="summary-list"><div class="summary-row"><span>Flugstunden</span><strong>${formatZahl(stunden)} / ${cfg.erforderlicheStunden}</strong></div>
        <div class="summary-row"><span>Landungen</span><strong>${landungen} / ${cfg.erforderlicheLandungen}</strong></div>
        <div class="summary-row"><span>Status</span><strong>${stunden >= cfg.erforderlicheStunden && landungen >= cfg.erforderlicheLandungen ? "Erfüllt" : "Noch offen"}</strong></div></div>`;
    const sortiert = relevant.slice().sort((a,b) => new Date(a.startzeit) - new Date(b.startzeit));
    if ($("nextExit")) $("nextExit").textContent = sortiert.length ? `Ältester relevanter Flug: ${formatDatum(sortiert[0].startzeit)}` : "Kein relevanter Flug vorhanden.";
}

function aktualisiereFlugbuch() {
    const host = $("flugbuchTable"); if (!host) return;
    if (!fluege.length) { host.innerHTML = '<p class="empty-message">Noch keine Fahrten gespeichert.</p>'; return; }
    host.innerHTML = fluege.map(f => `<article class="flight"><div class="flight-header"><h3>${escapeHtml(formatDatum(f.startzeit, true))}</h3><strong>${formatDauer(f.dauerMinuten)}</strong></div>
        <div class="flight-data"><div><small>START</small>${escapeHtml(f.startort || "–")}</div><div><small>LANDUNG</small>${escapeHtml(f.landeort || "–")}</div>
        <div><small>STRECKE</small>${formatZahl(f.streckeKm)} km</div><div><small>LANDUNGEN</small>${f.landungen}</div>
        <div><small>PILOT</small>${escapeHtml(f.pilot || "–")}</div><div><small>BALLON</small>${escapeHtml(f.ballon || "–")}</div></div>
        ${f.bemerkung ? `<div class="flight-note">${escapeHtml(f.bemerkung)}</div>` : ""}
        <div class="flight-actions"><button class="secondary-button" data-show-flight="${escapeHtml(f.id)}">Auf Karte</button><button class="primary-button delete-button" data-delete-flight="${escapeHtml(f.id)}">Löschen</button></div></article>`).join("");
}

function loescheFlug(id) {
    if (!confirm("Diese Fahrt wirklich löschen?")) return;
    fluege = fluege.filter(f => f.id !== id); fluegeSpeichern();
}

function zeigeFlugAufKarte(id) {
    setzeSeite("karte");
    setTimeout(() => {
        const flug = fluege.find(f => f.id === id); if (!flug?.trackpunkte.length || !routenKarte) return;
        routenKarte.fitBounds(L.latLngBounds(flug.trackpunkte.map(p => [p.lat,p.lng])), { padding: [30,30] });
    }, 100);
}

function chartErsetzen(name, canvasId, config) {
    if (typeof Chart === "undefined" || !$(canvasId)) return;
    diagramme[name]?.destroy(); diagramme[name] = new Chart($(canvasId), config);
}

function aktualisiereHoehenprofil() {
    chartErsetzen("hoehe", "heightChart", { type: "line", data: { labels: trackpunkte.map((_,i) => i + 1), datasets: [{ label: "Höhe (m)", data: trackpunkte.map(p => p.hoehe), borderColor: "#ffd45c", backgroundColor: "rgba(255,212,92,.12)", fill: true, pointRadius: 0 }] }, options: chartOptionen() });
}

function chartOptionen() { return { responsive: true, maintainAspectRatio: false, scales: { x: { ticks: { color: "#9fb7c8" }, grid: { color: "#203548" } }, y: { beginAtZero: true, ticks: { color: "#9fb7c8" }, grid: { color: "#203548" } } }, plugins: { legend: { labels: { color: "#f8fbff" } } } }; }

function aktualisiereStatistiken() {
    const sortiert = fluege.slice().sort((a,b) => new Date(a.startzeit) - new Date(b.startzeit));
    const labels = sortiert.map(f => new Intl.DateTimeFormat("de-AT", { month: "short", year: "2-digit" }).format(new Date(f.startzeit)));
    chartErsetzen("zeit", "flightTimeChart", { type: "bar", data: { labels, datasets: [{ label: "Flugzeit (min)", data: sortiert.map(f => f.dauerMinuten), backgroundColor: "#2098e8", borderRadius: 5 }] }, options: chartOptionen() });
    chartErsetzen("distanz", "distanceChart", { type: "bar", data: { labels, datasets: [{ label: "Strecke (km)", data: sortiert.map(f => f.streckeKm), backgroundColor: "#52cc76", borderRadius: 5 }] }, options: chartOptionen() });
    const monate = {};
    sortiert.forEach(f => { const k = new Date(f.startzeit).toISOString().slice(0,7); monate[k] = (monate[k] || 0) + 1; });
    chartErsetzen("aktivitaet", "activityChart", { type: "line", data: { labels: Object.keys(monate), datasets: [{ label: "Fahrten", data: Object.values(monate), borderColor: "#a86ee6", backgroundColor: "rgba(168,110,230,.12)", fill: true }] }, options: chartOptionen() });
}

async function ladeWetter() {
    const host = $("weatherContent"); if (!host) return;
    host.innerHTML = '<p class="empty-message">Wetterdaten werden geladen ...</p>';
    const position = await aktuellePosition().catch(() => ({ coords: { latitude: DEFAULT_CENTER[0], longitude: DEFAULT_CENTER[1] } }));
    try {
        const { latitude: lat, longitude: lon } = position.coords;
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=sunrise,sunset&timezone=auto`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json(), c = data.current || {};
        const wind = num(c.wind_speed_10m), boeen = num(c.wind_gusts_10m);
        const klasse = wind <= 10 && boeen <= 20 && num(c.precipitation) === 0 ? "weather-good" : wind <= 20 && boeen <= 30 ? "weather-caution" : "weather-danger";
        host.innerHTML = `<div class="weather-grid"><div>Temperatur<br><strong>${formatZahl(c.temperature_2m)} °C</strong></div><div>Gefühlt<br><strong>${formatZahl(c.apparent_temperature)} °C</strong></div>
        <div>Wind<br><strong>${formatZahl(wind)} km/h</strong></div><div>Böen<br><strong>${formatZahl(boeen)} km/h</strong></div><div>Windrichtung<br><strong>${Math.round(num(c.wind_direction_10m))}°</strong></div>
        <div>Luftfeuchte<br><strong>${Math.round(num(c.relative_humidity_2m))} %</strong></div><div>Sonnenaufgang<br><strong>${formatDatum(data.daily?.sunrise?.[0], true)}</strong></div><div>Sonnenuntergang<br><strong>${formatDatum(data.daily?.sunset?.[0], true)}</strong></div></div>
        <div class="weather-rating ${klasse}">Automatische Orientierungshilfe. Vor einer Fahrt immer offizielle Flugwetterdaten und lokale Bedingungen prüfen.</div>`;
    } catch (error) { host.innerHTML = `<p class="empty-message">Wetterdaten konnten nicht geladen werden: ${escapeHtml(error.message)}</p>`; }
}

function aktuellePosition() {
    return new Promise((resolve,reject) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(resolve,reject,{ enableHighAccuracy:true,timeout:8000,maximumAge:300000 }) : reject(new Error("GPS nicht verfügbar")));
}

function ladeEinstellungen() {
    const d = ladeJson(MASTER_DATA_KEY, {});
    [["pilotName","pilotName"],["balloonName","balloonName"],["balloonType","balloonType"],["licenseNumber","licenseNumber"],["licenseType","licenseType"],["nextMaintenance","nextMaintenance"]].forEach(([id,key]) => { if ($(id)) $(id).value = d[key] || ""; });
    aktualisiereStammdatenAnzeige(d);
}

function speichereEinstellungen() {
    const d = { pilotName: $("pilotName")?.value.trim() || "", balloonName: $("balloonName")?.value.trim() || "", balloonType: $("balloonType")?.value.trim() || "", licenseNumber: $("licenseNumber")?.value.trim() || "", licenseType: $("licenseType")?.value || "", nextMaintenance: $("nextMaintenance")?.value || "" };
    speichereJson(MASTER_DATA_KEY, d); aktualisiereStammdatenAnzeige(d); alert("Einstellungen wurden gespeichert.");
}

function aktualisiereStammdatenAnzeige(d = ladeJson(MASTER_DATA_KEY, {})) {
    if ($("pilotHeader")) $("pilotHeader").textContent = d.pilotName || "Pilot";
    if ($("trackingPilotDisplay")) $("trackingPilotDisplay").textContent = d.pilotName || "Nicht festgelegt";
    if ($("trackingBallonDisplay")) $("trackingBallonDisplay").textContent = d.balloonName || "Nicht festgelegt";
    if ($("trackingTypeDisplay")) $("trackingTypeDisplay").textContent = d.balloonType || "Nicht festgelegt";
    if ($("maintenanceDate")) $("maintenanceDate").textContent = d.nextMaintenance ? formatDatum(d.nextMaintenance) : "Nicht festgelegt";
}

function exportiereBackup() {
    const backup = { format: "ballonflugbuch-backup", version: 1, exportiertAm: new Date().toISOString(), fluege, stammdaten: ladeJson(MASTER_DATA_KEY, {}), monitorEinstellungen: ladeJson(MONITOR_STORAGE_KEY, MONITOR_DEFAULTS) };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `ballonflugbuch-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importiereDatei(file) {
    if (!file) return;
    try {
        const raw = await file.text(); let imported;
        if (file.name.toLowerCase().endsWith(".csv")) imported = csvZuFluegen(raw);
        else { const parsed = JSON.parse(raw); imported = Array.isArray(parsed) ? parsed : parsed.fluege; if (parsed.stammdaten) speichereJson(MASTER_DATA_KEY, parsed.stammdaten); }
        if (!Array.isArray(imported)) throw new Error("Keine Fahrtliste gefunden.");
        const ids = new Set(fluege.map(f => f.id)); let hinzu = 0;
        imported.map(normalisiereFlug).filter(Boolean).forEach(f => { if (!ids.has(f.id)) { fluege.push(f); ids.add(f.id); hinzu++; } });
        fluege.sort((a,b) => new Date(b.startzeit) - new Date(a.startzeit)); fluegeSpeichern(); ladeEinstellungen(); alert(`${hinzu} Fahrt(en) wurden importiert.`);
    } catch (error) { alert(`Import fehlgeschlagen: ${error.message}`); }
    finally { if ($("fileInput")) $("fileInput").value = ""; }
}

function csvZuFluegen(csv) {
    const lines = csv.split(/\r?\n/).filter(Boolean); if (lines.length < 2) return [];
    const sep = lines[0].includes(";") ? ";" : ",";
    const headers = lines.shift().split(sep).map(v => v.trim().toLowerCase());
    return lines.map(line => { const vals = line.split(sep); const obj = {}; headers.forEach((h,i) => obj[h] = vals[i]?.trim()); return { id: obj.id, startzeit: obj.startzeit || obj.datum, endzeit: obj.endzeit, dauerMinuten: obj.dauerminuten || obj.dauer, streckeKm: obj.streckekm || obj.strecke, landungen: obj.landungen, bemerkung: obj.bemerkung, pilot: obj.pilot, ballon: obj.ballon, startort: obj.startort, landeort: obj.landeort }; });
}

function aktualisiereUhr() {
    const now = new Date();
    if ($("currentDate")) $("currentDate").textContent = new Intl.DateTimeFormat("de-AT", { dateStyle: "medium" }).format(now);
    if ($("currentTime")) $("currentTime").textContent = new Intl.DateTimeFormat("de-AT", { timeStyle: "short" }).format(now);
}

function aktualisiereAlleAnsichten() {
    aktualisiereDashboard(); aktualisiereFlugbuch(); zeichneRouten();
}

function registriereEvents() {
    document.querySelectorAll("[data-page-link]").forEach(b => b.addEventListener("click", () => setzeSeite(b.dataset.pageLink)));
    $("menuButton")?.addEventListener("click", () => $("sidebar")?.classList.contains("sidebar-open") ? schliesseMenue() : oeffneMenue());
    $("startButton")?.addEventListener("click", starteFahrt); $("stopButton")?.addEventListener("click", beendeFahrt); $("saveButton")?.addEventListener("click", speichereAktuelleFahrt);
    $("saveSettingsButton")?.addEventListener("click", speichereEinstellungen); $("exportButton")?.addEventListener("click", exportiereBackup);
    $("openImportButton")?.addEventListener("click", () => $("fileInput")?.click()); $("fileInput")?.addEventListener("change", e => importiereDatei(e.target.files?.[0]));
    $("flugbuchTable")?.addEventListener("click", e => { const del = e.target.closest("[data-delete-flight]"); const show = e.target.closest("[data-show-flight]"); if (del) loescheFlug(del.dataset.deleteFlight); if (show) zeigeFlugAufKarte(show.dataset.showFlight); });
    window.addEventListener("storage", e => { if (e.key === FLIGHT_STORAGE_KEY) { fluege = fluegeLaden(); aktualisiereAlleAnsichten(); } });
    window.addEventListener("beforeunload", e => { if (aktuellerFlug) { e.preventDefault(); e.returnValue = ""; } });
}

function initialisiereSynchronisation() {
    if ("BroadcastChannel" in window) {
        fluegeSyncChannel = new BroadcastChannel(FLIGHT_SYNC_CHANNEL);
        fluegeSyncChannel.addEventListener("message", e => { if (e.data?.typ === "fluege-aktualisiert") { fluege = fluegeLaden(); aktualisiereAlleAnsichten(); } });
    }
}

function initialisieren() {
    fluege = fluegeLaden(); registriereEvents(); initialisiereSynchronisation(); ladeEinstellungen(); aktualisiereAlleAnsichten(); aktualisiereUhr(); setInterval(aktualisiereUhr, 30000); setzeSeite("dashboard");
}

document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", initialisieren) : initialisieren();
