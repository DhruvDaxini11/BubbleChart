import * as d3 from "d3";
import { ErrorBarsCard } from "../../settings/cards/references";
import { BubbleDataPoint } from "../../domain/types";

// Translate the ErrorBarsCard's type+value into a numeric ± distance
// around the mean for a single category's data points.
export function computeErrorValue(values: number[], errorBars: ErrorBarsCard): number {
    const type = errorBars.type.value.value;
    const fixedVal = errorBars.value.value;
    if (!values || values.length === 0) return 0;
    const mean = d3.mean(values) || 0;
    switch (type) {
        case "standardDeviation": return d3.deviation(values) || 0;
        case "standardError": {
            const sd = d3.deviation(values) || 0;
            return sd / Math.sqrt(values.length);
        }
        case "percentage": return mean * (fixedVal / 100);
        case "fixed": return fixedVal;
        default: return 0;
    }
}

// Draws error bars (and optional band) per X-category. Each category's
// bar is centred at the category's X position; the bar's vertical
// extent is mean(y) ± computeErrorValue(yValues).
export function renderErrorBars(
    scrollContent: d3.Selection<SVGGElement, unknown, null, undefined>,
    errorBars: ErrorBarsCard,
    dataPoints: BubbleDataPoint[],
    xCategories: string[],
    yScale: d3.ScaleLinear<number, number>,
    categoryX: (xCat: string) => number
): void {
    if (!errorBars.show.value) return;
    const xGrouped = d3.group(dataPoints, d => d.xCategory);

    if (errorBars.showBand.value) {
        const bandPoints: { x: number; upper: number; lower: number }[] = [];
        xCategories.forEach(xCat => {
            const pts = xGrouped.get(xCat) || [];
            const meanY = d3.mean(pts, d => d.yValue) || 0;
            const errVal = computeErrorValue(pts.map(d => d.yValue), errorBars);
            const cx = categoryX(xCat);
            bandPoints.push({
                x: cx,
                upper: yScale(meanY + errVal),
                lower: yScale(meanY - errVal)
            });
        });

        if (bandPoints.length > 1) {
            const areaGen = d3.area<{ x: number; upper: number; lower: number }>()
                .x(d => d.x)
                .y0(d => d.lower)
                .y1(d => d.upper)
                .curve(d3.curveMonotoneX);
            scrollContent.append("path")
                .datum(bandPoints)
                .attr("d", areaGen)
                .attr("fill", errorBars.bandColor.value.value)
                .attr("opacity", 1 - errorBars.bandTransparency.value / 100);
        }
    }

    xCategories.forEach(xCat => {
        const pts = xGrouped.get(xCat) || [];
        if (pts.length === 0) return;
        const meanY = d3.mean(pts, d => d.yValue) || 0;
        const errVal = computeErrorValue(pts.map(d => d.yValue), errorBars);
        const cx = categoryX(xCat);
        const yUpper = yScale(meanY + errVal);
        const yLower = yScale(meanY - errVal);

        // Vertical line
        scrollContent.append("line")
            .attr("x1", cx).attr("x2", cx)
            .attr("y1", yUpper).attr("y2", yLower)
            .attr("stroke", errorBars.color.value.value)
            .attr("stroke-width", errorBars.strokeWidth.value);
        // Top cap
        scrollContent.append("line")
            .attr("x1", cx - 4).attr("x2", cx + 4)
            .attr("y1", yUpper).attr("y2", yUpper)
            .attr("stroke", errorBars.color.value.value)
            .attr("stroke-width", errorBars.strokeWidth.value);
        // Bottom cap
        scrollContent.append("line")
            .attr("x1", cx - 4).attr("x2", cx + 4)
            .attr("y1", yLower).attr("y2", yLower)
            .attr("stroke", errorBars.color.value.value)
            .attr("stroke-width", errorBars.strokeWidth.value);
    });
}
