const { chromium, devices } = require("playwright");
const { routes, GPS } = require("./mocks");
const DB = new Map();
const db = (_, op, path, v) => { if (op === "get") return DB.get(path) ?? null; if (op === "list") return []; if (op === "set") DB.set(path, v); if (op === "del") DB.delete(path); return null; };
(async () => {
  const b = await chromium.launch(), ctx = await b.newContext(devices["Pixel 7"]); await routes(ctx, []); await ctx.addInitScript(GPS); await ctx.exposeBinding("__db", db);
  await ctx.addInitScript(() => { const n = +sessionStorage.getItem("__mails") || 0; Object.defineProperty(window, "__bestaetigungen", { configurable: true, get: () => +sessionStorage.getItem("__mails") || 0, set: v => sessionStorage.setItem("__mails", v) }); });
  const p = await ctx.newPage(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t);
  p.on("pageerror", e => log.push("JS-FEHLER " + e.message));
  await p.goto("http://localhost:8765/"); await p.waitForTimeout(700);
  await p.fill("#torEmail", "tag@test.at"); await p.fill("#torPass", "geheim77"); await p.click("#torReg"); await p.waitForTimeout(900);
  ok(await p.isVisible("#torBest") && await p.evaluate(() => __bestaetigungen) === 1, "Registrierung: 1 Mail");
  for (let i = 0; i < 3; i++) { await p.reload(); await p.waitForTimeout(900); }
  ok(await p.isVisible("#torBest") && await p.evaluate(() => __bestaetigungen) === 1, "3× neu geöffnet: weiterhin 1 Mail (" + await p.evaluate(() => __bestaetigungen) + ")");
  await p.click("#torBestNeu"); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __bestaetigungen) === 2 && (await p.textContent("#torStatus")).includes("erneut"), "„Erneut senden“: 2 Mails");
  await p.reload(); await p.waitForTimeout(900); ok(await p.evaluate(() => __bestaetigungen) === 2, "danach neu geöffnet: keine weitere Mail");
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("bestaetigungMail_")) localStorage.setItem(k, String(Date.now() - 25 * 36e5)); });
  await p.reload(); await p.waitForTimeout(900); ok(await p.evaluate(() => __bestaetigungen) === 3, "nach mehr als 24 h: wieder 1 automatische Mail");
  await p.evaluate(() => window.__fakeVerify("tag@test.at")); await p.click("#torBestOk"); await p.waitForTimeout(800);
  ok(await p.isVisible("#torWarten"), "nach Bestätigung: wartet auf Freischaltung");
  await b.close(); console.log(log.join("\n"));
})();
