"use strict";
// Trajektoren: Winddrift-Simulation mit kostenlosen Open-Meteo-Daten (ICON-D2 bis 180 m, GFS ab 200 m).
// Wird von app.js über trajektorenOeffnen() beim Öffnen des Tabs gestartet.
const trajektorenOeffnen = (() => {
  const ICON = [10, 80, 120, 180], GFS = [200, 300, 500, 800, 1000, 1500, 2000, 3000];
  const DEF = [...ICON.map(h => ({ h, model: "icon_d2" })), ...GFS.map(h => ({ h, model: "gfs_seamless" }))];
  const PL = [1000, 975, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500];
  const FARBEN = ["#1570a6", "#0b8b57", "#ea7d24", "#8b5cf6", "#dc2626", "#0891b2", "#ca8a04", "#db2777", "#4f46e5", "#059669", "#d97706", "#475569"];
  const STANDARD = [10, 80, 120, 180];
  const E = id => document.getElementById(id);
  let map = null, marker = null, linien = [], reqId = 0, bereit = false;

  const uv = (s, d) => ({ u: -s * Math.sin(d * Math.PI / 180), v: -s * Math.cos(d * Math.PI / 180) });
  const vu = (u, v) => ({ speed: Math.hypot(u, v), direction: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360 });
  const schritt = (p, u, v, s) => [p[0] + v / 3.6 * s / 111320, p[1] + u / 3.6 * s / (111320 * Math.max(.01, Math.cos(p[0] * Math.PI / 180)))];
  const dist = (a, b) => { const r = Math.PI / 180, x = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const richtung = d => `${Math.round(d)}° (${["N", "NO", "O", "SO", "S", "SW", "W", "NW"][Math.round(d / 45) % 8]})`;
  const zahl = (d, n, i) => { const x = d.hourly?.[n]?.[i]; if (x == null || !Number.isFinite(+x)) throw new Error(`Für ${n} liegen zu diesem Zeitpunkt keine Modelldaten vor.`); return +x; };

  function windIdx(def, d, i) {
    if (def.model === "icon_d2") return { ...uv(zahl(d, `wind_speed_${def.h}m`, i), zahl(d, `wind_direction_${def.h}m`, i)), label: "ICON-D2" };
    // Zielhöhe = Gelände + Höhe über Grund, zwischen den Druckniveaus interpoliert
    const ziel = (+d.elevation || 0) + def.h, lv = [];
    PL.forEach(p => {
      const z = d.hourly?.[`geopotential_height_${p}hPa`]?.[i], s = d.hourly?.[`wind_speed_${p}hPa`]?.[i], r = d.hourly?.[`wind_direction_${p}hPa`]?.[i];
      if ([z, s, r].every(x => x != null && Number.isFinite(+x))) lv.push({ p, z: +z, ...uv(+s, +r) });
    });
    if (!lv.length) throw new Error("Keine GFS-Druckniveaudaten erhalten.");
    lv.sort((a, b) => a.z - b.z);
    const top = lv.at(-1);
    if (ziel <= lv[0].z) return { u: lv[0].u, v: lv[0].v, label: `GFS ${lv[0].p} hPa` };
    if (ziel >= top.z) return { u: top.u, v: top.v, label: `GFS ${top.p} hPa` };
    const j = lv.findIndex(l => l.z >= ziel), lo = lv[j - 1], hi = lv[j], q = (ziel - lo.z) / (hi.z - lo.z || 1);
    return { u: lo.u + (hi.u - lo.u) * q, v: lo.v + (hi.v - lo.v) * q, label: `GFS ${lo.p}–${hi.p} hPa` };
  }
  function windAt(def, d, ts) {
    d.times ??= (d.hourly?.time || []).map(t => Date.parse(t + "Z"));
    const t = d.times;
    if (t.length < 2) throw new Error("Keine Wetterdaten erhalten.");
    if (ts < t[0] || ts > t.at(-1)) throw new Error("Datum/Uhrzeit liegt außerhalb des Vorhersagezeitraums (heute und morgen).");
    let i = t.findIndex(x => x >= ts);
    if (i === 0) i = 1;
    const a = windIdx(def, d, i - 1), b = windIdx(def, d, i), q = (ts - t[i - 1]) / (t[i] - t[i - 1] || 1);
    const u = a.u + (b.u - a.u) * q, v = a.v + (b.v - a.v) * q;
    return { u, v, ...vu(u, v), label: q < .5 ? a.label : b.label };
  }
  const variablen = def => def.model === "icon_d2" ? [`wind_speed_${def.h}m`, `wind_direction_${def.h}m`] : PL.flatMap(p => [`wind_speed_${p}hPa`, `wind_direction_${p}hPa`, `geopotential_height_${p}hPa`]);
  async function ladeModell(model, lat, lon, vars) {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${[...new Set(vars)].join(",")}&models=${model}&forecast_days=2&timezone=UTC`);
    if (!r.ok) throw new Error(`Wetterdaten (${model}) konnten nicht geladen werden (${r.status}).`);
    return r.json();
  }
  function bahn(def, d, lat, lon, start, h) {
    let p = [lat, lon];
    const pts = [p], sek = 900, n = Math.ceil(h * 3600 / sek);
    for (let s = 1; s <= n; s++) { const w = windAt(def, d, start + (s - .5) * sek * 1000); p = schritt(p, w.u, w.v, sek); pts.push(p); }
    windAt(def, d, start + n * sek * 1000); // Flugende muss im Vorhersagezeitraum liegen
    return pts;
  }

  const meldung = (t, fehler) => { const s = E("tStatus"); s.textContent = t; s.style.color = fehler ? "var(--gef)" : ""; };
  function leeren(text) {
    reqId++; linien.forEach(l => map.removeLayer(l)); linien = [];
    E("tErg").innerHTML = '<p class="note">Noch nichts berechnet.</p>';
    E("tRun").disabled = false; E("tRun").textContent = "Simulation ausführen";
    if (text) meldung(text);
  }
  function setzeStart(lat, lon, name) {
    E("tLat").value = lat.toFixed(5); E("tLon").value = lon.toFixed(5);
    E("tOrt").textContent = `${name || "Gewählter Startpunkt"} · ${utmText(lat, lon)}`;
    marker.setLatLng([lat, lon]);
  }

  async function simulieren() {
    const lat = +E("tLat").value, lon = +E("tLon").value, h = +E("tDauer").value, id = ++reqId;
    const sel = [...document.querySelectorAll("#tHoehen input:checked")].map(i => +i.value);
    if (!sel.length) return meldung("Bitte mindestens eine Höhe auswählen.", true);
    const [y, m, d] = E("tDatum").value.split("-").map(Number), [hh, mm] = (E("tStart").value || "07:00").split(":").map(Number);
    const start = new Date(y, m - 1, d, hh, mm).getTime();
    if (!Number.isFinite(start)) return meldung("Datum oder Startzeit ist ungültig.", true);
    linien.forEach(l => map.removeLayer(l)); linien = [];
    E("tRun").disabled = true; E("tRun").textContent = "Wetterdaten werden geladen …";
    meldung("ICON-D2- und GFS-Winddaten werden geladen …");
    try {
      const gruppen = new Map();
      sel.forEach(x => { const def = DEF.find(q => q.h === x); if (!gruppen.has(def.model)) gruppen.set(def.model, []); gruppen.get(def.model).push(...variablen(def)); });
      const daten = new Map();
      await Promise.all([...gruppen].map(async ([model, v]) => daten.set(model, await ladeModell(model, lat, lon, v))));
      if (id !== reqId) return;
      let zeilen = "";
      const alle = [];
      sel.forEach((x, i) => {
        const def = DEF.find(q => q.h === x), fc = daten.get(def.model), pts = bahn(def, fc, lat, lon, start, h), w = windAt(def, fc, start), f = FARBEN[i % FARBEN.length];
        linien.push(
          L.polyline(pts, { color: f, weight: 4, opacity: .85 }).addTo(map).bindPopup(`<b>Windroute</b><br>${x} m<br>${w.label}`),
          L.circleMarker(pts.at(-1), { radius: 7, fillColor: f, color: "#fff", weight: 2, fillOpacity: 1 }).addTo(map)
        );
        alle.push(...pts);
        zeilen += `<tr><td><i class="fk" style="background:${f}"></i>${x} m</td><td>${w.label}</td><td>${richtung(w.direction)}</td><td>${w.speed.toFixed(1).replace(".", ",")} km/h</td><td>${dist([lat, lon], pts.at(-1)).toFixed(2).replace(".", ",")} km</td></tr>`;
      });
      E("tErg").innerHTML = `<div class="tabelle"><table><thead><tr><th>Höhe</th><th>Modell</th><th>Wind</th><th>Tempo</th><th>Entfernung</th></tr></thead><tbody>${zeilen}</tbody></table></div>`;
      map.fitBounds(L.latLngBounds(alle).pad(.12), { maxZoom: 13 });
      const g = daten.get("gfs_seamless");
      meldung(`${sel.length} Trajektorien berechnet.` + (g && Number.isFinite(+g.elevation) ? ` Geländehöhe Startplatz: ${Math.round(g.elevation)} m.` : ""));
    } catch (e) {
      if (id === reqId) { linien.forEach(l => map.removeLayer(l)); linien = []; E("tErg").innerHTML = '<p class="note">Noch nichts berechnet.</p>'; meldung(e.message || "Berechnung fehlgeschlagen.", true); }
    } finally { if (id === reqId) { E("tRun").disabled = false; E("tRun").textContent = "Simulation ausführen"; } }
  }

  async function suchen() {
    const q = E("tSuche").value.trim();
    if (!q) return meldung("Bitte einen Ort oder eine Postleitzahl eingeben.", true);
    E("tSucheB").disabled = true;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=at&accept-language=de&q=${encodeURIComponent(q)}`);
      const d = r.ok ? await r.json() : null;
      if (!d) throw new Error("Ortssuche fehlgeschlagen.");
      if (!d.length) throw new Error("Ort nicht gefunden.");
      setzeStart(+d[0].lat, +d[0].lon, d[0].display_name || q);
      map.setView([+d[0].lat, +d[0].lon], 13);
      leeren("Startort geändert. Bitte Simulation erneut ausführen.");
    } catch (e) { meldung(e.message || "Ortssuche fehlgeschlagen.", true); }
    E("tSucheB").disabled = false;
  }

  function auswahl(werte) {
    document.querySelectorAll("#tHoehen input").forEach(i => { i.checked = werte.includes(+i.value); });
  }

  function aufbauen() {
    if (typeof L === "undefined") { E("tmap").textContent = "Die Karte benötigt beim ersten Start eine Internetverbindung."; return false; }
    const lat = +E("tLat").value, lon = +E("tLon").value;
    map = L.map("tmap").setView([lat, lon], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    marker = L.marker([lat, lon], { draggable: true, icon: pin("start") }).addTo(map);
    E("tOrt").textContent = "Startpunkt · " + utmText(lat, lon);
    const verschoben = p => { setzeStart(p.lat, p.lng, "Manuell gewählter Startpunkt"); leeren("Startpunkt geändert. Bitte Simulation erneut ausführen."); };
    marker.on("dragend", () => verschoben(marker.getLatLng()));
    map.on("click", e => verschoben(e.latlng));
    E("tHoehen").innerHTML = DEF.map(d => `<label><input type="checkbox" value="${d.h}"${STANDARD.includes(d.h) ? " checked" : ""}>${d.h.toLocaleString("de-AT")} m</label>`).join("");
    const t = new Date();
    E("tDatum").value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    E("tDauer").oninput = () => { E("tDauerW").textContent = (+E("tDauer").value).toFixed(1).replace(".", ",") + " Stunden"; };
    ["tDatum", "tStart"].forEach(i => { E(i).onchange = () => leeren("Datum oder Startzeit geändert. Bitte Simulation erneut ausführen."); });
    E("tSucheB").onclick = suchen;
    E("tSuche").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); suchen(); } };
    E("tRun").onclick = simulieren;
    E("tAlle").onclick = () => auswahl(DEF.map(d => d.h));
    E("tKeine").onclick = () => auswahl([]);
    E("tBallonH").onclick = () => auswahl(STANDARD);
    E("tGpsB").onclick = () => navigator.geolocation?.getCurrentPosition(p => {
      setzeStart(p.coords.latitude, p.coords.longitude, "Mein Standort"); map.setView([p.coords.latitude, p.coords.longitude], 13);
      leeren("Startort geändert. Bitte Simulation erneut ausführen.");
    }, () => meldung("Standort nicht verfügbar. Bitte Berechtigung prüfen.", true), { enableHighAccuracy: true, timeout: 15000 });
    return true;
  }

  return () => {
    if (!bereit) bereit = aufbauen();
    setTimeout(() => map?.invalidateSize(), 60);
  };
})();
