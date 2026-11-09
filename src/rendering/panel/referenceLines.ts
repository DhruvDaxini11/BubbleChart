import * as d3 from "d3";
import {
    YAxisReferenceLineCard, XAxisReferenceLineCard,
    YAxisReferenceLineSlot, XAxisReferenceLineSlot,
    REF_LINE_TYPE_LABELS
} from "../../settings/cards/references";
import { BubbleViewModel } from "../../domain/types";
import { computeAggregate } from "../../core/axis/aggregate";
import { formatValue } from "../../core/format/numberFormat";

// Layout context shared by both axis ref-line renderers. Bundled into
// one object so the per-axis functions don't take 12 individual params.
export interface RefLineContext {
    bgLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    scrollContent: d3.Selection<SVGGElement, unknown, null, undefined>;
    staticLayer: d3.Selection<SVGGElement, unknown, null, undefined>;
    refLineLabelOverlay: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    plotW: number;
    plotH: number;
    margin: { top: number; right: number; bottom: number; left: number };
    visibleContainerW: number;
    panelLeftInVisual: number;
    panelTopInVisual: number;
}

function drawLabel(
    ctx: RefLineContext,
    targetLayer: d3.Selection<SVGGElement, unknown, null, undefined>,
    slot: YAxisReferenceLineSlot | XAxisReferenceLineSlot,
    axis: "x" | "y",
    typeKey: string,
    xPos: number, yPos: number,
    computedNumeric: number | null,
    defaultLabelText: string
) {
    const labelStyleKey = String(slot.labelStyle.value.value);
    const userName = (slot.name.value || "").trim();
    const typeLabel = REF_LINE_TYPE_LABELS[typeKey] || "Constant";
    const axisLabel = axis === "x" ? "X-Axis" : "Y-Axis";
    const fallbackName = userName || `${axisLabel} ${typeLabel} Line`;
    const formattedValue = (computedNumeric != null && axis === "y")
        ? formatValue(
            computedNumeric,
            String(slot.labelDisplayUnits.value.value),
            slot.labelDecimalPlaces.value
          )
        : defaultLabelText;
    let labelText = "";
    switch (labelStyleKey) {
        case "name": labelText = fallbackName; break;
        case "both": labelText = `${fallbackName}: ${formattedValue}`; break;
        case "custom": labelText = slot.labelText.value || ""; break;
        case "dataValue":
        default: labelText = formattedValue; break;
    }
    if (!labelText) return;
    const hPos = String(slot.labelHPosition.value.value);
    const vPos = String(slot.labelVPosition.value.value);
    const labelColor = slot.labelColor.value.value;
    let labelX = 0;
    let labelY = 0;
    let anchor = "start";
    // labelLayer is `any` because the Y-axis overlay branch assigns the
    // refLineLabelOverlay (SVGSVGElement) while fallback branches assign
    // SVGGElement layers. They share the same append("text") API.
    let labelLayer: d3.Selection<any, unknown, null, undefined> = targetLayer;
    if (axis === "y" && !isNaN(yPos)) {
        if (ctx.visibleContainerW > 0) {
            const visiblePlotW = Math.max(
                0, ctx.visibleContainerW - ctx.margin.left - ctx.margin.right
            );
            const overlayX0 = ctx.panelLeftInVisual + ctx.margin.left;
            const containerLeftEdge = ctx.panelLeftInVisual;
            // Anchor the right-aligned Y label at the LINE'S END (the plot's
            // right edge = overlayX0 + visiblePlotW) rather than the
            // container's far-right edge. This matches small-multiples,
            // where the label sits where the dashed line stops instead of
            // floating out in the reserved margin.right strip.
            labelX = hPos === "left" ? containerLeftEdge + 4
                : hPos === "right" ? overlayX0 + visiblePlotW - 4
                : overlayX0 + visiblePlotW / 2;
            anchor = hPos === "left" ? "start"
                : hPos === "right" ? "end"
                : "middle";
            const overlayLineY = ctx.panelTopInVisual + ctx.margin.top + yPos;
            labelY = vPos === "above" ? overlayLineY - 4
                : vPos === "below" ? overlayLineY + 12
                : overlayLineY + 3;
            labelLayer = ctx.refLineLabelOverlay;
        } else {
            // Fallback (e.g. small multiples) — labels into staticLayer.
            labelX = hPos === "left" ? 4
                : hPos === "right" ? ctx.plotW - 4
                : ctx.plotW / 2;
            anchor = hPos === "left" ? "start"
                : hPos === "right" ? "end"
                : "middle";
            labelY = vPos === "above" ? yPos - 4
                : vPos === "below" ? yPos + 12
                : yPos + 3;
            labelLayer = ctx.staticLayer;
        }
    } else if (axis === "x" && !isNaN(xPos)) {
        labelY = vPos === "above" ? 12
            : vPos === "below" ? ctx.plotH - 4
            : ctx.plotH / 2;
        labelX = hPos === "left" ? xPos - 4
            : hPos === "right" ? xPos + 4
            : xPos;
        anchor = hPos === "left" ? "end"
            : hPos === "right" ? "start"
            : "middle";
    }
    labelLayer.append("text")
        .attr("x", labelX).attr("y", labelY)
        .attr("text-anchor", anchor)
        .attr("font-size", "10px")
        .attr("fill", labelColor)
        .text(labelText);
}

function drawShade(
    ctx: RefLineContext,
    targetLayer: d3.Selection<SVGGElement, unknown, null, undefined>,
    slot: YAxisReferenceLineSlot | XAxisReferenceLineSlot,
    axis: "x" | "y",
    xPos: number, yPos: number,
    strokeColor: string
) {
    if (!slot.showShade.value) return;
    const shadeFill = slot.shadeMatchLineColor.value
        ? strokeColor
        : slot.shadeColor.value.value;
    const shadeOpacity = Math.max(
        0,
        Math.min(1, 1 - (slot.shadeTransparency.value || 0) / 100)
    );
    const shadePos = String(slot.shadePosition.value.value);
    if (axis === "y" && !isNaN(yPos)) {
        const rectY = shadePos === "before" ? 0 : yPos;
        const rectH = shadePos === "before" ? yPos : (ctx.plotH - yPos);
        if (rectH > 0) {
            targetLayer.append("rect")
                .attr("x", 0).attr("y", rectY)
                .attr("width", ctx.plotW).attr("height", rectH)
                .attr("fill", shadeFill)
                .attr("fill-opacity", shadeOpacity);
        }
    } else if (axis === "x" && !isNaN(xPos)) {
        const rectX = shadePos === "before" ? 0 : xPos;
        const rectW = shadePos === "before" ? xPos : (ctx.plotW - xPos);
        if (rectW > 0) {
            targetLayer.append("rect")
                .attr("x", rectX).attr("y", 0)
                .attr("width", rectW).attr("height", ctx.plotH)
                .attr("fill", shadeFill)
                .attr("fill-opacity", shadeOpacity);
        }
    }
}

// Draws Y-axis reference lines: shade + line + optional label per slot.
export function renderYReferenceLines(
    ctx: RefLineContext,
    yRefLine: YAxisReferenceLineCard,
    viewModel: BubbleViewModel,
    yScale: d3.ScaleLinear<number, number>
): void {
    if (!yRefLine.show.value) return;
    const yCount = Math.max(0, Math.min(yRefLine.slots.length, yRefLine.lineCount.value || 0));
    for (let i = 0; i < yCount; i++) {
        const slot = yRefLine.slots[i];
        const typeKey = String(slot.type.value.value);
        const lineStyleKey = String(slot.lineStyle.value.value);
        const dashArray = lineStyleKey === "dashed" ? "8,4"
            : lineStyleKey === "dotted" ? "2,4" : "none";
        const strokeColor = slot.color.value.value;
        const strokeOpacity = Math.max(0, Math.min(1, 1 - (slot.transparency.value || 0) / 100));
        const strokeWidthPx = slot.strokeWidth.value || 2;
        // Y reference lines are HORIZONTAL (constant y across the whole x
        // range), so they must NOT scroll with the bubbles. Draw into the
        // non-scrolling layers — bgLayer (behind bubbles) or staticLayer
        // (in front) — so the line always spans the visible plot box at
        // every scroll position. Previously "front" used scrollContent,
        // which is translated by -xScrollLeft and clipped, so after panning
        // far enough (xScrollLeft >= plotW) the line scrolled out of view
        // and vanished — even though its label (drawn in staticLayer) stayed.
        const targetLayer = String(slot.position.value.value) === "behind" ? ctx.bgLayer : ctx.staticLayer;

        const computedNumeric = computeAggregate(
            viewModel.allYValues, typeKey, slot.value.value
        );
        if (computedNumeric == null) continue;
        const yPos = yScale(computedNumeric);
        const defaultLabelText = formatValue(computedNumeric, "auto", 2);

        drawShade(ctx, targetLayer, slot, "y", NaN, yPos, strokeColor);
        targetLayer.append("line")
            .attr("x1", 0).attr("x2", ctx.plotW)
            .attr("y1", yPos).attr("y2", yPos)
            .attr("stroke", strokeColor)
            .attr("stroke-opacity", strokeOpacity)
            .attr("stroke-width", strokeWidthPx)
            .attr("stroke-dasharray", dashArray);
        if (slot.showLabel.value) {
            drawLabel(ctx, targetLayer, slot, "y", typeKey, NaN, yPos, computedNumeric, defaultLabelText);
        }
    }
}

// Draws X-axis reference lines. Continuous axes parse the slot value as
// a number / date; categorical axes treat it as a category name (or a
// numeric index). Aggregate types fall back to the axis midpoint since
// "mean of categories" has no meaning.
export function renderXReferenceLines(
    ctx: RefLineContext,
    xRefLine: XAxisReferenceLineCard,
    xCategories: string[],
    xScale: any,
    xBandwidth: () => number,
    xIsContinuous: boolean,
    xIsDate: boolean
): void {
    if (!xRefLine.show.value) return;
    const xCount = Math.max(0, Math.min(xRefLine.slots.length, xRefLine.lineCount.value || 0));
    for (let i = 0; i < xCount; i++) {
        const slot = xRefLine.slots[i];
        const typeKey = String(slot.type.value.value);
        const lineStyleKey = String(slot.lineStyle.value.value);
        const dashArray = lineStyleKey === "dashed" ? "8,4"
            : lineStyleKey === "dotted" ? "2,4" : "none";
        const strokeColor = slot.color.value.value;
        const strokeOpacity = Math.max(0, Math.min(1, 1 - (slot.transparency.value || 0) / 100));
        const strokeWidthPx = slot.strokeWidth.value || 2;
        const targetLayer = String(slot.position.value.value) === "behind" ? ctx.bgLayer : ctx.scrollContent;

        let xPos = NaN;
        let computedNumeric: number | null = null;
        let defaultLabelText = "";
        const txt = (slot.value.value || "").trim();
        if (xIsContinuous) {
            const domain = xScale.domain();
            const dLo = xIsDate ? (domain[0] as Date).getTime() : (domain[0] as number);
            const dHi = xIsDate ? (domain[1] as Date).getTime() : (domain[1] as number);
            let v: number;
            if (typeKey === "constant") {
                if (!txt) continue;
                const parsed = xIsDate ? Date.parse(txt) : parseFloat(txt);
                if (isNaN(parsed)) continue;
                v = parsed;
            } else {
                v = (dLo + dHi) / 2;
            }
            computedNumeric = v;
            xPos = xScale(xIsDate ? new Date(v) : v);
            defaultLabelText = xIsDate ? new Date(v).toLocaleDateString() : String(v);
        } else if (xCategories.length > 0) {
            let idx: number;
            if (typeKey === "constant") {
                if (!txt) continue;
                const namedIdx = xCategories.indexOf(txt);
                if (namedIdx < 0) {
                    const numericIdx = parseInt(txt, 10);
                    if (isNaN(numericIdx)) continue;
                    idx = Math.max(0, Math.min(xCategories.length - 1, numericIdx));
                } else {
                    idx = namedIdx;
                }
            } else {
                idx = Math.floor(xCategories.length / 2);
            }
            xPos = (xScale(xCategories[idx]) ?? 0) + xBandwidth() / 2;
            defaultLabelText = String(xCategories[idx]);
        }
        if (isNaN(xPos)) continue;

        drawShade(ctx, targetLayer, slot, "x", xPos, NaN, strokeColor);
        targetLayer.append("line")
            .attr("x1", xPos).attr("x2", xPos)
            .attr("y1", 0).attr("y2", ctx.plotH)
            .attr("stroke", strokeColor)
            .attr("stroke-opacity", strokeOpacity)
            .attr("stroke-width", strokeWidthPx)
            .attr("stroke-dasharray", dashArray);
        if (slot.showLabel.value) {
            drawLabel(ctx, targetLayer, slot, "x", typeKey, xPos, NaN, computedNumeric, defaultLabelText);
        }
    }
}
