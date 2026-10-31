// Startet einen kleinen Webserver für die App (Port 8765) und führt alle Testreihen nacheinander aus.
// Aufruf: npm test   oder   node tests/run.js [name …]
// Erfolgreich, wenn jede Reihe mindestens ein „OK“ meldet und keine Zeile mit FEHLER/UNERWARTET erscheint.
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const ROOT = path.resolve(__dirname, ".."), PORT = 8765;
const TYPEN = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const REIHEN = ["ablauf", "backup", "fw", "idb", "mailtag", "neu", "profil", "speicher", "abgleich", "tor", "wake", "daten", "verfolger", "datenschutz", "csp"];

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT + path.sep) || f.startsWith(__dirname) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPEN[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});

const lauf = name => new Promise(ok => {
  const pr = spawn(process.execPath, [path.join(__dirname, name + ".js")], { cwd: __dirname });
  let out = "";
  pr.stdout.on("data", d => out += d); pr.stderr.on("data", d => out += d);
  const t = setTimeout(() => { pr.kill(); out += "\nFEHLER Zeitüberschreitung"; }, 5 * 60e3);
  pr.on("close", code => { clearTimeout(t); ok({ name, out, code }); });
});

server.listen(PORT, async () => {
  const wahl = process.argv.slice(2), liste = wahl.length ? REIHEN.filter(r => wahl.includes(r)) : REIHEN;
  let fehler = 0;
  for (const name of liste) {
    const { out, code } = await lauf(name), zeilen = out.split("\n");
    const ok = zeilen.filter(z => z.startsWith("OK")).length, schlecht = zeilen.filter(z => !z.startsWith("OK") && /FEHLER|UNERWARTET|Error:/.test(z));
    const gut = ok > 0 && !schlecht.length && code === 0;
    if (!gut) fehler++;
    console.log(`${gut ? "✔" : "✘"} ${name}: ${ok} OK${schlecht.length ? ", " + schlecht.length + " Fehler" : ""}${code ? ", Exit " + code : ""}`);
    if (!gut) console.log(out.split("\n").filter(z => !z.startsWith("OK")).map(z => "    " + z).join("\n"));
  }
  server.close();
  console.log(fehler ? `\n${fehler} Testreihe(n) fehlgeschlagen.` : "\nAlle Testreihen bestanden.");
  process.exit(fehler ? 1 : 0);
});
