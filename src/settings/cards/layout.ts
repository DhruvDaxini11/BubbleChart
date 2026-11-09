"use strict";

// Layout cards: Legend (position/values/title) and Small Multiples
// (grid layout/title/border).

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;
import FormattingSettingsGroup = formattingSettings.Group;

export class LegendSettingsCard extends FormattingSettingsCompositeCard {
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show Legend", value: true });
    get show() { return this.topLevelSlice; }

    position = new formattingSettings.ItemDropdown({
        name: "position", displayName: "Position",
        items: [
            { value: "default", displayName: "Default" },
            { value: "topLeft", displayName: "Top left" },
            { value: "topCenter", displayName: "Top center" },
            { value: "topRight", displayName: "Top right" },
            { value: "centerLeft", displayName: "Center left" },
            { value: "centerRight", displayName: "Center right" },
            { value: "bottomLeft", displayName: "Bottom left" },
            { value: "bottomCenter", displayName: "Bottom Center" },
            { value: "bottomRight", displayName: "Bottom right" },
            { value: "topLeftStacked", displayName: "Top left stacked" },
            { value: "topRightStacked", displayName: "Top right stacked" }
        ],
        value: { value: "topRight", displayName: "Top right" }
    });
    optionsGroup = new FormattingSettingsGroup({ name: "legendSettings_options", displayName: "Options", slices: [this.position] });

    fontFamily = new formattingSettings.FontPicker({ name: "fontFamily", displayName: "Font Family", value: "Segoe UI" });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Font Size", value: 9, options: { minValue: { value: 6, type: 0 }, maxValue: { value: 30, type: 1 } } });
    fontBold = new formattingSettings.ToggleSwitch({ name: "fontBold", displayName: "Bold", value: false });
    fontItalic = new formattingSettings.ToggleSwitch({ name: "fontItalic", displayName: "Italic", value: false });
    fontUnderline = new formattingSettings.ToggleSwitch({ name: "fontUnderline", displayName: "Underline", value: false });
    font = new formattingSettings.FontControl({ name: "font", displayName: "Font", fontFamily: this.fontFamily, fontSize: this.fontSize, bold: this.fontBold, italic: this.fontItalic, underline: this.fontUnderline });

    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Color", value: { value: "#666666" } });
    maximumHeight = new formattingSettings.NumUpDown({ name: "maximumHeight", displayName: "Maximum height", value: 25, options: { minValue: { value: 5, type: 0 }, maxValue: { value: 50, type: 1 } } });
    concatenateLabels = new formattingSettings.ToggleSwitch({ name: "concatenateLabels", displayName: "Concatenate labels", value: true });
    valuesGroup = new FormattingSettingsGroup({ name: "legendSettings_values", displayName: "Values", slices: [this.font, this.color, this.maximumHeight, this.concatenateLabels] });

    showTitle = new formattingSettings.ToggleSwitch({ name: "title", displayName: "Show Title", value: true });
    titleText = new formattingSettings.TextInput({ name: "titleText", displayName: "Title text", value: "", placeholder: "Auto" });
    titleStyle = new formattingSettings.ItemDropdown({ name: "titleStyle", displayName: "Style", items: [{ value: "showTitleOnly", displayName: "Show title only" }], value: { value: "showTitleOnly", displayName: "Show title only" } });
    titleFontFamily = new formattingSettings.FontPicker({ name: "titleFontFamily", displayName: "Font family", value: "Segoe UI" });
    titleFontSize = new formattingSettings.NumUpDown({ name: "titleFontSize", displayName: "Font size", value: 12, options: { minValue: { value: 6, type: 0 }, maxValue: { value: 30, type: 1 } } });
    titleFontBold = new formattingSettings.ToggleSwitch({ name: "titleFontBold", displayName: "Bold", value: false });
    titleFontItalic = new formattingSettings.ToggleSwitch({ name: "titleFontItalic", displayName: "Italic", value: false });
    titleFontUnderline = new formattingSettings.ToggleSwitch({ name: "titleFontUnderline", displayName: "Underline", value: false });
    titleFont = new formattingSettings.FontControl({ name: "titleFont", displayName: "Font", fontFamily: this.titleFontFamily, fontSize: this.titleFontSize, bold: this.titleFontBold, italic: this.titleFontItalic, underline: this.titleFontUnderline });
    titleColor = new formattingSettings.ColorPicker({ name: "titleColor", displayName: "Color", value: { value: "#666666" } });
    titleAlignment = new formattingSettings.ItemDropdown({
        name: "titleAlignment", displayName: "Title alignment",
        items: [
            { value: "left", displayName: "Left" },
            { value: "center", displayName: "Center" },
            { value: "right", displayName: "Right" }
        ],
        value: { value: "center", displayName: "Center" }
    });
    titleGroup = new FormattingSettingsGroup({ name: "legendSettings_title", displayName: "Title", topLevelSlice: this.showTitle, slices: [this.titleText, this.titleStyle, this.titleAlignment, this.titleFont, this.titleColor] });

    name: string = "legendSettings";
    displayName: string = "Legend";
    groups = [this.optionsGroup, this.valuesGroup, this.titleGroup];
}

export class SmallMultipleSettingsCard extends FormattingSettingsCompositeCard {
    maxColumns = new formattingSettings.NumUpDown({ name: "maxColumns", displayName: "Columns", value: 2, options: { minValue: { value: 1, type: 0 }, maxValue: { value: 10, type: 1 } } });
    maxRows = new formattingSettings.NumUpDown({ name: "maxRows", displayName: "Rows", value: 2, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 10, type: 1 } } });
    padding = new formattingSettings.NumUpDown({ name: "padding", displayName: "Padding", value: 10, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 50, type: 1 } } });
    fitToVisual = new formattingSettings.ToggleSwitch({ name: "fitToVisual", displayName: "Fit to visual", value: true });
    panelWidth = new formattingSettings.NumUpDown({ name: "panelWidth", displayName: "Inner chart width (px)", value: 380, options: { minValue: { value: 100, type: 0 }, maxValue: { value: 2000, type: 1 } } });
    panelHeight = new formattingSettings.NumUpDown({ name: "panelHeight", displayName: "Inner chart height (px)", value: 280, options: { minValue: { value: 100, type: 0 }, maxValue: { value: 2000, type: 1 } } });
    layoutGroup = new FormattingSettingsGroup({ name: "smallMultipleSettings_layout", displayName: "Layout", slices: [this.maxColumns, this.maxRows, this.padding, this.fitToVisual, this.panelWidth, this.panelHeight] });

    showTitle = new formattingSettings.ToggleSwitch({ name: "showTitle", displayName: "Show Panel Title", value: true });
    titleText = new formattingSettings.TextInput({ name: "titleText", displayName: "Title text", value: "", placeholder: "Auto" });
    titleStyle = new formattingSettings.ItemDropdown({ name: "titleStyle", displayName: "Style", items: [{ value: "showTitleOnly", displayName: "Show title only" }], value: { value: "showTitleOnly", displayName: "Show title only" } });
    titleFontFamily = new formattingSettings.FontPicker({ name: "titleFontFamily", displayName: "Font family", value: "Segoe UI" });
    titleFontSize = new formattingSettings.NumUpDown({ name: "titleFontSize", displayName: "Font size", value: 12, options: { minValue: { value: 6, type: 0 }, maxValue: { value: 30, type: 1 } } });
    titleFontBold = new formattingSettings.ToggleSwitch({ name: "titleFontBold", displayName: "Bold", value: false });
    titleFontItalic = new formattingSettings.ToggleSwitch({ name: "titleFontItalic", displayName: "Italic", value: false });
    titleFontUnderline = new formattingSettings.ToggleSwitch({ name: "titleFontUnderline", displayName: "Underline", value: false });
    titleFont = new formattingSettings.FontControl({ name: "titleFont", displayName: "Font", fontFamily: this.titleFontFamily, fontSize: this.titleFontSize, bold: this.titleFontBold, italic: this.titleFontItalic, underline: this.titleFontUnderline });
    titleColor = new formattingSettings.ColorPicker({ name: "titleColor", displayName: "Color", value: { value: "#333333" } });
    titleGroup = new FormattingSettingsGroup({ name: "smallMultipleSettings_title", displayName: "Title", topLevelSlice: this.showTitle, slices: [this.titleText, this.titleStyle, this.titleFont, this.titleColor] });

    showBorder = new formattingSettings.ToggleSwitch({ name: "showBorder", displayName: "Show Border", value: true });
    borderColor = new formattingSettings.ColorPicker({ name: "borderColor", displayName: "Border Color", value: { value: "#cccccc" } });
    borderGroup = new FormattingSettingsGroup({ name: "smallMultipleSettings_border", displayName: "Border", topLevelSlice: this.showBorder, slices: [this.borderColor] });

    name: string = "smallMultipleSettings";
    displayName: string = "Small Multiples";
    groups = [this.layoutGroup, this.titleGroup, this.borderGroup];
}
