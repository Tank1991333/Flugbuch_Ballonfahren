// =====================================
// map.js
// Ballonflugbuch Professional V9
// =====================================

// Kartenlayer

const osm = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    attribution: '&copy; OpenStreetMap'
  }
);

const satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    attribution: '&copy; Esri'
  }
);

// Karte erstellen

const map = L.map('map', {
  center: [47.05, 15.43],
  zoom: 8,
  layers: [osm]
});

// Layer-Auswahl

L.control.layers(
  {
    '🗺 Standard': osm,
    '🛰 Satellit': satellite
  }
).addTo(map);

// Marker und Route

let startMarker = null;
let landingMarker = null;
let routeLine = null;

// Startmarker

function setStartMarker(lat, lng) {

  if (startMarker) {
    map.removeLayer(startMarker);
  }

  startMarker = L.marker([lat, lng])
    .addTo(map)
    .bindPopup('🎈 Startpunkt');

  map.setView([lat, lng], 13);

}

// Landemarker

function setLandingMarker(lat, lng) {

  if (landingMarker) {
    map.removeLayer(landingMarker);
  }

  landingMarker = L.marker([lat, lng])
    .addTo(map)
    .bindPopup('🏁 Landepunkt');

}

// Flugroute darstellen

function zeichneTrack(trackpunkte) {

  if (!trackpunkte || trackpunkte.length < 2) {
    return;
  }

  if (routeLine) {
    map.removeLayer(routeLine);
  }

  const route = trackpunkte.map(function(punkt) {

    return [
      punkt.lat,
      punkt.lng
    ];

  });

  routeLine = L.polyline(
    route,
    {
      color: '#2563eb',
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

// Route löschen

function routeLoeschen() {

  if (routeLine) {

    map.removeLayer(routeLine);

    routeLine = null;

  }

}

// Marker löschen

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

// Karte zurücksetzen

function karteZuruecksetzen() {

  markerLoeschen();

  routeLoeschen();

  map.setView(
    [47.05, 15.43],
    8
  );

}

// Gespeicherten Flug anzeigen

function flugAufKarte(track) {

  if (!track || track.length === 0) {
    return;
  }

  const start = track[0];

  const ende = track[
    track.length - 1
  ];

  setStartMarker(
    start.lat,
    start.lng
  );

  setLandingMarker(
    ende.lat,
    ende.lng
  );

  zeichneTrack(track);

}
