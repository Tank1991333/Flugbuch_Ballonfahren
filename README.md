# 🎈 Ballonflugbuch Professional V10

Digitales, browserbasiertes Flugbuch für Heißluftballonfahrer.

## Funktionen

- GPS-basierter Start- und Landeort
- Automatische Aufzeichnung der Flugroute
- Anzeige der Flugroute auf einer Leaflet-Karte
- Standardkarte und Satellitenkarte
- Berechnung der zurückgelegten Strecke
- Berechnung der durchschnittlichen Geschwindigkeit
- Berechnung der maximalen Geschwindigkeit
- Höhenprofil mit Chart.js
- Maximale, minimale und durchschnittliche Höhe
- Monatsstatistik der Fahrten
- Wetterdaten über Open-Meteo
- Sonnenaufgang und Sonnenuntergang
- Windrichtung und Windgeschwindigkeit
- Lokale Speicherung im Browser
- Aktivitätsmonitor für Fahrten und Landungen
- Persönliche Rekorde
- Anzeige aller gespeicherten Fahrten auf der Karte
- JSON-Backup
- JSON-Import
- CSV-Import
- Duplikatprüfung beim Import
- Responsive Ansicht für Desktop, Tablet und Smartphone

## Dateien

- `index.html`
- `style.css`
- `app.js`
- `map.js`
- `weather.js`
- `monitor.js`
- `README.md`

## Installation

Alle sieben Dateien müssen gemeinsam im Hauptverzeichnis der Anwendung liegen.

Die Anwendung muss über HTTPS oder über `localhost` geöffnet werden, damit die Browser-Standortfunktionen verwendet werden können.

GitHub Pages verwendet HTTPS und ist deshalb für diese Anwendung geeignet.

## GitHub Pages aktivieren

1. Repository auf GitHub öffnen.
2. `Settings` auswählen.
3. `Pages` auswählen.
4. Unter `Build and deployment` die Option `Deploy from a branch` auswählen.
5. Als Branch `main` auswählen.
6. Als Ordner `/ (root)` auswählen.
7. Auf `Save` klicken.

## Fahrtenimport

Die Anwendung unterstützt:

- JSON-Dateien mit einem Array aus Fahrten
- JSON-Backups mit dem Feld `fluege`
- JSON-Dateien mit dem Feld `fahrten`
- CSV-Dateien mit Semikolon
- CSV-Dateien mit Komma
- Deutsche Datumsangaben
- ISO-Datumsangaben
- Österreichische Dezimalzahlen mit Komma

## Beispiel für eine CSV-Datei

```csv
Startzeit;Endezeit;Pilot;Kennzeichen;Ballontyp;Startort;Landeort;Flugzeit;Strecke;Landungen;Bemerkung
12.09.2026 06:15;12.09.2026 07:42;Max Mustermann;OE-BAL;Kubicek BB45;Hartberg;Kaindorf;87;24,6;1;Ruhige Morgenfahrt
28.08.2026 05:50;28.08.2026 07:05;Max Mustermann;OE-BAL;Kubicek BB45;Gleisdorf;Pischelsdorf;75;19,4;2;Gute Sicht
