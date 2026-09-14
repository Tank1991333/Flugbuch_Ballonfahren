// =====================================
// Ballonflugbuch Professional
// monitor.js
// Aktivitaetsmonitor
// =====================================

"use strict";

// =====================================
// Standardeinstellungen
// =====================================

const STANDARD_MONITOR_EINSTELLUNGEN = {
    zeitraumMonate: 24,
    erforderlicheFahrten: 30,
    erforderlicheLandungen: 40
};

// =====================================
// Einstellungen laden
// =====================================

function monitorEinstellungenLaden() {
    try {
        const gespeichert =
            localStorage.getItem(
                "monitorEinstellungen"
            );

        if (!gespeichert) {
            return {
                ...STANDARD_MONITOR_EINSTELLUNGEN
            };
        }

        const daten = JSON.parse(gespeichert);

        return {
            zeitraumMonate:
                positiveGanzzahl(
                    daten.zeitraumMonate,
                    STANDARD_MONITOR_EINSTELLUNGEN
                        .zeitraumMonate
                ),

            erforderlicheFahrten:
                nichtNegativeGanzzahl(
                    daten.erforderlicheFahrten,
                    STANDARD_MONITOR_EINSTELLUNGEN
                        .erforderlicheFahrten
                ),

            erforderlicheLandungen:
                nichtNegativeGanzzahl(
                    daten.erforderlicheLandungen,
                    STANDARD_MONITOR_EINSTELLUNGEN
                        .erforderlicheLandungen
                )
        };
    } catch (error) {
        console.error(
            "Monitoreinstellungen konnten nicht geladen werden:",
            error
        );

        return {
            ...STANDARD_MONITOR_EINSTELLUNGEN
        };
    }
}

// =====================================
// Einstellungen speichern
// =====================================

function monitorEinstellungenSpeichern() {
    const zeitraumFeld =
        document.getElementById(
            "monitorZeitraum"
        );

    const fahrtenFeld =
        document.getElementById(
            "monitorSollFahrten"
        );

    const landungenFeld =
        document.getElementById(
            "monitorSollLandungen"
        );

    if (
        !zeitraumFeld ||
        !fahrtenFeld ||
        !landungenFeld
    ) {
        return;
    }

    const einstellungen = {
        zeitraumMonate:
            positiveGanzzahl(
                zeitraumFeld.value,
                24
            ),

        erforderlicheFahrten:
            nichtNegativeGanzzahl(
                fahrtenFeld.value,
                0
            ),

        erforderlicheLandungen:
            nichtNegativeGanzzahl(
                landungenFeld.value,
                0
            )
    };

    try {
        localStorage.setItem(
            "monitorEinstellungen",
            JSON.stringify(einstellungen)
        );

        monitorEinstellungenInFormularEintragen(
            einstellungen
        );

        aktivitaetsmonitorAktualisieren();

        monitorMeldungAnzeigen(
            "✅ Anforderungen wurden gespeichert.",
            "erfolg"
        );
    } catch (error) {
        console.error(
            "Monitoreinstellungen konnten nicht gespeichert werden:",
            error
        );

        monitorMeldungAnzeigen(
            "❌ Einstellungen konnten nicht gespeichert werden.",
            "fehler"
        );
    }
}

// =====================================
// Einstellungen zurücksetzen
// =====================================

function monitorEinstellungenZuruecksetzen() {
    const bestaetigt = window.confirm(
        "Sollen die Einstellungen des Aktivitätsmonitors zurückgesetzt werden?"
    );

    if (!bestaetigt) {
        return;
    }

    try {
        localStorage.removeItem(
            "monitorEinstellungen"
        );

        monitorEinstellungenInFormularEintragen(
            STANDARD_MONITOR_EINSTELLUNGEN
        );

        aktivitaetsmonitorAktualisieren();

        monitorMeldungAnzeigen(
            "✅ Einstellungen wurden zurückgesetzt.",
            "erfolg"
        );
    } catch (error) {
        console.error(
            "Einstellungen konnten nicht zurückgesetzt werden:",
            error
        );

        monitorMeldungAnzeigen(
            "❌ Einstellungen konnten nicht zurückgesetzt werden.",
            "fehler"
        );
    }
}

// =====================================
// Einstellungen ins Formular schreiben
// =====================================

function monitorEinstellungenInFormularEintragen(
    einstellungen
) {
    const zeitraumFeld =
        document.getElementById(
            "monitorZeitraum"
        );

    const fahrtenFeld =
        document.getElementById(
            "monitorSollFahrten"
        );

    const landungenFeld =
        document.getElementById(
            "monitorSollLandungen"
        );

    if (zeitraumFeld) {
        zeitraumFeld.value =
            String(
                einstellungen.zeitraumMonate
            );
    }

    if (fahrtenFeld) {
        fahrtenFeld.value =
            String(
                einstellungen
                    .erforderlicheFahrten
            );
    }

    if (landungenFeld) {
        landungenFeld.value =
            String(
                einstellungen
                    .erforderlicheLandungen
            );
    }
}

// =====================================
// Aktivitätsmonitor berechnen
// =====================================

function aktivitaetsmonitorBerechnen() {
    const einstellungen =
        monitorEinstellungenLaden();

    const heute = tagesbeginn(
        new Date()
    );

    const beginnZeitraum =
        monateAbziehen(
            heute,
            einstellungen.zeitraumMonate
        );

    const vorhandeneFluege =
        Array.isArray(window.fluege)
            ? window.fluege
            : (
                typeof fluege !== "undefined" &&
                Array.isArray(fluege)
                    ? fluege
                    : []
            );

    const relevanteFluege =
        vorhandeneFluege
            .map(function (flug, index) {
                return {
                    flug,
                    index,
                    datum:
                        flugDatumErmitteln(flug)
                };
            })
            .filter(function (eintrag) {
                if (!eintrag.datum) {
                    return false;
                }

                const flugtag =
                    tagesbeginn(
                        eintrag.datum
                    );

                return (
                    flugtag >= beginnZeitraum &&
                    flugtag <= heute
                );
            })
            .sort(function (a, b) {
                return (
                    a.datum.getTime() -
                    b.datum.getTime()
                );
            });

    const anzahlFahrten =
        relevanteFluege.length;

    const anzahlLandungen =
        relevanteFluege.reduce(
            function (summe, eintrag) {
                const landungen =
                    Number(
                        eintrag.flug.landungen
                    );

                return (
                    summe +
                    (
                        Number.isFinite(landungen) &&
                        landungen > 0
                            ? landungen
                            : 0
                    )
                );
            },
            0
        );

    const flugzeitMinuten =
        relevanteFluege.reduce(
            function (summe, eintrag) {
                const minuten =
                    Number(
                        eintrag.flug.flugzeit
                    );

                return (
                    summe +
                    (
                        Number.isFinite(minuten) &&
                        minuten > 0
                            ? minuten
                            : 0
                    )
                );
            },
            0
        );

    const streckeKm =
        relevanteFluege.reduce(
            function (summe, eintrag) {
                const strecke =
                    Number(
                        eintrag.flug.strecke
                    );

                return (
                    summe +
                    (
                        Number.isFinite(strecke) &&
                        strecke > 0
                            ? strecke
                            : 0
                    )
                );
            },
            0
        );

    const fehlendeFahrten =
        Math.max(
            0,
            einstellungen
                .erforderlicheFahrten -
            anzahlFahrten
        );

    const fehlendeLandungen =
        Math.max(
            0,
            einstellungen
                .erforderlicheLandungen -
            anzahlLandungen
        );

    const fahrtenErfuellt =
        fehlendeFahrten === 0;

    const landungenErfuellt =
        fehlendeLandungen === 0;

    const allesErfuellt =
        fahrtenErfuellt &&
        landungenErfuellt;

    const naechsterAustritt =
        naechstenAustrittBerechnen(
            relevanteFluege,
            einstellungen.zeitraumMonate
        );

    return {
        einstellungen,
        heute,
        beginnZeitraum,
        relevanteFluege,
        anzahlFahrten,
        anzahlLandungen,
        flugzeitMinuten,
        streckeKm,
        fehlendeFahrten,
        fehlendeLandungen,
        fahrtenErfuellt,
        landungenErfuellt,
        allesErfuellt,
        naechsterAustritt
    };
}

// =====================================
// Monitor anzeigen
// =====================================

function aktivitaetsmonitorAktualisieren() {
    const container =
        document.getElementById(
            "aktivitaetsmonitorInhalt"
        );

    if (!container) {
        return;
    }

    const auswertung =
        aktivitaetsmonitorBerechnen();

    const {
        einstellungen,
        heute,
        beginnZeitraum,
        anzahlFahrten,
        anzahlLandungen,
        flugzeitMinuten,
        streckeKm,
        fehlendeFahrten,
        fehlendeLandungen,
        fahrtenErfuellt,
        landungenErfuellt,
        allesErfuellt,
        naechsterAustritt
    } = auswertung;

    const fahrtenProzent =
        prozentBerechnen(
            anzahlFahrten,
            einstellungen
                .erforderlicheFahrten
        );

    const landungenProzent =
        prozentBerechnen(
            anzahlLandungen,
            einstellungen
                .erforderlicheLandungen
        );

    const statusKlasse =
        allesErfuellt
            ? "monitor-status-erfuellt"
            : "monitor-status-offen";

    const statusText =
        allesErfuellt
            ? "🟢 Alle eingestellten Anforderungen sind erfüllt."
            : "🔴 Die eingestellten Anforderungen sind noch nicht vollständig erfüllt.";

    const naechsterAustrittHtml =
        naechsterAustritt
            ? `
                <div class="monitor-hinweis">
                    <strong>
                        ⏳ Nächster Flug fällt aus dem Zeitraum:
                    </strong>

                    <span>
                        ${datumFormatieren(
                            naechsterAustritt
                                .austrittsdatum
                        )}
                    </span>

                    <small>
                        Flug vom
                        ${datumFormatieren(
                            naechsterAustritt
                                .flugdatum
                        )}
                        mit
                        ${zahlFormatieren(
                            naechsterAustritt
                                .landungen
                        )}
                        Landung(en)
                    </small>
                </div>
            `
            : `
                <div class="monitor-hinweis">
                    <strong>
                        ⏳ Nächster Austritt:
                    </strong>

                    <span>
                        Kein relevanter Flug vorhanden
                    </span>
                </div>
            `;

    container.innerHTML = `
        <div class="monitor-zeitraum">

            <div>
                <span>Auswertung von</span>
                <strong>
                    ${datumFormatieren(
                        beginnZeitraum
                    )}
                </strong>
            </div>

            <div>
                <span>bis einschließlich</span>
                <strong>
                    ${datumFormatieren(heute)}
                </strong>
            </div>

            <div>
                <span>Betrachtungszeitraum</span>
                <strong>
                    ${zahlFormatieren(
                        einstellungen
                            .zeitraumMonate
                    )}
                    Monate
                </strong>
            </div>

        </div>

        <div class="monitor-werte">

            ${monitorWertHtml({
                titel: "Fahrten",
                symbol: "🎈",
                istWert: anzahlFahrten,
                sollWert:
                    einstellungen
                        .erforderlicheFahrten,
                fehlend: fehlendeFahrten,
                erfuellt: fahrtenErfuellt,
                prozent: fahrtenProzent
            })}

            ${monitorWertHtml({
                titel: "Landungen",
                symbol: "🛬",
                istWert: anzahlLandungen,
                sollWert:
                    einstellungen
                        .erforderlicheLandungen,
                fehlend: fehlendeLandungen,
                erfuellt: landungenErfuellt,
                prozent: landungenProzent
            })}

        </div>

        <div class="monitor-zusatzwerte">

            <div>
                <span>⏱ Flugzeit</span>
                <strong>
                    ${flugzeitFormatieren(
                        flugzeitMinuten
                    )}
                </strong>
            </div>

            <div>
                <span>🗺 Strecke</span>
                <strong>
                    ${zahlFormatieren(
                        streckeKm,
                        1
                    )}
                    km
                </strong>
            </div>

        </div>

        <div class="monitor-status ${statusKlasse}">
            ${statusText}
        </div>

        <div class="monitor-restwerte">

            <div>
                <span>Noch benötigte Fahrten</span>
                <strong>
                    ${
                        fahrtenErfuellt
                            ? "0 ✅"
                            : `${fehlendeFahrten} ⚠️`
                    }
                </strong>
            </div>

            <div>
                <span>Noch benötigte Landungen</span>
                <strong>
                    ${
                        landungenErfuellt
                            ? "0 ✅"
                            : `${fehlendeLandungen} ⚠️`
                    }
                </strong>
            </div>

        </div>

        ${naechsterAustrittHtml}

        <p class="monitor-rechtshinweis">
            Die Anzeige basiert ausschließlich auf den im
            Flugbuch gespeicherten Daten und den von dir
            eingestellten Sollwerten.
        </p>
    `;
}

// =====================================
// Einzelnen Monitorwert erzeugen
// =====================================

function monitorWertHtml(daten) {
    const statusSymbol =
        daten.erfuellt
            ? "✅"
            : "⚠️";

    const statusText =
        daten.erfuellt
            ? "Anforderung erfüllt"
            : `Noch ${daten.fehlend} erforderlich`;

    const klasse =
        daten.erfuellt
            ? "monitor-wert-erfuellt"
            : "monitor-wert-offen";

    return `
        <div class="monitor-wert ${klasse}">

            <div class="monitor-wert-kopf">
                <span>
                    ${daten.symbol}
                    ${daten.titel}
                </span>

                <strong>
                    ${statusSymbol}
                </strong>
            </div>

            <div class="monitor-wert-zahlen">
                <strong>
                    ${zahlFormatieren(
                        daten.istWert
                    )}
                </strong>

                <span>
                    von
                    ${zahlFormatieren(
                        daten.sollWert
                    )}
                </span>
            </div>

            <div
                class="monitor-fortschritt"
                aria-label="${daten.titel}: ${daten.prozent} Prozent"
            >
                <div
                    class="monitor-fortschritt-balken"
                    style="width: ${daten.prozent}%"
                ></div>
            </div>

            <p>${statusText}</p>

        </div>
    `;
}

// =====================================
// Nächsten Austritt berechnen
// =====================================

function naechstenAustrittBerechnen(
    relevanteFluege,
    monate
) {
    if (
        !Array.isArray(relevanteFluege) ||
        relevanteFluege.length === 0
    ) {
        return null;
    }

    const heute = tagesbeginn(
        new Date()
    );

    const austritte =
        relevanteFluege
            .map(function (eintrag) {
                const austrittsdatum =
                    monateHinzufuegen(
                        tagesbeginn(
                            eintrag.datum
                        ),
                        monate
                    );

                /*
                 * Die Fahrt bleibt bis zum Ablaufdatum
                 * einschließlich im Zeitraum.
                 * Daher fällt sie am folgenden Tag heraus.
                 */
                austrittsdatum.setDate(
                    austrittsdatum.getDate() + 1
                );

                return {
                    flugdatum:
                        tagesbeginn(
                            eintrag.datum
                        ),

                    austrittsdatum,

                    landungen:
                        nichtNegativeGanzzahl(
                            eintrag.flug
                                .landungen,
                            0
                        )
                };
            })
            .filter(function (eintrag) {
                return (
                    eintrag.austrittsdatum >
                    heute
                );
            })
            .sort(function (a, b) {
                return (
                    a.austrittsdatum.getTime() -
                    b.austrittsdatum.getTime()
                );
            });

    return austritte.length > 0
        ? austritte[0]
        : null;
}

// =====================================
// Flugdatum erkennen
// =====================================

function flugDatumErmitteln(flug) {
    if (!flug || typeof flug !== "object") {
        return null;
    }

    const moeglicheWerte = [
        flug.startzeit,
        flug.datum
    ];

    for (const wert of moeglicheWerte) {
        const datum = datumAusWert(wert);

        if (datum) {
            return datum;
        }
    }

    return null;
}

// =====================================
// Datum sicher einlesen
// =====================================

function datumAusWert(wert) {
    if (!wert) {
        return null;
    }

    if (wert instanceof Date) {
        return Number.isNaN(
            wert.getTime()
        )
            ? null
            : new Date(wert);
    }

    if (typeof wert === "string") {
        const deutschesDatum =
            wert.match(
                /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
            );

        if (deutschesDatum) {
            const tag =
                Number(deutschesDatum[1]);

            const monat =
                Number(deutschesDatum[2]) - 1;

            const jahr =
                Number(deutschesDatum[3]);

            const datum =
                new Date(
                    jahr,
                    monat,
                    tag
                );

            if (
                datum.getFullYear() === jahr &&
                datum.getMonth() === monat &&
                datum.getDate() === tag
            ) {
                return datum;
            }

            return null;
        }
    }

    const datum = new Date(wert);

    if (Number.isNaN(datum.getTime())) {
        return null;
    }

    return datum;
}

// =====================================
// Datumsfunktionen
// =====================================

function tagesbeginn(datum) {
    return new Date(
        datum.getFullYear(),
        datum.getMonth(),
        datum.getDate()
    );
}

function monateAbziehen(datum, monate) {
    return datumMitMonatsverschiebung(
        datum,
        -Math.abs(monate)
    );
}

function monateHinzufuegen(datum, monate) {
    return datumMitMonatsverschiebung(
        datum,
        Math.abs(monate)
    );
}

function datumMitMonatsverschiebung(
    datum,
    monatsDifferenz
) {
    const ausgangsdatum =
        new Date(datum);

    const urspruenglicherTag =
        ausgangsdatum.getDate();

    const ergebnis =
        new Date(
            ausgangsdatum.getFullYear(),
            ausgangsdatum.getMonth(),
            1
        );

    ergebnis.setMonth(
        ergebnis.getMonth() +
        monatsDifferenz
    );

    const letzterTag =
        new Date(
            ergebnis.getFullYear(),
            ergebnis.getMonth() + 1,
            0
        ).getDate();

    ergebnis.setDate(
        Math.min(
            urspruenglicherTag,
            letzterTag
        )
    );

    return tagesbeginn(ergebnis);
}

// =====================================
// Zahlenfunktionen
// =====================================

function positiveGanzzahl(
    wert,
    standardwert
) {
    const zahl =
        Number.parseInt(wert, 10);

    return (
        Number.isFinite(zahl) &&
        zahl > 0
    )
        ? zahl
        : standardwert;
}

function nichtNegativeGanzzahl(
    wert,
    standardwert
) {
    const zahl =
        Number.parseInt(wert, 10);

    return (
        Number.isFinite(zahl) &&
        zahl >= 0
    )
        ? zahl
        : standardwert;
}

function prozentBerechnen(
    istWert,
    sollWert
) {
    const ist = Number(istWert);
    const soll = Number(sollWert);

    if (
        !Number.isFinite(soll) ||
        soll <= 0
    ) {
        return 100;
    }

    if (!Number.isFinite(ist)) {
        return 0;
    }

    return Math.min(
        100,
        Math.max(
            0,
            Math.round(
                ist / soll * 100
            )
        )
    );
}

// =====================================
// Formatierung
// =====================================

function datumFormatieren(datum) {
    if (
        !(datum instanceof Date) ||
        Number.isNaN(datum.getTime())
    ) {
        return "-";
    }

    return datum.toLocaleDateString(
        "de-AT",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }
    );
}

function zahlFormatieren(
    wert,
    nachkommastellen = 0
) {
    const zahl = Number(wert);

    if (!Number.isFinite(zahl)) {
        return "0";
    }

    return zahl.toLocaleString(
        "de-AT",
        {
            minimumFractionDigits:
                nachkommastellen,

            maximumFractionDigits:
                nachkommastellen
        }
    );
}

function flugzeitFormatieren(minuten) {
    const gesamtMinuten =
        Math.max(
            0,
            Math.round(
                Number(minuten) || 0
            )
        );

    const stunden =
        Math.floor(
            gesamtMinuten / 60
        );

    const restMinuten =
        gesamtMinuten % 60;

    return `${stunden}h ${restMinuten}m`;
}

// =====================================
// Meldung anzeigen
// =====================================

function monitorMeldungAnzeigen(
    text,
    typ
) {
    const meldung =
        document.getElementById(
            "monitorMeldung"
        );

    if (!meldung) {
        return;
    }

    meldung.textContent = text;

    meldung.className =
        `monitor-meldung monitor-meldung-${typ}`;

    window.clearTimeout(
        monitorMeldungAnzeigen.timeoutId
    );

    monitorMeldungAnzeigen.timeoutId =
        window.setTimeout(
            function () {
                meldung.textContent = "";
                meldung.className =
                    "monitor-meldung";
            },
            4000
        );
}

// =====================================
// Initialisierung
// =====================================

function aktivitaetsmonitorInitialisieren() {
    const einstellungen =
        monitorEinstellungenLaden();

    monitorEinstellungenInFormularEintragen(
        einstellungen
    );

    aktivitaetsmonitorAktualisieren();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        aktivitaetsmonitorInitialisieren
    );
} else {
    aktivitaetsmonitorInitialisieren();
}
