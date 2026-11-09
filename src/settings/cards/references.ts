"use strict";

// Analytical overlay cards: Y-Axis Reference Line, X-Axis Reference Line,
// Reference Band, Error Bars, Crosshair.
//
// Reference lines are split into TWO axis-specific cards (each supporting up
// to REFERENCE_LINE_SLOT_COUNT slots). The Y-axis slot stores its value as a
// NumUpDown (so the Fx conditional-formatting button is available). The
// X-axis slot stores its value as TextInput so users can type a category
// name (categorical mode) or number/date string (continuous mode).

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { CONSTANT_OR_RULE } from "../common";

import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;
import FormattingSettingsGroup = formattingSettings.Group;

export const REFERENCE_LINE_SLOT_COUNT = 10;

// Maps the `type` dropdown value to its human label. Shared by the
// format-pane group header (settings/index.ts) and the on-chart label
// fallback (rendering/panel/referenceLines.ts) so the auto-generated
// name ("Y-Axis Constant Line", "Y-Axis Average Line", …) stays in sync
// between the two.
export const REF_LINE_TYPE_LABELS: { [k: string]: string } = {
    constant: "Constant", average: "Average", median: "Median",
    min: "Minimum", max: "Maximum"
};

function buildSlotSharedProps(i: number) {
    return {
        nameProp: new formattingSettings.TextInput({ name: `name_${i}`, displayName: "Name", value: "", placeholder: "Auto" }),
        typeProp: new formattingSettings.ItemDropdown({
            name: `type_${i}`, displayName: "Type",
            items: [
                { value: "constant", displayName: "Constant" },
                { value: "average", displayName: "Average" },
                { value: "median", displayName: "Median" },
                { value: "min", displayName: "Minimum" },
                { value: "max", displayName: "Maximum" }
            ],
            value: { value: "constant", displayName: "Constant" }
        }),
        colorProp: new formattingSettings.ColorPicker({ name: `color_${i}`, displayName: "Color", value: { value: "#0066cc" } }),
        transparencyProp: new formattingSettings.NumUpDown({ name: `transparency_${i}`, displayName: "Transparency (%)", value: 50, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 100, type: 1 } } }),
        lineStyleProp: new formattingSettings.ItemDropdown({
            name: `lineStyle_${i}`, displayName: "Line style",
            items: [{ value: "solid", displayName: "Solid" }, { value: "dashed", displayName: "Dashed" }, { value: "dotted", displayName: "Dotted" }],
            value: { value: "dashed", displayName: "Dashed" }
        }),
        strokeWidthProp: new formattingSettings.NumUpDown({ name: `strokeWidth_${i}`, displayName: "Width (px)", value: 3, options: { minValue: { value: 1, type: 0 }, maxValue: { value: 20, type: 1 } } }),
        positionProp: new formattingSettings.ItemDropdown({
            name: `position_${i}`, displayName: "Position",
            items: [{ value: "front", displayName: "In front" }, { value: "behind", displayName: "Behind" }],
            value: { value: "front", displayName: "In front" }
        }),
        showShadeProp: new formattingSettings.ToggleSwitch({ name: `showShade_${i}`, displayName: "Shade area", value: false }),
        shadePositionProp: new formattingSettings.ItemDropdown({
            name: `shadePosition_${i}`, displayName: "Position",
            items: [{ value: "before", displayName: "Before" }, { value: "after", displayName: "After" }],
            value: { value: "before", displayName: "Before" }
        }),
        shadeMatchLineColorProp: new formattingSettings.ToggleSwitch({ name: `shadeMatchLineColor_${i}`, displayName: "Match line color", value: false }),
        shadeColorProp: new formattingSettings.ColorPicker({ name: `shadeColor_${i}`, displayName: "Shade color", value: { value: "#0066cc" } }),
        shadeTransparencyProp: new formattingSettings.NumUpDown({ name: `shadeTransparency_${i}`, displayName: "Shade transparency (%)", value: 60, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 100, type: 1 } } }),
        showLabelProp: new formattingSettings.ToggleSwitch({ name: `showLabel_${i}`, displayName: "Data label", value: false }),
        labelHPositionProp: new formattingSettings.ItemDropdown({
            name: `labelHPosition_${i}`, displayName: "Horizontal position",
            items: [{ value: "left", displayName: "Left" }, { value: "center", displayName: "Center" }, { value: "right", displayName: "Right" }],
            value: { value: "left", displayName: "Left" }
        }),
        labelVPositionProp: new formattingSettings.ItemDropdown({
            name: `labelVPosition_${i}`, displayName: "Vertical position",
            items: [{ value: "above", displayName: "Above" }, { value: "center", displayName: "Center" }, { value: "below", displayName: "Below" }],
            value: { value: "above", displayName: "Above" }
        }),
        labelStyleProp: new formattingSettings.ItemDropdown({
            name: `labelStyle_${i}`, displayName: "Style",
            items: [
                { value: "dataValue", displayName: "Data value" },
                { value: "name", displayName: "Name" },
                { value: "both", displayName: "Name + value" },
                { value: "custom", displayName: "Custom" }
            ],
            value: { value: "dataValue", displayName: "Data value" }
        }),
        labelTextProp: new formattingSettings.TextInput({ name: `labelText_${i}`, displayName: "Label text", value: "", placeholder: "Auto" }),
        labelColorProp: new formattingSettings.ColorPicker({ name: `labelColor_${i}`, displayName: "Label color", value: { value: "#0066cc" } }),
        labelDisplayUnitsProp: new formattingSettings.ItemDropdown({
            name: `labelDisplayUnits_${i}`, displayName: "Display units",
            items: [
                { value: "auto", displayName: "Auto" },
                { value: "none", displayName: "None" },
                { value: "thousands", displayName: "Thousands" },
                { value: "millions", displayName: "Millions" },
                { value: "billions", displayName: "Billions" }
            ],
            value: { value: "auto", displayName: "Auto" }
        }),
        labelDecimalPlacesProp: new formattingSettings.NumUpDown({ name: `labelDecimalPlaces_${i}`, displayName: "Value decimal places", value: 0, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 6, type: 1 } } })
    };
}

export class YAxisReferenceLineSlot {
    name: formattingSettings.TextInput;
    type: formattingSettings.ItemDropdown;
    value: formattingSettings.NumUpDown;
    color: formattingSettings.ColorPicker;
    transparency: formattingSettings.NumUpDown;
    lineStyle: formattingSettings.ItemDropdown;
    strokeWidth: formattingSettings.NumUpDown;
    position: formattingSettings.ItemDropdown;
    showShade: formattingSettings.ToggleSwitch;
    shadePosition: formattingSettings.ItemDropdown;
    shadeMatchLineColor: formattingSettings.ToggleSwitch;
    shadeColor: formattingSettings.ColorPicker;
    shadeTransparency: formattingSettings.NumUpDown;
    showLabel: formattingSettings.ToggleSwitch;
    labelHPosition: formattingSettings.ItemDropdown;
    labelVPosition: formattingSettings.ItemDropdown;
    labelStyle: formattingSettings.ItemDropdown;
    labelText: formattingSettings.TextInput;
    labelColor: formattingSettings.ColorPicker;
    labelDisplayUnits: formattingSettings.ItemDropdown;
    labelDecimalPlaces: formattingSettings.NumUpDown;
    group: formattingSettings.Group;
    index: number;

    constructor(i: number) {
        this.index = i;
        const p = buildSlotSharedProps(i);
        this.name = p.nameProp;
        this.type = p.typeProp;
        this.value = new formattingSettings.NumUpDown({ name: `value_${i}`, displayName: "Value", value: 0, instanceKind: CONSTANT_OR_RULE });
        this.color = p.colorProp;
        this.transparency = p.transparencyProp;
        this.lineStyle = p.lineStyleProp;
        this.strokeWidth = p.strokeWidthProp;
        this.position = p.positionProp;
        this.showShade = p.showShadeProp;
        this.shadePosition = p.shadePositionProp;
        this.shadeMatchLineColor = p.shadeMatchLineColorProp;
        this.shadeColor = p.shadeColorProp;
        this.shadeTransparency = p.shadeTransparencyProp;
        this.showLabel = p.showLabelProp;
        this.labelHPosition = p.labelHPositionProp;
        this.labelVPosition = p.labelVPositionProp;
        this.labelStyle = p.labelStyleProp;
        this.labelText = p.labelTextProp;
        this.labelColor = p.labelColorProp;
        this.labelDisplayUnits = p.labelDisplayUnitsProp;
        this.labelDecimalPlaces = p.labelDecimalPlacesProp;
        this.group = new FormattingSettingsGroup({
            name: `yAxisReferenceLine_slot_${i}`,
            displayName: `Y-Axis Reference Line (${i + 1})`,
            slices: [
                this.name, this.type, this.value, this.color, this.transparency,
                this.lineStyle, this.strokeWidth, this.position,
                this.showShade, this.shadePosition, this.shadeMatchLineColor,
                this.shadeColor, this.shadeTransparency,
                this.showLabel, this.labelHPosition, this.labelVPosition,
                this.labelStyle, this.labelText, this.labelColor,
                this.labelDisplayUnits, this.labelDecimalPlaces
            ]
        });
        this.group.visible = false;
    }
}

export class XAxisReferenceLineSlot {
    name: formattingSettings.TextInput;
    type: formattingSettings.ItemDropdown;
    value: formattingSettings.TextInput;
    color: formattingSettings.ColorPicker;
    transparency: formattingSettings.NumUpDown;
    lineStyle: formattingSettings.ItemDropdown;
    strokeWidth: formattingSettings.NumUpDown;
    position: formattingSettings.ItemDropdown;
    showShade: formattingSettings.ToggleSwitch;
    shadePosition: formattingSettings.ItemDropdown;
    shadeMatchLineColor: formattingSettings.ToggleSwitch;
    shadeColor: formattingSettings.ColorPicker;
    shadeTransparency: formattingSettings.NumUpDown;
    showLabel: formattingSettings.ToggleSwitch;
    labelHPosition: formattingSettings.ItemDropdown;
    labelVPosition: formattingSettings.ItemDropdown;
    labelStyle: formattingSettings.ItemDropdown;
    labelText: formattingSettings.TextInput;
    labelColor: formattingSettings.ColorPicker;
    labelDisplayUnits: formattingSettings.ItemDropdown;
    labelDecimalPlaces: formattingSettings.NumUpDown;
    group: formattingSettings.Group;
    index: number;

    constructor(i: number) {
        this.index = i;
        const p = buildSlotSharedProps(i);
        this.name = p.nameProp;
        this.type = p.typeProp;
        this.value = new formattingSettings.TextInput({ name: `value_${i}`, displayName: "Value", value: "", placeholder: "Category name or number" });
        this.color = p.colorProp;
        this.transparency = p.transparencyProp;
        this.lineStyle = p.lineStyleProp;
        this.strokeWidth = p.strokeWidthProp;
        this.position = p.positionProp;
        this.showShade = p.showShadeProp;
        this.shadePosition = p.shadePositionProp;
        this.shadeMatchLineColor = p.shadeMatchLineColorProp;
        this.shadeColor = p.shadeColorProp;
        this.shadeTransparency = p.shadeTransparencyProp;
        this.showLabel = p.showLabelProp;
        this.labelHPosition = p.labelHPositionProp;
        this.labelVPosition = p.labelVPositionProp;
        this.labelStyle = p.labelStyleProp;
        this.labelText = p.labelTextProp;
        this.labelColor = p.labelColorProp;
        this.labelDisplayUnits = p.labelDisplayUnitsProp;
        this.labelDecimalPlaces = p.labelDecimalPlacesProp;
        this.group = new FormattingSettingsGroup({
            name: `xAxisReferenceLine_slot_${i}`,
            displayName: `X-Axis Reference Line (${i + 1})`,
            slices: [
                this.name, this.type, this.value, this.color, this.transparency,
                this.lineStyle, this.strokeWidth, this.position,
                this.showShade, this.shadePosition, this.shadeMatchLineColor,
                this.shadeColor, this.shadeTransparency,
                this.showLabel, this.labelHPosition, this.labelVPosition,
                this.labelStyle, this.labelText, this.labelColor,
                this.labelDisplayUnits, this.labelDecimalPlaces
            ]
        });
        this.group.visible = false;
    }
}

export class YAxisReferenceLineCard extends FormattingSettingsCompositeCard {
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show Y-Axis Reference Lines", value: false });
    get show() { return this.topLevelSlice; }

    lineCount = new formattingSettings.NumUpDown({
        name: "lineCount", displayName: "Number of lines", value: 0,
        options: { minValue: { value: 0, type: 0 }, maxValue: { value: REFERENCE_LINE_SLOT_COUNT, type: 1 } }
    });
    countGroup = new FormattingSettingsGroup({ name: "yAxisReferenceLine_count", displayName: "Apply settings to", slices: [this.lineCount] });

    slots: YAxisReferenceLineSlot[] = Array.from(
        { length: REFERENCE_LINE_SLOT_COUNT },
        (_, i) => new YAxisReferenceLineSlot(i)
    );

    name: string = "yAxisReferenceLine";
    displayName: string = "Y-Axis Reference Line";
    groups: FormattingSettingsGroup[] = [this.countGroup, ...this.slots.map(s => s.group)];
}

export class XAxisReferenceLineCard extends FormattingSettingsCompositeCard {
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show X-Axis Reference Lines", value: false });
    get show() { return this.topLevelSlice; }

    lineCount = new formattingSettings.NumUpDown({
        name: "lineCount", displayName: "Number of lines", value: 0,
        options: { minValue: { value: 0, type: 0 }, maxValue: { value: REFERENCE_LINE_SLOT_COUNT, type: 1 } }
    });
    countGroup = new FormattingSettingsGroup({ name: "xAxisReferenceLine_count", displayName: "Apply settings to", slices: [this.lineCount] });

    slots: XAxisReferenceLineSlot[] = Array.from(
        { length: REFERENCE_LINE_SLOT_COUNT },
        (_, i) => new XAxisReferenceLineSlot(i)
    );

    name: string = "xAxisReferenceLine";
    displayName: string = "X-Axis Reference Line";
    groups: FormattingSettingsGroup[] = [this.countGroup, ...this.slots.map(s => s.group)];
}

export class ReferenceBandCard extends FormattingSettingsCompositeCard {
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show Reference Band", value: false });
    get show() { return this.topLevelSlice; }

    axis = new formattingSettings.ItemDropdown({
        name: "axis", displayName: "Axis",
        items: [{ value: "y", displayName: "Y-Axis" }, { value: "x", displayName: "X-Axis" }],
        value: { value: "y", displayName: "Y-Axis" }
    });
    startType = new formattingSettings.ItemDropdown({
        name: "startType", displayName: "Start Type",
        items: [
            { value: "constant", displayName: "Constant" },
            { value: "average", displayName: "Average" },
            { value: "median", displayName: "Median" },
            { value: "min", displayName: "Minimum" },
            { value: "max", displayName: "Maximum" }
        ],
        value: { value: "min", displayName: "Minimum" }
    });
    startValue = new formattingSettings.NumUpDown({ name: "startValue", displayName: "Start Value", value: 0 });
    endType = new formattingSettings.ItemDropdown({
        name: "endType", displayName: "End Type",
        items: [
            { value: "constant", displayName: "Constant" },
            { value: "average", displayName: "Average" },
            { value: "median", displayName: "Median" },
            { value: "min", displayName: "Minimum" },
            { value: "max", displayName: "Maximum" }
        ],
        value: { value: "average", displayName: "Average" }
    });
    endValue = new formattingSettings.NumUpDown({ name: "endValue", displayName: "End Value", value: 100 });
    rangeGroup = new FormattingSettingsGroup({ name: "referenceBand_range", displayName: "Range", slices: [this.axis, this.startType, this.startValue, this.endType, this.endValue] });

    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Color", value: { value: "#4a86c8" } });
    transparency = new formattingSettings.NumUpDown({ name: "transparency", displayName: "Transparency (%)", value: 70, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 100, type: 1 } } });
    styleGroup = new FormattingSettingsGroup({ name: "referenceBand_style", displayName: "Style", slices: [this.color, this.transparency] });

    name: string = "referenceBand";
    displayName: string = "Reference Band";
    groups = [this.rangeGroup, this.styleGroup];
}

export class ErrorBarsCard extends FormattingSettingsCompositeCard {
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show Error Bars", value: false });
    get show() { return this.topLevelSlice; }

    type = new formattingSettings.ItemDropdown({
        name: "type", displayName: "Type",
        items: [
            { value: "standardDeviation", displayName: "Standard Deviation" },
            { value: "standardError", displayName: "Standard Error" },
            { value: "percentage", displayName: "Percentage" },
            { value: "fixed", displayName: "Fixed Value" }
        ],
        value: { value: "percentage", displayName: "Percentage" }
    });
    value = new formattingSettings.NumUpDown({ name: "value", displayName: "Value", value: 10 });
    typeGroup = new FormattingSettingsGroup({ name: "errorBars_type", displayName: "Type", slices: [this.type, this.value] });

    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Color", value: { value: "#888888" } });
    strokeWidth = new formattingSettings.NumUpDown({ name: "strokeWidth", displayName: "Stroke Width", value: 1, options: { minValue: { value: 1, type: 0 }, maxValue: { value: 5, type: 1 } } });
    barsGroup = new FormattingSettingsGroup({ name: "errorBars_bars", displayName: "Bars", slices: [this.color, this.strokeWidth] });

    showBand = new formattingSettings.ToggleSwitch({ name: "showBand", displayName: "Show Error Band", value: false });
    bandColor = new formattingSettings.ColorPicker({ name: "bandColor", displayName: "Band Color", value: { value: "#4a86c8" } });
    bandTransparency = new formattingSettings.NumUpDown({ name: "bandTransparency", displayName: "Band Transparency (%)", value: 60, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 100, type: 1 } } });
    bandGroup = new FormattingSettingsGroup({ name: "errorBars_band", displayName: "Band", topLevelSlice: this.showBand, slices: [this.bandColor, this.bandTransparency] });

    name: string = "errorBars";
    displayName: string = "Error Bars";
    groups = [this.typeGroup, this.barsGroup, this.bandGroup];
}

export class CrosshairCard extends FormattingSettingsCompositeCard {
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show Crosshair", value: true });
    get show() { return this.topLevelSlice; }

    mode = new formattingSettings.ItemDropdown({
        name: "mode", displayName: "Mode",
        items: [
            { value: "both", displayName: "Vertical + Horizontal" },
            { value: "vertical", displayName: "Vertical only" },
            { value: "horizontal", displayName: "Horizontal only" }
        ],
        value: { value: "both", displayName: "Vertical + Horizontal" }
    });
    behaviorGroup = new FormattingSettingsGroup({ name: "crosshair_behavior", displayName: "Behavior", slices: [this.mode] });

    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Color", value: { value: "#666666" } });
    strokeWidth = new formattingSettings.NumUpDown({ name: "strokeWidth", displayName: "Thickness", value: 1, options: { minValue: { value: 1, type: 0 }, maxValue: { value: 5, type: 1 } } });
    lineStyle = new formattingSettings.ItemDropdown({
        name: "lineStyle", displayName: "Line Style",
        items: [{ value: "solid", displayName: "Solid" }, { value: "dashed", displayName: "Dashed" }, { value: "dotted", displayName: "Dotted" }],
        value: { value: "solid", displayName: "Solid" }
    });
    styleGroup = new FormattingSettingsGroup({ name: "crosshair_style", displayName: "Style", slices: [this.color, this.strokeWidth, this.lineStyle] });

    name: string = "crosshair";
    displayName: string = "Crosshair";
    groups = [this.behaviorGroup, this.styleGroup];
}
