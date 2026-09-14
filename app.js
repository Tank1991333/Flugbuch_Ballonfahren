// =====================================
// Ballonflugbuch Professional V9
// app.js
// =====================================

"use strict";

// =====================================
// Globale Variablen
// =====================================

let fluege = ladeGespeicherteFluege();

let aktuellerFlug = null;
let trackpunkte = [];
let watchId = null;
let hoehenChart = null;
let flugWirdBeendet = false;

// =====================================
// Hilfsfunktionen
// =====================================

function ladeGespeicherteFluege() {
    try {
        const gespeicherteDaten = localStorage.getItem("fluege");

        if (!gespeicherteDaten) {
            return [];
        }

        const daten = JSON.parse(gespeicherteDaten);

        return Array.isArray(daten) ? daten : [];
    } catch (error) {
        console.error(
            "Gespeicherte Flugdaten konnten nicht gelesen werden:",
            error
        );

        return [];
    }
}

function fluegeLokalSpeichern() {
    try {
        localStorage.setItem(
            "fluege",
            JSON.stringify(fluege)
        );

        return true;
    } catch (error) {
        console.error(
            "Flugdaten konnten nicht gespeichert werden:",
            error
        );

        alert(
            "Die Flugdaten konnten nicht gespeichert werden. " +
            "Möglicherweise ist der lokale Speicher voll."
        );

        return false;
    }
}

function element(id) {
    return document.getElementById(id);
}

function setStatus(text, statusKlasse = "") {
    const statusElement = element("status");

    if (!statusElement) {
        return;
    }

    statusElement.textContent = text;
    statusElement.className = statusKlasse;
}

function setzeButtonStatus({
    startenDeaktiviert,
    beendenDeaktiviert,
    speichernDeaktiviert
}) {
    const startButton = element("startButton");
    const stopButton = element("stopButton");
    const saveButton = element("saveButton");

    if (startButton) {
        startButton.disabled = startenDeaktiviert;
    }

    if (stopButton) {
        stopButton.disabled = beendenDeaktiviert;
    }

    if (saveButton) {
        saveButton.disabled = speichernDeaktiviert;
    }
}

function textBereinigen(wert) {
    if (wert === null || wert === undefined) {
        return "";
    }

    return String(wert).trim();
}

function htmlSicher(wert) {
    const div = document.createElement("div");

    div.textContent =
        wert === null || wert === undefined
            ? ""
            : String(wert);

    return div.innerHTML;
}

function formatZahl(wert, nachkommastellen = 0) {
    const zahl = Number(wert);

    if (!Number.isFinite(zahl)) {
        return "-";
    }

    return zahl.toLocaleString(
        "de-AT",
        {
            minimumFractionDigits: nachkommastellen,
            maximumFractionDigits: nachkommastellen
        }
    );
}

function formatDatumUndZeit(wert) {
    if (!wert) {
        return "-";
    }

    const datum = new Date(wert);

    if (Number.isNaN(datum.getTime())) {
        return "-";
    }

    return datum.toLocaleString(
        "de-AT",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}

function geolocationFehlermeldung(error) {
    if (!error) {
        return "Die Position konnte nicht ermittelt werden.";
    }

    switch (error.code) {
        case error.PERMISSION_DENIED:
            return (
                "Der Zugriff auf den Standort wurde verweigert. " +
                "Bitte erlaube den Standortzugriff im Browser."
            );

        case error.POSITION_UNAVAILABLE:
            return "Der aktuelle Standort ist nicht verfügbar.";

        case error.TIMEOUT:
            return (
                "Die Standortabfrage hat zu lange gedauert. " +
                "Bitte versuche es erneut."
            );

        default:
            return "Bei der Standortabfrage ist ein Fehler aufgetreten.";
    }
}

// =====================================
// Ortsname ermitteln
// =====================================

async function ortName(lat, lng) {
    try {
        const url =
            "https://nominatim.openstreetmap.org/reverse" +
            `?format=jsonv2&lat=${encodeURIComponent(lat)}` +
            `&lon=${encodeURIComponent(lng)}` +
            "&zoom=10&addressdetails=1";

        const response = await fetch(
            url,
            {
                headers: {
                    "Accept": "application/json",
                    "Accept-Language": "de"
                }
            }
        );

        if (!response.ok) {
            throw new Error(
                `Ortsabfrage fehlgeschlagen: ${response.status}`
            );
        }

        const data = await response.json();
        const adresse = data.address || {};

        return (
            adresse.city ||
            adresse.town ||
            adresse.village ||
            adresse.municipality ||
            adresse.hamlet ||
            adresse.county ||
            data.display_name ||
            "Unbekannt"
        );
    } catch (error) {
        console.error(
            "Ortsname konnte nicht ermittelt werden:",
            error
        );

        return "Unbekannt";
    }
}

// =====================================
// Entfernung mit Haversine-Formel
// Rückgabewert in Kilometern
// =====================================

function entfernung(lat1, lon1, lat2, lon2) {
    const koordinaten = [
        lat1,
        lon1,
        lat2,
        lon2
    ].map(Number);

    if (
        koordinaten.some(
            (wert) => !Number.isFinite(wert)
        )
    ) {
        return 0;
    }

    const [
        latitude1,
        longitude1,
        latitude2,
        longitude2
    ] = koordinaten;

    const erdradius = 6371;

    const dLat =
        (latitude2 - latitude1) *
        Math.PI /
        180;

    const dLon =
        (longitude2 - longitude1) *
        Math.PI /
        180;

    const a =
        Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +
        Math.cos(latitude1 * Math.PI / 180) *
        Math.cos(latitude2 * Math.PI / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const begrenztesA = Math.min(
        1,
        Math.max(0, a)
    );

    const c =
        2 *
        Math.atan2(
            Math.sqrt(begrenztesA),
            Math.sqrt(1 - begrenztesA)
        );

    return erdradius * c;
}

// =====================================
// Trackpunkt hinzufügen
// =====================================

function trackpunktHinzufuegen(position) {
    const lat = Number(position.coords.latitude);
    const lng = Number(position.coords.longitude);

    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
    ) {
        return;
    }

    const hoehe = Number(position.coords.altitude);
    const speed = Number(position.coords.speed);
    const genauigkeit = Number(position.coords.accuracy);

    const neuerPunkt = {
        lat,
        lng,
        hoehe: Number.isFinite(hoehe) ? hoehe : 0,
        speed:
            Number.isFinite(speed) && speed >= 0
                ? speed
                : 0,
        genauigkeit:
            Number.isFinite(genauigkeit)
                ? genauigkeit
                : null,
        zeit:
            position.timestamp
                ? new Date(position.timestamp).toISOString()
                : new Date().toISOString()
    };

    const letzterPunkt =
        trackpunkte.length > 0
            ? trackpunkte[trackpunkte.length - 1]
            : null;

    if (letzterPunkt) {
        const abstandZumLetztenPunkt = entfernung(
            letzterPunkt.lat,
            letzterPunkt.lng,
            neuerPunkt.lat,
            neuerPunkt.lng
        );

        /*
         * Völlig identische GPS-Punkte werden nicht mehrfach gespeichert.
         * 0,001 km entsprechen ungefähr einem Meter.
         */
        if (abstandZumLetztenPunkt < 0.001) {
            return;
        }
    }

    trackpunkte.push(neuerPunkt);

    if (typeof zeichneTrack === "function") {
        zeichneTrack(trackpunkte);
    }

    zeichneHoehenprofil(trackpunkte);
}

// =====================================
// Flug starten
// =====================================

function flugStarten() {
    if (aktuellerFlug) {
        alert(
            "Es ist bereits eine Fahrt aktiv oder noch nicht gespeichert."
        );

        return;
    }

    if (!navigator.geolocation) {
        alert(
            "Die Standortbestimmung wird von diesem Browser nicht unterstützt."
        );

        return;
    }

    const pilot = textBereinigen(
        element("pilot")?.value
    );

    const ballon = textBereinigen(
        element("ballon")?.value
    ).toUpperCase();

    const ballontyp = textBereinigen(
        element("ballontyp")?.value
    );

    if (!pilot) {
        alert("Bitte einen Piloten eingeben.");
        element("pilot")?.focus();
        return;
    }

    if (!ballon) {
        alert("Bitte ein Ballon-Kennzeichen eingeben.");
        element("ballon")?.focus();
        return;
    }

    setStatus(
        "📡 Startposition wird ermittelt ...",
        "status-working"
    );

    setzeButtonStatus({
        startenDeaktiviert: true,
        beendenDeaktiviert: true,
        speichernDeaktiviert: true
    });

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            try {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const startzeit = new Date();

                const ort = await ortName(lat, lng);

                aktuellerFlug = {
                    id:
                        typeof crypto !== "undefined" &&
                        typeof crypto.randomUUID === "function"
                            ? crypto.randomUUID()
                            : `${Date.now()}-${Math.random()}`,
                    datum: startzeit.toISOString(),
                    pilot,
                    ballon,
                    ballontyp,
                    startOrt: ort,
                    startzeit: startzeit.toISOString(),
                    startLat: lat,
                    startLng: lng
                };

                trackpunkte = [];
                flugWirdBeendet = false;

                if (
                    typeof karteZuruecksetzen === "function"
                ) {
                    karteZuruecksetzen();
                }

                if (
                    typeof setStartMarker === "function"
                ) {
                    setStartMarker(lat, lng);
                }

                trackpunktHinzufuegen(position);

                watchId =
                    navigator.geolocation.watchPosition(
                        trackpunktHinzufuegen,

                        function (error) {
                            console.error(
                                "Fehler beim GPS-Tracking:",
                                error
                            );

                            setStatus(
                                "⚠️ Fahrt läuft, aber das GPS-Signal ist derzeit nicht verfügbar.",
                                "status-warning"
                            );
                        },

                        {
                            enableHighAccuracy: true,
                            maximumAge: 1000,
                            timeout: 15000
                        }
                    );

                setStatus(
                    "✅ Fahrt läuft",
                    "status-running"
                );

                setzeButtonStatus({
                    startenDeaktiviert: true,
                    beendenDeaktiviert: false,
                    speichernDeaktiviert: true
                });
            } catch (error) {
                console.error(
                    "Fahrt konnte nicht gestartet werden:",
                    error
                );

                aktuellerFlug = null;
                trackpunkte = [];

                setStatus(
                    "❌ Fahrt konnte nicht gestartet werden.",
                    "status-error"
                );

                setzeButtonStatus({
                    startenDeaktiviert: false,
                    beendenDeaktiviert: true,
                    speichernDeaktiviert: true
                });
            }
        },

        function (error) {
            console.error(
                "Startposition konnte nicht ermittelt werden:",
                error
            );

            setStatus(
                "❌ " + geolocationFehlermeldung(error),
                "status-error"
            );

            setzeButtonStatus({
                startenDeaktiviert: false,
                beendenDeaktiviert: true,
                speichernDeaktiviert: true
            });
        },

        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15000
        }
    );
}

// =====================================
// Flug beenden
// =====================================

function flugBeenden() {
    if (!aktuellerFlug) {
        alert("Bitte zuerst eine Fahrt starten.");
        return;
    }

    if (flugWirdBeendet) {
        return;
    }

    flugWirdBeendet = true;

    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }

    setStatus(
        "📡 Landeposition wird ermittelt ...",
        "status-working"
    );

    setzeButtonStatus({
        startenDeaktiviert: true,
        beendenDeaktiviert: true,
        speichernDeaktiviert: true
    });

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            try {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const endezeit = new Date();
                const ort = await ortName(lat, lng);

                trackpunktHinzufuegen(position);

                aktuellerFlug.endezeit =
                    endezeit.toISOString();

                aktuellerFlug.landeOrt = ort;
                aktuellerFlug.landeLat = lat;
                aktuellerFlug.landeLng = lng;

                if (
                    typeof setLandingMarker === "function"
                ) {
                    setLandingMarker(lat, lng);
                }

                if (
                    typeof zeichneTrack === "function"
                ) {
                    zeichneTrack(trackpunkte);
                }

                setStatus(
                    "✅ Fahrt beendet. Der Flug kann jetzt gespeichert werden.",
                    "status-finished"
                );

                setzeButtonStatus({
                    startenDeaktiviert: true,
                    beendenDeaktiviert: true,
                    speichernDeaktiviert: false
                });
            } catch (error) {
                console.error(
                    "Fahrt konnte nicht beendet werden:",
                    error
                );

                flugWirdBeendet = false;

                setStatus(
                    "❌ Fahrt konnte nicht beendet werden.",
                    "status-error"
                );

                setzeButtonStatus({
                    startenDeaktiviert: true,
                    beendenDeaktiviert: false,
                    speichernDeaktiviert: true
                });
            }
        },

        function (error) {
            console.error(
                "Landeposition konnte nicht ermittelt werden:",
                error
            );

            flugWirdBeendet = false;

            setStatus(
                "❌ " + geolocationFehlermeldung(error),
                "status-error"
            );

            /*
             * Das Tracking wird wieder gestartet, wenn das Beenden
             * wegen eines GPS-Fehlers nicht möglich war.
             */
            watchId =
                navigator.geolocation.watchPosition(
                    trackpunktHinzufuegen,

                    function (trackingError) {
                        console.error(
                            "Fehler beim GPS-Tracking:",
                            trackingError
                        );
                    },

                    {
                        enableHighAccuracy: true,
                        maximumAge: 1000,
                        timeout: 15000
                    }
                );

            setzeButtonStatus({
                startenDeaktiviert: true,
                beendenDeaktiviert: false,
                speichernDeaktiviert: true
            });
        },

        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15000
        }
    );
}

// =====================================
// Flug speichern
// =====================================

function flugSpeichern() {
    if (
        !aktuellerFlug ||
        !aktuellerFlug.endezeit
    ) {
        alert("Bitte die Fahrt zuerst beenden.");
        return;
    }

    const startzeit =
        new Date(aktuellerFlug.startzeit);

    const endezeit =
        new Date(aktuellerFlug.endezeit);

    const differenz =
        endezeit.getTime() - startzeit.getTime();

    const minuten =
        Number.isFinite(differenz) && differenz >= 0
            ? Math.max(
                1,
                Math.round(differenz / 1000 / 60)
            )
            : 0;

    aktuellerFlug.flugzeit = minuten;
    aktuellerFlug.track = [...trackpunkte];

    // =====================================
    // Höhe
    // =====================================

    const hoehen = trackpunkte
        .map((punkt) => Number(punkt.hoehe))
        .filter(
            (hoehe) =>
                Number.isFinite(hoehe) &&
                hoehe !== 0
        );

    aktuellerFlug.maxHoehe =
        hoehen.length > 0
            ? Math.round(Math.max(...hoehen))
            : 0;

    aktuellerFlug.minHoehe =
        hoehen.length > 0
            ? Math.round(Math.min(...hoehen))
            : 0;

    aktuellerFlug.avgHoehe =
        hoehen.length > 0
            ? Math.round(
                hoehen.reduce(
                    (summe, hoehe) =>
                        summe + hoehe,
                    0
                ) / hoehen.length
            )
            : 0;

    // =====================================
    // Geschwindigkeit
    // =====================================

    const geschwindigkeiten =
        trackpunkte
            .map(
                (punkt) =>
                    Number(punkt.speed)
            )
            .filter(
                (speed) =>
                    Number.isFinite(speed) &&
                    speed >= 0
            );

    aktuellerFlug.avgSpeed =
        geschwindigkeiten.length > 0
            ? Math.round(
                (
                    geschwindigkeiten.reduce(
                        (summe, speed) =>
                            summe + speed,
                        0
                    ) /
                    geschwindigkeiten.length
                ) *
                3.6
            )
            : 0;

    const hoechsteGeschwindigkeit =
        geschwindigkeiten.length > 0
            ? Math.max(...geschwindigkeiten) * 3.6
            : 0;

    aktuellerFlug.maxSpeed =
        Math.round(hoechsteGeschwindigkeit);

    // =====================================
    // Strecke
    // =====================================

    let strecke = 0;

    for (
        let index = 1;
        index < trackpunkte.length;
        index += 1
    ) {
        strecke += entfernung(
            trackpunkte[index - 1].lat,
            trackpunkte[index - 1].lng,
            trackpunkte[index].lat,
            trackpunkte[index].lng
        );
    }

    aktuellerFlug.strecke =
        Number(strecke.toFixed(1));

    // =====================================
    // Landungen und Bemerkungen
    // =====================================

    const landungen =
        Number.parseInt(
            element("landungen")?.value,
            10
        );

    aktuellerFlug.landungen =
        Number.isFinite(landungen) &&
        landungen >= 1
            ? landungen
            : 1;

    aktuellerFlug.bemerkung =
        textBereinigen(
            element("bemerkung")?.value
        );

    fluege.push({
        ...aktuellerFlug,
        track: [...trackpunkte]
    });

    if (!fluegeLokalSpeichern()) {
        fluege.pop();
        return;
    }

    zeichneHoehenprofil(trackpunkte);

    const gespeicherterTrack = [...trackpunkte];

    aktuellerFlug = null;
    trackpunkte = [];
    flugWirdBeendet = false;

    if (element("landungen")) {
        element("landungen").value = "1";
    }

    if (element("bemerkung")) {
        element("bemerkung").value = "";
    }

    setStatus(
        "✅ Flug erfolgreich gespeichert.",
        "status-finished"
    );

    setzeButtonStatus({
        startenDeaktiviert: false,
        beendenDeaktiviert: true,
        speichernDeaktiviert: true
    });

    anzeigeAktualisieren();

    if (
        typeof zeichneTrack === "function" &&
        gespeicherterTrack.length > 1
    ) {
        zeichneTrack(gespeicherterTrack);
    }
}

// =====================================
// Höhenprofil
// =====================================

function zeichneHoehenprofil(track) {
    const canvas = element("heightChart");

    if (
        !canvas ||
        typeof Chart === "undefined"
    ) {
        return;
    }

    const sichereTrackdaten =
        Array.isArray(track)
            ? track
            : [];

    if (hoehenChart) {
        hoehenChart.destroy();
        hoehenChart = null;
    }

    const labels =
        sichereTrackdaten.map(
            (_, index) => index + 1
        );

    const hoehen =
        sichereTrackdaten.map(
            (punkt) => {
                const hoehe =
                    Number(punkt.hoehe);

                return Number.isFinite(hoehe)
                    ? Math.round(hoehe)
                    : null;
            }
        );

    hoehenChart = new Chart(
        canvas,
        {
            type: "line",

            data: {
                labels,

                datasets: [
                    {
                        label: "Höhe (m)",
                        data: hoehen,
                        borderColor: "#2563eb",
                        backgroundColor:
                            "rgba(37, 99, 235, 0.18)",
                        borderWidth: 2,
                        pointRadius:
                            sichereTrackdaten.length > 100
                                ? 0
                                : 2,
                        pointHoverRadius: 5,
                        fill: true,
                        tension: 0.25,
                        spanGaps: true
                    }
                ]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                interaction: {
                    intersect: false,
                    mode: "index"
                },

                plugins: {
                    legend: {
                        display: true
                    },

                    tooltip: {
                        callbacks: {
                            title(context) {
                                return (
                                    "Messpunkt " +
                                    context[0].label
                                );
                            }
                        }
                    }
                },

                scales: {
                    x: {
                        title: {
                            display: true,
                            text: "Messpunkt"
                        }
                    },

                    y: {
                        title: {
                            display: true,
                            text: "Höhe in Metern"
                        },

                        beginAtZero: false
                    }
                }
            }
        }
    );
}

// =====================================
// Flug auf Karte anzeigen
// =====================================

function flugAnzeigen(index) {
    const flug = fluege[index];

    if (!flug) {
        return;
    }

    const track =
        Array.isArray(flug.track)
            ? flug.track
            : [];

    if (track.length === 0) {
        alert(
            "Für diesen Flug sind keine Trackdaten gespeichert."
        );

        return;
    }

    if (
        typeof flugAufKarte === "function"
    ) {
        flugAufKarte(track);
    }

    zeichneHoehenprofil(track);

    const mapElement = element("map");

    if (mapElement) {
        mapElement.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }
}

// =====================================
// Löschen
// =====================================

function loeschen(index) {
    const flug = fluege[index];

    if (!flug) {
        return;
    }

    const datum =
        formatDatumUndZeit(
            flug.startzeit || flug.datum
        );

    const bestaetigt = confirm(
        `Soll der Flug vom ${datum} wirklich gelöscht werden?`
    );

    if (!bestaetigt) {
        return;
    }

    const geloeschterFlug =
        fluege.splice(index, 1)[0];

    if (!fluegeLokalSpeichern()) {
        fluege.splice(
            index,
            0,
            geloeschterFlug
        );

        return;
    }

    anzeigeAktualisieren();

    if (
        typeof karteZuruecksetzen === "function"
    ) {
        karteZuruecksetzen();
    }

    zeichneHoehenprofil([]);

    setStatus(
        "🗑 Flug wurde gelöscht.",
        "status-finished"
    );
}

// =====================================
// Dashboard und Flugbuch
// =====================================

function anzeigeAktualisieren() {
    const flugliste = element("flugliste");

    if (!flugliste) {
        return;
    }

    let html = "";
    let gesamtZeit = 0;
    let gesamtLandungen = 0;
    let gesamtKm = 0;

    fluege.forEach(
        function (flug, index) {
            gesamtZeit +=
                Number(flug.flugzeit) || 0;

            gesamtLandungen +=
                Number(flug.landungen) || 0;

            gesamtKm +=
                Number(flug.strecke) || 0;

            const datum =
                formatDatumUndZeit(
                    flug.startzeit || flug.datum
                );

            const endezeit =
                formatDatumUndZeit(
                    flug.endezeit
                );

            const bemerkung =
                flug.bemerkung
                    ? htmlSicher(flug.bemerkung)
                    : "-";

            html += `
                <article class="flight">

                    <div class="flight-header">
                        <div>
                            <h3>${htmlSicher(datum)}</h3>
                            <p class="flight-subtitle">
                                Ende: ${htmlSicher(endezeit)}
                            </p>
                        </div>

                        <span class="flight-number">
                            Flug ${index + 1}
                        </span>
                    </div>

                    <div class="flight-data">

                        <p>
                            <strong>👨‍✈️ Pilot:</strong>
                            ${htmlSicher(flug.pilot || "-")}
                        </p>

                        <p>
                            <strong>🎈 Kennzeichen:</strong>
                            ${htmlSicher(flug.ballon || "-")}
                        </p>

                        <p>
                            <strong>🎈 Ballontyp:</strong>
                            ${htmlSicher(flug.ballontyp || "-")}
                        </p>

                        <p>
                            <strong>📍 Start:</strong>
                            ${htmlSicher(flug.startOrt || "-")}
                        </p>

                        <p>
                            <strong>🏁 Landung:</strong>
                            ${htmlSicher(flug.landeOrt || "-")}
                        </p>

                        <p>
                            <strong>⏱ Flugzeit:</strong>
                            ${formatZahl(flug.flugzeit)} Minuten
                        </p>

                        <p>
                            <strong>🗺 Strecke:</strong>
                            ${formatZahl(flug.strecke, 1)} km
                        </p>

                        <p>
                            <strong>🚀 Durchschnitt:</strong>
                            ${formatZahl(flug.avgSpeed)} km/h
                        </p>

                        <p>
                            <strong>⚡ Maximum:</strong>
                            ${formatZahl(flug.maxSpeed)} km/h
                        </p>

                        <p>
                            <strong>📈 Maximale Höhe:</strong>
                            ${formatZahl(flug.maxHoehe)} m
                        </p>

                        <p>
                            <strong>📉 Minimale Höhe:</strong>
                            ${formatZahl(flug.minHoehe)} m
                        </p>

                        <p>
                            <strong>📊 Durchschnittshöhe:</strong>
                            ${formatZahl(flug.avgHoehe)} m
                        </p>

                        <p>
                            <strong>🛬 Landungen:</strong>
                            ${formatZahl(flug.landungen)}
                        </p>

                    </div>

                    <div class="flight-note">
                        <strong>📝 Bemerkung:</strong>
                        <p>${bemerkung}</p>
                    </div>

                    <div class="flight-actions">

                        <button
                            class="map-button"
                            type="button"
                            onclick="flugAnzeigen(${index})"
                        >
                            🗺 Auf Karte anzeigen
                        </button>

                        <button
                            class="delete"
                            type="button"
                            onclick="loeschen(${index})"
                        >
                            🗑 Löschen
                        </button>

                    </div>

                </article>
            `;
        }
    );

    if (fluege.length === 0) {
        html = `
            <p class="empty-message">
                Noch keine Flüge gespeichert.
            </p>
        `;
    }

    flugliste.innerHTML = html;

    const countFlights =
        element("countFlights");

    const countLandings =
        element("countLandings");

    const countKm =
        element("countKm");

    const countMinutes =
        element("countMinutes");

    if (countFlights) {
        countFlights.textContent =
            String(fluege.length);
    }

    if (countLandings) {
        countLandings.textContent =
            String(gesamtLandungen);
    }

    if (countKm) {
        countKm.textContent =
            formatZahl(gesamtKm, 1);
    }

    const stunden =
        Math.floor(gesamtZeit / 60);

    const minuten =
        Math.round(gesamtZeit % 60);

    if (countMinutes) {
        countMinutes.textContent =
            `${stunden}h ${minuten}m`;
    }
}

// =====================================
// Initialisierung
// =====================================

function appInitialisieren() {
    anzeigeAktualisieren();

    setzeButtonStatus({
        startenDeaktiviert: false,
        beendenDeaktiviert: true,
        speichernDeaktiviert: true
    });

    zeichneHoehenprofil([]);
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        appInitialisieren
    );
} else {
    appInitialisieren();
}
