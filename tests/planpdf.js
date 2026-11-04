// Fahrtplanung als PDF: Vorschau in der Planung, Anhang an die Fahrt beim Start, Abruf im Flugbuch, Nachtragen mit Planung
const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD } = require("./mocks");
const fs = require("fs"), { execFileSync } = require("child_process");
const text = f => execFileSync("pdftotext", ["-layout", f, "-"]).toString().replace(/[\u00a0\u202f]/g, " ");
(async () => {
  const b = await chromium.launch(), log = [], ok = (c, t) => log.push((c ? "OK   " : "FEHLER ") + t), ext = [];
  const c = await b.newContext({ ...devices["Desktop Chrome"], acceptDownloads: true }); await routes(c, ext); await c.addInitScript(GPS); await c.addInitScript(OHNE_CLOUD);
  await c.addInitScript(() => { if (sessionStorage.__da) return; sessionStorage.__da = 1; localStorage.willkommen = "1";
    localStorage.stammdaten = JSON.stringify({ pilot: "Anna Müller", ballon: "OE-ZAB", ballontyp: "Schroeder G", volumen: "3000", leergewicht: "250", maxtemp: "120",
      ausruestung: [{ id: "g", ballon: "OE-ZAB", ballontyp: "Schroeder G", volumen: "3000", leergewicht: "250", maxtemp: "120", wartung: "2030-01-01" }],
      flaschen: [{ id: "f1", name: "Flasche Süd (40 l)", kap: "40", fuell: "32", tara: "18", pruefung: "2030-01-01" }, { id: "f2", name: "Flasche 2", kap: "40", fuell: "30", tara: "18", pruefung: "2030-01-01" }] }); });
  const p = await c.newPage(); p.on("pageerror", e => log.push("JS-FEHLER " + e.message)); const dlg = []; p.on("dialog", d => { dlg.push(d.message()); d.accept(); });
  await p.goto("http://localhost:8765/"); await p.waitForTimeout(500);
  await p.evaluate(() => zeige("rechner")); await p.waitForTimeout(300);
  await p.check('#gSel input[data-id="f1"]'); await p.check('#gSel input[data-id="f2"]');
  await p.click("#zPass"); await p.waitForTimeout(100);
  await p.evaluate(() => { const r = document.querySelector("#zListe .zrow, .zrow"); r.querySelector(".za").value = "3"; r.querySelector(".zk").value = "80"; r.querySelector(".za").dispatchEvent(new Event("input", { bubbles: true })); });
  await p.fill("#rT", "12"); await p.fill("#rH", "350"); await p.fill("#rI", "95"); await p.dispatchEvent("#rI", "input"); await p.waitForTimeout(200);
  await p.evaluate(() => { planTrajSpeichern({ erstellt: Date.now(), start: Date.now() + 36e5, lat: 47.07, lon: 15.44, dauer: 1.5, rows: Array.from({ length: 40 }, (_, i) => ({ h: 100 + i * 100, richtung: 240 + i, tempo: 12.5 + i / 10, dist: 18 + i / 3 })) }); });
  await p.check('#pCheck input[data-k="w"]');
  const [vd] = await Promise.all([p.waitForEvent("download"), p.click("#pPdf")]);
  const vf = await vd.path(), vt = text(vf), roh = fs.readFileSync(vf); if (process.env.PDFDUMP) { fs.copyFileSync(vf, process.env.PDFDUMP); console.log(vt); }
  ok(roh.slice(0, 8).toString() === "%PDF-1.4" && /%%EOF\s*$/.test(roh.toString()), "Vorschau ist eine PDF-Datei (" + roh.length + " Bytes, Name " + vd.suggestedFilename() + ")");
  ok(vt.includes("Fahrtplanung") && vt.includes("Vorschau, noch keine Fahrt"), "Vorschau mit Titel und Hinweis");
  ok(vt.includes("OE-ZAB") && vt.includes("Schroeder G") && vt.includes("3 000 m³"), "Ballondaten mit m³");
  ok(vt.includes("Flasche Süd (40 l)") && vt.includes("62 kg"), "Gasflaschen mit Umlauten und Gesamtgas");
  ok(/Passagier/.test(vt) && vt.includes("240 kg"), "Zuladung (3 × 80 kg)");
  ok(vt.includes("12 °C") && vt.includes("Freier Auftrieb") && vt.includes("Nötige Hüllentemperatur"), "Bedingungen und Auftrieb");
  ok(vt.includes("OK Gasflaschen gewählt") && vt.includes("OK Wetter und Windprofil geprüft") && vt.includes("nicht abgehakt"), "Prüfung und Checkliste");
  const seiten = (vt.match(/Seite \d von (\d)/) || [])[1];
  ok(vt.includes("4 000 m") && +seiten >= 2 && vt.includes("Höhe") && (vt.match(/Richtung/g) || []).length >= 2, `Lange Trajektorien-Tabelle über ${seiten} Seiten mit wiederholtem Kopf`);
  ok(execFileSync("pdfinfo", [vf]).toString().includes("Ballonflugbuch"), "PDF-Metadaten lesbar (pdfinfo)");
  // Fahrt aus der Planung starten und beenden -> Planung hängt an der Fahrt
  await p.evaluate(() => document.getElementById("pStart").click()); await p.waitForTimeout(1200);
  for (let i = 1; i <= 4; i++) await p.evaluate(i => __gps(47.07 + i * 2e-3, 15.44 + i * 2e-3, 500 + i * 30, 5), i);
  await p.evaluate(() => document.getElementById("stopB").click()); await p.click("#endDlg button[value=ok]"); await p.waitForTimeout(800);
  await p.evaluate(() => zeige("flugbuch")); await p.waitForTimeout(200);
  ok(await p.isVisible('#liste button[data-a="pdf"]'), "Flugbuch-Eintrag hat „📄 Planung“");
  const [fd] = await Promise.all([p.waitForEvent("download"), p.click('#liste button[data-a="pdf"]')]);
  const ft = text(await fd.path()); if (process.env.PDFDUMP) console.log(ft);
  ok(ft.includes("Fahrt vom") && ft.includes("Anna Müller") && ft.includes("UTM 33N") && ft.includes("Freier Auftrieb"), "PDF aus dem Flugbuch mit Fahrtdaten und Planung");
  ok(/^Fahrtplanung-\d{4}-\d\d-\d\d-OE-ZAB\.pdf$/.test(fd.suggestedFilename()), "Dateiname: " + fd.suggestedFilename());
  // Nach Neustart (aus gespeicherten Daten) weiterhin abrufbar
  await p.reload(); await p.waitForTimeout(500); await p.evaluate(() => zeige("flugbuch"));
  const [rd] = await Promise.all([p.waitForEvent("download"), p.click('#liste button[data-a="pdf"]')]);
  ok(text(await rd.path()).includes("Freier Auftrieb"), "Nach Neustart weiterhin als PDF abrufbar");
  // Nachtragen mit Anhang der aktuellen Planung (Planung wurde in dieser Sitzung geöffnet)
  await p.evaluate(() => zeige("rechner")); await p.waitForTimeout(200); await p.evaluate(() => zeige("flugbuch"));
  await p.click("#fNach"); await p.waitForTimeout(200);
  ok(await p.isVisible("#ePlanK"), "Nachtragen bietet „Aktuelle Fahrtplanung anhängen“");
  await p.fill("#eStartZ", "06:10"); await p.fill("#eEndeZ", "07:20"); await p.check("#ePlan"); await p.click("#eOk"); await p.waitForTimeout(300);
  ok(await p.evaluate(() => fluege.filter(f => f.plan).length === 2 && !!fluege.find(f => f.manuell).plan.auftrieb), "Nachgetragene Fahrt hat die Planung");
  await p.click('#liste article:has(.badge) button[data-a="edit"]'); await p.waitForTimeout(200);
  ok(!(await p.isVisible("#ePlanK")), "Fahrt mit Planung: kein zweites Anhängen beim Bearbeiten");
  await p.click('#dlg button[value="x"]');
  // Sonderzeichen, die die Schrift nicht kennt, und Klammern brechen das PDF nicht
  const kaputt = await p.evaluate(() => { const d = pdfDokument("Test (a) \\\\ b"); d.titel("Täst ✓ → ≈ 🎈 (x)"); d.absatz("x".repeat(500)); const s = []; return d.blob().text(); });
  ok(kaputt.includes("Test \\(a\\)") && !/[^\x09\x0a\x0d\x20-\x7e]/.test(kaputt), "Nur ASCII im PDF, Klammern maskiert, Emoji ersetzt");
  await b.close();
  ext.filter(x => x.startsWith("UNERWARTET")).forEach(x => log.push("FEHLER " + x));
  console.log(log.join("\n"));
})();
