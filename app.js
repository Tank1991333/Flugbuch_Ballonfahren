"use strict";

window.fluege =
    ladeGespeicherteFluege();

let aktuellerFlug = null;
let trackpunkte = [];
let watchId = null;
let flugWirdBeendet = false;

let hoehenChart = null;
let monatsChart = null;

let vorbereiteteImportFluege = [];

function element(id) {
    return document.getElementById(id);
}

function textBereinigen(value) {
    return String(value ?? "").trim();
}

function htmlSicher(value) {
    const div =
        document.createElement("div");

    div.textContent =
        String(value ?? "");

    return div.innerHTML;
}

function formatZahl(
    value,
    decimalPlaces = 0
) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "0";
    }

    return number.toLocaleString(
        "de-AT",
        {
            minimumFractionDigits:
                decimalPlaces,

            maximumFractionDigits:
                decimalPlaces
        }
    );
}

function formatFlugzeit(minutes) {
    const totalMinutes =
        Math.max(
            0,
            Math.round(
                Number(minutes) || 0
            )
        );

    const hours =
        Math.floor(
            totalMinutes / 60
        );

    const remainingMinutes =
        totalMinutes % 60;

    return (
        `${hours}h ` +
        `${String(
            remainingMinutes
        ).padStart(2, "0")}m`
    );
}

function formatDatum(value) {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleString(
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

function ladeGespeicherteFluege() {
    try {
        const saved =
            localStorage.getItem(
                "fluege"
            );

        if (!saved) {
            return [];
        }

        const flights =
            JSON.parse(saved);

        return Array.isArray(flights)
            ? flights
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
            "Die Fahrtdaten konnten nicht gespeichert werden."
        );

        return false;
    }
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
        `status-message ${className}`.trim();
}

function buttonStatusSetzen(
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

function entfernung(
    pointA,
    pointB
) {
    const earthRadius = 6371;

    const toRadians =
        Math.PI / 180;

    const latitudeDifference =
        (
            Number(pointB.lat) -
            Number(pointA.lat)
        ) * toRadians;

    const longitudeDifference =
        (
            Number(pointB.lng) -
            Number(pointA.lng)
        ) * toRadians;

    const latA =
        Number(pointA.lat) *
        toRadians;

    const latB =
        Number(pointB.lat) *
        toRadians;

    const value =
        Math.sin(
            latitudeDifference / 2
        ) ** 2 +
        Math.cos(latA) *
        Math.cos(latB) *
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
                    Math.max(0, value)
                )
            )
        )
    );
}

async function ortName(lat, lng) {
    try {
        const url =
            "https://nominatim.openstreetmap.org/reverse" +
            `?format=jsonv2` +
            `&lat=${encodeURIComponent(lat)}` +
            `&lon=${encodeURIComponent(lng)}` +
            `&zoom=10` +
            `&addressdetails=1`;

        const response = await fetch(
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
                `Ortsabfrage fehlgeschlagen: ${response.status}`
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

function trackpunktHinzufuegen(position) {
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

        genauigkeit:
            Number.isFinite(
                Number(
                    position.coords.accuracy
                )
            )
                ? Number(
                    position.coords.accuracy
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

    const lastPoint =
        trackpunkte[
            trackpunkte.length - 1
        ];

    if (
        lastPoint &&
        entfernung(
            lastPoint,
            point
        ) < 0.003
    ) {
        return;
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

    zeichneHoehenprofil(
        trackpunkte
    );
}

function geolocationFehler() {
    return (
        "Der Standort konnte nicht ermittelt werden. " +
        "Bitte kontrolliere die Standortberechtigung."
    );
}

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
            "Bitte einen Piloten eingeben."
        );

        return;
    }

    if (!ballon) {
        alert(
            "Bitte ein Ballon-Kennzeichen eingeben."
        );

        return;
    }

    statusSetzen(
        "📡 Startposition wird ermittelt ...",
        "status-working"
    );

    buttonStatusSetzen(
        true,
        true,
        true
    );

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            const startDate =
                new Date();

            const startPlace =
                await ortName(
                    position.coords.latitude,
                    position.coords.longitude
                );

            aktuellerFlug = {
                id:
                    (
                        typeof crypto !==
                        "undefined"
                    ) &&
                    (
                        typeof crypto.randomUUID ===
                        "function"
                    )
                        ? crypto.randomUUID()
                        : String(Date.now()),

                datum:
                    startDate.toISOString(),

                startzeit:
                    startDate.toISOString(),

                pilot,
                ballon,
                ballontyp,

                startOrt:
                    startPlace,

                startLat:
                    position.coords.latitude,

                startLng:
                    position.coords.longitude
            };

            trackpunkte = [];
            flugWirdBeendet = false;

            if (
                typeof karteZuruecksetzen ===
                "function"
            ) {
                karteZuruecksetzen();
            }

            setStartMarker(
                position.coords.latitude,
                position.coords.longitude
            );

            trackpunktHinzufuegen(
                position
            );

            watchId =
                navigator.geolocation
                    .watchPosition(
                        trackpunktHinzufuegen,

                        function () {
                            statusSetzen(
                                "⚠ Fahrt läuft, GPS ist vorübergehend gestört.",
                                "status-working"
                            );
                        },

                        {
                            enableHighAccuracy: true,
                            maximumAge: 1000,
                            timeout: 15000
                        }
                    );

            statusSetzen(
                "● Fahrt läuft",
                "status-running"
            );

            buttonStatusSetzen(
                true,
                false,
                true
            );
        },

        function () {
            statusSetzen(
                "❌ " +
                geolocationFehler(),
                "status-error"
            );

            buttonStatusSetzen(
                false,
                true,
                true
            );
        },

        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15000
        }
    );
}

function flugBeenden() {
    if (
        !aktuellerFlug ||
        flugWirdBeendet
    ) {
        return;
    }

    flugWirdBeendet = true;

    if (watchId !== null) {
        navigator.geolocation
            .clearWatch(watchId);

        watchId = null;
    }

    statusSetzen(
        "📡 Landeposition wird ermittelt ...",
        "status-working"
    );

    buttonStatusSetzen(
        true,
        true,
        true
    );

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            trackpunktHinzufuegen(
                position
            );

            const landingPlace =
                await ortName(
                    position.coords.latitude,
                    position.coords.longitude
                );

            aktuellerFlug.endezeit =
                new Date().toISOString();

            aktuellerFlug.landeOrt =
                landingPlace;

            aktuellerFlug.landeLat =
                position.coords.latitude;

            aktuellerFlug.landeLng =
                position.coords.longitude;

            setLandingMarker(
                position.coords.latitude,
                position.coords.longitude
            );

            statusSetzen(
                "✓ Fahrt beendet. Jetzt speichern.",
                "status-running"
            );

            buttonStatusSetzen(
                true,
                true,
                false
            );
        },

        function () {
            flugWirdBeendet = false;

            statusSetzen(
                "❌ " +
                geolocationFehler(),
                "status-error"
            );

            buttonStatusSetzen(
                true,
                false,
                true
            );
        },

        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15000
        }
    );
}

function flugSpeichern() {
    if (
        !aktuellerFlug ||
        !aktuellerFlug.endezeit
    ) {
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

    const flightMinutes =
        Math.max(
            1,
            Math.round(
                (
                    end.getTime() -
                    start.getTime()
                ) / 60000
            )
        );

    const heights =
        trackpunkte
            .map(function (point) {
                return point.hoehe;
            })
            .filter(Number.isFinite);

    const speeds =
        trackpunkte
            .map(function (point) {
                return point.speed;
            })
            .filter(Number.isFinite);

    let distance = 0;

    for (
        let index = 1;
        index < trackpunkte.length;
        index += 1
    ) {
        distance += entfernung(
            trackpunkte[index - 1],
            trackpunkte[index]
        );
    }

    aktuellerFlug.flugzeit =
        flightMinutes;

    aktuellerFlug.track = [
        ...trackpunkte
    ];

    aktuellerFlug.strecke =
        Number(
            distance.toFixed(1)
        );

    aktuellerFlug.maxHoehe =
        heights.length
            ? Math.round(
                Math.max(...heights)
            )
            : 0;

    aktuellerFlug.minHoehe =
        heights.length
            ? Math.round(
                Math.min(...heights)
            )
            : 0;

    aktuellerFlug.avgHoehe =
        heights.length
            ? Math.round(
                heights.reduce(
                    function (sum, value) {
                        return sum + value;
                    },
                    0
                ) / heights.length
            )
            : 0;

    aktuellerFlug.maxSpeed =
        speeds.length
            ? Math.round(
                Math.max(...speeds) *
                3.6
            )
            : 0;

    aktuellerFlug.avgSpeed =
        speeds.length
            ? Math.round(
                (
                    speeds.reduce(
                        function (sum, value) {
                            return sum + value;
                        },
                        0
                    ) /
                    speeds.length
                ) * 3.6
            )
            : 0;

    aktuellerFlug.landungen =
        Math.max(
            1,
            Number.parseInt(
                element("landungen").value,
                10
            ) || 1
        );

    aktuellerFlug.bemerkung =
        textBereinigen(
            element("bemerkung").value
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
    flugWirdBeendet = false;

    element("landungen").value =
        "1";

    element("bemerkung").value =
        "";

    statusSetzen(
        "✓ Fahrt erfolgreich gespeichert.",
        "status-running"
    );

    buttonStatusSetzen(
        false,
        true,
        true
    );

    anzeigeAktualisieren();
}

function chartOptionen() {
    return {
        responsive: true,
        maintainAspectRatio: false,

        plugins: {
            legend: {
                labels: {
                    color: "#b6c5d4"
                }
            }
        },

        scales: {
            x: {
                ticks: {
                    color: "#91a7ba"
                },

                grid: {
                    color: "#203548"
                }
            },

            y: {
                beginAtZero: true,

                ticks: {
                    color: "#91a7ba"
                },

                grid: {
                    color: "#203548"
                }
            }
        }
    };
}

function zeichneHoehenprofil(track) {
    if (
        typeof Chart === "undefined" ||
        !element("heightChart")
    ) {
        return;
    }

    const safeTrack =
        Array.isArray(track)
            ? track
            : [];

    if (hoehenChart) {
        hoehenChart.destroy();
    }

    hoehenChart = new Chart(
        element("heightChart"),
        {
            type: "line",

            data: {
                labels:
                    safeTrack.map(
                        function (_, index) {
                            return index + 1;
                        }
                    ),

                datasets: [
                    {
                        label: "Höhe (m)",

                        data:
                            safeTrack.map(
                                function (point) {
                                    return point.hoehe;
                                }
                            ),

                        borderColor:
                            "#168cff",

                        backgroundColor:
                            "rgba(22, 140, 255, 0.13)",

                        fill: true,
                        tension: 0.25,

                        pointRadius:
                            safeTrack.length > 80
                                ? 0
                                : 2
                    }
                ]
            },

            options:
                chartOptionen()
        }
    );
}

function zeichneMonatsstatistik() {
    if (
        typeof Chart === "undefined" ||
        !element("monthlyChart")
    ) {
        return;
    }

    const labels = [];
    const values = [];

    const today =
        new Date();

    for (
        let offset = 11;
        offset >= 0;
        offset -= 1
    ) {
        const monthDate =
            new Date(
                today.getFullYear(),
                today.getMonth() - offset,
                1
            );

        labels.push(
            monthDate.toLocaleDateString(
                "de-AT",
                {
                    month: "short"
                }
            )
        );

        const count =
            window.fluege.filter(
                function (flight) {
                    const flightDate =
                        new Date(
                            flight.startzeit ||
                            flight.datum
                        );

                    return (
                        !Number.isNaN(
                            flightDate.getTime()
                        ) &&
                        flightDate.getFullYear() ===
                        monthDate.getFullYear() &&
                        flightDate.getMonth() ===
                        monthDate.getMonth()
                    );
                }
            ).length;

        values.push(count);
    }

    if (monatsChart) {
        monatsChart.destroy();
    }

    monatsChart = new Chart(
        element("monthlyChart"),
        {
            type: "bar",

            data: {
                labels,

                datasets: [
                    {
                        label: "Fahrten",
                        data: values,

                        backgroundColor:
                            "#168cff",

                        borderColor:
                            "#5ab0ff",

                        borderWidth: 1,
                        borderRadius: 3
                    }
                ]
            },

            options:
                chartOptionen()
        }
    );
}

function zusammenfassungAktualisieren() {
    const totalTime =
        window.fluege.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (
                        Number(
                            flight.flugzeit
                        ) || 0
                    )
                );
            },
            0
        );

    const totalDistance =
        window.fluege.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (
                        Number(
                            flight.strecke
                        ) || 0
                    )
                );
            },
            0
        );

    const totalLandings =
        window.fluege.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (
                        Number(
                            flight.landungen
                        ) || 0
                    )
                );
            },
            0
        );

    element("countFlights")
        .textContent =
        String(
            window.fluege.length
        );

    element("countLandings")
        .textContent =
        String(totalLandings);

    element("countMinutes")
        .textContent =
        formatFlugzeit(totalTime);

    element("countKm")
        .textContent =
        `${formatZahl(
            totalDistance,
            1
        )} km`;

    element("flightbookCount")
        .textContent =
        `${window.fluege.length} EINTRÄGE`;

    const averageDuration =
        window.fluege.length
            ? totalTime /
              window.fluege.length
            : 0;

    const lastFlight =
        window.fluege[
            window.fluege.length - 1
        ];

    const rows = [
        [
            "🎈 Gesamtfahrten",
            window.fluege.length
        ],
        [
            "🛬 Gesamtlandungen",
            totalLandings
        ],
        [
            "◷ Flugzeit",
            formatFlugzeit(totalTime)
        ],
        [
            "⌖ Strecke",
            `${formatZahl(
                totalDistance,
                1
            )} km`
        ],
        [
            "Ø Dauer",
            formatFlugzeit(
                averageDuration
            )
        ],
        [
            "↗ Letzte Fahrt",
            lastFlight
                ? formatDatum(
                    lastFlight.startzeit ||
                    lastFlight.datum
                )
                : "-"
        ]
    ];

    element("summaryList")
        .innerHTML =
        rows
            .map(function (row) {
                return `
                    <div class="summary-row">

                        <span>
                            ${row[0]}
                        </span>

                        <strong>
                            ${row[1]}
                        </strong>

                    </div>
                `;
            })
            .join("");
}

function rekordeAktualisieren() {
    const maxSpeed =
        Math.max(
            0,
            ...window.fluege.map(
                function (flight) {
                    return (
                        Number(
                            flight.maxSpeed
                        ) || 0
                    );
                }
            )
        );

    const maxHeight =
        Math.max(
            0,
            ...window.fluege.map(
                function (flight) {
                    return (
                        Number(
                            flight.maxHoehe
                        ) || 0
                    );
                }
            )
        );

    const maxDistance =
        Math.max(
            0,
            ...window.fluege.map(
                function (flight) {
                    return (
                        Number(
                            flight.strecke
                        ) || 0
                    );
                }
            )
        );

    const maxDuration =
        Math.max(
            0,
            ...window.fluege.map(
                function (flight) {
                    return (
                        Number(
                            flight.flugzeit
                        ) || 0
                    );
                }
            )
        );

    const records = [
        [
            "Schnellste Fahrt",
            `${formatZahl(maxSpeed)} km/h`
        ],
        [
            "Höchste Höhe",
            `${formatZahl(maxHeight)} m`
        ],
        [
            "Längste Strecke",
            `${formatZahl(
                maxDistance,
                1
            )} km`
        ],
        [
            "Längste Dauer",
            formatFlugzeit(maxDuration)
        ]
    ];

    element("records").innerHTML =
        records
            .map(function (record) {
                return `
                    <div class="record">

                        <span>
                            ${record[0]}
                        </span>

                        <strong>
                            ${record[1]}
                        </strong>

                        <small>
                            Persönlicher Rekord
                        </small>

                    </div>
                `;
            })
            .join("");
}

function flugbuchAktualisieren() {
    const list =
        element("flugliste");

    if (
        window.fluege.length === 0
    ) {
        list.innerHTML = `
            <p class="empty-message">
                Noch keine Fahrten gespeichert.
            </p>
        `;

        return;
    }

    list.innerHTML =
        [...window.fluege]
            .reverse()
            .map(
                function (flight, reverseIndex) {
                    const index =
                        window.fluege.length -
                        1 -
                        reverseIndex;

                    return `
                        <article class="flight">

                            <div class="flight-header">

                                <h3>
                                    ${htmlSicher(
                                        formatDatum(
                                            flight.startzeit ||
                                            flight.datum
                                        )
                                    )}
                                </h3>

                                <strong>
                                    ${htmlSicher(
                                        flight.ballon ||
                                        "-"
                                    )}
                                </strong>

                            </div>

                            <div class="flight-data">

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

                                    ${formatFlugzeit(
                                        flight.flugzeit
                                    )}
                                </div>

                                <div>
                                    <small>Strecke</small>

                                    ${formatZahl(
                                        flight.strecke,
                                        1
                                    )} km
                                </div>

                                <div>
                                    <small>Maximale Höhe</small>

                                    ${formatZahl(
                                        flight.maxHoehe
                                    )} m
                                </div>

                                <div>
                                    <small>Maximales Tempo</small>

                                    ${formatZahl(
                                        flight.maxSpeed
                                    )} km/h
                                </div>

                                <div>
                                    <small>Landungen</small>

                                    ${formatZahl(
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
                                        <div class="flight-note">
                                            ${htmlSicher(
                                                flight.bemerkung
                                            )}
                                        </div>
                                    `
                                    : ""
                            }

                            <div class="flight-actions">

                                <button
                                    class="secondary-button"
                                    data-flight-map="${index}"
                                    type="button"
                                >
                                    Auf Karte
                                </button>

                                <button
                                    class="
                                        primary-button
                                        delete-button
                                    "
                                    data-flight-delete="${index}"
                                    type="button"
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

function anzeigeAktualisieren() {
    zusammenfassungAktualisieren();
    rekordeAktualisieren();
    flugbuchAktualisieren();
    zeichneMonatsstatistik();

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
}

function flugLoeschen(index) {
    const flight =
        window.fluege[index];

    if (!flight) {
        return;
    }

    const confirmed =
        window.confirm(
            "Soll diese Fahrt wirklich gelöscht werden?"
        );

    if (!confirmed) {
        return;
    }

    const removed =
        window.fluege.splice(
            index,
            1
        )[0];

    if (!fluegeSpeichern()) {
        window.fluege.splice(
            index,
            0,
            removed
        );

        return;
    }

    anzeigeAktualisieren();
}

function backupExportieren() {
    const backup = {
        version: 10,
        exportedAt:
            new Date().toISOString(),
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

    const url =
        URL.createObjectURL(blob);

    const link =
        document.createElement("a");

    link.href = url;

    link.download =
        "ballonflugbuch-backup-" +
        new Date()
            .toISOString()
            .slice(0, 10) +
        ".json";

    link.click();

    URL.revokeObjectURL(url);
}

/* =====================================
   IMPORT
===================================== */

function importDialogOeffnen() {
    vorbereiteteImportFluege = [];

    element("importInput").value =
        "";

    element(
        "importFileInformation"
    ).textContent =
        "Noch keine Datei ausgewählt.";

    element("importPreview").hidden =
        true;

    element("importPreview").innerHTML =
        "";

    element("importMessage").textContent =
        "";

    element("executeImportButton")
        .disabled = true;

    element("importDialog").hidden =
        false;
}

function importDialogSchliessen() {
    element("importDialog").hidden =
        true;

    vorbereiteteImportFluege = [];
}

function importZahl(
    value,
    defaultValue = 0
) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return defaultValue;
    }

    const normalized =
        typeof value === "string"
            ? value
                .trim()
                .replace(",", ".")
            : value;

    const number =
        Number(normalized);

    return Number.isFinite(number)
        ? number
        : defaultValue;
}

function importDatum(value) {
    if (!value) {
        return null;
    }

    const text =
        String(value).trim();

    const germanMatch =
        text.match(
            /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/
        );

    if (germanMatch) {
        const date =
            new Date(
                Number(germanMatch[3]),
                Number(germanMatch[2]) - 1,
                Number(germanMatch[1]),
                Number(germanMatch[4] || 0),
                Number(germanMatch[5] || 0)
            );

        return Number.isNaN(
            date.getTime()
        )
            ? null
            : date.toISOString();
    }

    const date =
        new Date(text);

    return Number.isNaN(
        date.getTime()
    )
        ? null
        : date.toISOString();
}

function csvZeileAufteilen(
    line,
    separator
) {
    const values = [];

    let currentValue = "";
    let quoted = false;

    for (
        let index = 0;
        index < line.length;
        index += 1
    ) {
        const character =
            line[index];

        if (character === "\"") {
            if (
                quoted &&
                line[index + 1] === "\""
            ) {
                currentValue += "\"";
                index += 1;
            } else {
                quoted = !quoted;
            }

            continue;
        }

        if (
            character === separator &&
            !quoted
        ) {
            values.push(
                currentValue.trim()
            );

            currentValue = "";
            continue;
        }

        currentValue += character;
    }

    values.push(
        currentValue.trim()
    );

    return values;
}

function csvEinlesen(text) {
    const lines =
        String(text)
            .replace(/^\uFEFF/, "")
            .trim()
            .split(/\r?\n/)
            .filter(Boolean);

    if (lines.length < 2) {
        throw new Error(
            "Die CSV-Datei enthält keine Fahrten."
        );
    }

    const firstLine =
        lines[0];

    const semicolonCount =
        (
            firstLine.match(/;/g) ||
            []
        ).length;

    const commaCount =
        (
            firstLine.match(/,/g) ||
            []
        ).length;

    const separator =
        semicolonCount >= commaCount
            ? ";"
            : ",";

    const headers =
        csvZeileAufteilen(
            lines.shift(),
            separator
        ).map(function (header) {
            return header
                .toLowerCase()
                .replace(/\s+/g, "")
                .replace(/ä/g, "ae")
                .replace(/ö/g, "oe")
                .replace(/ü/g, "ue")
                .replace(/ß/g, "ss");
        });

    return lines.map(
        function (line) {
            const values =
                csvZeileAufteilen(
                    line,
                    separator
                );

            const row = {};

            headers.forEach(
                function (header, index) {
                    row[header] =
                        values[index] || "";
                }
            );

            return row;
        }
    );
}

function importFlugNormalisieren(
    rawFlight,
    index
) {
    const getValue =
        function (...keys) {
            for (const key of keys) {
                if (
                    rawFlight[key] !==
                    undefined &&
                    rawFlight[key] !==
                    ""
                ) {
                    return rawFlight[key];
                }
            }

            return "";
        };

    const startTime =
        importDatum(
            getValue(
                "startzeit",
                "startZeit",
                "datum",
                "date"
            )
        );

    if (!startTime) {
        return null;
    }

    let track =
        getValue(
            "track",
            "trackpunkte",
            "route"
        );

    if (typeof track === "string") {
        try {
            track = JSON.parse(track);
        } catch {
            track = [];
        }
    }

    if (!Array.isArray(track)) {
        track = [];
    }

    const normalizedTrack =
        track
            .map(function (point) {
                const lat =
                    importZahl(
                        point.lat ??
                        point.latitude,
                        null
                    );

                const lng =
                    importZahl(
                        point.lng ??
                        point.lon ??
                        point.longitude,
                        null
                    );

                if (
                    !Number.isFinite(lat) ||
                    !Number.isFinite(lng)
                ) {
                    return null;
                }

                return {
                    lat,
                    lng,

                    hoehe:
                        importZahl(
                            point.hoehe ??
                            point.altitude,
                            null
                        ),

                    speed:
                        importZahl(
                            point.speed,
                            null
                        ),

                    zeit:
                        importDatum(
                            point.zeit ??
                            point.timestamp
                        ) ||
                        startTime
                };
            })
            .filter(Boolean);

    return {
        id:
            getValue("id") ||
            `import-${Date.now()}-${index}`,

        datum:
            startTime,

        startzeit:
            startTime,

        endezeit:
            importDatum(
                getValue(
                    "endezeit",
                    "endeZeit"
                )
            ),

        pilot:
            textBereinigen(
                getValue("pilot")
            ) || "Unbekannt",

        ballon:
            textBereinigen(
                getValue(
                    "ballon",
                    "kennzeichen",
                    "registration"
                )
            ).toUpperCase() ||
            "UNBEKANNT",

        ballontyp:
            textBereinigen(
                getValue(
                    "ballontyp",
                    "ballonTyp",
                    "type"
                )
            ),

        startOrt:
            textBereinigen(
                getValue(
                    "startOrt",
                    "startort",
                    "start"
                )
            ) || "Unbekannt",

        landeOrt:
            textBereinigen(
                getValue(
                    "landeOrt",
                    "landeort",
                    "landung"
                )
            ) || "Unbekannt",

        flugzeit:
            Math.max(
                0,
                importZahl(
                    getValue(
                        "flugzeit",
                        "dauer"
                    )
                )
            ),

        strecke:
            Math.max(
                0,
                importZahl(
                    getValue(
                        "strecke",
                        "kilometer"
                    )
                )
            ),

        avgSpeed:
            importZahl(
                getValue(
                    "avgSpeed",
                    "avgspeed"
                )
            ),

        maxSpeed:
            importZahl(
                getValue(
                    "maxSpeed",
                    "maxspeed"
                )
            ),

        maxHoehe:
            importZahl(
                getValue(
                    "maxHoehe",
                    "maxhoehe"
                )
            ),

        minHoehe:
            importZahl(
                getValue(
                    "minHoehe",
                    "minhoehe"
                )
            ),

        avgHoehe:
            importZahl(
                getValue(
                    "avgHoehe",
                    "avghoehe"
                )
            ),

        landungen:
            Math.max(
                1,
                importZahl(
                    getValue(
                        "landungen"
                    ),
                    1
                )
            ),

        bemerkung:
            textBereinigen(
                getValue(
                    "bemerkung",
                    "notiz"
                )
            ),

        track:
            normalizedTrack
    };
}

async function importDateiAuswaehlen(
    event
) {
    const file =
        event.target.files?.[0];

    vorbereiteteImportFluege = [];

    element("executeImportButton")
        .disabled = true;

    element("importPreview").hidden =
        true;

    if (!file) {
        return;
    }

    try {
        const text =
            await file.text();

        let rawFlights;

        if (
            file.name
                .toLowerCase()
                .endsWith(".csv")
        ) {
            rawFlights =
                csvEinlesen(text);
        } else {
            const json =
                JSON.parse(text);

            if (Array.isArray(json)) {
                rawFlights = json;
            } else if (
                Array.isArray(
                    json.fluege
                )
            ) {
                rawFlights =
                    json.fluege;
            } else if (
                Array.isArray(
                    json.fahrten
                )
            ) {
                rawFlights =
                    json.fahrten;
            } else {
                throw new Error(
                    "Die JSON-Datei enthält keine Flugliste."
                );
            }
        }

        const normalizedFlights =
            rawFlights
                .map(
                    importFlugNormalisieren
                )
                .filter(Boolean);

        if (
            normalizedFlights.length ===
            0
        ) {
            throw new Error(
                "Keine gültigen Fahrten gefunden."
            );
        }

        vorbereiteteImportFluege =
            normalizedFlights;

        element(
            "importFileInformation"
        ).textContent =
            `${file.name} · ` +
            `${normalizedFlights.length} gültige Fahrt(en)`;

        const landingCount =
            normalizedFlights.reduce(
                function (sum, flight) {
                    return (
                        sum +
                        Number(
                            flight.landungen
                        )
                    );
                },
                0
            );

        element("importPreview")
            .innerHTML = `
                <strong>
                    ✓ Datei erfolgreich geprüft
                </strong>

                <p>
                    ${normalizedFlights.length}
                    Fahrt(en) und
                    ${landingCount}
                    Landung(en) gefunden.
                </p>
            `;

        element("importPreview").hidden =
            false;

        element("executeImportButton")
            .disabled = false;

        element("importMessage")
            .textContent =
            "Die Datei kann importiert werden.";

        element("importMessage")
            .className =
            "import-message import-message-success";
    } catch (error) {
        console.error(
            "Import fehlgeschlagen:",
            error
        );

        element("importMessage")
            .textContent =
            "❌ " +
            (
                error.message ||
                "Importdatei ist ungültig."
            );

        element("importMessage")
            .className =
            "import-message import-message-error";
    }
}

function importAusfuehren() {
    if (
        vorbereiteteImportFluege.length ===
        0
    ) {
        return;
    }

    const mode =
        document.querySelector(
            "input[name='importMode']:checked"
        )?.value || "append";

    if (mode === "replace") {
        const confirmed =
            window.confirm(
                "Alle vorhandenen Fahrten werden ersetzt. Fortfahren?"
            );

        if (!confirmed) {
            return;
        }

        window.fluege = [
            ...vorbereititeteImportListe()
        ];
    } else {
        const existingKeys =
            new Set(
                window.fluege.map(
                    function (flight) {
                        return (
                            `${flight.startzeit}|` +
                            `${flight.ballon}`
                        );
                    }
                )
            );

        vorbereiteteImportFluege
            .forEach(function (flight) {
                const key =
                    `${flight.startzeit}|` +
                    `${flight.ballon}`;

                if (!existingKeys.has(key)) {
                    window.fluege.push(flight);
                    existingKeys.add(key);
                }
            });
    }

    if (!fluegeSpeichern()) {
        return;
    }

    anzeigeAktualisieren();
    importDialogSchliessen();
}

function vorbereiteteImportListe() {
    return Array.isArray(
        vorbereiteteImportFluege
    )
        ? vorbereiteteImportFluege
        : [];
}

/* =====================================
   STAMMDATEN UND INITIALISIERUNG
===================================== */

function stammdatenLaden() {
    try {
        return JSON.parse(
            localStorage.getItem(
                "stammdaten"
            ) || "{}"
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

        maintenance:
            element(
                "maintenanceInput"
            ).value
    };

    localStorage.setItem(
        "stammdaten",
        JSON.stringify(data)
    );

    kopfbereichAktualisieren();
}

function kopfbereichAktualisieren() {
    const pilot =
        textBereinigen(
            element("pilot").value
        );

    element("pilotHeader")
        .textContent =
        pilot || "Pilot";

    element("welcomeTitle")
        .textContent =
        pilot
            ? `Willkommen zurück, ${pilot}!`
            : "Willkommen zurück!";

    const maintenance =
        element(
            "maintenanceInput"
        ).value;

    element("maintenanceDate")
        .textContent =
        maintenance
            ? new Date(
                maintenance +
                "T12:00:00"
            ).toLocaleDateString(
                "de-AT"
            )
            : "Nicht festgelegt";
}

function aktuelleZeitAktualisieren() {
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
                hour: "2-digit",
                minute: "2-digit"
            }
        );
}

function appInitialisieren() {
    const masterData =
        stammdatenLaden();

    element("pilot").value =
        masterData.pilot || "";

    element("ballon").value =
        masterData.ballon || "";

    element("ballontyp").value =
        masterData.ballontyp || "";

    element("maintenanceInput")
        .value =
        masterData.maintenance || "";

    [
        "pilot",
        "ballon",
        "ballontyp",
        "maintenanceInput"
    ].forEach(function (id) {
        element(id).addEventListener(
            "change",
            stammdatenSpeichern
        );
    });

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
            backupExportieren
        );

    element("openImportButton")
        .addEventListener(
            "click",
            importDialogOeffnen
        );

    element("closeImportButton")
        .addEventListener(
            "click",
            importDialogSchliessen
        );

    element("cancelImportButton")
        .addEventListener(
            "click",
            importDialogSchliessen
        );

    element("importInput")
        .addEventListener(
            "change",
            importDateiAuswaehlen
        );

    element("executeImportButton")
        .addEventListener(
            "click",
            importAusfuehren
        );

    element("importDialog")
        .addEventListener(
            "click",
            function (event) {
                if (
                    event.target ===
                    element("importDialog")
                ) {
                    importDialogSchliessen();
                }
            }
        );

    document.addEventListener(
        "keydown",
        function (event) {
            if (
                event.key === "Escape" &&
                !element("importDialog").hidden
            ) {
                importDialogSchliessen();
            }
        }
    );

    element("menuButton")
        .addEventListener(
            "click",
            function () {
                const sidebar =
                    element("sidebar");

                sidebar.classList.toggle(
                    "sidebar-open"
                );

                element("menuButton")
                    .setAttribute(
                        "aria-expanded",
                        sidebar.classList.contains(
                            "sidebar-open"
                        )
                            ? "true"
                            : "false"
                    );
            }
        );

    document.querySelectorAll(
        ".nav-link[href]"
    ).forEach(function (link) {
        link.addEventListener(
            "click",
            function () {
                document.querySelectorAll(
                    ".nav-link"
                ).forEach(
                    function (navLink) {
                        navLink.classList
                            .remove("active");
                    }
                );

                link.classList.add(
                    "active"
                );

                element("sidebar")
                    .classList
                    .remove(
                        "sidebar-open"
                    );
            }
        );
    });

    element("flugliste")
        .addEventListener(
            "click",
            function (event) {
                const mapIndex =
                    event.target.dataset
                        .flightMap;

                const deleteIndex =
                    event.target.dataset
                        .flightDelete;

                if (
                    mapIndex !== undefined
                ) {
                    const flight =
                        window.fluege[
                            Number(mapIndex)
                        ];

                    if (flight) {
                        flugAufKarte(
                            flight.track
                        );

                        zeichneHoehenprofil(
                            flight.track
                        );
                    }
                }

                if (
                    deleteIndex !==
                    undefined
                ) {
                    flugLoeschen(
                        Number(deleteIndex)
                    );
                }
            }
        );

    kopfbereichAktualisieren();
    aktuelleZeitAktualisieren();

    window.setInterval(
        aktuelleZeitAktualisieren,
        1000
    );

    buttonStatusSetzen(
        false,
        true,
        true
    );

    zeichneHoehenprofil([]);
    anzeigeAktualisieren();
}

if (
    document.readyState ===
    "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        appInitialisieren
    );
} else {
    appInitialisieren();
}
