const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD, ALS_ADMIN } = require("./mocks");
const DB = new Map();
const db = (_, op, path, v, merge) => { if (op === "get") return DB.get(path) ?? null; if (op === "list") { const n = path.split("/").length + 1; return [...DB].filter(([k]) => k.startsWith(path + "/") && k.split("/").length === n); } if (op === "set") DB.set(path, merge ? { ...(DB.get(path) || {}), ...v } : v); if (op === "del") DB.delete(path); return null; };
const URL0 = "http://localhost:8765/";
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t), ext = [];
  const neu = async (opt = {}) => { const c = await b.newContext({ ...devices["Pixel 7"], ...opt }); await routes(c, ext); await c.addInitScript(GPS); return c; };
  // ---- B: keine externen Schriften/CDNs, Schriften lokal geladen, Auth ohne iframe ----
  const c1 = await neu(); await c1.addInitScript(OHNE_CLOUD); await c1.addInitScript(() => { localStorage.willkommen = "1"; });
  const reqs = []; c1.on("request", r => reqs.push(r.url()));
  const p = await c1.newPage(); p.on("pageerror", e => log.push("JS-FEHLER " + e.message)); p.on("dialog", d => d.accept());
  await p.goto(URL0); await p.waitForTimeout(800);
  const fo = await p.evaluate(async () => { await document.fonts.ready; await document.fonts.load("700 20px 'Barlow Semi Condensed'"); await document.fonts.load("400 16px Barlow"); return [document.fonts.check("700 20px 'Barlow Semi Condensed'"), document.fonts.check("400 16px Barlow"), [...document.fonts].filter(f => f.status === "loaded").length]; });
  ok(fo[0] && fo[1] && fo[2] >= 2, `Schriften lokal geladen (${fo[2]} Schnitte)`);
  ok(!reqs.some(u => /unpkg|fonts\.g/.test(u)), "Keine Anfragen an unpkg oder Google Fonts");
  ok(reqs.some(u => u.endsWith("/vendor/leaflet/leaflet.js")) && await p.evaluate(() => typeof L === "object" && L.version === "1.9.4"), "Leaflet 1.9.4 aus dem eigenen Projekt");
  // ---- D: Flugbuch-Suche, Jahresfilter, Summen ----
  await p.evaluate(() => {
    const f = (id, t, ort, min, km, l) => ({ id, startzeit: t, flugzeit: min, strecke: km, landungen: l, pilot: "Anna", ballon: "OE-ZAB", startOrt: ort, landeOrt: "Feld" });
    fluege = [f("a", "2025-05-01T06:00:00Z", "Graz", 60, 10, 1), f("b", "2025-06-01T06:00:00Z", "Wien", 90, 20, 2), f("c", "2026-04-01T06:00:00Z", "Graz-Thalerhof", 30, 5, 1)];
    for (let i = 0; i < 70; i++) fluege.push(f("m" + i, "2024-01-01T06:00:00Z", "Linz", 10, 1, 1));
    save("fluege", fluege); render(); zeige("flugbuch");
  });
  const karten = () => p.evaluate(() => document.querySelectorAll("#liste article").length);
  ok(await karten() === 50 && await p.isVisible("#fMehr"), "Lange Liste: erst 50 Fahrten, dann „Weitere anzeigen“");
  await p.click("#fMehr"); ok(await karten() === 73, "Weitere angezeigt: " + await karten());
  await p.selectOption("#fJahr", "2025"); await p.waitForTimeout(100);
  ok(await karten() === 2 && (await p.textContent("#fSumme")).includes("2 Fahrten gefunden · 2h 30m") && (await p.textContent("#fSumme")).includes("3 Landung"), "Jahr 2025: " + await p.textContent("#fSumme"));
  await p.selectOption("#fJahr", ""); await p.fill("#fSuche", "graz"); await p.waitForTimeout(100);
  ok(await karten() === 2, "Suche „graz“ (ohne Groß/Klein): " + await p.textContent("#fSumme"));
  await p.fill("#fSuche", "xyz"); ok((await p.textContent("#liste")).includes("Keine Fahrt passt"), "Kein Treffer wird angezeigt");
  ok(await p.evaluate(() => [...document.querySelectorAll("#fJahr option")].map(o => o.textContent).join(",")) === "Alle Jahre,2026,2025,2024", "Jahresliste aus den Fahrten");
  // ---- D: Einstellungen einklappen, Zustand bleibt ----
  await p.evaluate(() => zeige("einstellungen"));
  const h = '#einstellungen .card:has(#mZ) > h2';
  await p.click(h); ok(!(await p.isVisible("#mZ")) && await p.getAttribute(h, "aria-expanded") === "false", "Karte Aktivitätsmonitor eingeklappt");
  await p.reload(); await p.waitForTimeout(600); await p.evaluate(() => zeige("einstellungen"));
  ok(!(await p.isVisible("#mZ")), "Eingeklappt bleibt nach Neustart");
  await p.focus(h); await p.keyboard.press("Enter"); ok(await p.isVisible("#mZ"), "Mit Tastatur wieder aufgeklappt");
  // ---- D: Karte deutsch, Kartenknöpfe frei ----
  await p.evaluate(() => zeige("karte")); await p.waitForTimeout(400);
  ok(await p.getAttribute(".leaflet-control-zoom-in", "title") === "Vergrößern", "Zoom-Knopf auf Deutsch");
  await p.evaluate(() => { fluege = []; save("fluege", []); render(); zeige("fahrt"); document.getElementById("startB").click(); }); await p.waitForTimeout(800);
  const lage = await p.evaluate(() => { const r = e => document.querySelector(e)?.getBoundingClientRect(); const s = r("#sB"), a = r(".aktionen"), z = r("#fbox .leaflet-control-zoom"), m = r("#fbox"); return { s, a, z, m, sicht: s && s.bottom <= innerHeight }; });
  ok(lage.s && (!lage.a || lage.s.bottom <= lage.a.top || lage.s.top >= lage.a.bottom) && (!lage.z || lage.s.top >= lage.z.bottom) && lage.s.bottom <= lage.m.bottom, "Cockpit-Kartenknöpfe weder von Zoom noch Aktionsleiste verdeckt");
  await p.screenshot({ path: __dirname + "/bcd-cockpit.png" });
  await p.evaluate(() => document.getElementById("stopB").click()); await p.click("#endDlg button[value=ok]").catch(() => {}); await p.waitForTimeout(500);
  // ---- B: Datenschutz-Seite ----
  const ds = await c1.newPage(); const dsErr = []; ds.on("pageerror", e => dsErr.push(e.message)); ds.on("console", m => { if (/CSP|Content Security/.test(m.text())) dsErr.push(m.text()); });
  await ds.goto(URL0 + "datenschutz.html"); ok(!dsErr.length && (await ds.textContent("body")).includes("Open-Meteo") && (await ds.textContent("body")).includes("Deine Rechte"), "Datenschutzerklärung lädt ohne Fehler");
  await ds.setViewportSize({ width: 320, height: 640 }); ok(await ds.evaluate(() => document.documentElement.scrollWidth <= 320), "Datenschutz ohne seitliches Scrollen bei 320 px");
  await c1.close();
  // ---- B: Anmeldefenster mit Hinweis, Auth-Persistenz ----
  const c2 = await neu(); await c2.exposeBinding("__db", db);
  const g = await c2.newPage(); g.on("pageerror", e => log.push("Tor JS-FEHLER " + e.message));
  await g.goto(URL0); await g.waitForTimeout(800);
  ok(await g.isVisible('#torLogin a[href="datenschutz.html"]') && (await g.textContent("#tor")).includes("Digitales Flugbuch"), "Anmeldefenster: Kurzbeschreibung und Link zur Datenschutzerklärung");
  ok(await g.evaluate(() => window.__authInit === 1 && window.__authPersist === 2), "Auth mit initializeAuth (IndexedDB + localStorage, ohne Popup-iframe)");
  await c2.close();
  // ---- C: Fehlerprotokoll ----
  const c3 = await neu(); await c3.addInitScript(ALS_ADMIN); await c3.exposeBinding("__db", db);
  await c3.addInitScript(() => { localStorage.willkommen = "1"; localStorage.zugang = "ahg4hJgbbcflgWxyerVdW7O0vvO2"; localStorage.stammdaten = JSON.stringify({ pilot: "Anna", ballon: "OE-ZAB" }); });
  const a = await c3.newPage(); a.on("dialog", d => d.accept());
  await a.goto(URL0 + "#einstellungen"); await a.waitForTimeout(1500);
  await a.evaluate(() => { setTimeout(() => { throw new Error("Testfehler A"); }); setTimeout(() => { throw new Error("Testfehler A"); }); Promise.reject(new Error("Versprechen B")); }); await a.waitForTimeout(800);
  const fe = () => [...DB].filter(([k]) => k.startsWith("fehler/")).map(([, v]) => v);
  ok(fe().length === 2 && fe().some(x => x.msg.includes("Testfehler A") && x.quelle.includes("Testfehler") && x.uid === "ahg4hJgbbcflgWxyerVdW7O0vvO2") && fe().some(x => x.msg.includes("Versprechen B")), "Fehler gemeldet, doppelte nur einmal (" + fe().map(x => x.msg).join(", ") + ")");
  ok(fe().every(x => !("fluege" in x) && Object.keys(x).every(k => ["uid", "email", "msg", "quelle", "zeit", "version", "geraet"].includes(k))), "Fehlerbericht enthält nur erlaubte Felder");
  await a.evaluate(() => { for (let i = 0; i < 30; i++) setTimeout(() => { throw new Error("Serie " + i); }); }); await a.waitForTimeout(800);
  ok(fe().length <= 10, "Höchstens 10 Fehler je Sitzung: " + fe().length);
  await a.click("#aRefresh"); await a.waitForTimeout(600);
  ok((await a.textContent("#aFehler")).includes("Testfehler A"), "Administrator sieht das Fehlerprotokoll");
  const n0 = fe().length; await a.click('#aFehler button[data-a="fdel"]'); await a.waitForTimeout(500);
  ok(fe().length === n0 - 1, "Einzelnen Fehler als erledigt löschen");
  await a.click('#aFehler button[data-a="falle"]'); await a.waitForTimeout(800);
  ok(fe().length === 0 && (await a.textContent("#aFehler")).includes("Keine Fehler"), "Alle als erledigt löschen");
  // Tageslimit
  await a.evaluate(() => { localStorage.fehlerTag = JSON.stringify({ d: new Date().toISOString().slice(0, 10), n: 20 }); });
  await a.reload(); await a.waitForTimeout(1500); await a.evaluate(() => setTimeout(() => { throw new Error("Über Limit"); })); await a.waitForTimeout(500);
  ok(fe().length === 0, "Tageslimit 20 je Gerät greift");
  // ---- B: Abmelden mit/ohne Gerät leeren (eigener Kontext: Anmeldung nur beim ersten Laden) ----
  const c4 = await neu(); await c4.exposeBinding("__db", db);
  await c4.addInitScript(() => { if (sessionStorage.__gestartet) return; sessionStorage.__gestartet = "1"; sessionStorage.__fakeLogin = "admin@test.at"; localStorage.willkommen = "1"; localStorage.zugang = "ahg4hJgbbcflgWxyerVdW7O0vvO2"; localStorage.stammdaten = JSON.stringify({ pilot: "Anna", ballon: "OE-ZAB" }); });
  const o = await c4.newPage(); await o.goto(URL0 + "#einstellungen"); await o.waitForTimeout(1500);
  await o.evaluate(() => { fluege = [{ id: "z", startzeit: "2026-05-01T06:00:00Z", flugzeit: 30, landungen: 1, pilot: "Anna", ballon: "OE-ZAB" }]; save("fluege", fluege); render(); });
  o.once("dialog", d => d.dismiss()); await o.click("#cOut"); await o.waitForTimeout(800);
  ok(await o.evaluate(() => JSON.parse(localStorage.fluege || "[]").length === 1), "Nur abmelden: Daten bleiben auf dem Gerät");
  await o.evaluate(() => { sessionStorage.__fakeLogin = "admin@test.at"; }); await o.reload(); await o.waitForTimeout(1500);
  await o.evaluate(() => { fluege.push({ id: "y", startzeit: "2026-05-02T06:00:00Z", flugzeit: 20, landungen: 1, pilot: "Anna", ballon: "OE-ZAB" }); save("fluege", fluege); }); // gerade erst eingetragen, noch nicht hochgeladen
  o.once("dialog", d => d.accept()); await o.click("#cOut"); await o.waitForTimeout(2500);
  const lz = await o.evaluate(() => Object.keys(localStorage).join(","));
  ok(!/fluege|stammdaten|zugang/.test(lz) && DB.has("users/ahg4hJgbbcflgWxyerVdW7O0vvO2/fluege/y"), `Abmelden + Gerät leeren: zuletzt Eingetragenes hochgeladen, Gerät leer (übrig: ${lz || "nichts"})`);
  ok(await o.isVisible("#torLogin"), "Danach Anmeldebildschirm");
  await b.close();
  ext.filter(x => x.startsWith("UNERWARTET")).forEach(x => log.push("FEHLER " + x));
  console.log(log.join("\n"));
})();
