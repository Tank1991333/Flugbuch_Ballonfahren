const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD } = require("./mocks");
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t);
  const ctx = await b.newContext({ ...devices["Pixel 7"], colorScheme: "dark" }); await routes(ctx, log); await ctx.addInitScript(GPS); await ctx.addInitScript(OHNE_CLOUD);
  await ctx.addInitScript(() => { if (localStorage.fluege) return; const F = [];
    for (let i = 0; i < 8; i++) { const t0 = Date.UTC(2025 + (i < 3 ? 1 : 0), 4 + i, 3, 6), t = Array.from({ length: 20 }, (_, k) => ({ lat: 47.1 + i * .03 + k * .002, lng: 15.9 + k * .003, hoehe: 400, speed: 3, zeit: new Date(t0 + k * 3e5).toISOString() }));
      F.push({ id: "f" + i, startzeit: t[0].zeit, datum: t[0].zeit, flugzeit: 95, strecke: 8 + i, track: t, startLat: t[0].lat, startLng: t[0].lng, landeLat: t[19].lat, landeLng: t[19].lng, startOrt: "Ort" + i, landeOrt: "Ziel" + i, pilot: "A", ballon: "OE-ZZZ", landungen: 1 }); }
    F.push({ id: "m1", startzeit: "2024-06-01T05:00:00Z", flugzeit: 60, strecke: 5, track: [], manuell: true, pilot: "A", ballon: "OE-ZZZ", landungen: 1 });
    localStorage.fluege = JSON.stringify(F); localStorage.stammdaten = JSON.stringify({ pilot: "A", ballon: "OE-ZZZ" }); localStorage.willkommen = "1"; });
  const p = await ctx.newPage(); p.on("pageerror", e => log.push("JS-FEHLER " + e.message)); p.on("dialog", d => { log.push("Dialog: " + d.message()); d.accept(); });
  await p.goto("http://localhost:8765/#karte"); await p.waitForTimeout(900);
  const linien = () => p.evaluate(() => { const s = new Set(); ebene.eachLayer(l => { if (l instanceof L.Polyline && l.options.opacity !== 0 && l.options.color !== "#000") s.add(l.options.color); }); return s.size; });
  ok((await p.textContent("#fwB")) === "Fahrten: alle (8)", "Knopf: " + await p.textContent("#fwB"));
  ok(await linien() === 8, "Alle 8 Fahrten in 8 Farben: " + await linien());
  ok(!(await p.isVisible("#folgeB")), "Folgen ohne Aufzeichnung ausgeblendet");
  await p.click("#fwB"); await p.waitForTimeout(200);
  ok(await p.locator("#fwListe input").count() === 8, "Liste ohne nachgetragene Fahrt ohne GPS");
  await p.click('#fwDlg [data-w="keine"]'); await p.locator("#fwListe input").nth(1).check(); await p.locator("#fwListe input").nth(4).check();
  await p.screenshot({ path: __dirname + "/fw-dialog.png" });
  await p.click('#fwDlg button[value="ok"]'); await p.waitForTimeout(500);
  ok((await p.textContent("#fwB")) === "Fahrten: 2 von 8" && await linien() === 2, "2 ausgewählt: " + await p.textContent("#fwB"));
  await p.screenshot({ path: __dirname + "/fw-karte.png" });
  await p.reload(); await p.waitForTimeout(900);
  ok(await linien() === 2, "Auswahl bleibt nach Neuladen");
  await p.click("#fwB"); await p.click('#fwDlg [data-w="jahr"]'); await p.click('#fwDlg button[value="ok"]'); await p.waitForTimeout(400);
  ok((await p.textContent("#fwB")) === "Fahrten: 3 von 8", "Dieses Jahr (2026): " + await p.textContent("#fwB"));
  await p.click("#fwB"); await p.click('#fwDlg [data-w="5"]'); await p.click('#fwDlg button[value="x"]'); await p.waitForTimeout(300);
  ok((await p.textContent("#fwB")) === "Fahrten: 3 von 8", "Abbrechen ändert nichts");
  await p.click("#playB"); await p.waitForTimeout(800); ok(/Wiedergabe/.test(await p.textContent("#posInfo")), "Wiedergabe der neuesten ausgewählten Fahrt");
  await p.click("#fwB"); await p.click('#fwDlg [data-w="alle"]'); await p.click('#fwDlg button[value="ok"]'); await p.waitForTimeout(400);
  ok((await p.textContent("#fwB")) === "Fahrten: alle (8)" && await p.evaluate(() => localStorage.kartenAuswahl === undefined), "Alle = auch künftige Fahrten");
  // Linie antippen -> Popup
  await p.evaluate(() => { let l; ebene.eachLayer(x => { if (x instanceof L.Polyline && x.options.opacity === 0) l = l || x; }); l.openPopup(); });
  ok((await p.textContent(".leaflet-popup-content")).includes("→"), "Popup zur Linie: " + await p.textContent(".leaflet-popup-content"));
  await b.close(); console.log(log.join("\n"));
})();
