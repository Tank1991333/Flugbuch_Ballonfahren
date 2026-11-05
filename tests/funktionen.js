// Funktionen, die andere Testreihen nicht abdecken: Wetter, Karte, Auftriebsrechner, Trajektorien-Eingaben,
// Ausrüstung (Ballone, Fahrzeuge), Auswahllisten, Monitor, Passwort vergessen, Update-Hinweis, Installieren, Konto löschen mit Gerät leeren
const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD, ALS_ADMIN } = require("./mocks");
const URL0 = "http://localhost:8765/";
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t), ext = [];
  const neu = async (zusatz, opt = {}) => {
    const c = await b.newContext({ ...devices["Pixel 7"], ...opt }); await routes(c, ext); await c.addInitScript(GPS);
    for (const z of zusatz) await c.addInitScript(z);
    const p = await c.newPage(); p.on("pageerror", e => log.push("FEHLER JS " + e.message)); p.dialoge = []; p.on("dialog", d => { p.dialoge.push(d.message()); d.accept(); });
    return [c, p];
  };
  const DATEN = () => { if (sessionStorage.__da) return; sessionStorage.__da = 1; localStorage.willkommen = "1";
    localStorage.stammdaten = JSON.stringify({ pilot: "Anna", ballon: "OE-ZAB", volumen: "3000", leergewicht: "250", maxtemp: "120", piloten: ["Anna", "Bernd"],
      ausruestung: [{ id: "g1", ballon: "OE-ZAB", ballontyp: "G 30", volumen: "3000", leergewicht: "250", maxtemp: "120" }, { id: "g2", ballon: "OE-ZCD", ballontyp: "Z 90", volumen: "2500", leergewicht: "230", maxtemp: "115" }],
      flaschen: [{ id: "f1", name: "F1", kap: "40", fuell: "30", tara: "18" }] });
    localStorage.fluege = JSON.stringify([{ id: "a", startzeit: "2026-10-01T06:00:00Z", flugzeit: 60, landungen: 1, pilot: "Anna", ballon: "OE-ZAB", startLat: 47.1, startLng: 15.7, landeLat: 47.12, landeLng: 15.8, track: [{ lat: 47.1, lng: 15.7, hoehe: 400, zeit: "2026-10-01T06:00:00Z" }, { lat: 47.12, lng: 15.8, hoehe: 700, zeit: "2026-10-01T07:00:00Z" }], maxHoehe: 700 }]); };
  const [c1, p] = await neu([OHNE_CLOUD, DATEN]);
  await p.goto(URL0); await p.waitForTimeout(600);

  // ---- Wetter ----
  await p.evaluate(() => zeige("wetter")); await p.click("#wetterB"); await p.waitForTimeout(500);
  const w = await p.textContent("#wetterBox");
  ok(w.includes("12,3 °C") && w.includes("Sonnenaufgang") && w.includes("06:45") && w.includes("günstig"), "Wetter: Temperatur, Wind, Sonnenzeiten, Bewertung");
  await p.route("**/api.open-meteo.com/**", r => r.abort()); await p.click("#wetterB"); await p.waitForTimeout(500);
  ok((await p.textContent("#wetterBox")).includes("offline"), "Wetter ohne Netz: verständlicher Hinweis");
  await p.unroute("**/api.open-meteo.com/**");

  // ---- Karte: Standort, Wiedergabe ----
  await p.evaluate(() => zeige("karte")); await p.waitForTimeout(600);
  await p.click("#posB"); await p.waitForTimeout(400);
  ok(await p.evaluate(() => { const c = karte.getCenter(); return Math.abs(c.lat - 47.17) < 0.01 && Math.abs(c.lng - 16.01) < 0.01 && karte.getZoom() === 14; }), "Karte: „Standort“ springt zur GPS-Position");
  await p.click("#playB"); await p.waitForTimeout(600);
  ok(await p.evaluate(() => !!replayT), "Karte: Wiedergabe läuft"); await p.click("#playB"); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !replayT), "Karte: Wiedergabe gestoppt");

  // ---- Auftriebsrechner ----
  await p.evaluate(() => zeige("rechner")); await p.waitForTimeout(300);
  await p.check('#gSel input[data-id="f1"]');
  const z0 = await p.evaluate(() => zul.length);
  for (const k of ["#zPass", "#zGas", "#zFl", "#zNeu"]) await p.click(k);
  const zl = await p.evaluate(() => zul.map(x => x.n));
  ok(zl.length === z0 + 4 && zl.includes("Gepäck") && zl.some(n => /Instrument/.test(n)) && zl.includes("Sonstiges"), "Zuladung: 4 Positionen ergänzt: " + zl.join(", "));
  await p.evaluate(() => { document.querySelectorAll(".zrow .zk").forEach(i => { i.value = "80"; i.dispatchEvent(new Event("input", { bubbles: true })); }); });
  await p.fill("#rT", "15"); await p.fill("#rH", "300"); await p.fill("#rI", "100"); await p.fill("#rQ", ""); await p.dispatchEvent("#rQ", "input"); await p.waitForTimeout(100);
  const ohne = await p.evaluate(() => planErg?.brutto);
  await p.fill("#rQ", "980"); await p.dispatchEvent("#rQ", "input"); await p.waitForTimeout(100);
  const mitQ = await p.evaluate(() => planErg?.brutto);
  ok(ohne > 0 && mitQ > 0 && mitQ < ohne, `QNH 980 hPa verringert den Auftrieb (${Math.round(ohne)} → ${Math.round(mitQ)} kg)`);
  await p.fill("#rI", "60"); await p.dispatchEvent("#rI", "input"); await p.waitForTimeout(100);
  ok((await p.evaluate(() => planErg?.frei)) < 0, "Zu kalte Hülle: freier Auftrieb negativ");
  await p.selectOption("#rBallon", "g2"); await p.waitForTimeout(200);
  ok(await p.evaluate(() => stamm.ballon === "OE-ZCD" && stamm.volumen === "2500"), "Ballon im Rechner wechseln setzt ihn aktiv");
  await p.selectOption("#rBallon", "g1"); await p.waitForTimeout(100);
  await p.click("#gVerw"); ok(await p.isVisible("#gas"), "„Gasflaschen verwalten“ öffnet die Gas-Seite");
  await p.evaluate(() => zeige("rechner")); await p.click("#pTrajB"); ok(await p.isVisible("#trajektoren"), "„Trajektoren berechnen“ öffnet die Trajektorien-Seite");

  // ---- Trajektorien ----
  await p.waitForTimeout(500);
  await p.click("#tGpsB"); await p.waitForTimeout(400);
  ok(Math.abs(+(await p.inputValue("#tLat")) - 47.17) < 1e-3 && Math.abs(+(await p.inputValue("#tLon")) - 16.01) < 1e-3, "„Meinen Standort verwenden“ übernimmt die GPS-Position");
  const dw = async () => (await p.textContent("#tDauerW")).trim();
  const d0 = await dw(); await p.click("#tPlus"); const d1 = await dw(); await p.click("#tMinus"); await p.click("#tMinus"); const d2 = await dw();
  ok(d0 === "1 h 30 min" && d1 !== d0 && d2 !== d0, `Flugdauer + / −: ${d0} → ${d1} → ${d2}`);
  await p.click('#tSchnell button[data-m="120"]'); ok(await dw() === "2 h", "Schnellwahl 2 h: " + await dw());
  const n = () => p.evaluate(() => document.querySelectorAll("#tHoehen input:checked").length);
  await p.click("#tKeine"); const n0 = await n(); await p.click("#tAlle"); const nA = await n(); await p.click("#tBallonH"); const nB = await n();
  ok(n0 === 0 && nA > nB && nB > 0, `Höhenauswahl: keine ${n0}, alle ${nA}, Ballonhöhen ${nB}`);
  await p.click("#tKeine"); await p.click("#tRun"); await p.waitForTimeout(300);
  ok(/Höhe/.test(await p.textContent("#tStatus")), "Ohne Höhen: Hinweis statt Rechnung: " + await p.textContent("#tStatus"));
  await p.click("#tBallonH");
  const morgen = new Date(Date.now() + 864e5); await p.fill("#tDatum", morgen.toISOString().slice(0, 10)); await p.fill("#tStart", "06:30");
  await p.click("#tRun"); await p.waitForTimeout(1500);
  const erg = await p.evaluate(() => ({ zeilen: document.querySelectorAll("#tErg tr").length, plan: JSON.parse(localStorage.planTraj || "null") }));
  ok(erg.zeilen > nB && erg.plan && erg.plan.rows.length === nB && erg.plan.dauer === 2, `Simulation: ${erg.zeilen - 1} Ergebniszeilen, zur Planung gespeichert (${erg.plan?.rows.length} Höhen, ${erg.plan?.dauer} h)`);
  ok(await p.evaluate(() => document.querySelectorAll("#tmap .leaflet-interactive").length >= 2), "Trajektorien auf der Karte gezeichnet");
  await p.reload(); await p.waitForTimeout(600); await p.evaluate(() => zeige("rechner")); await p.waitForTimeout(300);
  ok(await p.evaluate(() => planTraj?.rows?.length === 4 && planPruefen().find(x => /Trajektor/.test(x.text)).ok) && (await p.textContent("#pTraj")).includes("km/h"), "Trajektorien nach Neustart weiterhin in der Planung");
  await p.evaluate(() => zeige("trajektoren"));

  // ---- Ausrüstung: Ballon ----
  await p.evaluate(() => zeige("ausruestung")); await p.click("#gNeu");
  const fr = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  await p.fill("#gBallon", "oe-zxy"); await p.fill("#gTyp", "Cameron O-105"); await p.fill("#gVol", "3000"); await p.fill("#gLeer", "260"); await p.fill("#gMax", "120"); await p.fill("#gWart", fr); await p.fill("#gPruef", "2027-05-01"); await p.fill("#gNotiz", "Hülle neu 2025");
  await p.click('#gDlg button[value="ok"]'); await p.waitForTimeout(200);
  const g = await p.evaluate(() => stamm.ausruestung.find(x => x.ballon === "OE-ZXY"));
  ok(g && g.ballontyp === "Cameron O-105" && g.wartung === fr && g.notiz === "Hülle neu 2025", "Ballon anlegen (Kennzeichen in Großbuchstaben, alle Felder)");
  await p.evaluate(() => zeige("dashboard")); ok((await p.textContent("#termine")).includes("OE-ZXY"), "Wartung in 10 Tagen erscheint bei den Fristen");
  await p.evaluate(() => zeige("ausruestung"));
  p.dialoge.length = 0; await p.click("#gNeu"); await p.fill("#gBallon", "OE-ZAB"); await p.click('#gDlg button[value="ok"]'); await p.waitForTimeout(200);
  ok(p.dialoge.some(m => m.includes("schon vorhanden")) && await p.evaluate(() => stamm.ausruestung.filter(x => x.ballon === "OE-ZAB").length === 1), "Doppeltes Kennzeichen wird abgelehnt");
  await p.click(`#gListe button[data-a="aktiv"][data-id="${g.id}"]`); await p.waitForTimeout(200);
  ok(await p.evaluate(() => stamm.ballon === "OE-ZXY" && stamm.ballontyp === "Cameron O-105" && stamm.leergewicht === "260"), "„Aktiv setzen“ übernimmt den Ballon in die Einstellungen");
  await p.click(`#gListe button[data-a="edit"][data-id="${g.id}"]`); await p.fill("#gLeer", "265"); await p.click('#gDlg button[value="ok"]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => stamm.leergewicht === "265"), "Aktiven Ballon bearbeiten aktualisiert die Einstellungen");
  await p.click(`#gListe button[data-a="del"][data-id="${g.id}"]`); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !stamm.ausruestung.some(x => x.ballon === "OE-ZXY") && !stamm.ballon), "Aktiven Ballon löschen (Einstellungen geleert)");

  // ---- Ausrüstung: Fahrzeug ----
  await p.click("#vNeu"); await p.selectOption("#vArt", "Anhänger"); await p.fill("#vName", "Hänger"); await p.fill("#vKz", "GU-123AB"); await p.fill("#vPruef", fr); await p.fill("#vNotiz", "Reifen neu");
  await p.click('#vDlg button[value="ok"]'); await p.waitForTimeout(200);
  const v = await p.evaluate(() => stamm.fahrzeuge?.[0]);
  ok(v && v.art === "Anhänger" && v.kennzeichen === "GU-123AB" && v.notiz === "Reifen neu" && (await p.textContent("#vListe")).includes("GU-123AB"), "Anhänger anlegen");
  await p.evaluate(() => zeige("dashboard")); ok((await p.textContent("#termine")).includes("Anhänger GU-123AB"), "Pickerl-Termin bei den Fristen");
  await p.evaluate(() => zeige("ausruestung")); await p.click('#vListe button[data-a="edit"]'); await p.fill("#vName", ""); await p.fill("#vKz", ""); p.dialoge.length = 0; await p.click('#vDlg button[value="ok"]'); await p.waitForTimeout(200);
  ok(p.dialoge.some(m => m.includes("Bezeichnung")) && await p.evaluate(() => stamm.fahrzeuge[0].name === "Hänger"), "Fahrzeug ohne Namen wird abgelehnt, alter Stand bleibt");
  await p.click('#vListe button[data-a="del"]'); await p.waitForTimeout(200); ok(await p.evaluate(() => !stamm.fahrzeuge.length), "Fahrzeug löschen");

  // ---- Einstellungen: Auswahllisten, Felder, Monitor ----
  await p.evaluate(() => zeige("einstellungen"));
  await p.selectOption("#pilotSel", "Bernd"); await p.waitForTimeout(100);
  ok(await p.evaluate(() => stamm.pilot === "Bernd") && await p.inputValue("#pilot") === "Bernd", "Gespeicherten Piloten auswählen");
  const opt = await p.evaluate(() => [...document.getElementById("ballonSel").options].map(o => o.value).find(v => v.startsWith("OE-ZCD")));
  await p.selectOption("#ballonSel", opt); await p.waitForTimeout(100);
  ok(await p.evaluate(() => stamm.ballon === "OE-ZCD"), "Gespeicherten Ballon auswählen");
  await p.fill("#ballontyp", "Z 90 neu"); await p.dispatchEvent("#ballontyp", "change"); await p.fill("#maintenance", "2027-04-01"); await p.dispatchEvent("#maintenance", "change"); await p.waitForTimeout(100);
  ok(await p.evaluate(() => stamm.ballontyp === "Z 90 neu" && stamm.maintenance === "2027-04-01" && stamm.ausruestung.find(x => x.ballon === "OE-ZCD").wartung === "2027-04-01"), "Ballontyp und Wartung speichern (auch in der Ausrüstung)");
  await p.fill("#mS", "2"); await p.dispatchEvent("#mS", "input"); await p.fill("#mL", "1"); await p.dispatchEvent("#mL", "input"); await p.dispatchEvent("#mS", "change"); await p.dispatchEvent("#mL", "change"); await p.waitForTimeout(100);
  await p.evaluate(() => zeige("dashboard"));
  const mt = await p.textContent("#monitor");
  ok(mt.includes("/ 2") && mt.includes("/ 1") && await p.evaluate(() => mon.erforderlicheStunden === 2 && mon.erforderlicheLandungen === 1), "Monitor-Vorgaben (2 h, 1 Landung) übernommen: " + mt.replace(/\s+/g, " ").slice(0, 90));

  // ---- Update-Hinweis und Installieren ----
  await p.evaluate(() => { document.getElementById("update").hidden = false; });
  const nav = p.waitForNavigation({ timeout: 5000 }).then(() => true).catch(() => false); await p.click("#updateB"); ok(await nav, "„Jetzt laden“ lädt die neue Version");
  await c1.close();
  const [c2, q] = await neu([OHNE_CLOUD]);
  await q.goto(URL0); await q.waitForTimeout(500);
  await q.evaluate(() => { const e = new Event("beforeinstallprompt", { cancelable: true }); e.prompt = () => { window.__installiert = true; }; e.userChoice = Promise.resolve({ outcome: "accepted" }); dispatchEvent(e); });
  ok(await q.isVisible("#wInstallB"), "Installier-Knopf erscheint, wenn der Browser es anbietet");
  await q.click("#wInstallB"); await q.waitForTimeout(200); ok(await q.evaluate(() => window.__installiert === true), "„App installieren“ öffnet den Installationsdialog");
  await c2.close();

  // ---- Passwort vergessen (Anmeldefenster und Einstellungen) ----
  const [c3, r] = await neu([]);
  const DB = new Map(); await c3.exposeBinding("__db", (_, op, path, val, merge) => { if (op === "get") return DB.get(path) ?? null; if (op === "list") { const k = path.split("/").length + 1; return [...DB].filter(([x]) => x.startsWith(path + "/") && x.split("/").length === k); } if (op === "set") DB.set(path, merge ? { ...(DB.get(path) || {}), ...val } : val); if (op === "del") DB.delete(path); return null; });
  await r.goto(URL0); await r.waitForTimeout(800);
  await r.click("#torReset"); await r.waitForTimeout(200);
  ok((await r.textContent("#torStatus")).length > 0 && await r.evaluate(() => !(window.__resets || []).length), "Passwort vergessen ohne E-Mail: Hinweis, nichts gesendet: " + await r.textContent("#torStatus"));
  await r.fill("#torEmail", "admin@test.at"); await r.click("#torReset"); await r.waitForTimeout(300);
  ok(await r.evaluate(() => (window.__resets || []).includes("admin@test.at")), "Passwort vergessen: Rücksetz-Mail angefordert (" + await r.textContent("#torStatus") + ")");
  await c3.close();

  // ---- Konto löschen mit „Auch die Daten auf diesem Gerät löschen“ ----
  const [c4, s] = await neu([() => { if (sessionStorage.__neuKonto) return; sessionStorage.__neuKonto = 1; window.__fakeUsers = { "gast@test.at": { pw: "geheim1", uid: "GASTUID000000000000000000001", verified: true } }; sessionStorage.__fakeLogin = "gast@test.at"; localStorage.willkommen = "1"; localStorage.zugang = "GASTUID000000000000000000001"; localStorage.fluege = JSON.stringify([{ id: "x", startzeit: "2026-01-01T06:00:00Z", flugzeit: 30, landungen: 1 }]); }]);
  const DB2 = new Map([["freigaben/GASTUID000000000000000000001", { email: "gast@test.at" }]]);
  await c4.exposeBinding("__db", (_, op, path, val, merge) => { if (op === "get") return DB2.get(path) ?? null; if (op === "list") { const k = path.split("/").length + 1; return [...DB2].filter(([x]) => x.startsWith(path + "/") && x.split("/").length === k); } if (op === "set") DB2.set(path, merge ? { ...(DB2.get(path) || {}), ...val } : val); if (op === "del") DB2.delete(path); return null; });
  await s.goto(URL0 + "#einstellungen"); await s.waitForTimeout(1500);
  await s.click("#cDel"); await s.check("#kLokal"); await s.fill("#kPass", "geheim1"); await s.click("#kOk"); await s.waitForTimeout(2000);
  ok(await s.evaluate(() => !localStorage.fluege && !localStorage.zugang) && ![...DB2.keys()].some(k => k.includes("GASTUID")), "Konto löschen mit Häkchen: Cloud und Gerät leer");
  await c4.close();

  await b.close();
  ext.filter(x => x.startsWith("UNERWARTET")).forEach(x => log.push("FEHLER " + x));
  console.log(log.join("\n"));
})();
