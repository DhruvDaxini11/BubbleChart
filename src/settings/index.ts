"use strict";

// =====================================================================
//  VisualFormattingSettingsModel - aggregator
// =====================================================================
//  Each card lives in its own file under settings/cards/. This file just
//  instantiates one of each, declares the cards[] visible in the format
//  pane (dataColorsCard is intentionally OMITTED - its categoryColors
//  JSON blob is persisted via host.persistProperties), and hosts the
//  updateSliceVisibility() logic that hides slices based on parent
//  toggles. Mirrors the way Power BI's native cards behave.
//
//  KNOWN LIMITATION - Visual swap does NOT auto-transfer field bindings.
//  Power BI matches data roles between visuals by their INTERNAL `name`
//  in capabilities.json - byte-for-byte. Our internal role names
//  (xAxis, yAxis, size, label, color, legend, tooltips, smallMultiple)
//  deliberately do NOT match Power BI built-in scatter/bar conventions.
//  Renaming any of them would orphan existing reports - treat as a
//  breaking v3.0 change.

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import { BubbleSettingsCard, DataColorsCard, LabelSettingsCard } from "./cards/bubble";
import { XAxisSettingsCard, YAxisSettingsCard, GridlinesCard } from "./cards/axes";
import { LegendSettingsCard, SmallMultipleSettingsCard } from "./cards/layout";
import {
    YAxisReferenceLineCard, XAxisReferenceLineCard, ReferenceBandCard,
    ErrorBarsCard, CrosshairCard, REFERENCE_LINE_SLOT_COUNT,
    REF_LINE_TYPE_LABELS
} from "./cards/references";
import { SortingCard } from "./cards/sorting";

// Re-exports for consumers (visual.ts imports these by name)
export { BubbleSettingsCard, DataColorsCard, LabelSettingsCard } from "./cards/bubble";
export { XAxisSettingsCard, YAxisSettingsCard, GridlinesCard } from "./cards/axes";
export { LegendSettingsCard, SmallMultipleSettingsCard } from "./cards/layout";
export {
    YAxisReferenceLineSlot, XAxisReferenceLineSlot,
    YAxisReferenceLineCard, XAxisReferenceLineCard,
    ReferenceBandCard, ErrorBarsCard, CrosshairCard,
    REFERENCE_LINE_SLOT_COUNT
} from "./cards/references";
export { SortingCard } from "./cards/sorting";
export { CONSTANT_OR_RULE, NumUpDownAuto } from "./common";

import FormattingSettingsModel = formattingSettings.Model;

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    bubbleSettingsCard = new BubbleSettingsCard();
    dataColorsCard = new DataColorsCard();
    labelSettingsCard = new LabelSettingsCard();
    xAxisSettingsCard = new XAxisSettingsCard();
    yAxisSettingsCard = new YAxisSettingsCard();
    gridlinesCard = new GridlinesCard();
    legendSettingsCard = new LegendSettingsCard();
    smallMultipleSettingsCard = new SmallMultipleSettingsCard();
    yAxisReferenceLineCard = new YAxisReferenceLineCard();
    xAxisReferenceLineCard = new XAxisReferenceLineCard();
    referenceBandCard = new ReferenceBandCard();
    errorBarsCard = new ErrorBarsCard();
    crosshairCard = new CrosshairCard();
    sortingCard = new SortingCard();

    cards = [
        this.bubbleSettingsCard,
        this.labelSettingsCard,
        this.xAxisSettingsCard,
        this.yAxisSettingsCard,
        this.gridlinesCard,
        this.legendSettingsCard,
        this.smallMultipleSettingsCard,
        this.yAxisReferenceLineCard,
        this.xAxisReferenceLineCard,
        this.referenceBandCard,
        this.errorBarsCard,
        this.crosshairCard,
        this.sortingCard
    ];

    /**
     * Set by visual.ts in update() before getFormattingModel() runs.
     * True iff the X-axis is Continuous AND the bound field is a date
     * column. Drives the numeric-vs-date Min/Max swap in
     * updateSliceVisibility().
     */
    public xIsDate: boolean = false;

    /**
     * Hide irrelevant slices based on the state of their parent toggles
     * (mirrors the way Power BI's native cards behave).
     */
    public updateSliceVisibility(): void {
        const xAxisTypeVal = String(this.xAxisSettingsCard.axisType.value.value);
        const xIsContinuous = xAxisTypeVal === "continuous";
        this.xAxisSettingsCard.logScale.visible = xIsContinuous;
        this.xAxisSettingsCard.invertRange.visible = xIsContinuous;

        const showDateRange = this.xIsDate && xIsContinuous;
        this.xAxisSettingsCard.minDate.visible = showDateRange;
        this.xAxisSettingsCard.maxDate.visible = showDateRange;
        this.xAxisSettingsCard.minValue.visible = !showDateRange;
        this.xAxisSettingsCard.maxValue.visible = !showDateRange;
        if (showDateRange) this.xAxisSettingsCard.logScale.visible = false;

        const xTitleOn = !!this.xAxisSettingsCard.title.value;
        this.xAxisSettingsCard.titleText.visible = xTitleOn;
        this.xAxisSettingsCard.titleStyle.visible = xTitleOn;
        this.xAxisSettingsCard.titleFont.visible = xTitleOn;
        this.xAxisSettingsCard.titleColor.visible = xTitleOn;

        const yTitleOn = !!this.yAxisSettingsCard.title.value;
        this.yAxisSettingsCard.titleText.visible = yTitleOn;
        this.yAxisSettingsCard.titleStyle.visible = yTitleOn;
        this.yAxisSettingsCard.titleFont.visible = yTitleOn;
        this.yAxisSettingsCard.titleColor.visible = yTitleOn;

        const legendTitleOn = !!this.legendSettingsCard.showTitle.value;
        this.legendSettingsCard.titleText.visible = legendTitleOn;
        this.legendSettingsCard.titleStyle.visible = legendTitleOn;
        this.legendSettingsCard.titleAlignment.visible = legendTitleOn;
        this.legendSettingsCard.titleFont.visible = legendTitleOn;
        this.legendSettingsCard.titleColor.visible = legendTitleOn;

        const applyVisibilityToCard = (
            card: YAxisReferenceLineCard | XAxisReferenceLineCard,
            axisLabel: string
        ) => {
            const count = Math.max(
                0,
                Math.min(REFERENCE_LINE_SLOT_COUNT, card.lineCount.value || 0)
            );
            for (let i = 0; i < REFERENCE_LINE_SLOT_COUNT; i++) {
                const slot = card.slots[i];
                const isActive = i < count;
                slot.group.visible = isActive;
                if (!isActive) continue;
                const typeKey = String(slot.type.value.value);
                const typeLabel = REF_LINE_TYPE_LABELS[typeKey] || "Constant";
                const userName = (slot.name.value || "").trim();
                // Auto-name follows the line TYPE so adding a line shows
                // "Y-Axis Constant Line (n)" by default and switches to
                // "Y-Axis Average Line (n)" etc. when the type changes. A
                // user-typed Name still overrides. The "(n)" count is kept.
                slot.group.displayName = userName
                    ? `${userName} (${i + 1})`
                    : `${axisLabel} ${typeLabel} Line (${i + 1})`;

                slot.value.visible = typeKey === "constant";

                const shadeOn = !!slot.showShade.value;
                slot.shadePosition.visible = shadeOn;
                slot.shadeMatchLineColor.visible = shadeOn;
                slot.shadeColor.visible = shadeOn && !slot.shadeMatchLineColor.value;
                slot.shadeTransparency.visible = shadeOn;

                const labelOn = !!slot.showLabel.value;
                slot.labelHPosition.visible = labelOn;
                slot.labelVPosition.visible = labelOn;
                slot.labelStyle.visible = labelOn;
                slot.labelText.visible = labelOn && String(slot.labelStyle.value.value) === "custom";
                slot.labelColor.visible = labelOn;
                slot.labelDisplayUnits.visible = labelOn;
                slot.labelDecimalPlaces.visible = labelOn;
            }
        };
        applyVisibilityToCard(this.yAxisReferenceLineCard, "Y-Axis");
        applyVisibilityToCard(this.xAxisReferenceLineCard, "X-Axis");

        const refBandStartType = String(this.referenceBandCard.startType.value.value);
        const refBandEndType = String(this.referenceBandCard.endType.value.value);
        this.referenceBandCard.startValue.visible = refBandStartType === "constant";
        this.referenceBandCard.endValue.visible = refBandEndType === "constant";

        this.errorBarsCard.bandColor.visible = !!this.errorBarsCard.showBand.value;
        this.errorBarsCard.bandTransparency.visible = !!this.errorBarsCard.showBand.value;

        const smTitleOn = !!this.smallMultipleSettingsCard.showTitle.value;
        this.smallMultipleSettingsCard.titleText.visible = smTitleOn;
        this.smallMultipleSettingsCard.titleStyle.visible = smTitleOn;
        this.smallMultipleSettingsCard.titleFont.visible = smTitleOn;
        this.smallMultipleSettingsCard.titleColor.visible = smTitleOn;
        this.smallMultipleSettingsCard.borderColor.visible = !!this.smallMultipleSettingsCard.showBorder.value;

        const fit = !!this.smallMultipleSettingsCard.fitToVisual.value;
        this.smallMultipleSettingsCard.panelWidth.visible = !fit;
        this.smallMultipleSettingsCard.panelHeight.visible = !fit;

        const showV = !!this.gridlinesCard.showVertical.value;
        this.gridlinesCard.verticalColor.visible = showV;
        this.gridlinesCard.verticalStrokeWidth.visible = showV;
        this.gridlinesCard.verticalLineStyle.visible = showV;
        this.gridlinesCard.verticalTransparency.visible = showV;

        const showH = !!this.gridlinesCard.showHorizontal.value;
        this.gridlinesCard.horizontalColor.visible = showH;
        this.gridlinesCard.horizontalStrokeWidth.visible = showH;
        this.gridlinesCard.horizontalLineStyle.visible = showH;
        this.gridlinesCard.horizontalTransparency.visible = showH;
    }
}
