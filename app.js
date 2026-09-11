// ===== Datenspeicher =====

let fluege =
JSON.parse(localStorage.getItem("fluege")) || [];

let aktuellerFlug = null;
let trackpunkte = [];
let watchId = null;

// ===== Initialisierung =====

document.addEventListener("DOMContentLoaded", () => {
    anzeigeAktualisieren();
});

// ===== Ortsname ermitteln =====

async function ortName(lat, lng) {

    try {

        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
        );

        const data = await response.json();

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

// ===== Entfernung berechnen =====

function entfernung(lat1, lon1, lat2, lon2) {

    const R = 6371;

    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    const a =

        Math.sin(dLat / 2) *
        Math.sin(dLat / 2)

        +

        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *

        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    return R * c;

}

// ===== Flug starten =====

function flugStarten() {

    const pilot =
    document.getElementById("pilot").value.trim();

    const ballon =
    document.getElementById("ballon").value.trim();

    if (!pilot) {
        alert("Bitte Pilot eingeben");
        return;
    }

    if (!ballon) {
        alert("Bitte Ballon Kennzeichen eingeben");
        return;
    }

    if (!navigator.geolocation) {
        alert("GPS nicht verfügbar");
        return;
    }

    navigator.geolocation.getCurrentPosition(

        async (position) => {

            const lat =
            position.coords.latitude;

            const lng =
            position.coords.longitude;

            const ort =
            await ortName(lat, lng);

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
                lat,

                startLng:
                lng

            };

            trackpunkte = [];

            setStartMarker(lat, lng);

            document.getElementById("status")
            .innerHTML =
            "🟢 Flug läuft";

            watchId =
            navigator.geolocation.watchPosition(

                (position) => {

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

                    trackpunkte.push(punkt);

                    addTrackPoint(
                        punkt.lat,
                        punkt.lng
                    );

                },

                (error) => {
                    console.log(error);
                },

                {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 5000
                }

            );

        }

    );

}

// ===== Flug beenden =====

function flugBeenden() {

    if (!aktuellerFlug) {

        alert("Kein Flug aktiv");

        return;

    }

    if (watchId) {

        navigator.geolocation.clearWatch(watchId);

        watchId = null;

    }

    navigator.geolocation.getCurrentPosition(

        async (position) => {

            const lat =
            position.coords.latitude;

            const lng =
            position.coords.longitude;

            aktuellerFlug.endezeit =
            new Date();

            aktuellerFlug.landeLat =
            lat;

            aktuellerFlug.landeLng =
            lng;

            aktuellerFlug.landeOrt =
            await ortName(lat, lng);

            setLandingMarker(lat, lng);

            document.getElementById("status")
            .innerHTML =
            "🟡 Flug beendet";

        }

    );

}

// ===== Flug speichern =====

function flugSpeichern() {

    if (
        !aktuellerFlug ||
        !aktuellerFlug.endezeit
    ) {

        alert(
            "Bitte Flug zuerst beenden"
        );

        return;

    }

    aktuellerFlug.flugzeit =
    Math.round(
        (
            aktuellerFlug.endezeit -
            aktuellerFlug.startzeit
        ) / 1000 / 60
    );

    aktuellerFlug.track =
    trackpunkte;

    const hoehen =

    trackpunkte
    .map(p => p.hoehe)
    .filter(h => h > 0);

    aktuellerFlug.maxHoehe =
    hoehen.length
        ? Math.round(Math.max(...hoehen))
        : 0;

    aktuellerFlug.minHoehe =
    hoehen.length
        ? Math.round(Math.min(...hoehen))
        : 0;

    aktuellerFlug.avgHoehe =
    hoehen.length
        ? Math.round(
            hoehen.reduce(
                (a, b) => a + b,
                0
            ) / hoehen.length
        )
        : 0;

    const speeds =

    trackpunkte
    .map(p => p.speed)
    .filter(s => s > 0);

    aktuellerFlug.avgSpeed =
    speeds.length
        ? Math.round(
            (
                speeds.reduce(
                    (a, b) => a + b,
                    0
                ) / speeds.length
            ) * 3.6
        )
        : 0;

    let strecke = 0;

    for (
        let i = 1;
        i < trackpunkte.length;
        i++
    ) {

        strecke += entfernung(

            trackpunkte[i - 1].lat,
            trackpunkte[i - 1].lng,

            trackpunkte[i].lat,
            trackpunkte[i].lng

        );

    }

    aktuellerFlug.strecke =
    strecke.toFixed(1);

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

    fluege.push(aktuellerFlug);

    localStorage.setItem(
        "fluege",
        JSON.stringify(fluege)
    );

    aktuellerFlug = null;

    document.getElementById("status")
    .innerHTML =
    "⚪ Kein Flug aktiv";

    anzeigeAktualisieren();

}

// ===== Flug löschen =====

function loeschen(index) {

    if (
        !confirm(
            "Flug wirklich löschen?"
        )
    ) {
        return;
    }

    fluege.splice(index, 1);

    localStorage.setItem(
        "fluege",
        JSON.stringify(fluege)
    );

    anzeigeAktualisieren();

}

// ===== Dashboard aktualisieren =====

function anzeigeAktualisieren() {

    let html = "";

    let gesamtZeit = 0;

    let gesamtLandungen = 0;

    fluege.forEach((flug, index) => {

        gesamtZeit +=
        flug.flugzeit || 0;

        gesamtLandungen +=
        flug.landungen || 0;

        html += `

        <div class="flight">

            <strong>
            ${flug.datum}
            </strong>

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

            🛬 ${flug.landungen}<br>

            📝 ${flug.bemerkung}<br><br>

            <button
            onclick="loeschen(${index})">
            Löschen
            </button>

        </div>

        `;
    });

    document.getElementById(
        "flugliste"
    ).innerHTML = html;

    document.getElementById(
        "countFlights"
    ).textContent =
    fluege.length;

    document.getElementById(
        "countLandings"
    ).textContent =
    gesamtLandungen;

    const h =
    Math.floor(gesamtZeit / 60);

    const m =
    gesamtZeit % 60;

    document.getElementById(
        "countMinutes"
    ).textContent =
    `${h}h ${m}m`;

}
