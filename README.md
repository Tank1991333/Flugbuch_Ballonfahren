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
- Automatische Aufzeichnung der Flugroute
- Live-Anzeige des aktuellen Standorts
- Anzeige von Breitengrad und Längengrad
- Anzeige der GPS-Höhe
- Anzeige der GPS-Genauigkeit
- Anzeige der aktuellen GPS-Geschwindigkeit
- Standardkarte und Satellitenkarte
- Link zur offiziellen VFR/ICAO-Karte von Austro Control
- Berechnung der zurückgelegten Strecke
- Berechnung der durchschnittlichen Geschwindigkeit
- Berechnung der maximalen Geschwindigkeit
- Höhenprofil mit Chart.js
- Monatsstatistik
- Aktivitätsmonitor
- Persönliche Rekorde
- Wetterdaten über Open-Meteo
- Sonnenaufgang und Sonnenuntergang
- Windgeschwindigkeit und Windrichtung
- Lokale Speicherung im Browser
- JSON-Backup
- JSON-Import
- CSV-Import
- Duplikatprüfung beim Import
- Responsive Ansicht für Desktop, Tablet und Smartphone

## Dateien

Diese Dateien liegen im Hauptverzeichnis:

- `index.html`
- `style.css`
- `app.js`
- `README.md`

Der GitHub-Workflow liegt unter:

- `.github/workflows/validate.yml`

Die Funktionen für Karte, Wetter und Aktivitätsmonitor sind in `app.js`
integriert. Separate Dateien wie `map.js`, `weather.js` oder `monitor.js`
werden nicht benötigt.

## Externe Bibliotheken und Dienste

Die Anwendung verwendet folgende externe Bibliotheken und Dienste:

- Leaflet für die Kartendarstellung
- Chart.js für Diagramme und Statistiken
- OpenStreetMap für die Standardkarte
- Esri World Imagery für die Satellitenkarte
- Nominatim für die Ermittlung von Ortsnamen
- Open-Meteo für Wetterdaten
- Austro Control als externer Verweis zur offiziellen VFR/ICAO-Karte

Für Kartendarstellung, Wetterdaten und Ortsabfragen wird eine aktive
Internetverbindung benötigt.

## Wichtige Voraussetzungen

Die Anwendung muss über HTTPS oder über `localhost` geöffnet werden.

Beim ersten Start muss die Standortberechtigung im Browser erteilt
werden.

Die GPS-Funktionen stehen normalerweise nicht zur Verfügung, wenn die
Datei direkt über eine lokale Adresse wie `file:///` geöffnet wird.

GitHub Pages verwendet HTTPS und ist deshalb für diese Anwendung
geeignet.

## Installation

1. Alle Projektdateien in das Hauptverzeichnis des Repositorys kopieren.
2. Sicherstellen, dass mindestens folgende Dateien vorhanden sind:

   ```text
   index.html
   style.css
   app.js
   README.md
