"use strict";

/* =========================================================
   BALLONFLUGBUCH PROFESSIONAL V10
   Teil 1 von 2
   Teil 2 direkt unter diesem Teil einfügen.
   ========================================================= */

const FLIGHT_STORAGE_KEY = "fluege";
const MASTER_DATA_KEY = "stammdaten";
const MONITOR_STORAGE_KEY = "monitorEinstellungen";

const DEFAULT_CENTER = [47.28, 15.97];
const DEFAULT_ZOOM = 8;

const MONITOR_DEFAULTS = Object.freeze({
    zeitraumMonate: 24,
    erforderlicheFahrten: 30,
    erforderlicheLandungen: 40
});

window.fluege = ladeFluege();

let aktuellerFlug = null;
let trackpunkte = [];

let flightWatchId = null;
let locationWatchId = null;
let flugWirdBeendet = false;

let letzterStandort = null;
let standortUeberwachungAktiv = false;

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
let appWurdeInitialisiert = false;

/* =========================================================
   ALLGEMEINE HILFSFUNKTIONEN
   ========================================================= */

function element(id) {
    return document.getElementById(id);
}

function textBereinigen(value) {
    return String(value ?? "").trim();
}

function htmlSicher(value) {
    const container = document.createElement("div");
    container.textContent = String(value ?? "");
    return container.innerHTML;
}

function textSetzen(id, value) {
    const target = element(id);

    if (target) {
        target.textContent = String(value ?? "");
    }
}

function formatZahl(value, decimalPlaces = 0) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return Number(0).toLocaleString("de-AT", {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces
        });
    }

    return number.toLocaleString("de-AT", {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces
    });
}

function formatFlugzeit(minutes) {
    const total = Math.max(
        0,
        Math.round(Number(minutes) || 0)
    );

    const hours = Math.floor(total / 60);
    const remainingMinutes = total % 60;

    return `${hours}h ${String(remainingMinutes).padStart(2, "0")}m`;
}

function formatDatum(value) {
    if (!value) {
        return "-";
    }

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

function mapPointValid(point) {
    if (!point) {
        return false;
    }

    const latitude = Number(point.lat);
    const longitude = Number(point.lng);

    return (
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        latitude >= -90 &&
        latitude <= 90 &&
        longitude >= -180 &&
        longitude <= 180
    );
}

function sichereId() {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }

    return (
        `flug-${Date.now()}-` +
        Math.random().toString(16).slice(2)
    );
}

function entfernung(pointA, pointB) {
    if (
        !mapPointValid(pointA) ||
        !mapPointValid(pointB)
    ) {
        return 0;
    }

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
                Math.min(1, Math.max(0, value))
            )
        )
    );
}

function eventListenerHinzufuegen(
    id,
    eventName,
    handler
) {
    const target = element(id);

    if (target) {
        target.addEventListener(
            eventName,
            handler
        );
    }
}

/* =========================================================
   LOKALE SPEICHERUNG
   ========================================================= */

function ladeFluege() {
    try {
        const saved =
            localStorage.getItem(FLIGHT_STORAGE_KEY);

        if (!saved) {
            return [];
        }

        const data = JSON.parse(saved);

        return Array.isArray(data)
            ? data
            : [];
    } catch (error) {
        console.error(
            "Fahrten konnten nicht geladen werden:",
            error
        );

        return [];
    }
}

function fluegeSpeichern() {
    try {
        localStorage.setItem(
            FLIGHT_STORAGE_KEY,
            JSON.stringify(window.fluege)
        );

        return true;
    } catch (error) {
        console.error(
            "Fahrten konnten nicht gespeichert werden:",
            error
        );

        window.alert(
            "Die Fahrtdaten konnten nicht gespeichert werden."
        );

        return false;
    }
}

function stammdatenLaden() {
    try {
        const saved =
            localStorage.getItem(MASTER_DATA_KEY);

        if (!saved) {
            return {};
        }

        const data = JSON.parse(saved);

        return (
            data &&
            typeof data === "object" &&
            !Array.isArray(data)
        )
            ? data
            : {};
    } catch (error) {
        console.error(
            "Stammdaten konnten nicht geladen werden:",
            error
        );

        return {};
    }
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
            element("maintenanceInput")?.value || ""
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
        console.error(
            "Stammdaten konnten nicht gespeichert werden:",
            error
        );

        textSetzen(
            "masterDataMessage",
            "❌ Stammdaten konnten nicht gespeichert werden."
        );
    }
}

/* =========================================================
   SEITENNAVIGATION
   ========================================================= */

const seiten = {
    dashboard: {
        title: "Übersicht",
        description:
            "Die wichtigsten Informationen auf einen Blick."
    },

    tracking: {
        title: "Fahrt erfassen",
        description:
            "GPS-Aufzeichnung starten, beenden und speichern."
    },

    flugbuch: {
        title: "Flugbuch",
        description:
            "Alle gespeicherten Fahrten verwalten."
    },

    karte: {
        title: "Karte und Standort",
        description:
            "Flugrouten und aktuelle GPS-Position anzeigen."
    },

    statistiken: {
        title: "Statistiken",
        description:
            "Monatswerte, Gesamtwerte und Flugaktivität."
    },

    wetter: {
        title: "Wetter",
        description:
            "Aktuelle Wetterinformationen für deinen Standort."
    },

    einstellungen: {
        title: "Einstellungen",
        description:
            "Stammdaten und Monitoranforderungen verwalten."
    }
};

function seiteAnzeigen(pageName) {
    if (!seiten[pageName]) {
        pageName = "dashboard";
    }

    document.querySelectorAll(".app-page")
        .forEach(function (page) {
            const active =
                page.dataset.page === pageName;

            page.hidden = !active;
            page.classList.toggle(
                "active",
                active
            );
        });

    document.querySelectorAll("[data-page-link]")
        .forEach(function (link) {
            link.classList.toggle(
                "active",
                link.dataset.pageLink === pageName
            );
        });

    textSetzen(
        "pageTitle",
        seiten[pageName].title
    );

    textSetzen(
        "pageDescription",
        seiten[pageName].description
    );

    if (
        window.location.hash !==
        `#${pageName}`
    ) {
        window.history.replaceState(
            null,
            "",
            `#${pageName}`
        );
    }

    element("sidebar")
        ?.classList.remove("sidebar-open");

    element("menuButton")
        ?.setAttribute(
            "aria-expanded",
            "false"
        );

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    if (pageName === "karte") {
        window.setTimeout(function () {
            hauptkarteInitialisieren();

            hauptkarte?.invalidateSize();

            alleFluegeAufKarte();
        }, 150);
    }

    if (pageName === "tracking") {
        window.setTimeout(function () {
            trackingKarteInitialisieren();

            trackingKarte?.invalidateSize();

            zeichneTrackingTrack(trackpunkte);
        }, 150);
    }

    if (pageName === "statistiken") {
        window.setTimeout(
            zeichneMonatsstatistik,
            150
        );
    }

    if (pageName === "wetter") {
        ladeWetter();
    }
}

/* =========================================================
   KARTEN
   ========================================================= */

function kartenEbenen() {
    if (typeof L === "undefined") {
        return null;
    }

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

    if (!layers) {
        return;
    }

    hauptkarte = L.map("map", {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        layers: [layers.standard]
    });

    L.control.layers({
        "🗺 Standardkarte": layers.standard,
        "🛰 Satellitenkarte": layers.satellite
    }).addTo(hauptkarte);

    L.control.scale({
        imperial: false,
        metric: true
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

    if (!layers) {
        return;
    }

    trackingKarte = L.map(
        "trackingMap",
        {
            center: DEFAULT_CENTER,
            zoom: DEFAULT_ZOOM,
            layers: [layers.satellite]
        }
    );

    L.control.layers({
        "🛰 Satellitenkarte":
            layers.satellite,

        "🗺 Standardkarte":
            layers.standard
    }).addTo(trackingKarte);

    L.control.scale({
        imperial: false,
        metric: true
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
        !Number.isFinite(longitude)
    ) {
        return;
    }

    hauptkarteInitialisieren();
    trackingKarteInitialisieren();

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

function setTrackingStartMarker(lat, lng) {
    trackingKarteInitialisieren();

    if (!trackingKarte) {
        return;
    }

    const latitude = Number(lat);
    const longitude = Number(lng);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {
        return;
    }

    if (trackingStartMarker) {
        trackingKarte.removeLayer(
            trackingStartMarker
        );
    }

    trackingStartMarker =
        L.circleMarker(
            [latitude, longitude],
            {
                radius: 8,
                color: "#ffffff",
                weight: 2,
                fillColor: "#43dd6b",
                fillOpacity: 1
            }
        )
            .addTo(trackingKarte)
            .bindPopup("🎈 Startpunkt");

    trackingKarte.setView(
        [latitude, longitude],
        13
    );
}

function setTrackingLandingMarker(lat, lng) {
    trackingKarteInitialisieren();

    if (!trackingKarte) {
        return;
    }

    const latitude = Number(lat);
    const longitude = Number(lng);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {
        return;
    }

    if (trackingLandingMarker) {
        trackingKarte.removeLayer(
            trackingLandingMarker
        );
    }

    trackingLandingMarker =
        L.circleMarker(
            [latitude, longitude],
            {
                radius: 8,
                color: "#ffffff",
                weight: 2,
                fillColor: "#ff625b",
                fillOpacity: 1
            }
        )
            .addTo(trackingKarte)
            .bindPopup("🏁 Landepunkt");
}

function zeichneTrackingTrack(track) {
    trackingKarteInitialisieren();

    if (!trackingKarte) {
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

        trackingRouteLine = null;
    }

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
    trackingKarteInitialisieren();

    if (!trackingKarte) {
        return;
    }

    if (trackingStartMarker) {
        trackingKarte.removeLayer(
            trackingStartMarker
        );

        trackingStartMarker = null;
    }

    if (trackingLandingMarker) {
        trackingKarte.removeLayer(
            trackingLandingMarker
        );

        trackingLandingMarker = null;
    }

    if (trackingRouteLine) {
        trackingKarte.removeLayer(
            trackingRouteLine
        );

        trackingRouteLine = null;
    }
}

function routeAusFlug(flight) {
    if (!Array.isArray(flight?.track)) {
        return [];
    }

    return flight.track
        .filter(mapPointValid)
        .map(function (point) {
            return [
                Number(point.lat),
                Number(point.lng)
            ];
        });
}

function alleFluegeAufKarte() {
    hauptkarteInitialisieren();

    if (
        !hauptkarte ||
        !allFlightsLayer
    ) {
        return;
    }

    allFlightsLayer.clearLayers();

    selectedFlightLayer?.clearLayers();

    const allCoordinates = [];

    window.fluege.forEach(
        function (flight) {
            const route =
                routeAusFlug(flight);

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
            )
                .addTo(allFlightsLayer)
                .bindPopup(
                    "🎈 Start: " +
                    htmlSicher(
                        flight.startOrt ||
                        "Unbekannt"
                    )
                );

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
                )
                    .addTo(allFlightsLayer)
                    .bindPopup(
                        "🏁 Landung: " +
                        htmlSicher(
                            flight.landeOrt ||
                            "Unbekannt"
                        )
                    );
            }

            allCoordinates.push(...route);
        }
    );

    if (allCoordinates.length > 0) {
        hauptkarte.fitBounds(
            allCoordinates,
            {
                padding: [20, 20],
                maxZoom: 11
            }
        );
    } else if (letzterStandort) {
        standortZentrieren(hauptkarte);
    } else {
        hauptkarte.setView(
            DEFAULT_CENTER,
            DEFAULT_ZOOM
        );
    }
}

function flugAufKarte(flight) {
    hauptkarteInitialisieren();

    if (
        !hauptkarte ||
        !selectedFlightLayer ||
        !flight
    ) {
        return;
    }

    const route =
        routeAusFlug(flight);

    selectedFlightLayer.clearLayers();

    if (route.length === 0) {
        return;
    }

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
            "🎈 Start: " +
            htmlSicher(
                flight.startOrt ||
                "Unbekannt"
            )
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
                "🏁 Landung: " +
                htmlSicher(
                    flight.landeOrt ||
                    "Unbekannt"
                )
            );
    }

    const bounds =
        L.latLngBounds(route);

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

/* =========================================================
   STANDORT UND GPS
   ========================================================= */

function standortAnzeigeAktualisieren(position) {
    const latitude =
        Number(position.coords.latitude);

    const longitude =
        Number(position.coords.longitude);

    const accuracy =
        Number(position.coords.accuracy);

    const altitude =
        position.coords.altitude;

    const speed =
        position.coords.speed;

    const altitudeAvailable =
        altitude !== null &&
        altitude !== undefined &&
        Number.isFinite(Number(altitude));

    const speedAvailable =
        speed !== null &&
        speed !== undefined &&
        Number.isFinite(Number(speed));

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
        altitudeAvailable
            ? `${Math.round(Number(altitude))} m`
            : "Nicht verfügbar"
    );

    textSetzen(
        "currentAccuracy",
        Number.isFinite(accuracy)
            ? `± ${Math.round(accuracy)} m`
            : "--"
    );

    textSetzen(
        "currentSpeed",
        speedAvailable
            ? `${(
                Math.max(0, Number(speed)) *
                3.6
            ).toFixed(1)} km/h`
            : "Nicht verfügbar"
    );

    textSetzen(
        "currentLocationTime",
        new Date(
            position.timestamp ||
            Date.now()
        ).toLocaleTimeString(
            "de-AT",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        )
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
        "trackingAltitude",
        altitudeAvailable
            ? (
                `GPS-Höhe: ` +
                `${Math.round(Number(altitude))} m`
            )
            : "GPS-Höhe: nicht verfügbar"
    );
}

function standortErfolgreich(position) {
    letzterStandort = position;

    standortAnzeigeAktualisieren(position);
    standortAufKartenZeichnen(position);
}

function standortFehler(error) {
    let message =
        "GPS-Position nicht verfügbar";

    if (error?.code === 1) {
        message =
            "Standortberechtigung nicht erteilt";
    } else if (error?.code === 2) {
        message =
            "Standort derzeit nicht verfügbar";
    } else if (error?.code === 3) {
        message =
            "Standortabfrage hat zu lange gedauert";
    }

    textSetzen(
        "locationStatus",
        message
    );

    if (!letzterStandort) {
        textSetzen(
            "trackingCoordinates",
            message
        );
    }
}

function standortUeberwachungStarten() {
    if (!navigator.geolocation) {
        standortFehler({ code: 2 });
        return;
    }

    if (locationWatchId !== null) {
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

    standortUeberwachungAktiv = true;

    textSetzen(
        "toggleLocationTrackingButton",
        "Standortüberwachung stoppen"
    );
}

function standortUeberwachungStoppen() {
    if (
        locationWatchId !== null &&
        navigator.geolocation
    ) {
        navigator.geolocation.clearWatch(
            locationWatchId
        );

        locationWatchId = null;
    }

    standortUeberwachungAktiv = false;

    textSetzen(
        "locationStatus",
        "Standortüberwachung angehalten"
    );

    textSetzen(
        "toggleLocationTrackingButton",
        "Standortüberwachung starten"
    );
}

function standortUeberwachungUmschalten() {
    if (standortUeberwachungAktiv) {
        standortUeberwachungStoppen();
    } else {
        standortUeberwachungStarten();
    }
}

function standortZentrieren(map) {
    if (!map) {
        return;
    }

    if (!letzterStandort) {
        standortUeberwachungStarten();

        textSetzen(
            "locationStatus",
            "GPS-Position wird ermittelt ..."
        );

        return;
    }

    map.setView(
        [
            Number(
                letzterStandort.coords.latitude
            ),
            Number(
                letzterStandort.coords.longitude
            )
        ],
        14,
        {
            animate: true
        }
    );
}

async function standortKopieren() {
    if (!letzterStandort) {
        textSetzen(
            "copyLocationMessage",
            "Noch keine GPS-Position verfügbar."
        );

        return;
    }

    const coordinateText =
        `${formatKoordinate(
            letzterStandort.coords.latitude
        )}, ` +
        `${formatKoordinate(
            letzterStandort.coords.longitude
        )}`;

    try {
        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {
            await navigator.clipboard.writeText(
                coordinateText
            );

            textSetzen(
                "copyLocationMessage",
                "✓ Koordinaten wurden kopiert."
            );
        } else {
            throw new Error(
                "Zwischenablage nicht verfügbar"
            );
        }
    } catch {
        textSetzen(
            "copyLocationMessage",
            `Koordinaten: ${coordinateText}`
        );
    }
}

async function ortName(lat, lng) {
    try {
        const parameters =
            new URLSearchParams({
                format: "jsonv2",
                lat: String(lat),
                lon: String(lng),
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

function geolocationFehlerText(error) {
    if (error?.code === 1) {
        return (
            "Die Standortberechtigung wurde " +
            "nicht erteilt."
        );
    }

    if (error?.code === 2) {
        return (
            "Die Position ist derzeit " +
            "nicht verfügbar."
        );
    }

    if (error?.code === 3) {
        return (
            "Die Standortabfrage hat " +
            "zu lange gedauert."
        );
    }

    return (
        "Der Standort konnte nicht " +
        "ermittelt werden."
    );
}

function trackpunktHinzufuegen(position) {
    if (!position?.coords) {
        return;
    }

    const altitude =
        position.coords.altitude;

    const speed =
        position.coords.speed;

    const accuracy =
        position.coords.accuracy;

    const point = {
        lat:
            Number(position.coords.latitude),

        lng:
            Number(position.coords.longitude),

        hoehe:
            altitude !== null &&
            altitude !== undefined &&
            Number.isFinite(Number(altitude))
                ? Number(altitude)
                : null,

        speed:
            speed !== null &&
            speed !== undefined &&
            Number.isFinite(Number(speed))
                ? Math.max(0, Number(speed))
                : null,

        genauigkeit:
            accuracy !== null &&
            accuracy !== undefined &&
            Number.isFinite(Number(accuracy))
                ? Number(accuracy)
                : null,

        zeit:
            new Date(
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

/* =========================================================
   FAHRT STARTEN, BEENDEN UND SPEICHERN
   ========================================================= */

function statusSetzen(
    message,
    className = ""
) {
    const status = element("status");

    if (!status) {
        return;
    }

    status.textContent = message;

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

    const pilot =
        textBereinigen(
            element("pilot")?.value
        );

    const ballon =
        textBereinigen(
            element("ballon")?.value
        ).toUpperCase();

    const ballontyp =
        textBereinigen(
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
        "📡 Startposition wird ermittelt.",
        "status-working"
    );

    buttonStatusSetzen(
        true,
        true,
        true
    );

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            const startDate = new Date();

            const startPlace =
                await ortName(
                    position.coords.latitude,
                    position.coords.longitude
                );

            aktuellerFlug = {
                id: sichereId(),
                datum: startDate.toISOString(),
                startzeit: startDate.toISOString(),
                pilot,
                ballon,
                ballontyp,
                startOrt: startPlace,

                startLat:
                    Number(
                        position.coords.latitude
                    ),

                startLng:
                    Number(
                        position.coords.longitude
                    )
            };

            trackpunkte = [];
            flugWirdBeendet = false;

            trackingKarteZuruecksetzen();

            setTrackingStartMarker(
                position.coords.latitude,
                position.coords.longitude
            );

            trackpunktHinzufuegen(position);

            if (flightWatchId !== null) {
                navigator.geolocation.clearWatch(
                    flightWatchId
                );
            }

            flightWatchId =
                navigator.geolocation.watchPosition(
                    function (newPosition) {
                        letzterStandort =
                            newPosition;

                        standortAnzeigeAktualisieren(
                            newPosition
                        );

                        standortAufKartenZeichnen(
                            newPosition
                        );

                        trackpunktHinzufuegen(
                            newPosition
                        );
                    },

                    function (error) {
                        console.warn(
                            "GPS während der Fahrt:",
                            error
                        );

                        statusSetzen(
                            "⚠ Fahrt läuft. GPS ist vorübergehend gestört.",
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
                "❌ " +
                geolocationFehlerText(error),
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
        "📡 Landeposition wird ermittelt.",
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
                Number(
                    position.coords.latitude
                );

            aktuellerFlug.landeLng =
                Number(
                    position.coords.longitude
                );

            setTrackingLandingMarker(
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
                "❌ " +
                geolocationFehlerText(error),
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

    if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
    ) {
        statusSetzen(
            "❌ Die Fahrtdauer konnte nicht berechnet werden.",
            "status-error"
        );

        return;
    }

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
            return Number(point.hoehe);
        })
        .filter(Number.isFinite);

    const speeds = trackpunkte
        .map(function (point) {
            return Number(point.speed);
        })
        .filter(Number.isFinite);

    aktuellerFlug.flugzeit =
        flightMinutes;

    aktuellerFlug.strecke =
        Number(distance.toFixed(1));

    aktuellerFlug.track =
        trackpunkte.map(
            function (point) {
                return { ...point };
            }
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
            ? Number(
                (
                    Math.max(...speeds) *
                    3.6
                ).toFixed(1)
            )
            : 0;

    aktuellerFlug.avgSpeed =
        flightMinutes > 0
            ? Number(
                (
                    distance /
                    (flightMinutes / 60)
                ).toFixed(1)
            )
            : 0;

    aktuellerFlug.landungen =
        Math.max(
            1,
            Number.parseInt(
                element("landungen")?.value,
                10
            ) || 1
        );

    aktuellerFlug.bemerkung =
        textBereinigen(
            element("bemerkung")?.value
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
/* =========================================================
   BALLONFLUGBUCH PROFESSIONAL V10
   Teil 2 von 2
   Direkt unter Teil 1 einfügen.
   ========================================================= */

/* =========================================================
   DIAGRAMME
   ========================================================= */

function chartOptionen() {
    *eturn {
        responsive: true,
*       maintainAspectRatio: false,*
        interaction: {
          * intersect: false,
            mod*: "index"
        },

        plug*ns: {
            legend: {
      *         labels: {
               *    color: "#b6c5d4"
             *  }
            }
        },

    *   scales: {
            x: {
    *           ticks: {
              *     color: "#91a7ba"
            *   },

                grid: {
   *                color: "#203548"
 *              }
            },

  *         y: {
                begi*AtZero: true,

                tic*s: {
                    color: "#*1a7ba"
                },

       *        grid: {
                  * color: "#203548"
                *
            }
        }
    };
}
*function zeichneHoehenprofil(track* {
    if (
        typeof Chart =*= "undefined" ||
        !element(*heightChart")
    ) {
        retu*n;
    }

    const safeTrack =
  *     Array.isArray(track)
        *   ? track
            : [];

    *f (hoehenChart) {
        hoehenCh*rt.destroy();
        hoehenChart * null;
    }

    hoehenChart = ne* Chart(
        element("heightCha*t"),
        {
            type: "*ine",

            data: {
       *        labels: safeTrack.map(
   *                function (_, index* {
                        return *ndex + 1;
                    }
  *             ),

                d*tasets: [
                    {
                        label: "Höhe (m)",

                        data* safeTrack.map(
                  *         function (point) {
      *                         const hei*ht =
                             *      Number(
                    *                   point.hoehe
   *                                );*
                                r*turn Number.isFinite(
            *                       height
    *                           )
     *                              ? he*ght
                              *     : null;
                     *      }
                        ),*
                        borderCol*r: "#168cff",

                   *    backgroundColor:
             *              "rgba(22, 140, 255, *.13)",

                        fi*l: true,
                        t*nsion: 0.25,
                     *  spanGaps: true,

               *        pointRadius:
             *              safeTrack.length > 8*
                                ?*0
                                * 2
                    }
         *      ]
            },

          * options: chartOptionen()
        *
    );
}

function zeichneMonatss*atistik() {
    if (
        typeo* Chart === "undefined" ||
        *element("monthlyChart")
    ) {
  *     return;
    }

    const labe*s = [];
    const values = [];
   *const today = new Date();

    for*(
        let offset = 11;
       *offset >= 0;
        offset -= 1
 *  ) {
        const monthDate = ne* Date(
            today.getFullYe*r(),
            today.getMonth() * offset,
            1
        );
*        labels.push(
            m*nthDate.toLocaleDateString(
      *         "de-AT",
                *
                    month: "short*,
                    year: "2-dig*t"
                }
            )*        );

        const count = *indow.fluege.filter(
            f*nction (flight) {
                *onst flightDate =
                *   new Date(
                     *  flight.startzeit ||
            *           flight.datum
          *         );

                retur* (
                    !Number.isN*N(
                        flightD*te.getTime()
                    )*&&
                    flightDate.*etFullYear() ===
                 *      monthDate.getFullYear() &&
 *                  flightDate.getMo*th() ===
                        m*nthDate.getMonth()
               *);
            }
        ).length;*
        values.push(count);
    }*
    if (monatsChart) {
        monatsChart.destroy();
        monatsChart = null;
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

/* =========================================================
   AUSWERTUNG UND FLUGBUCH
   ========================================================= */

function summenBerechnen() {
    return {
        time: window.fluege.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (Number(
                        flight.flugzeit
                    ) || 0)
                );
            },
            0
        ),

        distance: window.fluege.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (Number(
                        flight.strecke
                    ) || 0)
                );
            },
            0
        ),

        landings: window.fluege.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (Number(
                        flight.landungen
                    ) || 0)
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
        window.fluege.length
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
        `${window.fluege.length} EINTRÄGE`
    );

    const sortedFlights =
        [...window.fluege].sort(
            function (flightA, flightB) {
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
            }
        );

    const lastFlight =
        sortedFlights[
            sortedFlights.length - 1
        ];

    const rows = [
        [
            "Gesamtfahrten",
            window.fluege.length
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
                window.fluege.length
                    ? (
                        totals.time /
                        window.fluege.length
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

    const html = rows.map(
        function (row) {
            return `
                <div class="summary-row">
                    <span>${htmlSicher(row[0])}</span>
                    <strong>${htmlSicher(row[1])}</strong>
                </div>
            `;
        }
    ).join("");

    if (element("summaryList")) {
        element("summaryList").innerHTML =
            html;
    }

    if (element("statisticsSummary")) {
        element(
            "statisticsSummary"
        ).innerHTML = html;
    }
}

function rekordeAktualisieren() {
    function maxValue(key) {
        return Math.max(
            0,
            ...window.fluege.map(
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
                    <span>${htmlSicher(record[0])}</span>
                    <strong>${htmlSicher(record[1])}</strong>
                    <small>Persönlicher Rekord</small>
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

    if (window.fluege.length === 0) {
        list.innerHTML = `
            <p class="empty-message">
                Noch keine Fahrten gespeichert.
            </p>
        `;

        return;
    }

    list.innerHTML = [...window.fluege]
        .map(function (flight, index) {
            return {
                flight,
                index
            };
        })
        .sort(
            function (itemA, itemB) {
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
            }
        )
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
                            <small>Maximale Höhe</small>
                            ${formatZahl(
                                flight.maxHoehe
                            )} m
                        </div>

                        <div>
                            <small>Maximales Tempo</small>
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
    const flight =
        window.fluege[index];

    if (!flight) {
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

/* =========================================================
   AKTIVITÄTSMONITOR
   ========================================================= */

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
    try {
        const saved = JSON.parse(
            localStorage.getItem(
                MONITOR_STORAGE_KEY
            ) || "{}"
        );

        return {
            zeitraumMonate:
                sichereGanzzahl(
                    saved.zeitraumMonate,
                    MONITOR_DEFAULTS
                        .zeitraumMonate,
                    1,
                    120
                ),

            erforderlicheFahrten:
                sichereGanzzahl(
                    saved.erforderlicheFahrten,
                    MONITOR_DEFAULTS
                        .erforderlicheFahrten,
                    0
                ),

            erforderlicheLandungen:
                sichereGanzzahl(
                    saved.erforderlicheLandungen,
                    MONITOR_DEFAULTS
                        .erforderlicheLandungen,
                    0
                )
        };
    } catch (error) {
        console.error(
            "Monitoreinstellungen konnten nicht geladen werden:",
            error
        );

        return {
            ...MONITOR_DEFAULTS
        };
    }
}

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

    cutoff.setHours(0, 0, 0, 0);

    cutoff.setMonth(
        cutoff.getMonth() -
        settings.zeitraumMonate
    );

    const relevantFlights =
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
                    date >= cutoff &&
                    date <= now
                );
            }
        );

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
        targetValue
    ) {
        const percentage =
            targetValue <= 0
                ? 100
                : Math.min(
                    100,
                    Math.max(
                        0,
                        Math.round(
                            value /
                            targetValue *
                            100
                        )
                    )
                );

        return `
            <div class="monitor-progress">
                <div class="monitor-progress-header">
                    <strong>${htmlSicher(label)}</strong>
                    <span>${value} / ${targetValue}</span>
                </div>

                <div
                    class="monitor-progress-bar"
                    role="progressbar"
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

    const fulfilled =
        relevantFlights.length >=
            settings.erforderlicheFahrten &&
        landings >=
            settings.erforderlicheLandungen;

    target.innerHTML =
        progressHtml(
            "Fahrten",
            relevantFlights.length,
            settings.erforderlicheFahrten
        ) +
        progressHtml(
            "Landungen",
            landings,
            settings.erforderlicheLandungen
        ) +
        `
            <div class="
                monitor-state
                ${
                    fulfilled
                        ? "monitor-state-good"
                        : "monitor-state-open"
                }
            ">
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
                `${relevantFlights.length} relevante ` +
                `Fahrt(en) und ${landings} ` +
                "Landung(en) im Zeitraum."
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

    if (element("monitorSollFahrten")) {
        element(
            "monitorSollFahrten"
        ).value =
            settings.erforderlicheFahrten;
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

        erforderlicheFahrten:
            sichereGanzzahl(
                element(
                    "monitorSollFahrten"
                )?.value,
                MONITOR_DEFAULTS
                    .erforderlicheFahrten,
                0
            ),

        erforderlicheLandungen:
            sichereGanzzahl(
                element(
                    "monitorSollLandungen"
                )?.value,
                MONITOR_DEFAULTS
                    .erforderlicheLandungen,
                0
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
        console.error(
            "Monitoreinstellungen konnten nicht gespeichert werden:",
            error
        );

        textSetzen(
            "monitorMeldung",
            "❌ Einstellungen konnten nicht gespeichert werden."
        );
    }
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

/* =========================================================
   WETTER
   ========================================================= */

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

    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
        return date.toLocaleTimeString(
            "de-AT",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );
    }

    const match =
        String(value).match(
            /T(\d{2}:\d{2})/
        );

    return match
        ? match[1]
        : "--";
}

async function wetterAbrufen(
    latitude,
    longitude
) {
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

    return response.json();
}

async function wetterAnzeigen(
    latitude,
    longitude
) {
    const rating =
        element("weatherRating");

    try {
        const data =
            await wetterAbrufen(
                latitude,
                longitude
            );

        const current =
            data.current || {};

        const daily =
            data.daily || {};

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
                    `${Math.round(direction)}° ` +
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
        console.error(
            "Wetterdaten konnten nicht geladen werden:",
            error
        );

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

    if (!navigator.geolocation) {
        rating.textContent =
            "GPS wird nicht unterstützt.";

        rating.className =
            "weather-rating weather-danger";

        return;
    }

    rating.textContent =
        "📡 Wetterdaten werden geladen.";

    rating.className =
        "weather-rating";

    if (letzterStandort) {
        wetterAnzeigen(
            letzterStandort.coords.latitude,
            letzterStandort.coords.longitude
        );

        return;
    }

    navigator.geolocation.getCurrentPosition(
        function (position) {
            letzterStandort = position;

            standortAnzeigeAktualisieren(
                position
            );

            standortAufKartenZeichnen(
                position
            );

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
            enableHighAccuracy: false,
            maximumAge: 300000,
            timeout: 15000
        }
    );
}

/* =========================================================
   BACKUP UND IMPORT
   ========================================================= */

function backupExportieren() {
    const backup = {
        version: 10,
        exportedAt:
            new Date().toISOString(),

        fluege:
            window.fluege
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

    let normalized = value;

    if (typeof value === "string") {
        normalized = value
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
    }

    const number =
        Number(normalized);

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
        const year =
            Number(match[3]);

        const month =
            Number(match[2]) - 1;

        const day =
            Number(match[1]);

        const hour =
            Number(match[4] || 0);

        const minute =
            Number(match[5] || 0);

        const date = new Date(
            year,
            month,
            day,
            hour,
            minute
        );

        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month ||
            date.getDate() !== day
        ) {
            return null;
        }

        return date.toISOString();
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
    const lines = String(text)
        .replace(/^\uFEFF/, "")
        .trim()
        .split(/\r?\n/)
        .filter(function (line) {
            return line.trim() !== "";
        });

    if (lines.length < 2) {
        throw new Error(
            "Die CSV-Datei enthält keine Fahrten."
        );
    }

    const firstLine = lines[0];

    const semicolonCount =
        (firstLine.match(/;/g) || [])
            .length;

    const commaCount =
        (firstLine.match(/,/g) || [])
            .length;

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

    const normalizedTrack = track
        .map(function (point) {
            if (
                !point ||
                typeof point !== "object"
            ) {
                return null;
            }

            const latitude =
                importZahl(
                    point.lat ??
                    point.latitude,
                    null
                );

            const longitude =
                importZahl(
                    point.lng ??
                    point.lon ??
                    point.longitude,
                    null
                );

            const normalizedPoint = {
                lat: latitude,
                lng: longitude,

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

                genauigkeit:
                    importZahl(
                        point.genauigkeit ??
                        point.accuracy,
                        null
                    ),

                zeit:
                    importDatum(
                        point.zeit ??
                        point.timestamp
                    ) ||
                    startTime
            };

            return mapPointValid(
                normalizedPoint
            )
                ? normalizedPoint
                : null;
        })
        .filter(Boolean);

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

        track:
            normalizedTrack
    };
}

async function importDateiAuswaehlen(event) {
    const file =
        event.target.files?.[0];

    vorbereiteteImportFluege = [];

    if (element("executeImportButton")) {
        element(
            "executeImportButton"
        ).disabled = true;
    }

    if (element("importPreview")) {
        element("importPreview").hidden =
            true;
    }

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
                Array.isArray(json.fluege)
            ) {
                rawFlights =
                    json.fluege;
            } else if (
                Array.isArray(json.fahrten)
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
            normalizedFlights.length === 0
        ) {
            throw new Error(
                "Keine gültigen Fahrten gefunden."
            );
        }

        vorbereiteteImportFluege =
            normalizedFlights;

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

        textSetzen(
            "importFileInformation",
            `${file.name} · ` +
            `${normalizedFlights.length} Fahrt(en)`
        );

        if (element("importPreview")) {
            element(
                "importPreview"
            ).innerHTML = `
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

            element(
                "importPreview"
            ).hidden = false;
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
        console.error(
            "Import fehlgeschlagen:",
            error
        );

        const message =
            element("importMessage");

        if (message) {
            message.textContent =
                "❌ " +
                (
                    error.message ||
                    "Importdatei ist ungültig."
                );

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
        vorbereiteteImportFluege.length === 0
    ) {
        return;
    }

    const mode =
        document.querySelector(
            "input[name='importMode']:checked"
        )?.value || "append";

    const bisherigeFluege =
        [...window.fluege];

    let neueFluege;

    if (mode === "replace") {
        if (
            !window.confirm(
                "Alle vorhandenen Fahrten werden ersetzt. Fortfahren?"
            )
        ) {
            return;
        }

        neueFluege =
            [...vorbereiteteImportFluege];
    } else {
        neueFluege =
            [...window.fluege];

        const existingKeys =
            new Set(
                neueFluege.map(
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
                    neueFluege.push(flight);
                    existingKeys.add(key);
                }
            }
        );
    }

    window.fluege = neueFluege;

    if (!fluegeSpeichern()) {
        window.fluege =
            bisherigeFluege;

        return;
    }

    importDialogSchliessen();
    anzeigeAktualisieren();
    seiteAnzeigen("flugbuch");
}

/* =========================================================
   KOPFBEREICH UND GESAMTANZEIGE
   ========================================================= */

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
        "trackingPilot",
        pilot || "Nicht festgelegt"
    );

    textSetzen(
        "trackingBallon",
        ballon || "Nicht festgelegt"
    );

    textSetzen(
        "trackingBallontyp",
        ballontyp || "Nicht festgelegt"
    );

    const maintenance =
        element(
            "maintenanceInput"
        )?.value;

    let maintenanceText =
        "Nicht festgelegt";

    if (maintenance) {
        const date =
            new Date(
                `${maintenance}T12:00:00`
            );

        if (
            !Number.isNaN(
                date.getTime()
            )
        ) {
            maintenanceText =
                date.toLocaleDateString(
                    "de-AT"
                );
        }
    }

    textSetzen(
        "maintenanceDate",
        maintenanceText
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

/* =========================================================
   APP INITIALISIEREN
   ========================================================= */

function appInitialisieren() {
    if (appWurdeInitialisiert) {
        return;
    }

    appWurdeInitialisiert = true;

    const masterData =
        stammdatenLaden();

    if (element("pilot")) {
        element("pilot").value =
            masterData.pilot || "";
    }

    if (element("ballon")) {
        element("ballon").value =
            masterData.ballon || "";
    }

    if (element("ballontyp")) {
        element("ballontyp").value =
            masterData.ballontyp || "";
    }

    if (element("maintenanceInput")) {
        element(
            "maintenanceInput"
        ).value =
            masterData.maintenance || "";
    }

    monitorFormularFuellen();
    kopfbereichAktualisieren();
    aktuelleZeitAktualisieren();

    document.querySelectorAll(
        "[data-page-link]"
    ).forEach(function (link) {
        link.addEventListener(
            "click",
            function () {
                seiteAnzeigen(
                    link.dataset.pageLink
                );
            }
        );
    });

    eventListenerHinzufuegen(
        "menuButton",
        "click",
        function () {
            const sidebar =
                element("sidebar");

            if (!sidebar) {
                return;
            }

            sidebar.classList.toggle(
                "sidebar-open"
            );

            element("menuButton")
                ?.setAttribute(
                    "aria-expanded",
                    sidebar.classList.contains(
                        "sidebar-open"
                    )
                        ? "true"
                        : "false"
                );
        }
    );

    eventListenerHinzufuegen(
        "startButton",
        "click",
        flugStarten
    );

    eventListenerHinzufuegen(
        "stopButton",
        "click",
        flugBeenden
    );

    eventListenerHinzufuegen(
        "saveButton",
        "click",
        flugSpeichern
    );

    eventListenerHinzufuegen(
        "saveMasterDataButton",
        "click",
        stammdatenSpeichern
    );

    eventListenerHinzufuegen(
        "monitorSpeichern",
        "click",
        monitorSpeichern
    );

    eventListenerHinzufuegen(
        "monitorZuruecksetzen",
        "click",
        monitorZuruecksetzen
    );

    eventListenerHinzufuegen(
        "weatherReload",
        "click",
        ladeWetter
    );

    eventListenerHinzufuegen(
        "centerLocationButton",
        "click",
        function () {
            hauptkarteInitialisieren();
            standortZentrieren(
                hauptkarte
            );
        }
    );

    eventListenerHinzufuegen(
        "centerTrackingLocationButton",
        "click",
        function () {
            trackingKarteInitialisieren();
            standortZentrieren(
                trackingKarte
            );
        }
    );

    eventListenerHinzufuegen(
        "showAllFlightsButton",
        "click",
        alleFluegeAufKarte
    );

    eventListenerHinzufuegen(
        "toggleLocationTrackingButton",
        "click",
        standortUeberwachungUmschalten
    );

    eventListenerHinzufuegen(
        "copyLocationButton",
        "click",
        standortKopieren
    );

    eventListenerHinzufuegen(
        "exportButton",
        "click",
        backupExportieren
    );

    eventListenerHinzufuegen(
        "openImportButton",
        "click",
        importDialogOeffnen
    );

    eventListenerHinzufuegen(
        "closeImportButton",
        "click",
        importDialogSchliessen
    );

    eventListenerHinzufuegen(
        "cancelImportButton",
        "click",
        importDialogSchliessen
    );

    eventListenerHinzufuegen(
        "importInput",
        "change",
        importDateiAuswaehlen
    );

    eventListenerHinzufuegen(
        "executeImportButton",
        "click",
        importAusfuehren
    );

    eventListenerHinzufuegen(
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

    eventListenerHinzufuegen(
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

            const deleteIndex =
                button.dataset
                    .flightDelete;

            const mapIndex =
                button.dataset
                    .flightMap;

            if (
                deleteIndex !== undefined
            ) {
                flugLoeschen(
                    Number(deleteIndex)
                );

                return;
            }

            if (
                mapIndex !== undefined
            ) {
                const flight =
                    window.fluege[
                        Number(mapIndex)
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
                element("importDialog") &&
                !element(
                    "importDialog"
                ).hidden
            ) {
                importDialogSchliessen();
            }
        }
    );

    window.setInterval(
        aktuelleZeitAktualisieren,
        1000
    );

    buttonStatusSetzen(
        false,
        true,
        true
    );

    hauptkarteInitialisieren();
    trackingKarteInitialisieren();

    zeichneHoehenprofil([]);
    anzeigeAktualisieren();

    standortUeberwachungStarten();

    const requestedPage =
        window.location.hash
            .slice(1);

    seiteAnzeigen(
        seiten[requestedPage]
            ? requestedPage
            : "dashboard"
    );
}

if (
    document.readyState ===
    "loading"
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
            window.location.hash
                .slice(1);

        if (seiten[requestedPage]) {
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
