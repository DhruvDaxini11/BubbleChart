"use strict";

// Shared helpers used by multiple settings cards.
//   • CONSTANT_OR_RULE — `instanceKind` value that gives a NumUpDown the
//     native Power BI "fx" (conditional-formatting) button beside it.
//   • NumUpDownAuto — wrapper that forwards `placeholderText` (e.g. "Auto")
//     through to the host renderer; the utility class drops it otherwise.
//     Required by the X/Y axis Min/Max NumUpDowns so the input shows
//     "Auto" placeholder when the value is NaN (i.e. no override).

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

export const CONSTANT_OR_RULE = powerbi.VisualEnumerationInstanceKinds.ConstantOrRule;

export class NumUpDownAuto extends formattingSettings.NumUpDown {
    placeholderText: string;
    constructor(object: ConstructorParameters<typeof formattingSettings.NumUpDown>[0] & { placeholderText?: string }) {
        super(object);
        this.placeholderText = (object as { placeholderText?: string }).placeholderText || "Auto";
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getFormattingComponent(objectName: string): any {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const base = (formattingSettings.NumUpDown.prototype.getFormattingComponent as any).call(this, objectName);
        return Object.assign({}, base, { placeholderText: this.placeholderText });
    }
}
