
function wetterLaden(){

navigator.geolocation.getCurrentPosition(

function(pos){

fetch(
`https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&current=temperature_2m,wind_speed_10m`
)

.then(r=>r.json())

.then(data=>{

document.getElementById(
"temperature"
).innerHTML =
"🌡 Temperatur: "
+
data.current.temperature_2m
+
" °C";

document.getElementById(
"wind"
).innerHTML =
"💨 Wind: "
+
data.current.wind_speed_10m
+
" km/h";

});

}

);

}

wetterLaden();
