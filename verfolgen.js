"use strict";
// Verfolger-Ansicht für das Rückholteam: Live-Position einer Ballonfahrt über den Link aus der App (ohne Anmeldung).
// Liest nur das Dokument live/{token}; die eigene Position des Betrachters wird nicht gesendet.
(() => {
  const E = id => document.getElementById(id), token = location.hash.slice(1), cfg = window.FIREBASE_CONFIG || {};
  const CDN = "https://www.gstatic.com/firebasejs/10.14.1/", RICHT = ["N", "NO", "O", "SO", "S", "SW", "W", "NW"];
  const num = (v, d = 0) => Number.isFinite(v) ? v.toLocaleString("de-AT", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–";
  const km = (a, b) => { const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lng - a.lng) * r, x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const peilung = (a, b) => { const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r), x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r); return (Math.atan2(y, x) / r + 360) % 360; };
  function utmText(lat, lng) { // wie im Flugbuch: UTM (WGS84)
    const zone = Math.floor((lng + 180) / 6) + 1, r = Math.PI / 180, a = 6378137, e2 = 0.00669438, k0 = 0.9996, phi = lat * r, ep2 = e2 / (1 - e2);
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lng - ((zone - 1) * 6 - 177)) * r;
    const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - 35 * e2 ** 3 / 3072 * Math.sin(6 * phi));
    const Ee = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    const Nn = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720)) + (lat < 0 ? 1e7 : 0);
    return `UTM ${zone}${lat < 0 ? "S" : "N"} · ${Math.round(Ee)} E · ${Math.round(Nn)} N`;
  }

  // Design wie in der App (gespeichert oder Systemeinstellung)
  const theme = t => { document.documentElement.dataset.theme = t; E("themeB").textContent = t === "dunkel" ? "☀" : "☾"; document.querySelector('meta[name="theme-color"]').content = t === "dunkel" ? "#1A1411" : "#FFF8EF"; };
  let gespeichert = null; try { gespeichert = JSON.parse(localStorage.getItem("theme")); } catch {}
  theme(gespeichert || (matchMedia("(prefers-color-scheme: dark)").matches ? "dunkel" : "hell"));
  E("themeB").onclick = () => { const t = document.documentElement.dataset.theme === "dunkel" ? "hell" : "dunkel"; theme(t); try { localStorage.setItem("theme", JSON.stringify(t)); } catch {} };

  const meldung = (t, art) => { E("vStatus").textContent = t; E("vStatus").style.color = art ? `var(--${art})` : ""; };
  if (typeof L === "undefined") { E("vTitel").textContent = "Keine Verbindung"; return meldung("Die Karte braucht eine Internetverbindung.", "gef"); }

  const karte = L.map("map", { zoomControl: false, attributionControl: false }).setView([47.3, 15.9], 8);
  const standard = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(karte);
  const esri = p => "https://server.arcgisonline.com/ArcGIS/rest/services/" + p + "/MapServer/tile/{z}/{y}/{x}";
  const hybrid = L.layerGroup([L.tileLayer(esri("World_Imagery"), { maxZoom: 18, attribution: "© Esri" }), L.tileLayer(esri("Reference/World_Transportation"), { maxZoom: 18 }), L.tileLayer(esri("Reference/World_Boundaries_and_Places"), { maxZoom: 18 })]);
  L.control.layers({ Standard: standard, Hybrid: hybrid }, null, { position: "topright" }).addTo(karte);
  L.control.zoom({ position: "topleft" }).addTo(karte); L.control.scale({ position: "bottomright", imperial: false }).addTo(karte); L.control.attribution({ prefix: false, position: "bottomright" }).addTo(karte);
  const pin = c => L.divIcon({ className: "", html: `<i class="pin ${c}"></i>`, iconSize: [20, 20], iconAnchor: [10, 10] });
  const spurS = L.polyline([], { color: "#000", weight: 8, opacity: .35 }).addTo(karte), spurL = L.polyline([], { color: "#ffb703", weight: 4 }).addTo(karte);
  const ballon = L.marker([0, 0], { icon: pin("live") }), ichM = L.marker([0, 0], { icon: pin("start") }), verbindung = L.polyline([], { color: "#4cc9f0", weight: 2, dashArray: "6 6" }).addTo(karte);
  let fahrt = null, ich = null, erstesMal = true;

  function zeigen() {
    if (!fahrt || !Number.isFinite(fahrt.lat)) return;
    const b = { lat: fahrt.lat, lng: fahrt.lng }, s = fahrt.spur || [], ll = [];
    for (let i = 0; i + 1 < s.length; i += 2) ll.push([s[i], s[i + 1]]);
    ll.push([b.lat, b.lng]); spurS.setLatLngs(ll); spurL.setLatLngs(ll);
    ballon.setLatLng([b.lat, b.lng]).addTo(karte).setIcon(pin(fahrt.status === "gelandet" ? "landung" : "live"));
    E("vTitel").textContent = `${fahrt.ballon || "Ballon"}${fahrt.pilot ? " · " + fahrt.pilot : ""}`;
    E("vH").textContent = num(fahrt.hoehe); E("vV").textContent = Number.isFinite(fahrt.speed) ? num(fahrt.speed * 3.6) : "–";
    E("vR").textContent = Number.isFinite(fahrt.kurs) ? Math.round(fahrt.kurs) + "°" : "–"; E("vRu").textContent = Number.isFinite(fahrt.kurs) ? RICHT[Math.round(fahrt.kurs / 45) % 8] : "";
    E("vUtm").textContent = (fahrt.status === "gelandet" ? "Landeplatz: " : "Ballon: ") + utmText(b.lat, b.lng);
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    E("vNav").href = ios ? `https://maps.apple.com/?daddr=${b.lat},${b.lng}` : `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`;
    E("vNav").hidden = false;
    if (ich) {
      const d = km(ich, b), w = peilung(ich, b);
      E("vD").textContent = num(d, d < 10 ? 1 : 0); E("vDu").textContent = "km · " + RICHT[Math.round(w / 45) % 8];
      verbindung.setLatLngs([[ich.lat, ich.lng], [b.lat, b.lng]]);
    }
    if (erstesMal) { karte.fitBounds(ich ? [[b.lat, b.lng], [ich.lat, ich.lng]] : ll.length > 1 ? ll : [[b.lat, b.lng], [b.lat, b.lng]], { padding: [40, 40], maxZoom: 14 }); erstesMal = false; }
    alter();
  }
  function alter() { // Statuszeile: live, verzögert oder gelandet
    if (!fahrt) return;
    if (fahrt.status === "gelandet") return meldung(`Gelandet um ${new Date(fahrt.landung?.zeit || fahrt.zeit).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" })}. Der Link ist damit beendet.`, "ok");
    const s = Math.max(0, Math.round((Date.now() - fahrt.zeit) / 1000)); // die App sendet etwa einmal pro Minute
    if (s < 150) meldung(`● Live · letzte Position vor ${s < 60 ? s + " s" : Math.floor(s / 60) + " min " + (s % 60) + " s"} (Aktualisierung etwa jede Minute)`, "ok");
    else meldung(`⚠ Seit ${Math.floor(s / 60)} min keine neue Position (Funkloch oder App im Hintergrund)`, "warn");
  }
  setInterval(alter, 1000);
  const fehler = t => { E("vTitel").textContent = "Verfolger-Link"; meldung(t, "gef"); };

  // eigene Position nur auf diesem Gerät (Entfernung und Richtung zum Ballon)
  navigator.geolocation?.watchPosition(p => { ich = { lat: p.coords.latitude, lng: p.coords.longitude }; ichM.setLatLng([ich.lat, ich.lng]).addTo(karte); zeigen(); }, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
  // Bildschirm anlassen, solange die Seite offen ist
  const wach = () => navigator.wakeLock?.request("screen").catch(() => {});
  wach(); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") wach(); });

  (async () => {
    if (!/^[A-Za-z0-9]{20,64}$/.test(token)) return fehler("Dieser Link ist unvollständig. Bitte den ganzen Link aus der Nachricht öffnen.");
    if (!cfg.apiKey) return fehler("Die Cloud ist nicht eingerichtet.");
    try {
      const [app, fs] = await Promise.all([import(CDN + "firebase-app.js"), import(CDN + "firebase-firestore.js")]);
      const db = fs.getFirestore(app.initializeApp(cfg));
      meldung("Warte auf die erste Position …");
      fs.onSnapshot(fs.doc(db, "live", token), s => { if (!s.exists()) return fehler("Dieser Verfolger-Link ist abgelaufen oder ungültig."); fahrt = s.data(); zeigen(); },
        () => fehler(fahrt?.status === "gelandet" ? "Die Fahrt ist beendet, der Link ist abgelaufen." : "Dieser Verfolger-Link ist abgelaufen oder ungültig."));
    } catch { fehler("Keine Verbindung. Bitte später erneut öffnen."); }
  })();
})();
