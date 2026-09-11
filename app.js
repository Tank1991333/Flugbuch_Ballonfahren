let fluege =
JSON.parse(
localStorage.getItem("fluege")
) || [];

let aktuellerFlug = null;

let trackpunkte = [];

let watchId = null;

anzeigeAktualisieren();

async function ortName(lat, lng) {

    try {

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
            data.address.hamlet ||
            "Unbekannt"
        );

    } catch {

        return "Unbekannt";

    }

}

function flugStarten() {

    navigator.geolocation.getCurrentPosition(

        async function(pos){

            const ort =
            await ortName(
                pos.coords.latitude,
                pos.coords.longitude
            );

            aktuellerFlug = {

                datum:
                new Date().toLocaleDateString(),

                pilot:
                document.getElementById("pilot").value,

                ballon:
                document.getElementById("ballon").value,

                startzeit:
                new Date(),

                startLat:
                pos.coords.latitude,

                startLng:
                pos.coords.longitude,

                startOrt:
                ort

            };

            trackpunkte = [];

            watchId =
            navigator.geolocation.watchPosition(

                function(position){

                    trackpunkte.push({

                        lat:
                        position.coords.latitude,

                        lng:
                        position.coords.longitude,

                        hoehe:
                        position.coords.altitude || 0,

                        zeit:
                        new Date()

                    });

                },

                function(error){

                    console.log(error);

                },

                {
                    enableHighAccuracy:true,
                    maximumAge:0,
                    timeout:5000
                }

            );

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

        alert(
            "Bitte zuerst starten"
        );

        return;

    }

    if(watchId){

        navigator.geolocation.clearWatch(
            watchId
        );

        watchId = null;

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

    if(
        !aktuellerFlug ||
        !aktuellerFlug.endezeit
    ){

        alert(
            "Bitte Fahrt zuerst beenden"
        );

        return;

    }

    let minuten = Math.round(

        (
            aktuellerFlug.endezeit -
            aktuellerFlug.startzeit
        )

        /1000/60

    );

    aktuellerFlug.flugzeit =
    minuten;

    aktuellerFlug.track =
    trackpunkte;

    const hoehen =

    trackpunkte

    .map(p => p.hoehe)

    .filter(h => h > 0);

    if(hoehen.length > 0){

        aktuellerFlug.maxHoehe =
        Math.round(
            Math.max(...hoehen)
        );

        aktuellerFlug.minHoehe =
        Math.round(
            Math.min(...hoehen)
        );

        aktuellerFlug.avgHoehe =
        Math.round(

            hoehen.reduce(
                (a,b)=>a+b,
                0
            )

            /

            hoehen.length

        );

    }
    else{

        aktuellerFlug.maxHoehe = 0;
        aktuellerFlug.minHoehe = 0;
        aktuellerFlug.avgHoehe = 0;

    }

    aktuellerFlug.landungen =
    Number(
        document.getElementById(
            "landungen"
        ).value
    );

    aktuellerFlug.bemerkung =
    document.getElementById(
        "bemerkung"
    ).value;

    fluege.push(
        aktuellerFlug
    );

    localStorage.setItem(
        "fluege",
        JSON.stringify(fluege)
    );

    aktuellerFlug = null;

    document.getElementById(
        "status"
    ).innerHTML =
    "Kein Flug aktiv";

    document.getElementById(
        "bemerkung"
    ).value = "";

    document.getElementById(
        "landungen"
    ).value = 1;

    anzeigeAktualisieren();

}

function loeschen(index){

    if(
        confirm(
            "Flug wirklich löschen?"
        )
    ){

        fluege.splice(
            index,
            1
        );

        localStorage.setItem(
            "fluege",
            JSON.stringify(fluege)
        );

        anzeigeAktualisieren();

    }

}

function anzeigeAktualisieren(){

    let html = "";

    let gesamtZeit = 0;

    let gesamtLandungen = 0;

    fluege.forEach(

        (flug,index)=>{

            gesamtZeit +=
            flug.flugzeit;

            gesamtLandungen +=
            flug.landungen;

            let stunden =
            Math.floor(
                flug.flugzeit / 60
            );

            let minuten =
            flug.flugzeit % 60;

            html += `

            <div class="flight">

            <b>${flug.datum}</b>

            <br><br>

            👨‍✈️ ${flug.pilot}

            <br>

            🎈 ${flug.ballon}

            <br>

            📍 ${flug.startOrt}

            →

            ${flug.landeOrt}

            <br>

            ⏱ ${stunden}h ${minuten}min

            <br>

            🛬 ${flug.landungen}

            <br>

            📈 Max Höhe:
            ${flug.maxHoehe} m

            <br>

            📉 Min Höhe:
            ${flug.minHoehe} m

            <br>

            📊 Durchschnitt:
            ${flug.avgHoehe} m

            <br>

            📝 ${flug.bemerkung}

            <br><br>

            <button
            class="delete"
            onclick="loeschen(${index})">

            Löschen

            </button>

            </div>

            `;

        }

    );

    document.getElementById(
        "flugliste"
    ).innerHTML = html;

    document.getElementById(
        "countFlights"
    ).innerHTML =
    fluege.length;

    document.getElementById(
        "countLandings"
    ).innerHTML =
    gesamtLandungen;

    let h =
    Math.floor(
        gesamtZeit/60
    );

    let m =
    gesamtZeit%60;

    document.getElementById(
        "countMinutes"
    ).innerHTML =
    h + "h " + m + "m";

}
