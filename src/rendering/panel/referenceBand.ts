import * as d3 from "d3";
import { ReferenceBandCard } from "../../settings/cards/references";
import { BubbleViewModel } from "../../domain/types";
import { computeAggregate } from "../../core/axis/aggregate";

// Draws a reference band (filled rect) behind bubbles. Y-axis bands go
// into bgLayer (clipped to plot, sits behind bubbles); X-axis bands go
// into scrollContent so they pan with the bubbles.
export function renderReferenceBand(
    bgLayer: d3.Selection<SVGGElement, unknown, null, undefined>,
    scrollContent: d3.Selection<SVGGElement, unknown, null, undefined>,
    refBand: ReferenceBandCard,
    viewModel: BubbleViewModel,
    plotW: number,
    plotH: number,
    yScale: d3.ScaleLinear<number, number>,
    xScale: any,
    xCategories: string[],
    xBandwidth: () => number,
    xIsContinuous: boolean,
    xIsDate: boolean
): void {
    if (!refBand.show.value) return;
    const bandAxis = String(refBand.axis.value.value);
    if (bandAxis === "y") {
        const startVal = computeAggregate(viewModel.allYValues, String(refBand.startType.value.value), refBand.startValue.value);
        const endVal = computeAggregate(viewModel.allYValues, String(refBand.endType.value.value), refBand.endValue.value);
        if (startVal != null && endVal != null) {
            const y1 = yScale(Math.max(startVal, endVal));
            const y2 = yScale(Math.min(startVal, endVal));
            bgLayer.append("rect")
                .attr("x", 0).attr("width", plotW)
                .attr("y", y1).attr("height", Math.abs(y2 - y1))
                .attr("fill", refBand.color.value.value)
                .attr("opacity", 1 - refBand.transparency.value / 100);
        }
        return;
    }
    if (bandAxis !== "x") return;

    // X-axis band. Categorical → indices; continuous → x-values
    // (ms-epoch for dates). Aggregate types fall back to the
    // mid-domain since "mean of categories" has no meaning.
    let x1: number, x2: number;
    if (xIsContinuous) {
        const domain = xScale.domain();
        const dLo = xIsDate ? (domain[0] as Date).getTime() : (domain[0] as number);
        const dHi = xIsDate ? (domain[1] as Date).getTime() : (domain[1] as number);
        const midV = (dLo + dHi) / 2;
        const xVal = (type: string, val: number): number =>
            type === "constant" ? val : midV;
        const sV = xVal(String(refBand.startType.value.value), refBand.startValue.value);
        const eV = xVal(String(refBand.endType.value.value), refBand.endValue.value);
        const lo = Math.min(sV, eV);
        const hi = Math.max(sV, eV);
        x1 = xScale(xIsDate ? new Date(lo) : lo);
        x2 = xScale(xIsDate ? new Date(hi) : hi);
    } else {
        const xIdx = (type: string, val: number): number => {
            if (type === "constant") return Math.max(0, Math.min(xCategories.length - 1, Math.round(val)));
            return Math.floor(xCategories.length / 2);
        };
        const sIdx = xIdx(String(refBand.startType.value.value), refBand.startValue.value);
        const eIdx = xIdx(String(refBand.endType.value.value), refBand.endValue.value);
        const lo = Math.min(sIdx, eIdx);
        const hi = Math.max(sIdx, eIdx);
        x1 = xScale(xCategories[lo]) ?? 0;
        x2 = (xScale(xCategories[hi]) ?? 0) + xBandwidth();
    }
    scrollContent.append("rect")
        .attr("x", Math.min(x1, x2))
        .attr("width", Math.max(0, Math.abs(x2 - x1)))
        .attr("y", 0).attr("height", plotH)
        .attr("fill", refBand.color.value.value)
        .attr("opacity", 1 - refBand.transparency.value / 100);
}
