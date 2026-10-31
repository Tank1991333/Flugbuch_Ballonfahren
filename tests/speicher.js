const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD } = require("./mocks");
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t);
  const ctx = await b.newContext(devices["Pixel 7"]); await routes(ctx, []); await ctx.addInitScript(GPS); await ctx.addInitScript(OHNE_CLOUD);
  const p = await ctx.newPage(), dialoge = []; p.on("dialog", d => { dialoge.push(d.message()); d.accept(); }); p.on("pageerror", e => log.push("JS-FEHLER " + e.message));
  await p.goto("http://localhost:8765/#einstellungen"); await p.waitForTimeout(400);
  log.push("Anzeige leer: " + await p.textContent("#speicher"));
  // Speicher bis kurz vor die Grenze füllen
  const voll = await p.evaluate(() => { let n = 0, s = "x".repeat(250000); try { for (;;) { localStorage.setItem("füll" + n, s); n++; } } catch {} return n * 250000; });
  log.push("Browser-Grenze bei ca. " + (voll / 1e6).toFixed(1) + " Mio. Zeichen");
  await p.evaluate(() => { stamm.pilot = "A"; stamm.ballon = "OE-X"; localStorage.removeItem("füll0"); render(); ui(); }); // etwas Platz für den Start
  log.push("Anzeige voll: " + await p.textContent("#speicher"));
  await p.evaluate(() => zeige("dashboard")); ok(await p.isVisible("#speicherWarn"), "Warnung auf der Startseite: " + await p.textContent("#speicherWarn"));
  await p.evaluate(() => zeige("fahrt")); await p.click("#startB"); await p.waitForTimeout(400);
  for (let i = 0; i < 3000; i++) await p.evaluate(i => __gps(47 + i * 1e-4, 16 + i * 1e-4, 500 + i % 50, 5), i);
  await p.evaluate(() => { let n = 0; try { for (;;) localStorage.setItem("rest" + n++, "y".repeat(20000)); } catch {} });
  await p.evaluate(() => { lastSave = 0; punkt({ coords: { latitude: 47.5, longitude: 16.5, altitude: 600, speed: 5, heading: 90, accuracy: 5 }, timestamp: Date.now() }); });
  ok(dialoge.length === 0, "Keine Hinweisfenster während der Fahrt (" + dialoge.length + ")");
  ok((await p.textContent("#status")).includes("Gerätespeicher voll"), "Statushinweis: " + await p.textContent("#status"));
  ok(await p.evaluate(() => aktiv.t.length) > 2900, "Aufzeichnung läuft weiter: " + await p.evaluate(() => aktiv.t.length) + " Punkte");
  const pt = await p.evaluate(() => JSON.stringify(aktiv.t[5]));
  ok(pt.length < 130, "Punkt gerundet (" + pt.length + " Zeichen): " + pt);
  await b.close(); console.log(log.join("\n"));
})();
