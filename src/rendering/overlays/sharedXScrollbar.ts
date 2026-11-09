import * as d3 from "d3";

// Mutable state held by the Visual class and threaded through every
// render call. Lazily-created selections live here so re-renders
// don't create duplicate scrollbar divs. `xScrollLeft` is the scroll
// position in PLOT space (not pixels) consumed by every panel's
// `.x-scroll-content` translate.
export interface SharedXScrollbarState {
    scrollbar: d3.Selection<HTMLDivElement, unknown, null, undefined> | null;
    inner: d3.Selection<HTMLDivElement, unknown, null, undefined> | null;
    xScrollLeft: number;
    currentVirtualPlotW: number;
    currentVisiblePlotW: number;
}

// A single, slim native horizontal scrollbar mounted below the
// small-multiples panel grid. Its scrollLeft drives a synchronized
// `translate(-x, 0)` on every panel's `.x-scroll-content` group so all
// panels' x-axes pan in lockstep.
export function renderSharedXScrollbar(
    rootElement: HTMLElement,
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    state: SharedXScrollbarState,
    visible: boolean,
    leftPx: number,
    topPx: number,
    widthPx: number,
    heightPx: number,
    virtualPlotW: number,
    visiblePlotW: number
): void {
    const root = d3.select(rootElement);

    if (!visible || virtualPlotW <= visiblePlotW || visiblePlotW <= 0) {
        if (state.scrollbar) {
            state.scrollbar.style("display", "none");
        }
        return;
    }

    // Lazily create the scrollbar host + inner spacer.
    if (!state.scrollbar) {
        state.scrollbar = root.append("div")
            .classed("bubble-shared-xscroll", true)
            .style("position", "absolute")
            .style("overflow-x", "auto")
            .style("overflow-y", "hidden")
            .style("z-index", "7") as unknown as d3.Selection<HTMLDivElement, unknown, null, undefined>;
        state.inner = state.scrollbar.append("div")
            .style("height", "1px")
            .style("pointer-events", "none") as unknown as d3.Selection<HTMLDivElement, unknown, null, undefined>;

        // Wire scroll → update each panel's x-scroll-content transform.
        // The handler closes over `state` so it always reads the latest
        // cached virtual/visible widths set on subsequent renders.
        state.scrollbar.on("scroll", () => {
            const node = state.scrollbar!.node() as HTMLDivElement;
            const sl = node.scrollLeft;
            const innerNode = state.inner!.node() as HTMLDivElement;
            const innerW = innerNode.offsetWidth;
            const hostW = node.clientWidth;
            const denom = Math.max(1, innerW - hostW);
            const ratio = Math.max(0, Math.min(1, sl / denom));
            const maxOffset = Math.max(0, state.currentVirtualPlotW - state.currentVisiblePlotW);
            state.xScrollLeft = ratio * maxOffset;
            svg.selectAll<SVGGElement, unknown>(".x-scroll-content")
                .attr("transform", `translate(${-state.xScrollLeft}, 0)`);
        });
    }

    state.scrollbar
        .style("display", "block")
        .style("left", leftPx + "px")
        .style("top", topPx + "px")
        .style("width", widthPx + "px")
        .style("height", heightPx + "px");

    // Inner spacer width sets the scroll range. Map virtual:visible
    // ratio onto host width so the thumb proportion matches the
    // visible portion of the x-axis.
    const ratio = virtualPlotW / Math.max(1, visiblePlotW);
    const innerWidth = Math.max(widthPx + 1, Math.round(widthPx * ratio));
    state.inner!.style("width", innerWidth + "px");

    state.currentVirtualPlotW = virtualPlotW;
    state.currentVisiblePlotW = visiblePlotW;

    // Restore scroll position from xScrollLeft (in case of re-render).
    const maxOffset = Math.max(0, virtualPlotW - visiblePlotW);
    const denom = Math.max(1, innerWidth - widthPx);
    const restoreRatio = maxOffset > 0 ? state.xScrollLeft / maxOffset : 0;
    const sb = state.scrollbar.node() as HTMLDivElement;
    if (sb) sb.scrollLeft = Math.round(restoreRatio * denom);
}
