import type { AxisRangeResolution } from "../../domain/types";

export function coerceAxisBound(raw: unknown): number {
    if (raw === null || raw === undefined) return NaN;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : NaN;
}

export function resolveAxisRange(rawMin: unknown, rawMax: unknown): AxisRangeResolution {
    const min = coerceAxisBound(rawMin);
    const max = coerceAxisBound(rawMax);
    const minOk = !Number.isNaN(min);
    const maxOk = !Number.isNaN(max);
    if (minOk && maxOk && min === 0 && max === 0) {
        return { overriddenMin: false, overriddenMax: false, min: NaN, max: NaN };
    }
    return {
        overriddenMin: minOk,
        overriddenMax: maxOk,
        min: minOk ? min : NaN,
        max: maxOk ? max : NaN
    };
}

export function isAxisRangeOverridden(min: number, max: number): boolean {
    const r = resolveAxisRange(min, max);
    return r.overriddenMin && r.overriddenMax && r.min !== r.max;
}
