const osm = L.tileLayer(
'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
{
attribution:'© OpenStreetMap'
}
);

const satellite = L.tileLayer(
'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
{
attribution:'© Esri'
}
);

const map = L.map('map', {
center:[47.285,15.98],
zoom:10,
layers:[osm]
});

const baseMaps = {
"🗺 Standard": osm,
"🛰 Satellit": satellite
};

L.control.layers(baseMaps).addTo(map);

let startMarker = null;
let landeMarker = null;

function setStartMarker(lat,lng){

if(startMarker){
map.removeLayer(startMarker);
}

startMarker = L.marker([lat,lng])
.addTo(map)
.bindPopup("🎈 Start");

map.setView([lat,lng],13);

}

function setLandingMarker(lat,lng){

if(landeMarker){
map.removeLayer(landeMarker);
}

landeMarker = L.marker([lat,lng])
.addTo(map)
.bindPopup("🏁 Landung");

}
