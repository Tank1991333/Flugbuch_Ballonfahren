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
- Berechnung der zurückgelegten Strecke
- Berechnung der durchschnittlichen Geschwindigkeit
- Berechnung der maximalen Geschwindigkeit
- Höhenprofil mit Chart.js
- Monatsstatistik
- Aktivitätsmonitor
- persönliche Rekorde
- Wetterdaten über Open-Meteo
- Sonnenaufgang und Sonnenuntergang
- JSON-Backup
- JSON-Import
- CSV-Import
- Duplikatprüfung beim Import
- responsive Darstellung

## Dateien

Folgende Dateien müssen gemeinsam im Hauptverzeichnis liegen:

- `index.html`
- `style.css`
- `app.js`
- `README.md`

## Voraussetzungen

Die Anwendung muss über HTTPS oder über `localhost` geöffnet werden.

Die Standortfunktionen funktionieren normalerweise nicht, wenn die
Datei direkt über `file://` geöffnet wird.

Beim ersten Start muss die Standortberechtigung im Browser erteilt
werden.

## GitHub Pages aktivieren

1. Repository auf GitHub öffnen.
2. `Settings` auswählen.
3. `Pages` auswählen.
4. Unter `Build and deployment` die Option `Deploy from a branch`
   auswählen.
5. Als Branch `main` auswählen.
6. Als Ordner `/ (root)` auswählen.
7. `Save` auswählen.

## CSV-Beispiel
