const { chromium, devices } = require("playwright");
const { routes, GPS, ALS_ADMIN } = require("./mocks");
const DB = new Map();
const db = (_, op, path, v, merge) => { if (op === "get") return DB.get(path) ?? null; if (op === "list") { const n = path.split("/").length + 1; return [...DB].filter(([k]) => k.startsWith(path + "/") && k.split("/").length === n); } if (op === "set") DB.set(path, merge ? { ...(DB.get(path) || {}), ...v } : v); if (op === "del") DB.delete(path); return null; };
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t);
  const csp = [];
  // Pilot (Admin, angemeldet)
  const pc = await b.newContext({ ...devices["Pixel 7"], permissions: ["clipboard-read", "clipboard-write"] }); await routes(pc, []); await pc.addInitScript(GPS); await pc.addInitScript(ALS_ADMIN); await pc.exposeBinding("__db", db);
  await pc.addInitScript(() => { localStorage.willkommen = "1"; localStorage.stammdaten = JSON.stringify({ pilot: "Anna", ballon: "OE-ZAB" }); localStorage.zugang = "ahg4hJgbbcflgWxyerVdW7O0vvO2"; delete navigator.share; });
  const p = await pc.newPage(), dialoge = []; p.on("pageerror", e => log.push("Pilot JS-FEHLER " + e.message)); p.on("dialog", d => { dialoge.push(d.message()); d.accept(); });
  p.on("console", m => { if (/CSP|Content Security/.test(m.text())) csp.push(m.text()); });
  await p.goto("http://localhost:8765/#fahrt"); await p.waitForTimeout(1200);
  ok(!(await p.isVisible("#vfK")), "Vor dem Start kein Verfolger-Knopf");
  await p.evaluate(() => document.getElementById("startB").click()); await p.waitForTimeout(600);
  ok(await p.isVisible("#vfK"), "Während der Aufzeichnung: Verfolger-Knopf sichtbar");
  await p.screenshot({ path: __dirname + "/vf-cockpit.png" });
  for (let i = 1; i <= 5; i++) await p.evaluate(i => __gps(47.17 + i * 1e-3, 16.01 + i * 1e-3, 500 + i * 20, 4), i);
  await p.click("#vfB"); await p.waitForTimeout(800);
  const link = await p.evaluate(() => navigator.clipboard.readText());
  ok(/verfolgen\.html#[A-Za-z0-9]{24}$/.test(link), "Link erzeugt und kopiert: " + link.replace(/#.*/, "#…"));
  const token = link.split("#")[1], d0 = DB.get("live/" + token);
  ok(d0 && d0.uid === "ahg4hJgbbcflgWxyerVdW7O0vvO2" && d0.status === "fahrt" && d0.spur.length >= 4 && d0.ablauf - d0.start === 12 * 36e5, "Live-Dokument angelegt (Spur " + d0?.spur.length / 2 + " Punkte)");
  ok((await p.textContent("#vfT")).includes("live"), "Cockpit-Status: " + await p.textContent("#vfT"));
  // Rückholteam ohne Konto
  const vc = await b.newContext({ ...devices["iPhone 15 Pro Max"], geolocation: { latitude: 47.10, longitude: 16.05 }, permissions: ["geolocation"] }); await routes(vc, []); await vc.exposeBinding("__db", db);
  const v = await vc.newPage(); v.on("pageerror", e => log.push("Verfolger JS-FEHLER " + e.message)); v.on("console", m => { if (/CSP|Content Security/.test(m.text())) csp.push(m.text()); });
  await v.goto(link); await v.waitForTimeout(1500);
  ok((await v.textContent("#vTitel")).includes("OE-ZAB") && (await v.textContent("#vStatus")).includes("Live"), "Verfolger sieht Ballon live: " + await v.textContent("#vTitel") + " / " + await v.textContent("#vStatus"));
  ok(+(await v.textContent("#vH")) > 500 && /\d/.test(await v.textContent("#vD")), `Höhe ${await v.textContent("#vH")} m, Entfernung ${await v.textContent("#vD")} ${await v.textContent("#vDu")}`);
  ok((await v.getAttribute("#vNav", "href")).startsWith("https://maps.apple.com/?daddr=47.1"), "Navigation (iPhone → Apple Karten)");
  ok((await v.textContent("#vUtm")).includes("UTM 33N"), "UTM angezeigt");
  await v.screenshot({ path: __dirname + "/vf-ansicht.png", fullPage: true });
  // Weiterfliegen: Update kommt an (höchstens alle 10 s)
  await p.evaluate(() => __gps(47.19, 16.05, 700, 6)); await p.waitForTimeout(1500);
  ok(await v.textContent("#vH") !== "700", "Innerhalb einer Minute kein neues Senden");
  await p.evaluate(() => { const echt = Date.now; Date.now = () => echt() + 61000; __gps(47.2, 16.06, 900, 6); Date.now = echt; }); await p.waitForTimeout(1500);
  ok(await v.textContent("#vH") === "900", "Nach einer Minute kommt die neue Position an (Höhe " + await v.textContent("#vH") + ")");
  ok((await v.textContent("#vStatus")).includes("etwa jede Minute"), "Statuszeile: " + await v.textContent("#vStatus"));
  // Landung
  await p.evaluate(() => document.getElementById("stopB").click()); await p.click("#endDlg button[value=ok]"); await p.waitForTimeout(1500);
  ok(DB.get("live/" + token).status === "gelandet" && (await v.textContent("#vStatus")).includes("Gelandet"), "Landung beim Verfolger: " + await v.textContent("#vStatus"));
  ok(await p.evaluate(() => !localStorage.verfolger), "Link beim Piloten beendet");
  // Abgelaufen / ungültig
  DB.set("live/" + token, { ...DB.get("live/" + token), ablauf: Date.now() - 1000 });
  await v.reload(); await v.waitForTimeout(1200); ok((await v.textContent("#vStatus")).includes("abgelaufen"), "Abgelaufener Link: " + await v.textContent("#vStatus"));
  await v.goto("http://localhost:8765/verfolgen.html#kurz"); await v.reload(); await v.waitForTimeout(800); ok((await v.textContent("#vStatus")).includes("unvollständig"), "Kaputter Link: " + await v.textContent("#vStatus"));
  // Regeln: fremdes Konto darf nicht schreiben, Nicht-Freigeschaltete auch nicht
  const ok2 = await v.evaluate(async () => { const F = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"); try { await F.setDoc(F.doc({}, "live", "x".repeat(24)), { uid: "x", ablauf: Date.now() + 1000 }); return false; } catch (e) { return e.code === "permission-denied"; } });
  ok(ok2, "Ohne Anmeldung kein Schreiben möglich");
  ok(!csp.length, "Keine CSP-Verstöße" + (csp.length ? ": " + csp.join(" | ") : ""));
  await b.close(); console.log(log.join("\n"));
})();
