const fs = require("fs"), path = require("path");
const S = __dirname; // Firebase-Attrappen liegen in tests/fakefb
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");
function meteo(url) {
  const u = new URL(url);
  if (u.pathname.includes("elevation")) return { elevation: [312] };
  if (u.searchParams.get("current")) return { current: { temperature_2m: 12.3, wind_speed_10m: 8, wind_direction_10m: 250, wind_gusts_10m: 14, wind_speed_80m: 18 }, daily: { sunrise: ["2026-10-26T06:45"], sunset: ["2026-10-26T16:40"] } };
  const vars = u.searchParams.get("hourly").split(","), t0 = new Date(); t0.setUTCHours(0, 0, 0, 0);
  const time = Array.from({ length: 48 }, (_, i) => new Date(t0.getTime() + i * 36e5).toISOString().slice(0, 16));
  const hourly = { time };
  vars.forEach(v => { const m = v.match(/(\d+)hPa/); hourly[v] = time.map((_, i) => v.startsWith("geopotential") ? (1000 - +m[1]) * 9 + 110 : v.includes("direction") ? 240 + i % 20 : 10 + (i % 7)); });
  return { elevation: 312, hourly };
}
async function routes(ctx, log) {
  await ctx.route(/^https?:\/\/(?!localhost)/, async r => {
    const url = r.request().url(), h = new URL(url).hostname;
    const j = o => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(o) });
    if (h === "www.gstatic.com" && url.includes("firebasejs")) return r.fulfill({ status: 200, headers: { "access-control-allow-origin": "*", "content-type": "application/javascript" }, body: fs.readFileSync(S + "/fakefb/" + url.split("/").at(-1)) });
    if (/tile|arcgisonline/.test(h)) return r.fulfill({ status: 200, contentType: "image/png", headers: { "access-control-allow-origin": "*" }, body: PNG });
    if (h === "api.open-meteo.com") return j(meteo(url));
    if (h === "nominatim.openstreetmap.org") return j(url.includes("search") ? [{ lat: "47.07", lon: "15.44", display_name: "Graz, Steiermark" }] : { address: { town: "Testort" } });
        log.push("UNERWARTET extern: " + url); return r.abort();
  });
}
// GPS-Attrappe: Positionen mit Höhe, Tempo, Kurs; über window.__gps(lat,lng,alt,speed) steuerbar
const GPS = `(() => {
  const w = new Map(); let n = 0, last = { latitude: 47.17, longitude: 16.01, altitude: 320, speed: 0, heading: 90, accuracy: 6 };
  const ev = () => ({ coords: { ...last }, timestamp: Date.now() });
  window.__gps = (lat, lng, alt, sp) => { last = { ...last, latitude: lat, longitude: lng, altitude: alt, speed: sp }; w.forEach(f => f(ev())); };
  Object.defineProperty(navigator, "geolocation", { value: {
    getCurrentPosition: (ok) => setTimeout(() => ok(ev()), 50),
    watchPosition: (ok) => { const id = ++n; w.set(id, ok); setTimeout(() => ok(ev()), 50); return id; },
    clearWatch: id => w.delete(id) } });
})();`;
// App ohne Cloud (keine Anmelde-Sperre) für Tests, die nur die App selbst prüfen
const OHNE_CLOUD = () => { Object.defineProperty(window, "FIREBASE_CONFIG", { get: () => ({}), set() {} }); };
// mit Firebase bereits als Administrator angemeldet starten
const ALS_ADMIN = () => { if (!sessionStorage.getItem("__fakeLogin")) sessionStorage.setItem("__fakeLogin", "admin@test.at"); };
module.exports = { routes, GPS, OHNE_CLOUD, ALS_ADMIN };
