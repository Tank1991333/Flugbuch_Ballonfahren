// =====================================
// weather.js
// Ballonflugbuch Professional
// =====================================

function windrichtungText(grad) {

    if (grad >= 337.5 || grad < 22.5) {
        return "N";
    }

    if (grad >= 22.5 && grad < 67.5) {
        return "NO";
    }

    if (grad >= 67.5 && grad < 112.5) {
        return "O";
    }

    if (grad >= 112.5 && grad < 157.5) {
        return "SO";
    }

    if (grad >= 157.5 && grad < 202.5) {
        return "S";
    }

    if (grad >= 202.5 && grad < 247.5) {
        return "SW";
    }

    if (grad >= 247.5 && grad < 292.5) {
        return "W";
    }

    return "NW";

}

// =====================================
// Wetterbewertung
// =====================================

function wetterBewertung(wind) {

    const feld =
        document.getElementById(
            "weatherRating"
        );

    if (!feld) {
        return;
    }

    if (wind <= 10) {

        feld.innerHTML =
            "🟢 Gute Bedingungen für Ballonfahrten";

        feld.style.background =
            "#16a34a";

        feld.style.color =
            "#ffffff";

        return;
    }

    if (wind <= 20) {

        feld.innerHTML =
            "🟡 Bedingungen eingeschränkt - Wetter prüfen";

        feld.style.background =
            "#facc15";

        feld.style.color =
            "#000000";

        return;
    }

    feld.innerHTML =
        "🔴 Ballonfahrt nicht empfohlen - Wind zu stark";

    feld.style.background =
        "#dc2626";

    feld.style.color =
        "#ffffff";

}

// =====================================
// Wetter laden
// =====================================

async function wetterLaden() {

    if (!navigator.geolocation) {

        console.log(
            "Geolocation nicht verfügbar"
        );

        return;
    }

    navigator.geolocation.getCurrentPosition(

        async function(position) {

            try {

                const lat =
                    position.coords.latitude;

                const lon =
                    position.coords.longitude;

                const response =
                    await fetch(

                        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=auto`

                    );

                const data =
                    await response.json();

                const temperatur =
                    data.current.temperature_2m;

                const wind =
                    data.current.wind_speed_10m;

                const windrichtung =
                    data.current.wind_direction_10m;

                const sunrise =
                    new Date(
                        data.daily.sunrise[0]
                    ).toLocaleTimeString(
                        "de-DE",
                        {
                            hour: "2-digit",
                            minute: "2-digit"
                        }
                    );

                const sunset =
                    new Date(
                        data.daily.sunset[0]
                    ).toLocaleTimeString(
                        "de-DE",
                        {
                            hour: "2-digit",
                            minute: "2-digit"
                        }
                    );

                document.getElementById(
                    "temperature"
                ).innerHTML =
                    `🌡 Temperatur: ${temperatur} °C`;

                document.getElementById(
                    "wind"
                ).innerHTML =
                    `💨 Wind: ${wind} km/h`;

                document.getElementById(
                    "windDirection"
                ).innerHTML =
                    `🧭 Windrichtung: ${windrichtungText(windrichtung)} (${Math.round(windrichtung)}°)`;

                document.getElementById(
                    "sunrise"
                ).innerHTML =
                    `🌅 Sonnenaufgang: ${sunrise}`;

                document.getElementById(
                    "sunset"
                ).innerHTML =
                    `🌇 Sonnenuntergang: ${sunset}`;

                wetterBewertung(
                    wind
                );

            }
            catch(error) {

                console.error(
                    "Wetterfehler:",
                    error
                );

                const feld =
                    document.getElementById(
                        "weatherRating"
                    );

                if(feld){

                    feld.innerHTML =
                        "❌ Wetterdaten konnten nicht geladen werden";

                    feld.style.background =
                        "#dc2626";

                    feld.style.color =
                        "#ffffff";
                }

            }

        },

        function(error){

            console.error(
                "GPS Fehler:",
                error
            );

            const feld =
                document.getElementById(
                    "weatherRating"
                );

            if(feld){

                feld.innerHTML =
                    "❌ Standort nicht verfügbar";

                feld.style.background =
                    "#dc2626";

                feld.style.color =
                    "#ffffff";
            }

        },

        {
            enableHighAccuracy:true,
            timeout:10000,
            maximumAge:60000
        }

    );

}

// =====================================
// Initialisierung
// =====================================

document.addEventListener(

    "DOMContentLoaded",

    function(){

        wetterLaden();

        setInterval(
            wetterLaden,
            600000
        );

    }

);
