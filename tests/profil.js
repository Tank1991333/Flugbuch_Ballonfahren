const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD } = require("./mocks");
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t);
  const tag = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  for (const [n, dv, th] of [["Pixel 7", devices["Pixel 7"], "dark"], ["Klein 320", { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "light"]]) {
    const ctx = await b.newContext({ ...dv, colorScheme: th, locale: "de-AT" }); await routes(ctx, log); await ctx.addInitScript(GPS); await ctx.addInitScript(OHNE_CLOUD);
    await ctx.addInitScript(([w, f]) => { if (localStorage.stammdaten) return; localStorage.willkommen = "1"; localStorage.stammdaten = JSON.stringify({ pilot: "Max Muster", ballon: "OE-ZZZ", ausruestung: [{ id: "g", ballon: "OE-ZZZ", wartung: w }], flaschen: [{ id: "f", name: "Flasche 1", pruefung: f }] }); }, [tag(200), tag(-3)]);
    const p = await ctx.newPage(); p.on("pageerror", e => log.push("JS-FEHLER " + e.message));
    await p.goto("http://localhost:8765/"); await p.waitForTimeout(500);
    const t0 = (await p.textContent("#termine")).replace(/\u00a0/g, " ");
    ok(t0.includes("noch 200 Tage") && t0.includes("überfällig seit 3 Tagen") && await p.evaluate(() => document.getElementById("termine").classList.contains("dringend")), n + ": Alle Fristen mit Resttagen, auch über 4 Wochen");
    await p.evaluate(() => zeige("einstellungen"));
    ok(await p.getAttribute("#prName", "placeholder") === "Max Muster", "Name-Platzhalter = Pilot");
    await p.fill("#prName", "Max Muster"); await p.press("#prName", "Tab");
    await p.fill("#prLizenz", "AT.FCL.12345"); await p.press("#prLizenz", "Tab");
    await p.fill("#prCheck", tag(45)); await p.fill("#prMedical", tag(10));
    await p.click("#prNeu"); await p.fill("#prEigene .prow:last-child .pn", "Funkzeugnis"); await p.fill("#prEigene .prow:last-child .pw", "BZF-778"); await p.press("#prEigene .prow:last-child .pw", "Tab");
    await p.click("#prNeu"); await p.fill("#prEigene .prow:last-child .pn", "Lizenz gültig bis"); await p.fill("#prEigene .prow:last-child .pd", tag(1));
    await p.click("#prNeu"); // leerer Eintrag wird nicht gespeichert
    await p.fill("#prEigene .prow:nth-child(2) .pn", "Lizenz gültig bis"); await p.press("#prEigene .prow:nth-child(2) .pn", "Tab");
    await p.waitForTimeout(200);
    const pr = await p.evaluate(() => stamm.profil);
    ok(pr.name === "Max Muster" && pr.lizenz === "AT.FCL.12345" && pr.eigene.length === 2, `Profil gespeichert (${pr.eigene.length} eigene Einträge)`);
    await p.locator("#prK").screenshot({ path: `${__dirname}/profil-${n.replace(/\W/g, "")}.png` });
    await p.evaluate(() => zeige("dashboard")); await p.waitForTimeout(200);
    const t = (await p.textContent("#termine")).replace(/\u00a0/g, " ");
    ok(t.includes("Pilot & Fristen") && t.includes("Lizenz AT.FCL.12345") && t.includes("Funkzeugnis: BZF-778"), "Startseite: Kopf mit Name, Lizenz, Info");
    ok(t.includes("Medical") && t.includes("noch 10 Tage") && t.includes("Checkfahrt") && t.includes("noch 45 Tage") && t.includes("Lizenz gültig bis") && t.includes("noch 1 Tag"), "Startseite: Checkfahrt, Medical, eigene Frist");
    const order = await p.evaluate(() => [...document.querySelectorAll("#termine .zeile span")].map(s => s.textContent.split(":")[0]));
    ok(order[0].startsWith("Flasche") && order[1].startsWith("Lizenz") && order.at(-1).includes("Wartung"), "Sortierung nach Dringlichkeit: " + order.join(" | "));
    await p.locator("#termine").screenshot({ path: `${__dirname}/fristen-${n.replace(/\W/g, "")}.png` });
    await p.evaluate(() => zeige("einstellungen")); await p.click("#prEigene .prow:first-child .zx"); await p.waitForTimeout(200);
    ok(await p.evaluate(() => stamm.profil.eigene.length) === 1, "Eintrag entfernen");
    await p.reload(); await p.waitForTimeout(400); ok(await p.inputValue("#prLizenz") === "AT.FCL.12345" && await p.locator("#prEigene .prow").count() === 1, "Nach Neuladen erhalten");
    const scroll = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth); ok(!scroll, "kein horizontales Scrollen");
    await ctx.close();
  }
  await b.close(); console.log(log.join("\n"));
})();
