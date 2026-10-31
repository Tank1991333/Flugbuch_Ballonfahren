"use strict";
// Gemeinsame Geo-Funktionen für Flugbuch und Verfolger-Ansicht
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

// Leaflet-Knöpfe auf Deutsch (Tooltips und Vorlese-Text)
if (window.L) L.Control.Zoom.mergeOptions({ zoomInTitle: "Vergrößern", zoomOutTitle: "Verkleinern" });
