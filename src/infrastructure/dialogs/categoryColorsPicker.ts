"use strict";

// =====================================================================
//  Category-Colors Picker (shared UI)
// =====================================================================
//  Renders the list of category rows with their color swatches and the
//  centered preset-palette popover. Used by BOTH:
//    1. The Power BI modal dialog (src/categoryColorsDialog.ts) — runs
//       in the host-window-level dialog iframe.
//    2. The inline fallback overlay (src/visual.ts → openColorPickerDialog)
//       — runs inside the visual's iframe when the host doesn't support
//       the modal dialog API (embedded analytics, publish-to-web, etc).
//
//  The caller is responsible for the surrounding chrome (header, footer,
//  Apply/Cancel buttons). This module ONLY builds the scrollable list.
// =====================================================================

import * as d3 from "d3";

// Path separator used in composite leaf keys (mirrors X_PATH_SEP in
// visual.ts so display labels render with " › " between levels).
const X_PATH_SEP = "";

// Default preset palette shown in the per-row popover.
// NOTE: hex values are visual approximations of the screenshot palette
// supplied by the customer. Adjust below to match exact brand hex codes.
export const CATEGORY_PRESET_COLORS: string[] = [
    // Row 1
    "#33A9DC", // turquoise / cyan
    "#1C3F94", // dark navy blue
    "#F08725", // orange
    "#7B287D", // dark purple
    "#E879A6", // pink
    // Row 2
    "#9E5BA6", // violet
    "#E8B919", // gold / yellow
    "#DA3D3D", // red
    "#0F8B6E", // teal / dark green
    "#3FAE49", // green
    // Row 3
    "#5DC3E9", // light blue / sky
    "#5777C4", // medium blue
    "#F9A86A", // light orange / peach
    "#E8829D", // coral
    "#EFB1C4"  // light pink
];

export interface PickerOptions {
    /** Category keys to show, in the order they should appear (caller-sorted). */
    keys: string[];
    /** Current color for each key (after any prior user picks). */
    currentColors: { [key: string]: string };
    /** Theme/palette default color for each key, used by the "Reset" button. */
    defaultColors: { [key: string]: string };
    /** Optional override palette; falls back to CATEGORY_PRESET_COLORS. */
    presetColors?: string[];
    /**
     * Optional callback fired after EVERY color change (preset pick,
     * "Other..." native picker, or Reset). The popover and the native
     * color input are appended to document.body so their events do NOT
     * bubble through the dialog root — this callback is the reliable
     * way for the host (e.g. modal dialog wrapper) to know state changed
     * and call host.setResult() with the latest map.
     */
    onChange?: (pending: { [key: string]: string }) => void;
}

export interface PickerHandle {
    /** The pending (in-progress) color choices, keyed by category key. */
    getPending(): { [key: string]: string };
}

/**
 * Render the category-colors row list (with embedded preset-palette
 * popover) into `container`. The caller manages the surrounding chrome
 * (header, footer, Apply/Cancel buttons).
 *
 * Implementation notes:
 *   - The popover is appended to document.body (not to `container`) and
 *     centered with position:fixed so it stays fully visible regardless
 *     of how far down the user has scrolled in the list. Inside a Power
 *     BI dialog iframe, document.body IS the dialog's content body, so
 *     fixed-positioning fills the dialog viewport.
 *   - This module never persists anything itself. Callers read pending
 *     colors via handle.getPending() when the user clicks Apply.
 */
export function buildCategoryColorsBody(
    container: HTMLElement,
    options: PickerOptions
): PickerHandle {
    const presets = options.presetColors && options.presetColors.length > 0
        ? options.presetColors
        : CATEGORY_PRESET_COLORS;

    const pending: { [key: string]: string } = {};
    options.keys.forEach(k => {
        pending[k] = options.currentColors[k] || options.defaultColors[k] || "#888888";
    });

    const body = d3.select(container);

    options.keys.forEach((k, i) => {
        const current = pending[k];

        const row = body.append("div")
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", "12px")
            .style("padding", "8px 4px")
            .style("border-bottom", i < options.keys.length - 1 ? "1px solid #f5f5f5" : "none")
            .style("transition", "background 0.1s");
        row.on("mouseover", function () { d3.select(this).style("background", "#fafafa"); });
        row.on("mouseout", function () { d3.select(this).style("background", "transparent"); });

        // Color swatch (visible preview) — clicking opens preset popover
        const swatch = row.append("div")
            .style("width", "28px").style("height", "28px")
            .style("border-radius", "6px")
            .style("background", current)
            .style("border", "1px solid rgba(0,0,0,0.08)")
            .style("flex-shrink", "0")
            .style("cursor", "pointer")
            .style("position", "relative");

        const applyColor = (newColor: string) => {
            pending[k] = newColor;
            swatch.style("background", newColor);
            // Notify the host (modal dialog wrapper) that state changed —
            // see PickerOptions.onChange comment for why this is needed.
            if (options.onChange) options.onChange({ ...pending });
        };

        swatch.on("click", (event: MouseEvent) => {
            event.stopPropagation();
            // Close any other open popover first
            d3.selectAll(".bubble-color-popover").remove();

            const popover = d3.select(document.body).append("div")
                .classed("bubble-color-popover", true)
                .style("position", "fixed")
                .style("top", "50%")
                .style("left", "50%")
                .style("transform", "translate(-50%, -50%)")
                .style("z-index", "100001")
                .style("background", "#ffffff")
                .style("border", "1px solid #e0e0e0")
                .style("border-radius", "8px")
                .style("box-shadow", "0 12px 32px rgba(0,0,0,0.20), 0 4px 8px rgba(0,0,0,0.10)")
                .style("padding", "12px")
                .style("font-family", "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif");

            // Current-color preview block
            const preview = popover.append("div")
                .style("display", "flex")
                .style("justify-content", "center")
                .style("padding", "2px 4px 8px");
            preview.append("div")
                .style("width", "56px").style("height", "20px")
                .style("border-radius", "4px")
                .style("background", pending[k] || current)
                .style("border", "1px solid #d0d0d0");

            // 5×3 preset grid
            const grid = popover.append("div")
                .style("display", "grid")
                .style("grid-template-columns", "repeat(5, 24px)")
                .style("gap", "6px")
                .style("padding", "4px 2px 6px");
            presets.forEach(hex => {
                const sw = grid.append("div")
                    .style("width", "24px").style("height", "24px")
                    .style("border-radius", "4px")
                    .style("background", hex)
                    .style("border", "1px solid rgba(0,0,0,0.10)")
                    .style("cursor", "pointer")
                    .style("transition", "transform 0.08s, box-shadow 0.08s");
                sw.on("mouseover", function () {
                    d3.select(this)
                        .style("transform", "scale(1.10)")
                        .style("box-shadow", "0 2px 4px rgba(0,0,0,0.18)");
                });
                sw.on("mouseout", function () {
                    d3.select(this)
                        .style("transform", "scale(1)")
                        .style("box-shadow", "none");
                });
                sw.on("click", (e: MouseEvent) => {
                    e.stopPropagation();
                    applyColor(hex);
                    preview.select("div").style("background", hex);
                    popover.remove();
                });
            });

            // "Other..." link → opens browser RGB picker
            const other = popover.append("div")
                .style("padding", "6px 2px 2px")
                .style("font-size", "12px")
                .style("color", "#333")
                .style("cursor", "pointer")
                .style("user-select", "none")
                .text("Other...");
            other.on("mouseover", function () { d3.select(this).style("color", "#0066cc"); });
            other.on("mouseout", function () { d3.select(this).style("color", "#333"); });
            other.on("click", (e: MouseEvent) => {
                e.stopPropagation();
                const native = document.createElement("input");
                native.type = "color";
                native.value = pending[k] || current;
                native.style.position = "fixed";
                native.style.left = "-9999px";
                native.style.top = "-9999px";
                document.body.appendChild(native);
                native.addEventListener("input", () => {
                    applyColor(native.value);
                    preview.select("div").style("background", native.value);
                });
                native.addEventListener("change", () => {
                    if (native.parentNode) native.parentNode.removeChild(native);
                    popover.remove();
                });
                native.addEventListener("blur", () => {
                    setTimeout(() => {
                        if (native.parentNode) native.parentNode.removeChild(native);
                    }, 0);
                });
                native.click();
            });

            // Dismiss popover on outside click
            const outside = (ev: MouseEvent) => {
                const popNode = popover.node() as HTMLElement | null;
                if (!popNode) {
                    document.removeEventListener("mousedown", outside, true);
                    return;
                }
                if (!popNode.contains(ev.target as Node) && ev.target !== swatch.node()) {
                    popover.remove();
                    document.removeEventListener("mousedown", outside, true);
                }
            };
            setTimeout(() => document.addEventListener("mousedown", outside, true), 0);
        });

        // Label
        const displayLabel = k.indexOf(X_PATH_SEP) >= 0 ? k.split(X_PATH_SEP).join(" › ") : k;
        row.append("div")
            .style("flex", "1")
            .style("overflow", "hidden")
            .style("text-overflow", "ellipsis")
            .style("white-space", "nowrap")
            .style("font-size", "13px")
            .style("color", "#333")
            .attr("title", displayLabel)
            .text(displayLabel);

        // Reset button
        const resetBtn = row.append("div")
            .style("font-size", "11px")
            .style("color", "#888")
            .style("cursor", "pointer")
            .style("padding", "3px 8px")
            .style("border-radius", "4px")
            .style("border", "1px solid #e0e0e0")
            .style("background", "#fafafa")
            .style("transition", "all 0.1s")
            .style("flex-shrink", "0")
            .text("Reset");
        resetBtn.on("mouseover", function () { d3.select(this).style("background", "#eee"); });
        resetBtn.on("mouseout", function () { d3.select(this).style("background", "#fafafa"); });
        resetBtn.on("click", () => {
            const def = options.defaultColors[k] || current;
            applyColor(def);
        });
    });

    return {
        getPending: () => ({ ...pending })
    };
}
