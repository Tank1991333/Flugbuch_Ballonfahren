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

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
        );

        const data =
        await response.json();

        return (
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.hamlet ||
            "Unbekannt"
        );

    } catch {

        return "Unbekannt";

    }
}

function entfernung(lat1, lon1, lat2, lon2){

    const R = 6371;

    const dLat =
    (lat2-lat1) * Math.PI/180;

    const dLon =
    (lon2-lon1) * Math.PI/180;

    const a =

    Math.sin(dLat/2) *
    Math.sin(dLat/2)

    +

    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180)

    *

    Math.sin(dLon/2) *
    Math.sin(dLon/2);

    const c =
    2 *
    Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1-a)
    );

    return R * c;
}

function flugStarten(){

    const pilot =
    document.getElementById("pilot").value;

    const ballon =
    document.getElementById("ballon").value;

    if(!pilot){

        alert(
            "Bitte Pilot eingeben"
        );

        return;
    }

    if(!ballon){

        alert(
            "Bitte Ballon eingeben"
        );

        return;
    }

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

                pilot,
                ballon,

                startzeit:
                new Date(),

                startOrt:
                ort,

                startLat:
                pos.coords.latitude,

                startLng:
                pos.coords.longitude

            };

            trackpunkte = [];

            setStartMarker(
                pos.coords.latitude,
                pos.coords.longitude
            );

            watchId =
            navigator.geolocation.watchPosition(

                function(position){

                    const punkt = {

                        lat:
                        position.coords.latitude,

                        lng:
                        position.coords.longitude,

                        hoehe:
                        position.coords.altitude || 0,

                        speed:
                        position.coords.speed || 0,

                        zeit:
                        new Date()

                    };

                    trackpunkte.push(
                        punkt
                    );

                    addTrackPoint(
                        punkt.lat,
                        punkt.lng
                    );

                },

                function(error){

                    console.log(error);

                },

                {
                    enableHighAccuracy:true
                }

            );

            document.getElementById(
                "status"
            ).innerHTML =
            "✅ Fahrt läuft";

        }

    );
}

function flugBeenden(){

    if(!aktuellerFlug){

        alert(
            "Kein Flug aktiv"
        );

        return;
    }

    if(watchId){

        navigator.geolocation.clearWatch(
            watchId
        );

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

            document.getElementById(
                "status"
            ).innerHTML =
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
            "Bitte Flug beenden"
        );

        return;

    }

    aktuellerFlug.track =
    trackpunkte;

    aktuellerFlug.flugzeit =
    Math.round(

        (
            aktuellerFlug.endezeit -
            aktuellerFlug.startzeit
        )

        /1000/60

    );

    const hoehen =

    trackpunkte

    .map(p => p.hoehe)

    .filter(h => h > 0);

    aktuellerFlug.maxHoehe =

    hoehen.length ?

    Math.round(
        Math.max(...hoehen)
    ) : 0;

    aktuellerFlug.minHoehe =

    hoehen.length ?

    Math.round(
        Math.min(...hoehen)
    ) : 0;

    aktuellerFlug.avgHoehe =

    hoehen.length ?

    Math.round(

        hoehen.reduce(
            (a,b)=>a+b,
            0
        )

        /

        hoehen.length

    ) : 0;

    const speeds =

    trackpunkte

    .map(p => p.speed)

    .filter(s => s > 0);

    aktuellerFlug.avgSpeed =

    speeds.length ?

    Math.round(

        (
            speeds.reduce(
                (a,b)=>a+b,
                0
            )

            /

            speeds.length

        )

        * 3.6

    ) : 0;

    let strecke = 0;

    for(
        let i=1;
        i<trackpunkte.length;
        i++
    ){

        strecke +=

        entfernung(

            trackpunkte[i-1].lat,
            trackpunkte[i-1].lng,

            trackpunkte[i].lat,
            trackpunkte[i].lng

        );

    }

    aktuellerFlug.strecke =
    strecke.toFixed(2);

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

    anzeigeAktualisieren();

    document.getElementById(
        "status"
    ).innerHTML =
    "Kein Flug aktiv";
}

function loeschen(index){

    if(
        confirm(
            "Flug löschen?"
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
            flug.flugzeit || 0;

            gesamtLandungen +=
            flug.landungen || 0;

            html += `

            <div class="flight">

            <b>${flug.datum}</b>

            <br><br>

            👨‍✈️ ${flug.pilot}<br>
            🎈 ${flug.ballon}<br>

            📍 ${flug.startOrt}
            → ${flug.landeOrt}<br>

            ⏱ ${flug.flugzeit} Minuten<br>

            🗺 ${flug.strecke} km<br>

            🚀 ${flug.avgSpeed} km/h<br>

            📈 ${flug.maxHoehe} m<br>

            📉 ${flug.minHoehe} m<br>

            📊 ${flug.avgHoehe} m<br>

            📝 ${flug.bemerkung}<br>

            <br>

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

    if(document.getElementById("countFlights"))
        document.getElementById(
            "countFlights"
        ).innerHTML =
        fluege.length;

    if(document.getElementById("countLandings"))
        document.getElementById(
            "countLandings"
        ).innerHTML =
        gesamtLandungen;

    if(document.getElementById("countMinutes")){

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
}
