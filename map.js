// ------------------------
// Kartenlayer
// ------------------------

const osm = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    attribution: '© OpenStreetMap'
  }
);

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    attribution: '© Esri'
  }
);

// Ortsnamen / Beschriftungen
const labels = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    opacity: 0.35
  }
);

// Satellit + Beschriftungen
const satelliteLabels = L.layerGroup([
  satellite,
  labels
]);

// ------------------------
// Karte erstellen
// ------------------------

const map = L.map('map', {
  center: [47.285, 15.98],
  zoom: 10,
  layers: [osm]
});

// Umschalter oben rechts

L.control.layers({

  "🗺 Standard": osm,

  "🛰 Satellit": satellite,

  "🛰 Satellit + Orte": satelliteLabels

}).addTo(map);

// ------------------------
// Marker
// ------------------------

let startMarker = null;
let landeMarker = null;
let routeLine = null;

// ------------------------
// Startmarker
// ------------------------

function setStartMarker(lat, lng) {

  if (startMarker) {
    map.removeLayer(startMarker);
  }

  startMarker = L.marker([lat, lng])
    .addTo(map)
    .bindPopup("🎈 Startpunkt");

  map.setView([lat, lng], 13);

  zeichneRoute();

}

// ------------------------
// LandeMarker
// ------------------------

function setLandingMarker(lat, lng) {

  if (landeMarker) {
    map.removeLayer(landeMarker);
  }

  landeMarker = L.marker([lat, lng])
    .addTo(map)
    .bindPopup("🏁 Landung");

  zeichneRoute();

}

// ------------------------
// Route zeichnen
// ------------------------

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
      color: '#005eff',
      weight: 4
    }
  ).addTo(map);

  map.fitBounds(
    routeLine.getBounds(),
    {
      padding: [50, 50]
    }
  );

}

// ------------------------
// Entfernung berechnen
// ------------------------

function entfernungKm() {

  if (!startMarker || !landeMarker) {
    return 0;
  }

  const start =
    startMarker.getLatLng();

  const ende =
    landeMarker.getLatLng();

  const meter =
    map.distance(
      start,
      ende
    );

  return (meter / 1000).toFixed(1);

}
