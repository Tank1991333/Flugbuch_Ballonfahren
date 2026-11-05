// „Neu in dieser Version“: nach Update einmal zeigen, neue Nutzer nicht, wieder aufrufbar, nicht hinter der Anmeldung
const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD } = require("./mocks");
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t), ext = [];
  const ctx = async (vorher) => { const c = await b.newContext(devices["Pixel 7"]); await routes(c, ext); await c.addInitScript(GPS); await c.addInitScript(OHNE_CLOUD);
    await c.addInitScript(vorher); const p = await c.newPage(); p.on("pageerror", e => log.push("JS-FEHLER " + e.message)); return p; };
  // Bestehender Nutzer, Update von einer alten Version
  const p = await ctx(() => { sessionStorage.__neuTest = 1; if (sessionStorage.__da) return; sessionStorage.__da = 1; localStorage.willkommen = "1"; localStorage.stammdaten = JSON.stringify({ pilot: "Anna", ballon: "OE-ZAB" }); localStorage.neuGesehen = JSON.stringify("2026-11-04"); });
  await p.goto("http://localhost:8765/"); await p.waitForTimeout(1500);
  ok(await p.isVisible("#neuDlg"), "Nach dem Update erscheint „Neu in dieser Version“");
  const t = await p.textContent("#neuInhalt");
  ok(t.includes("Liter") && !t.includes("Fahrtplanung als PDF"), "Nur die Neuerungen seit der zuletzt gesehenen Version");
  await p.screenshot({ path: __dirname + "/neu-dialog.png" });
  await p.click('#neuDlg button[value="ok"]'); await p.waitForTimeout(200);
  ok(!(await p.isVisible("#neuDlg")) && await p.evaluate(() => JSON.parse(localStorage.neuGesehen) === NEUIGKEITEN[0].id), "„Alles klar“ schließt und merkt die Version");
  await p.reload(); await p.waitForTimeout(1500);
  ok(!(await p.isVisible("#neuDlg")), "Beim nächsten Öffnen nicht noch einmal");
  await p.evaluate(() => zeige("einstellungen")); await p.click("#neuZeigen"); await p.waitForTimeout(200);
  ok(await p.isVisible("#neuDlg") && (await p.textContent("#neuInhalt")).includes("Fahrtplanung als PDF"), "Einstellungen → „Was ist neu?“ zeigt alle Neuerungen");
  await p.keyboard.press("Escape"); await p.waitForTimeout(200); ok(!(await p.isVisible("#neuDlg")), "Mit Zurück/Escape schließbar");
  // Sehr alter Stand: höchstens 3 Abschnitte
  const q = await ctx(() => { sessionStorage.__neuTest = 1; localStorage.willkommen = "1"; localStorage.stammdaten = JSON.stringify({ pilot: "B" }); localStorage.neuGesehen = JSON.stringify("2020-01-01"); });
  await q.goto("http://localhost:8765/"); await q.waitForTimeout(1500);
  ok(await q.isVisible("#neuDlg") && await q.locator("#neuInhalt h3").count() === Math.min(3, await q.evaluate(() => NEUIGKEITEN.length)), "Alter Stand: alle Neuerungen (höchstens 3 Abschnitte)");
  // Bestehender Nutzer ohne Merker (vor Einführung dieses Fensters): zeigt die Neuerungen
  const r = await ctx(() => { sessionStorage.__neuTest = 1; localStorage.removeItem("neuGesehen"); localStorage.willkommen = "1"; localStorage.fluege = JSON.stringify([{ id: "a", startzeit: "2026-01-01T06:00:00Z", flugzeit: 60, landungen: 1 }]); });
  await r.goto("http://localhost:8765/"); await r.waitForTimeout(1500);
  ok(await r.isVisible("#neuDlg"), "Nutzer mit Fahrten, aber ohne Merker: Fenster erscheint");
  // Neuer Nutzer: kein Fenster
  const n = await ctx(() => { sessionStorage.__neuTest = 1; if (!sessionStorage.__da) { sessionStorage.__da = 1; localStorage.removeItem("neuGesehen"); } });
  await n.goto("http://localhost:8765/"); await n.waitForTimeout(1500);
  ok(!(await n.isVisible("#neuDlg")) && await n.isVisible("#willkommen") && await n.evaluate(() => JSON.parse(localStorage.neuGesehen) === NEUIGKEITEN[0].id), "Neuer Nutzer: nur „Willkommen“, kein Neuigkeiten-Fenster");
  // Nicht hinter der Anmeldung: erst nach dem Einlassen
  const c = await b.newContext(devices["Pixel 7"]); await routes(c, ext); await c.addInitScript(GPS);
  await c.addInitScript(() => { sessionStorage.__neuTest = 1; localStorage.willkommen = "1"; localStorage.stammdaten = JSON.stringify({ pilot: "Anna" }); localStorage.neuGesehen = JSON.stringify("2026-11-04"); });
  const DB = new Map(); await c.exposeBinding("__db", (_, op, path, v, merge) => { if (op === "get") return DB.get(path) ?? null; if (op === "list") { const k = path.split("/").length + 1; return [...DB].filter(([x]) => x.startsWith(path + "/") && x.split("/").length === k); } if (op === "set") DB.set(path, merge ? { ...(DB.get(path) || {}), ...v } : v); if (op === "del") DB.delete(path); return null; });
  const g = await c.newPage(); await g.goto("http://localhost:8765/"); await g.waitForTimeout(2000);
  ok(await g.isVisible("#torLogin") && !(await g.isVisible("#neuDlg")), "Vor der Anmeldung kein Fenster über dem Anmeldebildschirm");
  await g.fill("#torEmail", "admin@test.at"); await g.fill("#torPass", "geheim1"); await g.click("#torAn"); await g.waitForTimeout(2500);
  ok(await g.isVisible("#neuDlg"), "Nach der Anmeldung erscheint es");
  // Inhalt: Einträge neueste zuerst, eindeutige IDs
  ok(await g.evaluate(() => NEUIGKEITEN.every((x, i, l) => !i || l[i - 1].id > x.id)), "Einträge sind nach Datum sortiert (neueste zuerst)");
  await b.close();
  ext.filter(x => x.startsWith("UNERWARTET")).forEach(x => log.push("FEHLER " + x));
  console.log(log.join("\n"));
})();
