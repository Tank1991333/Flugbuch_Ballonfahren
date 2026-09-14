# 🎈 Ballonflugbuch Professional V10

Browserbasiertes digitales Flugbuch für Heißluftballonfahrer im dunklen Professional-Dashboard-Stil.

## Funktionen

- GPS-basierte Ermittlung der Startposition
- Kontinuierliche Aufzeichnung der Flugroute
- GPS-basierte Ermittlung der Landeposition
- Leaflet-Karte
- Satellitenkarte von Esri
- Standardkarte von OpenStreetMap
- Anzeige einzelner gespeicherter Flüge
- Gemeinsame Darstellung aller gespeicherten Flüge
- Start- und Landemarkierungen
- Berechnung der zurückgelegten Strecke
- Berechnung der durchschnittlichen Geschwindigkeit
- Berechnung der maximalen Geschwindigkeit
- Ermittlung der maximalen Höhe
- Ermittlung der minimalen Höhe
- Ermittlung der durchschnittlichen Höhe
- Höhenprofil mit Chart.js
- Monatsstatistik der letzten zwölf Monate
- Persönliche Rekorde
- Gesamtstatistik
- Aktivitätsmonitor
- Frei einstellbarer Betrachtungszeitraum
- Frei einstellbare Mindestanzahl an Fahrten
- Frei einstellbare Mindestanzahl an Landungen
- Anzeige des nächsten Fluges, der aus dem Zeitraum fällt
- Wetterdaten über Open-Meteo
- Sonnenaufgang und Sonnenuntergang
- Windgeschwindigkeit
- Windrichtung
- Luftfeuchtigkeit
- Luftdruck
- Ortsnamen über Nominatim
- Speicherung der Flugdaten im localStorage
- Speicherung der Pilot- und Ballondaten
- Speicherung des Wartungsdatums
- JSON-Backup
- JSON-Wiederherstellung
- Responsive Darstellung für Desktop, Tablet und Smartphone

## Dateien

Die Anwendung besteht aus folgenden Dateien:

- `index.html`
- `style.css`
- `app.js`
- `map.js`
- `weather.js`
- `monitor.js`
- `README.md`

Alle Dateien müssen gemeinsam im gleichen Verzeichnis liegen.

## Installation

1. Ein neues GitHub-Repository erstellen.
2. Alle sieben Dateien in das Stammverzeichnis des Repositorys hochladen.
3. Das Repository auf GitHub öffnen.
4. `Settings` auswählen.
5. `Pages` auswählen.
6. Unter `Build and deployment` die Option `Deploy from a branch` auswählen.
7. Als Branch `main` auswählen.
8. Als Ordner `/ (root)` auswählen.
9. Auf `Save` klicken.
10. Einige Minuten warten.
11. Die von GitHub bereitgestellte HTTPS-Adresse öffnen.

## HTTPS

Die Anwendung benötigt HTTPS, damit Standortfunktionen im Browser verwendet werden können.

GitHub Pages stellt die Anwendung automatisch über HTTPS bereit.

Bei einer lokalen Entwicklung kann die Anwendung auch über `localhost` geöffnet werden.

Das direkte Öffnen der Datei über eine Adresse wie:

`file:///C:/.../index.html`

kann dazu führen, dass die GPS-Funktion nicht verfügbar ist.

## Browserberechtigungen

Beim ersten Aufruf fragt der Browser nach dem Zugriff auf den Standort.

Der Zugriff muss erlaubt werden, damit folgende Funktionen arbeiten:

- Startposition
- Flugroute
- Landeposition
- Wetterdaten am aktuellen Standort
- Ortsnamen von Start und Landung

## Datenspeicherung

Die Anwendung speichert Flüge und Einstellungen im `localStorage` des Browsers.

Das bedeutet:

- Die Daten befinden sich nur auf dem verwendeten Gerät und im verwendeten Browser.
- Andere Geräte besitzen keine automatische Synchronisierung.
- Beim Löschen der Browserdaten können die Flugdaten gelöscht werden.
- Im privaten Browsermodus können Daten möglicherweise nicht dauerhaft gespeichert werden.
- Ein regelmäßiges JSON-Backup wird empfohlen.

## Backup erstellen

1. In der linken Navigation `Backup` auswählen.
2. Der Browser lädt eine JSON-Datei herunter.
3. Diese Datei sicher speichern.

Das Backup enthält:

- alle gespeicherten Flüge
- alle Trackpunkte
- Flugzeiten
- Strecken
- Höhenwerte
- Geschwindigkeitswerte
- Landungen
- Bemerkungen

## Backup importieren

1. In der linken Navigation `Import` auswählen.
2. Eine zuvor exportierte JSON-Datei auswählen.
3. Den Import bestätigen.

Hinweis: Beim Import werden die derzeit gespeicherten Flüge durch die Daten aus der Backup-Datei ersetzt.

## Aktivitätsmonitor

Der Aktivitätsmonitor verwendet standardmäßig folgende Werte:

- Betrachtungszeitraum: 24 Monate
- Erforderliche Fahrten: 30
- Erforderliche Landungen: 40

Die Einstellungen können am unteren Ende der Anwendung geändert werden.

Die Monitoreinstellungen werden ebenfalls lokal im Browser gespeichert.

## Externe Dienste

Die Anwendung verwendet folgende externe Dienste:

- Leaflet für die Kartendarstellung
- OpenStreetMap für die Standardkarte
- Esri World Imagery für die Satellitenkarte
- Chart.js für Diagramme
- Open-Meteo für Wetterdaten
- Nominatim für die Ermittlung von Ortsnamen

Für Karten, Wetterdaten und Ortsnamen ist eine aktive Internetverbindung erforderlich.

## Hinweis zur Flugsicherheit

Die Wetteranzeige und die Wetterbewertung sind nur eine vereinfachte technische Darstellung.

Die angezeigte Bewertung berücksichtigt insbesondere nicht alle für eine Ballonfahrt relevanten Bedingungen.

Die Anwendung ersetzt nicht:

- professionelle Flugwetterberatung
- behördliche Wetterinformationen
- NOTAM-Prüfungen
- Luftraumprüfungen
- Windmessungen am Startplatz
- eigenverantwortliche Sicherheitsentscheidungen
- Herstellerangaben
- gesetzliche oder betriebliche Vorgaben

Die Entscheidung über die Durchführung einer Ballonfahrt liegt vollständig in der Verantwortung des Piloten beziehungsweise des verantwortlichen Luftfahrers.

## Version

Ballonflugbuch Professional V10
