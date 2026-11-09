export function shapePath(shape: string, r: number): string {
    switch (shape) {
        case "square": {
            const s = r * 1.4;
            return `M${-s / 2},${-s / 2}h${s}v${s}h${-s}Z`;
        }
        case "diamond": {
            return `M0,${-r}L${r},0L0,${r}L${-r},0Z`;
        }
        case "triangle": {
            const h = r * 1.5;
            const w = r * 1.3;
            return `M0,${-h / 2}L${w},${h / 2}L${-w},${h / 2}Z`;
        }
        default: return "";
    }
}
