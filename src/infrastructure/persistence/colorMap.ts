import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import { VisualFormattingSettingsModel } from "../../settings";

// Read the persisted category→color JSON blob (`dataColors.categoryColors`)
// out of the DataView's metadata objects, with a defensive fallback to the
// settings card's TextInput slice in case the metadata path is missing.
export function loadCategoryColorMap(
    dataView: DataView | undefined,
    formattingSettings: VisualFormattingSettingsModel | undefined
): Map<string, string> {
    const result = new Map<string, string>();
    let raw: any = undefined;
    try {
        raw = dataView?.metadata?.objects?.["dataColors"]?.["categoryColors"];
    } catch { /* ignore */ }
    if (raw == null && formattingSettings && (formattingSettings as any).dataColorsCard) {
        raw = (formattingSettings as any).dataColorsCard.categoryColors?.value;
    }
    if (!raw) return result;
    try {
        const obj = JSON.parse(String(raw));
        if (obj && typeof obj === "object") {
            Object.keys(obj).forEach(k => {
                if (typeof obj[k] === "string") result.set(k, obj[k]);
            });
        }
    } catch { /* ignore malformed JSON */ }
    return result;
}

// Serialize the category→color map and persist it via host.persistProperties.
// `host` is typed loosely because persistProperties isn't on IVisualHost's
// public type (visual.ts already stores `hostAny: any` for the same reason).
export function persistCategoryColorMap(host: any, map: Map<string, string>): void {
    const obj: { [k: string]: string } = {};
    map.forEach((v, k) => { obj[k] = v; });
    const json = JSON.stringify(obj);
    try {
        host.persistProperties({
            merge: [{
                objectName: "dataColors",
                selector: null,
                properties: { categoryColors: json }
            }]
        });
    } catch { /* ignore */ }
}
