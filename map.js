
const map =
L.map("map")
.setView([47.285,15.98],10);

L.tileLayer(
"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
{
attribution:"© OpenStreetMap"
}
).addTo(map);

let startMarker = null;
let landeMarker = null;

function setStartMarker(lat,lng){

if(startMarker){
map.removeLayer(startMarker);
}

startMarker =
L.marker([lat,lng])
.addTo(map);

map.setView([lat,lng],13);

}

function setLandingMarker(lat,lng){

if(landeMarker){
map.removeLayer(landeMarker);
}

landeMarker =
L.marker([lat,lng])
.addTo(map);

}
