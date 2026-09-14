"use strict";

let map;
let startMarker = null;
let landingMarker = null;
let routeLine = null;
let allFlightsLayer = null;

function mapPointValid(point) {
    return (
        point &&
        Number.isFinite(Number(point.lat)) &&
        Number.isFinite(Number(point.lng))
    );
}

function mapInitialisieren() {
    if (
        typeof L === "undefined" ||
        !document.getElementById("map")
    ) {
        return;
    }

    const standardMap = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            maxZoom: 19,
            attribution:
                "&copy; OpenStreetMap-Mitwirkende"
        }
    );

    const satelliteMap = L.tileLayer(
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
            layers: [satelliteMap]
        }
    );

    L.control.layers(
        {
            "🛰 Satellit": satelliteMap,
            "🗺 Standard": standardMap
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

function aktuelleKartenElementeLoeschen() {
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
            fillColor: "#43dd6b",
            fillOpacity: 1
        }
    )
        .addTo(map)
        .bindPopup("🎈 Startpunkt");

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
            fillColor: "#ff625b",
            fillOpacity: 1
        }
    )
        .addTo(map)
        .bindPopup("🏁 Landepunkt");
}

function zeichneTrack(trackpunkte) {
    if (
        !map ||
        !Array.isArray(trackpunkte)
    ) {
        return;
    }

    const route = trackpunkte
        .filter(mapPointValid)
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

    if (route.length < 2) {
        return;
    }

    routeLine = L.polyline(
        route,
        {
            color: "#16a2ff",
            weight: 4,
            opacity: 0.92,
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
        track.filter(mapPointValid);

    if (points.length === 0) {
        return;
    }

    aktuelleKartenElementeLoeschen();

    const firstPoint = points[0];
    const lastPoint =
        points[points.length - 1];

    setStartMarker(
        firstPoint.lat,
        firstPoint.lng
    );

    setLandingMarker(
        lastPoint.lat,
        lastPoint.lng
    );

    zeichneTrack(points);

    document.getElementById("karte")
        ?.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
}

function karteZuruecksetzen() {
    if (!map) {
        return;
    }

    aktuelleKartenElementeLoeschen();

    map.setView(
        [47.05, 15.43],
        8
    );
}

function alleFluegeAufKarte(fluege) {
    if (
        !map ||
        !allFlightsLayer
    ) {
        return;
    }

    allFlightsLayer.clearLayers();

    const allCoordinates = [];

    (Array.isArray(fluege) ? fluege : [])
        .forEach(function (flight) {
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

            if (route.length < 2) {
                return;
            }

            L.polyline(
                route,
                {
                    color: "#149eff",
                    weight: 2,
                    opacity: 0.68
                }
            ).addTo(allFlightsLayer);

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

            allCoordinates.push(...route);
        });

    if (allCoordinates.length > 0) {
        map.fitBounds(
            allCoordinates,
            {
                padding: [20, 20],
                maxZoom: 11
            }
        );
    }
}

document.addEventListener(
    "DOMContentLoaded",
    mapInitialisieren
);

window.addEventListener(
    "resize",
    function () {
        if (map) {
            map.invalidateSize();
        }
    }
);
