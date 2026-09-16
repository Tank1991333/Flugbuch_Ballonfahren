"use strict";

const FLIGHT_STORAGE_KEY = "fluege";
const MASTER_DATA_KEY = "stammdaten";
const MONITOR_STORAGE_KEY = "monitorEinstellungen";

const DEFAULT_CENTER = [47.28, 15.97];
const DEFAULT_ZOOM = 8;

const PAGE_IDS = [
    "dashboard",
    "fahrt-erfassen",
    "flugbuch",
    "karte",
    "statistiken",
    "wetter",
    "einstellungen"
];

const MONITOR_DEFAULTS = Object.freeze({
    zeitraumMonate: 24,
    erforderlicheStunden: 6,
    erforderlicheLandungen: 10
});

function sichereDezimalzahl(
    value,
    fallback,
    minimum = 0,
    maximum = Number.MAX_SAFE_INTEGER
) {
    const normalizedValue =
        typeof value === "string"
            ? value.replace(",", ".")
            : value;

    const parsed = Number(normalizedValue);

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.min(
        maximum,
        Math.max(minimum, parsed)
    );
}

let fluege = ladeJson(FLIGHT_STORAGE_KEY, []);
let aktuellerFlug = null;
let trackpunkte = [];

let flightWatchId = null;
let locationWatchId = null;
let letzterStandort = null;

let hauptkarte = null;
let trackingKarte = null;

let allFlightsLayer = null;
let selectedFlightLayer = null;

let mainLocationMarker = null;
let mainAccuracyCircle = null;

let trackingLocationMarker = null;
let trackingAccuracyCircle = null;

let trackingStartMarker = null;
let trackingLandingMarker = null;
let trackingRouteLine = null;

let hoehenChart = null;
let monatsChart = null;

let vorbereiteteImportFluege = [];
let flugWirdBeendet = false;

window.fluege = fluege;

function element(id) {
    return document.getElementById(id);
}

function textBereinigen(value) {
    return String(value ?? "").trim();
}

function htmlSicher(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
}

function textSetzen(id, value) {
    const node = element(id);

    if (node) {
        node.textContent = String(value);
    }
}

function ladeJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);

        return raw
            ? JSON.parse(raw)
            : fallback;
    } catch (error) {
        console.error(error);
        return fallback;
    }
}

function formatZahl(value, decimals = 0) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "0";
    }

    return number.toLocaleString("de-AT", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatFlugzeit(minutes) {
    const total = Math.max(
        0,
        Math.round(Number(minutes) || 0)
    );

    const hours = Math.floor(total / 60);
    const remainingMinutes = total % 60;

    return (
        `${hours}h ` +
        `${String(remainingMinutes).padStart(2, "0")}m`
    );
}

function formatDatum(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleString("de-AT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatKoordinate(value) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number.toFixed(6)
        : "--";
}

function sichereId() {
    if (
        globalThis.crypto &&
        typeof globalThis.crypto.randomUUID === "function"
    ) {
        return globalThis.crypto.randomUUID();
    }

    return (
        `flug-${Date.now()}-` +
        Math.random().toString(16).slice(2)
    );
}

function mapPointValid(point) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);

    return (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
    );
}

function entfernung(pointA, pointB) {
    const earthRadius = 6371;
    const radians = Math.PI / 180;

    const latDifference =
        (Number(pointB.lat) - Number(pointA.lat)) *
        radians;

    const lngDifference =
        (Number(pointB.lng) - Number(pointA.lng)) *
        radians;

    const latitudeA =
        Number(pointA.lat) * radians;

    const latitudeB =
        Number(pointB.lat) * radians;

    const value =
        Math.sin(latDifference / 2) ** 2 +
        Math.cos(latitudeA) *
        Math.cos(latitudeB) *
        Math.sin(lngDifference / 2) ** 2;

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

function fluegeSpeichern() {
    try {
        localStorage.setItem(
            FLIGHT_STORAGE_KEY,
            JSON.stringify(fluege)
        );

        window.fluege = fluege;
        return true;
    } catch (error) {
        console.error(error);

        window.alert(
            "Die Fahrtdaten konnten nicht gespeichert werden."
        );

        return false;
    }
}

function stammdatenLaden() {
    const data = ladeJson(
        MASTER_DATA_KEY,
        {}
    );

    return data && typeof data === "object"
        ? data
        : {};
}

function stammdatenSpeichern() {
    const data = {
        pilot: textBereinigen(
            element("pilot")?.value
        ),

        ballon: textBereinigen(
            element("ballon")?.value
        ).toUpperCase(),

        ballontyp: textBereinigen(
            element("ballontyp")?.value
        ),

        maintenance:
            element("maintenanceInput")?.value ||
            ""
    };

    try {
        localStorage.setItem(
            MASTER_DATA_KEY,
            JSON.stringify(data)
        );

        if (element("ballon")) {
            element("ballon").value =
                data.ballon;
        }

        kopfbereichAktualisieren();

        textSetzen(
            "masterDataMessage",
            "✓ Stammdaten wurden gespeichert."
        );
    } catch (error) {
        console.error(error);

        textSetzen(
            "masterDataMessage",
            "❌ Stammdaten konnten nicht gespeichert werden."
        );
    }
}

function seiteAnzeigen(pageId) {
    const zielseite =
        PAGE_IDS.includes(pageId)
            ? pageId
            : "dashboard";

    document
        .querySelectorAll(".app-page")
        .forEach(function (page) {
            const active =
                page.id === zielseite;

            page.hidden = !active;

            page.classList.toggle(
                "active",
                active
            );
        });

    document
        .querySelectorAll("[data-page-link]")
        .forEach(function (link) {
            link.classList.toggle(
                "active",
                link.dataset.pageLink ===
                    zielseite
            );
        });

    element("sidebar")
        ?.classList.remove("sidebar-open");

    element("menuButton")
        ?.setAttribute(
            "aria-expanded",
            "false"
        );

    if (
        window.location.hash !==
        `#${zielseite}`
    ) {
        window.history.replaceState(
            null,
            "",
            `#${zielseite}`
        );
    }

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    if (zielseite === "karte") {
        window.setTimeout(
            function () {
                hauptkarteInitialisieren();
                hauptkarte?.invalidateSize();
                alleFluegeAufKarte();
            },
            100
        );
    }

    if (zielseite === "fahrt-erfassen") {
        window.setTimeout(
            function () {
                trackingKarteInitialisieren();
                trackingKarte?.invalidateSize();
            },
            100
        );
    }

    if (zielseite === "statistiken") {
        window.setTimeout(
            zeichneMonatsstatistik,
            100
        );
    }

    if (zielseite === "wetter") {
        ladeWetter();
    }
}

function kartenEbenen() {
    const standard = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution:
                "&copy; OpenStreetMap-Mitwirkende"
        }
    );

    const satellite = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/" +
        "World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
            maxZoom: 19,
            attribution:
                "Tiles &copy; Esri"
        }
    );

    return {
        standard,
        satellite
    };
}

function hauptkarteInitialisieren() {
    if (
        typeof L === "undefined" ||
        hauptkarte ||
        !element("map")
    ) {
        return;
    }

    const layers = kartenEbenen();

    hauptkarte = L.map("map", {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        layers: [layers.standard]
    });

    L.control.layers({
        "Standardkarte": layers.standard,
        "Satellitenkarte": layers.satellite
    }).addTo(hauptkarte);

    L.control.scale({
        imperial: false
    }).addTo(hauptkarte);

    allFlightsLayer =
        L.layerGroup().addTo(hauptkarte);

    selectedFlightLayer =
        L.layerGroup().addTo(hauptkarte);
}

function trackingKarteInitialisieren() {
    if (
        typeof L === "undefined" ||
        trackingKarte ||
        !element("trackingMap")
    ) {
        return;
    }

    const layers = kartenEbenen();

    trackingKarte = L.map("trackingMap", {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        layers: [layers.satellite]
    });

    L.control.layers({
        "Satellitenkarte": layers.satellite,
        "Standardkarte": layers.standard
    }).addTo(trackingKarte);

    L.control.scale({
        imperial: false
    }).addTo(trackingKarte);
}

function standortAufKartenZeichnen(position) {
    const latitude =
        Number(position.coords.latitude);

    const longitude =
        Number(position.coords.longitude);

    const accuracy =
        Number(position.coords.accuracy);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        typeof L === "undefined"
    ) {
        return;
    }

    const coordinates = [
        latitude,
        longitude
    ];

    if (hauptkarte) {
        if (!mainLocationMarker) {
            mainLocationMarker =
                L.circleMarker(
                    coordinates,
                    {
                        radius: 9,
                        color: "#ffffff",
                        weight: 3,
                        fillColor: "#16a2ff",
                        fillOpacity: 1
                    }
                )
                    .addTo(hauptkarte)
                    .bindPopup(
                        "Aktueller GPS-Standort"
                    );
        } else {
            mainLocationMarker.setLatLng(
                coordinates
            );
        }

        if (Number.isFinite(accuracy)) {
            if (!mainAccuracyCircle) {
                mainAccuracyCircle =
                    L.circle(
                        coordinates,
                        {
                            radius: accuracy,
                            color: "#16a2ff",
                            weight: 1,
                            fillColor: "#16a2ff",
                            fillOpacity: 0.1
                        }
                    ).addTo(hauptkarte);
            } else {
                mainAccuracyCircle
                    .setLatLng(coordinates)
                    .setRadius(accuracy);
            }
        }
    }

    if (trackingKarte) {
        if (!trackingLocationMarker) {
            trackingLocationMarker =
                L.circleMarker(
                    coordinates,
                    {
                        radius: 8,
                        color: "#ffffff",
                        weight: 3,
                        fillColor: "#16a2ff",
                        fillOpacity: 1
                    }
                )
                    .addTo(trackingKarte)
                    .bindPopup(
                        "Aktueller GPS-Standort"
                    );
        } else {
            trackingLocationMarker.setLatLng(
                coordinates
            );
        }

        if (Number.isFinite(accuracy)) {
            if (!trackingAccuracyCircle) {
                trackingAccuracyCircle =
                    L.circle(
                        coordinates,
                        {
                            radius: accuracy,
                            color: "#16a2ff",
                            weight: 1,
                            fillColor: "#16a2ff",
                            fillOpacity: 0.1
                        }
                    ).addTo(trackingKarte);
            } else {
                trackingAccuracyCircle
                    .setLatLng(coordinates)
                    .setRadius(accuracy);
            }
        }
    }
}
function markerSetzen(
    typ,
    latitude,
    longitude
) {
    trackingKarteInitialisieren();

    if (
        !trackingKarte ||
        typeof L === "undefined"
    ) {
        return;
    }

    const coordinates = [
        Number(latitude),
        Number(longitude)
    ];

    if (!coordinates.every(Number.isFinite)) {
        return;
    }

    const isStart = typ === "start";

    const oldMarker = isStart
        ? trackingStartMarker
        : trackingLandingMarker;

    if (oldMarker) {
        trackingKarte.removeLayer(oldMarker);
    }

    const marker = L.circleMarker(
        coordinates,
        {
            radius: 8,
            color: "#ffffff",
            weight: 2,
            fillColor: isStart
                ? "#43dd6b"
                : "#ff625b",
            fillOpacity: 1
        }
    )
        .addTo(trackingKarte)
        .bindPopup(
            isStart
                ? "Startpunkt"
                : "Landepunkt"
        );

    if (isStart) {
        trackingStartMarker = marker;

        trackingKarte.setView(
            coordinates,
            13
        );
    } else {
        trackingLandingMarker = marker;
    }
}

function zeichneTrackingTrack(track) {
    trackingKarteInitialisieren();

    if (
        !trackingKarte ||
        typeof L === "undefined"
    ) {
        return;
    }

    const route = (
        Array.isArray(track)
            ? track
            : []
    )
        .filter(mapPointValid)
        .map(function (point) {
            return [
                Number(point.lat),
                Number(point.lng)
            ];
        });

    if (trackingRouteLine) {
        trackingKarte.removeLayer(
            trackingRouteLine
        );
    }

    trackingRouteLine = null;

    if (route.length < 2) {
        return;
    }

    trackingRouteLine = L.polyline(
        route,
        {
            color: "#16a2ff",
            weight: 4,
            opacity: 0.92,
            lineCap: "round",
            lineJoin: "round"
        }
    ).addTo(trackingKarte);

    const bounds =
        trackingRouteLine.getBounds();

    if (bounds.isValid()) {
        trackingKarte.fitBounds(
            bounds,
            {
                padding: [25, 25],
                maxZoom: 15
            }
        );
    }
}

function trackingKarteZuruecksetzen() {
    if (!trackingKarte) {
        return;
    }

    [
        trackingStartMarker,
        trackingLandingMarker,
        trackingRouteLine
    ].forEach(function (layer) {
        if (layer) {
            trackingKarte.removeLayer(layer);
        }
    });

    trackingStartMarker = null;
    trackingLandingMarker = null;
    trackingRouteLine = null;
}

function alleFluegeAufKarte() {
    hauptkarteInitialisieren();

    if (
        !hauptkarte ||
        !allFlightsLayer ||
        typeof L === "undefined"
    ) {
        return;
    }

    allFlightsLayer.clearLayers();

    const allCoordinates = [];

    fluege.forEach(function (flight) {
        const route = (
            Array.isArray(flight.track)
                ? flight.track
                : []
        )
            .filter(mapPointValid)
            .map(function (point) {
                return [
                    Number(point.lat),
                    Number(point.lng)
                ];
            });

        if (route.length === 0) {
            return;
        }

        if (route.length >= 2) {
            L.polyline(
                route,
                {
                    color: "#149eff",
                    weight: 3,
                    opacity: 0.68
                }
            ).addTo(allFlightsLayer);
        }

        L.circleMarker(
            route[0],
            {
                radius: 5,
                color: "#ffffff",
                weight: 1,
                fillColor: "#43dd6b",
                fillOpacity: 1
            }
        ).addTo(allFlightsLayer);

        if (route.length > 1) {
            L.circleMarker(
                route[route.length - 1],
                {
                    radius: 5,
                    color: "#ffffff",
                    weight: 1,
                    fillColor: "#ff625b",
                    fillOpacity: 1
                }
            ).addTo(allFlightsLayer);
        }

        allCoordinates.push(...route);
    });

    if (
        allCoordinates.length > 0 &&
        !letzterStandort
    ) {
        hauptkarte.fitBounds(
            allCoordinates,
            {
                padding: [20, 20],
                maxZoom: 11
            }
        );
    }
}

function flugAufKarte(flight) {
    hauptkarteInitialisieren();

    if (
        !hauptkarte ||
        !selectedFlightLayer ||
        typeof L === "undefined"
    ) {
        return;
    }

    const route = (
        Array.isArray(flight?.track)
            ? flight.track
            : []
    )
        .filter(mapPointValid)
        .map(function (point) {
            return [
                Number(point.lat),
                Number(point.lng)
            ];
        });

    if (route.length === 0) {
        return;
    }

    selectedFlightLayer.clearLayers();

    L.circleMarker(
        route[0],
        {
            radius: 8,
            color: "#ffffff",
            weight: 2,
            fillColor: "#43dd6b",
            fillOpacity: 1
        }
    )
        .addTo(selectedFlightLayer)
        .bindPopup(
            `Start: ${htmlSicher(
                flight.startOrt || "Unbekannt"
            )}`
        );

    if (route.length > 1) {
        L.polyline(
            route,
            {
                color: "#ffd43b",
                weight: 5,
                opacity: 0.95
            }
        ).addTo(selectedFlightLayer);

        L.circleMarker(
            route[route.length - 1],
            {
                radius: 8,
                color: "#ffffff",
                weight: 2,
                fillColor: "#ff625b",
                fillOpacity: 1
            }
        )
            .addTo(selectedFlightLayer)
            .bindPopup(
                `Landung: ${htmlSicher(
                    flight.landeOrt ||
                    "Unbekannt"
                )}`
            );
    }

    const bounds = L.latLngBounds(route);

    if (bounds.isValid()) {
        hauptkarte.fitBounds(
            bounds,
            {
                padding: [30, 30],
                maxZoom: 15
            }
        );
    }
}

function standortAnzeigeAktualisieren(position) {
    const latitude =
        position.coords.latitude;

    const longitude =
        position.coords.longitude;

    const altitude =
        position.coords.altitude;

    const accuracy =
        position.coords.accuracy;

    const speed =
        position.coords.speed;

    textSetzen(
        "currentLatitude",
        formatKoordinate(latitude)
    );

    textSetzen(
        "currentLongitude",
        formatKoordinate(longitude)
    );

    textSetzen(
        "currentAltitude",
        Number.isFinite(Number(altitude))
            ? `${Math.round(Number(altitude))} m`
            : "Nicht verfügbar"
    );

    textSetzen(
        "currentAccuracy",
        Number.isFinite(Number(accuracy))
            ? `± ${Math.round(Number(accuracy))} m`
            : "--"
    );

    textSetzen(
        "currentSpeed",
        Number.isFinite(Number(speed))
            ? (
                `${formatZahl(
                    Math.max(
                        0,
                        Number(speed)
                    ) * 3.6,
                    1
                )} km/h`
            )
            : "Nicht verfügbar"
    );

    textSetzen(
        "locationUpdatedAt",
        new Date(
            position.timestamp ||
            Date.now()
        ).toLocaleTimeString("de-AT")
    );

    textSetzen(
        "locationStatus",
        "GPS-Position aktiv"
    );

    textSetzen(
        "trackingCoordinates",
        `${formatKoordinate(latitude)}, ` +
        `${formatKoordinate(longitude)}`
    );

    textSetzen(
        "trackingAccuracy",
        Number.isFinite(Number(accuracy))
            ? (
                "GPS-Genauigkeit: ± " +
                `${Math.round(
                    Number(accuracy)
                )} m`
            )
            : "GPS-Genauigkeit: --"
    );
}

function standortErfolgreich(position) {
    letzterStandort = position;

    standortAnzeigeAktualisieren(position);
    standortAufKartenZeichnen(position);
}

function standortFehler(error) {
    const texts = {
        1: "Standortberechtigung nicht erteilt",
        2: "Standort derzeit nicht verfügbar",
        3: "Standortabfrage hat zu lange gedauert"
    };

    const message =
        texts[error?.code] ||
        "GPS-Position nicht verfügbar";

    textSetzen(
        "locationStatus",
        message
    );

    textSetzen(
        "trackingCoordinates",
        message
    );
}

function standortUeberwachungStarten() {
    if (
        !navigator.geolocation ||
        locationWatchId !== null
    ) {
        return;
    }

    locationWatchId =
        navigator.geolocation.watchPosition(
            standortErfolgreich,
            standortFehler,
            {
                enableHighAccuracy: true,
                maximumAge: 3000,
                timeout: 20000
            }
        );
}

function standortZentrieren(map) {
    if (!letzterStandort) {
        standortUeberwachungStarten();

        textSetzen(
            "locationStatus",
            "GPS-Position wird ermittelt ..."
        );

        return;
    }

    map?.setView(
        [
            letzterStandort.coords.latitude,
            letzterStandort.coords.longitude
        ],
        14,
        {
            animate: true
        }
    );
}

async function ortName(latitude, longitude) {
    try {
        const parameters =
            new URLSearchParams({
                format: "jsonv2",
                lat: String(latitude),
                lon: String(longitude),
                zoom: "10",
                addressdetails: "1"
            });

        const response = await fetch(
            "https://nominatim.openstreetmap.org/reverse?" +
            parameters.toString(),
            {
                headers: {
                    Accept: "application/json",
                    "Accept-Language": "de"
                }
            }
        );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const data = await response.json();
        const address = data.address || {};

        return (
            address.city ||
            address.town ||
            address.village ||
            address.municipality ||
            address.county ||
            "Unbekannt"
        );
    } catch (error) {
        console.error(error);
        return "Unbekannt";
    }
}

function trackpunktHinzufuegen(position) {
    const point = {
        lat: Number(
            position.coords.latitude
        ),

        lng: Number(
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
                Number(position.coords.speed)
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

        zeit: new Date(
            position.timestamp ||
            Date.now()
        ).toISOString()
    };

    if (!mapPointValid(point)) {
        return;
    }

    const lastPoint =
        trackpunkte[
            trackpunkte.length - 1
        ];

    if (
        lastPoint &&
        entfernung(lastPoint, point) < 0.003
    ) {
        return;
    }

    trackpunkte.push(point);

    zeichneTrackingTrack(trackpunkte);
    zeichneHoehenprofil(trackpunkte);
}

function statusSetzen(
    text,
    className = ""
) {
    const status = element("status");

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
    if (element("startButton")) {
        element("startButton").disabled =
            startDisabled;
    }

    if (element("stopButton")) {
        element("stopButton").disabled =
            stopDisabled;
    }

    if (element("saveButton")) {
        element("saveButton").disabled =
            saveDisabled;
    }
}

function geolocationFehlerText(error) {
    const messages = {
        1: "Die Standortberechtigung wurde nicht erteilt.",
        2: "Die Position ist derzeit nicht verfügbar.",
        3: "Die Standortabfrage hat zu lange gedauert."
    };

    return (
        messages[error?.code] ||
        "Der Standort konnte nicht ermittelt werden."
    );
}

function flugStarten() {
    if (aktuellerFlug) {
        window.alert(
            "Es ist bereits eine Fahrt aktiv."
        );

        return;
    }

    if (!navigator.geolocation) {
        window.alert(
            "GPS wird von diesem Browser nicht unterstützt."
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

    if (!pilot || !ballon) {
        window.alert(
            "Bitte zuerst Pilot und Ballon-Kennzeichen " +
            "unter Einstellungen eintragen."
        );

        seiteAnzeigen("einstellungen");
        return;
    }

    statusSetzen(
        "Startposition wird ermittelt ...",
        "status-working"
    );

    buttonStatusSetzen(
        true,
        true,
        true
    );

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            const now = new Date();

            aktuellerFlug = {
                id: sichereId(),
                datum: now.toISOString(),
                startzeit: now.toISOString(),
                pilot,
                ballon,
                ballontyp,

                startOrt: await ortName(
                    position.coords.latitude,
                    position.coords.longitude
                ),

                startLat:
                    position.coords.latitude,

                startLng:
                    position.coords.longitude
            };

            trackpunkte = [];
            flugWirdBeendet = false;

            trackingKarteZuruecksetzen();

            markerSetzen(
                "start",
                position.coords.latitude,
                position.coords.longitude
            );

            trackpunktHinzufuegen(position);

            flightWatchId =
                navigator.geolocation.watchPosition(
                    trackpunktHinzufuegen,

                    function () {
                        statusSetzen(
                            "Fahrt läuft. GPS ist vorübergehend gestört.",
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

        function (error) {
            statusSetzen(
                `❌ ${geolocationFehlerText(
                    error
                )}`,
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

    statusSetzen(
        "Landeposition wird ermittelt ...",
        "status-working"
    );

    buttonStatusSetzen(
        true,
        true,
        true
    );

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            if (flightWatchId !== null) {
                navigator.geolocation.clearWatch(
                    flightWatchId
                );

                flightWatchId = null;
            }

            trackpunktHinzufuegen(position);

            aktuellerFlug.endezeit =
                new Date().toISOString();

            aktuellerFlug.landeOrt =
                await ortName(
                    position.coords.latitude,
                    position.coords.longitude
                );

            aktuellerFlug.landeLat =
                position.coords.latitude;

            aktuellerFlug.landeLng =
                position.coords.longitude;

            markerSetzen(
                "landung",
                position.coords.latitude,
                position.coords.longitude
            );

            statusSetzen(
                "✓ Fahrt beendet. Bitte jetzt speichern.",
                "status-running"
            );

            buttonStatusSetzen(
                true,
                true,
                false
            );
        },

        function (error) {
            flugWirdBeendet = false;

            statusSetzen(
                `❌ ${geolocationFehlerText(
                    error
                )}`,
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
    if (!aktuellerFlug?.endezeit) {
        return;
    }

    const start =
        new Date(aktuellerFlug.startzeit);

    const end =
        new Date(aktuellerFlug.endezeit);

    const flightMinutes = Math.max(
        1,
        Math.round(
            (
                end.getTime() -
                start.getTime()
            ) / 60000
        )
    );

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

    const heights = trackpunkte
        .map(function (point) {
            return point.hoehe;
        })
        .filter(Number.isFinite);

    const speeds = trackpunkte
        .map(function (point) {
            return point.speed;
        })
        .filter(Number.isFinite);

    Object.assign(
        aktuellerFlug,
        {
            flugzeit: flightMinutes,

            strecke:
                Number(distance.toFixed(1)),

            track:
                [...trackpunkte],

            maxHoehe:
                heights.length
                    ? Math.round(
                        Math.max(...heights)
                    )
                    : 0,

            minHoehe:
                heights.length
                    ? Math.round(
                        Math.min(...heights)
                    )
                    : 0,

            avgHoehe:
                heights.length
                    ? Math.round(
                        heights.reduce(
                            function (
                                sum,
                                value
                            ) {
                                return (
                                    sum + value
                                );
                            },
                            0
                        ) / heights.length
                    )
                    : 0,

            maxSpeed:
                speeds.length
                    ? Number(
                        (
                            Math.max(
                                ...speeds
                            ) * 3.6
                        ).toFixed(1)
                    )
                    : 0,

            avgSpeed:
                Number(
                    (
                        distance /
                        (
                            flightMinutes /
                            60
                        )
                    ).toFixed(1)
                ),

            landungen:
                Math.max(
                    1,
                    Number.parseInt(
                        element(
                            "landungen"
                        )?.value,
                        10
                    ) || 1
                ),

            bemerkung:
                textBereinigen(
                    element(
                        "bemerkung"
                    )?.value
                )
        }
    );

    fluege.push(aktuellerFlug);

    if (!fluegeSpeichern()) {
        fluege.pop();
        return;
    }

    aktuellerFlug = null;
    trackpunkte = [];
    flugWirdBeendet = false;

    if (element("landungen")) {
        element("landungen").value = "1";
    }

    if (element("bemerkung")) {
        element("bemerkung").value = "";
    }

    statusSetzen(
        "✓ Fahrt erfolgreich gespeichert.",
        "status-running"
    );

    buttonStatusSetzen(
        false,
        true,
        true
    );

    zeichneHoehenprofil([]);
    anzeigeAktualisieren();
    seiteAnzeigen("flugbuch");
}

function chartOptionen() {
    return {
        responsive: true,
        maintainAspectRatio: false,

        interaction: {
            intersect: false,
            mode: "index"
        },

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
                labels: safeTrack.map(
                    function (_, index) {
                        return index + 1;
                    }
                ),

                datasets: [
                    {
                        label: "Höhe (m)",

                        data: safeTrack.map(
                            function (point) {
                                const height =
                                    Number(
                                        point.hoehe
                                    );

                                return Number.isFinite(
                                    height
                                )
                                    ? height
                                    : null;
                            }
                        ),

                        borderColor:
                            "#168cff",

                        backgroundColor:
                            "rgba(22, 140, 255, 0.13)",

                        fill: true,
                        tension: 0.25,
                        spanGaps: true,

                        pointRadius:
                            safeTrack.length > 80
                                ? 0
                                : 2
                    }
                ]
            },

            options: chartOptionen()
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
    const today = new Date();

    for (
        let offset = 11;
        offset >= 0;
        offset -= 1
    ) {
        const monthDate = new Date(
            today.getFullYear(),
            today.getMonth() - offset,
            1
        );

        labels.push(
            monthDate.toLocaleDateString(
                "de-AT",
                {
                    month: "short",
                    year: "2-digit"
                }
            )
        );

        const count = fluege.filter(
            function (flight) {
                const flightDate = new Date(
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

            options: chartOptionen()
        }
    );
}

function summenBerechnen() {
    return {
        time: fluege.reduce(
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
        ),

        distance: fluege.reduce(
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
        ),

        landings: fluege.reduce(
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
        )
    };
}

function zusammenfassungAktualisieren() {
    const totals = summenBerechnen();

    textSetzen(
        "countFlights",
        fluege.length
    );

    textSetzen(
        "countLandings",
        totals.landings
    );

    textSetzen(
        "countMinutes",
        formatFlugzeit(totals.time)
    );

    textSetzen(
        "countKm",
        `${formatZahl(
            totals.distance,
            1
        )} km`
    );

    textSetzen(
        "flightbookCount",
        `${fluege.length} EINTRÄGE`
    );

    const lastFlight = [...fluege]
        .sort(function (flightA, flightB) {
            return (
                new Date(
                    flightA.startzeit ||
                    flightA.datum ||
                    0
                ).getTime() -
                new Date(
                    flightB.startzeit ||
                    flightB.datum ||
                    0
                ).getTime()
            );
        })
        .at(-1);

    const rows = [
        [
            "Gesamtfahrten",
            fluege.length
        ],

        [
            "Gesamtlandungen",
            totals.landings
        ],

        [
            "Flugzeit",
            formatFlugzeit(totals.time)
        ],

        [
            "Strecke",
            `${formatZahl(
                totals.distance,
                1
            )} km`
        ],

        [
            "Durchschnittsdauer",
            formatFlugzeit(
                fluege.length
                    ? (
                        totals.time /
                        fluege.length
                    )
                    : 0
            )
        ],

        [
            "Letzte Fahrt",
            lastFlight
                ? formatDatum(
                    lastFlight.startzeit ||
                    lastFlight.datum
                )
                : "-"
        ]
    ];

    const target =
        element("summaryList");

    if (target) {
        target.innerHTML = rows.map(
            function (row) {
                return `
                    <div class="summary-row">
                        <span>
                            ${htmlSicher(row[0])}
                        </span>

                        <strong>
                            ${htmlSicher(row[1])}
                        </strong>
                    </div>
                `;
            }
        ).join("");
    }
}

function rekordeAktualisieren() {
    function maxValue(key) {
        return Math.max(
            0,
            ...fluege.map(
                function (flight) {
                    return (
                        Number(flight[key]) ||
                        0
                    );
                }
            )
        );
    }

    const records = [
        [
            "Schnellste Fahrt",
            `${formatZahl(
                maxValue("maxSpeed"),
                1
            )} km/h`
        ],

        [
            "Höchste Höhe",
            `${formatZahl(
                maxValue("maxHoehe")
            )} m`
        ],

        [
            "Längste Strecke",
            `${formatZahl(
                maxValue("strecke"),
                1
            )} km`
        ],

        [
            "Längste Dauer",
            formatFlugzeit(
                maxValue("flugzeit")
            )
        ]
    ];

    const target = element("records");

    if (!target) {
        return;
    }

    target.innerHTML = records.map(
        function (record) {
            return `
                <div class="record">
                    <span>
                        ${htmlSicher(record[0])}
                    </span>

                    <strong>
                        ${htmlSicher(record[1])}
                    </strong>

                    <small>
                        Persönlicher Rekord
                    </small>
                </div>
            `;
        }
    ).join("");
}

function flugbuchAktualisieren() {
    const list = element("flugliste");

    if (!list) {
        return;
    }

    if (fluege.length === 0) {
        list.innerHTML = `
            <p class="empty-message">
                Noch keine Fahrten gespeichert.
            </p>
        `;

        return;
    }

    list.innerHTML = fluege
        .map(function (flight, index) {
            return {
                flight,
                index
            };
        })
        .sort(function (itemA, itemB) {
            return (
                new Date(
                    itemB.flight.startzeit ||
                    itemB.flight.datum ||
                    0
                ).getTime() -
                new Date(
                    itemA.flight.startzeit ||
                    itemA.flight.datum ||
                    0
                ).getTime()
            );
        })
        .map(function (item) {
            const flight = item.flight;
            const index = item.index;

            const hasTrack =
                Array.isArray(flight.track) &&
                flight.track.some(
                    mapPointValid
                );

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
                                flight.ballon || "-"
                            )}
                        </strong>
                    </div>

                    <div class="flight-data">
                        <div>
                            <small>Pilot</small>
                            ${htmlSicher(
                                flight.pilot || "-"
                            )}
                        </div>

                        <div>
                            <small>Route</small>
                            ${htmlSicher(
                                flight.startOrt || "-"
                            )}
                            →
                            ${htmlSicher(
                                flight.landeOrt || "-"
                            )}
                        </div>

                        <div>
                            <small>Dauer</small>
                            ${htmlSicher(
                                formatFlugzeit(
                                    flight.flugzeit
                                )
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
                            <small>
                                Maximale Höhe
                            </small>

                            ${formatZahl(
                                flight.maxHoehe
                            )} m
                        </div>

                        <div>
                            <small>
                                Maximales Tempo
                            </small>

                            ${formatZahl(
                                flight.maxSpeed,
                                1
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
                            ${hasTrack ? "" : "disabled"}
                        >
                            ${
                                hasTrack
                                    ? "Auf Karte"
                                    : "Kein GPS-Track"
                            }
                        </button>

                        <button
                            class="primary-button delete-button"
                            data-flight-delete="${index}"
                            type="button"
                        >
                            Löschen
                        </button>
                    </div>
                </article>
            `;
        })
        .join("");
}

function flugLoeschen(index) {
    if (!fluege[index]) {
        return;
    }

    if (
        !window.confirm(
            "Soll diese Fahrt wirklich gelöscht werden?"
        )
    ) {
        return;
    }

    const removed =
        fluege.splice(index, 1)[0];

    if (!fluegeSpeichern()) {
        fluege.splice(
            index,
            0,
            removed
        );

        return;
    }

    anzeigeAktualisieren();
}

function sichereGanzzahl(
    value,
    fallback,
    minimum = 0,
    maximum = Number.MAX_SAFE_INTEGER
) {
    const parsed =
        Number.parseInt(value, 10);

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.min(
        maximum,
        Math.max(minimum, parsed)
    );
}

function monitorLaden() {
    const saved = ladeJson(
        MONITOR_STORAGE_KEY,
        {}
    );

    return {
        zeitraumMonate:
            sichereGanzzahl(
                saved.zeitraumMonate,
                MONITOR_DEFAULTS.zeitraumMonate,
                1,
                120
            ),

        erforderlicheStunden:
            sichereDezimalzahl(
                saved.erforderlicheStunden,
                MONITOR_DEFAULTS.erforderlicheStunden,
                0,
                10000
            ),

        erforderlicheLandungen:
            sichereGanzzahl(
                saved.erforderlicheLandungen,
                MONITOR_DEFAULTS.erforderlicheLandungen,
                0,
                10000
            )
    };
}}

function monitorAktualisieren() {
    const target =
        element(
            "aktivitaetsmonitorInhalt"
        );

    if (!target) {
        return;
    }

    const settings = monitorLaden();

    const cutoff = new Date();
    const now = new Date();

    cutoff.setHours(
        0,
        0,
        0,
        0
    );

    cutoff.setMonth(
        cutoff.getMonth() -
        settings.zeitraumMonate
    );

    const relevantFlights =
        fluege.filter(
            function (flight) {
                const date = new Date(
                    flight.startzeit ||
                    flight.datum
                );

                return (
                    !Number.isNaN(
                        date.getTime()
                    ) &&
                    date >= cutoff &&
                    date <= now
                );
            }
        );

    /*
     * Die Flugzeit wird in den Fahrtdaten
     * als Minuten gespeichert.
     */
    const flightMinutes =
        relevantFlights.reduce(
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

    /*
     * Umrechnung der Flugzeit von Minuten
     * in Dezimalstunden.
     */
    const flightHours =
        flightMinutes / 60;

    const landings =
        relevantFlights.reduce(
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

    function progressHtml(
        label,
        value,
        targetValue,
        displayValue = value,
        displayTarget = targetValue
    ) {
        const numericValue =
            Number(value) || 0;

        const numericTarget =
            Number(targetValue) || 0;

        const percentage =
            numericTarget <= 0
                ? 100
                : Math.min(
                    100,
                    Math.max(
                        0,
                        Math.round(
                            numericValue /
                            numericTarget *
                            100
                        )
                    )
                );

        return `
            <div class="monitor-progress">
                <div class="monitor-progress-header">
                    <strong>
                        ${htmlSicher(label)}
                    </strong>

                    <span>
                        ${htmlSicher(displayValue)}
                        /
                        ${htmlSicher(displayTarget)}
                    </span>
                </div>

                <div
                    class="monitor-progress-bar"
                    role="progressbar"
                    aria-label="${htmlSicher(label)}"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow="${percentage}"
                >
                    <span
                        class="monitor-progress-value"
                        style="width: ${percentage}%"
                    ></span>
                </div>
            </div>
        `;
    }

    const formattedFlightHours =
        formatZahl(
            flightHours,
            1
        );

    const formattedRequiredHours =
        formatZahl(
            settings.erforderlicheStunden,
            1
        );

    const fulfilled =
        flightHours >=
            settings.erforderlicheStunden &&
        landings >=
            settings.erforderlicheLandungen;

    target.innerHTML =
        progressHtml(
            "Flugstunden",
            flightHours,
            settings.erforderlicheStunden,
            `${formattedFlightHours} h`,
            `${formattedRequiredHours} h`
        ) +
        progressHtml(
            "Landungen",
            landings,
            settings.erforderlicheLandungen
        ) +
        `
            <div class="monitor-state ${
                fulfilled
                    ? "monitor-state-good"
                    : "monitor-state-open"
            }">
                ${
                    fulfilled
                        ? "✓ EINGESTELLTE ANFORDERUNGEN ERFÜLLT"
                        : "! ANFORDERUNGEN NOCH OFFEN"
                }
            </div>
        `;

    textSetzen(
        "monitorPeriodLabel",
        `${settings.zeitraumMonate} MONATE`
    );

    if (relevantFlights.length > 0) {
        textSetzen(
            "nextExit",
            `${formattedFlightHours} Flugstunden, ` +
            `${landings} Landung(en) und ` +
            `${relevantFlights.length} Fahrt(en) ` +
            "im eingestellten Zeitraum."
        );
    } else {
        textSetzen(
            "nextExit",
            "Keine relevante Fahrt im Zeitraum."
        );
    }
}

function monitorFormularFuellen() {
    const settings = monitorLaden();

    if (element("monitorZeitraum")) {
        element(
            "monitorZeitraum"
        ).value =
            settings.zeitraumMonate;
    }

    if (element("monitorSollStunden")) {
        element(
            "monitorSollStunden"
        ).value =
            settings.erforderlicheStunden;
    }

    if (element("monitorSollLandungen")) {
        element(
            "monitorSollLandungen"
        ).value =
            settings.erforderlicheLandungen;
    }
}

function monitorSpeichern() {
    const settings = {
        zeitraumMonate:
            sichereGanzzahl(
                element(
                    "monitorZeitraum"
                )?.value,
                MONITOR_DEFAULTS
                    .zeitraumMonate,
                1,
                120
            ),

        erforderlicheStunden:
            sichereDezimalzahl(
                element(
                    "monitorSollStunden"
                )?.value,
                MONITOR_DEFAULTS
                    .erforderlicheStunden,
                0,
                10000
            ),

        erforderlicheLandungen:
            sichereGanzzahl(
                element(
                    "monitorSollLandungen"
                )?.value,
                MONITOR_DEFAULTS
                    .erforderlicheLandungen,
                0,
                10000
            )
    };

    try {
        localStorage.setItem(
            MONITOR_STORAGE_KEY,
            JSON.stringify(settings)
        );

        monitorFormularFuellen();
        monitorAktualisieren();

        textSetzen(
            "monitorMeldung",
            "✓ Anforderungen wurden gespeichert."
        );
    } catch (error) {
        console.error(error);

        textSetzen(
            "monitorMeldung",
            "❌ Anforderungen konnten nicht gespeichert werden."
        );
    }
}

function monitorZuruecksetzen() {
    try {
        localStorage.removeItem(
            MONITOR_STORAGE_KEY
        );

        monitorFormularFuellen();
        monitorAktualisieren();

        textSetzen(
            "monitorMeldung",
            "✓ Einstellungen wurden zurückgesetzt."
        );
    } catch (error) {
        console.error(error);

        textSetzen(
            "monitorMeldung",
            "❌ Einstellungen konnten nicht zurückgesetzt werden."
        );
    }
}

function monitorAktualisieren() {
    const target =
        element("aktivitaetsmonitorInhalt");

    if (!target) {
        return;
    }

    const settings = monitorLaden();
    const cutoff = new Date();
    const now = new Date();

    cutoff.setHours(0, 0, 0, 0);

    cutoff.setMonth(
        cutoff.getMonth() -
        settings.zeitraumMonate
    );

    const relevantFlights =
        fluege.filter(
            function (flight) {
                const date = new Date(
                    flight.startzeit ||
                    flight.datum
                );

                return (
                    !Number.isNaN(date.getTime()) &&
                    date >= cutoff &&
                    date <= now
                );
            }
        );

    const flightMinutes =
        relevantFlights.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (Number(flight.flugzeit) || 0)
                );
            },
            0
        );

    const flightHours =
        flightMinutes / 60;

    const landings =
        relevantFlights.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (Number(flight.landungen) || 0)
                );
            },
            0
        );

    function progressHtml(
        label,
        value,
        targetValue,
        displayValue,
        displayTarget
    ) {
        const numericValue =
            Number(value) || 0;

        const numericTarget =
            Number(targetValue) || 0;

        const percentage =
            numericTarget <= 0
                ? 100
                : Math.min(
                    100,
                    Math.max(
                        0,
                        Math.round(
                            numericValue /
                            numericTarget *
                            100
                        )
                    )
                );

        return `
            <div class="monitor-progress">
                <div class="monitor-progress-header">
                    <strong>
                        ${htmlSicher(label)}
                    </strong>

                    <span>
                        ${htmlSicher(displayValue)}
                        /
                        ${htmlSicher(displayTarget)}
                    </span>
                </div>

                <div
                    class="monitor-progress-bar"
                    role="progressbar"
                    aria-label="${htmlSicher(label)}"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow="${percentage}"
                >
                    <span
                        class="monitor-progress-value"
                        style="width: ${percentage}%"
                    ></span>
                </div>
            </div>
        `;
    }

    const formattedFlightHours =
        `${formatZahl(flightHours, 1)} h`;

    const formattedRequiredHours =
        `${formatZahl(
            settings.erforderlicheStunden,
            1
        )} h`;

    const fulfilled =
        flightHours >=
            settings.erforderlicheStunden &&
        landings >=
            settings.erforderlicheLandungen;

    target.innerHTML =
        progressHtml(
            "Flugstunden",
            flightHours,
            settings.erforderlicheStunden,
            formattedFlightHours,
            formattedRequiredHours
        ) +
        progressHtml(
            "Landungen",
            landings,
            settings.erforderlicheLandungen,
            String(landings),
            String(
                settings.erforderlicheLandungen
            )
        ) +
        `
            <div class="monitor-state ${
                fulfilled
                    ? "monitor-state-good"
                    : "monitor-state-open"
            }">
                ${
                    fulfilled
                        ? "✓ EINGESTELLTE ANFORDERUNGEN ERFÜLLT"
                        : "! ANFORDERUNGEN NOCH OFFEN"
                }
            </div>
        `;

    textSetzen(
        "monitorPeriodLabel",
        `${settings.zeitraumMonate} MONATE`
    );

    textSetzen(
        "nextExit",
        relevantFlights.length
            ? (
                `${formattedFlightHours} Flugzeit, ` +
                `${landings} Landung(en) und ` +
                `${relevantFlights.length} Fahrt(en) ` +
                "im Zeitraum."
            )
            : "Keine relevante Fahrt im Zeitraum."
    );
}

function monitorFormularFuellen() {
    const settings = monitorLaden();

    if (element("monitorZeitraum")) {
        element("monitorZeitraum").value =
            settings.zeitraumMonate;
    }

if (element("monitorSollStunden")) {
    element(
        "monitorSollStunden"
    ).value =
        settings.erforderlicheStunden;
}

    if (element("monitorSollLandungen")) {
        element(
            "monitorSollLandungen"
        ).value =
            settings.erforderlicheLandungen;
    }
}

function monitorSpeichern() {
    const settings = {
        zeitraumMonate:
            sichereGanzzahl(
                element(
                    "monitorZeitraum"
                )?.value,
                24,
                1,
                120
            ),

       erforderlicheStunden:
    sichereDezimalzahl(
        element(
            "monitorSollStunden"
        )?.value,
        6,
        0,
        10000
    ),

        erforderlicheLandungen:
            sichereGanzzahl(
                element(
                    "monitorSollLandungen"
                )?.value,
                10
            )
    };

    localStorage.setItem(
        MONITOR_STORAGE_KEY,
        JSON.stringify(settings)
    );

    monitorFormularFuellen();
    monitorAktualisieren();

    textSetzen(
        "monitorMeldung",
        "✓ Anforderungen wurden gespeichert."
    );
}

function monitorZuruecksetzen() {
    localStorage.removeItem(
        MONITOR_STORAGE_KEY
    );

    monitorFormularFuellen();
    monitorAktualisieren();

    textSetzen(
        "monitorMeldung",
        "✓ Einstellungen wurden zurückgesetzt."
    );
}
function windrichtungText(degrees) {
    const value = Number(degrees);

    if (!Number.isFinite(value)) {
        return "-";
    }

    const directions = [
        "N",
        "NO",
        "O",
        "SO",
        "S",
        "SW",
        "W",
        "NW"
    ];

    const normalized =
        ((value % 360) + 360) % 360;

    return directions[
        Math.round(normalized / 45) % 8
    ];
}

function isoUhrzeit(value) {
    if (!value) {
        return "--";
    }

    const match = String(value).match(
        /T(\d{2}:\d{2})/
    );

    return match
        ? match[1]
        : "--";
}

async function wetterAnzeigen(
    latitude,
    longitude
) {
    const rating =
        element("weatherRating");

    try {
        const parameters =
            new URLSearchParams({
                latitude:
                    String(latitude),

                longitude:
                    String(longitude),

                current:
                    "temperature_2m," +
                    "wind_speed_10m," +
                    "wind_direction_10m," +
                    "relative_humidity_2m," +
                    "surface_pressure",

                daily:
                    "sunrise,sunset",

                wind_speed_unit:
                    "kmh",

                timezone:
                    "auto",

                forecast_days:
                    "1"
            });

        const response = await fetch(
            "https://api.open-meteo.com/v1/forecast?" +
            parameters.toString()
        );

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}`
            );
        }

        const data = await response.json();
        const current = data.current || {};
        const daily = data.daily || {};

        const temperature =
            Number(
                current.temperature_2m
            );

        const wind =
            Number(
                current.wind_speed_10m
            );

        const direction =
            Number(
                current.wind_direction_10m
            );

        const humidity =
            Number(
                current.relative_humidity_2m
            );

        const pressure =
            Number(
                current.surface_pressure
            );

        textSetzen(
            "temperature",
            Number.isFinite(temperature)
                ? (
                    "🌡 Temperatur: " +
                    `${formatZahl(
                        temperature,
                        1
                    )} °C`
                )
                : "🌡 Temperatur: --"
        );

        textSetzen(
            "wind",
            Number.isFinite(wind)
                ? (
                    "💨 Wind: " +
                    `${formatZahl(
                        wind,
                        1
                    )} km/h`
                )
                : "💨 Wind: --"
        );

        textSetzen(
            "windDirection",
            Number.isFinite(direction)
                ? (
                    "🧭 Windrichtung: " +
                    `${Math.round(
                        direction
                    )}° ` +
                    `(${windrichtungText(
                        direction
                    )})`
                )
                : "🧭 Windrichtung: --"
        );

        textSetzen(
            "sunrise",
            "🌅 Sonnenaufgang: " +
            isoUhrzeit(
                daily.sunrise?.[0]
            )
        );

        textSetzen(
            "sunset",
            "🌇 Sonnenuntergang: " +
            isoUhrzeit(
                daily.sunset?.[0]
            )
        );

        let assessment =
            "🟢 Geringe Bodenwindgeschwindigkeit.";

        let className =
            "weather-good";

        if (!Number.isFinite(wind)) {
            assessment =
                "Wetterbewertung nicht verfügbar.";

            className =
                "weather-caution";
        } else if (wind > 20) {
            assessment =
                "🔴 Hohe Bodenwindgeschwindigkeit.";

            className =
                "weather-danger";
        } else if (wind > 10) {
            assessment =
                "🟡 Erhöhte Bodenwindgeschwindigkeit.";

            className =
                "weather-caution";
        }

        if (rating) {
            rating.textContent =
                `${assessment} ` +
                `Luftfeuchtigkeit ${
                    Number.isFinite(humidity)
                        ? (
                            `${Math.round(
                                humidity
                            )} %`
                        )
                        : "--"
                }. ` +
                `Luftdruck ${
                    Number.isFinite(pressure)
                        ? (
                            `${Math.round(
                                pressure
                            )} hPa`
                        )
                        : "--"
                }. Keine flugbetriebliche Freigabe.`;

            rating.className =
                `weather-rating ${className}`;
        }
    } catch (error) {
        console.error(error);

        if (rating) {
            rating.textContent =
                "❌ Wetterdaten konnten nicht geladen werden.";

            rating.className =
                "weather-rating weather-danger";
        }
    }
}

function ladeWetter() {
    const rating =
        element("weatherRating");

    if (!rating) {
        return;
    }

    rating.textContent =
        "Wetterdaten werden geladen ...";

    rating.className =
        "weather-rating";

    if (letzterStandort) {
        wetterAnzeigen(
            letzterStandort.coords.latitude,
            letzterStandort.coords.longitude
        );

        return;
    }

    if (!navigator.geolocation) {
        rating.textContent =
            "GPS wird nicht unterstützt.";

        rating.className =
            "weather-rating weather-danger";

        return;
    }

    navigator.geolocation.getCurrentPosition(
        function (position) {
            standortErfolgreich(position);

            wetterAnzeigen(
                position.coords.latitude,
                position.coords.longitude
            );
        },

        function () {
            rating.textContent =
                "Standortfreigabe ist für Wetterdaten erforderlich.";

            rating.className =
                "weather-rating weather-caution";
        },

        {
            maximumAge: 300000,
            timeout: 15000
        }
    );
}

function backupExportieren() {
    const backup = {
        version: 10,

        exportedAt:
            new Date().toISOString(),

        fluege
    };

    const blob = new Blob(
        [
            JSON.stringify(
                backup,
                null,
                2
            )
        ],
        {
            type: "application/json"
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

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(
        function () {
            URL.revokeObjectURL(url);
        },
        1000
    );
}

function importDialogOeffnen() {
    vorbereiteteImportFluege = [];

    if (element("importInput")) {
        element("importInput").value = "";
    }

    textSetzen(
        "importFileInformation",
        "Noch keine Datei ausgewählt."
    );

    if (element("importPreview")) {
        element("importPreview").hidden =
            true;

        element("importPreview").innerHTML =
            "";
    }

    const message =
        element("importMessage");

    if (message) {
        message.textContent = "";
        message.className =
            "import-message";
    }

    if (element("executeImportButton")) {
        element(
            "executeImportButton"
        ).disabled = true;
    }

    if (element("importDialog")) {
        element("importDialog").hidden =
            false;
    }
}

function importDialogSchliessen() {
    if (element("importDialog")) {
        element("importDialog").hidden =
            true;
    }

    vorbereiteteImportFluege = [];
}

function importZahl(
    value,
    fallback = 0
) {
    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {
        return fallback;
    }

    let normalized =
        String(value)
            .trim()
            .replace(/\s/g, "");

    if (
        normalized.includes(",") &&
        normalized.includes(".")
    ) {
        normalized = normalized
            .replace(/\./g, "")
            .replace(",", ".");
    } else {
        normalized =
            normalized.replace(",", ".");
    }

    const number = Number(normalized);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function importDatum(value) {
    if (!value) {
        return null;
    }

    const text =
        String(value).trim();

    const match = text.match(
        /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/
    );

    if (match) {
        const date = new Date(
            Number(match[3]),
            Number(match[2]) - 1,
            Number(match[1]),
            Number(match[4] || 0),
            Number(match[5] || 0)
        );

        return Number.isNaN(
            date.getTime()
        )
            ? null
            : date.toISOString();
    }

    const date = new Date(text);

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
        } else if (
            character === separator &&
            !quoted
        ) {
            values.push(
                currentValue.trim()
            );

            currentValue = "";
        } else {
            currentValue += character;
        }
    }

    values.push(
        currentValue.trim()
    );

    return values;
}

function csvEinlesen(text) {
    const lines = String(text)
        .replace(/^\uFEFF/, "")
        .trim()
        .split(/\r?\n/)
        .filter(function (line) {
            return line.trim();
        });

    if (lines.length < 2) {
        throw new Error(
            "Die CSV-Datei enthält keine Fahrten."
        );
    }

    const firstLine = lines[0];

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

            return Object.fromEntries(
                headers.map(
                    function (
                        header,
                        index
                    ) {
                        return [
                            header,
                            values[index] ||
                            ""
                        ];
                    }
                )
            );
        }
    );
}

function importFlugNormalisieren(
    rawFlight,
    index
) {
    if (
        !rawFlight ||
        typeof rawFlight !== "object"
    ) {
        return null;
    }

    function getValue(...keys) {
        for (const key of keys) {
            if (
                rawFlight[key] !== undefined &&
                rawFlight[key] !== null &&
                rawFlight[key] !== ""
            ) {
                return rawFlight[key];
            }
        }

        return "";
    }

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

    let track = getValue(
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
        track.map(function (point) {
            const normalizedPoint = {
                lat: importZahl(
                    point?.lat ??
                    point?.latitude,
                    null
                ),

                lng: importZahl(
                    point?.lng ??
                    point?.lon ??
                    point?.longitude,
                    null
                ),

                hoehe: importZahl(
                    point?.hoehe ??
                    point?.altitude,
                    null
                ),

                speed: importZahl(
                    point?.speed,
                    null
                ),

                genauigkeit: importZahl(
                    point?.genauigkeit ??
                    point?.accuracy,
                    null
                ),

                zeit:
                    importDatum(
                        point?.zeit ??
                        point?.timestamp
                    ) ||
                    startTime
            };

            return mapPointValid(
                normalizedPoint
            )
                ? normalizedPoint
                : null;
        }).filter(Boolean);

    return {
        id:
            textBereinigen(
                getValue("id")
            ) ||
            `import-${Date.now()}-${index}`,

        datum: startTime,
        startzeit: startTime,

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
            ) ||
            "Unbekannt",

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
            ) ||
            "Unbekannt",

        landeOrt:
            textBereinigen(
                getValue(
                    "landeOrt",
                    "landeort",
                    "landung"
                )
            ) ||
            "Unbekannt",

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
            Math.max(
                0,
                importZahl(
                    getValue(
                        "avgSpeed",
                        "avgspeed"
                    )
                )
            ),

        maxSpeed:
            Math.max(
                0,
                importZahl(
                    getValue(
                        "maxSpeed",
                        "maxspeed"
                    )
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
                Math.round(
                    importZahl(
                        getValue(
                            "landungen"
                        ),
                        1
                    )
                )
            ),

        bemerkung:
            textBereinigen(
                getValue(
                    "bemerkung",
                    "notiz"
                )
            ),

        track: normalizedTrack
    };
}

async function importDateiAuswaehlen(event) {
    const file =
        event.target.files?.[0];

    vorbereiteteImportFluege = [];

    if (!file) {
        return;
    }

    try {
        const text = await file.text();
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

            rawFlights =
                Array.isArray(json)
                    ? json
                    : (
                        json.fluege ||
                        json.fahrten
                    );

            if (!Array.isArray(rawFlights)) {
                throw new Error(
                    "Die JSON-Datei enthält keine Flugliste."
                );
            }
        }

        vorbereiteteImportFluege =
            rawFlights
                .map(importFlugNormalisieren)
                .filter(Boolean);

        if (
            vorbereiteteImportFluege
                .length === 0
        ) {
            throw new Error(
                "Keine gültigen Fahrten gefunden."
            );
        }

        const landingCount =
            vorbereiteteImportFluege.reduce(
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

        textSetzen(
            "importFileInformation",
            `${file.name} · ` +
            `${vorbereiteteImportFluege.length} Fahrt(en)`
        );

        const preview =
            element("importPreview");

        if (preview) {
            preview.innerHTML = `
                <strong>
                    ✓ Datei erfolgreich geprüft
                </strong>

                <p>
                    ${vorbereiteteImportFluege.length}
                    Fahrt(en) und
                    ${landingCount}
                    Landung(en) gefunden.
                </p>
            `;

            preview.hidden = false;
        }

        if (element("executeImportButton")) {
            element(
                "executeImportButton"
            ).disabled = false;
        }

        const message =
            element("importMessage");

        if (message) {
            message.textContent =
                "Die Datei kann importiert werden.";

            message.className =
                "import-message " +
                "import-message-success";
        }
    } catch (error) {
        console.error(error);

        const message =
            element("importMessage");

        if (message) {
            message.textContent =
                `❌ ${
                    error.message ||
                    "Importdatei ist ungültig."
                }`;

            message.className =
                "import-message " +
                "import-message-error";
        }
    }
}

function duplikatSchluessel(flight) {
    return [
        textBereinigen(
            flight.startzeit
        ).toLowerCase(),

        textBereinigen(
            flight.ballon
        ).toUpperCase(),

        textBereinigen(
            flight.pilot
        ).toLowerCase()
    ].join("|");
}

function importAusfuehren() {
    if (
        vorbereiteteImportFluege
            .length === 0
    ) {
        return;
    }

    const mode =
        document.querySelector(
            "input[name='importMode']:checked"
        )?.value ||
        "append";

    const previousFlights =
        [...fluege];

    if (mode === "replace") {
        if (
            !window.confirm(
                "Alle vorhandenen Fahrten werden ersetzt. Fortfahren?"
            )
        ) {
            return;
        }

        fluege =
            [...vorbereiteteImportFluege];
    } else {
        const existingKeys =
            new Set(
                fluege.map(
                    duplikatSchluessel
                )
            );

        vorbereiteteImportFluege.forEach(
            function (flight) {
                const key =
                    duplikatSchluessel(
                        flight
                    );

                if (!existingKeys.has(key)) {
                    fluege.push(flight);
                    existingKeys.add(key);
                }
            }
        );
    }

    if (!fluegeSpeichern()) {
        fluege = previousFlights;
        window.fluege = fluege;
        return;
    }

    importDialogSchliessen();
    anzeigeAktualisieren();
    seiteAnzeigen("flugbuch");
}

function kopfbereichAktualisieren() {
    const pilot =
        textBereinigen(
            element("pilot")?.value
        );

    const ballon =
        textBereinigen(
            element("ballon")?.value
        );

    const ballontyp =
        textBereinigen(
            element("ballontyp")?.value
        );

    textSetzen(
        "pilotHeader",
        pilot || "Pilot"
    );

    textSetzen(
        "trackingPilotDisplay",
        pilot || "Nicht festgelegt"
    );

    textSetzen(
        "trackingBallonDisplay",
        ballon || "Nicht festgelegt"
    );

    textSetzen(
        "trackingTypeDisplay",
        ballontyp || "Nicht festgelegt"
    );

    const maintenance =
        element(
            "maintenanceInput"
        )?.value;

    textSetzen(
        "maintenanceDate",
        maintenance
            ? new Date(
                `${maintenance}T12:00:00`
            ).toLocaleDateString(
                "de-AT"
            )
            : "Nicht festgelegt"
    );
}

function aktuelleZeitAktualisieren() {
    const now = new Date();

    textSetzen(
        "currentDate",
        now.toLocaleDateString(
            "de-AT"
        )
    );

    textSetzen(
        "currentTime",
        now.toLocaleTimeString(
            "de-AT",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        )
    );
}

function anzeigeAktualisieren() {
    zusammenfassungAktualisieren();
    rekordeAktualisieren();
    flugbuchAktualisieren();
    zeichneMonatsstatistik();
    monitorAktualisieren();

    if (hauptkarte) {
        alleFluegeAufKarte();
    }
}

function eventHinzufuegen(
    id,
    eventName,
    handler
) {
    element(id)?.addEventListener(
        eventName,
        handler
    );
}

function appInitialisieren() {
    const masterData =
        stammdatenLaden();

    [
        "pilot",
        "ballon",
        "ballontyp"
    ].forEach(function (id) {
        if (element(id)) {
            element(id).value =
                masterData[id] || "";
        }
    });

    if (element("maintenanceInput")) {
        element(
            "maintenanceInput"
        ).value =
            masterData.maintenance || "";
    }

    monitorFormularFuellen();
    kopfbereichAktualisieren();
    aktuelleZeitAktualisieren();

    document
        .querySelectorAll("[data-page-link]")
        .forEach(function (link) {
            link.addEventListener(
                "click",
                function (event) {
                    event.preventDefault();

                    seiteAnzeigen(
                        link.dataset.pageLink
                    );
                }
            );
        });

    eventHinzufuegen(
        "menuButton",
        "click",
        function () {
            const sidebar =
                element("sidebar");

            sidebar?.classList.toggle(
                "sidebar-open"
            );

            element("menuButton")
                ?.setAttribute(
                    "aria-expanded",
                    sidebar?.classList.contains(
                        "sidebar-open"
                    )
                        ? "true"
                        : "false"
                );
        }
    );

    eventHinzufuegen(
        "startButton",
        "click",
        flugStarten
    );

    eventHinzufuegen(
        "stopButton",
        "click",
        flugBeenden
    );

    eventHinzufuegen(
        "saveButton",
        "click",
        flugSpeichern
    );

    [
        "pilot",
        "ballon",
        "ballontyp",
        "maintenanceInput"
    ].forEach(function (id) {
        eventHinzufuegen(
            id,
            "change",
            stammdatenSpeichern
        );
    });

    eventHinzufuegen(
        "monitorSpeichern",
        "click",
        monitorSpeichern
    );

    eventHinzufuegen(
        "monitorZuruecksetzen",
        "click",
        monitorZuruecksetzen
    );

    eventHinzufuegen(
        "weatherReload",
        "click",
        ladeWetter
    );

    eventHinzufuegen(
        "showCurrentLocationButton",
        "click",
        function () {
            hauptkarteInitialisieren();
            standortZentrieren(
                hauptkarte
            );
        }
    );

    eventHinzufuegen(
        "showAllFlightsButton",
        "click",
        alleFluegeAufKarte
    );

    eventHinzufuegen(
        "exportButton",
        "click",
        backupExportieren
    );

    eventHinzufuegen(
        "openImportButton",
        "click",
        importDialogOeffnen
    );

    eventHinzufuegen(
        "closeImportButton",
        "click",
        importDialogSchliessen
    );

    eventHinzufuegen(
        "cancelImportButton",
        "click",
        importDialogSchliessen
    );

    eventHinzufuegen(
        "importInput",
        "change",
        importDateiAuswaehlen
    );

    eventHinzufuegen(
        "executeImportButton",
        "click",
        importAusfuehren
    );

    eventHinzufuegen(
        "importDialog",
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

    eventHinzufuegen(
        "flugliste",
        "click",
        function (event) {
            const button =
                event.target.closest(
                    "button"
                );

            if (!button) {
                return;
            }

            if (
                button.dataset
                    .flightDelete !==
                undefined
            ) {
                flugLoeschen(
                    Number(
                        button.dataset
                            .flightDelete
                    )
                );

                return;
            }

            if (
                button.dataset
                    .flightMap !==
                undefined
            ) {
                const flight =
                    fluege[
                        Number(
                            button.dataset
                                .flightMap
                        )
                    ];

                if (!flight) {
                    return;
                }

                seiteAnzeigen("karte");

                window.setTimeout(
                    function () {
                        flugAufKarte(
                            flight
                        );
                    },
                    200
                );
            }
        }
    );

    document.addEventListener(
        "keydown",
        function (event) {
            if (
                event.key === "Escape" &&
                !element(
                    "importDialog"
                )?.hidden
            ) {
                importDialogSchliessen();
            }
        }
    );

    buttonStatusSetzen(
        false,
        true,
        true
    );

    zeichneHoehenprofil([]);
    anzeigeAktualisieren();
    standortUeberwachungStarten();

    window.setInterval(
        aktuelleZeitAktualisieren,
        1000
    );

    const requestedPage =
        window.location.hash.slice(1);

    seiteAnzeigen(
        PAGE_IDS.includes(
            requestedPage
        )
            ? requestedPage
            : "dashboard"
    );
}

if (
    document.readyState === "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        appInitialisieren,
        {
            once: true
        }
    );
} else {
    appInitialisieren();
}

window.addEventListener(
    "hashchange",
    function () {
        const requestedPage =
            window.location.hash.slice(1);

        if (
            PAGE_IDS.includes(
                requestedPage
            )
        ) {
            seiteAnzeigen(
                requestedPage
            );
        }
    }
);

window.addEventListener(
    "resize",
    function () {
        hauptkarte?.invalidateSize();
        trackingKarte?.invalidateSize();
    }
);

window.addEventListener(
    "beforeunload",
    function () {
        if (
            locationWatchId !== null &&
            navigator.geolocation
        ) {
            navigator.geolocation.clearWatch(
                locationWatchId
            );
        }

        if (
            flightWatchId !== null &&
            navigator.geolocation
        ) {
            navigator.geolocation.clearWatch(
                flightWatchId
            );
        }
    }
);
// Bildschirm aktiv halten
let wakeLock = null;

async function aktivBleiben() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    console.log('Wake Lock aktiv');
  } catch (err) {
    console.error('Wake Lock Fehler:', err);
  }
}

window.addEventListener('load', aktivBleiben);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    aktivBleiben();
  }
});
``
