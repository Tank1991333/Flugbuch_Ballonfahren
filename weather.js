async function ladeWetter() {

    const wetterContainer =
    document.getElementById("weather");

    if (!navigator.geolocation) {

        wetterContainer.innerHTML =
        "GPS nicht verfügbar";

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

                let ampel = "🟢";

                if (
                    data.current.wind_speed_10m > 10
                ) {
                    ampel = "🟡";
                }

                if (
                    data.current.wind_speed_10m > 20
                ) {
                    ampel = "🔴";
                }

                wetterContainer.innerHTML = `

                <div class="card">

                    <h2>
                    🌤 Wetter Ballonfahren
                    </h2>

                    <p>
                    ${ampel}
                    </p>

                    <p>
                    🌡 Temperatur:
                    ${data.current.temperature_2m} °C
                    </p>

                    <p>
                    💧 Luftfeuchtigkeit:
                    ${data.current.relative_humidity_2m} %
                    </p>

                    <p>
                    🌬 Wind:
                    ${data.current.wind_speed_10m} km/h
                    </p>

                    <p>
                    🧭 Windrichtung:
                    ${data.current.wind_direction_10m}°
                    </p>

                    <p>
                    📈 Luftdruck:
                    ${data.current.surface_pressure} hPa
                    </p>

                    <p>
                    🌅 Sonnenaufgang:
                    ${new Date(
                        data.daily.sunrise[0]
                    ).toLocaleTimeString("de-DE")}
                    </p>

                    <p>
                    🌇 Sonnenuntergang:
                    ${new Date(
                        data.daily.sunset[0]
                    ).toLocaleTimeString("de-DE")}
                    </p>

                </div>

                `;

            } catch(error) {

                console.log(error);

                wetterContainer.innerHTML =
                "Wetterdaten konnten nicht geladen werden.";

            }

        }

    );

}

ladeWetter();
