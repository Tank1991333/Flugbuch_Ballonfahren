"use strict";
// Kleiner PDF-Ersteller ohne Bibliothek (offline, kostenlos): A4, Schrift Helvetica mit deutschen Umlauten,
// Überschriften, Zeilen mit Wert rechts, Absätze mit Umbruch, Tabellen, automatische Seitenumbrüche und Seitenzahlen.
function pdfDokument(titel) {
  const W = 595.28, H = 841.89, R = 48, B = W - 2 * R;
  // Zeichenbreiten von Helvetica (1/1000 der Schriftgröße) für ASCII 32–126; andere Zeichen ungefähr
  const BR = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015,
    667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
    556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const BRF = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975,
    722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333,
    556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584]; // Helvetica-Bold
  const BLF = { "ö": 611, "ü": 611, "Ä": 722 };
  const BL = { "\u00a0": 278, "°": 400, "³": 333, "²": 333, "·": 278, "±": 584, "Ä": 667, "Ö": 778, "Ü": 722, "ß": 611, "Ø": 778, "–": 556, "—": 1000, "…": 1000, "„": 333, "“": 333 };
  const WIN = { "€": 128, "‚": 130, "„": 132, "…": 133, "‘": 145, "’": 146, "“": 147, "”": 148, "•": 149, "–": 150, "—": 151 };
  const ERSATZ = { "✓": "OK", "✔": "OK", "✕": "X", "✘": "X", "→": "->", "≈": "ca.", "≥": ">=", "≤": "<=", " ": " ", " ": " " };
  const sauber = t => [...String(t ?? "")].map(c => ERSATZ[c] ?? c).join("");
  const breite = (t, g, fett) => [...sauber(t)].reduce((s, c) => { const k = c.charCodeAt(0); return s + (k >= 32 && k <= 126 ? (fett ? BRF : BR)[k - 32] : (fett && BLF[c]) || BL[c] || 556); }, 0) * g / 1000;
  const kodiere = t => [...sauber(t)].map(c => {
    const k = c.charCodeAt(0);
    if (c === "(" || c === ")" || c === "\\") return "\\" + c;
    if (k >= 32 && k <= 126) return c;
    const w = k >= 160 && k <= 255 ? k : WIN[c];
    return w ? "\\" + w.toString(8).padStart(3, "0") : "?";
  }).join("");
  const farbe = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255].map(x => (x / 255).toFixed(3)).join(" "); };
  const AKZ = "#C2410C", GRAU = "#6B5B4B", TEXT = "#2B2118", LINIE = "#E8D9C6", FLAECHE = "#F6E7D3";
  const seiten = []; let s, y;
  const neueSeite = () => { s = []; seiten.push(s); y = H - R; };
  const platz = h => { if (y - h < R + 24) neueSeite(); };
  const schreib = (t, x, yy, g, fett, f = TEXT) => s.push(`BT /${fett ? "F2" : "F1"} ${g} Tf ${farbe(f)} rg ${x.toFixed(2)} ${yy.toFixed(2)} Td (${kodiere(t)}) Tj ET`);
  const linie = (x1, y1, x2, y2, f = LINIE, d = 0.6) => s.push(`${farbe(f)} RG ${d} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  const flaeche = (x, yy, w, h, f) => s.push(`${farbe(f)} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  const umbrechen = (t, g, w, fett) => sauber(t).split("\n").flatMap(abs => {
    const z = []; let akt = "";
    for (const wort of abs.split(/ +/)) {
      const v = akt ? akt + " " + wort : wort;
      if (breite(v, g, fett) <= w || !akt) akt = v; else { z.push(akt); akt = wort; }
    }
    return [...z, akt];
  });
  const kuerzen = (t, g, w, fett) => { let x = sauber(t); if (breite(x, g, fett) <= w) return x; while (x && breite(x + "…", g, fett) > w) x = x.slice(0, -1); return x + "…"; };
  neueSeite();
  const d = {
    titel(t, unter) {
      schreib(t, R, y - 22, 22, true, AKZ); y -= 30;
      if (unter) { schreib(unter, R, y - 12, 10, false, GRAU); y -= 18; }
      linie(R, y - 4, W - R, y - 4, AKZ, 1.2); y -= 14;
    },
    abschnitt(t) { platz(46); y -= 10; schreib(t, R, y - 13, 13, true, AKZ); y -= 20; },
    zeile(a, b, opt = {}) { // Bezeichnung links, Wert rechts (bei Platzmangel umgebrochen)
      const g = 10, wa = Math.min(breite(a, g, opt.fett), B * 0.45), zl = umbrechen(b, g, B - wa - 16, opt.fett);
      platz(zl.length * 13 + 6);
      schreib(kuerzen(a, g, B * 0.45, opt.fett), R, y - 11, g, !!opt.fett, opt.grau ? GRAU : TEXT);
      zl.forEach((t, i) => schreib(t, W - R - breite(t, g, true), y - 11 - i * 13, g, true, opt.farbe || TEXT));
      y -= zl.length * 13 + 4; linie(R, y, W - R, y); y -= 2;
    },
    absatz(t, opt = {}) {
      const g = opt.groesse || 10;
      umbrechen(t, g, B).forEach(z => { platz(g + 4); schreib(z, R, y - g, g, !!opt.fett, opt.grau ? GRAU : TEXT); y -= g + 4; });
      y -= 4;
    },
    tabelle(kopf, zeilen, anteile) { // Spalten rechtsbündig außer der ersten
      const g = 9.5, w = anteile.map(a => a * B), x0 = w.map((_, i) => R + w.slice(0, i).reduce((a, b) => a + b, 0));
      const zelle = (t, i, yy, fett, f) => { const k = kuerzen(t, g, w[i] - 8, fett); schreib(k, i ? x0[i] + w[i] - 4 - breite(k, g, fett) : x0[i] + 4, yy, g, fett, f); };
      const kopfZeile = () => { platz(36); flaeche(R, y - 17, B, 17, FLAECHE); kopf.forEach((t, i) => zelle(t, i, y - 12, true, GRAU)); y -= 19; };
      kopfZeile();
      zeilen.forEach(z => { if (y - 15 < R + 24) { neueSeite(); kopfZeile(); } z.forEach((t, i) => zelle(t, i, y - 11, false, TEXT)); y -= 15; linie(R, y + 1, W - R, y + 1); });
      y -= 6;
    },
    abstand(h) { y -= h; },
    blob() {
      const n = seiten.length, obj = [];
      // Fußzeile auf jeder Seite
      seiten.forEach((sp, i) => { s = sp; linie(R, R - 6, W - R, R - 6); schreib(titel, R, R - 20, 8, false, GRAU); const t = `Seite ${i + 1} von ${n}`; schreib(t, W - R - breite(t, 8), R - 20, 8, false, GRAU); });
      obj.push("<< /Type /Catalog /Pages 2 0 R >>");
      obj.push(`<< /Type /Pages /Kids [${seiten.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] /Count ${n} >>`);
      obj.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
      obj.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
      seiten.forEach((sp, i) => {
        const inhalt = sp.join("\n");
        obj.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
        obj.push(`<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`);
      });
      obj.push(`<< /Title (${kodiere(titel)}) /Producer (Ballonflugbuch) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}Z) >>`);
      let out = "%PDF-1.4\n"; const pos = [];
      obj.forEach((o, i) => { pos.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
      const xref = out.length;
      out += `xref\n0 ${obj.length + 1}\n0000000000 65535 f \n` + pos.map(p => String(p).padStart(10, "0") + " 00000 n \n").join("");
      out += `trailer\n<< /Size ${obj.length + 1} /Root 1 0 R /Info ${obj.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      return new Blob([out], { type: "application/pdf" }); // nur ASCII, daher Zeichen = Bytes
    }
  };
  return d;
}
