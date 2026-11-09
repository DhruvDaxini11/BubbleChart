import * as d3 from "d3";
import { LegendSettingsCard } from "../../settings/cards/layout";
import { BubbleViewModel } from "../../domain/types";

// Maps legacy persisted legend-position values (from older saved reports)
// onto the current canonical mode names so the rest of the rendering
// pipeline only deals with one vocabulary.
export function resolveLegendPosition(legendCard: LegendSettingsCard): string {
    const raw = String(legendCard.position.value.value || "");
    switch (raw) {
        case "top":     return "topLeft";
        case "bottom":  return "bottomLeft";
        case "left":    return "centerLeft";
        case "right":   return "centerRight";
        // "default" is the sentinel persisted by older reports — map it
        // to inline top-right so items hug the right edge.
        case "default": return "topRight";
        default:        return raw;
    }
}

// Draws the legend into the supplied <g>, using `width` as the viewport
// width for alignment. Returns the total height consumed.
export function renderLegend(
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    legendCard: LegendSettingsCard,
    legendCategories: string[],
    colorMap: Map<string, string>,
    width: number,
    viewModel: BubbleViewModel,
    height: number = 0
): number {
    if (!legendCard.show.value || legendCategories.length === 0) return 0;

    const fontSize = legendCard.fontSize.value;
    const fontFamily = legendCard.fontFamily.value || "Segoe UI";
    const fontWeight = legendCard.fontBold.value ? "bold" : "normal";
    const fontStyle = legendCard.fontItalic.value ? "italic" : "normal";
    const textDecoration = legendCard.fontUnderline.value ? "underline" : "none";
    const itemHeight = fontSize + 6;
    const posMode = resolveLegendPosition(legendCard);
    const isRight = posMode.includes("Right") || posMode === "centerRight";
    const isCenter = posMode === "topCenter" || posMode === "bottomCenter";
    const isStacked = posMode.endsWith("Stacked") || posMode === "centerLeft" || posMode === "centerRight";

    const rendersAtTop = !posMode.startsWith("bottom");
    const titleHeight = legendCard.showTitle.value ? (fontSize + 10) : 0;

    // Width occupied by the toolbar in the top-left corner. Only
    // reserved when the legend shares the top strip with the toolbar.
    const TOOLBAR_RESERVE = 60;
    const leftPad = rendersAtTop && !isStacked ? TOOLBAR_RESERVE : 10;

    const titleFontSize = legendCard.titleFontSize.value;
    const titleFontFamily = legendCard.titleFontFamily.value || "Segoe UI";
    const titleFontWeight = legendCard.titleFontBold.value ? "bold" : "normal";
    const titleFontStyle = legendCard.titleFontItalic.value ? "italic" : "normal";
    const titleTextDecoration = legendCard.titleFontUnderline.value ? "underline" : "none";
    const titleColor = legendCard.titleColor.value.value || legendCard.color.value.value;

    if (isStacked) {
        const COLUMN_PAD = 6;
        const SWATCH_RADIUS = 5;
        const SWATCH_TEXT_GAP = 10;
        const isLeftSideStacked = posMode === "centerLeft" || posMode === "topLeftStacked";

        let maxItemTextW = 0;
        legendCategories.forEach(cat => {
            const w = (cat ? cat.length : 0) * (fontSize * 0.6);
            if (w > maxItemTextW) maxItemTextW = w;
        });

        let swatchCx: number;
        let textX: number;
        let textAnchor: "start" | "end";

        if (isLeftSideStacked) {
            swatchCx = COLUMN_PAD + SWATCH_RADIUS;
            textX = swatchCx + SWATCH_RADIUS + SWATCH_TEXT_GAP - 5;
            textAnchor = "start";
        } else {
            const itemRightX = Math.max(leftPad + 20, width - COLUMN_PAD);
            swatchCx = itemRightX - maxItemTextW - SWATCH_TEXT_GAP;
            textX = itemRightX;
            textAnchor = "end";
        }

        const stackedTitleAlign = String(legendCard.titleAlignment.value.value || "center");
        let titleX: number;
        let titleAnchor: "start" | "middle" | "end";
        if (stackedTitleAlign === "left") {
            titleX = COLUMN_PAD;
            titleAnchor = "start";
        } else if (stackedTitleAlign === "right") {
            titleX = Math.max(leftPad + 20, width - COLUMN_PAD);
            titleAnchor = "end";
        } else {
            titleX = width / 2;
            titleAnchor = "middle";
        }

        let y = fontSize + 2;
        if (legendCard.showTitle.value) {
            const title = legendCard.titleText.value || viewModel.legendFieldName || "Legend";
            g.append("text")
                .attr("x", titleX)
                .attr("y", y)
                .attr("font-size", titleFontSize + "px")
                .attr("font-family", titleFontFamily)
                .attr("font-weight", titleFontWeight)
                .attr("font-style", titleFontStyle)
                .attr("text-decoration", titleTextDecoration)
                .attr("fill", titleColor)
                .attr("text-anchor", titleAnchor)
                .text(title);
            y += titleFontSize + 6;
        }

        legendCategories.forEach(cat => {
            const color = colorMap.get(cat) || "#999";
            g.append("circle")
                .attr("cx", swatchCx).attr("cy", y - fontSize / 3)
                .attr("r", SWATCH_RADIUS)
                .attr("fill", color);
            g.append("text")
                .attr("x", textX).attr("y", y)
                .attr("font-size", fontSize + "px")
                .attr("font-family", fontFamily)
                .attr("font-weight", fontWeight)
                .attr("font-style", fontStyle)
                .attr("text-decoration", textDecoration)
                .attr("fill", legendCard.color.value.value)
                .attr("text-anchor", textAnchor)
                .text(cat);
            y += itemHeight;
        });
        return y + 4;
    }

    // Inline (row) rendering with wrapping.
    let totalItemsWidth = 0;
    legendCategories.forEach(cat => {
        totalItemsWidth += cat.length * (fontSize * 0.6) + 20;
    });
    const lastItemTrailingGap = 4;
    const INLINE_RIGHT_PAD = 4;

    const getStartX = (): number => {
        if (isRight) return Math.max(leftPad, width - totalItemsWidth + lastItemTrailingGap - INLINE_RIGHT_PAD);
        if (isCenter) return Math.max(leftPad, (width - totalItemsWidth) / 2);
        return leftPad;
    };

    if (legendCard.showTitle.value) {
        const title = legendCard.titleText.value || viewModel.legendFieldName || "Legend";
        const titleAlign = String(legendCard.titleAlignment.value.value || "center");
        const itemsStartX = getStartX();
        const itemsEndX = Math.min(
            itemsStartX + totalItemsWidth - lastItemTrailingGap,
            width - INLINE_RIGHT_PAD
        );
        const itemsCenterX = (itemsStartX + itemsEndX) / 2;
        const safeCenterX = Math.max(leftPad + 20, itemsCenterX);
        const titleX = titleAlign === "right" ? itemsEndX
                      : titleAlign === "center" ? safeCenterX
                      : itemsStartX;
        const titleAnchor: "start" | "middle" | "end" =
            titleAlign === "right" ? "end" :
            titleAlign === "center" ? "middle" : "start";
        g.append("text")
            .attr("x", titleX)
            .attr("y", titleFontSize + 2)
            .attr("font-size", titleFontSize + "px")
            .attr("font-family", titleFontFamily)
            .attr("font-weight", titleFontWeight)
            .attr("font-style", titleFontStyle)
            .attr("text-decoration", titleTextDecoration)
            .attr("fill", titleColor)
            .attr("text-anchor", titleAnchor)
            .text(title);
    }

    let x = getStartX();
    let y = titleHeight + fontSize;

    legendCategories.forEach(cat => {
        const color = colorMap.get(cat) || "#999";
        const textWidth = cat.length * (fontSize * 0.6) + 20;
        // The LAST item to wrap-fit should ignore the trailing gap so a
        // right-aligned legend doesn't wrap its final item unnecessarily.
        const contentWidth = textWidth - lastItemTrailingGap;
        if (x + contentWidth > width - INLINE_RIGHT_PAD) {
            x = getStartX();
            y += itemHeight;
        }

        g.append("circle")
            .attr("cx", x + 6).attr("cy", y - fontSize / 3)
            .attr("r", 5)
            .attr("fill", color);
        g.append("text")
            .attr("x", x + 16).attr("y", y)
            .attr("font-size", fontSize + "px")
            .attr("font-family", fontFamily)
            .attr("font-weight", fontWeight)
            .attr("font-style", fontStyle)
            .attr("text-decoration", textDecoration)
            .attr("fill", legendCard.color.value.value)
            .text(cat);
        x += textWidth;
    });

    void height;
    return y + itemHeight;
}
