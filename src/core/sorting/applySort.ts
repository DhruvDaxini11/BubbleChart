import { BubbleDataPoint, BubbleViewModel } from "../../domain/types";
import { AvailableField } from "../viewModel/buildViewModel";

export interface SortLevel {
    field: string;
    order: string;
}

// Get a value for a given field name from a data point. The returned
// type is intentionally loose — callers pass it to compareValues which
// handles string / number / date coercion internally.
function fieldValue(dp: BubbleDataPoint, fieldName: string, availableFields: AvailableField[]): any {
    const f = availableFields.find(f => f.name === fieldName);
    if (!f) return "";
    switch (f.role) {
        case "xAxis": return dp.xCategory;
        case "yAxis": return dp.yValue;
        case "size": return dp.size;
        case "legend": return dp.legendCategory;
        case "color": return dp.colorCategory;
        case "label": return dp.labelText;
        case "smallMultiple": return dp.smallMultiple;
        default: return "";
    }
}

// Compare two values by a given sort order.
export function compareValues(a: any, b: any, order: string): number {
    const aStr = String(a ?? "");
    const bStr = String(b ?? "");
    const aNum = Number(a);
    const bNum = Number(b);

    switch (order) {
        case "az": return aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
        case "za": return bStr < aStr ? -1 : bStr > aStr ? 1 : 0;
        case "az-natural": return aStr.localeCompare(bStr, undefined, { numeric: true });
        case "za-natural": return bStr.localeCompare(aStr, undefined, { numeric: true });
        case "az-ci": return aStr.toLowerCase().localeCompare(bStr.toLowerCase());
        case "za-ci": return bStr.toLowerCase().localeCompare(aStr.toLowerCase());
        case "az-natural-ci": return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: "base" });
        case "za-natural-ci": return bStr.localeCompare(aStr, undefined, { numeric: true, sensitivity: "base" });
        case "lowHigh": {
            // Try numeric first, then date parsing (so a date stored
            // as a string still sorts chronologically), then a
            // natural-language string compare as a final fallback.
            if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
            const aDate = a instanceof Date ? a.getTime() : Date.parse(aStr);
            const bDate = b instanceof Date ? b.getTime() : Date.parse(bStr);
            if (!isNaN(aDate) && !isNaN(bDate)) return aDate - bDate;
            return aStr.localeCompare(bStr, undefined, { numeric: true });
        }
        case "highLow": {
            if (!isNaN(aNum) && !isNaN(bNum)) return bNum - aNum;
            const aDate = a instanceof Date ? a.getTime() : Date.parse(aStr);
            const bDate = b instanceof Date ? b.getTime() : Date.parse(bStr);
            if (!isNaN(aDate) && !isNaN(bDate)) return bDate - aDate;
            return bStr.localeCompare(aStr, undefined, { numeric: true });
        }
        case "oldNew": {
            const aDate = a instanceof Date ? a.getTime() : Date.parse(aStr);
            const bDate = b instanceof Date ? b.getTime() : Date.parse(bStr);
            const aT = isNaN(aDate) ? (isNaN(aNum) ? 0 : aNum) : aDate;
            const bT = isNaN(bDate) ? (isNaN(bNum) ? 0 : bNum) : bDate;
            return aT - bT;
        }
        case "newOld": {
            const aDate = a instanceof Date ? a.getTime() : Date.parse(aStr);
            const bDate = b instanceof Date ? b.getTime() : Date.parse(bStr);
            const aT = isNaN(aDate) ? (isNaN(aNum) ? 0 : aNum) : aDate;
            const bT = isNaN(bDate) ? (isNaN(bNum) ? 0 : bNum) : bDate;
            return bT - aT;
        }
        default: return 0;
    }
}

// Apply multi-level sort to the view model.
// Mutates `viewModel.dataPoints` (in-place sort) and replaces
// `viewModel.xCategories` so the new render order matches the new
// dataPoint order. Previously a method on the Visual class.
export function applySorting(
    viewModel: BubbleViewModel,
    sortLevels: SortLevel[],
    availableFields: AvailableField[]
): void {
    if (!sortLevels || sortLevels.length === 0) return;
    const levels = sortLevels.filter(l => l.field && l.order);
    if (levels.length === 0) return;

    viewModel.dataPoints.sort((a, b) => {
        for (const lvl of levels) {
            const va = fieldValue(a, lvl.field, availableFields);
            const vb = fieldValue(b, lvl.field, availableFields);
            const cmp = compareValues(va, vb, lvl.order);
            if (cmp !== 0) return cmp;
        }
        return 0;
    });

    // Rebuild xCategories from sorted data (preserve new order)
    const seen = new Set<string>();
    const newCats: string[] = [];
    viewModel.dataPoints.forEach(dp => {
        if (!seen.has(dp.xCategory)) {
            seen.add(dp.xCategory);
            newCats.push(dp.xCategory);
        }
    });
    viewModel.xCategories = newCats;
}
