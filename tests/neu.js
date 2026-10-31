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
  const geraet = async (d, label, hash = "", cloud) => {
    const ctx = await b.newContext({ ...d, locale: "de-AT", timezoneId: "Europe/Vienna", serviceWorkers: "block" });
    await routes(ctx, log); await ctx.addInitScript(GPS); await ctx.exposeBinding("__db", db); if (!cloud) await ctx.addInitScript(OHNE_CLOUD);
    const p = await ctx.newPage(); p.dialoge = [];
    p.on("pageerror", e => log.push(label + " JS-FEHLER: " + e.message));
    p.on("console", m => { if (m.type() === "error") log.push(label + " console.error: " + m.text()); });
    p.on("dialog", dl => { p.dialoge.push(dl.message()); dl.accept(); });
    await p.goto("http://localhost:8765/" + hash); await p.waitForTimeout(500);
    return p;
  };
  // ---- 4. Erste Schritte ----
  const P = await geraet(devices["Pixel 7"], "[Neu]");
  ok(await P.isVisible("#willkommen"), "Erste Schritte beim ersten Start sichtbar");
  ok((await P.textContent("#wInstallT")).includes("App installieren"), "Installationshinweis Android: " + await P.textContent("#wInstallT"));
  await P.screenshot({ path: __dirname + "/neu-willkommen.png", fullPage: true });
  await P.click('#willkommen [data-z="konto"]'); await P.waitForTimeout(300);
  ok(await P.evaluate(() => !document.getElementById("einstellungen").hidden), "Knopf „Zum Konto“ öffnet Einstellungen");
  await P.evaluate(() => zeige("dashboard")); await P.click("#wOk");
  ok(!(await P.isVisible("#willkommen")), "Verstanden blendet aus");
  await P.reload(); await P.waitForTimeout(400); ok(!(await P.isVisible("#willkommen")), "bleibt nach Neuladen ausgeblendet");
  await P.evaluate(() => zeige("einstellungen")); await P.click("#wZeigen"); await P.waitForTimeout(200);
  ok(await P.isVisible("#willkommen"), "über Einstellungen wieder aufrufbar");
  const I = await geraet(devices["iPhone 15 Pro Max"], "[iPhone]");
  ok((await I.textContent("#wInstallT")).includes("Home-Bildschirm"), "Installationshinweis iPhone");
  // ---- 1. Fahrt nachtragen ----
  await P.evaluate(() => zeige("einstellungen")); await P.fill("#pilot", "Anna"); await P.press("#pilot", "Tab"); await P.fill("#ballon", "OE-ZAB"); await P.press("#ballon", "Tab");
  await P.evaluate(() => zeige("flugbuch")); await P.click("#fNach"); await P.waitForTimeout(200);
  ok(await P.inputValue("#ePilot") === "Anna" && await P.inputValue("#eBallon") === "OE-ZAB", "Nachtragen: Pilot/Ballon vorbelegt");
  await P.click("#eOk"); await P.waitForTimeout(200);
  ok(await P.isVisible("#dlg") && (await P.textContent("#eFehler")).includes("Start"), "Ohne Zeiten bleibt Dialog offen: " + await P.textContent("#eFehler"));
  await P.fill("#eDatum", "2025-08-14"); await P.fill("#eStartZ", "06:40"); await P.fill("#eEndeZ", "06:10"); await P.click("#eOk"); await P.waitForTimeout(150);
  ok(await P.isVisible("#dlg") && (await P.textContent("#eFehler")).includes("nach dem Start"), "Landung vor Start abgelehnt");
  await P.fill("#eEndeZ", "08:05"); await P.fill("#eStart", "Hartberg"); await P.fill("#eLande", "Ilz"); await P.fill("#eLand", "2"); await P.fill("#eKm", "17.3"); await P.fill("#eGas", "45"); await P.fill("#eBem", "aus Papierflugbuch");
  await P.screenshot({ path: __dirname + "/neu-nachtragen.png" });
  await P.click("#eOk"); await P.waitForTimeout(300);
  const f = await P.evaluate(() => fluege.at(-1));
  ok(f && f.manuell && f.flugzeit === 85 && f.strecke === 17.3 && f.landungen === 2 && f.gas === 45 && new Date(f.startzeit).getUTCHours() === 4, `Fahrt gespeichert (${f?.flugzeit} min, ${f?.strecke} km, Start ${f?.startzeit})`);
  const karte = await P.textContent("#liste"); ok(karte.includes("nachgetragen") && karte.includes("Hartberg") && !karte.includes("UTM") && !karte.includes("Abspielen"), "Karte im Flugbuch ohne GPS-Knöpfe");
  ok((await P.textContent("#kpis")).includes("1h 25m"), "Übersicht zählt nachgetragene Zeit");
  await P.click('#liste button[data-a="edit"]'); await P.waitForTimeout(150);
  ok(await P.inputValue("#eStartZ") === "06:40" && await P.inputValue("#eEndeZ") === "08:05" && await P.inputValue("#eDatum") === "2025-08-14", "Bearbeiten zeigt Datum und Zeiten");
  await P.fill("#eEndeZ", "08:20"); await P.click("#eOk"); await P.waitForTimeout(200);
  ok(await P.evaluate(() => fluege.at(-1).flugzeit) === 100, "Zeit ändern berechnet Flugzeit neu");
  // GPS-Fahrt bearbeiten ohne Zeitänderung -> Sekunden bleiben
  await P.evaluate(() => { fluege.push({ id: "gps1", startzeit: "2026-10-20T05:00:37.123Z", datum: "2026-10-20T05:00:37.123Z", endezeit: "2026-10-20T06:31:12.000Z", flugzeit: 91, strecke: 12.4, track: [{ lat: 47, lng: 16, zeit: "2026-10-20T05:00:37.123Z" }, { lat: 47.1, lng: 16.1, zeit: "2026-10-20T06:31:12.000Z" }], startLat: 47, startLng: 16, landeLat: 47.1, landeLng: 16.1, pilot: "Anna", ballon: "OE-ZAB", landungen: 1, maxHoehe: 900 }); save("fluege", fluege); render(); });
  await P.click('#liste button[data-a="edit"][data-id="gps1"]'); await P.fill("#eBem", "Bemerkung neu"); await P.click("#eOk"); await P.waitForTimeout(200);
  const g = await P.evaluate(() => fluege.find(x => x.id === "gps1"));
  ok(g.startzeit === "2026-10-20T05:00:37.123Z" && g.flugzeit === 91 && g.strecke === 12.4 && g.bemerkung === "Bemerkung neu", "GPS-Fahrt: Bemerkung geändert, Zeiten/Strecke unverändert");
  ok((await P.textContent("#liste")).includes("Abspielen"), "GPS-Fahrt behält Karte/Abspielen/GPX");
  // ---- 3. Daten auf diesem Gerät löschen ----
  await P.evaluate(() => zeige("einstellungen")); P.dialoge = []; await P.click("#lokalDel"); await P.waitForTimeout(600);
  ok(await P.evaluate(() => fluege.length === 0 && !stamm.pilot && localStorage.getItem("willkommen") === null), "Lokale Daten gelöscht (Theme bleibt)");
  ok(await P.isVisible("#willkommen"), "danach wieder Erste Schritte");
  // ---- Version ----
  ok(/–|bfb-/.test(await P.textContent("#version")), "Versionsanzeige: " + await P.textContent("#version"));
  // ---- 5. Sparsamer Abgleich + 11. Rückmeldung + 3. Konto löschen ----
  const A = await geraet(devices["Pixel 7"], "[Admin]", "#einstellungen", true);
  await A.evaluate(() => { stamm.pilot = "Admin"; stamm.ballon = "OE-ADM"; for (let i = 0; i < 50; i++) fluege.push({ id: "a" + i, startzeit: new Date(Date.UTC(2026, 5, 1 + i % 28, 6)).toISOString(), flugzeit: 60, strecke: 10, landungen: 1, ballon: "OE-ADM", pilot: "Admin", track: [], bearbeitet: 1000 + i }); save("stammdaten", stamm); save("fluege", fluege); });
  const anmelden = async (p, m, pw, neu) => { const g = await p.isVisible("#torLogin"); await p.fill(g ? "#torEmail" : "#cEmail", m); await p.fill(g ? "#torPass" : "#cPass", pw); await p.click(g ? (neu ? "#torReg" : "#torAn") : (neu ? "#cReg" : "#cLogin")); await p.waitForTimeout(1000); };
  await anmelden(A, "admin@test.at", "geheim1");
  ok([...DB.keys()].filter(k => k.includes("/fluege/")).length === 50, "Erster Abgleich lädt 50 Fahrten hoch");
  LESEN.n = 0; await A.evaluate(() => window.cloudGeaendert("fluege")); await A.click("#cSync").catch(() => {}); // Knopf = vollständig
  await A.waitForTimeout(900); const vollLesen = LESEN.n;
  LESEN.n = 0; await A.evaluate(() => { fluege[0].bemerkung = "x"; fluege[0].bearbeitet = Date.now(); save("fluege", fluege); }); await A.waitForTimeout(3800);
  ok(LESEN.n <= 4, `Automatischer Abgleich nach Änderung: ${LESEN.n} Lesezugriffe (vollständig: ${vollLesen})`);
  ok(DB.get("users/ahg4hJgbbcflgWxyerVdW7O0vvO2/fluege/a0")?.bemerkung === "x", "Änderung hochgeladen");
  // zweites Gerät ändert -> erstes bekommt es inkrementell
  const A2 = await geraet({ viewport: { width: 1366, height: 800 } }, "[Admin-PC]", "#einstellungen", true);
  await anmelden(A2, "admin@test.at", "geheim1");
  ok(await A2.evaluate(() => fluege.length) === 50, "Zweites Gerät: 50 Fahrten");
  await A2.evaluate(() => { const f = fluege.find(x => x.id === "a5"); f.landungen = 3; f.bearbeitet = Date.now(); fluege = fluege.filter(x => x.id !== "a7"); save("geloescht", ["a7"]); save("fluege", fluege); fluege.push({ id: "neuPC", startzeit: "2026-09-01T06:00:00Z", flugzeit: 30, strecke: 3, landungen: 1, ballon: "OE-ADM", pilot: "Admin", track: [], bearbeitet: Date.now() }); save("fluege", fluege); });
  await A2.waitForTimeout(3800);
  LESEN.n = 0; await A.evaluate(() => window.cloudGeaendert("fluege")); await A.waitForTimeout(3800);
  const r1 = await A.evaluate(() => ({ n: fluege.length, a5: fluege.find(x => x.id === "a5")?.landungen, a7: fluege.some(x => x.id === "a7"), neu: fluege.some(x => x.id === "neuPC") }));
  ok(r1.a5 === 3 && !r1.a7 && r1.neu && r1.n === 50, `Inkrementell übernommen: Änderung, Löschung, neue Fahrt (${LESEN.n} Lesezugriffe, ${r1.n} Fahrten)`);
  ok(!(await A.evaluate(() => fluege.some(f => "geaendert" in f))), "Server-Zeitstempel landet nicht in lokalen Daten");
  // Gast: Rückmeldung
  const G = await geraet(devices["iPhone 15 Pro Max"], "[Gast]", "#einstellungen", true);
  await anmelden(G, "neu@test.at", "geheim99", true);
  await G.evaluate(() => window.__fakeVerify("neu@test.at")); await G.click("#torBestOk"); await G.waitForTimeout(800);
  ok(await G.isVisible("#torWarten"), "Gast wartet auf Freischaltung");
  ok(await G.evaluate(async () => { try { const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"); const F = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"); await F.setDoc(F.doc({}, "rueckmeldungen", "x"), { uid: "irgendwas", text: "spam" }); return false; } catch (e) { return e.code === "permission-denied"; } }), "Nicht freigeschaltet: Rückmeldung von Regeln abgelehnt");
  await A.click("#aRefresh"); await A.waitForTimeout(400); await A.click('#aListe button[data-a="ok"]'); await A.waitForTimeout(400);
  await G.click("#torNeu"); await G.waitForTimeout(1000); await G.evaluate(() => zeige("einstellungen"));
  ok(await G.isVisible("#cRueck") && !(await A.isVisible("#cRueck")), "Rückmeldekarte nur für andere Konten");
  await G.click("#rSend"); ok((await G.textContent("#rStatus")).includes("Bitte"), "Leere Rückmeldung abgelehnt");
  await G.fill("#rText", "Die Karte <b>ist</b> super!\nZweite Zeile"); await G.click("#rSend"); await G.waitForTimeout(400);
  ok((await G.textContent("#rStatus")).includes("Danke"), "Rückmeldung gesendet");
  await A.click("#aRefresh"); await A.waitForTimeout(500);
  const rt = await A.innerHTML("#aRueck"); ok(rt.includes("neu@test.at") && rt.includes("&lt;b&gt;ist") && rt.includes("Zweite Zeile"), "Admin sieht Rückmeldung (escaped)");
  await A.locator("#cAdmin").screenshot({ path: __dirname + "/neu-admin.png" });
  await A.click('#aRueck button[data-a="rdel"]'); await A.waitForTimeout(400);
  ok(![...DB.keys()].some(k => k.startsWith("rueckmeldungen/")), "Erledigt löscht Rückmeldung");
  // Gast (bereits freigeschaltet): Fahrt hochladen, dann Konto löschen
  await G.evaluate(() => { fluege.push({ id: "g1", startzeit: "2026-10-02T07:00:00Z", flugzeit: 30, strecke: 5, landungen: 1, ballon: "OE-GST", pilot: "Gast", track: [], bearbeitet: Date.now() }); save("fluege", fluege); });
  await G.click("#cSync"); await G.waitForTimeout(800);
  const guid = [...DB.keys()].find(k => k.endsWith("/fluege/g1"))?.split("/")[1];
  ok(!!guid, "Gast-Fahrt in der Cloud");
  await G.click("#cDel"); await G.waitForTimeout(200); await G.screenshot({ path: __dirname + "/neu-kontoloeschen.png" });
  await G.click("#kOk"); ok((await G.textContent("#kFehler")).includes("Passwort"), "Ohne Passwort kein Löschen");
  await G.fill("#kPass", "falsch"); await G.click("#kOk"); await G.waitForTimeout(300);
  ok(await G.isVisible("#kDlg") && (await G.textContent("#kFehler")).includes("falsch"), "Falsches Passwort: " + await G.textContent("#kFehler"));
  await G.fill("#kPass", "geheim99"); await G.click("#kOk"); await G.waitForTimeout(800);
  ok(![...DB.keys()].some(k => k.includes(guid)), "Alle Cloud-Daten und Freigabe des Gasts gelöscht: " + [...DB.keys()].filter(k => k.includes(guid)).join(","));
  ok(await G.evaluate(() => window.__geloeschteKonten === 1) && await G.isVisible("#torLogin"), "Konto gelöscht, Anmeldebildschirm: " + await G.textContent("#torStatus"));
  ok(await G.evaluate(() => fluege.some(f => f.id === "g1")), "Lokale Daten bleiben (Häkchen nicht gesetzt)");
  await b.close(); console.log(log.join("\n"));
})();
