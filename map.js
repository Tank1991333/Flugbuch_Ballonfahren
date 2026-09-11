// =====================================
// Kartenlayer
// =====================================

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

// =====================================
// Karte initialisieren
// =====================================

const map = L.map("map", {
  center: [47.285, 15.98],
  zoom: 10,
  layers: [osm]
});

// =====================================
// Kartenumschalter
// =====================================

const baseMaps = {
  "🗺 Standard": osm,
  "🛰 Satellit": satellite
};

L.control.layers(baseMaps).addTo(map);

// =====================================
// Marker
// =====================================

let startMarker = null;
let landeMarker = null;
let routeLine = null;

// =====================================
// Startmarker
// =====================================

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
  .bindPopup("🎈 Startpunkt");

  map.setView(
    [lat, lng],
    13
  );

  zeichneRoute();
}

// =====================================
// Landemarker
// =====================================

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
  .bindPopup("🏁 Landepunkt");

  zeichneRoute();
}

// =====================================
// Flugroute zeichnen
// =====================================

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
      color: "#16a34a",
      weight: 5,
      opacity: 0.9
    }

  ).addTo(map);

  map.fitBounds(
    routeLine.getBounds(),
    {
      padding: [50, 50]
    }
  );
}

// =====================================
// Flugroute aus Trackpunkten
// =====================================

function zeichneTrack(trackpunkte) {

  if (!trackpunkte || trackpunkte.length < 2) {
    return;
  }

  if (routeLine) {
    map.removeLayer(routeLine);
  }

  const punkte = trackpunkte.map(

    p => [
      p.lat,
      p.lng
    ]

  );

  routeLine = L.polyline(
    punkte,
    {
      color: "#2563eb",
      weight: 4,
      opacity: 0.9
    }
  ).addTo(map);

  map.fitBounds(
    routeLine.getBounds(),
    {
      padding: [40, 40]
    }
  );
}

// =====================================
// Luftlinie berechnen
// =====================================

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

// =====================================
// Trackpunkte-Strecke
// =====================================

function berechneTrackStrecke(trackpunkte) {

  if (
    !trackpunkte ||
    trackpunkte.length < 2
  ) {
    return 0;
  }

  let kilometer = 0;

  for (
    let i = 1;
    i < trackpunkte.length;
    i++
  ) {

    const p1 =
      trackpunkte[i - 1];

    const p2 =
      trackpunkte[i];

    kilometer +=
      entfernung(
        p1.lat,
        p1.lng,
        p2.lat,
        p2.lng
      );

  }

  return kilometer.toFixed(1);

}
