"use strict";

const MONITOR_STORAGE_KEY =
    "monitorEinstellungen";

const MONITOR_DEFAULTS = Object.freeze({
    zeitraumMonate: 24,
    erforderlicheFahrten: 6,
    erforderlicheLandungen: 10
});

function monitorEinstellungenLaden() {
    try {
        const saved =
            localStorage.getItem(
                MONITOR_STORAGE_KEY
            );

        if (!saved) {
            return {
                ...MONITOR_DEFAULTS
            };
        }

        const data = JSON.parse(saved);

        return {
            zeitraumMonate:
                Math.max(
                    1,
                    Number.parseInt(
                        data.zeitraumMonate,
                        10
                    ) ||
                    MONITOR_DEFAULTS
                        .zeitraumMonate
                ),

            erforderlicheFahrten:
                Math.max(
                    0,
                    Number.parseInt(
                        data.erforderlicheFahrten,
                        10
                    ) || 0
                ),

            erforderlicheLandungen:
                Math.max(
                    0,
                    Number.parseInt(
                        data.erforderlicheLandungen,
                        10
                    ) || 0
                )
        };
    } catch (error) {
        console.error(
            "Monitoreinstellungen konnten nicht geladen werden:",
            error
        );

        return {
            ...MONITOR_DEFAULTS
        };
    }
}

function monitorGrenzdatum(months) {
    const date = new Date();

    date.setHours(
        0,
        0,
        0,
        0
    );

    const originalDay =
        date.getDate();

    date.setDate(1);

    date.setMonth(
        date.getMonth() - months
    );

    const lastDay =
        new Date(
            date.getFullYear(),
            date.getMonth() + 1,
            0
        ).getDate();

    date.setDate(
        Math.min(
            originalDay,
            lastDay
        )
    );

    return date;
}

function monitorFlugdatum(flight) {
    if (!flight) {
        return null;
    }

    const date =
        new Date(
            flight.startzeit ||
            flight.datum
        );

    return Number.isNaN(date.getTime())
        ? null
        : date;
}

function aktivitaetsmonitorBerechnen() {
    const settings =
        monitorEinstellungenLaden();

    const cutoff =
        monitorGrenzdatum(
            settings.zeitraumMonate
        );

    const flights =
        Array.isArray(window.fluege)
            ? window.fluege
            : [];

    const relevantFlights =
        flights
            .filter(function (flight) {
                const date =
                    monitorFlugdatum(flight);

                return (
                    date &&
                    date >= cutoff &&
                    date <= new Date()
                );
            })
            .sort(function (a, b) {
                return (
                    monitorFlugdatum(a) -
                    monitorFlugdatum(b)
                );
            });

    const landings =
        relevantFlights.reduce(
            function (sum, flight) {
                return (
                    sum +
                    Math.max(
                        0,
                        Number(flight.landungen) || 0
                    )
                );
            },
            0
        );

    return {
        settings,
        relevantFlights,
        flightCount:
            relevantFlights.length,
        landingCount:
            landings
    };
}

function monitorFortschrittHtml(
    label,
    value,
    target
) {
    const percentage =
        target <= 0
            ? 100
            : Math.min(
                100,
                Math.round(
                    value / target * 100
                )
            );

    return `
        <div class="monitor-progress">

            <div class="monitor-progress-header">

                <strong>${label}</strong>

                <span>
                    ${value} / ${target}
                    ${value >= target ? "✓" : ""}
                </span>

            </div>

            <div
                class="monitor-progress-bar"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${percentage}"
            >

                <span
                    class="monitor-progress-value"
                    style="width: ${percentage}%"
                ></span>

            </div>

        </div>
    `;
}

function aktivitaetsmonitorAktualisieren() {
    const container =
        document.getElementById(
            "aktivitaetsmonitorInhalt"
        );

    if (!container) {
        return;
    }

    const result =
        aktivitaetsmonitorBerechnen();

    const settings =
        result.settings;

    const fulfilled =
        (
            result.flightCount >=
            settings.erforderlicheFahrten
        ) &&
        (
            result.landingCount >=
            settings.erforderlicheLandungen
        );

    container.innerHTML =
        monitorFortschrittHtml(
            "Fahrten",
            result.flightCount,
            settings.erforderlicheFahrten
        ) +
        monitorFortschrittHtml(
            "Landungen",
            result.landingCount,
            settings.erforderlicheLandungen
        ) +
        `
            <div class="
                monitor-state
                ${
                    fulfilled
                        ? "monitor-state-good"
                        : "monitor-state-open"
                }
            ">

                ${
                    fulfilled
                        ? "✓ ALLE ANFORDERUNGEN ERFÜLLT"
                        : "! ANFORDERUNGEN NOCH OFFEN"
                }

            </div>
        `;

    const periodLabel =
        document.getElementById(
            "monitorPeriodLabel"
        );

    if (periodLabel) {
        periodLabel.textContent =
            `${settings.zeitraumMonate} MONATE`;
    }

    const nextExit =
        document.getElementById(
            "nextExit"
        );

    if (!nextExit) {
        return;
    }

    if (
        result.relevantFlights.length === 0
    ) {
        nextExit.textContent =
            "Kein relevanter Flug im Zeitraum.";

        return;
    }

    const oldestFlight =
        result.relevantFlights[0];

    const oldestDate =
        monitorFlugdatum(oldestFlight);

    const exitDate =
        new Date(oldestDate);

    exitDate.setMonth(
        exitDate.getMonth() +
        settings.zeitraumMonate
    );

    exitDate.setDate(
        exitDate.getDate() + 1
    );

    nextExit.innerHTML =
        "📅 Nächster Flug fällt am " +
        `<strong>${
            exitDate.toLocaleDateString(
                "de-AT"
            )
        }</strong> aus dem Zeitraum.`;
}

function monitorFormularFuellen() {
    const settings =
        monitorEinstellungenLaden();

    const period =
        document.getElementById(
            "monitorZeitraum"
        );

    const flights =
        document.getElementById(
            "monitorSollFahrten"
        );

    const landings =
        document.getElementById(
            "monitorSollLandungen"
        );

    if (period) {
        period.value =
            settings.zeitraumMonate;
    }

    if (flights) {
        flights.value =
            settings.erforderlicheFahrten;
    }

    if (landings) {
        landings.value =
            settings.erforderlicheLandungen;
    }
}

function monitorEinstellungenSpeichern() {
    const period =
        document.getElementById(
            "monitorZeitraum"
        );

    const flights =
        document.getElementById(
            "monitorSollFahrten"
        );

    const landings =
        document.getElementById(
            "monitorSollLandungen"
        );

    if (
        !period ||
        !flights ||
        !landings
    ) {
        return;
    }

    const settings = {
        zeitraumMonate:
            Math.max(
                1,
                Number.parseInt(
                    period.value,
                    10
                ) || 24
            ),

        erforderlicheFahrten:
            Math.max(
                0,
                Number.parseInt(
                    flights.value,
                    10
                ) || 0
            ),

        erforderlicheLandungen:
            Math.max(
                0,
                Number.parseInt(
                    landings.value,
                    10
                ) || 0
            )
    };

    localStorage.setItem(
        MONITOR_STORAGE_KEY,
        JSON.stringify(settings)
    );

    aktivitaetsmonitorAktualisieren();

    const message =
        document.getElementById(
            "monitorMeldung"
        );

    if (message) {
        message.textContent =
            "✓ Anforderungen wurden gespeichert.";
    }
}

function monitorEinstellungenZuruecksetzen() {
    localStorage.removeItem(
        MONITOR_STORAGE_KEY
    );

    monitorFormularFuellen();
    aktivitaetsmonitorAktualisieren();

    const message =
        document.getElementById(
            "monitorMeldung"
        );

    if (message) {
        message.textContent =
            "✓ Einstellungen wurden zurückgesetzt.";
    }
}

document.addEventListener(
    "DOMContentLoaded",
    function () {
        monitorFormularFuellen();

        document.getElementById(
            "monitorSpeichern"
        )?.addEventListener(
            "click",
            monitorEinstellungenSpeichern
        );

        document.getElementById(
            "monitorZuruecksetzen"
        )?.addEventListener(
            "click",
            monitorEinstellungenZuruecksetzen
        );
    }
);

window.aktivitaetsmonitorAktualisieren =
    aktivitaetsmonitorAktualisieren;
