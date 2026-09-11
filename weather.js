// =====================================
// Ballonflugbuch Professional
// weather.js
// =====================================

function windrichtungText(winkel) {

  if (winkel >= 337.5 || winkel < 22.5) {
    return "N";
  }

  if (winkel < 67.5) {
    return "NO";
  }

  if (winkel < 112.5) {
    return "O";
  }

  if (winkel < 157.5) {
    return "SO";
  }

  if (winkel < 202.5) {
    return "S";
  }

  if (winkel < 247.5) {
    return "SW";
  }

  if (winkel < 292.5) {
    return "W";
  }

  return "NW";
}

// =====================================
// Wetterbewertung
// =====================================

function bewerteWetter(wind) {

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
      "🟡 Erhöhte Aufmerksamkeit empfohlen";

    feld.style.background =
      "#facc15";

    feld.style.color =
      "#000000";

    return;
  }

  feld.innerHTML =
    "🔴 Hoher Wind - Ballonfahrt nicht empfohlen";

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
    return;
  }

  navigator.geolocation.getCurrentPosition(

    async function(pos) {

      try {

        const lat =
          pos.coords.latitude;

        const lon =
          pos.coords.longitude;

        const url =

          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=auto`;

        const response =
          await fetch(url);

        const data =
          await response.json();

        const temperatur =
          data.current.temperature_2m;

        const wind =
          data.current.wind_speed_10m;

        const richtung =
          data.current.wind_direction_10m;

        const richtungText =
          windrichtungText(
            richtung
          );

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

        const temperaturFeld =
          document.getElementById(
            "temperature"
          );

        const windFeld =
          document.getElementById(
            "wind"
          );

        const richtungFeld =
          document.getElementById(
            "windDirection"
          );

        const sunriseFeld =
          document.getElementById(
            "sunrise"
          );

        const sunsetFeld =
          document.getElementById(
            "sunset"
          );

        if (temperaturFeld) {
          temperaturFeld.innerHTML =
            `🌡 Temperatur: ${temperatur} °C`;
        }

        if (windFeld) {
          windFeld.innerHTML =
            `💨 Wind: ${wind} km/h`;
        }

        if (richtungFeld) {
          richtungFeld.innerHTML =
            `🧭 Windrichtung: ${richtungText} (${richtung}°)`;
        }

        if (sunriseFeld) {
          sunriseFeld.innerHTML =
            `🌅 Sonnenaufgang: ${sunrise}`;
        }

        if (sunsetFeld) {
          sunsetFeld.innerHTML =
            `🌇 Sonnenuntergang: ${sunset}`;
        }

        bewerteWetter(wind);

      }
      catch (error) {

        console.error(
          "Wetterfehler:",
          error
        );

        const feld =
          document.getElementById(
            "weatherRating"
          );

        if (feld) {

          feld.innerHTML =
            "❌ Wetterdaten konnten nicht geladen werden";

          feld.style.background =
            "#dc2626";

          feld.style.color =
            "#ffffff";
        }

      }

    },

    function(error) {

      console.error(
        "GPS Fehler:",
        error
      );

    }

  );

}

// =====================================
// Start
// =====================================

wetterLaden();

// alle 10 Minuten aktualisieren

setInterval(
  wetterLaden,
  600000
);
