// =====================================
// Ballonflugbuch Professional V9
// weather.js
// =====================================

"use strict";

function wetterElement(id) {
    return document.getElementById(id);
}

function wetterTextSetzen(id, text) {
    const ziel = wetterElement(id);

    if (ziel) {
        ziel.textContent = text;
    }
}

function wetterBewertungSetzen(text, klasse = "") {
    const ziel = wetterElement("weatherRating");

    if (!ziel) {
        return;
    }

    ziel.textContent = text;
    ziel.className =
        `weather-rating ${klasse}`.trim();
}

function wetterFehlermeldung(error) {
    if (!error) {
        return "Der Standort konnte nicht ermittelt werden.";
    }

    switch (error.code) {
        case error.PERMISSION_DENIED:
            return (
                "Standortzugriff wurde verweigert. " +
                "Bitte erlaube den Standortzugriff im Browser."
            );

        case error.POSITION_UNAVAILABLE:
            return "Der aktuelle Standort ist nicht verfügbar.";

        case error.TIMEOUT:
            return "Die Standortabfrage hat zu lange gedauert.";

        default:
            return "Der Standort konnte nicht ermittelt werden.";
    }
}

function windRichtungText(deg) {
    const grad = Number(deg);

    if (!Number.isFinite(grad)) {
        return "-";
    }

    const normalisiert =
        ((grad % 360) + 360) % 360;

    if (
        normalisiert >= 337.5 ||
        normalisiert < 22.5
    ) {
        return "N";
    }

    if (normalisiert < 67.5) {
        return "NO";
    }

    if (normalisiert < 112.5) {
        return "O";
    }

    if (normalisiert < 157.5) {
        return "SO";
    }

    if (normalisiert < 202.5) {
        return "S";
    }

    if (normalisiert < 247.5) {
        return "SW";
    }

    if (normalisiert < 292.5) {
        return "W";
    }

    return "NW";
}

function uhrzeitFormatieren(wert) {
    if (!wert) {
        return "--";
    }

    const datum = new Date(wert);

    if (Number.isNaN(datum.getTime())) {
        /*
         * Falls ein Browser das Datumsformat nicht versteht,
         * werden zumindest Stunden und Minuten extrahiert.
         */
        const treffer =
            String(wert).match(/T(\d{2}:\d{2})/);

        return treffer ? treffer[1] : "--";
    }

    return datum.toLocaleTimeString(
        "de-AT",
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}

function wetterBewerten(wind) {
    const windgeschwindigkeit = Number(wind);

    if (!Number.isFinite(windgeschwindigkeit)) {
        return {
            text:
                "⚪ Wetterbewertung derzeit nicht möglich",
            klasse: ""
        };
    }

    if (windgeschwindigkeit <= 10) {
        return {
            text:
                "🟢 Sehr gute Windbedingungen für Ballonfahrten",
            klasse: "weather-good"
        };
    }

    if (windgeschwindigkeit <= 20) {
        return {
            text:
                "🟡 Erhöhte Aufmerksamkeit empfohlen",
            klasse: "weather-warning"
        };
    }

    return {
        text:
            "🔴 Ballonfahrt aufgrund des Windes derzeit nicht empfohlen",
        klasse: "weather-danger"
    };
}

async function wetterAbrufen(lat, lon) {
    const parameter = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current:
            "temperature_2m," +
            "relative_humidity_2m," +
            "surface_pressure," +
            "wind_speed_10m," +
            "wind_direction_10m",
        daily: "sunrise,sunset",
        wind_speed_unit: "kmh",
        timezone: "auto",
        forecast_days: "1"
    });

    const response = await fetch(
        "https://api.open-meteo.com/v1/forecast?" +
        parameter.toString()
    );

    if (!response.ok) {
        throw new Error(
            `Wetterabfrage fehlgeschlagen: ${response.status}`
        );
    }

    return response.json();
}

async function ladeWetter() {
    if (!navigator.geolocation) {
        wetterBewertungSetzen(
            "❌ GPS ist in diesem Browser nicht verfügbar.",
            "weather-danger"
        );

        return;
    }

    wetterBewertungSetzen(
        "📡 Wetterdaten werden geladen ..."
    );

    navigator.geolocation.getCurrentPosition(
        async function (position) {
            const lat =
                position.coords.latitude;

            const lon =
                position.coords.longitude;

            try {
                const data =
                    await wetterAbrufen(lat, lon);

                if (
                    !data ||
                    !data.current ||
                    !data.daily
                ) {
                    throw new Error(
                        "Unvollständige Wetterdaten erhalten."
                    );
                }

                const temperatur =
                    Number(
                        data.current.temperature_2m
                    );

                const luftfeuchte =
                    Number(
                        data.current.relative_humidity_2m
                    );

                const wind =
                    Number(
                        data.current.wind_speed_10m
                    );

                const richtung =
                    Number(
                        data.current.wind_direction_10m
                    );

                const druck =
                    Number(
                        data.current.surface_pressure
                    );

                const temperaturText =
                    Number.isFinite(temperatur)
                        ? temperatur.toLocaleString(
                            "de-AT",
                            {
                                maximumFractionDigits: 1
                            }
                        )
                        : "--";

                const windText =
                    Number.isFinite(wind)
                        ? wind.toLocaleString(
                            "de-AT",
                            {
                                maximumFractionDigits: 1
                            }
                        )
                        : "--";

                const richtungText =
                    Number.isFinite(richtung)
                        ? `${Math.round(richtung)}° ` +
                          `(${windRichtungText(richtung)})`
                        : "--";

                wetterTextSetzen(
                    "temperature",
                    `🌡 Temperatur: ${temperaturText} °C`
                );

                wetterTextSetzen(
                    "wind",
                    `💨 Wind: ${windText} km/h`
                );

                wetterTextSetzen(
                    "windDirection",
                    `🧭 Windrichtung: ${richtungText}`
                );

                wetterTextSetzen(
                    "sunrise",
                    "🌅 Sonnenaufgang: " +
                    uhrzeitFormatieren(
                        data.daily.sunrise?.[0]
                    )
                );

                wetterTextSetzen(
                    "sunset",
                    "🌇 Sonnenuntergang: " +
                    uhrzeitFormatieren(
                        data.daily.sunset?.[0]
                    )
                );

                const bewertung =
                    wetterBewerten(wind);

                const luftfeuchteText =
                    Number.isFinite(luftfeuchte)
                        ? `${Math.round(luftfeuchte)} %`
                        : "--";

                const druckText =
                    Number.isFinite(druck)
                        ? `${Math.round(druck)} hPa`
                        : "--";

                wetterBewertungSetzen(
                    `${bewertung.text} | ` +
                    `Luftfeuchtigkeit: ${luftfeuchteText} | ` +
                    `Luftdruck: ${druckText}`,
                    bewertung.klasse
                );
            } catch (error) {
                console.error(
                    "Wetterdaten konnten nicht geladen werden:",
                    error
                );

                wetterBewertungSetzen(
                    "❌ Wetterdaten konnten nicht geladen werden.",
                    "weather-danger"
                );
            }
        },

        function (error) {
            console.error(
                "Standort für Wetter konnte nicht ermittelt werden:",
                error
            );

            wetterBewertungSetzen(
                "❌ " + wetterFehlermeldung(error),
                "weather-danger"
            );
        },

        {
            enableHighAccuracy: false,
            maximumAge: 300000,
            timeout: 15000
        }
    );
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        ladeWetter
    );
} else {
    ladeWetter();
}
