const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD, ALS_ADMIN } = require("./mocks");
const DB = new Map(), LESEN = { n: 0 };
const db = (_, op, path, v, merge) => {
  if (op === "get") return DB.get(path) ?? null;
  if (op === "list") { const n = path.split("/").length + 1; return [...DB].filter(([k]) => k.startsWith(path + "/") && k.split("/").length === n); }
  if (op === "set") DB.set(path, merge ? { ...(DB.get(path) || {}), ...v } : v);
  if (op === "del") DB.delete(path);
  if (op === "lese") LESEN.n += path;
  return null;
};
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t);
  const geraet = async (d, label) => {
    const ctx = await b.newContext({ ...d, locale: "de-AT", timezoneId: "Europe/Vienna" });
    await routes(ctx, log); await ctx.addInitScript(GPS); await ctx.exposeBinding("__db", db);
    const p = await ctx.newPage();
    p.on("pageerror", e => log.push(label + " JS-FEHLER: " + e.message));
    p.on("console", m => { if (m.type() === "error") log.push(label + " console.error: " + m.text()); });
    p.on("dialog", dl => { log.push(label + " Dialog: " + dl.message().slice(0, 90)); dl.accept(); });
    await p.goto("http://localhost:8765/#einstellungen"); await p.waitForTimeout(500);
    return p;
  };
  const anmelden = async (p, m, pw, neu) => { const g = await p.isVisible("#torLogin"); await p.fill(g ? "#torEmail" : "#cEmail", m); await p.fill(g ? "#torPass" : "#cPass", pw); await p.click(g ? (neu ? "#torReg" : "#torAn") : (neu ? "#cReg" : "#cLogin")); await p.waitForTimeout(1000); };
  const status = p => p.textContent("#cStatus");
  ok(await (async () => { const P0 = await geraet(devices["Pixel 7"], "[Fremd]"); const r = await P0.isVisible("#torLogin") && !(await P0.isVisible("main")) && !(await P0.isVisible("header")); return r; })(), "Ohne Anmeldung nur Anmeldebildschirm, keine App");
  // Admin-Handy mit vorhandener Fahrt
  const A = await geraet(devices["Pixel 7"], "[Admin]");
  await A.evaluate(() => { stamm.pilot = "Admin"; stamm.ballon = "OE-ADM"; save("stammdaten", stamm); fluege.push({ id: "a1", startzeit: "2026-10-01T07:00:00Z", datum: "2026-10-01T07:00:00Z", flugzeit: 60, strecke: 10, landungen: 1, ballon: "OE-ADM", pilot: "Admin", track: [], bearbeitet: 5 }); save("fluege", fluege); render(); });
  await anmelden(A, "admin@test.at", "falsch");
  ok((await status(A)).includes("falsch"), "Falsches Passwort: " + await status(A));
  await anmelden(A, "admin@test.at", "geheim1");
  ok(await A.isVisible("#cAdmin"), "Admin-Karte sichtbar");
  ok((await A.textContent("#cUid")).startsWith("ahg4"), "Benutzer-ID angezeigt");
  ok(/synchronisiert/.test(await status(A)) && DB.has("users/ahg4hJgbbcflgWxyerVdW7O0vvO2/fluege/a1"), "Admin synchronisiert: " + await status(A));
  // Gast registriert sich
  const G = await geraet(devices["iPhone 15 Pro Max"], "[Gast]");
  await anmelden(G, "neu@test.at", "123", true); ok((await status(G)).includes("kurz"), "Zu kurzes Passwort: " + await status(G));
  await anmelden(G, "neu@test.at", "geheim99", true);
  ok(await G.isVisible("#torBest") && await G.evaluate(() => window.__bestaetigungen) === 1 && ![...DB.keys()].some(k => k.startsWith("anfragen/")), "Nach Registrierung: E-Mail bestätigen, Link verschickt, noch keine Anfrage");
  await G.click("#torBestOk"); await G.waitForTimeout(600); ok(await G.isVisible("#torBest"), "Ohne Bestätigung bleibt es beim Bestätigen-Hinweis");
  await G.click("#torBestNeu"); await G.waitForTimeout(300); ok(await G.evaluate(() => window.__bestaetigungen) === 2 && (await G.textContent("#torStatus")).includes("erneut"), "E-Mail erneut senden");
  await G.evaluate(() => window.__fakeVerify("neu@test.at")); await G.click("#torBestOk"); await G.waitForTimeout(800);
  ok(await G.isVisible("#torWarten") && !(await G.isVisible("main")) && [...DB.keys()].some(k => k.startsWith("anfragen/")), "Nach Bestätigung: Anfrage gestellt, wartet auf Freischaltung");
  ok(!(await G.isVisible("#cAdmin")), "Gast sieht keine Admin-Karte");
  await G.evaluate(() => { fluege.push({ id: "g1", startzeit: "2026-10-02T07:00:00Z", datum: "2026-10-02T07:00:00Z", flugzeit: 30, strecke: 5, landungen: 1, ballon: "OE-GST", pilot: "Gast", track: [], bearbeitet: 7 }); save("fluege", fluege); });
  ok(![...DB.keys()].some(k => k.includes("g1")), "Gast-Daten ohne Freischaltung nicht in der Cloud");
  // Admin schaltet frei
  await A.click("#aRefresh"); await A.waitForTimeout(400);
  ok((await A.textContent("#aListe")).includes("neu@test.at"), "Anfrage beim Admin sichtbar");
  await A.click('#aListe button[data-a="ok"]'); await A.waitForTimeout(400);
  ok((await A.textContent("#aListe")).includes("Freigeschaltet") && !(await A.textContent("#aListe")).match(/Offene Anfragen\s*neu@/), "Freigeschaltet, Anfrage entfernt");
  await G.click("#torNeu"); await G.waitForTimeout(1000);
  ok(await G.isVisible("main") && /synchronisiert/.test(await status(G)) && [...DB.keys()].some(k => k.endsWith("/fluege/g1")), "Nach Freischaltung „Erneut prüfen“: App offen und synchronisiert: " + await status(G));
  await G.reload(); await G.waitForTimeout(1000); ok(await G.isVisible("main"), "Freigeschalteter Gast: App öffnet nach Neuladen direkt");
  await G.evaluate(() => zeige("einstellungen")); await G.fill("#rText", "Hallo"); await G.click("#rSend"); await G.waitForTimeout(400);
  ok((await G.textContent("#rStatus")).includes("Danke"), "Freigeschalteter Gast kann Rückmeldung senden");
  // Zweites Gerät des Admins: Daten kommen aus der Cloud
  const A2 = await geraet({ viewport: { width: 1366, height: 800 } }, "[Admin-PC]");
  await anmelden(A2, "admin@test.at", "geheim1");
  ok(await A2.evaluate(() => fluege.some(f => f.id === "a1") && stamm.ballon === "OE-ADM"), "Zweites Gerät übernimmt Fahrten und Einstellungen");
  // Löschen auf Gerät 2 -> Gerät 1
  await A2.evaluate(() => { fluege = fluege.filter(f => f.id !== "a1"); save("geloescht", ["a1"]); save("fluege", fluege); });
  await A2.click("#cSync"); await A2.waitForTimeout(800);
  await A.click("#cSync"); await A.waitForTimeout(800);
  ok(await A.evaluate(() => !fluege.some(f => f.id === "a1")), "Löschung wird auf anderes Gerät übertragen");
  // Sperren
  await A.click("#aRefresh"); await A.waitForTimeout(300);
  await A.click('#aListe button[data-a="sperr"]'); await A.waitForTimeout(400);
  await G.click("#cSync"); await G.waitForTimeout(800);
  ok(await G.isVisible("#torWarten") && !(await G.isVisible("main")), "Gesperrter Gast: App wird gesperrt: " + await G.textContent("#torStatus"));
  await G.reload(); await G.waitForTimeout(1200); ok(await G.isVisible("#torWarten"), "Gesperrter Gast bleibt nach Neuladen gesperrt");
  // Kontowechsel-Schutz: Gast meldet sich ab, Admin auf Gast-Gerät
  await G.click("#torAus"); await G.waitForTimeout(400); ok(await G.isVisible("#torLogin"), "Abmelden zeigt Anmeldebildschirm");
  await anmelden(G, "admin@test.at", "geheim1");
  ok(await G.evaluate(() => !fluege.some(f => f.id === "g1")), "Kontowechsel: Gast-Daten werden nicht ins Admin-Konto übernommen");
  ok(![...DB.keys()].some(k => k.startsWith("users/ahg4") && k.endsWith("g1")), "Admin-Cloud enthält keine Gast-Fahrt");
  await b.close(); console.log(log.join("\n"));
})();
