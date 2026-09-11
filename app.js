
let fluege =
JSON.parse(
localStorage.getItem("fluege")
) || [];

let aktuellerFlug = null;

anzeigeAktualisieren();

async function ortName(lat,lng){

try{

const response =
await fetch(
`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
);

const data =
await response.json();

return (
data.address.city ||
data.address.town ||
data.address.village ||
"Unbekannt"
);

}
catch{

return "Unbekannt";

}

}

function flugStarten(){

navigator.geolocation.getCurrentPosition(

async function(pos){

const ort =
await ortName(
pos.coords.latitude,
pos.coords.longitude
);

aktuellerFlug = {

datum:new Date().toLocaleDateString(),

pilot:
document.getElementById("pilot").value,

ballon:
document.getElementById("ballon").value,

startzeit:new Date(),

startLat:pos.coords.latitude,

startLng:pos.coords.longitude,

startOrt:ort

};

setStartMarker(
pos.coords.latitude,
pos.coords.longitude
);

document.getElementById("status")
.innerHTML =
"✅ Fahrt läuft";

}

);

}

function flugBeenden(){

if(!aktuellerFlug){

alert("Bitte zuerst starten");

return;

}

navigator.geolocation.getCurrentPosition(

async function(pos){

const ort =
await ortName(
pos.coords.latitude,
pos.coords.longitude
);

aktuellerFlug.endezeit =
new Date();

aktuellerFlug.landeLat =
pos.coords.latitude;

aktuellerFlug.landeLng =
pos.coords.longitude;

aktuellerFlug.landeOrt =
ort;

setLandingMarker(
pos.coords.latitude,
pos.coords.longitude
);

document.getElementById("status")
.innerHTML =
"✅ Fahrt beendet";

}

);

}

function flugSpeichern(){

if(!aktuellerFlug ||
!aktuellerFlug.endezeit){

alert("Bitte Fahrt zuerst beenden");

return;

}

let minuten = Math.round(
(
aktuellerFlug.endezeit -
aktuellerFlug.startzeit
)/1000/60
);

aktuellerFlug.flugzeit =
minuten;

aktuellerFlug.landungen =
Number(
document.getElementById("landungen").value
);

aktuellerFlug.bemerkung =
document.getElementById("bemerkung").value;

fluege.push(aktuellerFlug);

localStorage.setItem(
"fluege",
JSON.stringify(fluege)
);

aktuellerFlug = null;

anzeigeAktualisieren();

}

function loeschen(index){

fluege.splice(index,1);

localStorage.setItem(
"fluege",
JSON.stringify(fluege)
);

anzeigeAktualisieren();

}

function anzeigeAktualisieren(){

let html = "";

let gesamtZeit = 0;

let gesamtLandungen = 0;

fluege.forEach((flug,index)=>{

gesamtZeit += flug.flugzeit;

gesamtLandungen += flug.landungen;

let h =
Math.floor(
flug.flugzeit/60
);

let m =
flug.flugzeit%60;

html += `

<div class="flight">

<b>${flug.datum}</b><br><br>

👨‍✈️ ${flug.pilot}<br>

🎈 ${flug.ballon}<br>

📍 ${flug.startOrt}
→
${flug.landeOrt}<br>

⏱ ${h}h ${m}min<br>

🛬 ${flug.landungen}<br>

📝 ${flug.bemerkung}<br>

<button
class="delete"
onclick="loeschen(${index})">

Löschen

</button>

</div>

`;

});

document.getElementById("flugliste").innerHTML =
html;

document.getElementById("countFlights").innerHTML =
fluege.length;

document.getElementById("countLandings").innerHTML =
gesamtLandungen;

let h =
Math.floor(gesamtZeit/60);

let m =
gesamtZeit%60;

document.getElementById("countMinutes").innerHTML =
h + "h " + m + "m";

}
