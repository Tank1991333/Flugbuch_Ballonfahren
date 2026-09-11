const osm = L.tileLayer(
'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
);

const satellite = L.tileLayer(
'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
);

const labels = L.tileLayer(
'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
{
opacity:0.35
}
);

const satelliteWithLabels =
L.layerGroup([
satellite,
labels
]);

const map = L.map('map', {
center:[47.285,15.98],
zoom:10,
layers:[osm]
});

L.control.layers({

"🗺 Standard": osm,

"🛰 Satellit + Orte":
satelliteWithLabels

}).addTo(map);
