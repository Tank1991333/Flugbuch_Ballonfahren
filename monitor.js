// =====================================
// Ballonflugbuch Professional
// monitor.js
// Aktivitaetsmonitor
// =====================================

"use strict";

// =====================================
// Standardeinstellungen
// =====================================

const STANDARD_MONITOR_EINSTELLUNGEN = Object.freeze({
    zeitraumMonate: 24,
    erforderlicheFahrten: 6,
    erforderlicheLandungen: 10
});

const MONITOR_SPEICHERSCHLUESSEL = "monitorEinstellungen";

// =====================================
// Einstellungen laden
// =====================================

function monitorEinstellungenLaden() {
    try {
        const gespeichert = localStorage.getItem(
            MONITOR_SPEICHERSCHLUESSEL
        );

        if (!gespeichert) {
            return {
                ...STANDARD_MONITOR_EINSTELLUNGEN
            };
        }

        const daten = JSON.parse(gespeichert);

        if (!daten || typeof daten !== "object") {
            throw new Error(
                "Ungültiges Format der gespeicherten Monitoreinstellungen."
            );
        }

        return {
            zeitraumMonate: positiveGanzzahl(
                daten.zeitraumMonate,
                STANDARD_MONITOR_EINSTELLUNGEN.zeitraumMonate
            ),

            erforderlicheFahrten: nichtNegativeGanzzahl(
                daten.erforderlicheFahrten,
                STANDARD_MONITOR_EINSTELLUNGEN.erforderlicheFahrten
            ),

            erforderlicheLandungen: nichtNegativeGanzzahl(
                daten.erforderlicheLandungen,
                STANDARD_MONITOR_EINSTELLUNGEN.erforderlicheLandungen
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
    const zeitraumFeld = document.getElementById(
        "monitorZeitraum"
    );

    const fahrtenFeld = document.getElementById(
        "monitorSollFahrten"
    );

    const landungenFeld = document.getElementById(
        "monitorSollLandungen"
    );

    if (!zeitraumFeld || !fahrtenFeld || !landungenFeld) {
        console.warn(
            "Die Eingabefelder für den Aktivitätsmonitor wurden nicht gefunden."
        );
        return;
    }

    const einstellungen = {
        zeitraumMonate: positiveGanzzahl(
            zeitraumFeld.value,
            STANDARD_MONITOR_EINSTELLUNGEN.zeitraumMonate
        ),

        erforderlicheFahrten: nichtNegativeGanzzahl(
            fahrtenFeld.value,
            STANDARD_MONITOR_EINSTELLUNGEN.erforderlicheFahrten
        ),

        erforderlicheLandungen: nichtNegativeGanzzahl(
            landungenFeld.value,
            STANDARD_MONITOR_EINSTELLUNGEN.erforderlicheLandungen
        )
    };

    try {
        localStorage.setItem(
            MONITOR_SPEICHERSCHLUESSEL,
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
            MONITOR_SPEICHERSCHLUESSEL
        );

        const standardwerte = {
            ...STANDARD_MONITOR_EINSTELLUNGEN
        };

        monitorEinstellungenInFormularEintragen(
            standardwerte
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
// Einstellungen in das Formular schreiben
// =====================================

function monitorEinstellungenInFormularEintragen(
    einstellungen
) {
    if (!einstellungen) {
        return;
    }

    const zeitraumFeld = document.getElementById(
        "monitorZeitraum"
    );

    const fahrtenFeld = document.getElementById(
        "monitorSollFahrten"
    );

    const landungenFeld = document.getElementById(
        "monitorSollLandungen"
    );

    if (zeitraumFeld) {
        zeitraumFeld.value = String(
            einstellungen.zeitraumMonate
        );
    }

    if (fahrtenFeld) {
        fahrtenFeld.value = String(
            einstellungen.erforderlicheFahrten
        );
    }

    if (landungenFeld) {
        landungenFeld.value = String(
            einstellungen.erforderlicheLandungen
        );
    }
}

// =====================================
// Flugliste ermitteln
// =====================================

function monitorFluegeErmitteln() {
    if (Array.isArray(window.fluege)) {
        return window.fluege;
    }

    /*
     * Unterstützt auch eine globale Variable "fluege",
     * sofern sie von einem anderen Skript bereitgestellt wird.
     */
    if (
        typeof fluege !== "undefined" &&
        Array.isArray(fluege)
    ) {
        return fluege;
    }

    return [];
}

// =====================================
// Aktivitätsmonitor berechnen
// =====================================

function aktivitaetsmonitorBerechnen() {
    const einstellungen = monitorEinstellungenLaden();

    const heute = tagesbeginn(
        new Date()
    );

    const beginnZeitraum = monateAbziehen(
        heute,
        einstellungen.zeitraumMonate
    );

    const vorhandeneFluege = monitorFluegeErmitteln();

    const relevanteFluege = vorhandeneFluege
        .map(function (flug, index) {
            return {
                flug: flug,
                index: index,
                datum: flugDatumErmitteln(flug)
            };
        })
        .filter(function (eintrag) {
            if (!eintrag.datum) {
                return false;
            }

            const flugtag = tagesbeginn(
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

    const anzahlFahrten = relevanteFluege.length;

    const anzahlLandungen = relevanteFluege.reduce(
        function (summe, eintrag) {
            return (
                summe +
                positiveZahlOderNull(
                    eintrag.flug.landungen
                )
            );
        },
        0
    );

    const flugzeitMinuten = relevanteFluege.reduce(
        function (summe, eintrag) {
            return (
                summe +
                positiveZahlOderNull(
                    eintrag.flug.flugzeit
                )
            );
        },
        0
    );

    const streckeKm = relevanteFluege.reduce(
        function (summe, eintrag) {
            return (
                summe +
                positiveZahlOderNull(
                    eintrag.flug.strecke
                )
            );
        },
        0
    );

    const fehlendeFahrten = Math.max(
        0,
        einstellungen.erforderlicheFahrten -
            anzahlFahrten
    );

    const fehlendeLandungen = Math.max(
        0,
        einstellungen.erforderlicheLandungen -
            anzahlLandungen
    );

    const fahrtenErfuellt = fehlendeFahrten === 0;
    const landungenErfuellt = fehlendeLandungen === 0;

    const allesErfuellt =
        fahrtenErfuellt &&
        landungenErfuellt;

    const naechsterAustritt = naechstenAustrittBerechnen(
        relevanteFluege,
        einstellungen.zeitraumMonate,
        heute
    );

    return {
        einstellungen: einstellungen,
        heute: heute,
        beginnZeitraum: beginnZeitraum,
        relevanteFluege: relevanteFluege,
        anzahlFahrten: anzahlFahrten,
        anzahlLandungen: anzahlLandungen,
        flugzeitMinuten: flugzeitMinuten,
        streckeKm: streckeKm,
        fehlendeFahrten: fehlendeFahrten,
        fehlendeLandungen: fehlendeLandungen,
        fahrtenErfuellt: fahrtenErfuellt,
        landungenErfuellt: landungenErfuellt,
        allesErfuellt: allesErfuellt,
        naechsterAustritt: naechsterAustritt
    };
}

// =====================================
// Monitor anzeigen
// =====================================

function aktivitaetsmonitorAktualisieren() {
    const container = document.getElementById(
        "aktivitaetsmonitorInhalt"
    );

    if (!container) {
        return;
    }

    try {
        const auswertung = aktivitaetsmonitorBerechnen();

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

        const fahrtenProzent = prozentBerechnen(
            anzahlFahrten,
            einstellungen.erforderlicheFahrten
        );

        const landungenProzent = prozentBerechnen(
            anzahlLandungen,
            einstellungen.erforderlicheLandungen
        );

        const statusKlasse = allesErfuellt
            ? "monitor-status-erfuellt"
            : "monitor-status-offen";

        const statusText = allesErfuellt
            ? "🟢 Alle eingestellten Anforderungen sind erfüllt."
            : "🔴 Die eingestellten Anforderungen sind noch nicht vollständig erfüllt.";

        const naechsterAustrittHtml =
            monitorNaechsterAustrittHtml(
                naechsterAustritt
            );

        container.innerHTML = `
            <div class="monitor-zeitraum">
                <div>
                    <span>Auswertung von</span>
                    <strong>
                        ${datumFormatieren(beginnZeitraum)}
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
                            einstellungen.zeitraumMonate
                        )} Monate
                    </strong>
                </div>
            </div>

            <div class="monitor-werte">
                ${monitorWertHtml({
                    titel: "Fahrten",
                    symbol: "🎈",
                    istWert: anzahlFahrten,
                    sollWert:
                        einstellungen.erforderlicheFahrten,
                    fehlend: fehlendeFahrten,
                    erfuellt: fahrtenErfuellt,
                    prozent: fahrtenProzent
                })}

                ${monitorWertHtml({
                    titel: "Landungen",
                    symbol: "🛬",
                    istWert: anzahlLandungen,
                    sollWert:
                        einstellungen.erforderlicheLandungen,
                    fehlend: fehlendeLandungen,
                    erfuellt: landungenErfuellt,
                    prozent: landungenProzent
                })}
            </div>

            <div class="monitor-zusatzwerte">
                <div>
                    <span>⏱ Flugzeit</span>
                    <strong>
                        ${flugzeitFormatieren(flugzeitMinuten)}
                    </strong>
                </div>

                <div>
                    <span>🗺 Strecke</span>
                    <strong>
                        ${zahlFormatieren(streckeKm, 1)} km
                    </strong>
                </div>
            </div>

            <div
                class="monitor-status ${statusKlasse}"
                role="status"
            >
                ${statusText}
            </div>

            <div class="monitor-restwerte">
                <div>
                    <span>Noch benötigte Fahrten</span>
                    <strong>
                        ${
                            fahrtenErfuellt
                                ? "0 ✅"
                                : `${zahlFormatieren(
                                    fehlendeFahrten
                                )} ⚠️`
                        }
                    </strong>
                </div>

                <div>
                    <span>Noch benötigte Landungen</span>
                    <strong>
                        ${
                            landungenErfuellt
                                ? "0 ✅"
                                : `${zahlFormatieren(
                                    fehlendeLandungen
                                )} ⚠️`
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
    } catch (error) {
        console.error(
            "Der Aktivitätsmonitor konnte nicht aktualisiert werden:",
            error
        );

        container.innerHTML = `
            <div
                class="monitor-status monitor-status-offen"
                role="alert"
            >
                ❌ Der Aktivitätsmonitor konnte nicht geladen werden.
            </div>
        `;
    }
}

// =====================================
// Einzelnen Monitorwert erzeugen
// =====================================

function monitorWertHtml(daten) {
    const istWert = positiveZahlOderNull(
        daten.istWert
    );

    const sollWert = positiveZahlOderNull(
        daten.sollWert
    );

    const fehlend = positiveZahlOderNull(
        daten.fehlend
    );

    const prozent = Math.min(
        100,
        Math.max(
            0,
            Number(daten.prozent) || 0
        )
    );

    const statusSymbol = daten.erfuellt
        ? "✅"
        : "⚠️";

    const statusText = daten.erfuellt
        ? "Anforderung erfüllt"
        : `Noch ${zahlFormatieren(fehlend)} erforderlich`;

    const klasse = daten.erfuellt
        ? "monitor-wert-erfuellt"
        : "monitor-wert-offen";

    return `
        <div class="monitor-wert ${klasse}">
            <div class="monitor-wert-kopf">
                <span>
                    ${daten.symbol} ${daten.titel}
                </span>

                <strong aria-hidden="true">
                    ${statusSymbol}
                </strong>
            </div>

            <div class="monitor-wert-zahlen">
                <strong>
                    ${zahlFormatieren(istWert)}
                </strong>

                <span>
                    von ${zahlFormatieren(sollWert)}
                </span>
            </div>

            <div
                class="monitor-fortschritt"
                role="progressbar"
                aria-label="${daten.titel}"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${prozent}"
            >
                <div
                    class="monitor-fortschritt-balken"
                    style="width: ${prozent}%"
                ></div>
            </div>

            <p>${statusText}</p>
        </div>
    `;
}

// =====================================
// Hinweis zum nächsten Austritt erzeugen
// =====================================

function monitorNaechsterAustrittHtml(
    naechsterAustritt
) {
    if (!naechsterAustritt) {
        return `
            <div class="monitor-hinweis">
                <strong>
                    ⏳ Nächster Austritt:
                </strong>

                <span>
                    Kein relevanter Flug vorhanden
                </span>
            </div>
        `;
    }

    return `
        <div class="monitor-hinweis">
            <strong>
                ⏳ Nächster Flug fällt aus dem Zeitraum:
            </strong>

            <span>
                ${datumFormatieren(
                    naechsterAustritt.austrittsdatum
                )}
            </span>

            <small>
                Flug vom
                ${datumFormatieren(
                    naechsterAustritt.flugdatum
                )}
                mit
                ${zahlFormatieren(
                    naechsterAustritt.landungen
                )}
                Landung(en)
            </small>
        </div>
    `;
}

// =====================================
// Nächsten Austritt berechnen
// =====================================

function naechstenAustrittBerechnen(
    relevanteFluege,
    monate,
    bezugsdatum = new Date()
) {
    if (
        !Array.isArray(relevanteFluege) ||
        relevanteFluege.length === 0
    ) {
        return null;
    }

    const heute = tagesbeginn(
        bezugsdatum
    );

    const austritte = relevanteFluege
        .map(function (eintrag) {
            const flugdatum = tagesbeginn(
                eintrag.datum
            );

            const austrittsdatum =
                monateHinzufuegen(
                    flugdatum,
                    monate
                );

            /*
             * Der Flug wird am Beginn des Betrachtungszeitraums
             * noch mitgezählt und fällt am darauffolgenden Tag
             * aus dem Zeitraum.
             */
            austrittsdatum.setDate(
                austrittsdatum.getDate() + 1
            );

            return {
                flugdatum: flugdatum,
                austrittsdatum: tagesbeginn(
                    austrittsdatum
                ),
                landungen: nichtNegativeGanzzahl(
                    eintrag.flug.landungen,
                    0
                )
            };
        })
        .filter(function (eintrag) {
            return eintrag.austrittsdatum > heute;
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

    /*
     * Zuerst wird "startzeit" geprüft.
     * Falls dort kein gültiges Datum vorhanden ist,
     * wird "datum" verwendet.
     */
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
    if (
        wert === null ||
        wert === undefined ||
        wert === ""
    ) {
        return null;
    }

    if (wert instanceof Date) {
        return Number.isNaN(wert.getTime())
            ? null
            : new Date(wert.getTime());
    }

    if (typeof wert === "string") {
        const bereinigterWert = wert.trim();

        if (!bereinigterWert) {
            return null;
        }

        /*
         * Unterstützt:
         * TT.MM.JJJJ
         * TT.MM.JJJJ HH:MM
         * TT.MM.JJJJ HH:MM:SS
         */
        const deutschesDatum = bereinigterWert.match(
            /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
        );

        if (deutschesDatum) {
            const tag = Number(
                deutschesDatum[1]
            );

            const monat = Number(
                deutschesDatum[2]
            ) - 1;

            const jahr = Number(
                deutschesDatum[3]
            );

            const stunde = Number(
                deutschesDatum[4] || 0
            );

            const minute = Number(
                deutschesDatum[5] || 0
            );

            const sekunde = Number(
                deutschesDatum[6] || 0
            );

            const datum = new Date(
                jahr,
                monat,
                tag,
                stunde,
                minute,
                sekunde
            );

            if (
                datum.getFullYear() === jahr &&
                datum.getMonth() === monat &&
                datum.getDate() === tag &&
                datum.getHours() === stunde &&
                datum.getMinutes() === minute &&
                datum.getSeconds() === sekunde
            ) {
                return datum;
            }

            return null;
        }

        /*
         * ISO-Datumsformat JJJJ-MM-TT wird lokal eingelesen.
         * Dadurch werden Verschiebungen durch UTC vermieden.
         */
        const isoDatum = bereinigterWert.match(
            /^(\d{4})-(\d{2})-(\d{2})$/
        );

        if (isoDatum) {
            const jahr = Number(isoDatum[1]);
            const monat = Number(isoDatum[2]) - 1;
            const tag = Number(isoDatum[3]);

            const datum = new Date(
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

        const datum = new Date(
            bereinigterWert
        );

        return Number.isNaN(datum.getTime())
            ? null
            : datum;
    }

    if (typeof wert === "number") {
        const datum = new Date(wert);

        return Number.isNaN(datum.getTime())
            ? null
            : datum;
    }

    return null;
}

// =====================================
// Datumsfunktionen
// =====================================

function tagesbeginn(datum) {
    const gueltigesDatum =
        datum instanceof Date
            ? datum
            : new Date(datum);

    if (Number.isNaN(gueltigesDatum.getTime())) {
        return new Date(NaN);
    }

    return new Date(
        gueltigesDatum.getFullYear(),
        gueltigesDatum.getMonth(),
        gueltigesDatum.getDate()
    );
}

function monateAbziehen(datum, monate) {
    return datumMitMonatsverschiebung(
        datum,
        -Math.abs(
            nichtNegativeGanzzahl(monate, 0)
        )
    );
}

function monateHinzufuegen(datum, monate) {
    return datumMitMonatsverschiebung(
        datum,
        Math.abs(
            nichtNegativeGanzzahl(monate, 0)
        )
    );
}

function datumMitMonatsverschiebung(
    datum,
    monatsDifferenz
) {
    const ausgangsdatum = new Date(datum);

    if (Number.isNaN(ausgangsdatum.getTime())) {
        return new Date(NaN);
    }

    const urspruenglicherTag =
        ausgangsdatum.getDate();

    const ergebnis = new Date(
        ausgangsdatum.getFullYear(),
        ausgangsdatum.getMonth(),
        1
    );

    ergebnis.setMonth(
        ergebnis.getMonth() +
            Number(monatsDifferenz || 0)
    );

    const letzterTag = new Date(
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
    const zahl = Number.parseInt(
        wert,
        10
    );

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
    const zahl = Number.parseInt(
        wert,
        10
    );

    return (
        Number.isFinite(zahl) &&
        zahl >= 0
    )
        ? zahl
        : standardwert;
}

function positiveZahlOderNull(wert) {
    let normalisierterWert = wert;

    /*
     * Unterstützt bei Bedarf auch österreichische
     * Dezimalzahlen wie "12,5".
     */
    if (typeof normalisierterWert === "string") {
        normalisierterWert =
            normalisierterWert
                .trim()
                .replace(",", ".");
    }

    const zahl = Number(
        normalisierterWert
    );

    return (
        Number.isFinite(zahl) &&
        zahl > 0
    )
        ? zahl
        : 0;
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

    if (
        !Number.isFinite(ist) ||
        ist <= 0
    ) {
        return 0;
    }

    return Math.min(
        100,
        Math.max(
            0,
            Math.round(
                (ist / soll) * 100
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

    const stellen = Math.max(
        0,
        nichtNegativeGanzzahl(
            nachkommastellen,
            0
        )
    );

    return zahl.toLocaleString(
        "de-AT",
        {
            minimumFractionDigits: stellen,
            maximumFractionDigits: stellen
        }
    );
}

function flugzeitFormatieren(minuten) {
    const gesamtMinuten = Math.max(
        0,
        Math.round(
            Number(minuten) || 0
        )
    );

    const stunden = Math.floor(
        gesamtMinuten / 60
    );

    const restMinuten =
        gesamtMinuten % 60;

    return `${stunden}h ${String(
        restMinuten
    ).padStart(2, "0")}m`;
}

// =====================================
// Meldung anzeigen
// =====================================

function monitorMeldungAnzeigen(
    text,
    typ
) {
    const meldung = document.getElementById(
        "monitorMeldung"
    );

    if (!meldung) {
        return;
    }

    meldung.textContent = String(
        text || ""
    );

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
// Ereignisse registrieren
// =====================================

function monitorEreignisseRegistrieren() {
    const speichernSchaltflaeche =
        document.getElementById(
            "monitorSpeichern"
        );

    const zuruecksetzenSchaltflaeche =
        document.getElementById(
            "monitorZuruecksetzen"
        );

    if (
        speichernSchaltflaeche &&
        speichernSchaltflaeche.dataset
            .monitorEreignisRegistriert !== "true"
    ) {
        speichernSchaltflaeche.addEventListener(
            "click",
            monitorEinstellungenSpeichern
        );

        speichernSchaltflaeche.dataset
            .monitorEreignisRegistriert = "true";
    }

    if (
        zuruecksetzenSchaltflaeche &&
        zuruecksetzenSchaltflaeche.dataset
            .monitorEreignisRegistriert !== "true"
    ) {
        zuruecksetzenSchaltflaeche.addEventListener(
            "click",
            monitorEinstellungenZuruecksetzen
        );

        zuruecksetzenSchaltflaeche.dataset
            .monitorEreignisRegistriert = "true";
    }
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

    monitorEreignisseRegistrieren();
    aktivitaetsmonitorAktualisieren();
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        aktivitaetsmonitorInitialisieren,
        {
            once: true
        }
    );
} else {
    aktivitaetsmonitorInitialisieren();
}

// =====================================
// Funktionen bewusst global bereitstellen
// =====================================

window.monitorEinstellungenSpeichern =
    monitorEinstellungenSpeichern;

window.monitorEinstellungenZuruecksetzen =
    monitorEinstellungenZuruecksetzen;

window.aktivitaetsmonitorAktualisieren =
    aktivitaetsmonitorAktualisieren;

window.aktivitaetsmonitorBerechnen =
    aktivitaetsmonitorBerechnen;
