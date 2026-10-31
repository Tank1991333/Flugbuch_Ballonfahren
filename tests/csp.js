const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD } = require("./mocks");
const DB = new Map();
const db = (_, op, path, v, merge) => { if (op === "get") return DB.get(path) ?? null; if (op === "list") { const n = path.split("/").length + 1; return [...DB].filter(([k]) => k.startsWith(path + "/") && k.split("/").length === n); } if (op === "set") DB.set(path, merge ? { ...(DB.get(path) || {}), ...v } : v); if (op === "del") DB.delete(path); return null; };
(async () => {
  const b = await chromium.launch(), verstoss = [];
  const beobachten = async ctx => { await ctx.addInitScript(() => document.addEventListener("securitypolicyviolation", e => console.error("CSP-VERSTOSS " + e.violatedDirective + " " + e.blockedURI))); };
  const ctx = await b.newContext(devices["Pixel 7"]); await routes(ctx, []); await ctx.addInitScript(GPS); await ctx.addInitScript(OHNE_CLOUD); await beobachten(ctx);
  await ctx.addInitScript(() => { localStorage.willkommen = "1"; localStorage.luftEbene = "true"; localStorage.stammdaten = JSON.stringify({ pilot: "A", ballon: "OE-X" }); });
  const p = await ctx.newPage(); p.on("console", m => { if (/CSP|Content Security Policy/.test(m.text())) verstoss.push(m.text()); }); p.on("dialog", d => d.accept());
  await p.goto("http://localhost:8765/"); await p.waitForTimeout(600);
  for (const s of ["dashboard", "fahrt", "karte", "wetter", "rechner", "trajektoren", "einstellungen"]) { await p.evaluate(s => zeige(s), s); await p.waitForTimeout(700); }
  await p.evaluate(() => zeige("karte")); await p.evaluate(() => { const c = document.querySelector(".leaflet-control-layers-base label:nth-of-type(2) input"); c && c.click(); }); await p.waitForTimeout(500);
  await p.evaluate(() => zeige("trajektoren")); await p.fill("#tSuche", "Graz"); await p.click("#tSucheB"); await p.waitForTimeout(400); await p.click("#tRun"); await p.waitForTimeout(800);
  await p.evaluate(() => zeige("fahrt")); await p.evaluate(() => document.getElementById("startB").click()); await p.waitForTimeout(1500); await p.evaluate(() => document.getElementById("stopB").click()); await p.click("#endDlg button[value=ok]"); await p.waitForTimeout(1500);
  await p.evaluate(() => zeige("einstellungen")); await p.click("#expB").catch(() => {});
  const fonts = await p.evaluate(() => [...document.styleSheets].length);
  // mit Anmeldung/Firebase
  const c2 = await b.newContext(devices["Pixel 7"]); await routes(c2, []); await c2.addInitScript(GPS); await c2.exposeBinding("__db", db); await beobachten(c2);
  const q = await c2.newPage(); q.on("console", m => { if (/CSP|Content Security Policy/.test(m.text())) verstoss.push(m.text()); });
  await q.goto("http://localhost:8765/"); await q.waitForTimeout(700); await q.fill("#torEmail", "admin@test.at"); await q.fill("#torPass", "geheim1"); await q.click("#torAn"); await q.waitForTimeout(1500);
  const angemeldet = await q.isVisible("main");
  console.log((angemeldet ? "OK   " : "FEHLER ") + "App nach Anmeldung sichtbar");
  console.log((verstoss.length ? "FEHLER CSP-Verstöße: " + [...new Set(verstoss)].join(" | ") : "OK   Keine CSP-Verstöße") + ` (Stylesheets: ${fonts})`);
  await b.close();
})();
