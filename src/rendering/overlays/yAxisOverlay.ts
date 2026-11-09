import * as d3 from "d3";
import { YAxisSettingsCard } from "../../settings/cards/axes";

// Renders the Y-axis (line, ticks, labels) into a viewport-pinned SVG
// that sits OUTSIDE the scrolling chart container so the axis stays
// anchored to the left edge of the visual even when bubbles scroll
// horizontally. Returns the total width consumed by the overlay.
export function renderYAxisOverlay(
    yAxisOverlay: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    yAxisCard: YAxisSettingsCard,
    yScale: d3.ScaleLinear<number, number>,
    plotHeight: number,
    chartTopOffset: number,
    yTickValues: number[],
    leftOffset: number = 0
): number {
    yAxisOverlay.selectAll("*").remove();
    if (!yAxisCard.show.value) {
        yAxisOverlay.style("width", "0").style("height", "0")
            .attr("width", 0).attr("height", 0);
        return 0;
    }

    const Y_TITLE_WIDTH = yAxisCard.title.value ? 14 : 0;
    const Y_LABELS_WIDTH = 32;
    const totalWidth = Y_TITLE_WIDTH + Y_LABELS_WIDTH;

    // Vertical padding on each side of the plot area inside the
    // overlay SVG. Without it the bottom + top tick labels would get
    // clipped by the SVG's default overflow:hidden.
    const Y_LABEL_PAD = 8;

    yAxisOverlay
        .style("top", (chartTopOffset - Y_LABEL_PAD) + "px")
        .style("left", leftOffset + "px")
        .style("width", totalWidth + "px")
        .style("height", (plotHeight + 2 * Y_LABEL_PAD) + "px")
        .attr("width", totalWidth)
        .attr("height", plotHeight + 2 * Y_LABEL_PAD);

    const axisG = yAxisOverlay.append("g")
        .attr("transform", `translate(${totalWidth},${Y_LABEL_PAD})`);

    const yDecimalPlaces = yAxisCard.decimalPlaces.value;
    // `.tickValues(...)` mirrors the inline axis exactly — using
    // `.ticks(N)` here would re-derive a fresh "nice" set and silently
    // diverge from gridlines + inline labels.
    const yAxisGen = d3.axisLeft(yScale).tickValues(yTickValues).tickSize(3).tickPadding(2);
    if (yDecimalPlaces >= 0) {
        yAxisGen.tickFormat(d => Number(d).toFixed(yDecimalPlaces));
    }
    axisG.call(yAxisGen);
    axisG.selectAll("text")
        .attr("fill", yAxisCard.labelColor.value.value)
        .attr("font-size", yAxisCard.fontSize.value + "px")
        .attr("font-family", yAxisCard.fontFamily.value || "Segoe UI")
        .attr("font-weight", yAxisCard.fontBold.value ? "bold" : "normal")
        .attr("font-style", yAxisCard.fontItalic.value ? "italic" : "normal")
        .attr("text-decoration", yAxisCard.fontUnderline.value ? "underline" : "none");
    axisG.selectAll("line, path").attr("stroke", yAxisCard.labelColor.value.value);
    // Override .domain so the axis baseline spans the full plot height —
    // closes the L-corner cleanly. x=-0.5 keeps the 1px stroke inside
    // the SVG (the default M0.5 would be clipped).
    axisG.select(".domain")
        .attr("d", `M-0.5,0V${plotHeight}`);

    return totalWidth;
}
