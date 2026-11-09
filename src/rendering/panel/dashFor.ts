// Tiny shared helper: map a "solid" | "dashed" | "dotted" style name
// to an SVG stroke-dasharray string (null for solid). Used by every
// panel-level renderer that draws lines (gridlines, ref lines, etc.).
export function dashFor(style: string): string | null {
    if (style === "dashed") return "4 4";
    if (style === "dotted") return "1 3";
    return null;
}
