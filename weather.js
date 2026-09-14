"use strict";

function wetterElement(id) {
    return document.getElementById(id);
}

function wetterTextSetzen(id, text) {
    const target = wetterElement(id);

    if (target) {
        target.textContent = text;
    }
}

function windRichtungText(degrees) {
    const value = Number(degrees);

    if (!Number.isFinite(value)) {
        return "-";
    }

    const normalized =
        ((value % 360) + 360) % 360;

    const directions = [
        "N",
        "NO",
        "O",
        "SO",
        "S",
        "SW",
        "W",
        "NW"
    ];

    const index =
        Math.round(normalized / 45) % 8;

    return directions[index];
}

function wetterBewerten(windSpeed) {
    const wind = Number(windSpeed);

    if (!Number.isFinite(wind)) {
        return {
            text:
                "Wetterbewertung derzeit nicht möglich.",
            className: ""
        };
    }

    if (wind <= 10) {
        return {
            text:
                "🟢 Ruhige Windbedingungen",
            className:
                "weather-good"
        };
    }

    if (wind <= 20) {
        return {
            text:
                "🟡 Erhöhte Aufmerksamkeit erforderlich",
            className:
                "weather-warning"
        };
    }

    return {
        text:
            "🔴 Kritische Windgeschwindigkeit",
        className:
            "weather-danger"
    };
}

function uhrzeitAusIso(value) {
    if (!value) {
        return "--";
    }

    const match =
        String(value).match(
            /T(\d{2}:\d{2})/
        );

    return match
        ? match[1]
        : "--";
}

async function wetterAbrufen(lat, lon) {
    const parameters =
        new URLSearchParams({
            latitude: String(lat),
            longitude: String(lon),

            current:
                "temperature_2m," +
                "wind_speed_10m," +
                "wind_direction_10m," +
                "relative_humidity_2m," +
                "surface_pressure",

            daily:
                "sunrise,sunset",

            wind_speed_unit:
                "kmh",

            timezone:
                "auto",

            forecast_days:
                "1"
        });

    const response = await fetch(
        "https://api.open-meteo.com/v1/forecast?" +
        parameters.toString()
    );

    if (!response.ok) {
        throw new Error(
            `Wetterabfrage fehlgeschlagen: ${response.status}`
        );
    }

    return response.json();
}

function ladeWetter() {
    const rating =
        wetterElement("weatherRating");

    if (!rating) {
        return;
    }

    if (!navigator.geolocation) {
        rating.textContent =
            "GPS wird von diesem Browser nicht unterstützt.";

        rating.className =
            "weather-rating weather-danger";

        return;
    }

    rating.textContent =
        "📡 Wetterdaten werden geladen ...";

    rating.className =
        "weather-rating";

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            try {
                const data = await wetterAbrufen(
                    position.coords.latitude,
                    position.coords.longitude
                );

                const current =
                    data.current || {};

                const daily =
                    data.daily || {};

                const temperature =
                    Number(
                        current.temperature_2m
                    );

                const wind =
                    Number(
                        current.wind_speed_10m
                    );

                const direction =
                    Number(
                        current.wind_direction_10m
                    );

                const humidity =
                    Number(
                        current.relative_humidity_2m
                    );

                const pressure =
                    Number(
                        current.surface_pressure
                    );

                const formatNumber =
                    function (value) {
                        return Number(value)
                            .toLocaleString(
                                "de-AT",
                                {
                                    maximumFractionDigits: 1
                                }
                            );
                    };

                wetterTextSetzen(
                    "temperature",
                    Number.isFinite(temperature)
                        ? `🌡 Temperatur: ${formatNumber(temperature)} °C`
                        : "🌡 Temperatur: --"
                );

                wetterTextSetzen(
                    "wind",
                    Number.isFinite(wind)
                        ? `💨 Wind: ${formatNumber(wind)} km/h`
                        : "💨 Wind: --"
                );

                wetterTextSetzen(
                    "windDirection",
                    Number.isFinite(direction)
                        ? (
                            `🧭 Windrichtung: ` +
                            `${Math.round(direction)}° ` +
                            `(${windRichtungText(direction)})`
                        )
                        : "🧭 Windrichtung: --"
                );

                wetterTextSetzen(
                    "sunrise",
                    "🌅 Sonnenaufgang: " +
                    uhrzeitAusIso(
                        daily.sunrise?.[0]
                    )
                );

                wetterTextSetzen(
                    "sunset",
                    "🌇 Sonnenuntergang: " +
                    uhrzeitAusIso(
                        daily.sunset?.[0]
                    )
                );

                const assessment =
                    wetterBewerten(wind);

                const humidityText =
                    Number.isFinite(humidity)
                        ? `${Math.round(humidity)} %`
                        : "--";

                const pressureText =
                    Number.isFinite(pressure)
                        ? `${Math.round(pressure)} hPa`
                        : "--";

                rating.textContent =
                    `${assessment.text} · ` +
                    `Luftfeuchtigkeit ${humidityText} · ` +
                    `Luftdruck ${pressureText}`;

                rating.className =
                    `weather-rating ${assessment.className}`.trim();
            } catch (error) {
                console.error(
                    "Wetterdaten konnten nicht geladen werden:",
                    error
                );

                rating.textContent =
                    "❌ Wetterdaten konnten nicht geladen werden.";

                rating.className =
                    "weather-rating weather-danger";
            }
        },

        function () {
            rating.textContent =
                "Standortfreigabe ist für Wetterdaten erforderlich.";

            rating.className =
                "weather-rating weather-warning";
        },

        {
            enableHighAccuracy: false,
            maximumAge: 300000,
            timeout: 15000
        }
    );
}

document.addEventListener(
    "DOMContentLoaded",
    function () {
        wetterElement("weatherReload")
            ?.addEventListener(
                "click",
                ladeWetter
            );

        ladeWetter();
    }
);
