# 🎈 Ballonflugbuch Professional

Digitales, browserbasiertes Flugbuch für Heißluftballonfahrer. Läuft kostenlos auf GitHub Pages, ohne Server und ohne Schlüssel.

## Seiten (Menü links oben ☰)

- **Übersicht:** Fahrten, Landungen, Flugzeit, Kilometer, Aktivitätsmonitor, Rekorde
- **Verfolger-Link:** während der Aufzeichnung (mit Konto) einen Link fürs Rückholteam teilen; `verfolgen.html` zeigt Position, Spur, Höhe, Entfernung und Navigation – ohne Anmeldung, endet mit der Landung bzw. nach 12 Stunden
- **Fahrt:** Cockpit mit Geschwindigkeit, Höhe, Kurs, Genauigkeit, Karte, Höhenprofil, Steig-/Sinkrate; Aufzeichnung mit Landung und Markierungen
- **Flugbuch:** alle Fahrten mit Bearbeiten, Löschen und Anzeige auf der Karte; Fahrten ohne GPS lassen sich nachtragen
- **Karte:** ausgewählte Fahrten (je Fahrt eigene Farbe, Auswahl über „Fahrten wählen“) und Live-Standort, Stile Hybrid und Standard, zuschaltbare Luftfahrt-Ebene (open flightmaps, nicht amtlich), Link zur VFR/ICAO-Karte
- **Wetter:** Temperatur, Wind in 10 m und 80 m, Böen, Sonnenaufgang und -untergang
- **Trajektoren:** Winddrift-Simulation (ICON-D2 bis 180 m, GFS ab 200 m) für heute und morgen
- **Einstellungen:** Pilotenprofil (Name, Lizenznummer, Checkfahrt, Medical, eigene Einträge – alle Fristen mit Resttagen auf der Startseite), Pilot und Ballon (mit Auswahl zuletzt benutzter), Wartung, Aktivitätsmonitor, Backup und Import

## Besonderheiten

- Alle Koordinaten werden als UTM angezeigt (gespeichert wird intern Breite/Länge)
- Laufende Fahrt wird laufend gesichert und kann nach Absturz oder Neuladen fortgesetzt werden
- Orte werden im Hintergrund ermittelt und bei fehlendem Netz später nachgeladen
- Offline-Start über Service Worker (Karten und Wetter brauchen Internet)
- GPS-Spuren liegen in IndexedDB (Platz für Tausende Fahrten), Fahrten und Einstellungen in localStorage; ältere Daten werden beim ersten Start automatisch umgezogen (mit Sicherung)
- JSON-Backup (inkl. Spuren) und -Import mit Duplikatprüfung
- Erste Schritte für neue Nutzer, Hinweis bei neuer Version, Datenschutzhinweis mit Löschfunktionen

## Dateien im Hauptverzeichnis

`index.html`, `style.css`, `app.js`, `trajektoren.js`, `sync.js`, `firebase-config.js`, `sw.js`, `favicon.svg`, `manifest.webmanifest`, `README.md` sowie die Symbole `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`

Der Prüf-Workflow gehört nach `.github/workflows/validate.yml`.

## Dienste (alle kostenlos, ohne API-Key)

Leaflet (Karte), OpenStreetMap (Standardkarte, Ortssuche über Nominatim), Esri World Imagery mit Straßen und Ortsnamen (Hybridkarte), open flightmaps (Luftfahrt-Ebene, nicht-kommerziell, nicht amtlich), Open-Meteo (Wetter, ICON-D2 und GFS).

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

## Konto und Synchronisierung (optional, kostenlos)

Mit einem Konto (E-Mail und Passwort) sind Fahrten und Einstellungen auf jedem Gerät gleich. Ohne Einrichtung arbeitet die App nur lokal.

1. In der Firebase-Konsole ein Projekt anlegen und eine Web-App hinzufügen.
2. Die Werte `apiKey`, `authDomain`, `projectId`, `appId` in `firebase-config.js` eintragen.
3. **Authentication → Anmeldemethode:** E-Mail/Passwort aktivieren.
4. **Firestore Database** anlegen (Region `eur3`, Europa) und diese Regeln veröffentlichen:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

5. **Authentication → Einstellungen → Autorisierte Domains:** die GitHub-Pages-Domain (`name.github.io`) hinzufügen.

### Freigabe für andere Benutzer (optional)

Mit `adminUid` in `firebase-config.js` darf zwar jeder ein Konto anlegen, die Cloud funktioniert aber erst nach Freischaltung durch den Administrator (Einstellungen → Freischaltung). Dazu in Firestore diese Regeln verwenden und `ADMIN_UID` durch die eigene Benutzer-ID (Einstellungen → Konto) ersetzen:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function istAdmin() { return request.auth != null && request.auth.uid == "ADMIN_UID"; }
    function bestaetigt() { return request.auth != null && request.auth.token.email_verified == true; }
    function freigegeben() { return bestaetigt() && exists(/databases/$(database)/documents/freigaben/$(request.auth.uid)); }
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid && (istAdmin() || freigegeben());
    }
    match /anfragen/{uid} {
      allow create, update: if bestaetigt() && request.auth.uid == uid
                            && request.resource.data.keys().hasOnly(["email", "zeit"]) && request.resource.data.email == request.auth.token.email;
      allow read, delete: if request.auth != null && (request.auth.uid == uid || istAdmin());
    }
    match /freigaben/{uid} {
      allow read: if request.auth != null && (request.auth.uid == uid || istAdmin());
      allow write: if istAdmin();
      allow delete: if request.auth != null && request.auth.uid == uid; // beim Löschen des eigenen Kontos
    }
    match /live/{token} { // Verfolger-Link: lesbar mit dem Link, solange gültig; schreiben nur der eigene, freigeschaltete Pilot
      allow get: if resource.data.ablauf > request.time.toMillis();
      allow create: if (istAdmin() || freigegeben()) && token.size() >= 20 && request.resource.data.uid == request.auth.uid
                    && request.resource.data.ablauf <= request.time.toMillis() + 46800000;
      allow update: if (istAdmin() || freigegeben()) && resource.data.uid == request.auth.uid
                    && request.resource.data.uid == request.auth.uid && request.resource.data.ablauf == resource.data.ablauf;
      allow delete: if request.auth != null && resource.data.uid == request.auth.uid;
    }
    match /rueckmeldungen/{id} {
      allow create: if (istAdmin() || freigegeben()) && request.resource.data.uid == request.auth.uid
                    && request.resource.data.keys().hasOnly(["uid", "email", "text", "zeit", "version", "geraet"])
                    && request.resource.data.text is string && request.resource.data.text.size() <= 4000;
      allow read, delete: if istAdmin();
    }
  }
}
```

Rückmeldungen (Einstellungen → Rückmeldung) erscheinen beim Administrator unter Einstellungen → Freischaltung.

Freischaltungs-Anfragen sind nur mit bestätigter E-Mail-Adresse möglich (die App schickt nach der Registrierung einen Bestätigungslink), damit sich niemand unter der Adresse eines anderen ausgeben kann.

Im Freigabe-Modus ist die App selbst gesperrt: Wer den Link öffnet, sieht nur den Anmeldebildschirm. Nach der Anmeldung erscheint bis zur Freischaltung „Dein Konto wartet auf die Freischaltung“. Die Freischaltung wird je Gerät gemerkt, damit das Flugbuch auch ohne Netz startet. Die Sperre ist eine Eingangstür; geschützt sind die Daten durch die Firestore-Regeln.

Hinweise: Der Abgleich liest nur seit dem letzten Mal geänderte Fahrten (vollständig beim ersten Mal, über „Jetzt synchronisieren“ und wöchentlich). Unter Konto lässt sich das eigene Konto samt Cloud-Daten löschen. Sehr lange Tracks (über 4.000 Punkte) werden in der Cloud ausgedünnt. Auf einem Gerät mit Daten eines anderen Kontos fragt die App vor dem Anmelden nach.

## Sicherheit (alles kostenlos)

- Die App setzt eine Content-Security-Policy (im `<head>` von `index.html`, wirkt auf Vercel und GitHub Pages). Wird das kleine Design-Skript im `<head>` geändert, muss der `sha256`-Wert in der Policy angepasst werden – der Prüf-Workflow meldet das.
- `vercel.json` setzt zusätzliche Kopfzeilen (kein Einbetten in fremde Seiten, `nosniff`, Referrer- und Berechtigungs-Richtlinie).
- Daten aus Import und Cloud werden vereinheitlicht und vor der Anzeige maskiert.
- Empfohlene Einstellungen in Firebase bzw. Google Cloud (einmalig):
  1. **Google Cloud Console → APIs & Dienste → Anmeldedaten → Browser-Schlüssel**: unter „Website-Einschränkungen“ nur `flugbuch-ballonfahren.vercel.app/*`, `tank1991333.github.io/*` und `ballonflugbuch.firebaseapp.com/*` erlauben.
  2. **Firebase → Authentication → Einstellungen**: „Schutz vor E-Mail-Aufzählung“ aktiv lassen; unter „Passwortrichtlinie“ mindestens 8 Zeichen verlangen.
  3. Firestore-Regeln aus diesem README veröffentlichen.

## Hinweis

Wetter und Trajektoren sind unverbindliche Modellrechnungen und ersetzen weder die offizielle Flugwetterberatung noch die Flugvorbereitung.
