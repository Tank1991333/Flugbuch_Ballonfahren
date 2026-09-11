async function ladeWetter() {

    const wetterContainer =
    document.getElementById("weather");

    if (!wetterContainer) {
        return;
    }

    wetterContainer.innerHTML =
    "<p>🌤 Wetter wird geladen...</p>";

    if (!navigator.geolocation) {

        wetterContainer.innerHTML =
        "<p>GPS wird nicht unterstützt.</p>";

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
                let text = "Gute Bedingungen";

                if (
                    data.current.wind_speed_10m > 10
                ) {
                    ampel = "🟡";
                    text = "Vorsicht";
                }

                if (
                    data.current.wind_speed_10m > 20
                ) {
                    ampel = "🔴";
                    text = "Nicht empfohlen";
                }

                wetterContainer.innerHTML = `

                <div class="card">

                    <h2>
                        🌤 Wetter für Ballonfahrer
                    </h2>

                    <h3>
                        ${ampel} ${text}
                    </h3>

                    <hr>

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

                    <hr>

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

            }
            catch (error) {

                console.error(error);

                wetterContainer.innerHTML =
                `
                <div class="card">
                    ❌ Wetterdaten konnten nicht geladen werden.
                </div>
                `;
            }
        },

        function(error) {

            console.error(error);

            wetterContainer.innerHTML =
            `
            <div class="card">
                ❌ Standort konnte nicht ermittelt werden.
            </div>
            `;
        }

    );

}

ladeWetter();
