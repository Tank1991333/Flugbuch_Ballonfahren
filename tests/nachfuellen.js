// Nachfüllungen nachträglich bearbeiten, Flasche wechseln, löschen; Füllstand passt sich an (wahlweise)
const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD } = require("./mocks");
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t), ext = [];
  const c = await b.newContext(devices["Pixel 7"]); await routes(c, ext); await c.addInitScript(GPS); await c.addInitScript(OHNE_CLOUD);
  await c.addInitScript(() => { if (sessionStorage.__da) return; sessionStorage.__da = 1; localStorage.willkommen = "1";
    localStorage.stammdaten = JSON.stringify({ pilot: "Anna", ballon: "OE-ZAB",
      flaschen: [{ id: "f1", name: "Flasche 1", kap: "40", fuell: "30" }, { id: "f2", name: "Flasche 2", kap: "40", fuell: "10" }],
      gasLog: [{ id: "n1", datum: "2026-10-01", flasche: "f1", kg: 20, preis: "30", notiz: "Tankstelle" }, ...Array.from({ length: 10 }, (_, i) => ({ id: "a" + i, datum: "2025-0" + (i % 9 + 1) + "-01", flasche: "f2", kg: 5 }))] }); });
  const p = await c.newPage(); p.on("pageerror", e => log.push("JS-FEHLER " + e.message)); const dlg = []; p.on("dialog", d => { dlg.push(d.message()); d.accept(); });
  await p.goto("http://localhost:8765/"); await p.waitForTimeout(500); await p.evaluate(() => zeige("gas")); await p.waitForTimeout(200);
  const st = () => p.evaluate(() => ({ f1: +stamm.flaschen[0].fuell, f2: +stamm.flaschen[1].fuell, n: stamm.gasLog.length, n1: stamm.gasLog.find(x => x.id === "n1") }));
  ok(await p.locator("#gLog .nbearb").count() === 8 && await p.isVisible("#gLogMehr"), "Erst 8 Einträge mit ✎, dazu „Alle anzeigen“");
  await p.click("#gLogMehr"); ok(await p.locator("#gLog .nbearb").count() === 11, "Alle 11 Nachfüllungen sichtbar");
  // Menge ändern 20 -> 25: Flasche 1 von 30 auf 35
  await p.click('#gLog .nbearb[data-id="n1"]'); await p.waitForTimeout(100);
  ok(await p.textContent("#nTitel") === "Nachfüllung bearbeiten" && await p.inputValue("#nKg") === "20" && await p.inputValue("#nNotiz") === "Tankstelle" && await p.inputValue("#nDatum") === "2026-10-01" && await p.isVisible("#nDel"), "Dialog mit vorhandenen Werten");
  await p.fill("#nKg", "25"); await p.fill("#nPreis", "37.5"); await p.fill("#nDatum", "2026-09-30"); await p.click('#nDlg button[value="ok"]'); await p.waitForTimeout(200);
  let s = await st();
  ok(s.n1.kg === 25 && s.n1.preis === "37.5" && s.n1.datum === "2026-09-30" && s.f1 === 35 && s.n === 11, `Menge, Preis und Datum geändert, Füllstand +5 kg (${s.f1} kg)`);
  ok((await p.textContent("#gLog")).includes("30.9.2026") || (await p.textContent("#gLog")).includes("30.09.2026"), "Liste zeigt das neue Datum");
  // Flasche wechseln: 25 kg von Flasche 1 nach Flasche 2
  await p.click('#gLog .nbearb[data-id="n1"]'); await p.selectOption("#nFl", "f2"); await p.click('#nDlg button[value="ok"]'); await p.waitForTimeout(200);
  s = await st(); ok(s.n1.flasche === "f2" && s.f1 === 10 && s.f2 === 35, `Flasche gewechselt: Flasche 1 ${s.f1} kg, Flasche 2 ${s.f2} kg`);
  // Ohne Anpassung des Füllstands
  await p.click('#gLog .nbearb[data-id="n1"]'); await p.fill("#nKg", "30"); await p.uncheck("#nAnp"); await p.click('#nDlg button[value="ok"]'); await p.waitForTimeout(200);
  s = await st(); ok(s.n1.kg === 30 && s.f2 === 35, "Häkchen aus: nur der Eintrag ändert sich, Füllstand bleibt");
  // Obergrenze: nicht über das Fassungsvermögen
  await p.click('#gLog .nbearb[data-id="n1"]'); await p.fill("#nKg", "50"); await p.click('#nDlg button[value="ok"]'); await p.waitForTimeout(200);
  s = await st(); ok(s.f2 === 40, "Füllstand höchstens bis zum Fassungsvermögen (" + s.f2 + " kg)");
  // Abbrechen ändert nichts
  await p.click('#gLog .nbearb[data-id="n1"]'); await p.fill("#nKg", "1"); await p.click('#nDlg button[value="x"]'); await p.waitForTimeout(200);
  s = await st(); ok(s.n1.kg === 50, "Abbrechen ändert nichts");
  // Ungültige Menge
  dlg.length = 0; await p.click('#gLog .nbearb[data-id="n1"]'); await p.fill("#nKg", "0"); await p.click('#nDlg button[value="ok"]'); await p.waitForTimeout(200);
  s = await st(); ok(s.n1.kg === 50 && dlg.some(m => m.includes("Menge")), "Menge 0 wird abgelehnt");
  // Löschen: Füllstand -50 kg (nicht unter 0)
  dlg.length = 0; await p.click('#gLog .nbearb[data-id="n1"]'); await p.click("#nDel"); await p.waitForTimeout(200);
  s = await st(); ok(!s.n1 && s.n === 10 && s.f2 === 0 && dlg.some(m => m.includes("löschen")), `Gelöscht nach Rückfrage, Füllstand ${s.f2} kg (nicht unter 0)`);
  // Neue Nachfüllung funktioniert wie bisher
  await p.click('#fListe button[data-a="fill"][data-id="f1"]'); await p.waitForTimeout(100);
  ok(await p.textContent("#nTitel") === "Nachfüllen" && !(await p.isVisible("#nDel")) && !(await p.isVisible("#nFlK")), "Neu nachfüllen: ohne Löschen und Flaschenwahl");
  await p.fill("#nKg", "5"); await p.click('#nDlg button[value="ok"]'); await p.waitForTimeout(200);
  s = await st(); ok(s.n === 11 && s.f1 === 15, "Neue Nachfüllung: Flasche 1 " + s.f1 + " kg");
  // Eintrag einer gelöschten Flasche lässt sich noch bearbeiten
  await p.evaluate(() => { stamm.gasLog.push({ id: "alt", datum: "2027-01-01", flasche: "weg", kg: 3 }); save("stammdaten", stamm); render(); });
  await p.click('#gLog .nbearb[data-id="alt"]'); ok((await p.textContent("#nFl")).includes("(gelöscht)"), "Gelöschte Flasche wird als „(gelöscht)“ angeboten");
  await p.fill("#nKg", "4"); await p.click('#nDlg button[value="ok"]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => stamm.gasLog.find(x => x.id === "alt").kg === 4), "Eintrag ohne vorhandene Flasche gespeichert");
  await p.reload(); await p.waitForTimeout(400);
  ok(await p.evaluate(() => stamm.gasLog.length === 12 && +stamm.flaschen[0].fuell === 15), "Nach Neustart gespeichert");
  await b.close();
  ext.filter(x => x.startsWith("UNERWARTET")).forEach(x => log.push("FEHLER " + x));
  console.log(log.join("\n"));
})();
