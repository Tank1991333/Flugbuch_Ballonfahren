let map;
let routeLine;

let routePoints = [];

let startMarker = null;
let landingMarker = null;

function initMap() {

    map = L.map("map").setView(
        [47.283, 15.967],
        10
    );

    L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution:
                "&copy; OpenStreetMap"
        }
    ).addTo(map);

    routeLine = L.polyline(
        [],
        {
            color: "red",
            weight: 4
        }
    ).addTo(map);

    ladeGespeicherteRoute();

}

function setStartMarker(lat, lng) {

    if (startMarker) {
        map.removeLayer(startMarker);
    }

    startMarker = L.marker(
        [lat, lng]
    )
    .addTo(map)
    .bindPopup("🚀 Start")
    .openPopup();

}

function setLandingMarker(lat, lng) {

    if (landingMarker) {
        map.removeLayer(landingMarker);
    }

    landingMarker = L.marker(
        [lat, lng]
    )
    .addTo(map)
    .bindPopup("🛬 Landung");

}

function addTrackPoint(lat, lng) {

    routePoints.push([
        lat,
        lng
    ]);

    routeLine.setLatLngs(
        routePoints
    );

    map.panTo(
        [lat, lng]
    );

    localStorage.setItem(
        "gpsRoute",
        JSON.stringify(routePoints)
    );

}

function ladeGespeicherteRoute() {

    const gespeicherteRoute =
    JSON.parse(
        localStorage.getItem(
            "gpsRoute"
        )
    ) || [];

    if (
        gespeicherteRoute.length > 0
    ) {

        routePoints =
        gespeicherteRoute;

        routeLine.setLatLngs(
            routePoints
        );

        map.fitBounds(
            routeLine.getBounds()
        );

    }

}

function routeLoeschen() {

    if (
        !confirm(
            "Flugroute löschen?"
        )
    ) {
        return;
    }

    routePoints = [];

    routeLine.setLatLngs([]);

    localStorage.removeItem(
        "gpsRoute"
    );

}

function aktuellePosition() {

    if (
        !navigator.geolocation
    ) {

        alert(
            "GPS nicht verfügbar"
        );

        return;

    }

    navigator.geolocation.getCurrentPosition(

        function(position) {

            const lat =
            position.coords.latitude;

            const lng =
            position.coords.longitude;

            map.setView(
                [lat, lng],
                15
            );

            L.circleMarker(
                [lat, lng],
                {
                    radius: 8,
                    color: "blue"
                }
            )
            .addTo(map)
            .bindPopup(
                "📍 Aktuelle Position"
            );

        }

    );
}

document.addEventListener(
    "DOMContentLoaded",
    initMap
);
