import * as d3 from "d3";
import { XAxisSettingsCard, YAxisSettingsCard } from "../../settings/cards/axes";
import { BubbleViewModel } from "../../domain/types";

// Renders the X and Y axis titles into viewport-pinned overlay SVGs that
// live OUTSIDE the scrolling chart container. Titles stay anchored to
// the visual viewport regardless of horizontal scroll position.
export function renderAxisTitlesOverlay(
    xTitleOverlay: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    yTitleOverlay: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    xAxisCard: XAxisSettingsCard,
    yAxisCard: YAxisSettingsCard,
    viewportWidth: number,
    viewportHeight: number,
    legendHeightTop: number,
    legendHeightBottom: number,
    chartTopOffset: number,
    xTitleTopY: number,
    leftMargin: number,
    plotHeight: number,
    viewModel: BubbleViewModel,
    scrollbarReserve: number = 0,
    xTitleLeftOffset: number = 0,
    yTitleLeftOffset: number = 0
): void {
    xTitleOverlay.selectAll("*").remove();
    yTitleOverlay.selectAll("*").remove();

    // ── X-axis title overlay ──────────────────────────────────────
    if (xAxisCard.show.value && xAxisCard.title.value) {
        const titleText = xAxisCard.titleText.value || viewModel.xFieldName || "X-Axis";
        const titleFont = xAxisCard.titleFontSize.value || (xAxisCard.fontSize.value + 1);
        const titleColor = xAxisCard.titleColor.value.value || xAxisCard.labelColor.value.value;
        const overlayHeight = titleFont + 2;
        // Centre the title over the BUBBLE PLOT, not the entire viewport
        // — offset by the external Y-axis width and shrink accordingly.
        const overlayWidth = Math.max(0, viewportWidth - xTitleLeftOffset);
        xTitleOverlay
            .style("top", (viewportHeight - legendHeightBottom - scrollbarReserve - overlayHeight) + "px")
            .style("left", xTitleLeftOffset + "px")
            .style("width", overlayWidth + "px")
            .style("height", overlayHeight + "px")
            .attr("width", overlayWidth)
            .attr("height", overlayHeight);
        xTitleOverlay.append("text")
            .attr("x", overlayWidth / 2)
            .attr("y", overlayHeight - 4)
            .attr("text-anchor", "middle")
            .attr("font-size", titleFont + "px")
            .attr("font-family", xAxisCard.titleFontFamily.value || "Segoe UI")
            .attr("font-weight", xAxisCard.titleFontBold.value ? "bold" : "normal")
            .attr("font-style", xAxisCard.titleFontItalic.value ? "italic" : "normal")
            .attr("text-decoration", xAxisCard.titleFontUnderline.value ? "underline" : "none")
            .attr("fill", titleColor)
            .text(titleText);
    } else {
        xTitleOverlay.style("width", "0").style("height", "0")
            .attr("width", 0).attr("height", 0);
    }

    // ── Y-axis title overlay (rotated -90°) ──────────────────────
    if (yAxisCard.show.value && yAxisCard.title.value) {
        const titleText = yAxisCard.titleText.value || viewModel.yFieldName || "Y-Axis";
        const titleFont = yAxisCard.titleFontSize.value || (yAxisCard.fontSize.value + 1);
        const titleColor = yAxisCard.titleColor.value.value || yAxisCard.labelColor.value.value;
        const overlayWidth = Math.max(14, Math.min(leftMargin, 24));
        // `yTitleLeftOffset` shifts the title overlay right of any
        // LEFT-side legend so the rotated text doesn't render inside
        // the legend column.
        yTitleOverlay
            .style("top", chartTopOffset + "px")
            .style("left", yTitleLeftOffset + "px")
            .style("width", overlayWidth + "px")
            .style("height", plotHeight + "px")
            .attr("width", overlayWidth)
            .attr("height", plotHeight);
        yTitleOverlay.append("text")
            .attr("x", -plotHeight / 2)
            .attr("y", overlayWidth - 4)
            .attr("transform", "rotate(-90)")
            .attr("text-anchor", "middle")
            .attr("font-size", titleFont + "px")
            .attr("font-family", yAxisCard.titleFontFamily.value || "Segoe UI")
            .attr("font-weight", yAxisCard.titleFontBold.value ? "bold" : "normal")
            .attr("font-style", yAxisCard.titleFontItalic.value ? "italic" : "normal")
            .attr("text-decoration", yAxisCard.titleFontUnderline.value ? "underline" : "none")
            .attr("fill", titleColor)
            .text(titleText);
    } else {
        yTitleOverlay.style("width", "0").style("height", "0")
            .attr("width", 0).attr("height", 0);
    }

    // Reference unused params so TS doesn't complain.
    void legendHeightTop;
    void xTitleTopY;
}
