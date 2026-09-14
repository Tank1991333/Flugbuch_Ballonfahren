"use strict";

const MONITOR_KEY =
    "monitorEinstellungen";

const MONITOR_DEFAULT =
    Object.freeze(
        {
            zeitraumMonate: 24,
            erforderlicheFahrten: 6,
            erforderlicheLandungen: 10
        }
    );

function monitorSettings() {
    try {
        const stored =
            localStorage.getItem(
                MONITOR_KEY
            );

        if (!stored) {
            return {
                ...MONITOR_DEFAULT
            };
        }

        const parsed =
            JSON.parse(stored);

        return {
            zeitraumMonate:
                Math.max(
                    1,
                    Number(
                        parsed.zeitraumMonate
                    ) ||
                    MONITOR_DEFAULT
                        .zeitraumMonate
                ),

            erforderlicheFahrten:
                Math.max(
                    0,
                    Number(
                        parsed.erforderlicheFahrten
                    ) ||
                    0
                ),

            erforderlicheLandungen:
                Math.max(
                    0,
                    Number(
                        parsed.erforderlicheLandungen
                    ) ||
                    0
                )
        };
    } catch (error) {
        console.error(
            "Monitoreinstellungen konnten nicht geladen werden:",
            error
        );

        return {
            ...MONITOR_DEFAULT
        };
    }
}

function monitorCutoff(months) {
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
        date.getMonth() -
        Math.max(
            1,
            Number(months) || 24
        )
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

function monitorFlightDate(flight) {
    if (!flight) {
        return null;
    }

    const date =
        new Date(
            flight.startzeit ||
            flight.datum
        );

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return date;
}

function aktivitaetsmonitorBerechnen() {
    const settings =
        monitorSettings();

    const cutoff =
        monitorCutoff(
            settings.zeitraumMonate
        );

    const now =
        new Date();

    const flights =
        Array.isArray(window.fluege)
            ? window.fluege
            : [];

    const relevant =
        flights
            .filter(
                function (flight) {
                    const date =
                        monitorFlightDate(
                            flight
                        );

                    return (
                        date &&
                        date >= cutoff &&
                        date <= now
                    );
                }
            )
            .sort(
                function (a, b) {
                    return (
                        monitorFlightDate(a) -
                        monitorFlightDate(b)
                    );
                }
            );

    const landings =
        relevant.reduce(
            function (total, flight) {
                return (
                    total +
                    (
                        Number(
                            flight.landungen
                        ) ||
                        0
                    )
                );
            },
            0
        );

    let nextExit = null;

    if (relevant.length > 0) {
        const oldestFlight =
            relevant[0];

        const flightDate =
            monitorFlightDate(
                oldestFlight
            );

        const exitDate =
            new Date(flightDate);

        exitDate.setMonth(
            exitDate.getMonth() +
            settings.zeitraumMonate
        );

        exitDate.setDate(
            exitDate.getDate() + 1
        );

        nextExit = {
            flight:
                oldestFlight,

            date:
                exitDate
        };
    }

    return {
        settings,
        relevant,
        fahrten:
            relevant.length,
        landungen:
            landings,
        nextExit
    };
}

function monitorProgress(
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
                    value /
                    target *
                    100
                )
            );

    return `
        <div class="monitor-row">

            <div class="monitor-row-head">

                <b>${label}</b>

                <span>
                    ${value} / ${target}
                    ${value >= target ? "✓" : ""}
                </span>

            </div>

            <div
                class="progress"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${percentage}"
            >
                <i
                    style="width: ${percentage}%"
                ></i>
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

    const flightsFulfilled =
        result.fahrten >=
        result.settings
            .erforderlicheFahrten;

    const landingsFulfilled =
        result.landungen >=
        result.settings
            .erforderlicheLandungen;

    const allFulfilled =
        flightsFulfilled &&
        landingsFulfilled;

    container.innerHTML =
        monitorProgress(
            "Fahrten",
            result.fahrten,
            result.settings
                .erforderlicheFahrten
        ) +
        monitorProgress(
            "Landungen",
            result.landungen,
            result.settings
                .erforderlicheLandungen
        ) +
        `
            <div
                class="monitor-state ${
                    allFulfilled
                        ? "ok"
                        : "open"
                }"
            >
                ${
                    allFulfilled
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
            result.settings
                .zeitraumMonate +
            " MONATE";
    }

    const nextExitElement =
        document.getElementById(
            "nextExit"
        );

    if (nextExitElement) {
        if (result.nextExit) {
            nextExitElement.innerHTML =
                "📅 Nächster Flug fällt am " +
                "<b>" +
                result.nextExit.date
                    .toLocaleDateString(
                        "de-AT"
                    ) +
                "</b> aus dem Zeitraum.";
        } else {
            nextExitElement.textContent =
                "Kein relevanter Flug im Zeitraum.";
        }
    }
}

function fillMonitorForm() {
    const settings =
        monitorSettings();

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
            String(
                settings.zeitraumMonate
            );
    }

    if (flights) {
        flights.value =
            String(
                settings.erforderlicheFahrten
            );
    }

    if (landings) {
        landings.value =
            String(
                settings.erforderlicheLandungen
            );
    }
}

function monitorSave() {
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
                Number(period.value) ||
                MONITOR_DEFAULT
                    .zeitraumMonate
            ),

        erforderlicheFahrten:
            Math.max(
                0,
                Number(flights.value) ||
                0
            ),

        erforderlicheLandungen:
            Math.max(
                0,
                Number(landings.value) ||
                0
            )
    };

    try {
        localStorage.setItem(
            MONITOR_KEY,
            JSON.stringify(settings)
        );

        aktivitaetsmonitorAktualisieren();

        const message =
            document.getElementById(
                "monitorMeldung"
            );

        if (message) {
            message.textContent =
                "✓ Anforderungen gespeichert.";

            window.setTimeout(
                function () {
                    message.textContent = "";
                },
                4000
            );
        }
    } catch (error) {
        console.error(
            "Monitoreinstellungen konnten nicht gespeichert werden:",
            error
        );
    }
}

function monitorReset() {
    const confirmed =
        window.confirm(
            "Sollen die Monitoreinstellungen zurückgesetzt werden?"
        );

    if (!confirmed) {
        return;
    }

    localStorage.removeItem(
        MONITOR_KEY
    );

    fillMonitorForm();
    aktivitaetsmonitorAktualisieren();
}

document.addEventListener(
    "DOMContentLoaded",
    function () {
        fillMonitorForm();

        const saveButton =
            document.getElementById(
                "monitorSpeichern"
            );

        const resetButton =
            document.getElementById(
                "monitorZuruecksetzen"
            );

        if (saveButton) {
            saveButton.addEventListener(
                "click",
                monitorSave
            );
        }

        if (resetButton) {
            resetButton.addEventListener(
                "click",
                monitorReset
            );
        }
    }
);

window.aktivitaetsmonitorAktualisieren =
    aktivitaetsmonitorAktualisieren;

window.aktivitaetsmonitorBerechnen =
    aktivitaetsmonitorBerechnen;
