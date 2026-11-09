import * as d3 from "d3";
import { dashFor } from "./dashFor";

export interface GridlineStyle {
    show: boolean;
    color: string;
    width: number;
    style: string; // "solid" | "dashed" | "dotted"
    opacity: number;
}

// Draws the X-axis vertical gridlines. For continuous X-axes the line
// positions come from `xScale.ticks()`; for categorical they sit
// centred on each leaf-category band.
export function renderXGridlines(
    scrollContent: d3.Selection<SVGGElement, unknown, null, undefined>,
    style: GridlineStyle,
    plotH: number,
    xIsContinuous: boolean,
    xIsDate: boolean,
    xScale: any,
    xCategories: string[],
    xBandwidth: () => number
): void {
    if (!style.show) return;
    const xGridXs: number[] = xIsContinuous
        ? (xScale.ticks ? xScale.ticks().map((t: any) =>
            xIsDate ? xScale(t) : xScale(t as number)) : [])
        : xCategories.map(c => (xScale(c) ?? 0) + xBandwidth() / 2);
    const xLines = scrollContent.selectAll(".x-gridline")
        .data(xGridXs)
        .enter().append("line")
        .classed("x-gridline", true)
        .attr("x1", d => d)
        .attr("x2", d => d)
        .attr("y1", 0)
        .attr("y2", plotH)
        .attr("stroke", style.color)
        .attr("stroke-width", style.width)
        .attr("opacity", style.opacity);
    const xDash = dashFor(style.style);
    if (xDash) xLines.attr("stroke-dasharray", xDash);
}

// Draws the Y-axis horizontal gridlines, using the same tick-value
// array that drives the Y-axis labels so the gridlines and labels
// stay in lock-step (especially under explicit Min/Max overrides).
export function renderYGridlines(
    bgLayer: d3.Selection<SVGGElement, unknown, null, undefined>,
    style: GridlineStyle,
    plotW: number,
    yTickValues: number[],
    yScale: d3.ScaleLinear<number, number>
): void {
    if (!style.show) return;
    const yLines = bgLayer.selectAll(".y-gridline")
        .data(yTickValues)
        .enter().append("line")
        .classed("y-gridline", true)
        .attr("x1", 0)
        .attr("x2", plotW)
        .attr("y1", d => yScale(d))
        .attr("y2", d => yScale(d))
        .attr("stroke", style.color)
        .attr("stroke-width", style.width)
        .attr("opacity", style.opacity);
    const yDash = dashFor(style.style);
    if (yDash) yLines.attr("stroke-dasharray", yDash);
}
