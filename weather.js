async function ladeWetter() {

    if (!navigator.geolocation) {

        document.getElementById(
            "weatherRating"
        ).innerHTML =
        "❌ GPS nicht verfügbar";

        return;
    }

    navigator.geolocation.getCurrentPosition(

        async function(position) {

            const lat =
            position.coords.latitude;

            const lon =
            position.coords.longitude;

            try {

                const response =
                await fetch(

                    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=auto`

                );

                const data =
                await response.json();

                const temperatur =
                data.current.temperature_2m;

                const luftfeuchte =
                data.current.relative_humidity_2m;

                const wind =
                data.current.wind_speed_10m;

                const richtung =
                data.current.wind_direction_10m;

                const druck =
                data.current.surface_pressure;

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
                `🧭 Windrichtung: ${richtung}° (${windRichtungText(richtung)})`;

                document.getElementById(
                    "sunrise"
                ).innerHTML =

                "🌅 Sonnenaufgang: " +

                new Date(
                    data.daily.sunrise[0]
                ).toLocaleTimeString(
                    "de-DE",
                    {
                        hour:"2-digit",
                        minute:"2-digit"
                    }
                );

                document.getElementById(
                    "sunset"
                ).innerHTML =

                "🌇 Sonnenuntergang: " +

                new Date(
                    data.daily.sunset[0]
                ).toLocaleTimeString(
                    "de-DE",
                    {
                        hour:"2-digit",
                        minute:"2-digit"
                    }
                );

                let bewertung = "";
                let klasse = "";

                if (wind <= 10) {

                    bewertung =
                    "🟢 Sehr gute Bedingungen für Ballonfahrten";

                    klasse =
                    "weather-good";

                } else if (wind <= 20) {

                    bewertung =
                    "🟡 Erhöhte Aufmerksamkeit empfohlen";

                    klasse =
                    "weather-warning";

                } else {

                    bewertung =
                    "🔴 Ballonfahrt derzeit nicht empfohlen";

                    klasse =
                    "weather-danger";

                }

                document.getElementById(
                    "weatherRating"
                ).innerHTML =

                `
                <strong>${bewertung}</strong>
                <br>
                Luftfeuchtigkeit:
                ${luftfeuchte}%<br>

                Luftdruck:
                ${druck} hPa
                `;

                document.getElementById(
                    "weatherRating"
                ).className =
                `weather-rating ${klasse}`;

            }

            catch (error) {

                console.error(error);

                document.getElementById(
                    "weatherRating"
                ).innerHTML =

                "❌ Wetterdaten konnten nicht geladen werden.";

            }

        }

    );

}

function windRichtungText(deg){

    if(deg >= 337.5 || deg < 22.5)
        return "N";

    if(deg < 67.5)
        return "NO";

    if(deg < 112.5)
        return "O";

    if(deg < 157.5)
        return "SO";

    if(deg < 202.5)
        return "S";

    if(deg < 247.5)
        return "SW";

    if(deg < 292.5)
        return "W";

    return "NW";
}

document.addEventListener(
    "DOMContentLoaded",
    ladeWetter
);
