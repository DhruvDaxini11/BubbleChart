"use strict";

// Visual-mark cards: Bubble (shape/size/color/outline), Data Colors (hidden
// JSON blob persisted via host.persistProperties), Data Labels.

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsSimpleCard = formattingSettings.SimpleCard;
import FormattingSettingsCompositeCard = formattingSettings.CompositeCard;
import FormattingSettingsGroup = formattingSettings.Group;
import FormattingSettingsSlice = formattingSettings.Slice;

export class BubbleSettingsCard extends FormattingSettingsCompositeCard {
    shape = new formattingSettings.ItemDropdown({
        name: "shape", displayName: "Shape",
        items: [
            { value: "circle", displayName: "Circle" },
            { value: "square", displayName: "Square" },
            { value: "diamond", displayName: "Diamond" },
            { value: "triangle", displayName: "Triangle" }
        ],
        value: { value: "circle", displayName: "Circle" }
    });
    shapeGroup = new FormattingSettingsGroup({ name: "bubbleSettings_shape", displayName: "Shape", slices: [this.shape] });

    minSize = new formattingSettings.NumUpDown({ name: "minSize", displayName: "Min Bubble Size", value: 10, options: { minValue: { value: 2, type: 0 }, maxValue: { value: 100, type: 1 } } });
    maxSize = new formattingSettings.NumUpDown({ name: "maxSize", displayName: "Max Bubble Size", value: 40, options: { minValue: { value: 10, type: 0 }, maxValue: { value: 200, type: 1 } } });
    sizeGroup = new FormattingSettingsGroup({ name: "bubbleSettings_size", displayName: "Size", slices: [this.minSize, this.maxSize] });

    defaultColor = new formattingSettings.ColorPicker({ name: "defaultColor", displayName: "Default Color", value: { value: "#4682B4" } });
    transparency = new formattingSettings.NumUpDown({ name: "transparency", displayName: "Transparency (%)", value: 0, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 100, type: 1 } } });
    colorGroup = new FormattingSettingsGroup({ name: "bubbleSettings_color", displayName: "Color", slices: [this.defaultColor, this.transparency] });

    outlineColor = new formattingSettings.ColorPicker({ name: "outlineColor", displayName: "Outline Color", value: { value: "#333333" } });
    outlineThickness = new formattingSettings.NumUpDown({ name: "outlineThickness", displayName: "Outline Thickness", value: 0, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 10, type: 1 } } });
    showOutlineOnly = new formattingSettings.ToggleSwitch({ name: "showOutlineOnly", displayName: "Show Outline Only", value: false });
    outlineGroup = new FormattingSettingsGroup({ name: "bubbleSettings_outline", displayName: "Outline", slices: [this.outlineColor, this.outlineThickness, this.showOutlineOnly] });

    name: string = "bubbleSettings";
    displayName: string = "Bubble";
    groups = [this.shapeGroup, this.sizeGroup, this.colorGroup, this.outlineGroup];
}

// Hidden: persisted via host.persistProperties, not surfaced in the format pane.
export class DataColorsCard extends FormattingSettingsSimpleCard {
    colorByCategory = new formattingSettings.ToggleSwitch({ name: "colorByCategory", displayName: "Color by Category", value: true });
    fill = new formattingSettings.ColorPicker({ name: "fill", displayName: "Fill", value: { value: "" } });
    categoryColors = new formattingSettings.TextInput({ name: "categoryColors", displayName: "Category Colors (JSON)", value: "", placeholder: "{}" });

    name: string = "dataColors";
    displayName: string = "Data Colors";
    slices: Array<FormattingSettingsSlice> = [this.colorByCategory, this.fill, this.categoryColors];
}

export class LabelSettingsCard extends FormattingSettingsCompositeCard {
    topLevelSlice = new formattingSettings.ToggleSwitch({ name: "show", displayName: "Show Labels", value: false });
    get show() { return this.topLevelSlice; }

    color = new formattingSettings.ColorPicker({ name: "color", displayName: "Label Color", value: { value: "#333333" } });
    fontSize = new formattingSettings.NumUpDown({ name: "fontSize", displayName: "Font Size", value: 9, options: { minValue: { value: 6, type: 0 }, maxValue: { value: 40, type: 1 } } });
    displayUnits = new formattingSettings.ItemDropdown({
        name: "displayUnits", displayName: "Display Units",
        items: [
            { value: "auto", displayName: "Auto" },
            { value: "none", displayName: "None" },
            { value: "thousands", displayName: "Thousands" },
            { value: "millions", displayName: "Millions" },
            { value: "billions", displayName: "Billions" }
        ],
        value: { value: "auto", displayName: "Auto" }
    });
    decimalPlaces = new formattingSettings.NumUpDown({ name: "decimalPlaces", displayName: "Decimal Places", value: 1, options: { minValue: { value: 0, type: 0 }, maxValue: { value: 10, type: 1 } } });
    valuesGroup = new FormattingSettingsGroup({ name: "labelSettings_values", displayName: "Values", slices: [this.color, this.fontSize, this.displayUnits, this.decimalPlaces] });

    labelPosition = new formattingSettings.ItemDropdown({
        name: "labelPosition", displayName: "Label Position",
        items: [
            { value: "center", displayName: "Center" },
            { value: "above", displayName: "Above" },
            { value: "below", displayName: "Below" },
            { value: "right", displayName: "Right" }
        ],
        value: { value: "center", displayName: "Center" }
    });
    optionsGroup = new FormattingSettingsGroup({ name: "labelSettings_options", displayName: "Options", slices: [this.labelPosition] });

    name: string = "labelSettings";
    displayName: string = "Data Labels";
    groups = [this.valuesGroup, this.optionsGroup];
}
