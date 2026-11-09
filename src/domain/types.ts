import powerbi from "powerbi-visuals-api";
import ISelectionId = powerbi.visuals.ISelectionId;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

export interface BubbleDataPoint {
    xCategory: string;
    xPath: string[];
    xNumeric: number;
    yValue: number;
    size: number;
    legendCategory: string;
    colorCategory: string;
    labelText: string;
    smallMultiple: string;
    color: string;
    selectionId: ISelectionId;
    tooltipData: VisualTooltipDataItem[];
    highlighted: boolean;
}

export interface BubbleViewModel {
    dataPoints: BubbleDataPoint[];
    xCategories: string[];
    xLeafPaths: Map<string, string[]>;
    xLeafRawValues: Map<string, any[]>;
    xLevels: number;
    xLevelNames: string[];
    xLeafDataType: "numeric" | "date" | "text";
    xLeafNumeric: number[];
    legendCategories: string[];
    smallMultiples: string[];
    sizeMin: number;
    sizeMax: number;
    yMin: number;
    yMax: number;
    allYValues: number[];
    allSizeValues: number[];
    hasSizeField: boolean;
    hasYField: boolean;
    xFieldName: string;
    yFieldName: string;
    legendFieldName: string;
}

export interface AxisRangeResolution {
    overriddenMin: boolean;
    overriddenMax: boolean;
    min: number;
    max: number;
}
