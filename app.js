"use strict";

/* =====================================
   GLOBALE DATEN
===================================== */

window.fluege =
    ladeFluege();

let aktuellerFlug = null;
let trackpunkte = [];
let watchId = null;
let heightChart = null;
let monthlyChart = null;
let stopping = false;

/* =====================================
   HILFSFUNKTIONEN
===================================== */

function element(id) {
    return document.getElementById(id);
}

function ladeFluege() {
    try {
        const data =
            JSON.parse(
                localStorage.getItem(
                    "fluege"
                ) ||
                "[]"
            );

        return Array.isArray(data)
            ? data
            : [];
    } catch (error) {
        console.error(
            "Flüge konnten nicht geladen werden:",
            error
        );

        return [];
    }
}

function fluegeSpeichern() {
    try {
        localStorage.setItem(
            "fluege",
            JSON.stringify(
                window.fluege
            )
        );

        return true;
    } catch (error) {
        console.error(
            "Flüge konnten nicht gespeichert werden:",
            error
        );

        alert(
            "Die Flugdaten konnten nicht gespeichert werden."
        );

        return false;
    }
}

function textBereinigen(value) {
    return String(
        value ?? ""
    ).trim();
}

function htmlSicher(value) {
    const div =
        document.createElement(
            "div"
        );

    div.textContent =
        String(
            value ?? ""
        );

    return div.innerHTML;
}

function zahlFormatieren(
    value,
    decimals = 0
) {
    const number =
        Number(value) || 0;

    return number.toLocaleString(
        "de-AT",
        {
            minimumFractionDigits:
                decimals,

            maximumFractionDigits:
                decimals
        }
    );
}

function datumFormatieren(
    value,
    options = {
        dateStyle: "medium"
    }
) {
    const date =
        new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "-";
    }

    return date.toLocaleString(
        "de-AT",
        options
    );
}

function flugzeitFormatieren(minutes) {
    const total =
        Math.max(
            0,
            Math.round(
                Number(minutes) || 0
            )
        );

    const hours =
        Math.floor(
            total / 60
        );

    const remainingMinutes =
        total % 60;

    return (
        hours +
        "h " +
        String(
            remainingMinutes
        ).padStart(
            2,
            "0"
        ) +
        "m"
    );
}

function entfernung(
    pointA,
    pointB
) {
    const earthRadius = 6371;
    const radian = Math.PI / 180;

    const latitudeDifference =
        (
            pointB.lat -
            pointA.lat
        ) *
        radian;

    const longitudeDifference =
        (
            pointB.lng -
            pointA.lng
        ) *
        radian;

    const calculation =
        Math.sin(
            latitudeDifference / 2
        ) ** 2 +
        Math.cos(
            pointA.lat * radian
        ) *
        Math.cos(
            pointB.lat * radian
        ) *
        Math.sin(
            longitudeDifference / 2
        ) ** 2;

    return (
        2 *
        earthRadius *
        Math.asin(
            Math.sqrt(
                Math.min(
                    1,
                    Math.max(
                        0,
                        calculation
                    )
                )
            )
        )
    );
}

function statusSetzen(
    text,
    className = ""
) {
    const status =
        element("status");

    if (!status) {
        return;
    }

    status.textContent = text;
    status.className =
        "status " + className;
}

function buttonsSetzen(
    startDisabled,
    stopDisabled,
    saveDisabled
) {
    element("startButton").disabled =
        startDisabled;

    element("stopButton").disabled =
        stopDisabled;

    element("saveButton").disabled =
        saveDisabled;
}

/* =====================================
   ORTSNAME
===================================== */

async function ortName(
    latitude,
    longitude
) {
    try {
        const url =
            "https://nominatim.openstreetmap.org/reverse" +
            "?format=jsonv2" +
            "&lat=" +
            encodeURIComponent(latitude) +
            "&lon=" +
            encodeURIComponent(longitude) +
            "&zoom=10" +
            "&addressdetails=1";

        const response =
            await fetch(
                url,
                {
                    headers: {
                        "Accept":
                            "application/json",

                        "Accept-Language":
                            "de"
                    }
                }
            );

        if (!response.ok) {
            throw new Error(
                "Ortsabfrage fehlgeschlagen."
            );
        }

        const data =
            await response.json();

        const address =
            data.address || {};

        return (
            address.city ||
            address.town ||
            address.village ||
            address.municipality ||
            address.county ||
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

/* =====================================
   TRACKPUNKT
===================================== */

function trackpunktHinzufuegen(
    position
) {
    const point = {
        lat:
            Number(
                position.coords.latitude
            ),

        lng:
            Number(
                position.coords.longitude
            ),

        hoehe:
            Number.isFinite(
                Number(
                    position.coords.altitude
                )
            )
                ? Number(
                    position.coords.altitude
                )
                : null,

        speed:
            Number.isFinite(
                Number(
                    position.coords.speed
                )
            )
                ? Math.max(
                    0,
                    Number(
                        position.coords.speed
                    )
                )
                : null,

        zeit:
            new Date(
                position.timestamp ||
                Date.now()
            ).toISOString()
    };

    if (
        !Number.isFinite(point.lat) ||
        !Number.isFinite(point.lng)
    ) {
        return;
    }

    if (trackpunkte.length > 0) {
        const lastPoint =
            trackpunkte[
                trackpunkte.length - 1
            ];

        const distance =
            entfernung(
                lastPoint,
                point
            );

        /*
         * Punkte unter ungefähr drei Metern
         * Abstand werden nicht doppelt gespeichert.
         */
        if (distance < 0.003) {
            return;
        }
    }

    trackpunkte.push(point);

    if (
        typeof zeichneTrack ===
        "function"
    ) {
        zeichneTrack(
            trackpunkte
        );
    }

    hoehenprofilZeichnen(
        trackpunkte
    );
}

function geolocationFehler(error) {
    if (!error) {
        return (
            "Der Standort ist nicht verfügbar."
        );
    }

    if (
        error.code ===
        error.PERMISSION_DENIED
    ) {
        return (
            "Standortzugriff wurde verweigert."
        );
    }

    if (
        error.code ===
        error.TIMEOUT
    ) {
        return (
            "Standortabfrage dauerte zu lange."
        );
    }

    return (
        "Der Standort ist nicht verfügbar."
    );
}

/* =====================================
   FLUG STARTEN
===================================== */

function flugStarten() {
    if (aktuellerFlug) {
        alert(
            "Es ist bereits eine Fahrt aktiv."
        );

        return;
    }

    if (!navigator.geolocation) {
        alert(
            "GPS wird von diesem Browser nicht unterstützt."
        );

        return;
    }

    const pilot =
        textBereinigen(
            element("pilot").value
        );

    const ballon =
        textBereinigen(
            element("ballon").value
        ).toUpperCase();

    const ballontyp =
        textBereinigen(
            element("ballontyp").value
        );

    if (!pilot) {
        alert(
            "Bitte Pilotnamen eingeben."
        );

        element("pilot").focus();

        return;
    }

    if (!ballon) {
        alert(
            "Bitte Ballon-Kennzeichen eingeben."
        );

        element("ballon").focus();

        return;
    }

    statusSetzen(
        "📡 Startposition wird ermittelt ...",
        "status-working"
    );

    buttonsSetzen(
        true,
        true,
        true
    );

    navigator.geolocation
        .getCurrentPosition(
            async function (position) {
                const now =
                    new Date();

                const latitude =
                    position.coords.latitude;

                const longitude =
                    position.coords.longitude;

                aktuellerFlug = {
                    id:
                        (
                            typeof crypto !==
                            "undefined" &&
                            typeof crypto.randomUUID ===
                            "function"
                        )
                            ? crypto.randomUUID()
                            : String(
                                Date.now()
                            ),

                    pilot,
                    ballon,
                    ballontyp,

                    startzeit:
                        now.toISOString(),

                    datum:
                        now.toISOString(),

                    startLat:
                        latitude,

                    startLng:
                        longitude,

                    startOrt:
                        await ortName(
                            latitude,
                            longitude
                        )
                };

                trackpunkte = [];
                stopping = false;

                if (
                    typeof karteZuruecksetzen ===
                    "function"
                ) {
                    karteZuruecksetzen();
                }

                if (
                    typeof setStartMarker ===
                    "function"
                ) {
                    setStartMarker(
                        latitude,
                        longitude
                    );
                }

                trackpunktHinzufuegen(
                    position
                );

                watchId =
                    navigator.geolocation
                        .watchPosition(
                            trackpunktHinzufuegen,

                            function (error) {
                                console.error(
                                    "GPS-Tracking gestört:",
                                    error
                                );

                                statusSetzen(
                                    "⚠ Fahrt läuft, GPS vorübergehend gestört.",
                                    "status-working"
                                );
                            },

                            {
                                enableHighAccuracy:
                                    true,

                                maximumAge:
                                    1000,

                                timeout:
                                    15000
                            }
                        );

                statusSetzen(
                    "● Fahrt läuft",
                    "status-running"
                );

                buttonsSetzen(
                    true,
                    false,
                    true
                );
            },

            function (error) {
                statusSetzen(
                    "❌ " +
                    geolocationFehler(
                        error
                    ),

                    "status-error"
                );

                buttonsSetzen(
                    false,
                    true,
                    true
                );
            },

            {
                enableHighAccuracy:
                    true,

                timeout:
                    15000,

                maximumAge:
                    0
            }
        );
}

/* =====================================
   FLUG BEENDEN
===================================== */

function flugBeenden() {
    if (!aktuellerFlug) {
        alert(
            "Bitte zuerst eine Fahrt starten."
        );

        return;
    }

    if (stopping) {
        return;
    }

    stopping = true;

    if (watchId !== null) {
        navigator.geolocation
            .clearWatch(
                watchId
            );

        watchId = null;
    }

    statusSetzen(
        "📡 Landeposition wird ermittelt ...",
        "status-working"
    );

    buttonsSetzen(
        true,
        true,
        true
    );

    navigator.geolocation
        .getCurrentPosition(
            async function (position) {
                const latitude =
                    position.coords.latitude;

                const longitude =
                    position.coords.longitude;

                trackpunktHinzufuegen(
                    position
                );

                aktuellerFlug.endezeit =
                    new Date()
                        .toISOString();

                aktuellerFlug.landeLat =
                    latitude;

                aktuellerFlug.landeLng =
                    longitude;

                aktuellerFlug.landeOrt =
                    await ortName(
                        latitude,
                        longitude
                    );

                if (
                    typeof setLandingMarker ===
                    "function"
                ) {
                    setLandingMarker(
                        latitude,
                        longitude
                    );
                }

                statusSetzen(
                    "✓ Fahrt beendet. Jetzt speichern.",
                    "status-running"
                );

                buttonsSetzen(
                    true,
                    true,
                    false
                );
            },

            function (error) {
                stopping = false;

                statusSetzen(
                    "❌ " +
                    geolocationFehler(
                        error
                    ),

                    "status-error"
                );

                buttonsSetzen(
                    true,
                    false,
                    true
                );
            },

            {
                enableHighAccuracy:
                    true,

                timeout:
                    15000,

                maximumAge:
                    0
            }
        );
}

/* =====================================
   FLUG SPEICHERN
===================================== */

function flugSpeichern() {
    if (
        !aktuellerFlug ||
        !aktuellerFlug.endezeit
    ) {
        alert(
            "Bitte die Fahrt zuerst beenden."
        );

        return;
    }

    const start =
        new Date(
            aktuellerFlug.startzeit
        );

    const end =
        new Date(
            aktuellerFlug.endezeit
        );

    const minutes =
        Math.max(
            1,
            Math.round(
                (
                    end.getTime() -
                    start.getTime()
                ) /
                60000
            )
        );

    const heights =
        trackpunkte
            .map(
                function (point) {
                    return point.hoehe;
                }
            )
            .filter(
                Number.isFinite
            );

    const speeds =
        trackpunkte
            .map(
                function (point) {
                    return point.speed;
                }
            )
            .filter(
                Number.isFinite
            );

    let distance = 0;

    for (
        let index = 1;
        index < trackpunkte.length;
        index += 1
    ) {
        distance +=
            entfernung(
                trackpunkte[
                    index - 1
                ],

                trackpunkte[index]
            );
    }

    aktuellerFlug.flugzeit =
        minutes;

    aktuellerFlug.track =
        [...trackpunkte];

    aktuellerFlug.strecke =
        Number(
            distance.toFixed(1)
        );

    aktuellerFlug.maxHoehe =
        heights.length > 0
            ? Math.round(
                Math.max(
                    ...heights
                )
            )
            : 0;

    aktuellerFlug.minHoehe =
        heights.length > 0
            ? Math.round(
                Math.min(
                    ...heights
                )
            )
            : 0;

    aktuellerFlug.avgHoehe =
        heights.length > 0
            ? Math.round(
                heights.reduce(
                    function (
                        total,
                        value
                    ) {
                        return (
                            total +
                            value
                        );
                    },
                    0
                ) /
                heights.length
            )
            : 0;

    aktuellerFlug.maxSpeed =
        speeds.length > 0
            ? Math.round(
                Math.max(
                    ...speeds
                ) *
                3.6
            )
            : 0;

    aktuellerFlug.avgSpeed =
        speeds.length > 0
            ? Math.round(
                (
                    speeds.reduce(
                        function (
                            total,
                            value
                        ) {
                            return (
                                total +
                                value
                            );
                        },
                        0
                    ) /
                    speeds.length
                ) *
                3.6
            )
            : 0;

    aktuellerFlug.landungen =
        Math.max(
            1,
            Number(
                element(
                    "landungen"
                ).value
            ) ||
            1
        );

    aktuellerFlug.bemerkung =
        textBereinigen(
            element(
                "bemerkung"
            ).value
        );

    window.fluege.push(
        aktuellerFlug
    );

    if (!fluegeSpeichern()) {
        window.fluege.pop();
        return;
    }

    aktuellerFlug = null;
    trackpunkte = [];
    stopping = false;

    element("bemerkung").value =
        "";

    element("landungen").value =
        "1";

    statusSetzen(
        "✓ Flug erfolgreich gespeichert.",
        "status-running"
    );

    buttonsSetzen(
        false,
        true,
        true
    );

    anzeigeAktualisieren();
}

/* =====================================
   CHART-OPTIONEN
===================================== */

function chartOptionen(
    xTitle,
    yTitle
) {
    return {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
            legend: {
                labels: {
                    color:
                        "#b9c7d6"
                }
            }
        },

        scales: {
            x: {
                ticks: {
                    color:
                        "#8fa2b7"
                },

                grid: {
                    color:
                        "#1d3040"
                },

                title: {
                    display: true,
                    text: xTitle,
                    color:
                        "#8fa2b7"
                }
            },

            y: {
                beginAtZero: true,

                ticks: {
                    color:
                        "#8fa2b7"
                },

                grid: {
                    color:
                        "#1d3040"
                },

                title: {
                    display: true,
                    text: yTitle,
                    color:
                        "#8fa2b7"
                }
            }
        }
    };
}

/* =====================================
   HÖHENPROFIL
===================================== */

function hoehenprofilZeichnen(
    track
) {
    if (
        typeof Chart ===
        "undefined"
    ) {
        return;
    }

    const canvas =
        element("heightChart");

    if (!canvas) {
        return;
    }

    if (heightChart) {
        heightChart.destroy();
    }

    const safeTrack =
        Array.isArray(track)
            ? track
            : [];

    heightChart =
        new Chart(
            canvas,
            {
                type: "line",

                data: {
                    labels:
                        safeTrack.map(
                            function (
                                point,
                                index
                            ) {
                                return (
                                    index + 1
                                );
                            }
                        ),

                    datasets: [
                        {
                            label:
                                "Höhe (m)",

                            data:
                                safeTrack.map(
                                    function (
                                        point
                                    ) {
                                        return (
                                            point.hoehe
                                        );
                                    }
                                ),

                            borderColor:
                                "#1d9bf0",

                            backgroundColor:
                                "rgba(22, 136, 255, 0.13)",

                            fill: true,
                            tension: 0.25,

                            pointRadius:
                                safeTrack.length > 60
                                    ? 0
                                    : 2
                        }
                    ]
                },

                options:
                    chartOptionen(
                        "Messpunkt",
                        "Meter"
                    )
            }
        );
}

/* =====================================
   MONATSSTATISTIK
===================================== */

function monatsstatistikZeichnen() {
    if (
        typeof Chart ===
        "undefined"
    ) {
        return;
    }

    const canvas =
        element("monthlyChart");

    if (!canvas) {
        return;
    }

    const labels = [];
    const values = [];
    const now = new Date();

    for (
        let offset = 11;
        offset >= 0;
        offset -= 1
    ) {
        const month =
            new Date(
                now.getFullYear(),
                now.getMonth() -
                offset,
                1
            );

        labels.push(
            month.toLocaleDateString(
                "de-AT",
                {
                    month: "short"
                }
            )
        );

        const flightsInMonth =
            window.fluege.filter(
                function (flight) {
                    const date =
                        new Date(
                            flight.startzeit ||
                            flight.datum
                        );

                    return (
                        !Number.isNaN(
                            date.getTime()
                        ) &&
                        date.getFullYear() ===
                            month.getFullYear() &&
                        date.getMonth() ===
                            month.getMonth()
                    );
                }
            ).length;

        values.push(
            flightsInMonth
        );
    }

    if (monthlyChart) {
        monthlyChart.destroy();
    }

    monthlyChart =
        new Chart(
            canvas,
            {
                type: "bar",

                data: {
                    labels,

                    datasets: [
                        {
                            label:
                                "Fahrten",

                            data:
                                values,

                            backgroundColor:
                                "#1688ff",

                            borderColor:
                                "#52adff",

                            borderWidth:
                                1,

                            borderRadius:
                                3
                        }
                    ]
                },

                options:
                    chartOptionen(
                        "Monat",
                        "Fahrten"
                    )
            }
        );
}

/* =====================================
   ZUSAMMENFASSUNG
===================================== */

function zusammenfassungAktualisieren() {
    const flights =
        window.fluege;

    const totalMinutes =
        flights.reduce(
            function (total, flight) {
                return (
                    total +
                    (
                        Number(
                            flight.flugzeit
                        ) ||
                        0
                    )
                );
            },
            0
        );

    const totalDistance =
        flights.reduce(
            function (total, flight) {
                return (
                    total +
                    (
                        Number(
                            flight.strecke
                        ) ||
                        0
                    )
                );
            },
            0
        );

    const totalLandings =
        flights.reduce(
            function (total, flight) {
                return (
                    total +
                    (
                        Number(
                            flight.landungen
                        ) ||
                        0
                    )
                );
            },
            0
        );

    const summaryData = [
        [
            "🎈 Gesamtfahrten",
            flights.length
        ],
        [
            "🛬 Gesamtlandungen",
            totalLandings
        ],
        [
            "◷ Flugzeit",
            flugzeitFormatieren(
                totalMinutes
            )
        ],
        [
            "⌖ Strecke",
            zahlFormatieren(
                totalDistance,
                1
            ) +
            " km"
        ],
        [
            "Ø Dauer",
            flights.length > 0
                ? flugzeitFormatieren(
                    totalMinutes /
                    flights.length
                )
                : "0h 00m"
        ],
        [
            "↗ Letzte Fahrt",
            flights.length > 0
                ? datumFormatieren(
                    flights[
                        flights.length - 1
                    ].startzeit
                )
                : "-"
        ]
    ];

    element("summaryList").innerHTML =
        summaryData
            .map(
                function (entry) {
                    return `
                        <div class="summary-row">
                            <span>${entry[0]}</span>
                            <strong>${entry[1]}</strong>
                        </div>
                    `;
                }
            )
            .join("");

    element("countFlights").textContent =
        String(
            flights.length
        );

    element("countLandings").textContent =
        String(
            totalLandings
        );

    element("countMinutes").textContent =
        flugzeitFormatieren(
            totalMinutes
        );

    element("countKm").textContent =
        zahlFormatieren(
            totalDistance,
            1
        ) +
        " km";

    element("flightbookCount").textContent =
        flights.length +
        " EINTRÄGE";
}

/* =====================================
   REKORDE
===================================== */

function rekordeAktualisieren() {
    const flights =
        window.fluege;

    const maximumSpeed =
        Math.max(
            0,
            ...flights.map(
                function (flight) {
                    return (
                        Number(
                            flight.maxSpeed
                        ) ||
                        0
                    );
                }
            )
        );

    const maximumHeight =
        Math.max(
            0,
            ...flights.map(
                function (flight) {
                    return (
                        Number(
                            flight.maxHoehe
                        ) ||
                        0
                    );
                }
            )
        );

    const maximumDistance =
        Math.max(
            0,
            ...flights.map(
                function (flight) {
                    return (
                        Number(
                            flight.strecke
                        ) ||
                        0
                    );
                }
            )
        );

    const maximumDuration =
        Math.max(
            0,
            ...flights.map(
                function (flight) {
                    return (
                        Number(
                            flight.flugzeit
                        ) ||
                        0
                    );
                }
            )
        );

    const records = [
        {
            title:
                "Schnellste Fahrt",

            value:
                maximumSpeed +
                " km/h"
        },
        {
            title:
                "Höchste Höhe",

            value:
                zahlFormatieren(
                    maximumHeight
                ) +
                " m"
        },
        {
            title:
                "Längste Strecke",

            value:
                zahlFormatieren(
                    maximumDistance,
                    1
                ) +
                " km"
        },
        {
            title:
                "Längste Dauer",

            value:
                flugzeitFormatieren(
                    maximumDuration
                )
        }
    ];

    element("records").innerHTML =
        records
            .map(
                function (record) {
                    return `
                        <div class="record">
                            <span>${record.title}</span>
                            <strong>${record.value}</strong>
                            <small>Persönlicher Rekord</small>
                        </div>
                    `;
                }
            )
            .join("");
}

/* =====================================
   FLUGBUCH
===================================== */

function flugbuchAktualisieren() {
    const flightList =
        element("flugliste");

    if (
        window.fluege.length ===
        0
    ) {
        flightList.innerHTML =
            '<div class="empty">' +
            "Noch keine Flüge gespeichert." +
            "</div>";

        return;
    }

    flightList.innerHTML =
        [...window.fluege]
            .reverse()
            .map(
                function (
                    flight,
                    reverseIndex
                ) {
                    const index =
                        window.fluege.length -
                        1 -
                        reverseIndex;

                    const startDate =
                        datumFormatieren(
                            flight.startzeit,
                            {
                                dateStyle:
                                    "medium",

                                timeStyle:
                                    "short"
                            }
                        );

                    return `
                        <article class="flight">

                            <div class="flight-head">

                                <h3>
                                    ${htmlSicher(startDate)}
                                </h3>

                                <span>
                                    ${htmlSicher(
                                        flight.ballon ||
                                        "-"
                                    )}
                                </span>

                            </div>

                            <div class="flight-grid">

                                <div>
                                    <small>Pilot</small>
                                    ${htmlSicher(
                                        flight.pilot ||
                                        "-"
                                    )}
                                </div>

                                <div>
                                    <small>Route</small>
                                    ${htmlSicher(
                                        flight.startOrt ||
                                        "-"
                                    )}
                                    →
                                    ${htmlSicher(
                                        flight.landeOrt ||
                                        "-"
                                    )}
                                </div>

                                <div>
                                    <small>Dauer</small>
                                    ${flugzeitFormatieren(
                                        flight.flugzeit
                                    )}
                                </div>

                                <div>
                                    <small>Strecke</small>
                                    ${zahlFormatieren(
                                        flight.strecke,
                                        1
                                    )}
                                    km
                                </div>

                                <div>
                                    <small>Höhe max.</small>
                                    ${zahlFormatieren(
                                        flight.maxHoehe
                                    )}
                                    m
                                </div>

                                <div>
                                    <small>Tempo max.</small>
                                    ${zahlFormatieren(
                                        flight.maxSpeed
                                    )}
                                    km/h
                                </div>

                                <div>
                                    <small>Landungen</small>
                                    ${zahlFormatieren(
                                        flight.landungen
                                    )}
                                </div>

                                <div>
                                    <small>Ballontyp</small>
                                    ${htmlSicher(
                                        flight.ballontyp ||
                                        "-"
                                    )}
                                </div>

                            </div>

                            ${
                                flight.bemerkung
                                    ? `
                                        <p>
                                            ${htmlSicher(
                                                flight.bemerkung
                                            )}
                                        </p>
                                    `
                                    : ""
                            }

                            <div class="flight-actions">

                                <button
                                    class="small-button"
                                    type="button"
                                    data-map="${index}"
                                >
                                    Auf Karte
                                </button>

                                <button
                                    class="primary danger"
                                    type="button"
                                    data-delete="${index}"
                                >
                                    Löschen
                                </button>

                            </div>

                        </article>
                    `;
                }
            )
            .join("");
}

/* =====================================
   GESAMTANZEIGE
===================================== */

function anzeigeAktualisieren() {
    zusammenfassungAktualisieren();
    rekordeAktualisieren();
    flugbuchAktualisieren();
    monatsstatistikZeichnen();

    if (
        typeof aktivitaetsmonitorAktualisieren ===
        "function"
    ) {
        aktivitaetsmonitorAktualisieren();
    }

    if (
        typeof alleFluegeAufKarte ===
        "function"
    ) {
        alleFluegeAufKarte(
            window.fluege
        );
    }

    element("pilotHeader").textContent =
        textBereinigen(
            element("pilot").value
        ) ||
        "Pilot";
}

/* =====================================
   BACKUP
===================================== */

function fluegeExportieren() {
    const backup = {
        version: 10,
        exportedAt:
            new Date()
                .toISOString(),
        fluege:
            window.fluege
    };

    const blob =
        new Blob(
            [
                JSON.stringify(
                    backup,
                    null,
                    2
                )
            ],
            {
                type:
                    "application/json"
            }
        );

    const link =
        document.createElement(
            "a"
        );

    link.href =
        URL.createObjectURL(
            blob
        );

    link.download =
        "ballonflugbuch-backup-" +
        new Date()
            .toISOString()
            .slice(
                0,
                10
            ) +
        ".json";

    link.click();

    URL.revokeObjectURL(
        link.href
    );
}

async function fluegeImportieren(
    file
) {
    if (!file) {
        return;
    }

    try {
        const text =
            await file.text();

        const data =
            JSON.parse(text);

        const importedFlights =
            Array.isArray(data)
                ? data
                : data.fluege;

        if (
            !Array.isArray(
                importedFlights
            )
        ) {
            throw new Error(
                "Keine Flugliste gefunden."
            );
        }

        const confirmed =
            window.confirm(
                importedFlights.length +
                " Flüge importieren und vorhandene Daten ersetzen?"
            );

        if (!confirmed) {
            return;
        }

        window.fluege =
            importedFlights;

        fluegeSpeichern();
        anzeigeAktualisieren();

        alert(
            "Backup wurde erfolgreich importiert."
        );
    } catch (error) {
        console.error(
            "Import fehlgeschlagen:",
            error
        );

        alert(
            "Ungültige Backup-Datei."
        );
    }
}

/* =====================================
   STAMMDATEN
===================================== */

function stammdatenLaden() {
    try {
        return JSON.parse(
            localStorage.getItem(
                "stammdaten"
            ) ||
            "{}"
        );
    } catch {
        return {};
    }
}

function stammdatenSpeichern() {
    const data = {
        pilot:
            element("pilot").value,

        ballon:
            element("ballon").value,

        ballontyp:
            element("ballontyp").value,

        maintenanceInput:
            element(
                "maintenanceInput"
            ).value
    };

    localStorage.setItem(
        "stammdaten",
        JSON.stringify(data)
    );

    element("pilotHeader").textContent =
        textBereinigen(
            data.pilot
        ) ||
        "Pilot";

    element("maintenanceDate").textContent =
        data.maintenanceInput
            ? datumFormatieren(
                data.maintenanceInput
            )
            : "nicht festgelegt";
}

/* =====================================
   INITIALISIERUNG
===================================== */

function appInitialisieren() {
    const saved =
        stammdatenLaden();

    [
        "pilot",
        "ballon",
        "ballontyp",
        "maintenanceInput"
    ].forEach(
        function (id) {
            if (saved[id]) {
                element(id).value =
                    saved[id];
            }
        }
    );

    document
        .querySelectorAll(
            "#einstellungen input"
        )
        .forEach(
            function (input) {
                input.addEventListener(
                    "change",
                    stammdatenSpeichern
                );
            }
        );

    element("startButton")
        .addEventListener(
            "click",
            flugStarten
        );

    element("stopButton")
        .addEventListener(
            "click",
            flugBeenden
        );

    element("saveButton")
        .addEventListener(
            "click",
            flugSpeichern
        );

    element("exportButton")
        .addEventListener(
            "click",
            fluegeExportieren
        );

    element("importInput")
        .addEventListener(
            "change",
            function (event) {
                fluegeImportieren(
                    event.target
                        .files[0]
                );

                event.target.value =
                    "";
            }
        );

    element("flugliste")
        .addEventListener(
            "click",
            function (event) {
                const mapIndex =
                    event.target
                        .dataset.map;

                const deleteIndex =
                    event.target
                        .dataset.delete;

                if (
                    mapIndex !==
                    undefined
                ) {
                    const flight =
                        window.fluege[
                            Number(
                                mapIndex
                            )
                        ];

                    if (flight) {
                        flugAufKarte(
                            flight.track
                        );

                        hoehenprofilZeichnen(
                            flight.track
                        );
                    }
                }

                if (
                    deleteIndex !==
                    undefined
                ) {
                    const confirmed =
                        window.confirm(
                            "Flug wirklich löschen?"
                        );

                    if (!confirmed) {
                        return;
                    }

                    window.fluege.splice(
                        Number(
                            deleteIndex
                        ),
                        1
                    );

                    fluegeSpeichern();
                    anzeigeAktualisieren();
                }
            }
        );

    element("menuButton")
        .addEventListener(
            "click",
            function () {
                element("sidebar")
                    .classList
                    .toggle("open");
            }
        );

    document
        .querySelectorAll(
            ".nav-link[href]"
        )
        .forEach(
            function (link) {
                link.addEventListener(
                    "click",
                    function () {
                        element("sidebar")
                            .classList
                            .remove("open");

                        document
                            .querySelectorAll(
                                ".nav-link"
                            )
                            .forEach(
                                function (
                                    navLink
                                ) {
                                    navLink
                                        .classList
                                        .remove(
                                            "active"
                                        );
                                }
                            );

                        link.classList.add(
                            "active"
                        );
                    }
                );
            }
        );

    function clockUpdate() {
        const now =
            new Date();

        element("currentDate")
            .textContent =
            now.toLocaleDateString(
                "de-AT"
            );

        element("currentTime")
            .textContent =
            now.toLocaleTimeString(
                "de-AT",
                {
                    hour:
                        "2-digit",

                    minute:
                        "2-digit"
                }
            );
    }

    clockUpdate();

    window.setInterval(
        clockUpdate,
        1000
    );

    stammdatenSpeichern();

    buttonsSetzen(
        false,
        true,
        true
    );

    hoehenprofilZeichnen([]);
    anzeigeAktualisieren();
}

document.addEventListener(
    "DOMContentLoaded",
    appInitialisieren
);
