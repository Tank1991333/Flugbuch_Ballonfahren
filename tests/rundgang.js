// Rundgang: alle Seiten (auch Cockpit während der Aufzeichnung) und Dialoge, 3 Größen, hell/dunkel; JS-Fehler, Konsolenfehler, seitliches Überlaufen, abgeschnittene Elemente
const { chromium, devices } = require("playwright");
const { routes, GPS, OHNE_CLOUD } = require("./mocks");
const SEITEN = ["dashboard", "fahrt", "flugbuch", "karte", "wetter", "rechner", "trajektoren", "ausruestung", "gas", "einstellungen"];
const DIALOGE = ["dlg", "fDlg", "nDlg", "gDlg", "vDlg", "endDlg", "kDlg", "neuDlg", "fwDlg"];
(async () => {
  const b = await chromium.launch(), funde = new Set(), ext = [], geprueft = [];
  const daten = () => {
    localStorage.willkommen = "1";
    localStorage.stammdaten = JSON.stringify({ pilot: "Daniel Heschl-Stumpf", ballon: "OE-ZAB", ballontyp: "Schroeder Fire Balloons G 30/24", volumen: "3000", leergewicht: "250", maxtemp: "120",
      ausruestung: [{ id: "g", ballon: "OE-ZAB", ballontyp: "Schroeder Fire Balloons G 30/24", volumen: "3000", leergewicht: "250", maxtemp: "120", wartung: "2026-12-01", pruefung: "2026-11-20" }],
      flaschen: [{ id: "f1", name: "Flasche Süd mit sehr langem Namen 40 l", kap: "40", fuell: "32", tara: "18", pruefung: "2026-11-10" }],
      fahrzeuge: [{ id: "v", art: "Anhänger", name: "Hänger groß", pruefung: "2027-03-01" }],
      gasLog: [{ id: "n1", datum: "2026-10-01", flasche: "f1", kg: 20.4, liter: 40, preisL: 0.85, preis: "34", notiz: "Tankstelle Gleisdorf Süd GmbH" }],
      profil: { name: "Daniel Heschl-Stumpf", lizenz: "AT.FCL.BPL.12345", medical: "2026-12-24", check: "2027-02-01" } });
    localStorage.fluege = JSON.stringify(Array.from({ length: 3 }, (_, i) => ({ id: "f" + i, startzeit: `2026-0${i + 5}-01T06:00:00Z`, endezeit: `2026-0${i + 5}-01T07:30:00Z`, flugzeit: 90, strecke: 23.4, landungen: 1, pilot: "Daniel Heschl-Stumpf", ballon: "OE-ZAB", startOrt: "Gleisdorf, Steiermark, Österreich", landeOrt: "Sankt Margarethen an der Raab", startLat: 47.1, startLng: 15.7, landeLat: 47.12, landeLng: 15.9, maxHoehe: 1200, gas: 22, bemerkung: "Ruhige Fahrt, leichter Wind aus West.", plan: i ? null : { erstellt: "2026-05-01T05:00:00Z", ballon: { ballon: "OE-ZAB" } } })));
  };
  for (const [gname, g] of [["320", { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }], ["Pixel7", devices["Pixel 7"]], ["Desktop", { viewport: { width: 1280, height: 800 } }]]) {
    for (const thema of ["light", "dark"]) {
      const c = await b.newContext({ ...g, colorScheme: thema, locale: "de-AT" }); await routes(c, ext); await c.addInitScript(GPS); await c.addInitScript(OHNE_CLOUD); await c.addInitScript(daten);
      const p = await c.newPage(), w = `${gname}/${thema}`;
      p.on("pageerror", e => funde.add(`JS-FEHLER ${w}: ${e.message}`));
      p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) funde.add(`KONSOLE ${w}: ${m.text().slice(0, 160)}`); });
      p.on("dialog", d => d.dismiss());
      await p.goto("http://localhost:8765/"); await p.waitForTimeout(600);
      const pruefen = async ort => {
        const r = await p.evaluate(() => {
          const W = document.documentElement.clientWidth, out = [];
          if (document.documentElement.scrollWidth > W + 1) out.push("Seite scrollt seitlich (" + document.documentElement.scrollWidth + " > " + W + ")");
          const offen = document.querySelector("dialog[open]"), wurzel = offen || document.querySelector(".seite:not([hidden])") || document.body;
          for (const el of wurzel.querySelectorAll("button, input, select, textarea, label, h1, h2, h3, p, b, .kpi, .card, .zeile, table")) {
            if (el.closest(".leaflet-container, .tabelle, [hidden], details:not([open])") || !el.offsetParent) continue;
            const q = el.getBoundingClientRect(); if (!q.width) continue;
            if (q.right > W + 1 || q.left < -1) out.push(`ragt heraus: <${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}> ${Math.round(q.left)}–${Math.round(q.right)} (Breite ${W}) „${(el.textContent || el.value || "").trim().slice(0, 30)}“`);
            if (/^(BUTTON|B|H1|H2|H3)$/.test(el.tagName) && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== "visible") out.push(`Text abgeschnitten: <${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}> „${el.textContent.trim().slice(0, 30)}“`);
          }
          return [...new Set(out)].slice(0, 6);
        });
        r.forEach(x => funde.add(`${w} ${ort}: ${x}`));
      };
      for (const s of SEITEN) { await p.evaluate(s => zeige(s), s); await p.waitForTimeout(s === "karte" || s === "rechner" ? 700 : 300); await pruefen("Seite " + s); }
      await p.evaluate(() => { zeige("fahrt"); document.getElementById("startB").click(); }); await p.waitForTimeout(1200); await pruefen("Cockpit während der Aufzeichnung");
      await p.evaluate(() => document.getElementById("stopB").click()); await p.waitForTimeout(200); await p.evaluate(() => document.getElementById("endDlg").open && document.getElementById("endDlg").close("x")); geprueft.push(w);
      await p.evaluate(() => zeige("einstellungen"));
      for (const d of DIALOGE) {
        const da = await p.evaluate(d => { const x = document.getElementById(d); if (!x) return false; try { x.showModal(); return true; } catch { return false; } }, d);
        if (!da) { funde.add(`${w}: Dialog ${d} nicht gefunden`); continue; }
        await p.waitForTimeout(150); await pruefen("Dialog " + d);
        const h = await p.evaluate(d => { const x = document.getElementById(d), r = x.getBoundingClientRect(); return { h: r.height, vh: innerHeight, sc: x.scrollHeight > x.clientHeight + 2, ov: getComputedStyle(x).overflowY }; }, d);
        if (h.h > h.vh + 1) funde.add(`${w} Dialog ${d}: höher als der Bildschirm (${Math.round(h.h)} > ${h.vh})`);
        if (h.sc && !/auto|scroll/.test(h.ov)) funde.add(`${w} Dialog ${d}: Inhalt abgeschnitten, nicht scrollbar`);
        await p.evaluate(d => document.getElementById(d).close(), d);
      }
      // Planungs-PDF (Vorschau) ohne Fehler erzeugen
      await p.evaluate(() => { zeige("rechner"); }); await p.waitForTimeout(400);
      const pdf = await p.evaluate(async () => { let blob; const alt = window.dateiAusgeben; window.dateiAusgeben = x => { blob = x; }; try { planPdf({ plan: planSnapshot() }); } finally { window.dateiAusgeben = alt; } return blob ? (await blob.text()).slice(0, 8) : "kein PDF"; });
      if (pdf !== "%PDF-1.4") funde.add(`${w}: Planungs-PDF fehlerhaft (${pdf})`);
      for (const extra of ["datenschutz.html", "verfolgen.html#abcdefghijkmnpqrstuvwxyz"]) {
        await p.goto("http://localhost:8765/" + extra); await p.waitForTimeout(900);
        const sw = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (sw > 1) funde.add(`${w} ${extra}: scrollt seitlich (${sw}px)`);
      }
      await c.close();
    }
  }
  ext.filter(x => x.startsWith("UNERWARTET")).forEach(x => funde.add(x));
  console.log([...geprueft.map(w => "OK   " + w + ": alle Seiten und Dialoge geprüft"), ...[...funde].map(x => "FEHLER " + x)].join("\n"));
  await b.close();
})();
