// ======================
// Kartenlayer
// ======================

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

// Beschriftungen für Hybrid

const labels = L.tileLayer(
  "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  {
    attribution: "© Esri Labels"
  }
);

// Hybrid = Satellit + Beschriftungen

const hybrid = L.layerGroup([
  satellite,
  labels
]);

// ======================
// Karte erzeugen
// ======================

const map = L.map("map", {
  center: [47.285, 15.98],
  zoom: 10,
  layers: [hybrid]
});

// Umschalter

L.control.layers({

  "🗺 Standard": osm,

  "🛰 Hybrid": hybrid,

  "🛰 Satellit": satellite

}).addTo(map);

// ======================
// Marker
// ======================

let startMarker = null;
let landeMarker = null;
let routeLine = null;

// ======================
// Startmarker
// ======================

function setStartMarker(lat, lng) {

  if (startMarker) {
    map.removeLayer(startMarker);
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
  .bindPopup("🎈 Start");

  map.setView([lat, lng], 13);

  zeichneRoute();

}

// ======================
// Landemarker
// ======================

function setLandingMarker(lat, lng) {

  if (landeMarker) {
    map.removeLayer(landeMarker);
  }

  const landingIcon = L.icon({
    iconUrl:
      "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",

    shadowUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",

    iconSize: [25, 41],
    iconAnchor: [12, 41]
  });

  landeMarker = L.marker(
    [lat, lng],
    {
      icon: landingIcon
    }
  )
  .addTo(map)
  .bindPopup("🏁 Landung");

  zeichneRoute();

}

// ======================
// Flugroute
// ======================

function zeichneRoute() {

  if (!startMarker || !landeMarker) {
    return;
  }

  if (routeLine) {
    map.removeLayer(routeLine);
  }

  const start =
    startMarker.getLatLng();

  const ende =
    landeMarker.getLatLng();

  routeLine = L.polyline(

    [
      [start.lat, start.lng],
      [ende.lat, ende.lng]
    ],

    {
      color: "#00a651",
      weight: 5,
      opacity: 0.8
    }

  ).addTo(map);

  map.fitBounds(
    routeLine.getBounds(),
    {
      padding: [50, 50]
    }
  );

}

// ======================
// Entfernung
// ======================

function berechneStrecke() {

  if (
    !startMarker ||
    !landeMarker
  ) {
    return 0;
  }

  const meter =
    map.distance(
      startMarker.getLatLng(),
      landeMarker.getLatLng()
    );

  return (
    meter / 1000
  ).toFixed(1);

}
