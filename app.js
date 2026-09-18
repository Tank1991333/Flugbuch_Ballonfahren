function monitorAktualisieren() {
    const target =
        element("aktivitaetsmonitorInhalt");

    if (!target) {
        return;
    }

    const settings = monitorLaden();
    const cutoff = new Date();
    const now = new Date();

    cutoff.setHours(0, 0, 0, 0);

    cutoff.setMonth(
        cutoff.getMonth() -
        settings.zeitraumMonate
    );

    const relevantFlights =
        fluege.filter(
            function (flight) {
                const date = new Date(
                    flight.startzeit ||
                    flight.datum
                );

                return (
                    !Number.isNaN(date.getTime()) &&
                    date >= cutoff &&
                    date <= now
                );
            }
        );

    const flightMinutes =
        relevantFlights.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (Number(flight.flugzeit) || 0)
                );
            },
            0
        );

    const flightHours =
        flightMinutes / 60;

    const landings =
        relevantFlights.reduce(
            function (sum, flight) {
                return (
                    sum +
                    (Number(flight.landungen) || 0)
                );
            },
            0
        );

    function progressHtml(
        label,
        value,
        targetValue,
        displayValue,
        displayTarget
    ) {
        const numericValue =
            Number(value) || 0;

        const numericTarget =
            Number(targetValue) || 0;

        const percentage =
            numericTarget <= 0
                ? 100
                : Math.min(
                    100,
                    Math.max(
                        0,
                        Math.round(
                            numericValue /
                            numericTarget *
                            100
                        )
                    )
                );

        return `
            <div class="monitor-progress">
                <div class="monitor-progress-header">
                    <strong>
                        ${htmlSicher(label)}
                    </strong>

                    <span>
                        ${htmlSicher(displayValue)}
                        /
                        ${htmlSicher(displayTarget)}
                    </span>
                </div>

                <div
                    class="monitor-progress-bar"
                    role="progressbar"
                    aria-label="${htmlSicher(label)}"
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

    const formattedFlightHours =
        `${formatZahl(flightHours, 1)} h`;

    const formattedRequiredHours =
        `${formatZahl(
            settings.erforderlicheStunden,
            1
        )} h`;

    const fulfilled =
        flightHours >=
            settings.erforderlicheStunden &&
        landings >=
            settings.erforderlicheLandungen;

    target.innerHTML =
        progressHtml(
            "Flugstunden",
            flightHours,
            settings.erforderlicheStunden,
            formattedFlightHours,
            formattedRequiredHours
        ) +
        progressHtml(
            "Landungen",
            landings,
            settings.erforderlicheLandungen,
            String(landings),
            String(
                settings.erforderlicheLandungen
            )
        ) +
        `
            <div class="monitor-state ${
                fulfilled
                    ? "monitor-state-good"
                    : "monitor-state-open"
            }">
                ${
                    fulfilled
                        ? "✓ EINGESTELLTE ANFORDERUNGEN ERFÜLLT"
                        : "! ANFORDERUNGEN NOCH OFFEN"
                }
            </div>
        `;

    textSetzen(
        "monitorPeriodLabel",
        `${settings.zeitraumMonate} MONATE`
    );

    textSetzen(
        "nextExit",
        relevantFlights.length
            ? (
                `${formattedFlightHours} Flugzeit, ` +
                `${landings} Landung(en) und ` +
                `${relevantFlights.length} Fahrt(en) ` +
                "im Zeitraum."
            )
            : "Keine relevante Fahrt im Zeitraum."
    );
}

function monitorFormularFuellen() {
    const settings = monitorLaden();

    if (element("monitorZeitraum")) {
        element("monitorZeitraum").value =
            settings.zeitraumMonate;
    }

    if (element("monitorSollStunden")) {
        element(
            "monitorSollStunden"
        ).value =
            settings.erforderlicheStunden;
    }

    if (element("monitorSollLandungen")) {
        element(
            "monitorSollLandungen"
        ).value =
            settings.erforderlicheLandungen;
    }
}

function monitorSpeichern() {
    const settings = {
        zeitraumMonate:
            sichereGanzzahl(
                element(
                    "monitorZeitraum"
                )?.value,
                MONITOR_DEFAULTS
                    .zeitraumMonate,
                1,
                120
            ),

        erforderlicheStunden:
            sichereDezimalzahl(
                element(
                    "monitorSollStunden"
                )?.value,
                MONITOR_DEFAULTS
                    .erforderlicheStunden,
                0,
                10000
            ),

        erforderlicheLandungen:
            sichereGanzzahl(
                element(
                    "monitorSollLandungen"
                )?.value,
                MONITOR_DEFAULTS
                    .erforderlicheLandungen,
                0,
                10000
            )
    };

    try {
        localStorage.setItem(
            MONITOR_STORAGE_KEY,
            JSON.stringify(settings)
        );

        monitorFormularFuellen();
        monitorAktualisieren();

        textSetzen(
            "monitorMeldung",
            "✓ Anforderungen wurden gespeichert."
        );
    } catch (error) {
        console.error(error);

        textSetzen(
            "monitorMeldung",
            "❌ Anforderungen konnten nicht gespeichert werden."
        );
    }
}

function monitorZuruecksetzen() {
    try {
        localStorage.removeItem(
            MONITOR_STORAGE_KEY
        );

        monitorFormularFuellen();
        monitorAktualisieren();

        textSetzen(
            "monitorMeldung",
            "✓ Einstellungen wurden zurückgesetzt."
        );
    } catch (error) {
        console.error(error);

        textSetzen(
            "monitorMeldung",
            "❌ Einstellungen konnten nicht zurückgesetzt werden."
        );
    }
}
