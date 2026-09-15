# 🎈 Ballonflugbuch Professional V10

Digitales, browserbasiertes Flugbuch für Heißluftballonfahrer.

## Ansichten

- Übersicht
- Fahrt erfassen
- Flugbuch
- Karte und Live-Standort
- Statistiken
- Wetter
- Einstellungen

## Funktionen

- GPS-basierter Start- und Landeort
- automatische Aufzeichnung der Flugroute
- Live-Anzeige des aktuellen Standorts
- Anzeige von Breitengrad und Längengrad
- GPS-Höhe
- GPS-Genauigkeit
- aktuelle GPS-Geschwindigkeit
- Standardkarte und Satellitenkarte
- Link zur offiziellen VFR/ICAO-Karte von Austro Control
- Berechnung der Strecke
- durchschnittliche Geschwindigkeit
- maximale Geschwindigkeit
- Höhenprofil
- Monatsstatistik
- Aktivitätsmonitor
- persönliche Rekorde
- Wetterdaten über Open-Meteo
- JSON-Backup
- JSON-Import
- CSV-Import
- Duplikatprüfung
- responsive Ansicht

## Dateien

Diese Dateien liegen im Hauptverzeichnis:

- `index.html`
- `style.css`
- `app.js`
- `README.md`

Der GitHub-Workflow liegt unter:

- `.github/workflows/validate.yml`

## Wichtige Voraussetzung

Die Anwendung muss über HTTPS oder über `localhost` geöffnet werden.

Beim ersten Start muss die Standortberechtigung im Browser erteilt
werden.

## GitHub Pages aktivieren

1. Repository auf GitHub öffnen.
2. `Settings` auswählen.
3. `Pages` auswählen.
4. Unter `Build and deployment` die Option `Deploy from a branch`
   auswählen.
5. Branch `main` auswählen.
6. Ordner `/ (root)` auswählen.
7. `Save` auswählen.

## CSV-Beispiel

```csv
Startzeit;Endezeit;Pilot;Kennzeichen;Ballontyp;Startort;Landeort;Flugzeit;Strecke;Landungen;Bemerkung
12.09.2026 06:15;12.09.2026 07:42;Max Mustermann;OE-BAL;Kubicek BB45;Hartberg;Kaindorf;87;24,6;1;Ruhige Morgenfahrt
28.08.2026 05:50;28.08.2026 07:05;Max Mustermann;OE-BAL;Kubicek BB45;Gleisdorf;Pischelsdorf;75;19,4;2;Gute Sicht
