"use strict";

let map = null;
let startMarker = null;
let landingMarker = null;
let routeLine = null;
let allFlightsLayer = null;

function initMap() {
    const mapElement = document.getElementById("map");

    if (
        typeof L === "undefined" ||
        !mapElement
    ) {
        return;
    }

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

    map = L.map(
        "map",
        {
            center: [47.05, 15.43],
            zoom: 8,
            layers: [satellite],
            zoomControl: true
        }
    );

    L.control.layers(
        {
            "Satellit": satellite,
            "Standard": osm
        }
    ).addTo(map);

    L.control.scale(
        {
            imperial: false,
            metric: true
        }
    ).addTo(map);

    allFlightsLayer =
        L.layerGroup().addTo(map);

    window.setTimeout(
        function () {
            map.invalidateSize();
        },
        250
    );
}

function validPoint(point) {
    return (
        point &&
        Number.isFinite(Number(point.lat)) &&
        Number.isFinite(Number(point.lng))
    );
}

function clearCurrent() {
    if (!map) {
        return;
    }

    if (startMarker) {
        map.removeLayer(startMarker);
        startMarker = null;
    }

    if (landingMarker) {
        map.removeLayer(landingMarker);
        landingMarker = null;
    }

    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }
}

function setStartMarker(lat, lng) {
    if (!map) {
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

    if (startMarker) {
        map.removeLayer(startMarker);
    }

    startMarker = L.circleMarker(
        [latitude, longitude],
        {
            radius: 8,
            color: "#ffffff",
            weight: 2,
            fillColor: "#35d65f",
            fillOpacity: 1
        }
    )
        .addTo(map)
        .bindPopup("Start");

    map.setView(
        [latitude, longitude],
        13
    );
}

function setLandingMarker(lat, lng) {
    if (!map) {
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

    if (landingMarker) {
        map.removeLayer(landingMarker);
    }

    landingMarker = L.circleMarker(
        [latitude, longitude],
        {
            radius: 8,
            color: "#ffffff",
            weight: 2,
            fillColor: "#ff574f",
            fillOpacity: 1
        }
    )
        .addTo(map)
        .bindPopup("Landung");
}

function zeichneTrack(track) {
    if (!map || !Array.isArray(track)) {
        return;
    }

    const points = track
        .filter(validPoint)
        .map(function (point) {
            return [
                Number(point.lat),
                Number(point.lng)
            ];
        });

    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }

    if (points.length < 2) {
        return;
    }

    routeLine = L.polyline(
        points,
        {
            color: "#16a4ff",
            weight: 4,
            opacity: 0.9,
            lineCap: "round",
            lineJoin: "round"
        }
    ).addTo(map);

    const bounds =
        routeLine.getBounds();

    if (bounds.isValid()) {
        map.fitBounds(
            bounds,
            {
                padding: [25, 25],
                maxZoom: 15
            }
        );
    }
}

function flugAufKarte(track) {
    if (!Array.isArray(track)) {
        return;
    }

    const points =
        track.filter(validPoint);

    if (points.length === 0) {
        return;
    }

    clearCurrent();

    const start = points[0];
    const landing =
        points[points.length - 1];

    setStartMarker(
        Number(start.lat),
        Number(start.lng)
    );

    setLandingMarker(
        Number(landing.lat),
        Number(landing.lng)
    );

    zeichneTrack(points);

    const mapSection =
        document.getElementById("karte");

    if (mapSection) {
        mapSection.scrollIntoView(
            {
                behavior: "smooth",
                block: "center"
            }
        );
    }
}

function karteZuruecksetzen() {
    if (!map) {
        return;
    }

    clearCurrent();

    map.setView(
        [47.05, 15.43],
        8
    );
}

function alleFluegeAufKarte(flights) {
    if (
        !map ||
        !allFlightsLayer
    ) {
        return;
    }

    allFlightsLayer.clearLayers();

    const bounds = [];

    (Array.isArray(flights) ? flights : [])
        .forEach(function (flight) {
            const points = (
                Array.isArray(flight.track)
                    ? flight.track
                    : []
            )
                .filter(validPoint)
                .map(function (point) {
                    return [
                        Number(point.lat),
                        Number(point.lng)
                    ];
                });

            if (points.length < 2) {
                return;
            }

            L.polyline(
                points,
                {
                    color: "#1da7ff",
                    weight: 2,
                    opacity: 0.65
                }
            ).addTo(allFlightsLayer);

            L.circleMarker(
                points[0],
                {
                    radius: 5,
                    fillColor: "#4ee069",
                    fillOpacity: 1,
                    color: "#ffffff",
                    weight: 1
                }
            ).addTo(allFlightsLayer);

            L.circleMarker(
                points[points.length - 1],
                {
                    radius: 5,
                    fillColor: "#ff594f",
                    fillOpacity: 1,
                    color: "#ffffff",
                    weight: 1
                }
            ).addTo(allFlightsLayer);

            bounds.push(...points);
        });

    if (bounds.length > 0) {
        map.fitBounds(
            bounds,
            {
                padding: [20, 20],
                maxZoom: 11
            }
        );
    }
}

document.addEventListener(
    "DOMContentLoaded",
    initMap
);

window.addEventListener(
    "resize",
    function () {
        if (map) {
            map.invalidateSize();
        }
    }
);
