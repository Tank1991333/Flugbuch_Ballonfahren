# 🎈 Ballonflugbuch Professional

Digitales, browserbasiertes Flugbuch für Heißluftballonfahrer.

## Funktionen

- GPS-basierter Start- und Landeort
- Automatische Aufzeichnung der Flugroute
- Anzeige der Flugroute auf einer Leaflet-Karte
- Standard- und Satellitenkarte
- Berechnung der zurückgelegten Strecke
- Ermittlung der durchschnittlichen Geschwindigkeit
- Ermittlung der maximalen Geschwindigkeit
- Höhenprofil mit Chart.js
- Maximale, minimale und durchschnittliche Höhe
- Wetterdaten über Open-Meteo
- Sonnenaufgang und Sonnenuntergang
- Windrichtung und Windgeschwindigkeit
- Lokale Speicherung der Flüge im Browser
- Flugstatistik mit Flugzeit, Kilometern und Landungen
- Anzeige gespeicherter Flüge auf der Karte

## Dateien

- `index.html`
- `style.css`
- `app.js`
- `map.js`
- `weather.js`

## Verwendung

Die Anwendung muss über HTTPS aufgerufen werden, damit die GPS-Funktionen im Browser verwendet werden können.

GitHub Pages verwendet HTTPS und ist deshalb für diese Anwendung geeignet.

## GitHub Pages aktivieren

1. Repository auf GitHub öffnen.
2. `Settings` auswählen.
3. `Pages` auswählen.
4. Unter `Build and deployment` die Option `Deploy from a branch` auswählen.
5. Als Branch `main` auswählen.
6. Als Ordner `/ (root)` auswählen.
7. Auf `Save` klicken.

Nach einigen Minuten ist die Anwendung über GitHub Pages erreichbar.

## Datenspeicherung

Alle Flugdaten werden im `localStorage` des Browsers gespeichert.

Das bedeutet:

- Die Daten befinden sich nur auf dem verwendeten Gerät.
- Andere Geräte besitzen keine automatische Synchronisierung.
- Beim Löschen der Browserdaten können auch die Flugdaten gelöscht werden.
- Der private Browsermodus kann die dauerhafte Speicherung verhindern.

## Benötigte Browserberechtigungen

Die Anwendung benötigt Zugriff auf den Standort des Geräts.

Beim ersten Öffnen fragt der Browser nach der Standortberechtigung. Diese Berechtigung muss erlaubt werden, damit folgende Funktionen verfügbar sind:

- Startposition
- Landeposition
- Flugroute
- Wetterdaten am aktuellen Standort

## Externe Dienste

Die Anwendung verwendet folgende externe Dienste:

- Leaflet für die Kartendarstellung
- OpenStreetMap für die Standardkarte
- Esri für die Satellitenkarte
- Chart.js für das Höhenprofil
- Open-Meteo für Wetterdaten
- Nominatim für die Ermittlung von Ortsnamen

## Hinweis zur Flugsicherheit

Die angezeigte Wetterbewertung ist nur eine vereinfachte technische Einschätzung anhand der Windgeschwindigkeit.

Sie ersetzt keine professionelle Flugwetterberatung und keine eigenverantwortliche Prüfung der tatsächlichen Wetter- und Flugbedingungen.

## Version

Ballonflugbuch Professional V9
