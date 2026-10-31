const { chromium, devices } = require("playwright");
const { routes, GPS } = require("./mocks");
const DB = new Map();
const db = (_, op, path, v, merge) => { if (op === "get") return DB.get(path) ?? null; if (op === "list") { const n = path.split("/").length + 1; return [...DB].filter(([k]) => k.startsWith(path + "/") && k.split("/").length === n); } if (op === "set") DB.set(path, merge ? { ...(DB.get(path) || {}), ...v } : v); if (op === "del") DB.delete(path); return null; };
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t);
  for (const [n, d, th] of [["Pixel 7", devices["Pixel 7"], "dark"], ["Klein 320", { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "light"], ["Desktop", { viewport: { width: 1300, height: 800 } }, "light"]]) {
    const ctx = await b.newContext({ ...d, colorScheme: th }); await routes(ctx, log); await ctx.addInitScript(GPS); await ctx.exposeBinding("__db", db);
    const p = await ctx.newPage(); p.on("pageerror", e => log.push("JS-FEHLER " + e.message));
    await p.goto("http://localhost:8765/#fahrt"); await p.waitForTimeout(900);
    ok(await p.isVisible("#torLogin") && !(await p.isVisible("header")) && !(await p.isVisible("nav")), n + ": nur Anmeldebildschirm");
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), n + ": kein Überlauf");
    await p.screenshot({ path: `${__dirname}/tor-login-${n.replace(/\W/g, "")}.png` });
    await p.fill("#torEmail", "x" + n.length + "@test.at"); await p.fill("#torPass", "geheim77"); await p.click("#torReg"); await p.waitForTimeout(1000);
    ok(await p.isVisible("#torBest") && (await p.textContent("#torMail2")).includes("@test.at"), n + ": Bestätigen nach Registrierung");
    await p.screenshot({ path: `${__dirname}/tor-best-${n.replace(/\W/g, "")}.png` });
    await p.evaluate(m => window.__fakeVerify(m), "x" + n.length + "@test.at"); await p.click("#torBestOk"); await p.waitForTimeout(800);
    ok(await p.isVisible("#torWarten") && (await p.textContent("#torMail")).includes("@test.at"), n + ": Warten nach Bestätigung");
    await p.screenshot({ path: `${__dirname}/tor-warten-${n.replace(/\W/g, "")}.png` });
    await ctx.close();
  }
  { const c3 = await b.newContext(devices["Pixel 7"]); await routes(c3, []); await c3.addInitScript(GPS); await c3.exposeBinding("__db", db); const r = await c3.newPage(); await r.goto("http://localhost:8765/"); await r.waitForTimeout(800);
    await r.click("#torReset"); ok((await r.textContent("#torStatus")).includes("zuerst"), "Passwort vergessen ohne E-Mail: " + await r.textContent("#torStatus"));
    await r.fill("#torEmail", "gast@test.at"); await r.click("#torReset"); await r.waitForTimeout(400); ok((await r.textContent("#torStatus")).includes("gesendet") && (await r.evaluate(() => window.__resets))[0] === "gast@test.at", "Passwort vergessen: " + await r.textContent("#torStatus"));
    await r.fill("#torPass", "falsch"); await r.click("#torAn"); await r.waitForTimeout(400); ok((await r.textContent("#torStatus")).includes("falsch"), "Falsches Passwort: " + await r.textContent("#torStatus"));
    await r.fill("#torEmail", "kaputt"); await r.fill("#torPass", ""); await r.click("#torAn"); await r.waitForTimeout(300); ok((await r.textContent("#torStatus")).includes("Bitte"), "Leere Felder: " + await r.textContent("#torStatus"));
    await c3.close(); }
  // Offline beim allerersten Start (Firebase nicht ladbar)
  const ctx2 = await b.newContext(devices["Pixel 7"]); await routes(ctx2, []); await ctx2.addInitScript(GPS);
  await ctx2.route(/gstatic\.com\/firebasejs/, r => r.abort());
  const q = await ctx2.newPage(); await q.goto("http://localhost:8765/"); await q.waitForTimeout(900);
  ok(await q.isVisible("#torLogin") && (await q.textContent("#torStatus")).includes("Internetverbindung"), "Offline ohne frühere Freischaltung: " + await q.textContent("#torStatus"));
  await q.evaluate(() => localStorage.setItem("zugang", "irgendwer")); await q.reload(); await q.waitForTimeout(900);
  ok(await q.isVisible("main") && await q.isVisible("header"), "Offline mit gemerkter Freischaltung: App startet");
  await b.close(); console.log(log.join("\n"));
})();
