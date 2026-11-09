"use strict";

// =====================================================================
//  Sort Criteria Picker (shared UI)
// =====================================================================
//  Renders the sort-criteria editor — column header, the rows of
//  field/order dropdowns with up/down/remove icons, and the "+ Add
//  level" button. Used by BOTH:
//    1. The Power BI modal dialog (src/sortCriteriaDialog.ts) when the
//       host supports host-window-level modal dialogs.
//    2. The inline fallback overlay (src/visual.ts → openSortDialogInline)
//       when the host doesn't (embedded analytics, publish-to-web, etc.).
//
//  The caller owns the surrounding chrome (header title, Cancel / OK
//  buttons). This module is also responsible for reacting to internal
//  mutations (add / remove / reorder) by re-rendering its rows.
// =====================================================================

import * as d3 from "d3";

export interface SortField {
    name: string;
    role: string;
    isMeasure: boolean;
    dataType: string;
}

export interface SortLevel {
    field: string;
    order: string;
}

export interface SortOrder {
    group: string;
    value: string;
    label: string;
}

// Master list of sort orders. Visual.ts re-exports this for places that
// need it outside the picker (e.g. compareValues), so keep this as the
// single source of truth.
export const SORT_ORDERS: ReadonlyArray<SortOrder> = [
    { group: "Text", value: "az", label: "A to Z" },
    { group: "Text", value: "za", label: "Z to A" },
    { group: "Text", value: "az-natural", label: "A to Z (natural order)" },
    { group: "Text", value: "za-natural", label: "Z to A (natural order)" },
    { group: "Text", value: "az-ci", label: "A to Z (ignore case)" },
    { group: "Text", value: "za-ci", label: "Z to A (ignore case)" },
    { group: "Numbers", value: "lowHigh", label: "Low to High" },
    { group: "Numbers", value: "highLow", label: "High to Low" },
    { group: "Date", value: "oldNew", label: "Oldest to Newest" },
    { group: "Date", value: "newOld", label: "Newest to Oldest" }
];

export interface SortPickerOptions {
    fields: SortField[];
    initialLevels: SortLevel[];
}

export interface SortPickerHandle {
    /** Read the current (pending) levels — only those with both field and order set are returned. */
    getPending(): SortLevel[];
    /** Read raw (unfiltered) levels — including any rows the user hasn't completed yet. */
    getRaw(): SortLevel[];
}

// Map a field's data type to the SORT_ORDERS groups relevant for it.
//   Numeric  → only Number ordering.
//   Date     → only Date ordering.
//   Text/etc → text orderings PLUS Numbers (so dates stored as strings
//              like "04/30/2026" can still be ordered chronologically;
//              the comparator in visual.ts falls back to Date.parse).
function groupsForType(dataType: string): Set<string> {
    if (dataType === "numeric") return new Set<string>(["Numbers"]);
    if (dataType === "dateTime") return new Set<string>(["Date"]);
    return new Set<string>(["Text", "Numbers"]);
}

/**
 * Render the sort-criteria editor into `container`. Caller owns the
 * surrounding chrome (Cancel / OK buttons, modal title).
 */
export function buildSortCriteriaBody(
    container: HTMLElement,
    options: SortPickerOptions
): SortPickerHandle {
    const fields = options.fields || [];
    const editLevels: SortLevel[] = (options.initialLevels || []).map(l => ({ ...l }));
    // Ensure at least one (empty) row so the user has something to fill in.
    if (editLevels.length === 0) editLevels.push({ field: "", order: "" });

    const root = d3.select(container);

    // ── Subtitle / hint ─────────────────────────────────────────────────
    root.append("div")
        .style("padding", "8px 0 6px")
        .style("font-size", "11px").style("color", "#888")
        .text("Define sorting order. Supports multi-level sorting.");

    // ── Add-level button ────────────────────────────────────────────────
    const addRow = root.append("div")
        .style("padding", "0 0 8px")
        .style("display", "flex")
        .style("justify-content", "flex-end");
    const addLevelBtn = addRow.append("button")
        .attr("style", "display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;" +
            "border-radius:5px;font-size:12px;cursor:pointer;background:#f5f5f5;color:#333;border:1px solid #ddd;")
        .text("+ Add level");

    // ── Column header ───────────────────────────────────────────────────
    const colHdr = root.append("div")
        .style("display", "flex").style("gap", "10px").style("padding", "4px 0 6px")
        .style("font-size", "11px").style("font-weight", "600").style("color", "#666");
    colHdr.append("div").style("flex", "1").text("Field");
    colHdr.append("div").style("flex", "1.4").text("Sort order");
    colHdr.append("div").style("width", "80px");

    // ── Levels container ────────────────────────────────────────────────
    const rowsHost = root.append("div");

    const renderLevels = () => {
        rowsHost.selectAll(".sort-level-row").remove();
        editLevels.forEach((lvl, idx) => {
            const row = rowsHost.append("div")
                .classed("sort-level-row", true)
                .style("display", "flex").style("gap", "10px").style("align-items", "center")
                .style("padding", "6px 0")
                .style("border-bottom", idx < editLevels.length - 1 ? "1px solid #f5f5f5" : "none");

            // Field dropdown
            const fieldSel = row.append("select")
                .style("flex", "1").style("height", "30px").style("border", "1px solid #ccc")
                .style("border-radius", "4px").style("padding", "0 6px").style("font-size", "12px")
                .style("background", "#fff");
            fieldSel.append("option").attr("value", "").text("--Select--");
            fields.forEach(f => {
                fieldSel.append("option").attr("value", f.name)
                    .text(f.name + (f.isMeasure ? " (measure)" : ""));
            });
            (fieldSel.node() as HTMLSelectElement).value = lvl.field || "";

            // Sort-order dropdown (optgroups)
            const orderSel = row.append("select")
                .style("flex", "1.4").style("height", "30px").style("border", "1px solid #ccc")
                .style("border-radius", "4px").style("padding", "0 6px").style("font-size", "12px")
                .style("background", "#fff");

            const populateOrderSel = (preserveValue: string) => {
                orderSel.selectAll("*").remove();
                orderSel.append("option").attr("value", "").text("--Select--");
                const selectedField = fields.find(f => f.name === lvl.field);
                const allowed = selectedField
                    ? groupsForType(selectedField.dataType)
                    : new Set<string>(["Text", "Numbers", "Date"]);
                let lastGroup = "";
                SORT_ORDERS.forEach(so => {
                    if (!allowed.has(so.group)) return;
                    if (so.group !== lastGroup) {
                        lastGroup = so.group;
                        orderSel.append("optgroup").attr("label", so.group);
                    }
                    const lastOptgroup = orderSel.selectAll("optgroup").filter(function () {
                        return (this as HTMLOptGroupElement).getAttribute("label") === so.group;
                    });
                    lastOptgroup.append("option").attr("value", so.value).text(so.label);
                });
                const stillValid = !!orderSel.select(`option[value="${preserveValue}"]`).node();
                (orderSel.node() as HTMLSelectElement).value = stillValid ? preserveValue : "";
                if (!stillValid) lvl.order = "";
            };
            populateOrderSel(lvl.order || "");

            fieldSel.on("change", function () {
                lvl.field = (this as HTMLSelectElement).value;
                populateOrderSel(lvl.order || "");
            });
            orderSel.on("change", function () { lvl.order = (this as HTMLSelectElement).value; });

            // Action buttons
            const actions = row.append("div")
                .style("width", "80px").style("display", "flex").style("gap", "2px");
            const iconBtn = (title: string, html: string, onClick: () => void) => {
                const b = actions.append("button")
                    .attr("title", title)
                    .attr("style", "width:24px;height:24px;display:flex;align-items:center;justify-content:center;" +
                        "border:1px solid #ddd;border-radius:4px;background:#fafafa;cursor:pointer;font-size:14px;padding:0;")
                    .html(html);
                b.on("click", onClick);
                b.on("mouseover", function () { d3.select(this).style("background", "#eee"); });
                b.on("mouseout", function () { d3.select(this).style("background", "#fafafa"); });
            };
            iconBtn("Move up", "&#x2191;", () => {
                if (idx > 0) {
                    [editLevels[idx - 1], editLevels[idx]] = [editLevels[idx], editLevels[idx - 1]];
                    renderLevels();
                }
            });
            iconBtn("Move down", "&#x2193;", () => {
                if (idx < editLevels.length - 1) {
                    [editLevels[idx], editLevels[idx + 1]] = [editLevels[idx + 1], editLevels[idx]];
                    renderLevels();
                }
            });
            iconBtn("Remove", "&#x2715;", () => {
                editLevels.splice(idx, 1);
                if (editLevels.length === 0) editLevels.push({ field: "", order: "" });
                renderLevels();
            });
        });
    };
    renderLevels();

    addLevelBtn.on("click", () => {
        editLevels.push({ field: "", order: "" });
        renderLevels();
    });

    return {
        getPending: () => editLevels.filter(l => !!l.field && !!l.order).map(l => ({ ...l })),
        getRaw: () => editLevels.map(l => ({ ...l }))
    };
}
