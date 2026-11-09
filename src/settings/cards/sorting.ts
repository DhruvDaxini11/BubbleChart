"use strict";

// Sorting card — hidden JSON blob persisted via host.persistProperties.
// The visible Sort dialog mutates `sortConfig` which is read back on
// each update() to rebuild the multi-level comparator.

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsSimpleCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;

export class SortingCard extends FormattingSettingsSimpleCard {
    sortConfig = new formattingSettings.TextInput({
        name: "sortConfig",
        displayName: "Sort Configuration (JSON)",
        value: "",
        placeholder: "[]"
    });

    name: string = "sorting";
    displayName: string = "Sorting";
    slices: Array<FormattingSettingsSlice> = [this.sortConfig];
}
