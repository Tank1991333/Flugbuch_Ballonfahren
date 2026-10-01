"use strict";

const FLIGHT_STORAGE_KEY = "fluege";
const MASTER_DATA_KEY = "stammdaten";
const MONITOR_STORAGE_KEY = "monitorEinstellungen";
const FLIGHT_SYNC_CHANNEL = "flugbuch-ballonfahren-sync";

const DEFAULT_CENTER = [47.28, 15.97];
const DEFAULT_ZOOM = 8;

const PAGE_IDS = [
    "dashboard",
    "fahrt-erfassen",
    "flugbuch",
    "karte",
    "statistiken",
    "wetter",
    "einstellungen"
];

const MONITOR_DEFAULTS = Object.freeze({
    zeitraumMonate: 24,
    erforderlicheStunden: 6,
    erforderlicheLandungen: 10
});

let fluegeSyncChannel = null;

/**
 * Liest JSON-Daten sicher aus dem Local Storage.
 *
 * @param {string} key Schlüssel im Local Storage
 * @param {*} fallback Rückgabewert, wenn keine gültigen Daten vorhanden sind
 * @returns {*} Gespeicherte Daten oder der Fallback-Wert
 */
function ladeJson(key, fallback) {
    try {
        const gespeicherterWert = localStorage.getItem(key);

        if (gespeicherterWert === null) {
            return fallback;
        }

        return JSON.parse(gespeicherterWert);
    } catch (fehler) {
        console.error(
            `Die gespeicherten Daten für "${key}" konnten nicht geladen werden:`,
            fehler
        );

        return fallback;
    }
}

/**
 * Speichert Daten als JSON im Local Storage.
 *
 * @param {string} key Schlüssel im Local Storage
 * @param {*} value Zu speichernde Daten
 * @returns {boolean} true bei Erfolg, andernfalls false
 */
function speichereJson(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (fehler) {
        console.error(
            `Die Daten für "${key}" konnten nicht gespeichert werden:`,
            fehler
        );

        return false;
    }
}

function sichereDezimalzahl(
    value,
    fallback,
    minimum = 0,
    maximum = Number.MAX_SAFE_INTEGER
) {
    const normalizedValue =
        typeof value === "string"
            ? value.replace(",", ".")
            : value;

    const parsed = Number(normalizedValue);

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.min(
        maximum,
        Math.max(minimum, parsed)
    );
}

function fluegeLaden() {
    const saved = ladeJson(FLIGHT_STORAGE_KEY, []);

    return Array.isArray(saved) ? saved : [];
}

let fluege = fluegeLaden();
let aktuellerFlug = null;
let trackpunkte = [];
