const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD } = require("./mocks");
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t);
  for (const [n, d, th] of [["Pixel 7", devices["Pixel 7"], "dark"], ["Klein 320", { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "light"]]) {
    const ctx = await b.newContext({ ...d, colorScheme: th, acceptDownloads: true }); await routes(ctx, []); await ctx.addInitScript(GPS); await ctx.addInitScript(OHNE_CLOUD);
    const p = await ctx.newPage(); p.on("pageerror", e => log.push("JS-FEHLER " + e.message));
    await p.goto("http://localhost:8765/"); await p.waitForTimeout(500);
    ok(!(await p.isVisible("#backupH")), n + ": ohne Fahrten keine Erinnerung");
    ok((await p.textContent("#willkommen")).includes("ohne Gewähr"), n + ": Nutzungshinweis in den Ersten Schritten");
    await p.screenshot({ path: `${__dirname}/hinweis-${n.replace(/\W/g, "")}.png`, fullPage: true });
    await p.evaluate(() => { localStorage.setItem("willkommen", "1"); fluege.push({ id: "a", startzeit: "2026-10-01T06:00:00Z", flugzeit: 60, strecke: 5, landungen: 1, pilot: "A", ballon: "OE-X" }); save("fluege", fluege); willkommen(false); render(); });
    ok(await p.isVisible("#backupH") && (await p.textContent("#backupT")).includes("noch kein"), n + ": Erinnerung bei Fahrten ohne Backup");
    await p.locator("#backupH").screenshot({ path: `${__dirname}/backup-${n.replace(/\W/g, "")}.png` });
    await p.click("#backupSpaeterB"); ok(!(await p.isVisible("#backupH")), n + ": „Später“ blendet aus");
    await p.evaluate(() => localStorage.setItem("backupSpaeter", String(Date.now() - 1))); await p.evaluate(() => render());
    ok(await p.isVisible("#backupH"), n + ": nach 7 Tagen wieder sichtbar");
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#backupJetzt")]);
    ok(dl.suggestedFilename().startsWith("ballonflugbuch-") && !(await p.isVisible("#backupH")), n + ": „Jetzt sichern“ lädt Backup und blendet aus");
    await p.evaluate(() => zeige("einstellungen")); ok((await p.textContent("#backupInfo")).includes("Letztes Backup"), n + ": " + await p.textContent("#backupInfo"));
    ok((await p.textContent("#einstellungen")).includes("ohne Gewähr"), n + ": Nutzungshinweis unter Datenschutz & Info");
    await p.evaluate(() => { localStorage.setItem("letztesBackup", String(Date.now() - 31 * 864e5)); zeige("dashboard"); render(); });
    ok(await p.isVisible("#backupH") && (await p.textContent("#backupT")).includes("31 Tage"), n + ": " + await p.textContent("#backupT"));
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), n + ": kein Überlauf");
    await ctx.close();
  }
  await b.close(); console.log(log.join("\n"));
})();
