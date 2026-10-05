# 🎈 Ballonflugbuch Professional

Digitales, browserbasiertes Flugbuch für Heißluftballonfahrer. Läuft kostenlos auf GitHub Pages, ohne Server und ohne Schlüssel.

## Seiten (Menü links oben ☰)

- **Übersicht:** Fahrten, Landungen, Flugzeit, Kilometer, Aktivitätsmonitor, Rekorde
- **Fahrt:** Cockpit mit Geschwindigkeit, Höhe, Kurs, Genauigkeit, Karte, Höhenprofil, Steig-/Sinkrate; Aufzeichnung mit Landung und Markierungen
- **Flugbuch:** alle Fahrten mit Bearbeiten, Löschen und Anzeige auf der Karte
- **Karte:** gespeicherte Fahrten und Live-Standort, Stile Hybrid und Standard, Link zur VFR/ICAO-Karte
- **Wetter:** Temperatur, Wind in 10 m und 80 m, Böen, Sonnenaufgang und -untergang
- **Trajektoren:** Winddrift-Simulation (ICON-D2 bis 180 m, GFS ab 200 m) für heute und morgen
- **Einstellungen:** Pilot und Ballon (mit Auswahl zuletzt benutzter), Wartung, Aktivitätsmonitor, Backup und Import

## Besonderheiten

- Alle Koordinaten werden als UTM angezeigt (gespeichert wird intern Breite/Länge)
- Laufende Fahrt wird laufend gesichert und kann nach Absturz oder Neuladen fortgesetzt werden
- Orte werden im Hintergrund ermittelt und bei fehlendem Netz später nachgeladen
- Offline-Start über Service Worker (Karten und Wetter brauchen Internet)
- JSON-Backup und -Import mit Duplikatprüfung

## Dateien im Hauptverzeichnis

`index.html`, `style.css`, `app.js`, `trajektoren.js`, `sw.js`, `favicon.svg`, `manifest.webmanifest`, `README.md` sowie die Symbole `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`

Der Prüf-Workflow gehört nach `.github/workflows/validate.yml`.

## Dienste (alle kostenlos, ohne API-Key)

Leaflet (Karte), OpenStreetMap (Standardkarte, Ortssuche über Nominatim), Esri World Imagery mit Straßen und Ortsnamen (Hybridkarte), Open-Meteo (Wetter, ICON-D2 und GFS).

## Voraussetzungen

HTTPS oder `localhost` und erteilte Standortberechtigung. Die Aufzeichnung sollte im Vordergrund bleiben, da mobile Browser Hintergrundprozesse pausieren können.

## Installation (GitHub Pages)

1. Alle Dateien in das Hauptverzeichnis des Repositorys laden.
2. **Settings → Pages**: Branch `main`, Verzeichnis `/ (root)`.
3. Nach kurzer Zeit ist die App unter der angezeigten HTTPS-Adresse erreichbar.

## Lokal testen

```bash
python3 -m http.server 8000
```

Danach `http://localhost:8000` öffnen.

## Hinweis

Wetter und Trajektoren sind unverbindliche Modellrechnungen und ersetzen weder die offizielle Flugwetterberatung noch die Flugvorbereitung.
