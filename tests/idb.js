const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD, ALS_ADMIN } = require("./mocks");
const fs = require("fs");
const DB = new Map();
const db = (_, op, path, v, merge) => {
  if (op === "get") return DB.get(path) ?? null;
  if (op === "list") { const n = path.split("/").length + 1; return [...DB].filter(([k]) => k.startsWith(path + "/") && k.split("/").length === n); }
  if (op === "set") DB.set(path, merge ? { ...(DB.get(path) || {}), ...v } : v);
  if (op === "del") DB.delete(path);
  return null;
};
const spur = (n, lat0) => Array.from({ length: n }, (_, k) => ({ lat: lat0 + k * 1e-4, lng: 15.9 + k * 1e-4, hoehe: 400 + k % 300, speed: 4.2, kurs: 90, genauigkeit: 5, zeit: new Date(Date.UTC(2026, 8, 1, 6) + k * 1000).toISOString() }));
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t);
  const geraet = async (label, init, ohneIdb) => {
    const ctx = await b.newContext({ ...devices["Pixel 7"], acceptDownloads: true });
    await routes(ctx, log); await ctx.addInitScript(GPS); await ctx.exposeBinding("__db", db);
    if (label === "[Alt]") await ctx.addInitScript(ALS_ADMIN); else if (label === "[OhneIDB]") await ctx.addInitScript(OHNE_CLOUD);
    if (ohneIdb) await ctx.addInitScript(() => { Object.defineProperty(window, "indexedDB", { value: undefined }); });
    if (init) await ctx.addInitScript(init.fn, init.arg);
    const p = await ctx.newPage(); p.dialoge = [];
    p.on("pageerror", e => log.push(label + " JS-FEHLER: " + e.message)); p.on("console", m => { if (m.type() === "error") log.push(label + " console.error: " + m.text()); });
    p.on("dialog", d => { p.dialoge.push(d.message()); d.accept(); });
    await p.goto("http://localhost:8765/"); await p.waitForTimeout(1200);
    return p;
  };
  const idbSpur = (p, id) => p.evaluate(id => new Promise(r => { const q = indexedDB.open("ballonflugbuch"); q.onsuccess = () => { const g = q.result.transaction("tracks").objectStore("tracks").get(id); g.onsuccess = () => r(g.result ? g.result.length : -1); }; }), id);
  // ---- 1. Umzug alter Daten ----
  const alt = [{ id: "x1", startzeit: "2026-09-01T06:00:00Z", flugzeit: 90, strecke: 20, landungen: 1, pilot: "A", ballon: "OE-ZZZ", startLat: 47, startLng: 15.9, landeLat: 47.5, landeLng: 16.4, track: spur(5400, 47), bearbeitet: 1 },
    { id: "x2", startzeit: "2026-09-05T06:00:00Z", flugzeit: 30, strecke: 5, landungen: 1, pilot: "A", ballon: "OE-ZZZ", startLat: 47.2, startLng: 15.9, landeLat: 47.3, landeLng: 16, track: spur(800, 47.2), bearbeitet: 1 },
    { id: "x3", startzeit: "2026-09-07T06:00:00Z", flugzeit: 60, strecke: 0, landungen: 1, pilot: "A", ballon: "OE-ZZZ", manuell: true, track: [], bearbeitet: 1 }];
  const P = await geraet("[Alt]", { fn: f => { if (!sessionStorage.seeded) { sessionStorage.seeded = 1; localStorage.fluege = f; localStorage.stammdaten = JSON.stringify({ pilot: "A", ballon: "OE-ZZZ" }); localStorage.willkommen = "1"; } }, arg: JSON.stringify(alt) });
  const vorher = JSON.stringify(alt).length, nachher = await P.evaluate(() => localStorage.fluege.length);
  ok(nachher < 3000, `Umzug: localStorage ${(vorher / 1e6).toFixed(2)} MB → ${(nachher / 1e3).toFixed(1)} KB`);
  ok(await idbSpur(P, "x1") === 5400 && await idbSpur(P, "x2") === 800, "Spuren vollständig in IndexedDB");
  ok(await P.evaluate(() => fluege.every(f => !f.track) && fluege.find(f => f.id === "x1").punkte === 5400), "Fahrten tragen nur noch die Punktanzahl");
  ok(await P.evaluate(() => new Promise(r => { const q = indexedDB.open("ballonflugbuch"); q.onsuccess = () => { const g = q.result.transaction("sicherung").objectStore("sicherung").get("fluege-vor-umzug"); g.onsuccess = () => r(JSON.parse(g.result).length === 3); }; })), "Sicherung der alten Daten in IndexedDB");
  await P.reload(); await P.waitForTimeout(800); ok(await idbSpur(P, "x1") === 5400, "nach Neuladen weiterhin vorhanden");
  const liste = await P.textContent("#liste"); ok(liste.includes("Abspielen") && liste.includes("GPX"), "Flugbuch zeigt Karte/Abspielen/GPX");
  // Karte, Wiedergabe, GPX, Backup
  await P.evaluate(() => zeige("karte")); await P.waitForTimeout(900);
  ok(await P.evaluate(() => { let n = 0; ebene.eachLayer(l => { if (l instanceof L.Polyline && l.options.opacity !== 0 && l.options.color !== "#000") n += l.getLatLngs().length; }); return n; }) === 6200, "Karte zeichnet beide Spuren aus IndexedDB");
  await P.click("#playB"); await P.waitForTimeout(700); ok(/Wiedergabe/.test(await P.textContent("#posInfo")), "Wiedergabe");
  await P.evaluate(() => zeige("flugbuch"));
  const [g] = await Promise.all([P.waitForEvent("download"), P.click('#liste button[data-a="gpx"][data-id="x2"]')]);
  ok((fs.readFileSync(await g.path(), "utf8").match(/<trkpt/g) || []).length === 800, "GPX-Export mit 800 Punkten");
  await P.evaluate(() => zeige("einstellungen"));
  const [bk] = await Promise.all([P.waitForEvent("download"), P.click("#expB")]);
  const backup = JSON.parse(fs.readFileSync(await bk.path(), "utf8"));
  ok(backup.version === 3 && backup.fluege.find(f => f.id === "x1").track.length === 5400, "Backup enthält die Spuren");
  ok((await P.textContent("#speicher")).includes("GPS-Spuren"), "Speicheranzeige: " + await P.textContent("#speicher"));
  // Löschen
  await P.evaluate(() => zeige("flugbuch")); await P.click('#liste button[data-a="del"][data-id="x2"]'); await P.waitForTimeout(300);
  ok(await idbSpur(P, "x2") === -1, "Löschen entfernt die Spur aus IndexedDB");
  // Backup wieder einspielen -> x2 kommt zurück, Spur in IndexedDB
  await P.evaluate(() => { localStorage.removeItem("geloescht"); });
  await P.evaluate(() => zeige("einstellungen")); P.dialoge = [];
  await P.setInputFiles("#imp", { name: "b.json", mimeType: "application/json", buffer: fs.readFileSync(await bk.path()) }); await P.waitForTimeout(800);
  ok(P.dialoge.some(m => m.startsWith("1 neue")) && await idbSpur(P, "x2") === 800 && await P.evaluate(() => !fluege.find(f => f.id === "x2").track), "Backup-Import legt Spur in IndexedDB: " + P.dialoge.join(" | "));
  // GPX-Import
  P.dialoge = []; const gpx = fs.readFileSync(await g.path(), "utf8").replace(/2026-09-01/g, "2026-07-01");
  await P.setInputFiles("#imp", { name: "neu.gpx", mimeType: "application/gpx+xml", buffer: Buffer.from(gpx) }); await P.waitForTimeout(800);
  const gi = await P.evaluate(() => fluege.at(-1)); ok(!gi.track && gi.punkte === 800 && await idbSpur(P, gi.id) === 800, "GPX-Import legt Spur in IndexedDB");
  // ---- 2. Fahrt aufzeichnen ----
  await P.evaluate(() => zeige("fahrt")); await P.click("#startB"); await P.waitForTimeout(300);
  for (let i = 1; i <= 50; i++) await P.evaluate(i => __gps(47.1 + i * 2e-4, 15.95 + i * 2e-4, 450 + i, 5), i);
  await P.click("#stopB"); await P.click("#endDlg button[value=ok]"); await P.waitForTimeout(800);
  const nf = await P.evaluate(() => fluege.at(-1));
  ok(!nf.track && nf.punkte >= 50 && await idbSpur(P, nf.id) === nf.punkte && await P.evaluate(() => !localStorage.aktiveFahrt), `Aufgezeichnete Fahrt: ${nf.punkte} Punkte in IndexedDB`);
  // ---- 3. Abgleich zwischen Geräten ----
  const anmelden = async p => { await p.fill("#torEmail", "admin@test.at"); await p.fill("#torPass", "geheim1"); await p.click("#torAn"); await p.waitForTimeout(2500); };
  await P.evaluate(() => zeige("einstellungen")); await P.click("#cSync"); await P.waitForTimeout(2500);
  const cx1 = DB.get("users/ahg4hJgbbcflgWxyerVdW7O0vvO2/fluege/x1");
  ok(cx1?.track?.length > 2000 && cx1?.track?.length <= 4000, "Hochgeladen mit Spur (ausgedünnt auf " + cx1?.track?.length + " Punkte)");
  ok(!(await P.evaluate(() => fluege.some(f => f.track))), "Nach Abgleich keine Spur in localStorage");
  const Q = await geraet("[Neu]", { fn: () => { localStorage.willkommen = "1"; } });
  await anmelden(Q);
  ok(await Q.evaluate(() => fluege.length) === 5 && !(await Q.evaluate(() => fluege.some(f => f.track))) && await idbSpur(Q, "x2") === 800, "Zweites Gerät: Fahrten geladen, Spuren in IndexedDB");
  ok(await Q.evaluate(() => localStorage.fluege.length) < 5000, "Zweites Gerät: localStorage klein (" + await Q.evaluate(() => localStorage.fluege.length) + " Zeichen)");
  // Bearbeiten auf Gerät 2 darf die genaue Spur auf Gerät 1 nicht verkürzen
  await Q.evaluate(() => { const f = fluege.find(x => x.id === "x1"); f.bemerkung = "von Q"; f.bearbeitet = Date.now(); save("fluege", fluege); }); await Q.waitForTimeout(4500);
  await P.click("#cSync"); await P.waitForTimeout(2500);
  ok(await P.evaluate(() => fluege.find(f => f.id === "x1").bemerkung) === "von Q" && await idbSpur(P, "x1") === 5400, "Änderung übernommen, genaue lokale Spur bleibt (5400)");
  // Fahrt ohne lokale Spur bearbeiten -> Cloud-Spur bleibt
  await Q.evaluate(() => new Promise(r => { const q = indexedDB.open("ballonflugbuch"); q.onsuccess = () => { const tx = q.result.transaction("tracks", "readwrite"); tx.objectStore("tracks").delete("x2"); tx.oncomplete = r; }; }));
  await Q.evaluate(() => { const f = fluege.find(x => x.id === "x2"); f.bemerkung = "ohne Spur"; f.bearbeitet = Date.now(); save("fluege", fluege); }); await Q.waitForTimeout(4500);
  const cx2 = DB.get("users/ahg4hJgbbcflgWxyerVdW7O0vvO2/fluege/x2");
  ok(cx2.bemerkung === "ohne Spur" && cx2.track?.length === 800, "Fehlende lokale Spur überschreibt Cloud-Spur nicht");
  // ---- 4. Ohne IndexedDB (Rückfall) ----
  const R = await geraet("[OhneIDB]", { fn: () => { localStorage.willkommen = "1"; localStorage.stammdaten = JSON.stringify({ pilot: "B", ballon: "OE-B" }); } }, true);
  await R.evaluate(() => zeige("fahrt")); await R.click("#startB"); await R.waitForTimeout(300);
  for (let i = 1; i <= 20; i++) await R.evaluate(i => __gps(47.3 + i * 2e-4, 15.8, 450, 5), i);
  await R.click("#stopB"); await R.click("#endDlg button[value=ok]"); await R.waitForTimeout(800);
  const rf = await R.evaluate(() => fluege.at(-1)); ok(rf && rf.track?.length >= 20, "Ohne IndexedDB: Spur bleibt an der Fahrt (" + rf?.track?.length + ")");
  await R.evaluate(() => zeige("karte")); await R.waitForTimeout(700);
  ok(await R.evaluate(() => { let n = 0; ebene.eachLayer(l => { if (l instanceof L.Polyline && l.options.opacity !== 0 && l.options.color !== "#000") n++; }); return n; }) === 1, "Ohne IndexedDB: Karte zeigt Spur");
  // ---- 5. Lokal löschen leert IndexedDB (ohne Cloud, sonst kommen die Daten per Abgleich zurück) ----
  await R.evaluate(() => zeige("einstellungen")); await R.click("#lokalDel"); await R.waitForTimeout(1200);
  ok(await R.evaluate(() => fluege.length) === 0, "Daten auf diesem Gerät löschen (Rückfall-Gerät)");
  await b.close(); console.log(log.join("\n"));
})();
