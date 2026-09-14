// =====================================
// Ballonflugbuch Professional V9
// map.js
// =====================================

"use strict";

// =====================================
// Kartenlayer
// =====================================

const osm = L.tileLayer(
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

// =====================================
// Karte erstellen
// =====================================

const map = L.map(
    "map",
    {
        center: [47.05, 15.43],
        zoom: 8,
        layers: [osm],
        zoomControl: true
    }
);

// =====================================
// Layer-Auswahl
// =====================================

L.control.layers(
    {
        "🗺 Standard": osm,
        "🛰 Satellit": satellite
    },
    null,
    {
        collapsed: true
    }
).addTo(map);

// =====================================
// Maßstab
// =====================================

L.control.scale(
    {
        imperial: false,
        metric: true
    }
).addTo(map);

// =====================================
// Marker und Route
// =====================================

let startMarker = null;
let landingMarker = null;
let routeLine = null;

// =====================================
// Startmarker
// =====================================

function setStartMarker(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {
        return;
    }

    if (startMarker) {
        map.removeLayer(startMarker);
    }

    startMarker = L.marker(
        [latitude, longitude]
    )
        .addTo(map)
        .bindPopup("🎈 Startpunkt");

    map.setView(
        [latitude, longitude],
        13
    );
}

// =====================================
// Landemarker
// =====================================

function setLandingMarker(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
    ) {
        return;
    }

    if (landingMarker) {
        map.removeLayer(landingMarker);
    }

    landingMarker = L.marker(
        [latitude, longitude]
    )
        .addTo(map)
        .bindPopup("🏁 Landepunkt");
}

// =====================================
// Flugroute darstellen
// =====================================

function zeichneTrack(trackpunkte) {
    if (!Array.isArray(trackpunkte)) {
        return;
    }

    const route = trackpunkte
        .map(
            function (punkt) {
                return [
                    Number(punkt.lat),
                    Number(punkt.lng)
                ];
            }
        )
        .filter(
            function (koordinaten) {
                return (
                    Number.isFinite(koordinaten[0]) &&
                    Number.isFinite(koordinaten[1])
                );
            }
        );

    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }

    if (route.length < 2) {
        return;
    }

    routeLine = L.polyline(
        route,
        {
            color: "#2563eb",
            weight: 5,
            opacity: 0.9,
            lineCap: "round",
            lineJoin: "round"
        }
    ).addTo(map);

    const bounds = routeLine.getBounds();

    if (bounds.isValid()) {
        map.fitBounds(
            bounds,
            {
                padding: [30, 30],
                maxZoom: 15
            }
        );
    }
}

// =====================================
// Route löschen
// =====================================

function routeLoeschen() {
    if (!routeLine) {
        return;
    }

    map.removeLayer(routeLine);
    routeLine = null;
}

// =====================================
// Marker löschen
// =====================================

function markerLoeschen() {
    if (startMarker) {
        map.removeLayer(startMarker);
        startMarker = null;
    }

    if (landingMarker) {
        map.removeLayer(landingMarker);
        landingMarker = null;
    }
}

// =====================================
// Karte zurücksetzen
// =====================================

function karteZuruecksetzen() {
    markerLoeschen();
    routeLoeschen();

    map.setView(
        [47.05, 15.43],
        8
    );
}

// =====================================
// Gespeicherten Flug anzeigen
// =====================================

function flugAufKarte(track) {
    if (
        !Array.isArray(track) ||
        track.length === 0
    ) {
        return;
    }

    karteZuruecksetzen();

    const gueltigePunkte = track.filter(
        function (punkt) {
            return (
                Number.isFinite(Number(punkt.lat)) &&
                Number.isFinite(Number(punkt.lng))
            );
        }
    );

    if (gueltigePunkte.length === 0) {
        return;
    }

    const start = gueltigePunkte[0];

    const ende =
        gueltigePunkte[
            gueltigePunkte.length - 1
        ];

    setStartMarker(
        start.lat,
        start.lng
    );

    setLandingMarker(
        ende.lat,
        ende.lng
    );

    zeichneTrack(gueltigePunkte);

    /*
     * Leaflet benötigt nach Größenänderungen manchmal
     * eine erneute Berechnung der Kartengröße.
     */
    window.setTimeout(
        function () {
            map.invalidateSize();
        },
        100
    );
}

// =====================================
// Kartengröße korrigieren
// =====================================

window.addEventListener(
    "resize",
    function () {
        map.invalidateSize();
    }
);

window.setTimeout(
    function () {
        map.invalidateSize();
    },
    250
);
