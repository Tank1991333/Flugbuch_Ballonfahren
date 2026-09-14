"use strict";

function weatherSetText(id, text) {
    const element =
        document.getElementById(id);

    if (element) {
        element.textContent = text;
    }
}

function windRichtungText(degrees) {
    const value = Number(degrees);

    if (!Number.isFinite(value)) {
        return "-";
    }

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

    const normalized =
        ((value % 360) + 360) % 360;

    const index =
        Math.round(normalized / 45) % 8;

    return directions[index];
}

function wetterBewerten(wind) {
    if (!Number.isFinite(wind)) {
        return {
            text:
                "Wetterbewertung nicht möglich",
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
            "🔴 Wind für eine Ballonfahrt kritisch",
        className:
            "weather-danger"
    };
}

function wetterZahlFormatieren(value) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "--";
    }

    return number.toLocaleString(
        "de-AT",
        {
            maximumFractionDigits: 1
        }
    );
}

async function wetterdatenAbrufen(
    latitude,
    longitude
) {
    const parameters =
        new URLSearchParams(
            {
                latitude:
                    String(latitude),

                longitude:
                    String(longitude),

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
            }
        );

    const response = await fetch(
        "https://api.open-meteo.com/v1/forecast?" +
        parameters.toString()
    );

    if (!response.ok) {
        throw new Error(
            "Wetterabfrage fehlgeschlagen: " +
            response.status
        );
    }

    return response.json();
}

function ladeWetter() {
    const rating =
        document.getElementById(
            "weatherRating"
        );

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
                const data =
                    await wetterdatenAbrufen(
                        position.coords.latitude,
                        position.coords.longitude
                    );

                if (
                    !data ||
                    !data.current ||
                    !data.daily
                ) {
                    throw new Error(
                        "Unvollständige Wetterdaten."
                    );
                }

                const current =
                    data.current;

                const wind =
                    Number(
                        current.wind_speed_10m
                    );

                const direction =
                    Number(
                        current.wind_direction_10m
                    );

                weatherSetText(
                    "temperature",

                    "🌡 Temperatur: " +
                    wetterZahlFormatieren(
                        current.temperature_2m
                    ) +
                    " °C"
                );

                weatherSetText(
                    "wind",

                    "💨 Wind: " +
                    wetterZahlFormatieren(wind) +
                    " km/h"
                );

                weatherSetText(
                    "windDirection",

                    "🧭 Richtung: " +
                    (
                        Number.isFinite(direction)
                            ? Math.round(direction)
                            : "--"
                    ) +
                    "° (" +
                    windRichtungText(direction) +
                    ")"
                );

                const sunrise =
                    data.daily.sunrise?.[0];

                const sunset =
                    data.daily.sunset?.[0];

                weatherSetText(
                    "sunrise",

                    "🌅 Sonnenaufgang: " +
                    (
                        sunrise
                            ? sunrise.slice(-5)
                            : "--"
                    )
                );

                weatherSetText(
                    "sunset",

                    "🌇 Sonnenuntergang: " +
                    (
                        sunset
                            ? sunset.slice(-5)
                            : "--"
                    )
                );

                const result =
                    wetterBewerten(wind);

                const humidity =
                    Number(
                        current.relative_humidity_2m
                    );

                const pressure =
                    Number(
                        current.surface_pressure
                    );

                rating.textContent =
                    result.text +
                    " · Luftfeuchte " +
                    (
                        Number.isFinite(humidity)
                            ? Math.round(humidity)
                            : "--"
                    ) +
                    " % · Luftdruck " +
                    (
                        Number.isFinite(pressure)
                            ? Math.round(pressure)
                            : "--"
                    ) +
                    " hPa";

                rating.className =
                    "weather-rating " +
                    result.className;
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

        function (error) {
            console.error(
                "Standort konnte nicht ermittelt werden:",
                error
            );

            rating.textContent =
                "Standortfreigabe ist für Wetterdaten erforderlich.";

            rating.className =
                "weather-rating weather-warning";
        },

        {
            maximumAge: 300000,
            timeout: 15000,
            enableHighAccuracy: false
        }
    );
}

document.addEventListener(
    "DOMContentLoaded",
    function () {
        const reloadButton =
            document.getElementById(
                "weatherReload"
            );

        if (reloadButton) {
            reloadButton.addEventListener(
                "click",
                ladeWetter
            );
        }

        ladeWetter();
    }
);
