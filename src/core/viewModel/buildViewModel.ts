import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import DataViewCategorical = powerbi.DataViewCategorical;
import IColorPalette = powerbi.extensibility.IColorPalette;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

import { BubbleDataPoint, BubbleViewModel } from "../../domain/types";
import { X_PATH_SEP } from "../../domain/constants";
import { formatCategoryValue } from "../format/categoryFormat";

export interface BuildViewModelDeps {
    categoryColorMap: Map<string, string>;
    colorPalette: IColorPalette;
    // `host` is typed loosely because Power BI's IVisualHost type doesn't
    // expose `createSelectionIdBuilder` on the public surface — visual.ts
    // already stores `hostAny: any` for the same reason.
    host: any;
}

export interface AvailableField {
    name: string;
    role: string;
    isMeasure: boolean;
    dataType: string;
}

export interface BuildViewModelResult {
    viewModel: BubbleViewModel;
    // Caller assigns these back onto the Visual instance: see
    // visual.ts where `this.currentColorKeys`, `this.currentColorFieldName`,
    // `this.availableFields` are read by toolbar dialogs.
    currentColorKeys: string[];
    currentColorFieldName: string;
    availableFields: AvailableField[];
}

export function buildViewModel(
    dataView: DataView,
    deps: BuildViewModelDeps
): BuildViewModelResult | null {
    if (!dataView
        || !dataView.categorical
        || !dataView.categorical.categories
        || dataView.categorical.categories.length === 0) {
        return null;
    }

    const categorical: DataViewCategorical = dataView.categorical;
    const categories = categorical.categories;
    const values = categorical.values;

    // Find category role indices. xAxis may have MULTIPLE category columns
    // when a hierarchy is drilled (root → ... → leaf). Preserve order.
    const xAxisIdxs: number[] = [];
    let legendIdx = -1, labelIdx = -1, colorIdx = -1, smIdx = -1;
    for (let i = 0; i < categories.length; i++) {
        const role = categories[i].source.roles;
        if (role) {
            if (role["xAxis"]) xAxisIdxs.push(i);
            if (role["legend"]) legendIdx = i;
            if (role["label"]) labelIdx = i;
            if (role["color"]) colorIdx = i;
            if (role["smallMultiple"]) smIdx = i;
        }
    }
    // Keep the leaf (deepest) index for places that previously used single-level xAxis
    const xAxisIdx = xAxisIdxs.length > 0 ? xAxisIdxs[xAxisIdxs.length - 1] : -1;

    // Find value role indices (yAxis is now a Measure)
    let yAxisIdx = -1, sizeIdx = -1;
    const tooltipIndices: number[] = [];
    if (values) {
        for (let i = 0; i < values.length; i++) {
            const role = values[i].source.roles;
            if (role) {
                if (role["yAxis"]) yAxisIdx = i;
                if (role["size"]) sizeIdx = i;
                if (role["tooltips"]) tooltipIndices.push(i);
            }
        }
    }

    if (xAxisIdx < 0) return null; // need at least X-axis

    const rowCount = categories[xAxisIdx].values.length;
    const dataPoints: BubbleDataPoint[] = [];
    const xSet = new Set<string>();                   // leaf keys (ordered)
    const xLeafPaths = new Map<string, string[]>();   // leaf key → path[]
    const xLeafRawValues = new Map<string, any[]>();
    const xLeafNumeric: number[] = [];

    const xLeafSource: any = categories[xAxisIdx].source || {};
    const xLeafColType: any = xLeafSource.type || {};
    let xLeafDataType: "numeric" | "date" | "text";
    if (xAxisIdxs.length > 1) {
        xLeafDataType = "text"; // hierarchy bound → force categorical
    } else if (xLeafColType.dateTime) {
        xLeafDataType = "date";
    } else if (xLeafColType.numeric || xLeafColType.integer) {
        xLeafDataType = "numeric";
    } else {
        xLeafDataType = "text";
    }
    const legendSet = new Set<string>();
    const smSet = new Set<string>();
    let sizeMin = Infinity, sizeMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;
    const allSizeValues: number[] = [];
    const allYValues: number[] = [];
    const hasSizeField = sizeIdx >= 0;
    const hasYField = yAxisIdx >= 0;

    const legendColorMap = new Map<string, string>();

    for (let i = 0; i < rowCount; i++) {
        const xPath = xAxisIdxs.map(idx => formatCategoryValue(categories[idx].values[i], categories[idx].source));
        const xPathRaw = xAxisIdxs.map(idx => categories[idx].values[i]);
        const xLeafKey = xPath.join(X_PATH_SEP);
        const xVal = xLeafKey;
        if (xPath.every(seg => seg === "")) continue;
        if (!xLeafPaths.has(xLeafKey)) xLeafPaths.set(xLeafKey, xPath);
        if (!xLeafRawValues.has(xLeafKey)) xLeafRawValues.set(xLeafKey, xPathRaw);
        const xLeafRaw = categories[xAxisIdx].values[i];
        let xNumeric = NaN;
        if (xLeafRaw instanceof Date) {
            const t = xLeafRaw.getTime();
            if (!isNaN(t)) xNumeric = t;
        } else if (typeof xLeafRaw === "number" && isFinite(xLeafRaw)) {
            xNumeric = xLeafRaw;
        } else if (xLeafDataType === "date" && xLeafRaw != null) {
            const d = new Date(String(xLeafRaw));
            if (!isNaN(d.getTime())) xNumeric = d.getTime();
        } else if (xLeafDataType === "numeric" && xLeafRaw != null) {
            const n = Number(xLeafRaw);
            if (isFinite(n)) xNumeric = n;
        }
        xLeafNumeric.push(xNumeric);
        const yVal = hasYField && values ? Number(values[yAxisIdx].values[i]) || 0 : 0;
        const legendVal = legendIdx >= 0 ? formatCategoryValue(categories[legendIdx].values[i], categories[legendIdx].source) : "";
        const colorVal = colorIdx >= 0 ? formatCategoryValue(categories[colorIdx].values[i], categories[colorIdx].source) : "";
        const labelVal = labelIdx >= 0 ? formatCategoryValue(categories[labelIdx].values[i], categories[labelIdx].source) : "";
        const smVal = smIdx >= 0 ? formatCategoryValue(categories[smIdx].values[i], categories[smIdx].source) : "";
        const sizeVal = hasSizeField && values ? Number(values[sizeIdx].values[i]) || 0 : 0;

        xSet.add(xVal);
        if (legendVal) legendSet.add(legendVal);
        if (smVal) smSet.add(smVal);

        if (hasSizeField) {
            if (sizeVal < sizeMin) sizeMin = sizeVal;
            if (sizeVal > sizeMax) sizeMax = sizeVal;
            allSizeValues.push(sizeVal);
        }

        if (yVal < yMin) yMin = yVal;
        if (yVal > yMax) yMax = yVal;
        allYValues.push(yVal);

        // Color assignment priority: color field > legend field > x category
        const colorKey = colorVal || legendVal || xVal;
        if (!legendColorMap.has(colorKey)) {
            const override = deps.categoryColorMap.get(colorKey);
            legendColorMap.set(colorKey, override || deps.colorPalette.getColor(colorKey).value);
        }
        const color = legendColorMap.get(colorKey)!;

        const selectionIdBuilder = deps.host.createSelectionIdBuilder();
        for (const idx of xAxisIdxs) {
            selectionIdBuilder.withCategory(categories[idx], i);
        }
        const selectionId = selectionIdBuilder.createSelectionId();

        const tooltipData: VisualTooltipDataItem[] = [];
        xAxisIdxs.forEach((idx, k) => {
            tooltipData.push({
                displayName: categories[idx].source.displayName || (`Level ${k + 1}`),
                value: xPath[k]
            });
        });
        if (hasYField && values) {
            tooltipData.push({
                displayName: values[yAxisIdx].source.displayName || "Y-Axis",
                value: typeof yVal === "number" && !isNaN(yVal) ? yVal.toFixed(2) : String(yVal)
            });
        }
        if (legendIdx >= 0) {
            tooltipData.push({
                displayName: categories[legendIdx].source.displayName || "Legend",
                value: legendVal
            });
        }
        if (labelIdx >= 0 && labelVal) {
            tooltipData.push({
                displayName: categories[labelIdx].source.displayName || "Label",
                value: labelVal
            });
        }
        if (colorIdx >= 0 && colorVal) {
            tooltipData.push({
                displayName: categories[colorIdx].source.displayName || "Color",
                value: colorVal
            });
        }
        if (hasSizeField && values) {
            tooltipData.push({
                displayName: values[sizeIdx].source.displayName || "Size",
                value: String(sizeVal)
            });
        }
        for (const tIdx of tooltipIndices) {
            if (values) {
                tooltipData.push({
                    displayName: values[tIdx].source.displayName || "Tooltip",
                    value: String(values[tIdx].values[i] ?? "")
                });
            }
        }

        const highlighted = values && sizeIdx >= 0 && values[sizeIdx].highlights
            ? values[sizeIdx].highlights[i] != null
            : (values && yAxisIdx >= 0 && values[yAxisIdx].highlights
                ? values[yAxisIdx].highlights[i] != null
                : true);

        dataPoints.push({
            xCategory: xVal,
            xPath,
            xNumeric,
            yValue: yVal,
            size: sizeVal,
            legendCategory: legendVal,
            colorCategory: colorVal,
            labelText: labelVal,
            smallMultiple: smVal,
            color,
            selectionId,
            tooltipData,
            highlighted
        });
    }

    const currentColorKeys = Array.from(legendColorMap.keys());
    let currentColorFieldName: string;
    if (colorIdx >= 0) currentColorFieldName = categories[colorIdx].source.displayName || "Color";
    else if (legendIdx >= 0) currentColorFieldName = categories[legendIdx].source.displayName || "Legend";
    else currentColorFieldName = categories[xAxisIdx].source.displayName || "Category";

    const fieldList: AvailableField[] = [];
    const addedNames = new Set<string>();
    const inferType = (source: powerbi.DataViewMetadataColumn): string => {
        const t = source && source.type;
        if (!t) return "text";
        if (t.dateTime) return "dateTime";
        if (t.numeric || t.integer) return "numeric";
        return "text";
    };
    const pushField = (name: string, role: string, isMeasure: boolean, dataType: string) => {
        if (name && !addedNames.has(name)) { addedNames.add(name); fieldList.push({ name, role, isMeasure, dataType }); }
    };
    xAxisIdxs.forEach(idx => pushField(categories[idx].source.displayName || "", "xAxis", false, inferType(categories[idx].source)));
    if (legendIdx >= 0) pushField(categories[legendIdx].source.displayName || "", "legend", false, inferType(categories[legendIdx].source));
    if (colorIdx >= 0) pushField(categories[colorIdx].source.displayName || "", "color", false, inferType(categories[colorIdx].source));
    if (labelIdx >= 0) pushField(categories[labelIdx].source.displayName || "", "label", false, inferType(categories[labelIdx].source));
    if (smIdx >= 0) pushField(categories[smIdx].source.displayName || "", "smallMultiple", false, inferType(categories[smIdx].source));
    if (hasYField && values) pushField(values[yAxisIdx].source.displayName || "", "yAxis", true, inferType(values[yAxisIdx].source));
    if (hasSizeField && values) pushField(values[sizeIdx].source.displayName || "", "size", true, inferType(values[sizeIdx].source));

    const xLevelNames = xAxisIdxs.map(idx => categories[idx].source.displayName || "");

    const viewModel: BubbleViewModel = {
        dataPoints,
        xCategories: Array.from(xSet),
        xLeafPaths,
        xLeafRawValues,
        xLevels: xAxisIdxs.length,
        xLevelNames,
        xLeafDataType,
        xLeafNumeric,
        legendCategories: Array.from(legendSet),
        smallMultiples: Array.from(smSet),
        sizeMin: sizeMin === Infinity ? 0 : sizeMin,
        sizeMax: sizeMax === -Infinity ? 1 : sizeMax,
        yMin: yMin === Infinity ? 0 : yMin,
        yMax: yMax === -Infinity ? 1 : yMax,
        allYValues,
        allSizeValues,
        hasSizeField,
        hasYField,
        xFieldName: xLevelNames.join(" / ") || categories[xAxisIdx].source.displayName || "",
        yFieldName: hasYField && values ? (values[yAxisIdx].source.displayName || "") : "",
        legendFieldName: legendIdx >= 0 ? (categories[legendIdx].source.displayName || "") : ""
    };

    return {
        viewModel,
        currentColorKeys,
        currentColorFieldName,
        availableFields: fieldList
    };
}
