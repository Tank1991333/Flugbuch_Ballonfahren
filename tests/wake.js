const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD } = require("./mocks");
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t);
  const faelle = {
    erlaubt: () => { const l = { released: false, onrelease: null, release() { this.released = true; this.onrelease?.(); return Promise.resolve(); } }; Object.defineProperty(navigator, "wakeLock", { value: { request: async () => { window.__wl = { ...l }; return window.__wl; } } }); },
    abgelehnt: () => { Object.defineProperty(navigator, "wakeLock", { value: { request: async () => { throw new DOMException("Energiesparmodus", "NotAllowedError"); } } }); },
    fehlt: () => { delete Navigator.prototype.wakeLock; }
  };
  for (const [n, f] of Object.entries(faelle)) for (const [g, d] of [["Pixel 7", devices["Pixel 7"]], ["Klein 320", { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
    const ctx = await b.newContext({ ...d, colorScheme: "dark" }); await routes(ctx, []); await ctx.addInitScript(GPS); await ctx.addInitScript(OHNE_CLOUD); await ctx.addInitScript(f);
    await ctx.addInitScript(() => { localStorage.stammdaten = JSON.stringify({ pilot: "A", ballon: "OE-X" }); localStorage.willkommen = "1"; });
    const p = await ctx.newPage(); p.on("pageerror", e => log.push("JS-FEHLER " + e.message));
    await p.goto("http://localhost:8765/#fahrt"); await p.waitForTimeout(400);
    const vor = await p.isVisible("#wakeH");
    await p.evaluate(() => document.getElementById("startB").click()); await p.waitForTimeout(500);
    const t = await p.textContent("#wakeH"), sicht = await p.isVisible("#wakeH");
    ok(!vor && sicht && (n === "erlaubt" ? t.startsWith("☀") : t.startsWith("⚠")), `${n}/${g}: ${t}`);
    if (g === "Pixel 7") await p.screenshot({ path: `${__dirname}/wake-${n}.png`, clip: { x: 0, y: 0, width: 412, height: 260 } });
    if (n === "erlaubt") { // Browser hebt auf (z. B. App-Wechsel) -> Warnung; Rückkehr -> wieder an
      await p.evaluate(() => window.__wl.release()); ok((await p.textContent("#wakeH")).startsWith("⚠"), n + ": nach Aufheben Warnung");
      await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await p.waitForTimeout(200);
      ok((await p.textContent("#wakeH")).startsWith("☀"), n + ": nach Rückkehr wieder an");
    }
    await p.evaluate(() => document.getElementById("stopB").click()); await p.click("#endDlg button[value=ok]"); await p.waitForTimeout(500);
    ok(!(await p.isVisible("#wakeH")), `${n}/${g}: nach Landung ausgeblendet`);
    ok(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), `${n}/${g}: kein Überlauf`);
    await ctx.close();
  }
  await b.close(); console.log(log.join("\n"));
})();
