const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD, ALS_ADMIN } = require("./mocks");
const fs = require("fs");
const DB = new Map(); let offline = false;
const db = (_, op, path, v, merge) => { if (offline && op !== "list") throw new Error("offline"); if (op === "get") return DB.get(path) ?? null; if (op === "list") { const n = path.split("/").length + 1; return [...DB].filter(([k]) => k.startsWith(path + "/") && k.split("/").length === n); } if (op === "set") DB.set(path, merge ? { ...(DB.get(path) || {}), ...v } : v); if (op === "del") DB.delete(path); return null; };
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t);
  const fehlerAuf = (p, n) => p.on("pageerror", e => log.push(n + " JS-FEHLER " + e.message));
  // ---- F1 Backup vollständig wiederherstellen ----
  const c1 = await b.newContext({ ...devices["Pixel 7"], acceptDownloads: true }); await routes(c1, []); await c1.addInitScript(GPS); await c1.addInitScript(OHNE_CLOUD);
  const p = await c1.newPage(); fehlerAuf(p, "[Backup]"); p.on("dialog", d => d.accept());
  await p.goto("http://localhost:8765/#einstellungen"); await p.waitForTimeout(400);
  await p.evaluate(() => { stamm = { pilot: "Anna", ballon: "OE-ZAB", ausruestung: [{ id: "g", ballon: "OE-ZAB", volumen: "3000", wartung: "2027-01-01" }], flaschen: [{ id: "f", name: "Flasche 1", kap: "40", fuell: "30" }], fahrzeuge: [{ id: "v", art: "Auto", name: "Bus" }], gasLog: [{ id: "n", datum: "2026-10-01", flasche: "f", kg: 10 }], profil: { name: "Anna", lizenz: "AT.123", medical: "2027-03-01" } }; save("stammdaten", stamm); mon.erforderlicheStunden = 9; save("monitorEinstellungen", mon); fluege.push({ id: "a", startzeit: "2026-10-01T06:00:00Z", flugzeit: 60, landungen: 1, pilot: "Anna", ballon: "OE-ZAB" }); save("fluege", fluege); render(); });
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#expB")]); const datei = fs.readFileSync(await dl.path());
  const c2 = await b.newContext(devices["Pixel 7"]); await routes(c2, []); await c2.addInitScript(GPS); await c2.addInitScript(OHNE_CLOUD);
  const q = await c2.newPage(); fehlerAuf(q, "[Neu]"); const dq = []; q.on("dialog", d => { dq.push(d.message()); d.accept(); }); await q.goto("http://localhost:8765/#einstellungen"); await q.waitForTimeout(400);
  await q.evaluate(() => { stamm.pilot = "Neu-Pilot"; save("stammdaten", stamm); }); // auf dem neuen Gerät schon etwas eingetragen
  await q.setInputFiles("#imp", { name: "b.json", mimeType: "application/json", buffer: datei }); await q.waitForTimeout(600);
  const r = await q.evaluate(() => ({ f: fluege.length, fl: (stamm.flaschen || []).length, fz: (stamm.fahrzeuge || []).length, gl: (stamm.gasLog || []).length, au: (stamm.ausruestung || []).length, liz: stamm.profil?.lizenz, pilot: stamm.pilot, ms: mon.erforderlicheStunden, frist: document.getElementById("termine").textContent.includes("Medical") }));
  ok(r.f === 1 && r.fl === 1 && r.fz === 1 && r.gl === 1 && r.au === 1 && r.liz === "AT.123" && r.ms === 9 && r.frist, `Backup vollständig: Fahrten ${r.f}, Flaschen ${r.fl}, Fahrzeuge ${r.fz}, Nachfüllungen ${r.gl}, Ballone ${r.au}, Lizenz ${r.liz}, Monitor ${r.ms} h, Fristen auf Startseite ${r.frist}`);
  ok(r.pilot === "Neu-Pilot", "Abweichender Eintrag auf dem Gerät bleibt erhalten (Pilot „" + r.pilot + "“)");
  ok(dq.some(m => m.includes("Ausrüstung")), "Rückfrage vor dem Übernehmen");
  // ---- F2 Einstellungen feldweise abgleichen (zwei Geräte) ----
  const geraet = async (n) => { const c = await b.newContext(devices["Pixel 7"]); await routes(c, []); await c.addInitScript(GPS); await c.addInitScript(ALS_ADMIN); await c.exposeBinding("__db", db); await c.addInitScript(() => { localStorage.willkommen = "1"; }); const x = await c.newPage(); fehlerAuf(x, n); x.on("dialog", d => d.accept()); await x.goto("http://localhost:8765/#einstellungen"); await x.waitForTimeout(1500); return x; };
  const A = await geraet("[A]");
  await A.evaluate(() => { stamm = { pilot: "Anna", ballon: "OE-ZAB", flaschen: [{ id: "f1", name: "F1", fuell: "30" }, { id: "f2", name: "F2", fuell: "40" }], profil: { name: "Anna" } }; save("stammdaten", stamm); });
  await A.click("#cSync"); await A.waitForTimeout(1500);
  const B = await geraet("[B]"); await B.waitForTimeout(500);
  ok(await B.evaluate(() => (stamm.flaschen || []).length) === 2, "Gerät B übernimmt Einstellungen");
  // gleichzeitig: A füllt F1 nach und löscht F2, B ändert das Profil und legt F3 an
  await A.evaluate(() => { stamm.flaschen = [{ id: "f1", name: "F1", fuell: "40" }]; save("stammdaten", stamm); });
  await B.evaluate(() => { stamm.profil = { name: "Anna", lizenz: "AT.999" }; stamm.flaschen = [...stamm.flaschen, { id: "f3", name: "F3", fuell: "20" }]; save("stammdaten", stamm); });
  await A.click("#cSync"); await A.waitForTimeout(1500); await B.click("#cSync"); await B.waitForTimeout(1500); await A.click("#cSync"); await A.waitForTimeout(1500);
  for (const [n, x] of [["A", A], ["B", B]]) { const s = await x.evaluate(() => ({ l: stamm.profil?.lizenz, f: (stamm.flaschen || []).map(f => f.id + ":" + f.fuell).join(",") }));
    ok(s.l === "AT.999" && s.f === "f1:40,f3:20", `Gerät ${n} nach Abgleich: Lizenz ${s.l}, Flaschen ${s.f} (erwartet AT.999, f1:40,f3:20)`); }
  // ---- F3 Verfolger: Landung offline, Teilen beenden, Aufräumen ----
  await A.evaluate(() => { stamm.pilot = "Anna"; stamm.ballon = "OE-ZAB"; save("stammdaten", stamm); ui(); zeige("fahrt"); });
  await A.context().grantPermissions(["clipboard-read", "clipboard-write"]); await A.evaluate(() => { delete navigator.share; });
  await A.evaluate(() => document.getElementById("startB").click()); await A.waitForTimeout(500); await A.evaluate(() => __gps(47.2, 16.0, 500, 4));
  await A.click("#vfB"); await A.waitForTimeout(800); const token = (await A.evaluate(() => navigator.clipboard.readText())).split("#")[1];
  ok(await A.isVisible("#vfStop"), "Knopf „Teilen beenden“ sichtbar");
  offline = true; await A.evaluate(() => document.getElementById("stopB").click()); await A.click("#endDlg button[value=ok]"); await A.waitForTimeout(1200);
  ok(DB.get("live/" + token).status === "fahrt" && await A.evaluate(() => !!localStorage.verfolgerLandung), "Landung offline: vorgemerkt");
  offline = false; await A.evaluate(() => window.dispatchEvent(new Event("online"))); await A.waitForTimeout(1200);
  ok(DB.get("live/" + token).status === "gelandet" && await A.evaluate(() => !localStorage.verfolgerLandung), "Landung nach Wiederverbindung nachgesendet");
  // Teilen beenden
  await A.evaluate(() => zeige("fahrt")); await A.evaluate(() => document.getElementById("startB").click()); await A.waitForTimeout(500); await A.evaluate(() => __gps(47.3, 16.1, 500, 4));
  await A.click("#vfB"); await A.waitForTimeout(800); const t2 = (await A.evaluate(() => navigator.clipboard.readText())).split("#")[1];
  const V = await (async () => { const c = await b.newContext(devices["Pixel 7"]); await routes(c, []); await c.exposeBinding("__db", db); const v = await c.newPage(); fehlerAuf(v, "[Verfolger]"); await v.goto("http://localhost:8765/verfolgen.html#" + t2); await v.waitForTimeout(1200); return v; })();
  ok((await V.textContent("#vStatus")).includes("Live"), "Verfolger sieht den zweiten Link live");
  await A.click("#vfStop"); await A.waitForTimeout(800);
  ok(!DB.has("live/" + t2) && !(await A.isVisible("#vfStop")), "Teilen beendet: Dokument gelöscht");
  await V.waitForTimeout(1000); ok((await V.textContent("#vStatus")).includes("beendet"), "Verfolger: " + await V.textContent("#vStatus"));
  // Stillstand: Lebenszeichen ohne neue GPS-Position
  await A.click("#vfB"); await A.waitForTimeout(800); const t3 = (await A.evaluate(() => navigator.clipboard.readText())).split("#")[1];
  await A.evaluate(() => { const e = Date.now; Date.now = () => e() + 200000; setTimeout(() => { Date.now = e; }, 1500); }); await A.waitForTimeout(2000);
  const d3 = DB.get("live/" + t3); ok(d3 && d3.zeit - d3.posZeit > 100000, "Ohne neue GPS-Position: Lebenszeichen mit alter Positionszeit");
  // Aufräumen beim nächsten Start: gelandeter Link (Landung > 2 h) und abgelaufener werden gelöscht
  DB.set("live/" + token, { ...DB.get("live/" + token), landung: { ...DB.get("live/" + token).landung, zeit: Date.now() - 3 * 36e5 } });
  DB.set("live/ALTALTALTALTALTALTALTALT", { uid: "ahg4hJgbbcflgWxyerVdW7O0vvO2", ablauf: Date.now() - 1000, status: "fahrt" });
  DB.set("live/FREMDFREMDFREMDFREMDFREM", { uid: "jemandanders", ablauf: Date.now() - 1000, status: "fahrt" });
  await A.reload(); await A.waitForTimeout(2000);
  ok(!DB.has("live/" + token) && !DB.has("live/ALTALTALTALTALTALTALTALT") && DB.has("live/FREMDFREMDFREMDFREMDFREM") && DB.has("live/" + t3), "Aufräumen: eigene alte Links gelöscht, fremde und aktueller bleiben");
  await b.close(); console.log(log.join("\n"));
})();
