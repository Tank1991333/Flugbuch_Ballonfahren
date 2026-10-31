const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD } = require("./mocks");
const fs = require("fs");
const OUT = __dirname + "/shots/";
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t);
  for (const [name, d] of [["Pixel 7", devices["Pixel 7"]], ["Desktop", { viewport: { width: 1366, height: 800 } }]]) {
    log.push("=== " + name);
    const ctx = await b.newContext({ ...d, locale: "de-AT", timezoneId: "Europe/Vienna", acceptDownloads: true });
    await routes(ctx, log); await ctx.addInitScript(GPS); await ctx.addInitScript(OHNE_CLOUD);
    const p = await ctx.newPage(); let dialoge = [];
    p.on("pageerror", e => log.push("JS-FEHLER: " + e.message));
    p.on("console", m => { if (m.type() === "error") log.push("console.error: " + m.text()); });
    p.on("dialog", dl => { dialoge.push(dl.message()); dl.accept(); });
    await p.goto("http://localhost:8765/"); await p.waitForTimeout(500);
    const nav = async s => { await p.click("#menuB"); await p.waitForTimeout(300); await p.click(`nav button[data-s="${s}"]`); await p.waitForTimeout(300); };
    // 1. Fahrt ohne Pilot -> Hinweis
    await nav("fahrt");
    ok(await p.isDisabled("#startB"), "Start ohne Pilot/Ballon gesperrt");
    // 2. Einstellungen
    await nav("einstellungen");
    await p.fill("#pilot", "Anna Pilotin"); await p.press("#pilot", "Tab");
    await p.fill("#ballon", "oe-zab"); await p.press("#ballon", "Tab");
    await p.fill("#volumen", "3000"); await p.press("#volumen", "Tab");
    await p.fill("#leergewicht", "300"); await p.press("#leergewicht", "Tab");
    await p.fill("#maxtemp", "120"); await p.press("#maxtemp", "Tab");
    const st = await p.evaluate(() => JSON.parse(localStorage.stammdaten));
    ok(st.ballon === "OE-ZAB" && st.ausruestung?.length === 1, "Pilot/Ballon gespeichert, Ballon in Ausrüstung übernommen");
    // 3. Gasflasche anlegen + nachfüllen
    await nav("gas"); await p.click("#fNeu");
    await p.fill("#fName", "Flasche A"); await p.fill("#fKap", "40"); await p.fill("#fTara", "28"); await p.fill("#fFuell", "30"); await p.fill("#fPruef", "2026-11-05");
    await p.click("#fDlg button[value=ok]"); await p.waitForTimeout(200);
    ok((await p.textContent("#fListe")).includes("Flasche A"), "Gasflasche angelegt");
    await p.click('#fListe button[data-a="fill"]'); await p.fill("#nPreis", "19.5"); await p.click("#nDlg button[value=ok]"); await p.waitForTimeout(200);
    const fl = await p.evaluate(() => JSON.parse(localStorage.stammdaten).flaschen[0]);
    ok(fl.fuell === "40", "Nachfüllen auf 40 kg (ist: " + fl.fuell + ")");
    ok((await p.textContent("#gLog")).includes("€"), "Nachfüllung mit Preis im Verlauf");
    // 4. Fahrzeug
    await nav("ausruestung"); await p.click("#vNeu"); await p.fill("#vName", "VW Bus"); await p.fill("#vPruef", "2026-11-01"); await p.click("#vDlg button[value=ok]");
    await nav("dashboard"); ok(!(await p.isHidden("#termine")) && (await p.textContent("#termine")).includes("VW Bus"), "Termin-Hinweis auf Startseite");
    // 5. Trajektoren
    await nav("trajektoren"); await p.waitForTimeout(400);
    await p.fill("#tSuche", "Graz"); await p.click("#tSucheB"); await p.waitForTimeout(400);
    ok((await p.textContent("#tOrt")).includes("Graz"), "Ortssuche");
    await p.click("#tAlle"); await p.click("#tRun"); await p.waitForTimeout(800);
    const ts = await p.textContent("#tStatus"); ok(/berechnet/.test(ts), "Trajektorien: " + ts);
    // 6. Fahrtplanung
    await nav("rechner"); await p.waitForTimeout(300);
    await p.check("#gSel input"); await p.fill("#zList .zrow:nth-of-type(2) .zk", "80"); await p.fill("#zList .zrow:nth-of-type(3) .zk", "75");
    await p.waitForTimeout(200);
    const erg = await p.textContent("#rErg"); ok(/Freier Auftrieb/.test(erg), "Auftrieb berechnet");
    const chk = await p.textContent("#pCheck"); ok(!chk.includes("✕ Trajektoren"), "Checkliste: Trajektoren übernommen");
    for (const c of await p.$$("#pCheck input")) await c.check();
    dialoge = [];
    await p.click("#pStart"); await p.waitForTimeout(600);
    ok(await p.evaluate(() => !!aktiv && !!aktiv.f.plan), "Fahrt aus Planung gestartet, Planung angehängt" + (dialoge.length ? " (Rückfrage: " + dialoge[0].split("\n")[1] + ")" : ""));
    // 7. Fahrt simulieren
    for (let i = 1; i <= 40; i++) { await p.evaluate(i => { __gps(47.07 + i * 0.0015, 15.44 + i * 0.002, 400 + i * 15, 5); }, i); if (i === 20) await p.click("#mB"); await p.waitForTimeout(20); }
    await p.evaluate(() => { aktiv.f.startzeit = new Date(Date.now() - 45 * 6e4).toISOString(); aktiv.t.forEach((q, i) => q.zeit = new Date(Date.now() - (45 - i) * 6e4).toISOString()); liveAnzeige(); });
    await p.waitForTimeout(1100);
    ok(+(await p.textContent("#kH")) > 900, "Live-Höhe angezeigt: " + await p.textContent("#kH"));
    ok(/km/.test(await p.textContent("#sStrecke")) && (await p.textContent("#sStrecke")) !== "0,00 km", "Strecke live: " + await p.textContent("#sStrecke"));
    await p.screenshot({ path: OUT + name.replace(/\W/g, "_") + "-fahrt-laeuft.png" });
    // Neuladen während der Fahrt -> Fortsetzen
    dialoge = []; await p.reload(); await p.waitForTimeout(700);
    ok(dialoge.some(x => x.includes("unterbrochene Fahrt")) && await p.evaluate(() => !!aktiv && aktiv.t.length > 30), "Neuladen: unterbrochene Fahrt fortgesetzt (" + await p.evaluate(() => aktiv?.t.length) + " Punkte)");
    // 8. Landung
    await p.click("#stopB"); await p.waitForTimeout(200);
    ok(await p.isVisible("#endDlg"), "Landedialog offen");
    const gasF = await p.$$("#gasZeilen input.gk"); ok(gasF.length >= 1, "Gaszeile je geplanter Flasche: " + gasF.length);
    if (gasF[0]) await gasF[0].fill("12.5");
    await p.fill("#landungen", "2"); await p.fill("#bemerkung", "Test <b>fett</b>");
    await p.click("#endDlg button[value=ok]"); await p.waitForTimeout(500);
    const f = await p.evaluate(() => fluege.at(-1));
    ok(f && f.landungen === 2 && f.gas === 12.5 && f.punkte > 30 && !f.track && f.marken?.length === 1 && f.plan?.traj, `Fahrt gespeichert (Landungen ${f?.landungen}, Gas ${f?.gas}, Punkte ${f?.punkte} (IndexedDB), Marken ${f?.marken?.length}, Plan ${!!f?.plan})`);
    ok(await p.evaluate(() => JSON.parse(localStorage.stammdaten).flaschen[0].fuell) === "27.5", "Gas von Flasche abgebucht (40 → 27,5)");
    ok(await p.evaluate(() => !localStorage.aktiveFahrt && !localStorage.planTraj), "aktive Fahrt und Plan-Trajektorien zurückgesetzt");
    ok(!(await p.innerHTML("#liste")).includes("<b>fett</b>"), "Bemerkung wird escaped");
    ok((await p.textContent("#liste")).includes("Testort"), "Orte per Nominatim nachgeladen");
    await p.click("#liste details summary"); await p.screenshot({ path: OUT + name.replace(/\W/g, "_") + "-flugbuch.png", fullPage: true });
    // 9. Bearbeiten
    await p.click('#liste button[data-a="edit"]'); await p.fill("#eLand", "3"); await p.click("#dlg button[value=ok]"); await p.waitForTimeout(200);
    ok(await p.evaluate(() => fluege.at(-1).landungen) === 3, "Fahrt bearbeiten");
    // 10. GPX-Export und -Import
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click('#liste button[data-a="gpx"]')]);
    const gpx = fs.readFileSync(await dl.path(), "utf8"); ok(gpx.includes("<trkpt") && gpx.includes("<wpt"), "GPX-Export (" + dl.suggestedFilename() + ")");
    await nav("einstellungen"); dialoge = [];
    await p.setInputFiles("#imp", { name: "fahrt.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(gpx) });
    await p.waitForTimeout(300); ok(dialoge.some(x => x.includes("bereits")), "GPX-Reimport erkennt Duplikat: " + dialoge[0]);
    const igc = "HFDTE201026\n" + Array.from({ length: 5 }, (_, i) => `B07${String(i).padStart(2, "0")}004710000N01600000EA0050000600`).join("\n");
    dialoge = []; await p.setInputFiles("#imp", { name: "x.igc", mimeType: "text/plain", buffer: Buffer.from(igc) }); await p.waitForTimeout(300);
    ok(dialoge.some(x => x.includes("importiert")), "IGC-Import: " + dialoge[0]);
    const [bk] = await Promise.all([p.waitForEvent("download"), p.click("#expB")]);
    const bj = JSON.parse(fs.readFileSync(await bk.path(), "utf8")); ok(bj.fluege.length === 2, "Backup-Export");
    dialoge = []; await p.setInputFiles("#imp", { name: "b.json", mimeType: "application/json", buffer: fs.readFileSync(await bk.path()) }); await p.waitForTimeout(300);
    ok(dialoge.some(x => x.startsWith("0 neue")), "Backup-Import ohne Duplikate: " + dialoge[0]);
    // 11. Karte + Wiedergabe
    await nav("flugbuch"); await p.click('#liste button[data-a="play"]'); await p.waitForTimeout(1500);
    ok(/Wiedergabe/.test(await p.textContent("#posInfo")), "Wiedergabe läuft: " + await p.textContent("#posInfo"));
    await p.click("#sB").catch(() => {}); 
    await nav("wetter"); await p.waitForTimeout(400); ok((await p.textContent("#wetterBox")).includes("günstig"), "Wetter angezeigt");
    // 12. Theme
    const t0 = await p.evaluate(() => document.documentElement.dataset.theme); await p.click("#themeB");
    ok(await p.evaluate(() => document.documentElement.dataset.theme) !== t0, "Design umschalten");
    // 13. Löschen
    await nav("flugbuch"); const n0 = await p.evaluate(() => fluege.length); await p.click('#liste button[data-a="del"]'); await p.waitForTimeout(200);
    ok(await p.evaluate(() => fluege.length) === n0 - 1 && await p.evaluate(() => JSON.parse(localStorage.geloescht).length) === 1, "Fahrt löschen + Löschmarke");
    await ctx.close();
  }
  await b.close(); console.log(log.join("\n"));
})();
