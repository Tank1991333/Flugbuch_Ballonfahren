"use strict";

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

function formatZahl(value, decimalPlaces = 0) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "0";
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

    return (
        `${hours}h ` +
        `${String(remainingMinutes).padStart(2, "0")}m`
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

    const lat = Number(point.lat);
    const lng = Number(point.lng);

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

    const latitudeA = Number(pointA.lat) * radians;
    const latitudeB = Number(pointB.lat) * radians;

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
            "Flüge konnten nicht geladen werden:",
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
            "Flüge konnten nicht gespeichert werden:",
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
        return JSON.parse(
            localStorage.getItem(MASTER_DATA_KEY) ||
            "{}"
        );
    } catch {
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
            element("ballon").value = data.ballon;
        }

        kopfbereichAktualisieren();

        if (element("masterDataMessage")) {
            element("masterDataMessage").textContent =
                "✓ Stammdaten wurden gespeichert.";
        }
    } catch (error) {
        console.error(error);

        if (element("masterDataMessage")) {
            element("masterDataMessage").textContent =
                "❌ Stammdaten konnten nicht gespeichert werden.";
        }
    }
}

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
            "Flugrouten, Live-Position und offizielle VFR-Karte."
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
            page.classList.toggle("active", active);
        });

    document.querySelectorAll("[data-page-link]")
        .forEach(function (link) {
            link.classList.toggle(
                "active",
                link.dataset.pageLink === pageName
            );
        });

    if (element("pageTitle")) {
        element("pageTitle").textContent =
            seiten[pageName].title;
    }

    if (element("pageDescription")) {
        element("pageDescription").textContent =
            seiten[pageName].description;
    }

    if (window.location.hash !== `#${pageName}`) {
        window.history.replaceState(
            null,
            "",
            `#${pageName}`
        );
    }

    element("sidebar")
        ?.classList.remove("sidebar-open");

    element("menuButton")
        ?.setAttribute("aria-expanded", "false");

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    if (pageName === "karte") {
        window.setTimeout(function () {
            hauptkarteInitialisieren();

            if (hauptkarte) {
                hauptkarte.invalidateSize();
            }

            alleFluegeAufKarte();
        }, 150);
    }

    if (pageName === "tracking") {
        window.setTimeout(function () {
            trackingKarteInitialisieren();

            if (trackingKarte) {
                trackingKarte.invalidateSize();
            }
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
            attribution: "Tiles &copy; Esri"
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

    trackingKarte = L.map("trackingMap", {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        layers: [layers.satellite]
    });

    L.control.layers({
        "🛰 Satellitenkarte": layers.satellite,
        "🗺 Standardkarte": layers.standard
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
            mainLocationMarker = L.circleMarker(
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
                .bindPopup("Aktueller GPS-Standort");
        } else {
            mainLocationMarker.setLatLng(
                coordinates
            );
        }

        if (Number.isFinite(accuracy)) {
            if (!mainAccuracyCircle) {
                mainAccuracyCircle = L.circle(
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
            trackingLocationMarker = L.circleMarker(
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
                .bindPopup("Aktueller GPS-Standort");
        } else {
            trackingLocationMarker.setLatLng(
                coordinates
            );
        }

        if (Number.isFinite(accuracy)) {
            if (!trackingAccuracyCircle) {
                trackingAccuracyCircle = L.circle(
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

    trackingStartMarker = L.circleMarker(
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

    trackingLandingMarker = L.circleMarker(
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
        Array.isArray(track) ? track : []
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

function alleFluegeAufKarte() {
    hauptkarteInitialisieren();

    if (!hauptkarte || !allFlightsLayer) {
        return;
    }

    allFlightsLayer.clearLayers();

    const allCoordinates = [];

    window.fluege.forEach(function (flight) {
        const route =
            Array.isArray(flight.track)
                ? flight.track
                    .filter(mapPointValid)
                    .map(function (point) {
                        return [
                            Number(point.lat),
                            Number(point.lng)
                        ];
                    })
                : [];

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
        !flight
    ) {
        return;
    }

    const route =
        Array.isArray(flight.track)
            ? flight.track
                .filter(mapPointValid)
                .map(function (point) {
                    return [
                        Number(point.lat),
                        Number(point.lng)
                    ];
                })
            : [];

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
            "🎈 Start: " +
            htmlSicher(
                flight.startOrt || "Unbekannt"
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
                    flight.landeOrt || "Unbekannt"
                )
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
        Number(position.coords.latitude);

    const longitude =
        Number(position.coords.longitude);

    const accuracy =
        Number(position.coords.accuracy);

    const altitude =
        position.coords.altitude;

    const speed =
        position.coords.speed;

    if (element("currentLatitude")) {
        element("currentLatitude").textContent =
            formatKoordinate(latitude);
    }

    if (element("currentLongitude")) {
        element("currentLongitude").textContent =
            formatKoordinate(longitude);
    }

    if (element("currentAltitude")) {
        element("currentAltitude").textContent =
            altitude !== null &&
            altitude !== undefined &&
            Number.isFinite(Number(altitude))
                ? `${Math.round(Number(altitude))} m`
                : "Nicht verfügbar";
    }

    if (element("currentAccuracy")) {
        element("currentAccuracy").textContent =
            Number.isFinite(accuracy)
                ? `± ${Math.round(accuracy)} m`
                : "--";
    }

    if (element("currentSpeed")) {
        element("currentSpeed").textContent =
            speed !== null &&
            speed !== undefined &&
            Number.isFinite(Number(speed))
                ? `${(
                    Math.max(0, Number(speed)) *
                    3.6
                ).toFixed(1)} km/h`
                : "Nicht verfügbar";
    }

    if (element("currentLocationTime")) {
        element("currentLocationTime").textContent =
            new Date(
                position.timestamp || Date.now()
            ).toLocaleTimeString(
                "de-AT",
                {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                }
            );
    }

    if (element("locationStatus")) {
        element("locationStatus").textContent =
            "GPS-Position aktiv";
    }

    if (element("trackingCoordinates")) {
        element("trackingCoordinates").textContent =
            `${formatKoordinate(latitude)}, ` +
            `${formatKoordinate(longitude)}`;
    }

    if (element("trackingAltitude")) {
        element("trackingAltitude").textContent =
            altitude !== null &&
            altitude !== undefined &&
            Number.isFinite(Number(altitude))
                ? `GPS-Höhe: ${Math.round(
                    Number(altitude)
                )} m`
                : "GPS-Höhe: nicht verfügbar";
    }
}

function standortErfolgreich(position) {
    letzterStandort = position;

    standortAnzeigeAktualisieren(position);
    standortAufKartenZeichnen(position);
}

function standortFehler(error) {
    let text = "GPS-Position nicht verfügbar";

    if (error?.code === 1) {
        text =
            "Standortberechtigung nicht erteilt";
    } else if (error?.code === 2) {
        text =
            "Standort derzeit nicht verfügbar";
    } else if (error?.code === 3) {
        text =
            "Standortabfrage hat zu lange gedauert";
    }

    if (element("locationStatus")) {
        element("locationStatus").textContent =
            text;
    }

    if (element("trackingCoordinates")) {
        element("trackingCoordinates").textContent =
            text;
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

    if (element("toggleLocationTrackingButton")) {
        element(
            "toggleLocationTrackingButton"
        ).textContent =
            "Standortüberwachung stoppen";
    }
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

    if (element("locationStatus")) {
        element("locationStatus").textContent =
            "Standortüberwachung angehalten";
    }

    if (element("toggleLocationTrackingButton")) {
        element(
            "toggleLocationTrackingButton"
        ).textContent =
            "Standortüberwachung starten";
    }
}

function standortUeberwachungUmschalten() {
    if (standortUeberwachungAktiv) {
        standortUeberwachungStoppen();
    } else {
        standortUeberwachungStarten();
    }
}

function standortZentrieren(map) {
    if (!letzterStandort) {
        standortUeberwachungStarten();
        return;
    }

    if (!map) {
        return;
    }

    map.setView(
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

async function standortKopieren() {
    if (!letzterStandort) {
        if (element("copyLocationMessage")) {
            element("copyLocationMessage").textContent =
                "Noch keine GPS-Position verfügbar.";
        }

        return;
    }

    const text =
        `${formatKoordinate(
            letzterStandort.coords.latitude
        )}, ` +
        `${formatKoordinate(
            letzterStandort.coords.longitude
        )}`;

    try {
        await navigator.clipboard.writeText(text);

        element("copyLocationMessage").textContent =
            "✓ Koordinaten wurden kopiert.";
    } catch {
        element("copyLocationMessage").textContent =
            text;
    }
}

async function ortName(lat, lng) {
    try {
        const parameters = new URLSearchParams({
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
    const altitude =
        position.coords.altitude;

    const speed =
        position.coords.speed;

    const accuracy =
        position.coords.accuracy;

    const point = {
        lat: Number(position.coords.latitude),
        lng: Number(position.coords.longitude),

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

        zeit: new Date(
            position.timestamp || Date.now()
        ).toISOString()
    };

    if (!mapPointValid(point)) {
        return;
    }

    const lastPoint =
        trackpunkte[trackpunkte.length - 1];

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

function statusSetzen(text, className = "") {
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
        textBereinigen(element("pilot")?.value);

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

    buttonStatusSetzen(true, true, true);

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            const startDate = new Date();

            const startPlace = await ortName(
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
                startLat: position.coords.latitude,
                startLng: position.coords.longitude
            };

            trackpunkte = [];
            flugWirdBeendet = false;

            trackingKarteZuruecksetzen();

            setTrackingStartMarker(
                position.coords.latitude,
                position.coords.longitude
            );

            trackpunktHinzufuegen(position);

            flightWatchId =
                navigator.geolocation.watchPosition(
                    trackpunktHinzufuegen,

                    function () {
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

    buttonStatusSetzen(true, true, true);

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            if (flightWatchId !== null) {
                navigator.geolocation.clearWatch(
                    flightWatchId
                );

                flightWatchId = null;
            }

            trackpunktHinzufuegen(position);

            const landingPlace = await ortName(
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

    aktuellerFlug.flugzeit =
        flightMinutes;

    aktuellerFlug.strecke =
        Number(distance.toFixed(1));

    aktuellerFlug.track =
        [...trackpunkte];

    aktuellerFlug.maxHoehe =
        heights.length
            ? Math.round(Math.max(...heights))
            : 0;

    aktuellerFlug.minHoehe =
        heights.length
            ? Math.round(Math.min(...heights))
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

    window.fluege.push(aktuellerFlug);

    if (!fluegeSpeichern()) {
        window.fluege.pop();
        return;
    }

    aktuellerFlug = null;
    trackpunkte = [];
    flugWirdBeendet = false;

    element("landungen").value = "1";
    element("bemerkung").value = "";

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
                                    Number(point.hoehe);

                                return Number.isFinite(height)
                                    ? height
                                    : null;
                            }
                        ),

                        borderColor: "#168cff",

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

        const count = window.fluege.filter(
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
        time: window.fluege.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (Number(flight.flugzeit) || 0)
                );
            },
            0
        ),

        distance: window.fluege.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (Number(flight.strecke) || 0)
                );
            },
            0
        ),

        landings: window.fluege.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (Number(flight.landungen) || 0)
                );
            },
            0
        )
    };
}

function zusammenfassungAktualisieren() {
    const totals = summenBerechnen();

    element("countFlights").textContent =
        String(window.fluege.length);

    element("countLandings").textContent =
        String(totals.landings);

    element("countMinutes").textContent =
        formatFlugzeit(totals.time);

    element("countKm").textContent =
        `${formatZahl(totals.distance, 1)} km`;

    element("flightbookCount").textContent =
        `${window.fluege.length} EINTRÄGE`;

    const lastFlight =
        window.fluege[
            window.fluege.length - 1
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
                    ? totals.time /
                        window.fluege.length
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

    element("summaryList").innerHTML = html;
    element("statisticsSummary").innerHTML = html;
}

function rekordeAktualisieren() {
    function maxValue(key) {
        return Math.max(
            0,
            ...window.fluege.map(
                function (flight) {
                    return Number(flight[key]) || 0;
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

    element("records").innerHTML = records.map(
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

    if (window.fluege.length === 0) {
        list.innerHTML = `
            <p class="empty-message">
                Noch keine Fahrten gespeichert.
            </p>
        `;

        return;
    }

    list.innerHTML = [...window.fluege]
        .reverse()
        .map(function (flight, reverseIndex) {
            const index =
                window.fluege.length -
                1 -
                reverseIndex;

            const hasTrack =
                Array.isArray(flight.track) &&
                flight.track.some(mapPointValid);

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
                            ${htmlSicher(flight.pilot || "-")}
                        </div>

                        <div>
                            <small>Route</small>
                            ${htmlSicher(flight.startOrt || "-")}
                            →
                            ${htmlSicher(flight.landeOrt || "-")}
                        </div>

                        <div>
                            <small>Dauer</small>
                            ${formatFlugzeit(flight.flugzeit)}
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
                            ${formatZahl(flight.maxHoehe)} m
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
                            ${formatZahl(flight.landungen)}
                        </div>

                        <div>
                            <small>Ballontyp</small>
                            ${htmlSicher(
                                flight.ballontyp || "-"
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

function monitorLaden() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(
                MONITOR_STORAGE_KEY
            ) || "{}"
        );

        return {
            zeitraumMonate: Math.min(
                120,
                Math.max(
                    1,
                    Number.parseInt(
                        saved.zeitraumMonate,
                        10
                    ) ||
                    MONITOR_DEFAULTS.zeitraumMonate
                )
            ),

            erforderlicheFahrten: Math.max(
                0,
                Number.parseInt(
                    saved.erforderlicheFahrten,
                    10
                ) ??
                MONITOR_DEFAULTS.erforderlicheFahrten
            ),

            erforderlicheLandungen: Math.max(
                0,
                Number.parseInt(
                    saved.erforderlicheLandungen,
                    10
                ) ??
                MONITOR_DEFAULTS.erforderlicheLandungen
            )
        };
    } catch {
        return {
            ...MONITOR_DEFAULTS
        };
    }
}

function monitorAktualisieren() {
    const settings = monitorLaden();
    const cutoff = new Date();

    cutoff.setHours(0, 0, 0, 0);
    cutoff.setMonth(
        cutoff.getMonth() -
        settings.zeitraumMonate
    );

    const relevantFlights =
        window.fluege.filter(
            function (flight) {
                const date = new Date(
                    flight.startzeit ||
                    flight.datum
                );

                return (
                    !Number.isNaN(date.getTime()) &&
                    date >= cutoff &&
                    date <= new Date()
                );
            }
        );

    const landings = relevantFlights.reduce(
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
        target
    ) {
        const percentage =
            target <= 0
                ? 100
                : Math.min(
                    100,
                    Math.round(
                        value / target * 100
                    )
                );

        return `
            <div class="monitor-progress">
                <div class="monitor-progress-header">
                    <strong>${label}</strong>
                    <span>${value} / ${target}</span>
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

    element("aktivitaetsmonitorInhalt").innerHTML =
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

    element("monitorPeriodLabel").textContent =
        `${settings.zeitraumMonate} MONATE`;

    element("nextExit").textContent =
        relevantFlights.length
            ? (
                `${relevantFlights.length} relevante ` +
                "Fahrt(en) im Zeitraum."
            )
            : "Kein relevanter Flug im Zeitraum.";
}

function monitorFormularFuellen() {
    const settings = monitorLaden();

    element("monitorZeitraum").value =
        settings.zeitraumMonate;

    element("monitorSollFahrten").value =
        settings.erforderlicheFahrten;

    element("monitorSollLandungen").value =
        settings.erforderlicheLandungen;
}

function monitorSpeichern() {
    const settings = {
        zeitraumMonate: Math.min(
            120,
            Math.max(
                1,
                Number.parseInt(
                    element("monitorZeitraum").value,
                    10
                ) || 24
            )
        ),

        erforderlicheFahrten: Math.max(
            0,
            Number.parseInt(
                element("monitorSollFahrten").value,
                10
            ) || 0
        ),

        erforderlicheLandungen: Math.max(
            0,
            Number.parseInt(
                element("monitorSollLandungen").value,
                10
            ) || 0
        )
    };

    localStorage.setItem(
        MONITOR_STORAGE_KEY,
        JSON.stringify(settings)
    );

    monitorFormularFuellen();
    monitorAktualisieren();

    element("monitorMeldung").textContent =
        "✓ Anforderungen wurden gespeichert.";
}

function monitorZuruecksetzen() {
    localStorage.removeItem(
        MONITOR_STORAGE_KEY
    );

    monitorFormularFuellen();
    monitorAktualisieren();

    element("monitorMeldung").textContent =
        "✓ Einstellungen wurden zurückgesetzt.";
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

    const match =
        String(value).match(
            /T(\d{2}:\d{2})/
        );

    return match
        ? match[1]
        : "--";
}

async function ladeWetter() {
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

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            try {
                const parameters =
                    new URLSearchParams({
                        latitude:
                            String(
                                position.coords.latitude
                            ),

                        longitude:
                            String(
                                position.coords.longitude
                            ),

                        current:
                            "temperature_2m," +
                            "wind_speed_10m," +
                            "wind_direction_10m," +
                            "relative_humidity_2m," +
                            "surface_pressure",

                        daily: "sunrise,sunset",
                        wind_speed_unit: "kmh",
                        timezone: "auto",
                        forecast_days: "1"
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
                    Number(current.temperature_2m);

                const wind =
                    Number(current.wind_speed_10m);

                const direction =
                    Number(current.wind_direction_10m);

                const humidity =
                    Number(
                        current.relative_humidity_2m
                    );

                const pressure =
                    Number(current.surface_pressure);

                element("temperature").textContent =
                    Number.isFinite(temperature)
                        ? (
                            "🌡 Temperatur: " +
                            `${formatZahl(
                                temperature,
                                1
                            )} °C`
                        )
                        : "🌡 Temperatur: --";

                element("wind").textContent =
                    Number.isFinite(wind)
                        ? (
                            "💨 Wind: " +
                            `${formatZahl(
                                wind,
                                1
                            )} km/h`
                        )
                        : "💨 Wind: --";

                element("windDirection").textContent =
                    Number.isFinite(direction)
                        ? (
                            "🧭 Windrichtung: " +
                            `${Math.round(direction)}° ` +
                            `(${windrichtungText(direction)})`
                        )
                        : "🧭 Windrichtung: --";

                element("sunrise").textContent =
                    "🌅 Sonnenaufgang: " +
                    isoUhrzeit(
                        daily.sunrise?.[0]
                    );

                element("sunset").textContent =
                    "🌇 Sonnenuntergang: " +
                    isoUhrzeit(
                        daily.sunset?.[0]
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

                rating.textContent =
                    `${assessment} ` +
                    `Luftfeuchtigkeit ${
                        Number.isFinite(humidity)
                            ? `${Math.round(humidity)} %`
                            : "--"
                    }. ` +
                    `Luftdruck ${
                        Number.isFinite(pressure)
                            ? `${Math.round(pressure)} hPa`
                            : "--"
                    }. Keine flugbetriebliche Freigabe.`;

                rating.className =
                    `weather-rating ${className}`;
            } catch (error) {
                console.error(error);

                rating.textContent =
                    "❌ Wetterdaten konnten nicht geladen werden.";

                rating.className =
                    "weather-rating weather-danger";
            }
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

function backupExportieren() {
    const backup = {
        version: 10,
        exportedAt:
            new Date().toISOString(),
        fluege: window.fluege
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

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

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
        window.fluege.splice(index, 1)[0];

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

function importDialogOeffnen() {
    vorbereiteteImportFluege = [];

    element("importInput").value = "";

    element("importFileInformation").textContent =
        "Noch keine Datei ausgewählt.";

    element("importPreview").hidden = true;
    element("importPreview").innerHTML = "";

    element("importMessage").textContent = "";

    element("executeImportButton").disabled =
        true;

    element("importDialog").hidden = false;
}

function importDialogSchliessen() {
    element("importDialog").hidden = true;
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

    const number = Number(normalized);

    return Number.isFinite(number)
        ? number
        : fallback;
}

function importDatum(value) {
    if (!value) {
        return null;
    }

    const text = String(value).trim();

    const match = text.match(
        /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/
    );

    if (match) {
        const year = Number(match[3]);
        const month = Number(match[2]) - 1;
        const day = Number(match[1]);
        const hour = Number(match[4] || 0);
        const minute = Number(match[5] || 0);

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

    const date = new Date(text);

    return Number.isNaN(date.getTime())
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
        const character = line[index];

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

    values.push(currentValue.trim());

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
        (firstLine.match(/;/g) || []).length;

    const commaCount =
        (firstLine.match(/,/g) || []).length;

    const separator =
        semicolonCount >= commaCount
            ? ";"
            : ",";

    const headers = csvZeileAufteilen(
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

    return lines.map(function (line) {
        const values =
            csvZeileAufteilen(line, separator);

        const row = {};

        headers.forEach(
            function (header, index) {
                row[header] =
                    values[index] || "";
            }
        );

        return row;
    });
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

    const startTime = importDatum(
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

            const lat = importZahl(
                point.lat ?? point.latitude,
                null
            );

            const lng = importZahl(
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

                hoehe: importZahl(
                    point.hoehe ??
                    point.altitude,
                    null
                ),

                speed: importZahl(
                    point.speed,
                    null
                ),

                genauigkeit: importZahl(
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
        })
        .filter(Boolean);

    return {
        id:
            getValue("id") ||
            `import-${Date.now()}-${index}`,

        datum: startTime,
        startzeit: startTime,

        endezeit: importDatum(
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

        ballontyp: textBereinigen(
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

        flugzeit: Math.max(
            0,
            importZahl(
                getValue(
                    "flugzeit",
                    "dauer"
                )
            )
        ),

        strecke: Math.max(
            0,
            importZahl(
                getValue(
                    "strecke",
                    "kilometer"
                )
            )
        ),

        avgSpeed: Math.max(
            0,
            importZahl(
                getValue(
                    "avgSpeed",
                    "avgspeed"
                )
            )
        ),

        maxSpeed: Math.max(
            0,
            importZahl(
                getValue(
                    "maxSpeed",
                    "maxspeed"
                )
            )
        ),

        maxHoehe: importZahl(
            getValue(
                "maxHoehe",
                "maxhoehe"
            )
        ),

        minHoehe: importZahl(
            getValue(
                "minHoehe",
                "minhoehe"
            )
        ),

        avgHoehe: importZahl(
            getValue(
                "avgHoehe",
                "avghoehe"
            )
        ),

        landungen: Math.max(
            1,
            Math.round(
                importZahl(
                    getValue("landungen"),
                    1
                )
            )
        ),

        bemerkung: textBereinigen(
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

    element("executeImportButton").disabled =
        true;

    element("importPreview").hidden = true;

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
            rawFlights = csvEinlesen(text);
        } else {
            const json = JSON.parse(text);

            if (Array.isArray(json)) {
                rawFlights = json;
            } else if (
                Array.isArray(json.fluege)
            ) {
                rawFlights = json.fluege;
            } else if (
                Array.isArray(json.fahrten)
            ) {
                rawFlights = json.fahrten;
            } else {
                throw new Error(
                    "Die JSON-Datei enthält keine Flugliste."
                );
            }
        }

        const normalizedFlights =
            rawFlights
                .map(importFlugNormalisieren)
                .filter(Boolean);

        if (normalizedFlights.length === 0) {
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
                        Number(flight.landungen)
                    );
                },
                0
            );

        element("importFileInformation").textContent =
            `${file.name} · ` +
            `${normalizedFlights.length} Fahrt(en)`;

        element("importPreview").innerHTML = `
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

        element("executeImportButton").disabled =
            false;

        element("importMessage").textContent =
            "Die Datei kann importiert werden.";

        element("importMessage").className =
            "import-message import-message-success";
    } catch (error) {
        console.error(
            "Import fehlgeschlagen:",
            error
        );

        element("importMessage").textContent =
            "❌ " +
            (
                error.message ||
                "Importdatei ist ungültig."
            );

        element("importMessage").className =
            "import-message import-message-error";
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

        const existingKeys = new Set(
            neueFluege.map(
                duplikatSchluessel
            )
        );

        vorbereiteteImportFluege.forEach(
            function (flight) {
                const key =
                    duplikatSchluessel(flight);

                if (!existingKeys.has(key)) {
                    neueFluege.push(flight);
                    existingKeys.add(key);
                }
            }
        );
    }

    window.fluege = neueFluege;

    if (!fluegeSpeichern()) {
        window.fluege = bisherigeFluege;
        return;
    }

    importDialogSchliessen();
    anzeigeAktualisieren();
    seiteAnzeigen("flugbuch");
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

    element("pilotHeader").textContent =
        pilot || "Pilot";

    element("trackingPilot").textContent =
        pilot || "Nicht festgelegt";

    element("trackingBallon").textContent =
        ballon || "Nicht festgelegt";

    element("trackingBallontyp").textContent =
        ballontyp || "Nicht festgelegt";

    const maintenance =
        element("maintenanceInput")?.value;

    element("maintenanceDate").textContent =
        maintenance
            ? new Date(
                `${maintenance}T12:00:00`
            ).toLocaleDateString("de-AT")
            : "Nicht festgelegt";
}

function aktuelleZeitAktualisieren() {
    const now = new Date();

    element("currentDate").textContent =
        now.toLocaleDateString("de-AT");

    element("currentTime").textContent =
        now.toLocaleTimeString(
            "de-AT",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );
}

function eventListenerHinzufuegen(
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
    const masterData = stammdatenLaden();

    element("pilot").value =
        masterData.pilot || "";

    element("ballon").value =
        masterData.ballon || "";

    element("ballontyp").value =
        masterData.ballontyp || "";

    element("maintenanceInput").value =
        masterData.maintenance || "";

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

            sidebar.classList.toggle(
                "sidebar-open"
            );

            element("menuButton").setAttribute(
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
            standortZentrieren(hauptkarte);
        }
    );

    eventListenerHinzufuegen(
        "centerTrackingLocationButton",
        "click",
        function () {
            trackingKarteInitialisieren();
            standortZentrieren(trackingKarte);
        }
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
                event.target.closest("button");

            if (!button) {
                return;
            }

            const deleteIndex =
                button.dataset.flightDelete;

            const mapIndex =
                button.dataset.flightMap;

            if (deleteIndex !== undefined) {
                flugLoeschen(
                    Number(deleteIndex)
                );

                return;
            }

            if (mapIndex !== undefined) {
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
                        flugAufKarte(flight);
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
                !element("importDialog").hidden
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
        window.location.hash.slice(1);

    seiteAnzeigen(
        seiten[requestedPage]
            ? requestedPage
            : "dashboard"
    );
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        appInitialisieren
    );
} else {
    appInitialisieren();
}

window.addEventListener(
    "resize",
    function () {
        if (hauptkarte) {
            hauptkarte.invalidateSize();
        }

        if (trackingKarte) {
            trackingKarte.invalidateSize();
        }
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
