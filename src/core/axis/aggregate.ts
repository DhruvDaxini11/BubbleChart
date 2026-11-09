import * as d3 from "d3";

export function computeAggregate(values: number[], type: string, constantValue: number): number | null {
    if (!values || values.length === 0) return null;
    switch (type) {
        case "constant": return constantValue;
        case "average": return d3.mean(values) ?? null;
        case "median": return d3.median(values) ?? null;
        case "min": return d3.min(values) ?? null;
        case "max": return d3.max(values) ?? null;
        default: return constantValue;
    }
}
