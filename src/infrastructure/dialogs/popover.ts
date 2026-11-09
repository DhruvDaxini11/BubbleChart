import * as d3 from "d3";

// Shared modal-popover scaffolding used by the inline color-picker and
// sort-criteria fallbacks (when `host.openModalDialog` isn't available).
// Both dialogs share ~80% of the same structure: a full-viewport overlay
// backdrop, an overflow-walkup that forces ancestors to `overflow:visible`
// so the dialog can escape Power BI's sandboxed iframe, a header with
// title + close-X, a scrollable body filled by the per-dialog picker
// module, and a footer with Cancel / OK buttons.

export interface InlinePopoverOptions<TPending> {
    // Used for the d3.selectAll(".${overlayClass}").remove() call — must
    // be unique per dialog so two popovers can stack without clobbering
    // each other.
    overlayClass: string;
    // Walked up to force `overflow:visible` so the fixed overlay can
    // fill the visual's iframe (Power BI custom visuals run sandboxed).
    rootElement: HTMLElement;
    title: string;
    // Optional right-aligned subtitle in the header. Color picker uses
    // it to show the field driving the colors; sort dialog leaves it
    // undefined.
    subtitle?: string;
    width: string;   // e.g. "420px" or "580px"
    okLabel: string; // "Apply" or "OK"
    buildBody: (host: HTMLElement) => { getPending: () => TPending };
    onOk: (pending: TPending) => void;
}

export function showInlinePopover<TPending>(opts: InlinePopoverOptions<TPending>): void {
    d3.selectAll(`.${opts.overlayClass}`).remove();

    // Walk up ancestors and force overflow:visible. Save originals so
    // we can restore them when the dialog closes.
    const savedOverflows: { el: HTMLElement; val: string }[] = [];
    let ancestor: HTMLElement | null = opts.rootElement;
    while (ancestor && ancestor !== document.documentElement) {
        const current = ancestor.style.overflow;
        if (current !== "visible") {
            savedOverflows.push({ el: ancestor, val: current });
            ancestor.style.overflow = "visible";
        }
        ancestor = ancestor.parentElement;
    }

    const overlay = d3.select(document.body).append("div")
        .classed(opts.overlayClass, true)
        .style("position", "fixed")
        .style("top", "0").style("left", "0")
        .style("width", "100vw").style("height", "100vh")
        .style("background", "rgba(0,0,0,0.40)")
        .style("backdrop-filter", "blur(2px)")
        .style("z-index", "100000")
        .style("display", "flex")
        .style("align-items", "center")
        .style("justify-content", "center")
        .style("font-family", "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif");

    const closeDialog = () => {
        overlay.remove();
        savedOverflows.forEach(s => { s.el.style.overflow = s.val; });
    };

    const dialog = overlay.append("div")
        .style("background", "#ffffff")
        .style("border-radius", "12px")
        .style("box-shadow", "0 24px 48px rgba(0,0,0,0.20), 0 8px 16px rgba(0,0,0,0.12)")
        .style("width", opts.width)
        .style("max-width", "94vw")
        .style("max-height", "85vh")
        .style("display", "flex")
        .style("flex-direction", "column")
        .style("overflow", "hidden")
        .style("animation", "bubbleDialogFadeIn 0.15s ease-out");

    // Inject the keyframes once per document so subsequent popovers
    // don't add duplicate <style> nodes.
    if (!document.getElementById("bubble-dialog-keyframes")) {
        const style = document.createElement("style");
        style.id = "bubble-dialog-keyframes";
        style.textContent = `
            @keyframes bubbleDialogFadeIn {
                from { opacity: 0; transform: translateY(12px) scale(0.97); }
                to   { opacity: 1; transform: translateY(0) scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    // ── Header ──────────────────────────────────────────────────────
    const header = dialog.append("div")
        .style("padding", "16px 20px 12px")
        .style("display", "flex")
        .style("align-items", "center")
        .style("justify-content", "space-between")
        .style("border-bottom", "1px solid #f0f0f0");
    header.append("div")
        .style("font-size", "15px")
        .style("font-weight", "600")
        .style("color", "#1a1a1a")
        .text(opts.title);
    if (opts.subtitle !== undefined) {
        header.append("div")
            .style("font-size", "12px")
            .style("color", "#777")
            .style("margin-left", "8px")
            .style("flex", "1")
            .style("text-align", "right")
            .text(opts.subtitle);
    }
    const closeBtn = header.append("div")
        .style("width", "28px").style("height", "28px")
        .style("display", "flex").style("align-items", "center").style("justify-content", "center")
        .style("border-radius", "6px")
        .style("cursor", "pointer")
        .style("margin-left", "8px")
        .style("color", "#666")
        .style("font-size", "18px")
        .style("transition", "background 0.1s")
        .html("&#x2715;");
    closeBtn.on("mouseover", function () { d3.select(this).style("background", "#f0f0f0"); });
    closeBtn.on("mouseout", function () { d3.select(this).style("background", "transparent"); });
    closeBtn.on("click", () => closeDialog());

    // ── Body — scrollable, filled by per-dialog picker ─────────────
    const body = dialog.append("div")
        .style("flex", "1")
        .style("overflow-y", "auto")
        .style("padding", "8px 20px");

    const pickerHandle = opts.buildBody(body.node() as HTMLElement);

    // ── Footer — Cancel + OK ───────────────────────────────────────
    const footer = dialog.append("div")
        .style("padding", "12px 20px 16px")
        .style("border-top", "1px solid #f0f0f0")
        .style("display", "flex")
        .style("justify-content", "flex-end")
        .style("gap", "10px");

    const btnBase = "display:inline-flex;align-items:center;justify-content:center;" +
        "height:32px;padding:0 16px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;" +
        "transition:background 0.1s,box-shadow 0.1s;";

    const cancelBtn = footer.append("button")
        .attr("style", btnBase + "background:#f5f5f5;color:#444;border:1px solid #ddd;")
        .text("Cancel");
    cancelBtn.on("mouseover", function () { d3.select(this).style("background", "#eaeaea"); });
    cancelBtn.on("mouseout", function () { d3.select(this).style("background", "#f5f5f5"); });
    cancelBtn.on("click", () => closeDialog());

    const okBtn = footer.append("button")
        .attr("style", btnBase + "background:#117a3e;color:#fff;border:1px solid #0e6832;")
        .text(opts.okLabel);
    okBtn.on("mouseover", function () { d3.select(this).style("background", "#0f6c36"); });
    okBtn.on("mouseout", function () { d3.select(this).style("background", "#117a3e"); });
    okBtn.on("click", () => {
        const pending = pickerHandle.getPending() as TPending;
        opts.onOk(pending);
        closeDialog();
    });

    // Close when clicking the backdrop (outside the dialog body)
    overlay.on("click", function (event: MouseEvent) {
        if (event.target === overlay.node()) closeDialog();
    });

    // Close on Escape
    const escHandler = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
            closeDialog();
            document.removeEventListener("keydown", escHandler);
        }
    };
    document.addEventListener("keydown", escHandler);
}
