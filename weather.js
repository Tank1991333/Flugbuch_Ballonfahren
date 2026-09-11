"use client";

import { useEffect, useState } from "react";

export default function Weather() {

  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState(null);

  useEffect(() => {

    if (!navigator.geolocation) {
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {

        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        setLocation({
          lat,
          lon
        });

        try {

          const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m&daily=sunrise,sunset&timezone=auto`
          );

          const data = await response.json();

          setWeather(data);

        } catch (error) {

          console.error(error);

        }

        setLoading(false);

      },
      (error) => {

        console.error(error);

        setLoading(false);

      }
    );

  }, []);

  function flugAmpel() {

    if (!weather) return "⚪ Unbekannt";

    const wind =
      weather.current.wind_speed_10m;

    if (wind <= 10)
      return "🟢 Gut geeignet";

    if (wind <= 20)
      return "🟡 Vorsicht";

    return "🔴 Nicht empfohlen";
  }

  if (loading) {
    return (
      <div className="card">
        Wetterdaten werden geladen...
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="card">
        Wetterdaten konnten nicht geladen werden.
      </div>
    );
  }

  return (

    <div className="card">

      <h1>🌤 Wetter Ballonfahren</h1>

      <h2>Ballon-Ampel</h2>

      <p
        style={{
          fontSize: "22px",
          fontWeight: "bold"
        }}
      >
        {flugAmpel()}
      </p>

      <hr />

      <h2>Standort</h2>

      <p>
        Breite: {location?.lat.toFixed(5)}
      </p>

      <p>
        Länge: {location?.lon.toFixed(5)}
      </p>

      <hr />

      <h2>Aktuelles Wetter</h2>

      <p>
        🌡 Temperatur:
        {" "}
        {weather.current.temperature_2m} °C
      </p>

      <p>
        💧 Luftfeuchtigkeit:
        {" "}
        {weather.current.relative_humidity_2m} %
      </p>

      <p>
        🌬 Wind:
        {" "}
        {weather.current.wind_speed_10m} km/h
      </p>

      <p>
        🧭 Windrichtung:
        {" "}
        {weather.current.wind_direction_10m}°
      </p>

      <p>
        📈 Luftdruck:
        {" "}
        {weather.current.surface_pressure} hPa
      </p>

      <hr />

      <h2>Sonne</h2>

      <p>
        🌅 Sonnenaufgang:
        {" "}
        {new Date(
          weather.daily.sunrise[0]
        ).toLocaleTimeString("de-DE")}
      </p>

      <p>
        🌇 Sonnenuntergang:
        {" "}
        {new Date(
          weather.daily.sunset[0]
        ).toLocaleTimeString("de-DE")}
      </p>

    </div>

  );
}
`
