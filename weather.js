// =====================================
// Wetter laden
// =====================================

function wetterLaden() {

  if (!navigator.geolocation) {
    return;
  }

  navigator.geolocation.getCurrentPosition(

    async function (pos) {

      const lat =
        pos.coords.latitude;

      const lon =
        pos.coords.longitude;

      try {

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
          "🌡 Temperatur: " +
          temperatur +
          " °C";

        document.getElementById(
          "wind"
        ).innerHTML =
          "💨 Wind: " +
          wind +
          " km/h";

        document.getElementById(
          "windDirection"
        ).innerHTML =
          "🧭 Windrichtung: " +
          windrichtung +
          "°";

        document.getElementById(
          "sunrise"
        ).innerHTML =
          "🌅 Sonnenaufgang: " +
          sunrise;

        document.getElementById(
          "sunset"
        ).innerHTML =
          "🌇 Sonnenuntergang: " +
          sunset;

        wetterBewertung(
          wind,
          temperatur
        );

      } catch (error) {

        console.log(error);

        document.getElementById(
          "weatherRating"
        ).innerHTML =
          "❌ Wetterdaten nicht verfügbar";

      }

    }

  );

}

// =====================================
// Wetterbewertung
// =====================================

function wetterBewertung(
  wind,
  temperatur
) {

  const feld =
    document.getElementById(
      "weatherRating"
    );

  if (
    wind <= 10 &&
    temperatur >= -5 &&
    temperatur <= 30
  ) {

    feld.innerHTML =
      "🟢 Gute Bedingungen für Ballonfahrten";

    feld.style.background =
      "#16a34a";

    feld.style.color =
      "#ffffff";

    return;
  }

  if (
    wind <= 20
  ) {

    feld.innerHTML =
      "🟡 Bedingungen eingeschränkt. Wetter prüfen.";

    feld.style.background =
      "#eab308";

    feld.style.color =
      "#000000";

    return;
  }

  feld.innerHTML =
    "🔴 Hoher Wind. Ballonfahrt nicht empfohlen.";

  feld.style.background =
    "#dc2626";

  feld.style.color =
    "#ffffff";

}

// =====================================
// Windrichtung Text
// =====================================

function windrichtungText(winkel) {

  if (winkel >= 337.5 || winkel < 22.5)
    return "N";

  if (winkel < 67.5)
    return "NO";

  if (winkel < 112.5)
    return "O";

  if (winkel < 157.5)
    return "SO";

  if (winkel < 202.5)
    return "S";

  if (winkel < 247.5)
    return "SW";

  if (winkel < 292.5)
    return "W";

  return "NW";

}

// =====================================
// Wetter aktualisieren
// =====================================

wetterLaden();

setInterval(
  wetterLaden,
  600000
);
