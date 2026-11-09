"use strict";

// Axis cards: X-Axis (Range/Values/Title + backcompat gridline slices),
// Y-Axis (same structure), and the standalone Gridlines card.
//
// Axis range bounds use NaN as the "Auto" sentinel — serialises to JSON null,
// renders as an empty input with the "Auto" placeholder. visual.ts treats any
// non-finite bound as "use the data-derived domain" via isAxisRangeOverridden().
// The legacy 0/0 sentinel (from older reports) is also treated as Auto.

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { CONSTANT_OR_RULE, NumUpDownAuto } from "../common";

import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;
import FormattingSettingsGroup = formattingSettings.Group;

export class XAxisSettingsCard extends FormattingSettingsCompositeCard {
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show X-Axis", value: true });
    get show() { return this.topLevelSlice; }

    axisType = new formattingSettings.ItemDropdown({
        name: "axisType", displayName: "Type",
        items: [
            { value: "categorical", displayName: "Categorical" },
            { value: "continuous", displayName: "Continuous" }
        ],
        value: { value: "categorical", displayName: "Categorical" }
    });

    minValue = new NumUpDownAuto({ name: "minValue", displayName: "Minimum", description: "Right-click to reset to Auto", value: NaN, instanceKind: CONSTANT_OR_RULE, placeholderText: "Auto" });
    maxValue = new NumUpDownAuto({ name: "maxValue", displayName: "Maximum", description: "Right-click to reset to Auto", value: NaN, instanceKind: CONSTANT_OR_RULE, placeholderText: "Auto" });

    minDate = new formattingSettings.DatePicker({ name: "minDate", displayName: "Minimum", description: "Right-click to reset to Auto", value: null, placeholder: "M/D/YYYY" });
    maxDate = new formattingSettings.DatePicker({ name: "maxDate", displayName: "Maximum", description: "Right-click to reset to Auto", value: null, placeholder: "M/D/YYYY" });

    logScale = new formattingSettings.ToggleSwitch({ name: "logScale", displayName: "Logarithmic scale", value: false });
    invertRange = new formattingSettings.ToggleSwitch({ name: "invertRange", displayName: "Invert range", value: false });

    rangeGroup = new FormattingSettingsGroup({
        name: "xAxisSettings_range", displayName: "Range",
        slices: [this.axisType, this.minValue, this.maxValue, this.minDate, this.maxDate, this.logScale, this.invertRange]
    });

    fontFamily = new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Font Family", value: "Segoe UI" });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Font Size", value: 11, options: { minValue: { value: 6, type: 0 }, maxValue: { value: 30, type: 1 } } });
    fontBold = new formattingSettings.ToggleSwitch({ name: "fontBold", displayName: "Bold", value: false });
    fontItalic = new formattingSettings.ToggleSwitch({ name: "fontItalic", displayName: "Italic", value: false });
    fontUnderline = new formattingSettings.ToggleSwitch({ name: "fontUnderline", displayName: "Underline", value: false });
    font = new formattingSettings.FontControl({ name: "font", displayName: "Font", fontFamily: this.fontFamily, fontSize: this.fontSize, bold: this.fontBold, italic: this.fontItalic, underline: this.fontUnderline });

    labelColor = new formattingSettings.ColorPicker({ name: "labelColor", displayName: "Color", value: { value: "#666666" } });
    maximumHeight = new formattingSettings.NumUpDown({ name: "maximumHeight", displayName: "Maximum height", value: 25, options: { minValue: { value: 5, type: 0 }, maxValue: { value: 50, type: 1 } } });
    concatenateLabels = new formattingSettings.ToggleSwitch({ name: "concatenateLabels", displayName: "Concatenate labels", value: true });

    valuesGroup = new FormattingSettingsGroup({ name: "xAxisSettings_values", displayName: "Values", slices: [this.font, this.labelColor, this.maximumHeight, this.concatenateLabels] });

    title = new formattingSettings.ToggleSwitch({ name: "title", displayName: "Show Title", value: true });
    titleText = new formattingSettings.TextInput({ name: "titleText", displayName: "Title text", value: "", placeholder: "Auto" });
    titleStyle = new formattingSettings.ItemDropdown({ name: "titleStyle", displayName: "Style", items: [{ value: "showTitleOnly", displayName: "Show title only" }], value: { value: "showTitleOnly", displayName: "Show title only" } });
    titleFontFamily = new formattingSettings.FontPicker({ name: "titleFontFamily", displayName: "Font family", value: "Segoe UI" });
    titleFontSize = new formattingSettings.NumUpDown({ name: "titleFontSize", displayName: "Font size", value: 12, options: { minValue: { value: 6, type: 0 }, maxValue: { value: 30, type: 1 } } });
    titleFontBold = new formattingSettings.ToggleSwitch({ name: "titleFontBold", displayName: "Bold", value: false });
    titleFontItalic = new formattingSettings.ToggleSwitch({ name: "titleFontItalic", displayName: "Italic", value: false });
    titleFontUnderline = new formattingSettings.ToggleSwitch({ name: "titleFontUnderline", displayName: "Underline", value: false });
    titleFont = new formattingSettings.FontControl({ name: "titleFont", displayName: "Font", fontFamily: this.titleFontFamily, fontSize: this.titleFontSize, bold: this.titleFontBold, italic: this.titleFontItalic, underline: this.titleFontUnderline });
    titleColor = new formattingSettings.ColorPicker({ name: "titleColor", displayName: "Color", value: { value: "#666666" } });
    titleGroup = new FormattingSettingsGroup({ name: "xAxisSettings_title", displayName: "Title", topLevelSlice: this.title, slices: [this.titleText, this.titleStyle, this.titleFont, this.titleColor] });

    name: string = "xAxisSettings";
    displayName: string = "X-Axis";
    groups = [this.rangeGroup, this.valuesGroup, this.titleGroup];

    gridlines = new formattingSettings.ToggleSwitch({ name: "gridlines", displayName: "Show Gridlines", value: false });
    gridlineColor = new formattingSettings.ColorPicker({ name: "gridlineColor", displayName: "Gridline Color", value: { value: "#e0e0e0" } });
}

export class YAxisSettingsCard extends FormattingSettingsCompositeCard {
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show Y-Axis", value: true });
    get show() { return this.topLevelSlice; }

    minValue = new NumUpDownAuto({ name: "minValue", displayName: "Minimum", description: "Right-click to reset to Auto", value: NaN, instanceKind: CONSTANT_OR_RULE, placeholderText: "Auto" });
    maxValue = new NumUpDownAuto({ name: "maxValue", displayName: "Maximum", description: "Right-click to reset to Auto", value: NaN, instanceKind: CONSTANT_OR_RULE, placeholderText: "Auto" });
    rangeGroup = new FormattingSettingsGroup({ name: "yAxisSettings_range", displayName: "Range", slices: [this.minValue, this.maxValue] });

    fontFamily = new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Font Family", value: "Segoe UI" });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Font Size", value: 11, options: { minValue: { value: 6, type: 0 }, maxValue: { value: 30, type: 1 } } });
    fontBold = new formattingSettings.ToggleSwitch({ name: "fontBold", displayName: "Bold", value: false });
    fontItalic = new formattingSettings.ToggleSwitch({ name: "fontItalic", displayName: "Italic", value: false });
    fontUnderline = new formattingSettings.ToggleSwitch({ name: "fontUnderline", displayName: "Underline", value: false });
    font = new formattingSettings.FontControl({ name: "font", displayName: "Font", fontFamily: this.fontFamily, fontSize: this.fontSize, bold: this.fontBold, italic: this.fontItalic, underline: this.fontUnderline });

    labelColor = new formattingSettings.ColorPicker({ name: "labelColor", displayName: "Color", value: { value: "#666666" } });
    displayUnits = new formattingSettings.ItemDropdown({
        name: "displayUnits", displayName: "Display units",
        items: [
            { value: "auto", displayName: "Auto" },
            { value: "none", displayName: "None" },
            { value: "thousands", displayName: "Thousands" },
            { value: "millions", displayName: "Millions" },
            { value: "billions", displayName: "Billions" }
        ],
        value: { value: "auto", displayName: "Auto" }
    });
    decimalPlaces = new formattingSettings.NumUpDown({ name: "decimalPlaces", displayName: "Decimal places", value: 0, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 10, type: 1 } } });
    maximumWidth = new formattingSettings.NumUpDown({ name: "maximumWidth", displayName: "Maximum width", value: 25, options: { minValue: { value: 5, type: 0 }, maxValue: { value: 50, type: 1 } } });
    valuesGroup = new FormattingSettingsGroup({ name: "yAxisSettings_values", displayName: "Values", slices: [this.font, this.labelColor, this.displayUnits, this.decimalPlaces, this.maximumWidth] });

    title = new formattingSettings.ToggleSwitch({ name: "title", displayName: "Show Title", value: true });
    titleText = new formattingSettings.TextInput({ name: "titleText", displayName: "Title text", value: "", placeholder: "Auto" });
    titleStyle = new formattingSettings.ItemDropdown({ name: "titleStyle", displayName: "Style", items: [{ value: "showTitleOnly", displayName: "Show title only" }], value: { value: "showTitleOnly", displayName: "Show title only" } });
    titleFontFamily = new formattingSettings.FontPicker({ name: "titleFontFamily", displayName: "Font family", value: "Segoe UI" });
    titleFontSize = new formattingSettings.NumUpDown({ name: "titleFontSize", displayName: "Font size", value: 12, options: { minValue: { value: 6, type: 0 }, maxValue: { value: 30, type: 1 } } });
    titleFontBold = new formattingSettings.ToggleSwitch({ name: "titleFontBold", displayName: "Bold", value: false });
    titleFontItalic = new formattingSettings.ToggleSwitch({ name: "titleFontItalic", displayName: "Italic", value: false });
    titleFontUnderline = new formattingSettings.ToggleSwitch({ name: "titleFontUnderline", displayName: "Underline", value: false });
    titleFont = new formattingSettings.FontControl({ name: "titleFont", displayName: "Font", fontFamily: this.titleFontFamily, fontSize: this.titleFontSize, bold: this.titleFontBold, italic: this.titleFontItalic, underline: this.titleFontUnderline });
    titleColor = new formattingSettings.ColorPicker({ name: "titleColor", displayName: "Color", value: { value: "#666666" } });
    titleGroup = new FormattingSettingsGroup({ name: "yAxisSettings_title", displayName: "Title", topLevelSlice: this.title, slices: [this.titleText, this.titleStyle, this.titleFont, this.titleColor] });

    name: string = "yAxisSettings";
    displayName: string = "Y-Axis";
    groups = [this.rangeGroup, this.valuesGroup, this.titleGroup];

    gridlines = new formattingSettings.ToggleSwitch({ name: "gridlines", displayName: "Show Gridlines", value: true });
    gridlineColor = new formattingSettings.ColorPicker({ name: "gridlineColor", displayName: "Gridline Color", value: { value: "#e0e0e0" } });
}

export class GridlinesCard extends FormattingSettingsCompositeCard {
    showVertical = new formattingSettings.ToggleSwitch({ name: "showVertical", displayName: "Show", value: false });
    verticalColor = new formattingSettings.ColorPicker({ name: "verticalColor", displayName: "Color", value: { value: "#e0e0e0" } });
    verticalStrokeWidth = new formattingSettings.NumUpDown({ name: "verticalStrokeWidth", displayName: "Stroke Width (px)", value: 1, options: { minValue: { value: 1, type: 0 }, maxValue: { value: 5, type: 1 } } });
    verticalLineStyle = new formattingSettings.ItemDropdown({ name: "verticalLineStyle", displayName: "Line Style", items: [{ value: "solid", displayName: "Solid" }, { value: "dashed", displayName: "Dashed" }, { value: "dotted", displayName: "Dotted" }], value: { value: "solid", displayName: "Solid" } });
    verticalTransparency = new formattingSettings.NumUpDown({ name: "verticalTransparency", displayName: "Transparency (%)", value: 40, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 100, type: 1 } } });
    verticalGroup = new FormattingSettingsGroup({ name: "gridlines_vertical_x_axis", displayName: "Vertical (X-Axis)", topLevelSlice: this.showVertical, slices: [this.verticalColor, this.verticalStrokeWidth, this.verticalLineStyle, this.verticalTransparency] });

    showHorizontal = new formattingSettings.ToggleSwitch({ name: "showHorizontal", displayName: "Show", value: true });
    horizontalColor = new formattingSettings.ColorPicker({ name: "horizontalColor", displayName: "Color", value: { value: "#e0e0e0" } });
    horizontalStrokeWidth = new formattingSettings.NumUpDown({ name: "horizontalStrokeWidth", displayName: "Stroke Width (px)", value: 1, options: { minValue: { value: 1, type: 0 }, maxValue: { value: 5, type: 1 } } });
    horizontalLineStyle = new formattingSettings.ItemDropdown({ name: "horizontalLineStyle", displayName: "Line Style", items: [{ value: "solid", displayName: "Solid" }, { value: "dashed", displayName: "Dashed" }, { value: "dotted", displayName: "Dotted" }], value: { value: "solid", displayName: "Solid" } });
    horizontalTransparency = new formattingSettings.NumUpDown({ name: "horizontalTransparency", displayName: "Transparency (%)", value: 40, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 100, type: 1 } } });
    horizontalGroup = new FormattingSettingsGroup({ name: "gridlines_horizontal_y_axis", displayName: "Horizontal (Y-Axis)", topLevelSlice: this.showHorizontal, slices: [this.horizontalColor, this.horizontalStrokeWidth, this.horizontalLineStyle, this.horizontalTransparency] });

    name: string = "gridlines";
    displayName: string = "Gridlines";
    groups = [this.verticalGroup, this.horizontalGroup];
}
