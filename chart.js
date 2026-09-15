"use strict";

(function (global) {
    const aktiveDiagramme = new Set();

    function zahl(value, fallback = 0) {
        const result = Number(value);

        return Number.isFinite(result)
            ? result
            : fallback;
    }

    function farbe(value, fallback) {
        return typeof value === "string" &&
            value.trim()
            ? value
            : fallback;
    }

    function rundeRechteck(
        ctx,
        x,
        y,
        width,
        height,
        radius
    ) {
        const r = Math.max(
            0,
            Math.min(
                radius,
                Math.abs(width) / 2,
                Math.abs(height) / 2
            )
        );

        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + width - r, y);

        ctx.quadraticCurveTo(
            x + width,
            y,
            x + width,
            y + r
        );

        ctx.lineTo(
            x + width,
            y + height - r
        );

        ctx.quadraticCurveTo(
            x + width,
            y + height,
            x + width - r,
            y + height
        );

        ctx.lineTo(x + r, y + height);

        ctx.quadraticCurveTo(
            x,
            y + height,
            x,
            y + height - r
        );

        ctx.lineTo(x, y + r);

        ctx.quadraticCurveTo(
            x,
            y,
            x + r,
            y
        );

        ctx.closePath();
    }

    class Chart {
        constructor(canvas, config = {}) {
            if (typeof canvas === "string") {
                canvas =
                    document.getElementById(canvas);
            }

            if (
                !(
                    canvas instanceof
                    HTMLCanvasElement
                )
            ) {
                throw new TypeError(
                    "Chart benötigt ein gültiges Canvas-Element."
                );
            }

            const context =
                canvas.getContext("2d");

            if (!context) {
                throw new Error(
                    "Der 2D-Canvas-Kontext ist nicht verfügbar."
                );
            }

            this.canvas = canvas;
            this.ctx = context;
            this.config = config;

            this.type =
                config.type || "line";

            this.data =
                config.data || {
                    labels: [],
                    datasets: []
                };

            this.options =
                config.options || {};

            this.zerstoert = false;

            this.pixelRatio = Math.max(
                1,
                global.devicePixelRatio || 1
            );

            this.resizeObserver =
                typeof ResizeObserver !==
                "undefined"
                    ? new ResizeObserver(
                        () => this.resize()
                    )
                    : null;

            this.resizeObserver?.observe(
                canvas.parentElement || canvas
            );

            this.resizeHandler =
                () => this.resize();

            global.addEventListener(
                "resize",
                this.resizeHandler
            );

            aktiveDiagramme.add(this);

            this.resize();
        }

        resize() {
            if (this.zerstoert) {
                return;
            }

            const parent =
                this.canvas.parentElement;

            const rect =
                (
                    parent ||
                    this.canvas
                ).getBoundingClientRect();

            const cssWidth = Math.max(
                260,
                Math.floor(
                    rect.width || 600
                )
            );

            const cssHeight = Math.max(
                220,
                Math.floor(
                    rect.height || 320
                )
            );

            const ratio = Math.max(
                1,
                global.devicePixelRatio || 1
            );

            this.pixelRatio = ratio;

            this.canvas.style.width =
                `${cssWidth}px`;

            this.canvas.style.height =
                `${cssHeight}px`;

            this.canvas.width =
                Math.floor(cssWidth * ratio);

            this.canvas.height =
                Math.floor(cssHeight * ratio);

            this.ctx.setTransform(
                ratio,
                0,
                0,
                ratio,
                0,
                0
            );

            this.width = cssWidth;
            this.height = cssHeight;

            this.draw();
        }

        update() {
            if (this.zerstoert) {
                return;
            }

            this.type =
                this.config.type ||
                this.type;

            this.data =
                this.config.data ||
                this.data;

            this.options =
                this.config.options ||
                this.options;

            this.draw();
        }

        clear() {
            this.ctx.clearRect(
                0,
                0,
                this.width,
                this.height
            );
        }

        destroy() {
            if (this.zerstoert) {
                return;
            }

            this.zerstoert = true;

            this.resizeObserver?.disconnect();

            global.removeEventListener(
                "resize",
                this.resizeHandler
            );

            aktiveDiagramme.delete(this);

            this.ctx.clearRect(
                0,
                0,
                this.canvas.width,
                this.canvas.height
            );
        }

        draw() {
            if (
                this.zerstoert ||
                !this.width ||
                !this.height
            ) {
                return;
            }

            this.clear();

            if (this.type === "bar") {
                this.drawBarChart();
            } else {
                this.drawLineChart();
            }
        }

        getLayout() {
            const legendHeight =
                this.options?.plugins
                    ?.legend === false
                    ? 0
                    : 34;

            return {
                left: 54,
                right: 18,
                top: 18 + legendHeight,
                bottom: 44,
                legendHeight
            };
        }

        getValues() {
            const datasets =
                Array.isArray(
                    this.data?.datasets
                )
                    ? this.data.datasets
                    : [];

            return datasets.flatMap(
                (dataset) =>
                    (
                        Array.isArray(
                            dataset.data
                        )
                            ? dataset.data
                            : []
                    )
                        .map(
                            (value) =>
                                Number(value)
                        )
                        .filter(
                            Number.isFinite
                        )
            );
        }

        getRange() {
            const values =
                this.getValues();

            let minimum =
                values.length
                    ? Math.min(...values)
                    : 0;

            let maximum =
                values.length
                    ? Math.max(...values)
                    : 1;

            if (
                this.options?.scales?.y
                    ?.beginAtZero !== false
            ) {
                minimum = Math.min(
                    0,
                    minimum
                );
            }

            if (minimum === maximum) {
                maximum = minimum + 1;
            }

            const padding =
                (maximum - minimum) * 0.1;

            return {
                minimum,
                maximum:
                    maximum + padding
            };
        }

        drawLegend(layout) {
            if (
                this.options?.plugins
                    ?.legend === false
            ) {
                return;
            }

            const datasets =
                Array.isArray(
                    this.data?.datasets
                )
                    ? this.data.datasets
                    : [];

            const ctx = this.ctx;

            let x = layout.left;

            const y = 18;

            ctx.save();

            ctx.font =
                "12px Segoe UI, Arial, sans-serif";

            ctx.textBaseline = "middle";

            datasets.forEach(
                (dataset) => {
                    const label = String(
                        dataset.label ||
                        "Daten"
                    );

                    const color = farbe(
                        dataset.borderColor ||
                        dataset.backgroundColor,
                        "#168cff"
                    );

                    ctx.fillStyle = color;

                    ctx.fillRect(
                        x,
                        y - 5,
                        18,
                        10
                    );

                    ctx.fillStyle =
                        "#b6c5d4";

                    ctx.fillText(
                        label,
                        x + 25,
                        y
                    );

                    x +=
                        35 +
                        ctx.measureText(
                            label
                        ).width;
                }
            );

            ctx.restore();
        }

        drawAxes(layout, range) {
            const ctx = this.ctx;

            const plotWidth =
                this.width -
                layout.left -
                layout.right;

            const plotHeight =
                this.height -
                layout.top -
                layout.bottom;

            const tickColor = farbe(
                this.options?.scales?.y
                    ?.ticks?.color,
                "#91a7ba"
            );

            const gridColor = farbe(
                this.options?.scales?.y
                    ?.grid?.color,
                "#203548"
            );

            const steps = 5;

            ctx.save();

            ctx.font =
                "11px Segoe UI, Arial, sans-serif";

            ctx.textAlign = "right";
            ctx.textBaseline = "middle";

            for (
                let index = 0;
                index <= steps;
                index += 1
            ) {
                const ratio =
                    index / steps;

                const y =
                    layout.top +
                    plotHeight * ratio;

                const value =
                    range.maximum -
                    (
                        range.maximum -
                        range.minimum
                    ) *
                    ratio;

                ctx.strokeStyle =
                    gridColor;

                ctx.lineWidth = 1;
                ctx.beginPath();

                ctx.moveTo(
                    layout.left,
                    y
                );

                ctx.lineTo(
                    layout.left +
                    plotWidth,
                    y
                );

                ctx.stroke();

                ctx.fillStyle =
                    tickColor;

                ctx.fillText(
                    Math.round(
                        value
                    ).toLocaleString(
                        "de-AT"
                    ),
                    layout.left - 8,
                    y
                );
            }

            ctx.restore();
        }

        drawXLabels(layout) {
            const labels =
                Array.isArray(
                    this.data?.labels
                )
                    ? this.data.labels
                    : [];

            if (!labels.length) {
                return;
            }

            const ctx = this.ctx;

            const plotWidth =
                this.width -
                layout.left -
                layout.right;

            const plotHeight =
                this.height -
                layout.top -
                layout.bottom;

            const tickColor = farbe(
                this.options?.scales?.x
                    ?.ticks?.color,
                "#91a7ba"
            );

            const every = Math.max(
                1,
                Math.ceil(
                    labels.length / 12
                )
            );

            ctx.save();

            ctx.font =
                "11px Segoe UI, Arial, sans-serif";

            ctx.fillStyle =
                tickColor;

            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            labels.forEach(
                (label, index) => {
                    if (
                        index % every !== 0 &&
                        index !==
                        labels.length - 1
                    ) {
                        return;
                    }

                    const x =
                        labels.length === 1
                            ? (
                                layout.left +
                                plotWidth / 2
                            )
                            : (
                                layout.left +
                                (
                                    index /
                                    (
                                        labels.length -
                                        1
                                    )
                                ) *
                                plotWidth
                            );

                    ctx.fillText(
                        String(label),
                        x,
                        layout.top +
                        plotHeight +
                        10
                    );
                }
            );

            ctx.restore();
        }
              drawLineChart() {
            const layout =
                this.getLayout();

            const range =
                this.getRange();

            const plotWidth =
                this.width -
                layout.left -
                layout.right;

            const plotHeight =
                this.height -
                layout.top -
                layout.bottom;

            const datasets =
                Array.isArray(
                    this.data?.datasets
                )
                    ? this.data.datasets
                    : [];

            this.drawLegend(layout);
            this.drawAxes(
                layout,
                range
            );
            this.drawXLabels(layout);

            datasets.forEach(
                (dataset) => {
                    const values =
                        Array.isArray(
                            dataset.data
                        )
                            ? dataset.data
                            : [];

                    const points =
                        values.map(
                            (
                                value,
                                index
                            ) => {
                                const number =
                                    Number(value);

                                if (
                                    !Number.isFinite(
                                        number
                                    )
                                ) {
                                    return null;
                                }

                                const x =
                                    values.length ===
                                    1
                                        ? (
                                            layout.left +
                                            plotWidth /
                                            2
                                        )
                                        : (
                                            layout.left +
                                            (
                                                index /
                                                (
                                                    values.length -
                                                    1
                                                )
                                            ) *
                                            plotWidth
                                        );

                                const y =
                                    layout.top +
                                    (
                                        range.maximum -
                                        number
                                    ) /
                                    (
                                        range.maximum -
                                        range.minimum
                                    ) *
                                    plotHeight;

                                return {
                                    x,
                                    y
                                };
                            }
                        );

                    const ctx = this.ctx;

                    const lineColor =
                        farbe(
                            dataset.borderColor,
                            "#168cff"
                        );

                    const fillColor =
                        farbe(
                            dataset.backgroundColor,
                            "rgba(22, 140, 255, 0.13)"
                        );

                    ctx.save();

                    ctx.lineWidth =
                        Math.max(
                            1,
                            zahl(
                                dataset.borderWidth,
                                2
                            )
                        );

                    ctx.strokeStyle =
                        lineColor;

                    ctx.lineJoin =
                        "round";

                    ctx.lineCap =
                        "round";

                    ctx.beginPath();

                    let begonnen = false;

                    points.forEach(
                        (point) => {
                            if (!point) {
                                begonnen = false;
                                return;
                            }

                            if (!begonnen) {
                                ctx.moveTo(
                                    point.x,
                                    point.y
                                );

                                begonnen = true;
                            } else {
                                ctx.lineTo(
                                    point.x,
                                    point.y
                                );
                            }
                        }
                    );

                    ctx.stroke();

                    if (
                        dataset.fill &&
                        points.some(Boolean)
                    ) {
                        const gueltig =
                            points.filter(
                                Boolean
                            );

                        ctx.lineTo(
                            gueltig.at(-1).x,
                            layout.top +
                            plotHeight
                        );

                        ctx.lineTo(
                            gueltig[0].x,
                            layout.top +
                            plotHeight
                        );

                        ctx.closePath();

                        ctx.fillStyle =
                            fillColor;

                        ctx.fill();
                    }

                    const radius =
                        Math.max(
                            0,
                            zahl(
                                dataset.pointRadius,
                                2
                            )
                        );

                    if (radius > 0) {
                        ctx.fillStyle =
                            lineColor;

                        points
                            .filter(Boolean)
                            .forEach(
                                (point) => {
                                    ctx.beginPath();

                                    ctx.arc(
                                        point.x,
                                        point.y,
                                        radius,
                                        0,
                                        Math.PI *
                                        2
                                    );

                                    ctx.fill();
                                }
                            );
                    }

                    ctx.restore();
                }
            );
        }

        drawBarChart() {
            const layout =
                this.getLayout();

            const range =
                this.getRange();

            const plotWidth =
                this.width -
                layout.left -
                layout.right;

            const plotHeight =
                this.height -
                layout.top -
                layout.bottom;

            const labels =
                Array.isArray(
                    this.data?.labels
                )
                    ? this.data.labels
                    : [];

            const datasets =
                Array.isArray(
                    this.data?.datasets
                )
                    ? this.data.datasets
                    : [];

            this.drawLegend(layout);

            this.drawAxes(
                layout,
                range
            );

            const groupCount =
                Math.max(
                    1,
                    labels.length
                );

            const groupWidth =
                plotWidth /
                groupCount;

            const datasetCount =
                Math.max(
                    1,
                    datasets.length
                );

            const availableWidth =
                groupWidth * 0.72;

            const barWidth =
                Math.max(
                    2,
                    availableWidth /
                    datasetCount
                );

            datasets.forEach(
                (
                    dataset,
                    datasetIndex
                ) => {
                    const values =
                        Array.isArray(
                            dataset.data
                        )
                            ? dataset.data
                            : [];

                    const fillColor =
                        farbe(
                            dataset.backgroundColor,
                            "#168cff"
                        );

                    const borderColor =
                        farbe(
                            dataset.borderColor,
                            fillColor
                        );

                    const radius =
                        Math.max(
                            0,
                            zahl(
                                dataset.borderRadius,
                                0
                            )
                        );

                    values.forEach(
                        (
                            value,
                            index
                        ) => {
                            const number =
                                Number(value);

                            if (
                                !Number.isFinite(
                                    number
                                )
                            ) {
                                return;
                            }

                            const zeroY =
                                layout.top +
                                (
                                    range.maximum -
                                    Math.max(
                                        0,
                                        range.minimum
                                    )
                                ) /
                                (
                                    range.maximum -
                                    range.minimum
                                ) *
                                plotHeight;

                            const valueY =
                                layout.top +
                                (
                                    range.maximum -
                                    number
                                ) /
                                (
                                    range.maximum -
                                    range.minimum
                                ) *
                                plotHeight;

                            const x =
                                layout.left +
                                groupWidth *
                                index +
                                (
                                    groupWidth -
                                    availableWidth
                                ) /
                                2 +
                                datasetIndex *
                                barWidth;

                            const y =
                                Math.min(
                                    zeroY,
                                    valueY
                                );

                            const height =
                                Math.max(
                                    1,
                                    Math.abs(
                                        zeroY -
                                        valueY
                                    )
                                );

                            this.ctx.save();

                            rundeRechteck(
                                this.ctx,
                                x,
                                y,
                                barWidth *
                                0.9,
                                height,
                                radius
                            );

                            this.ctx.fillStyle =
                                fillColor;

                            this.ctx.fill();

                            this.ctx.strokeStyle =
                                borderColor;

                            this.ctx.lineWidth =
                                Math.max(
                                    0,
                                    zahl(
                                        dataset.borderWidth,
                                        0
                                    )
                                );

                            if (
                                this.ctx
                                    .lineWidth >
                                0
                            ) {
                                this.ctx.stroke();
                            }

                            this.ctx.restore();
                        }
                    );
                }
            );

            const ctx = this.ctx;

            const tickColor =
                farbe(
                    this.options?.scales?.x
                        ?.ticks?.color,
                    "#91a7ba"
                );

            const every =
                Math.max(
                    1,
                    Math.ceil(
                        labels.length /
                        12
                    )
                );

            ctx.save();

            ctx.font =
                "11px Segoe UI, Arial, sans-serif";

            ctx.fillStyle =
                tickColor;

            ctx.textAlign =
                "center";

            ctx.textBaseline =
                "top";

            labels.forEach(
                (label, index) => {
                    if (
                        index % every !==
                        0 &&
                        index !==
                        labels.length - 1
                    ) {
                        return;
                    }

                    ctx.fillText(
                        String(label),
                        layout.left +
                        groupWidth *
                        (
                            index +
                            0.5
                        ),
                        layout.top +
                        plotHeight +
                        10
                    );
                }
            );

            ctx.restore();
        }
    }

    Chart.version =
        "1.0.0-local";

    Chart.instances =
        aktiveDiagramme;

    global.Chart = Chart;
})(window);
