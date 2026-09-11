// =====================================
// map.js
// Ballonflugbuch Professional V9
// =====================================

// -------------------------------------
// Kartenlayer
// -------------------------------------

const osm = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: "© OpenStreetMap"
    }
);

const satellite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
        attribution: "© Esri"
    }
);

// -------------------------------------
// Karte erstellen
// -------------------------------------

const map = L.map("map", {
    center: [47.05, 15.43],
    zoom: 8,
    layers: [osm]
});

// -------------------------------------
// Kartenumschalter
// -------------------------------------

const baseMaps = {

    "🗺 Standard": osm,

    "🛰 Satellit": satellite

};

L.control.layers(
    baseMaps
).addTo(map);

// -------------------------------------
// Marker und Routen
// -------------------------------------

let startMarker = null;
let landingMarker = null;
let routeLine = null;

// -------------------------------------
// Startmarker
// -------------------------------------

function setStartMarker(lat, lng) {

    if (startMarker) {
        map.removeLayer(
            startMarker
        );
    }

    const startIcon = L.icon({

        iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",

        shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",

        iconSize: [25, 41],

        iconAnchor: [12, 41]

    });

    startMarker = L.marker(
        [lat, lng],
        {
            icon: startIcon
        }
    )
    .addTo(map)
    .bindPopup(
        "🎈 Startpunkt"
    );

    map.setView(
        [lat, lng],
        13
    );

}

// -------------------------------------
// Landemarker
// -------------------------------------

function setLandingMarker(
    lat,
    lng
) {

    if (landingMarker) {
        map.removeLayer(
            landingMarker
        );
    }

    const landingIcon = L.icon({

        iconUrl:
        "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",

        shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",

        iconSize: [25, 41],

        iconAnchor: [12, 41]

    });

    landingMarker = L.marker(
        [lat, lng],
        {
            icon: landingIcon
        }
    )
    .addTo(map)
    .bindPopup(
        "🏁 Landepunkt"
    );

}

// -------------------------------------
// Flugroute aus Trackpunkten
// -------------------------------------

function zeichneTrack(trackpunkte) {

    if (
        !trackpunkte ||
        trackpunkte.length < 2
    ) {
        return;
    }

    if (routeLine) {

        map.removeLayer(
            routeLine
        );

    }

    const route =

    trackpunkte.map(

        punkt => [

            punkt.lat,

            punkt.lng

        ]

    );

    routeLine = L.polyline(

        route,

        {

            color: "#2563eb",

            weight: 5,

            opacity: 0.9

        }

    ).addTo(map);

    map.fitBounds(

        routeLine.getBounds(),

        {

            padding: [30, 30]

        }

    );

}

// -------------------------------------
// Route löschen
// -------------------------------------

function routeLoeschen() {

    if (routeLine) {

        map.removeLayer(
            routeLine
        );

        routeLine = null;

    }

}

// -------------------------------------
// Marker löschen
// -------------------------------------

function markerLoeschen() {

    if (startMarker) {

        map.removeLayer(
            startMarker
        );

        startMarker = null;

    }

    if (landingMarker) {

        map.removeLayer(
            landingMarker
        );

        landingMarker = null;

    }

}

// -------------------------------------
// Karte zurücksetzen
// -------------------------------------

function karteZuruecksetzen() {

    markerLoeschen();

    routeLoeschen();

    map.setView(

        [47.05, 15.43],

        8

    );

}

// -------------------------------------
// Flug anzeigen
// -------------------------------------

function flugAufKarte
