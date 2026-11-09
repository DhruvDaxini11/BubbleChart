"use strict";

import "../style/visual.less";

// Side-effect imports: register the dialog classes with
// globalThis.dialogRegistry so host.openModalDialog can find them.
import "./infrastructure/dialogs/categoryColorsDialog";
import "./infrastructure/dialogs/sortCriteriaDialog";
import { CategoryColorsDialog, CategoryColorsDialogResult } from "./infrastructure/dialogs/categoryColorsDialog";
import { SortCriteriaDialog, SortCriteriaDialogResult } from "./infrastructure/dialogs/sortCriteriaDialog";
import { buildCategoryColorsBody, CATEGORY_PRESET_COLORS } from "./infrastructure/dialogs/categoryColorsPicker";
import { buildSortCriteriaBody, SortField, SortLevel } from "./infrastructure/dialogs/sortCriteriaPicker";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.IVisualHost;
import DataView = powerbi.DataView;
import DataViewCategorical = powerbi.DataViewCategorical;
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import IColorPalette = powerbi.extensibility.IColorPalette;
import DialogAction = powerbi.DialogAction;
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { VisualFormattingSettingsModel, YAxisReferenceLineSlot, XAxisReferenceLineSlot, REFERENCE_LINE_SLOT_COUNT } from "./settings";
import * as d3 from "d3";

// ─── Domain types & constants ─────────────────────────────────────────
import { BubbleDataPoint, BubbleViewModel, AxisRangeResolution } from "./domain/types";
import { X_PATH_SEP } from "./domain/constants";

// ─── Pure helpers (extracted to src/core/) ────────────────────────────
import { applyDateFormat } from "./core/format/dateFormat";
import { formatCategoryValue } from "./core/format/categoryFormat";
import { formatValue } from "./core/format/numberFormat";
import { coerceAxisBound, resolveAxisRange, isAxisRangeOverridden } from "./core/axis/axisRange";
import { computeAggregate } from "./core/axis/aggregate";
import { shapePath } from "./core/shape/shapePath";
import { buildViewModel } from "./core/viewModel/buildViewModel";
import { applySorting as applySortingFn } from "./core/sorting/applySort";
import { loadCategoryColorMap, persistCategoryColorMap } from "./infrastructure/persistence/colorMap";
import { loadSortConfig, persistSortConfig } from "./infrastructure/persistence/sortConfig";
import { showInlinePopover } from "./infrastructure/dialogs/popover";
import { renderYAxisOverlay as renderYAxisOverlayFn } from "./rendering/overlays/yAxisOverlay";
import { renderLegend as renderLegendFn, resolveLegendPosition as resolveLegendPositionFn } from "./rendering/overlays/legend";
import { renderAxisTitlesOverlay as renderAxisTitlesOverlayFn } from "./rendering/overlays/axisTitlesOverlay";
import { renderSharedXScrollbar as renderSharedXScrollbarFn, SharedXScrollbarState } from "./rendering/overlays/sharedXScrollbar";
import { dashFor as dashForShared } from "./rendering/panel/dashFor";
import { renderXGridlines, renderYGridlines } from "./rendering/panel/gridlines";
import { renderReferenceBand } from "./rendering/panel/referenceBand";
import { renderErrorBars } from "./rendering/panel/errorBars";
import { renderYReferenceLines, renderXReferenceLines, RefLineContext } from "./rendering/panel/referenceLines";

// ─── Visual ─────────────────────────────────────────────────────────────
export class Visual implements IVisual {
    private host: IVisualHost;
    private hostAny: any;
    private rootElement: HTMLElement;
    private toolbar: d3.Selection<HTMLDivElement, unknown, null, undefined>;
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private container: d3.Selection<HTMLDivElement, unknown, null, undefined>;
    // Overlay SVGs that live OUTSIDE the scrollable chart container so that
    // the legend, Y-axis and axis titles stay pinned to the visual viewport
    // even when the chart area scrolls horizontally. The Y-axis overlay
    // hosts the axis line, ticks and tick labels for single-chart mode so
    // the axis remains anchored to the left edge while bubbles scroll.
    private legendOverlay: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private xTitleOverlay: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private yTitleOverlay: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private yAxisOverlay: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    // Y-axis reference-line label overlay. Sized to the visual viewport
    // and rendered ABOVE the scrolling bubble-chart-container so labels
    // stay anchored to the visible plot — important when the chart is
    // horizontally scrollable (xVirtualPlotW > plotW). Without this,
    // a label at horizontal-position=Right would land at the right edge
    // of the FULL data extent, requiring the user to scroll to see it.
    private refLineLabelOverlay: d3.Selection<SVGSVGElement, unknown, null, undefined>;
    private selectionManager: ISelectionManager;
    private colorPalette: IColorPalette;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private categoryColorMap: Map<string, string> = new Map();
    private currentColorKeys: string[] = [];
    private currentColorFieldName: string = "";
    // Sorting state
    private sortLevels: { field: string; order: string }[] = [];
    // dataType: "numeric" | "dateTime" | "text"
    private availableFields: { name: string; role: string; isMeasure: boolean; dataType: string }[] = [];

    // Cached 2D canvas context for measuring the true rendered width of a
    // text string. Used to size the right margin to the actual rotated
    // X-axis label extent instead of a char-count heuristic that
    // over-reserves space. Lazily created on first use.
    private textMeasureCtx: CanvasRenderingContext2D | null = null;

    // Shared horizontal scroll state for small-multiples mode. When the
    // x-axis virtual width exceeds a panel's visible plot width, every
    // panel's bubbles + x-tick layer is translated by `-xScrollLeft`,
    // and the shared scrollbar at the bottom drives this value.
    // Lives in a single `SharedXScrollbarState` object so the scrollbar
    // render module can mutate the cached selections / scroll position
    // through one shared reference instead of five separate fields.
    private sharedScrollbarState: SharedXScrollbarState = {
        scrollbar: null,
        inner: null,
        xScrollLeft: 0,
        currentVirtualPlotW: 0,
        currentVisiblePlotW: 0
    };

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.hostAny = options.host as any;
        this.rootElement = options.element;
        this.selectionManager = this.hostAny.createSelectionManager();
        this.colorPalette = this.hostAny.colorPalette;
        this.formattingSettingsService = new FormattingSettingsService();

        const root = d3.select(options.element)
            .style("position", "relative");

        // Toolbar with palette icon (top-left)
        this.toolbar = root.append("div")
            .classed("bubble-toolbar", true)
            .style("position", "absolute")
            .style("top", "4px")
            .style("left", "4px")
            .style("z-index", "10")
            .style("display", "flex")
            .style("gap", "4px");

        const paletteBtn = this.toolbar.append("button")
            .classed("bubble-palette-btn", true)
            .attr("title", "Edit category colors")
            .attr("aria-label", "Edit category colors")
            .style("width", "22px")
            .style("height", "22px")
            .style("padding", "0")
            .style("border", "1px solid transparent")
            .style("background", "transparent")
            .style("cursor", "pointer")
            .style("border-radius", "3px");

        // Palette SVG icon
        paletteBtn.html(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18">
                <path fill="#f5a623" d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.24-.27-.39-.62-.39-1.01 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 8 6.5 8 8 8.67 8 9.5 7.33 11 6.5 11zm3-4C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 8 17.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>`
        );

        paletteBtn.on("mouseover", function () {
            d3.select(this).style("background", "#f0f0f0");
        });
        paletteBtn.on("mouseout", function () {
            d3.select(this).style("background", "transparent");
        });
        paletteBtn.on("click", (event: MouseEvent) => {
            event.stopPropagation();
            this.openColorPickerDialog();
        });

        // Sort button
        const sortBtn = this.toolbar.append("button")
            .classed("bubble-sort-btn", true)
            .attr("title", "Sorting criteria")
            .attr("aria-label", "Sorting criteria")
            .style("width", "22px")
            .style("height", "22px")
            .style("padding", "0")
            .style("border", "1px solid transparent")
            .style("background", "transparent")
            .style("cursor", "pointer")
            .style("border-radius", "3px");
        sortBtn.html(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18">
                <path fill="#555" d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z"/>
            </svg>`
        );
        sortBtn.on("mouseover", function () { d3.select(this).style("background", "#f0f0f0"); });
        sortBtn.on("mouseout", function () { d3.select(this).style("background", "transparent"); });
        sortBtn.on("click", (event: MouseEvent) => {
            event.stopPropagation();
            this.openSortDialog();
        });

        this.container = root
            .append("div")
            .classed("bubble-chart-container", true)
            .style("overflow-x", "auto")
            .style("overflow-y", "hidden")
            .style("width", "100%")
            .style("height", "100%");

        this.svg = this.container
            .append("svg")
            .classed("bubble-chart-svg", true);

        // Overlay SVGs — appended AFTER the scroll container so they sit on top.
        // Each is absolutely positioned and sized to the viewport so its
        // contents stay anchored to the visible area of the visual.
        this.legendOverlay = root.append("svg")
            .classed("bubble-legend-overlay", true)
            .style("position", "absolute")
            .style("top", "0")
            .style("left", "0")
            .style("pointer-events", "none")
            .style("z-index", "5") as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>;

        this.xTitleOverlay = root.append("svg")
            .classed("bubble-xtitle-overlay", true)
            .style("position", "absolute")
            .style("left", "0")
            .style("pointer-events", "none")
            .style("z-index", "5") as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>;

        this.yTitleOverlay = root.append("svg")
            .classed("bubble-ytitle-overlay", true)
            .style("position", "absolute")
            .style("top", "0")
            .style("left", "0")
            .style("pointer-events", "none")
            .style("z-index", "5") as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>;

        // Y-axis overlay — line + ticks + tick labels rendered here in
        // single-chart mode so they don't move with horizontal scrolling.
        // pointer-events:auto isn't required (axis is decorative) so we
        // leave it as none to let clicks pass through to the chart.
        this.yAxisOverlay = root.append("svg")
            .classed("bubble-yaxis-overlay", true)
            .style("position", "absolute")
            .style("top", "0")
            .style("left", "0")
            .style("pointer-events", "none")
            .style("z-index", "6") as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>;

        // Reference-line label overlay — z-index above the chart and
        // Y-axis overlay so labels are always on top of everything.
        this.refLineLabelOverlay = root.append("svg")
            .classed("bubble-refline-label-overlay", true)
            .style("position", "absolute")
            .style("top", "0")
            .style("left", "0")
            .style("pointer-events", "none")
            .style("z-index", "7") as unknown as d3.Selection<SVGSVGElement, unknown, null, undefined>;
    }

    // ─── Load persisted category→color map from settings ────────────────
    // Reads directly from the DataView metadata so we don't have to expose
    // the `dataColorsCard` in the format pane.
    // loadCategoryColorMap / persistCategoryColorMap moved to
    // `infrastructure/persistence/colorMap.ts`.

    // ─── Reference Line: clamp lineCount for each axis card ──────────────
    //
    // Now that add/delete is driven solely by the "Number of lines"
    // NumUpDown (the only mechanism available — Power BI's custom-visual
    // formatting model doesn't expose a clickable button slice), this
    // method just clamps the counter into [0, REFERENCE_LINE_SLOT_COUNT]
    // and persists if needed. New slot defaults come from the slot class
    // constructors, which the formattingmodel utils library merges with
    // any persisted property values during populateFormattingSettingsModel().
    private handleReferenceLineEdits(): void {
        const clampCard = (objectName: string, card: { lineCount: { value: number } }) => {
            const requested = card.lineCount.value || 0;
            const clamped = Math.max(0, Math.min(REFERENCE_LINE_SLOT_COUNT, requested));
            if (requested !== clamped) {
                card.lineCount.value = clamped;
                try {
                    this.hostAny.persistProperties({
                        merge: [{
                            objectName,
                            selector: null,
                            properties: { lineCount: clamped }
                        }]
                    });
                } catch { /* ignore */ }
            }
        };
        clampCard("yAxisReferenceLine", this.formattingSettings.yAxisReferenceLineCard);
        clampCard("xAxisReferenceLine", this.formattingSettings.xAxisReferenceLineCard);
    }


    // ─── Color picker entry point ────────────────────────────────────────
    // Prefers Power BI's host-window-level modal dialog (host.openModalDialog)
    // so users don't have to zoom in on a small visual. Falls back to the
    // inline overlay (rendered inside the visual's iframe) when the host
    // doesn't support modal dialogs — e.g. Embedded analytics, Publish-to-web,
    // Dashboards, or when the user has blocked dialogs for the session.
    private openColorPickerDialog(): void {
        // Sort keys ascending by display label (case-insensitive, numeric-
        // aware) so the list appears alphabetically by default. Sort a copy
        // — `this.currentColorKeys` order is preserved.
        const keys = (this.currentColorKeys || []).slice().sort((a, b) => {
            const labelA = a.indexOf(X_PATH_SEP) >= 0 ? a.split(X_PATH_SEP).join(" › ") : a;
            const labelB = b.indexOf(X_PATH_SEP) >= 0 ? b.split(X_PATH_SEP).join(" › ") : b;
            return labelA.localeCompare(labelB, undefined, { numeric: true, sensitivity: "base" });
        });
        if (!keys || keys.length === 0) return;

        // Build current + default color snapshots once. Both branches use them.
        const currentColors: { [k: string]: string } = {};
        const defaultColors: { [k: string]: string } = {};
        keys.forEach(k => {
            const def = this.colorPalette.getColor(k).value;
            defaultColors[k] = def;
            currentColors[k] = this.categoryColorMap.get(k) || def;
        });

        const allowModal = !!(this.hostAny?.hostCapabilities?.allowModalDialog
            && typeof this.hostAny.openModalDialog === "function");

        if (allowModal) {
            // Host-window-level modal path. Power BI provides the chrome
            // (title bar, OK / Cancel buttons). Min size 240×210, max 90%
            // of browser. 480×440 is a comfortable size for ~10 rows.
            const dialogOptions = {
                actionButtons: [DialogAction.OK, DialogAction.Cancel],
                size: { width: 480, height: 440 },
                title: "Category colors"
            };
            const initialState = {
                keys,
                currentColors,
                defaultColors,
                fieldName: this.currentColorFieldName || "",
                presetColors: CATEGORY_PRESET_COLORS
            };
            try {
                this.hostAny.openModalDialog(
                    CategoryColorsDialog.id,
                    dialogOptions,
                    initialState
                ).then((ret: { actionId: number; resultState?: CategoryColorsDialogResult }) => {
                    if (ret && (ret.actionId === DialogAction.OK || ret.actionId === DialogAction.Close)
                        && ret.resultState && ret.resultState.colors) {
                        const colors = ret.resultState.colors;
                        Object.keys(colors).forEach(k => {
                            this.categoryColorMap.set(k, colors[k]);
                        });
                        persistCategoryColorMap(this.hostAny, this.categoryColorMap);
                    }
                }).catch(() => {
                    // openModalDialog rejects when the user has blocked
                    // modal dialogs for the session. Fall back to inline.
                    this.openColorPickerInline(keys, currentColors, defaultColors);
                });
                return;
            } catch {
                // Synchronous failure (e.g. API not available despite
                // the capability flag). Fall through to inline.
            }
        }

        this.openColorPickerInline(keys, currentColors, defaultColors);
    }

    // ─── Inline color picker (fallback overlay, mounted on document.body) ──
    // Used when the host doesn't support modal dialogs (embedded analytics,
    // publish-to-web, dashboards) or when the user has blocked dialogs.
    private openColorPickerInline(
        keys: string[],
        currentColors: { [k: string]: string },
        defaultColors: { [k: string]: string }
    ): void {
        showInlinePopover<{ [k: string]: string }>({
            overlayClass: "bubble-color-dialog-overlay",
            rootElement: this.rootElement,
            title: "Category colors",
            subtitle: this.currentColorFieldName || "",
            width: "420px",
            okLabel: "Apply",
            buildBody: (host) => buildCategoryColorsBody(host, {
                keys,
                currentColors,
                defaultColors,
                presetColors: CATEGORY_PRESET_COLORS
            }),
            onOk: (pending) => {
                Object.keys(pending).forEach(k => {
                    this.categoryColorMap.set(k, pending[k]);
                });
                persistCategoryColorMap(this.hostAny, this.categoryColorMap);
            }
        });
    }

    // loadSortConfig / persistSortConfig moved to
    // `infrastructure/persistence/sortConfig.ts`.

    // ── Sort-order definitions ──────────────────────────────────────────
    // Text orderings:
    //   "A to Z"                  → plain lexicographic comparison
    //                                (string < string). Treats "10" as
    //                                coming BEFORE "9" because '1' < '9'
    //                                at the character level. Case-sensitive
    //                                ("Apple" < "apple" because 'A' < 'a').
    //   "A to Z (natural order)"  → uses localeCompare with {numeric:true},
    //                                so embedded numbers sort by value:
    //                                "file2" < "file10". Still
    //                                case-sensitive.
    //   "A to Z (ignore case)"    → case-insensitive plain lexicographic
    //                                comparison ("apple" === "Apple").
    //                                Does NOT do natural-number ordering.
    // (SORT_ORDERS lives in src/sortCriteriaPicker.ts so the modal dialog
    // file can share the same list without re-declaring it.)

    // Sorting helpers moved to `core/sorting/applySort.ts`.

    // ─── Sort dialog ────────────────────────────────────────────────────
    // ─── Sort criteria entry point ───────────────────────────────────────
    // Prefers Power BI's host-window-level modal dialog so users don't
    // have to zoom in on a small visual. Falls back to the inline overlay
    // when the host doesn't support modal dialogs (Embedded analytics,
    // Publish-to-web, Dashboards) or when the user has blocked dialogs.
    private openSortDialog(): void {
        const fields = this.availableFields as SortField[];
        if (!fields || fields.length === 0) return;
        const initialLevels: SortLevel[] = this.sortLevels.map(l => ({ ...l }));

        const allowModal = !!(this.hostAny?.hostCapabilities?.allowModalDialog
            && typeof this.hostAny.openModalDialog === "function");

        if (allowModal) {
            const dialogOptions = {
                actionButtons: [DialogAction.OK, DialogAction.Cancel],
                size: { width: 620, height: 480 },
                title: "Sorting Criteria"
            };
            const initialState = { fields, initialLevels };
            try {
                this.hostAny.openModalDialog(
                    SortCriteriaDialog.id,
                    dialogOptions,
                    initialState
                ).then((ret: { actionId: number; resultState?: SortCriteriaDialogResult }) => {
                    if (ret && (ret.actionId === DialogAction.OK || ret.actionId === DialogAction.Close)
                        && ret.resultState && Array.isArray(ret.resultState.levels)) {
                        const valid = ret.resultState.levels.filter(l => l && l.field && l.order);
                        this.sortLevels = valid;
                        persistSortConfig(this.hostAny, valid);
                    }
                }).catch(() => {
                    // openModalDialog rejects when the user has blocked
                    // modal dialogs for the session. Fall back to inline.
                    this.openSortDialogInline(fields, initialLevels);
                });
                return;
            } catch {
                // Synchronous failure — fall through to inline.
            }
        }

        this.openSortDialogInline(fields, initialLevels);
    }

    // ─── Inline sort criteria editor (fallback overlay) ──────────────────
    // Used when the host doesn't support modal dialogs (embedded analytics,
    // publish-to-web, dashboards) or when the user has blocked dialogs.
    private openSortDialogInline(fields: SortField[], initialLevels: SortLevel[]): void {
        showInlinePopover<SortLevel[]>({
            overlayClass: "bubble-sort-dialog-overlay",
            rootElement: this.rootElement,
            title: "Sorting Criteria",
            width: "580px",
            okLabel: "OK",
            buildBody: (host) => buildSortCriteriaBody(host, { fields, initialLevels }),
            onOk: (valid) => {
                this.sortLevels = valid;
                persistSortConfig(this.hostAny, valid);
            }
        });
    }

    // ─── Parse DataView into ViewModel ──────────────────────────────────
    // Thin wrapper around the pure `buildViewModel` helper in
    // `core/viewModel/buildViewModel.ts`. The helper returns three
    // side-channel fields that the toolbar dialogs need; we assign them
    // back onto `this` here so call sites see the same shape they had
    // before the extraction.
    // Measure the true pixel width of `text` as it will render with the
    // given font. Backed by a lazily-created, cached canvas 2D context.
    // Falls back to a conservative char-count estimate if a context can't
    // be obtained (keeps layout safe in headless/degraded environments).
    private measureTextWidth(
        text: string, fontPx: number, fontFamily: string,
        bold: boolean, italic: boolean
    ): number {
        if (!this.textMeasureCtx) {
            const canvas = document.createElement("canvas");
            this.textMeasureCtx = canvas.getContext("2d");
        }
        const ctx = this.textMeasureCtx;
        if (!ctx) return text.length * fontPx * 0.6;
        ctx.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${fontPx}px ${fontFamily || "Segoe UI"}`;
        return ctx.measureText(text).width;
    }

    private createViewModel(dataView: DataView): BubbleViewModel | null {
        const result = buildViewModel(dataView, {
            categoryColorMap: this.categoryColorMap,
            colorPalette: this.colorPalette,
            host: this.hostAny
        });
        if (!result) return null;
        this.currentColorKeys = result.currentColorKeys;
        this.currentColorFieldName = result.currentColorFieldName;
        this.availableFields = result.availableFields;
        return result.viewModel;
    }

    // ─── Render a single chart panel ────────────────────────────────────
    // `drawAxisTitlesInline` controls whether axis titles are drawn inside
    // this panel's SVG (used for small multiples). For the single-chart
    // case we draw titles in a viewport-pinned overlay instead, so the
    // caller passes `false`.
    private renderPanel(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        dataPoints: BubbleDataPoint[],
        xCategories: string[],
        width: number,
        height: number,
        viewModel: BubbleViewModel,
        drawAxisTitlesInline: boolean = false,
        skipYAxisInline: boolean = false,
        // Optional shared x-scroll. When `xVirtualPlotW > 0` and exceeds
        // the panel's visible plot width, the bubbles + x-axis tick layer
        // is clipped to the visible plot box and translated by
        // `-xScrollLeft`. The shared scrollbar (mounted by the caller)
        // updates this transform across every panel simultaneously.
        xVirtualPlotW: number = 0,
        xScrollLeft: number = 0,
        panelKey: string = "",
        // Viewport positioning info for the Y-axis reference-line label
        // overlay. When `visibleContainerW > 0`, Y-axis labels render into
        // `this.refLineLabelOverlay` (positioned over the visual viewport,
        // outside the scrolling div) at coords (panelLeftInVisual + ...,
        // panelTopInVisual + ...). This keeps labels visible regardless
        // of horizontal scroll inside the bubble-chart-container.
        panelLeftInVisual: number = 0,
        panelTopInVisual: number = 0,
        visibleContainerW: number = 0
    ): { plotW: number; plotH: number; marginLeft: number; marginTop: number; yScale: d3.ScaleLinear<number, number>; yTickCount: number; yTickValues: number[] } | void {
        const settings = this.formattingSettings;
        const bubble = settings.bubbleSettingsCard;
        const labels = settings.labelSettingsCard;
        const xAxis = settings.xAxisSettingsCard;
        const yAxis = settings.yAxisSettingsCard;
        const gridlines = settings.gridlinesCard;
        const yRefLine = settings.yAxisReferenceLineCard;
        const xRefLine = settings.xAxisReferenceLineCard;
        const refBand = settings.referenceBandCard;
        const errorBars = settings.errorBarsCard;

        // ── Gridlines source resolver ────────────────────────────────────
        // The dedicated `gridlines` card is now the sole source of truth.
        // The legacy axis-card gridline toggles are no longer surfaced in
        // any group, so we don't OR them in — doing so meant the user's
        // "off" choice on the new card couldn't override the legacy
        // default-on Y-axis value.
        const showXGrid = !!gridlines.showVertical.value;
        const xGridColor = gridlines.verticalColor.value.value;
        const xGridWidth = gridlines.verticalStrokeWidth.value || 1;
        const xGridStyle = String(gridlines.verticalLineStyle.value.value || "solid");
        const xGridOpacity = Math.max(0, Math.min(1, 1 - (gridlines.verticalTransparency.value || 0) / 100));

        const showYGrid = !!gridlines.showHorizontal.value;
        const yGridColor = gridlines.horizontalColor.value.value;
        const yGridWidth = gridlines.horizontalStrokeWidth.value || 1;
        const yGridStyle = String(gridlines.horizontalLineStyle.value.value || "solid");
        const yGridOpacity = Math.max(0, Math.min(1, 1 - (gridlines.horizontalTransparency.value || 0) / 100));

        // `dashFor` moved to `rendering/panel/dashFor.ts` (re-exported
        // here as `dashForShared` so existing call sites can stay terse).
        const dashFor = dashForShared;

        // Leaf display (last segment of each hierarchy path) drives the rotation heuristic.
        // Special case: when the X-axis is a Year/Month/Day (or Year/Quarter/Month/Day)
        // date hierarchy AND we've drilled down to the Day leaf, show the full composite
        // date "MM/dd/yyyy" at the leaf tick instead of only the day number — matching
        // the formatting used when a raw Date column is bound (non-hierarchy).
        //
        // Level-name matching is tolerant: we look for the words "year", "month",
        // "day" (or "date") as whole tokens inside the column display name. This
        // accepts variations like "Fiscal Year", "Month Name", "Order Date", etc.
        const levelNamesLower = viewModel.xLevelNames.map(n => (n || "").toLowerCase());
        const leafLevelName = levelNamesLower.length ? levelNamesLower[levelNamesLower.length - 1] : "";
        const hasWord = (name: string, word: string): boolean => {
            if (!name) return false;
            return new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`, "i").test(name);
        };
        const leafIsDay = hasWord(leafLevelName, "day") || hasWord(leafLevelName, "date");
        const yearLevelIdx = levelNamesLower.findIndex(n => hasWord(n, "year"));
        const monthLevelIdx = levelNamesLower.findIndex(n => hasWord(n, "month"));
        // For the day position, prefer "day"; fall back to "date" if no explicit "day".
        let dayLevelIdx = levelNamesLower.findIndex(n => hasWord(n, "day"));
        if (dayLevelIdx < 0) dayLevelIdx = levelNamesLower.findIndex(n => hasWord(n, "date"));
        const hasYearLevel = yearLevelIdx >= 0;
        const hasMonthLevel = monthLevelIdx >= 0;
        const shouldShowFullDate = leafIsDay && hasYearLevel && hasMonthLevel;
        const MONTH_NAME_TO_NUM: Record<string, number> = {
            january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
            july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
            jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7,
            aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
        };
        // ── Leaf-only drill date-format swap ────────────────────────────
        // When the X-axis has a SINGLE column bound (xLevels === 1) we
        // distinguish two leaf-only drill states and swap their formats:
        //   • Hierarchy "Day" leaf (column display name exactly "Day"
        //     and the raw value is a Date object): show the FULL date
        //     "MM/dd/yyyy" at the leaf instead of just the day number.
        //   • Single Date column (raw value is a Date but the column
        //     display name is NOT exactly "Day"): show just the day
        //     number instead of the full date.
        // For multi-level hierarchy drills (xLevels > 1) the existing
        // `shouldShowFullDate` branch still controls the leaf format.
        const isSingleColumnLeaf = viewModel.xLevels === 1;
        const leafLevelNameExact = (viewModel.xLevelNames[viewModel.xLevelNames.length - 1] || "").toLowerCase().trim();
        const leafIsExactDay = leafLevelNameExact === "day";
        const formatDateAsFullDate = (d: Date): string => {
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${mm}/${dd}/${d.getFullYear()}`;
        };
        const leafDisplay = (k: string) => {
            const p = viewModel.xLeafPaths.get(k);
            if (!p || !p.length) return k;

            // Single-column X-axis: covers both the NORMAL state (a raw
            // Date column bound to X-axis, e.g. "HarvestDateOnly") AND
            // the "Go to next level" hierarchy drill which collapses the
            // hierarchy down to a single visible leaf column (e.g. "Day").
            //
            // Try multiple shapes the raw underlying value can arrive in
            // and render the full composite date "MM/dd/yyyy" whenever
            // we can confidently extract a Date. Note: if Power BI's
            // auto-generated date hierarchy is drilled to the Day level,
            // it emits just integer day-of-month (1-31) WITHOUT parent
            // year/month context, so full-date reconstruction is not
            // possible in that specific case and we fall through to the
            // day number.
            if (isSingleColumnLeaf) {
                const rawArr = viewModel.xLeafRawValues.get(k);
                const rawLeaf = rawArr && rawArr.length ? rawArr[rawArr.length - 1] : undefined;

                // 1. Already a JS Date object — most common path for raw
                //    Date columns bound directly.
                if (rawLeaf instanceof Date && !isNaN(rawLeaf.getTime())) {
                    return formatDateAsFullDate(rawLeaf);
                }

                // 2. String that parses as a date. Covers ISO 8601
                //    ("2026-04-30T00:00:00.000Z", "2026-04-30") and
                //    locale-style strings ("04/30/2026", "4/30/2026").
                //    We require the string to be at least 8 chars long
                //    to avoid accidentally matching short numeric-only
                //    strings like "30" which Date.parse interprets as
                //    Jan 30 of the current year on some engines.
                if (typeof rawLeaf === "string") {
                    const s = rawLeaf.trim();
                    if (s.length >= 8) {
                        const t = Date.parse(s);
                        if (!isNaN(t)) {
                            const d = new Date(t);
                            if (!isNaN(d.getTime())) {
                                return formatDateAsFullDate(d);
                            }
                        }
                    }
                }

                // 3. Numeric JS timestamp (milliseconds since epoch).
                //    Threshold of 1e11 (~year 1973) avoids treating
                //    small integers like 1-31 (day-of-month from a
                //    drilled date hierarchy) as timestamps.
                if (typeof rawLeaf === "number" && rawLeaf > 1e11) {
                    const d = new Date(rawLeaf);
                    if (!isNaN(d.getTime())) {
                        return formatDateAsFullDate(d);
                    }
                }

                // No usable Date underlying — fall through to the leaf
                // segment as already formatted by formatCategoryValue
                // (e.g. just the day number "30" when at the Day leaf
                // of a Power BI auto date hierarchy).
            }

            // Multi-column hierarchy ("Expand all down one level" drill).
            // When the X-axis exposes Year + Month + Day as separate
            // levels, the parent rows above the leaf already display the
            // Year and Month — so the leaf tick should show JUST the day
            // number (1, 2, 3, ...) to avoid duplicating that context and
            // to keep tick widths compact.
            if (shouldShowFullDate && p.length === levelNamesLower.length) {
                const dIdx = dayLevelIdx >= 0 && dayLevelIdx < p.length ? dayLevelIdx : (p.length - 1);
                const seg = p[dIdx];
                const n = parseInt(seg, 10);
                if (!isNaN(n) && n >= 1 && n <= 31) {
                    return String(n);
                }
            }
            return p[p.length - 1];
        };
        const leafTexts = xCategories.map(leafDisplay);
        const needsRotation = xCategories.length > 8 || leafTexts.some(t => t.length > 8);
        // Longest leaf string drives BOTH the rotated label height AND
        // the right-side overflow reserve (computed below). Hoisted up
        // here so rotatedLabelHeight can factor in actual label length.
        const longestLeafText = leafTexts.reduce(
            (m, t) => (t && t.length > m.length ? t : m), ""
        );
        // Rotated label vertical extent (geometry, not heuristic).
        // A label rotated 45° has bounding-box height:
        //     text_width × sin(45°) + text_height × cos(45°) + buffer
        // Approximate text_width as: chars × fontSize × CHAR_W_RATIO,
        // where CHAR_W_RATIO ≈ 0.55 for Segoe-UI-like proportional fonts
        // weighted toward digit-heavy strings ("01/26/2026"). The previous
        // formula (xLabelFont*3+6, capped at 60) only depended on font
        // size and under-reserved height for long date labels — they
        // overflowed margin.bottom and got clipped at the SVG edge,
        // making the bottom of dates appear cut off even with extra
        // scrollbar gap below the SVG.
        const xLabelFont = xAxis.fontSize.value;
        const CHAR_W_RATIO = 0.55;
        const SIN45 = 0.7071;
        const rotatedLabelHeight = needsRotation
            ? Math.min(120, Math.max(28, Math.ceil(
                longestLeafText.length * xLabelFont * CHAR_W_RATIO * SIN45  // width × sin
                + xLabelFont * SIN45                                          // height × cos
                + 6                                                            // safety buffer
              )))
            : xLabelFont + 8;                                    // ~19 px @ 11 pt
        // Per-row height for the hierarchy strip below the leaf labels.
        // Was xLabelFont + 6 — that put the bracket bar (at rowY+4) inside
        // the text glyph region (~rowY+3 to baseline rowY+11), which
        // showed up as a horizontal line cutting through the parent
        // labels (e.g. "March", "February"). Bumped to +8 to give the
        // bracket and the text some breathing room — see bracketY/textY
        // adjustments below.
        const PARENT_ROW_H = xLabelFont + 8;                     // pixels per hierarchy row
        const parentRowsHeight = Math.max(0, (viewModel.xLevels - 1)) * PARENT_ROW_H;
        // Trailing constant = vertical gap (in pixels) between the
        // rotated date labels and the axis title. Increase for more
        // breathing room, decrease to pull the title closer.
        // The trailing constant is the breathing room reserved BELOW the
        // rotated X-axis labels and ABOVE the X-axis title baseline. Smaller
        // = title hugs the labels more tightly. Don't drop below ~6 or
        // descenders on the labels (e.g. "g", "y" in label fonts) start to
        // collide with the title ascenders.
        const titleRow = xAxis.title.value ? (xAxis.titleFontSize.value || (xLabelFont + 1)) + 8 : 0;

        // Margins. The left margin shrinks dramatically when the Y-axis is
        // being rendered EXTERNALLY (single-chart mode) because the inline
        // SVG no longer needs to reserve space for axis labels — the
        // external overlay supplies them. We keep ~6px of breathing room
        // so bubbles at the leftmost X-tick aren't clipped by the axis.
        const inlineYWidth = yAxis.show.value ? 50 : 10;
        // ── Rotated leaf label RIGHT overflow ────────────────────────────
        // Leaf tick labels are tilted DOWN-RIGHT (positive 45° rotation
        // with text-anchor "start"), so the RIGHT edge of the rightmost
        // tick's label extends roughly text-width × cos(45°) ≈
        // text-width × 0.71 px to the RIGHT of its tick. If the plot
        // area sits flush with the SVG's right edge that overflow gets
        // clipped — the user sees the LAST tick's label cut off (e.g.
        // "02/10/2026" rendered as "02/10/20" because the trailing "26"
        // is sliced).
        //
        // We measure the longest leaf label (hoisted above — used by
        // BOTH the rotated label HEIGHT computation and this RIGHT
        // overflow reserve) regardless of whether x-scrolling is active.
        // The LEFT margin no longer needs the overflow reserve because
        // the new rotation direction pushes labels rightward of their tick.
        // Estimated horizontal overflow (in px) of the rotated rightmost
        // leaf label past its tick. Previously used 0.6 × 0.72 — that
        // underestimated digit-heavy strings ("02/24/2026") and led to
        // the trailing year being clipped at the plot's right edge.
        // Bumped to 0.65 × 0.78 and added a +6 constant buffer.
        // A label rotated +45° (text-anchor "start", dx 0.5em) extends to
        // the RIGHT of its tick by (textWidth + 0.5em) × cos(45°). We now
        // MEASURE the longest leaf label's true rendered width rather than
        // estimating it from char count × 0.65 × 0.78 (+6) — that
        // heuristic deliberately over-reserved ~15-20px so digit-heavy
        // dates never clipped, which is exactly the right-side whitespace
        // being trimmed here. Measuring fits the last label precisely with
        // only a 2px anti-alias buffer, so the gap shrinks without the
        // date getting cut off.
        const COS45 = 0.7071;
        const rotatedLeafOverflow = needsRotation
            ? Math.ceil(
                (this.measureTextWidth(
                    longestLeafText, xLabelFont, xAxis.fontFamily.value,
                    xAxis.fontBold.value, xAxis.fontItalic.value
                ) + xLabelFont * 0.5) * COS45
              ) + 2
            : 0;
        const baseLeft = skipYAxisInline ? 6 : inlineYWidth;
        // Small-multiples panels sit flush against one another. The
        // rightmost rotated label's tail must NOT bleed into the
        // neighbouring panel — but the previous fix (flipping the last
        // label to -45°) produced a visually jarring asymmetric tilt.
        // We now keep every label rotated +45° and reserve a smaller
        // right margin in small-multiples mode so the rightmost label's
        // tail fits inside the panel. We cap the reserve at 60% of the
        // full overflow so we don't sacrifice too much plot width per
        // panel — the panel's clip-path (set in update()) still hides
        // any residual ink that exceeds this budget.
        const isSmallMultiplesPanel = panelKey.indexOf("sm-") === 0;
        const margin = {
            // In small-multiples mode the panel header (title + padding)
            // already supplies a visual buffer at the top, so reduce the
            // inner top margin to redirect that space to the bottom for
            // the rotated X-axis labels. In single-chart mode keep the
            // original 10 px so the topmost gridline / data point isn't
            // flush against the SVG edge.
            top: isSmallMultiplesPanel ? 4 : 10,
            // Reserve `rotatedLeafOverflow` px on the RIGHT so the
            // rightmost rotated label is fully visible. Small-multiples
            // get a tightened budget (≥10, ≤60% of full overflow) so
            // the plot still extends nearly all the way to the panel
            // edge, with the clip-path hiding any residual overflow.
            right: isSmallMultiplesPanel
                ? (needsRotation ? Math.max(10, Math.ceil(rotatedLeafOverflow * 0.6)) : 8)
                : Math.max(10, rotatedLeafOverflow),
            // Reduced the leading buffer from 10 → 4 px so the X-axis
            // strip hugs the bottom of the plot instead of leaving a
            // visible whitespace band above the labels.
            bottom: xAxis.show.value ? (4 + rotatedLabelHeight + parentRowsHeight + titleRow) : 10,
            left: baseLeft
        };
        const plotW = width - margin.left - margin.right;
        const plotH = height - margin.top - margin.bottom;
        if (plotW <= 0 || plotH <= 0) {
            return {
                plotW: 0, plotH: 0,
                marginLeft: margin.left, marginTop: margin.top,
                yScale: d3.scaleLinear(), yTickCount: 0, yTickValues: []
            };
        }

        const plotArea = g.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        // ── Shared x-axis scroll setup ──────────────────────────────────
        // When xVirtualPlotW > plotW, render the x-axis content in a wider
        // virtual coordinate space and clip it to the visible plot rect.
        // A translate on `scrollContent` is what actually scrolls — driven
        // externally by the shared scrollbar (see renderSharedXScrollbar).
        const enableXScroll = xVirtualPlotW > plotW && xVirtualPlotW > 0;
        const xScaleRangeMax = enableXScroll ? xVirtualPlotW : plotW;

        // Generate a clip-path id unique to this panel/render. The defs
        // node is appended to plotArea so it travels with the panel.
        const clipId = enableXScroll
            ? `bubble-xclip-${panelKey || Math.random().toString(36).substr(2, 9)}-${Date.now() & 0xffff}`
            : "";

        // Horizontal label overflow on the LEFT side of the visible plot
        // box. Leaf tick labels rotate +45° with text-anchor="start", so
        // they extend DOWN-RIGHT of their tick — the leftmost label never
        // crosses the plot's left edge. Allowing any meaningful left
        // overflow here lets the scrolled bubbles + X-axis labels bleed
        // into the inline Y-axis column in small-multiples mode (the
        // Y-axis sits at x = -margin.left .. 0 inside each panel). Keep
        // this at 0 (or at most 2 for sub-pixel anti-aliasing slack).
        const X_LABEL_OVERFLOW_LEFT = 0;

        if (enableXScroll) {
            const defs = plotArea.append("defs");
            // RIGHT-side overflow reserve for the rotated leaf labels.
            // Rotation is +45° with text-anchor="start", so the rightmost
            // label (e.g. "02/24/2026") extends ~text-width × cos(45°)
            // to the RIGHT of its tick. Without including this width
            // inside the clip rect, the trailing year ("2026") gets
            // sliced off at the visible plot edge even though margin.right
            // has already reserved space for it OUTSIDE the clipped area.
            //
            // We mirror the rotatedLeafOverflow calculation (the same one
            // that sets margin.right) and add a small constant buffer.
            const X_LABEL_OVERFLOW_RIGHT = Math.max(rotatedLeafOverflow, 0) + 8;
            defs.append("clipPath").attr("id", clipId)
                .append("rect")
                // Slightly extend above and below to allow tall bubbles
                // and x-axis labels (parent brackets, rotated leaves) to
                // render fully without being cropped by the clip rect.
                // Extend LEFT by X_LABEL_OVERFLOW_LEFT so the leftmost
                // rotated tick label isn't sliced off at the plot edge,
                // and RIGHT by X_LABEL_OVERFLOW_RIGHT so the rightmost
                // label's trailing year stays visible.
                .attr("x", -X_LABEL_OVERFLOW_LEFT)
                .attr("y", -margin.top)
                .attr("width", plotW + X_LABEL_OVERFLOW_LEFT + X_LABEL_OVERFLOW_RIGHT)
                .attr("height", plotH + margin.bottom);
        }

        // The order of these groups matters for z-stacking:
        //   bgLayer    — rendered FIRST, so it sits at the BOTTOM. Hosts
        //                horizontal gridlines, Y-axis reference band and
        //                Y-axis reference line so they stay BEHIND bubbles.
        //   scrollLayer — bubbles, x-gridlines, x-axis labels, brackets,
        //                error bars, crosshair.
        //   staticLayer — Y-axis ticks/labels and inline axis titles —
        //                rendered LAST so they're never obscured.
        const bgLayer = plotArea.append("g").attr("class", "bg-layer");

        const scrollLayer = plotArea.append("g")
            .attr("class", "x-scroll-layer");
        if (enableXScroll) scrollLayer.attr("clip-path", `url(#${clipId})`);

        const scrollContent = scrollLayer.append("g")
            .attr("class", "x-scroll-content")
            .attr("data-panel", panelKey);
        if (enableXScroll && xScrollLeft) {
            scrollContent.attr("transform", `translate(${-xScrollLeft}, 0)`);
        }

        const staticLayer = plotArea.append("g")
            .attr("class", "x-static-layer");

        // ── X-axis mode resolution ──────────────────────────────────────
        // The user-requested mode comes from the format pane; we silently
        // downgrade Continuous→Categorical when the bound field is text
        // OR when a hierarchy is in play (drilldown + continuous is too
        // ambiguous to draw sensibly). The "effective" mode below is what
        // the rest of the renderer branches on.
        const xModeRequested = String(xAxis.axisType.value.value);
        const xCanGoContinuous =
            (viewModel.xLeafDataType === "numeric" || viewModel.xLeafDataType === "date")
            && viewModel.xLevels <= 1;
        const xIsContinuous = xModeRequested === "continuous" && xCanGoContinuous;
        const xIsDate = xIsContinuous && viewModel.xLeafDataType === "date";

        // X Scale — branched on mode.
        //
        // CATEGORICAL: d3.scaleBand() — discrete band per leaf category.
        //   Bubble centre at xScaleBand(cat) + bandwidth/2.
        //
        // CONTINUOUS: scaleLinear (numeric) or scaleTime (date). Bubble
        //   centre at xScale(d.xNumeric). Domain comes from the user's
        //   Min/Max if set, otherwise the data extent. Optional log scale
        //   (when every visible xNumeric > 0) and optional range inversion.
        //
        // We keep a single `xScale` variable typed loosely so the existing
        // band-mode call sites continue to work. Helpers below normalise
        // the per-bubble x-centre computation across both modes so we
        // don't have to branch at every callsite.
        let xScale: any;
        // bandwidth() returns 0 in continuous mode — used to size things
        // like error-bar caps; the renderer uses a small fixed width
        // fallback when bandwidth is 0.
        const xBandwidth = (): number =>
            xIsContinuous ? 0 : (xScale.bandwidth ? xScale.bandwidth() : 0);
        // bubbleX: centre-x for a single dataPoint regardless of mode.
        const bubbleX = (d: BubbleDataPoint): number => {
            if (xIsContinuous) return xScale(d.xNumeric);
            return (xScale(d.xCategory) ?? 0) + xBandwidth() / 2;
        };
        // categoryX: centre-x for a leaf category key (categorical mode
        // only — continuous mode doesn't have a per-category notion).
        const categoryX = (cat: string): number => {
            if (xIsContinuous) {
                // Fallback: look up the first dataPoint with this category
                // and use its xNumeric. Used by the few callsites that
                // iterate xCategories (e.g. error-bar aggregation).
                const first = dataPoints.find(d => d.xCategory === cat);
                return first ? xScale(first.xNumeric) : 0;
            }
            return (xScale(cat) ?? 0) + xBandwidth() / 2;
        };

        if (xIsContinuous) {
            // Compute the visible X extent from dataPoints (NaN guard).
            const numericXs = dataPoints
                .map(d => d.xNumeric)
                .filter(n => !isNaN(n) && isFinite(n));
            let xLo = numericXs.length ? Math.min(...numericXs) : 0;
            let xHi = numericXs.length ? Math.max(...numericXs) : 1;
            // User-supplied Min / Max override. Two storage paths:
            //   • Date X-field  → minDate / maxDate DatePicker (epoch ms
            //     via .getTime()). Format pane shows ONLY the date pair.
            //   • Numeric X     → minValue / maxValue NumUpDown.
            // Resolved per-bound so the user can set just one side, and
            // so fx-bound numeric values that resolve to a single number
            // still take effect on numeric X. `resolveAxisRange`
            // tolerates null/undefined/NaN per bound (treated as Auto).
            let xRange;
            if (xIsDate) {
                const rawMin = xAxis.minDate.value;
                const rawMax = xAxis.maxDate.value;
                // DatePicker hands back a Date | null (or sometimes a
                // string when the host re-hydrates from persisted JSON
                // — guard with Date.parse for that path).
                const toMs = (v: unknown): number => {
                    if (v instanceof Date) return v.getTime();
                    if (typeof v === "string" && v) {
                        const p = Date.parse(v);
                        return Number.isFinite(p) ? p : NaN;
                    }
                    return NaN;
                };
                xRange = resolveAxisRange(toMs(rawMin), toMs(rawMax));
            } else {
                xRange = resolveAxisRange(xAxis.minValue.value, xAxis.maxValue.value);
            }
            if (xRange.overriddenMin) xLo = xRange.min;
            if (xRange.overriddenMax) xHi = xRange.max;
            // Tolerate inverted user input: swap so the d3 linear scale
            // stays monotonic. The user can still flip orientation via
            // the dedicated `invertRange` toggle below.
            if (xLo > xHi) { const tmp = xLo; xLo = xHi; xHi = tmp; }
            // Tiny epsilon when all values are identical so scaleLinear
            // doesn't collapse to a degenerate zero-width domain.
            if (xLo === xHi) { xHi = xLo + 1; }

            // Range: by default [0..plotW]. Invert flips it to [plotW..0]
            // so the X axis runs right-to-left.
            const wantInvert = !!xAxis.invertRange.value;
            const rangeStart = wantInvert ? plotW : 0;
            const rangeEnd = wantInvert ? 0 : plotW;

            // Log scale only valid for strictly-positive numeric domains.
            // Degrade silently to linear if a non-positive value is in view.
            const wantLog = !!xAxis.logScale.value;
            const logSafe = wantLog && !xIsDate && xLo > 0 && xHi > 0;
            if (wantLog && !logSafe) {
                // eslint-disable-next-line no-console
                console.warn("[bubbleChartCategorical] X-axis Log scale ignored — requires Continuous + numeric + strictly-positive values.");
            }

            if (xIsDate) {
                xScale = d3.scaleTime().domain([new Date(xLo), new Date(xHi)]).range([rangeStart, rangeEnd]);
            } else if (logSafe) {
                xScale = d3.scaleLog().domain([xLo, xHi]).range([rangeStart, rangeEnd]);
            } else {
                xScale = d3.scaleLinear().domain([xLo, xHi]).range([rangeStart, rangeEnd]);
            }
        } else {
            xScale = d3.scaleBand()
                .domain(xCategories)
                .range([0, xScaleRangeMax])
                .padding(0.2);
        }

        // Y Scale (always linear since Y is a measure)
        // Range override: when the user explicitly sets Y-axis Min / Max in
        // the format pane (either constant or via the fx "ConstantOrRule"
        // conditional-formatting dialog) the resolved numeric value comes
        // through `yAxis.minValue.value` / `maxValue.value`. We treat
        // `min === max` (default 0/0) as the sentinel for "Auto" so reports
        // that have never touched the inputs continue to auto-fit. When the
        // user enters any distinct min/max — including fx-bound values that
        // resolve to different numbers — those bounds override the
        // data-derived range.
        const yPad = (viewModel.yMax - viewModel.yMin) * 0.1 || 1;
        // Resolve Min / Max independently — the user (or an fx /
        // ConstantOrRule binding) may have set just one side. Each
        // un-set bound stays Auto. `resolveAxisRange` also tolerates
        // null/undefined/NaN coming back from a rule that didn't
        // resolve at the host level.
        const yRange = resolveAxisRange(yAxis.minValue.value, yAxis.maxValue.value);
        // Auto-fit lower bound: normally we pad below yMin by `yPad` so the
        // smallest data point isn't flush against the X-axis baseline. But
        // when the data is entirely non-negative (yMin >= 0) we clamp the
        // padded value at 0 — otherwise yMin = 0 would resolve to -yPad and
        // the 0 gridline would float visibly ABOVE the X-axis line, instead
        // of sitting exactly on it. With this clamp:
        //   • yMin === 0           → yDomainLo = 0 (0 touches the X-axis)
        //   • 0 < yMin < yPad      → yDomainLo = 0 (avoids a tiny negative band)
        //   • yMin >= yPad         → yDomainLo = yMin - yPad (unchanged)
        //   • yMin <  0            → yDomainLo = yMin - yPad (unchanged — negative data still gets breathing room)
        const yDomainLoAuto = viewModel.yMin >= 0
            ? Math.max(0, viewModel.yMin - yPad)
            : (viewModel.yMin - yPad);
        const yDomainHiAuto = viewModel.yMax + yPad;
        let yDomainLo = yRange.overriddenMin ? yRange.min : yDomainLoAuto;
        let yDomainHi = yRange.overriddenMax ? yRange.max : yDomainHiAuto;
        // If the user supplied an inverted pair (min > max) swap so the
        // d3 linear scale stays monotonic. We deliberately don't expose
        // a Y "invert" toggle, so swapping is the safest behaviour.
        if (yDomainLo > yDomainHi) {
            const tmp = yDomainLo; yDomainLo = yDomainHi; yDomainHi = tmp;
        }
        // Guard against a degenerate single-value domain (would collapse
        // scaleLinear's range output to a single pixel).
        if (yDomainLo === yDomainHi) { yDomainHi = yDomainLo + 1; }

        // ── Y-axis tick count ───────────────────────────────────────────
        // Tick count is based on minimum pixel spacing between ticks so
        // density tracks available vertical space, not the number of data
        // points. Floored at 4 so even very short visuals show 3–4 labels.
        // Hoisted above the tick-values + scale construction because the
        // auto-mode domain snap (below) needs `yTickCount` to know how
        // many tick stops d3 should consider.
        const Y_MIN_TICK_SPACING = 40; // pixels between ticks
        const yTickCount = Math.max(4, Math.floor(plotH / Y_MIN_TICK_SPACING));
        const yOverridden = yRange.overriddenMin || yRange.overriddenMax;

        // ── Y-axis tick values ──────────────────────────────────────────
        // Two regimes:
        //
        // (a) NO override → compute "nice" round-number ticks with
        //     `d3.ticks(lo, hi, N)` and SNAP the domain to
        //     [firstNiceTick, lastNiceTick]. The snap is what guarantees
        //     the lowest tick label sits exactly at the bottom of the
        //     plot (yScale(yDomainLo) === plotH) — without it, d3's nice
        //     ticks fall INSIDE the padded auto-fit domain and the
        //     bottom-most label floats a few pixels above the X-axis
        //     baseline.
        //
        // (b) Min and/or Max overridden → use EVEN subdivision of
        //     `[yDomainLo, yDomainHi]` into `yTickCount - 1` equal
        //     intervals. Previously we appended the explicit bound on
        //     top of d3's nice ticks, which produced a visibly cramped
        //     gap at the top when the user-typed bound didn't align
        //     with the nice step (e.g. setting Max=900 on top of nice
        //     ticks 0/200/400/600/800 produced 0,200,400,600,800,900 —
        //     four 200-unit gaps and one 100-unit gap). Even
        //     subdivision keeps the chart visually balanced and matches
        //     how Power BI's built-in scatter chart handles fixed
        //     bounds. The trade-off is that intermediate labels may not
        //     be "round" numbers (e.g. Min=0/Max=900/N=5 yields
        //     0/225/450/675/900) — users wanting clean labels can pick
        //     a Max divisible by `yTickCount - 1`.
        //
        // Gridlines, the inline Y-axis, AND the pinned overlay all
        // consume this array via `.tickValues(yTickValues)` so labels,
        // ticks, and gridlines stay in lock-step.
        let yTickValues: number[];
        if (yOverridden) {
            yTickValues = [];
            const yEvenStep = (yDomainHi - yDomainLo) / (yTickCount - 1);
            for (let i = 0; i < yTickCount; i++) {
                yTickValues.push(yDomainLo + yEvenStep * i);
            }
            // Snap endpoints to the EXACT user-supplied bounds so they
            // round-trip without floating-point drift (e.g. 899.9999…).
            yTickValues[0] = yDomainLo;
            yTickValues[yTickValues.length - 1] = yDomainHi;
        } else {
            const niceTicks = d3.ticks(yDomainLo, yDomainHi, yTickCount);
            if (niceTicks.length >= 2) {
                // Snap the domain inward to the lowest / highest nice
                // tick. This guarantees yScale(firstTick) === plotH
                // (the bottom label sits on the X-axis baseline). Data
                // is still inside the new range because d3.ticks picks
                // round numbers BETWEEN the padded auto-fit bounds.
                yDomainLo = niceTicks[0];
                yDomainHi = niceTicks[niceTicks.length - 1];
                yTickValues = niceTicks;
            } else {
                yTickValues = [yDomainLo, yDomainHi];
            }
        }

        // Inset the TOP of the SVG range by the largest possible bubble
        // radius so a data point at yDomainHi can't have its top edge
        // clipped by the plot rect / hidden under the legend or chart
        // title overlay. The BOTTOM is NOT inset — keeping it pinned at
        // `plotH` is what puts the lowest Y-axis tick label exactly on
        // the X-axis baseline (rather than floating a few pixels above).
        // Clamping to `plotH / 4` prevents the top inset from eating
        // the entire plot height on very small visuals.
        const yMaxBubbleR = Math.max(1, bubble.maxSize.value / 2);
        const yRangeInset = Math.min(yMaxBubbleR, Math.max(0, Math.floor(plotH / 4)));
        const yScaleLinear = d3.scaleLinear()
            .domain([yDomainLo, yDomainHi])
            .range([plotH, yRangeInset]);

        // ── Y-range override: hide out-of-range bubbles ─────────────────
        // When the user has explicitly set a Y Min or Max, filter out any
        // data points whose `yValue` falls outside [yDomainLo, yDomainHi]
        // BEFORE rendering. This mirrors Power BI's built-in line/bar
        // behaviour — points outside the explicit domain are not shown
        // (rather than rendering above the topmost gridline as a visual
        // artifact). All downstream renderers — bubbles, labels, error
        // bars, crosshair — pick up the filtered list automatically
        // because they reference the same local `dataPoints` binding.
        if (viewModel.hasYField && (yRange.overriddenMin || yRange.overriddenMax)) {
            dataPoints = dataPoints.filter(
                d => d.yValue >= yDomainLo && d.yValue <= yDomainHi
            );
        }

        // Size scale — min/max always come from the Bubble card settings.
        // When a Size field is provided, we scale each point's size value
        // into the [minSize, maxSize] diameter range. When no Size field is
        // present, every bubble uses `minSize` as its diameter so bubble
        // size remains controlled by the Bubble property panel.
        const sizeScale = viewModel.hasSizeField
            ? d3.scaleLinear()
                .domain([viewModel.sizeMin, viewModel.sizeMax || 1])
                .range([bubble.minSize.value, bubble.maxSize.value])
                .clamp(true)
            : null;

        const getBubbleRadius = (d: BubbleDataPoint): number => {
            if (!viewModel.hasSizeField) {
                // Fixed diameter = minSize when no size field bound.
                return bubble.minSize.value / 2;
            }
            return sizeScale!(d.size) / 2;
        };

        // ── Gridlines ───────────────────────────────────────────────────
        renderXGridlines(
            scrollContent,
            { show: showXGrid, color: xGridColor, width: xGridWidth, style: xGridStyle, opacity: xGridOpacity },
            plotH, xIsContinuous, xIsDate, xScale, xCategories, xBandwidth
        );
        renderYGridlines(
            bgLayer,
            { show: showYGrid, color: yGridColor, width: yGridWidth, style: yGridStyle, opacity: yGridOpacity },
            plotW, yTickValues, yScaleLinear
        );

        // ── Reference Band (rendered behind bubbles) ────────────────────
        renderReferenceBand(
            bgLayer, scrollContent, refBand, viewModel,
            plotW, plotH, yScaleLinear, xScale,
            xCategories, xBandwidth, xIsContinuous, xIsDate
        );

        // ── Error Bars / Bands ──────────────────────────────────────────
        renderErrorBars(
            scrollContent, errorBars, dataPoints, xCategories,
            yScaleLinear, categoryX
        );

        // ── Bubbles ─────────────────────────────────────────────────────
        const transparency = bubble.transparency.value / 100;
        const shape = String(bubble.shape.value.value);
        const outlineOnly = bubble.showOutlineOnly.value;

        const bubbleGroups = scrollContent.selectAll(".bubble-group")
            .data(dataPoints)
            .enter()
            .append("g")
            .classed("bubble-group", true)
            .attr("transform", d => {
                const cx = bubbleX(d);
                const cy = viewModel.hasYField ? yScaleLinear(d.yValue) : plotH / 2;
                return `translate(${cx},${cy})`;
            });

        // Determine fill color per data point
        const getColor = (d: BubbleDataPoint): string => d.color;

        const thickness = bubble.outlineThickness.value;
        const strokeFor = (d: BubbleDataPoint): string => {
            if (outlineOnly) return getColor(d);
            return thickness > 0 ? bubble.outlineColor.value.value : "none";
        };
        const strokeWidthFor = (): number => {
            if (outlineOnly) return Math.max(thickness, 2);
            return thickness;
        };

        if (shape === "circle") {
            bubbleGroups.append("circle")
                .attr("r", d => getBubbleRadius(d))
                .attr("fill", d => outlineOnly ? "none" : getColor(d))
                .attr("fill-opacity", d => outlineOnly ? 0 : (d.highlighted ? 1 - transparency : 0.3))
                .attr("stroke", d => strokeFor(d))
                .attr("stroke-width", strokeWidthFor())
                .classed("bubble-shape", true);
        } else {
            bubbleGroups.append("path")
                .attr("d", d => shapePath(shape, getBubbleRadius(d)))
                .attr("fill", d => outlineOnly ? "none" : getColor(d))
                .attr("fill-opacity", d => outlineOnly ? 0 : (d.highlighted ? 1 - transparency : 0.3))
                .attr("stroke", d => strokeFor(d))
                .attr("stroke-width", strokeWidthFor())
                .classed("bubble-shape", true);
        }

        // ── Data Labels ─────────────────────────────────────────────────
        if (labels.show.value) {
            const pos = labels.labelPosition.value.value;
            bubbleGroups.append("text")
                .classed("bubble-label", true)
                .attr("text-anchor", pos === "right" ? "start" : "middle")
                .attr("dy", () => {
                    if (pos === "above") return "-0.8em";
                    if (pos === "below") return "1.2em";
                    return "0.35em";
                })
                .attr("dx", d => {
                    if (pos === "right") return (getBubbleRadius(d) + 4) + "px";
                    return "0";
                })
                .attr("font-size", labels.fontSize.value + "px")
                .attr("fill", labels.color.value.value)
                .text(d => {
                    // If label field is provided, use it
                    if (d.labelText) return d.labelText;
                    // If size field exists, show formatted size value
                    if (viewModel.hasSizeField) {
                        return formatValue(d.size, String(labels.displayUnits.value.value), labels.decimalPlaces.value);
                    }
                    // If Y field exists and no label/size, show Y value
                    if (viewModel.hasYField) {
                        return formatValue(d.yValue, String(labels.displayUnits.value.value), labels.decimalPlaces.value);
                    }
                    return "";
                });
        }

        // ── Reference Lines (dynamic, two axis-specific cards) ──────────
        // Helpers + per-axis loops moved to `rendering/panel/referenceLines.ts`.
        // Each card renders up to REFERENCE_LINE_SLOT_COUNT slots; `position`
        // ("front" | "behind") chooses the target SVG layer; per slot we
        // render a shade rect, the line stroke, and an optional label.
        const refLineCtx: RefLineContext = {
            bgLayer, scrollContent, staticLayer,
            refLineLabelOverlay: this.refLineLabelOverlay,
            plotW, plotH, margin,
            visibleContainerW, panelLeftInVisual, panelTopInVisual
        };
        renderYReferenceLines(refLineCtx, yRefLine, viewModel, yScaleLinear);
        renderXReferenceLines(refLineCtx, xRefLine, xCategories, xScale, xBandwidth, xIsContinuous, xIsDate);

        // ── Axes ────────────────────────────────────────────────────────
        if (xAxis.show.value) {
            // Innermost tick labels — show only the leaf segment, not the composite key.
            // tickSize/tickPadding tightened to reduce the gap between the axis line and labels.
            // In continuous mode we let d3 derive ticks from the scale's
            // domain and use its native format (toLocaleString for dates,
            // d3.format default for numerics). leafDisplay only makes
            // sense for category-key inputs.
            const xAxisGen = d3.axisBottom(xScale)
                .tickSize(3)
                .tickPadding(2);
            if (xIsContinuous) {
                // Limit ticks based on plot width so labels don't overlap.
                const tickCount = Math.max(2, Math.floor(plotW / 80));
                xAxisGen.ticks(tickCount);
                if (xIsDate) {
                    xAxisGen.tickFormat((d: any) => {
                        const dt = d instanceof Date ? d : new Date(d);
                        return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString();
                    });
                }
                // Numeric: use d3's default tickFormat (handles log/linear).
            } else {
                xAxisGen.tickFormat((d: any) => leafDisplay(String(d)));
            }
            const xAxisG = scrollContent.append("g")
                .attr("transform", `translate(0,${plotH})`)
                .call(xAxisGen);

            if (needsRotation) {
                // Tilt the leaf tick labels DOWN-RIGHT (positive rotation
                // with text-anchor "start"), so the label text extends to
                // the RIGHT of its tick rather than the LEFT. This keeps
                // the FIRST tick's label from getting clipped by the
                // adjacent Y-axis overlay on the left edge of the plot.
                //
                // EVERY tick label rotates the same direction — including
                // the rightmost. Previously the LAST label in a
                // small-multiples panel was mirrored to -45° to keep its
                // tail from bleeding into the next panel, but the
                // asymmetric tilt looked bad. The rightmost label is now
                // accommodated by reserving real margin.right space (see
                // `margin.right` computation above), so its down-right
                // tail fits inside the panel without overflowing into the
                // neighbour or getting clipped.
                xAxisG.selectAll("text")
                    .attr("transform", "rotate(45)")
                    .attr("text-anchor", "start")
                    .attr("dx", "0.5em")
                    .attr("dy", "0.15em");
            }

            // X-axis baseline (.domain): in small-multiples mode it must
            // NOT scroll with the bubbles/ticks, otherwise the right end
            // of the line recedes leftward as the user pans, leaving a
            // shorter and shorter visible baseline. We therefore delete
            // the d3-generated baseline from scrollContent and re-render
            // it in `staticLayer`, which is anchored to the visible plot
            // box (no transform, no clip).
            //
            // - When skipYAxisInline=true (single-chart mode, external
            //   Y-axis overlay) the baseline extends LEFTWARD by
            //   `margin.left` px so it visually meets the external Y-axis
            //   at the L-corner.
            // - When skipYAxisInline=false (small multiples / inline Y)
            //   the inline Y-axis baseline already supplies the L-corner
            //   at x=0, so the X-axis baseline starts at 0 — extending it
            //   leftward would draw a stub across the Y-axis label strip.
            xAxisG.select(".domain").remove();
            const baselineStartX = skipYAxisInline ? -margin.left : 0;
            // In small-multiples mode, extend the baseline through the
            // reserved `margin.right` strip to the right edge of innerG
            // (= `width - margin.left` in plotArea coords). Without this
            // the line stops at `plotW`, leaving an awkward void on the
            // right side of each panel. The panel-level clip rect set in
            // update() still hides anything that bleeds past the panel.
            const baselineEndX = isSmallMultiplesPanel
                ? (width - margin.left + 0.5)
                : (plotW + 0.5);
            staticLayer.append("path")
                .attr("class", "x-axis-domain-static")
                .attr("transform", `translate(0,${plotH})`)
                .attr("d", `M${baselineStartX},0.5H${baselineEndX}`)
                .attr("fill", "none")
                .attr("stroke", xAxis.labelColor.value.value);

            xAxisG.selectAll("text")
                .attr("fill", xAxis.labelColor.value.value)
                .attr("font-size", xAxis.fontSize.value + "px")
                .attr("font-family", xAxis.fontFamily.value || "Segoe UI")
                .attr("font-weight", xAxis.fontBold.value ? "bold" : "normal")
                .attr("font-style", xAxis.fontItalic.value ? "italic" : "normal")
                .attr("text-decoration", xAxis.fontUnderline.value ? "underline" : "none");
            xAxisG.selectAll("line, path").attr("stroke", xAxis.labelColor.value.value);

            // ── Parent-level brackets + labels (hierarchy above the axis) ──
            // Rows: row 0 = immediately below leaf labels (holds level = xLevels-2),
            // row 1 = level = xLevels-3, etc., so the root sits furthest from axis.
            for (let level = viewModel.xLevels - 2; level >= 0; level--) {
                const rowIdxFromTop = (viewModel.xLevels - 2) - level; // 0 = nearest to leaves
                const rowY = plotH + rotatedLabelHeight + rowIdxFromTop * PARENT_ROW_H;
                // Push the bracket bar to NEAR THE TOP of the row and the
                // text closer to the bottom so the horizontal bracket line
                // no longer cuts through the parent label glyphs.
                const bracketY = rowY + 1;
                const textY = rowY + PARENT_ROW_H - 3;

                let groupStart = 0;
                for (let i = 1; i <= xCategories.length; i++) {
                    const prevPath = viewModel.xLeafPaths.get(xCategories[i - 1]);
                    const nextPath = i < xCategories.length ? viewModel.xLeafPaths.get(xCategories[i]) : null;
                    const prevPrefix = prevPath ? prevPath.slice(0, level + 1).join(X_PATH_SEP) : "";
                    const nextPrefix = nextPath ? nextPath.slice(0, level + 1).join(X_PATH_SEP) : null;
                    const sameGroup = nextPrefix !== null && prevPrefix === nextPrefix;

                    if (!sameGroup) {
                        const startKey = xCategories[groupStart];
                        const endKey = xCategories[i - 1];
                        const x1 = xScale(startKey) ?? 0;
                        const x2 = (xScale(endKey) ?? 0) + xBandwidth();
                        const label = prevPath ? prevPath[level] : "";

                        // Bracket bar + end caps
                        scrollContent.append("line")
                            .attr("x1", x1 + 2).attr("x2", x2 - 2)
                            .attr("y1", bracketY).attr("y2", bracketY)
                            .attr("stroke", xAxis.labelColor.value.value)
                            .attr("stroke-width", 0.75);
                        // End caps shortened from 4 → 3 px so they stay
                        // above the parent label glyphs after the row
                        // geometry bump above.
                        scrollContent.append("line")
                            .attr("x1", x1 + 2).attr("x2", x1 + 2)
                            .attr("y1", bracketY).attr("y2", bracketY + 3)
                            .attr("stroke", xAxis.labelColor.value.value)
                            .attr("stroke-width", 0.75);
                        scrollContent.append("line")
                            .attr("x1", x2 - 2).attr("x2", x2 - 2)
                            .attr("y1", bracketY).attr("y2", bracketY + 3)
                            .attr("stroke", xAxis.labelColor.value.value)
                            .attr("stroke-width", 0.75);

                        // Divider line reaching up to the separation between leaves
                        scrollContent.append("line")
                            .attr("x1", x2).attr("x2", x2)
                            .attr("y1", plotH).attr("y2", bracketY)
                            .attr("stroke", xAxis.labelColor.value.value)
                            .attr("stroke-width", 0.5)
                            .attr("opacity", 0.35);

                        scrollContent.append("text")
                            .attr("x", (x1 + x2) / 2)
                            .attr("y", textY)
                            .attr("text-anchor", "middle")
                            .attr("font-size", xAxis.fontSize.value + "px")
                            .attr("font-family", xAxis.fontFamily.value || "Segoe UI")
                            .attr("font-weight", xAxis.fontBold.value ? "bold" : "normal")
                            .attr("font-style", xAxis.fontItalic.value ? "italic" : "normal")
                            .attr("text-decoration", xAxis.fontUnderline.value ? "underline" : "none")
                            .attr("fill", xAxis.labelColor.value.value)
                            .text(label);
                        groupStart = i;
                    }
                }
            }

            if (drawAxisTitlesInline && xAxis.title.value) {
                // Axis title sits in the static layer (centered over the
                // visible plot box) so it doesn't drift with the scroll.
                const titleText = xAxis.titleText.value || viewModel.xFieldName || "X-Axis";
                const titleFont = xAxis.titleFontSize.value || (xAxis.fontSize.value + 1);
                const titleColor = xAxis.titleColor.value.value || xAxis.labelColor.value.value;
                staticLayer.append("text")
                    .attr("x", plotW / 2)
                    .attr("y", plotH + rotatedLabelHeight + parentRowsHeight + titleRow - 4)
                    .attr("text-anchor", "middle")
                    .attr("font-size", titleFont + "px")
                    .attr("font-family", xAxis.titleFontFamily.value || "Segoe UI")
                    .attr("font-weight", xAxis.titleFontBold.value ? "bold" : "normal")
                    .attr("font-style", xAxis.titleFontItalic.value ? "italic" : "normal")
                    .attr("text-decoration", xAxis.titleFontUnderline.value ? "underline" : "none")
                    .attr("fill", titleColor)
                    .text(titleText);
            }
            // (else) X-axis title is rendered in the viewport-pinned overlay —
            // see renderAxisTitlesOverlay() in update().
        }

        if (yAxis.show.value && !skipYAxisInline) {
            const yDecimalPlaces = yAxis.decimalPlaces.value;
            // Drive the inline axis off the SAME `yTickValues` array used
            // for gridlines + the pinned overlay. This guarantees the
            // explicit user-supplied Min / Max appear as labeled ticks
            // (e.g. a 900 max renders as a "900" label, not "800") and
            // every tick label has a gridline behind it.
            const yAxisGen = d3.axisLeft(yScaleLinear)
                .tickValues(yTickValues)
                .tickSize(3)
                .tickPadding(2);
            if (yDecimalPlaces >= 0) {
                yAxisGen.tickFormat(d => Number(d).toFixed(yDecimalPlaces));
            }
            const yAxisG = staticLayer.append("g").call(yAxisGen);
            yAxisG.selectAll("text")
                .attr("fill", yAxis.labelColor.value.value)
                .attr("font-size", yAxis.fontSize.value + "px")
                .attr("font-family", yAxis.fontFamily.value || "Segoe UI")
                .attr("font-weight", yAxis.fontBold.value ? "bold" : "normal")
                .attr("font-style", yAxis.fontItalic.value ? "italic" : "normal")
                .attr("text-decoration", yAxis.fontUnderline.value ? "underline" : "none");
            yAxisG.selectAll("line, path").attr("stroke", yAxis.labelColor.value.value);
            // The d3-generated Y-axis baseline spans yScale's range
            // [plotH - yRangeInset, yRangeInset], which leaves a visible
            // gap between the bottom tick and the X-axis baseline at
            // y = plotH (and a smaller gap above the top tick). Override
            // the .domain path to span the full plot height so the Y-axis
            // line meets the X-axis baseline cleanly at the L-corner.
            yAxisG.select(".domain")
                .attr("d", `M0.5,0V${plotH + 0.5}`);

            if (drawAxisTitlesInline && yAxis.title.value) {
                const titleText = yAxis.titleText.value || viewModel.yFieldName || "Y-Axis";
                const titleFont = yAxis.titleFontSize.value || (yAxis.fontSize.value + 1);
                const titleColor = yAxis.titleColor.value.value || yAxis.labelColor.value.value;
                staticLayer.append("text")
                    .attr("x", -plotH / 2)
                    .attr("y", -margin.left + 15)
                    .attr("transform", "rotate(-90)")
                    .attr("text-anchor", "middle")
                    .attr("font-size", titleFont + "px")
                    .attr("font-family", yAxis.titleFontFamily.value || "Segoe UI")
                    .attr("font-weight", yAxis.titleFontBold.value ? "bold" : "normal")
                    .attr("font-style", yAxis.titleFontItalic.value ? "italic" : "normal")
                    .attr("text-decoration", yAxis.titleFontUnderline.value ? "underline" : "none")
                    .attr("fill", titleColor)
                    .text(titleText);
            }
            // (else) Y-axis title is rendered in the viewport-pinned overlay —
            // see renderAxisTitlesOverlay() in update().
        }

        // ── Crosshair overlay (sits on top, but lets pointer events through) ──
        // Lives inside scrollContent so its vertical line stays anchored
        // to the hovered bubble's actual on-screen position when the
        // x-axis is scrolled.
        const crosshair = settings.crosshairCard;
        const chDash = String(crosshair.lineStyle.value.value) === "dashed" ? "6,4"
            : String(crosshair.lineStyle.value.value) === "dotted" ? "2,3" : "none";
        const crosshairG = scrollContent.append("g")
            .classed("crosshair-group", true)
            .style("pointer-events", "none")
            .style("display", "none");
        const crosshairVert = crosshairG.append("line")
            .attr("stroke", crosshair.color.value.value)
            .attr("stroke-width", crosshair.strokeWidth.value)
            .attr("stroke-dasharray", chDash);
        const crosshairHoriz = crosshairG.append("line")
            .attr("stroke", crosshair.color.value.value)
            .attr("stroke-width", crosshair.strokeWidth.value)
            .attr("stroke-dasharray", chDash);
        const crosshairMode = String(crosshair.mode.value.value);

        const showCrosshair = (d: BubbleDataPoint) => {
            if (!crosshair.show.value) return;
            const cx = bubbleX(d);
            const cy = viewModel.hasYField ? yScaleLinear(d.yValue) : plotH / 2;
            if (crosshairMode !== "horizontal") {
                crosshairVert
                    .attr("x1", cx).attr("x2", cx)
                    .attr("y1", 0).attr("y2", plotH)
                    .style("display", null);
            } else {
                crosshairVert.style("display", "none");
            }
            if (crosshairMode !== "vertical") {
                // Span the FULL virtual x-extent so the horizontal line
                // remains visible across the whole plot box regardless of
                // the current x-scroll offset (the clip handles the rest).
                crosshairHoriz
                    .attr("x1", 0).attr("x2", xScaleRangeMax)
                    .attr("y1", cy).attr("y2", cy)
                    .style("display", null);
            } else {
                crosshairHoriz.style("display", "none");
            }
            crosshairG.style("display", null);
        };
        const hideCrosshair = () => crosshairG.style("display", "none");

        // ── Interactivity ───────────────────────────────────────────────
        bubbleGroups
            .style("cursor", "pointer")
            .on("click", (event: MouseEvent, d: BubbleDataPoint) => {
                this.selectionManager.select(d.selectionId, event.ctrlKey || event.metaKey);
                event.stopPropagation();
            })
            .on("contextmenu", (event: MouseEvent, d: BubbleDataPoint) => {
                // Right-click → Power BI context menu (includes Drill down / Drill up / Expand next level)
                const sm: any = this.selectionManager;
                if (sm && typeof sm.showContextMenu === "function") {
                    sm.showContextMenu(d.selectionId, { x: event.clientX, y: event.clientY });
                }
                event.preventDefault();
                event.stopPropagation();
            })
            .on("dblclick", (event: MouseEvent, d: BubbleDataPoint) => {
                // Double-click → drill down one level along the X-axis hierarchy
                try {
                    if (typeof this.hostAny.drill === "function") {
                        this.hostAny.drill(d.selectionId);
                    }
                } catch { /* drill not available */ }
                event.stopPropagation();
            });

        // Tooltip + crosshair handling
        bubbleGroups.on("mouseover", (event: MouseEvent, d: BubbleDataPoint) => {
            this.hostAny.tooltipService.show({
                dataItems: d.tooltipData,
                identities: [d.selectionId],
                coordinates: [event.clientX, event.clientY],
                isTouchEvent: false
            });
            showCrosshair(d);
        });

        bubbleGroups.on("mousemove", (event: MouseEvent, d: BubbleDataPoint) => {
            this.hostAny.tooltipService.move({
                dataItems: d.tooltipData,
                identities: [d.selectionId],
                coordinates: [event.clientX, event.clientY],
                isTouchEvent: false
            });
            showCrosshair(d);
        });

        bubbleGroups.on("mouseout", () => {
            this.hostAny.tooltipService.hide({ immediately: true, isTouchEvent: false });
            hideCrosshair();
        });

        // Return geometry so callers (single-chart mode) can position
        // the viewport-pinned axis-title overlays precisely. yScale +
        // yTickValues are returned so the external Y-axis overlay can
        // mirror the inline tick layout exactly — same explicit-bound
        // injection, same auto-tick collision suppression. (yTickCount
        // is still returned for backwards compat with any callers that
        // need a density hint, but the overlay should prefer
        // yTickValues for label-perfect alignment.)
        return {
            plotW, plotH,
            marginLeft: margin.left, marginTop: margin.top,
            yScale: yScaleLinear, yTickCount, yTickValues
        };
    }

    // ─── Compute error value ────────────────────────────────────────────
    // computeErrorValue moved to `rendering/panel/errorBars.ts` alongside
    // the only call site (the error-bars renderer).

    // ─── Render Y-axis into the viewport-pinned overlay ─────────────────
    // Used in single-chart mode so the axis line + tick labels stay
    // anchored to the LEFT EDGE of the visual while the chart content
    // scrolls horizontally. Returns the width consumed (used to position
    // the chart container's left offset).
    private renderYAxisOverlay(
        yScale: d3.ScaleLinear<number, number>,
        plotHeight: number,
        chartTopOffset: number,
        yTickValues: number[],
        leftOffset: number = 0
    ): number {
        return renderYAxisOverlayFn(
            this.yAxisOverlay,
            this.formattingSettings.yAxisSettingsCard,
            yScale, plotHeight, chartTopOffset, yTickValues, leftOffset
        );
    }

    // ─── Render Legend (into a viewport-sized group) ─────────────────────
    // Draws the legend into the supplied <g>, using `width` as the viewport
    // width for alignment. Returns the total height consumed. Callers are
    // responsible for positioning the group (top/bottom of visual).
    //
    // When the legend sits at the TOP of the visual it shares vertical space
    // with the toolbar (palette + sort buttons in the top-left corner). To
    // prevent the legend title/items from being covered by the toolbar
    // buttons we reserve a horizontal strip on the left for the toolbar.
    private renderLegend(
        g: d3.Selection<SVGGElement, unknown, null, undefined>,
        legendCategories: string[],
        colorMap: Map<string, string>,
        width: number,
        viewModel: BubbleViewModel,
        height: number = 0
    ): number {
        return renderLegendFn(
            g,
            this.formattingSettings.legendSettingsCard,
            legendCategories, colorMap, width, viewModel, height
        );
    }


    // ─── Resolve current legend position to a canonical mode ────────────
    // Maps legacy values from older saved reports onto the new mode names
    // so the rest of the rendering pipeline only deals with one vocabulary.
    private resolveLegendPosition(): string {
        return resolveLegendPositionFn(this.formattingSettings.legendSettingsCard);
    }

    // ─── Render axis titles into viewport-pinned overlays ──────────────
    // Called from update() once chart geometry is known. The overlay SVGs
    // live outside the scrollable chart container, so the titles remain
    // visible regardless of horizontal scroll position.
    //
    // `scrollbarReserve` is the height (in pixels) consumed by the
    // horizontal scrollbar at the bottom of the chart container. The
    // X-axis title must sit ABOVE the scrollbar — never on top of it.
    private renderAxisTitlesOverlay(
        viewportWidth: number,
        viewportHeight: number,
        legendHeightTop: number,
        legendHeightBottom: number,
        chartTopOffset: number,
        xTitleTopY: number,
        leftMargin: number,
        plotHeight: number,
        viewModel: BubbleViewModel,
        scrollbarReserve: number = 0,
        xTitleLeftOffset: number = 0,
        yTitleLeftOffset: number = 0
    ): void {
        renderAxisTitlesOverlayFn(
            this.xTitleOverlay,
            this.yTitleOverlay,
            this.formattingSettings.xAxisSettingsCard,
            this.formattingSettings.yAxisSettingsCard,
            viewportWidth, viewportHeight,
            legendHeightTop, legendHeightBottom,
            chartTopOffset, xTitleTopY,
            leftMargin, plotHeight, viewModel,
            scrollbarReserve, xTitleLeftOffset, yTitleLeftOffset
        );
    }

    // ─── Shared horizontal scrollbar (small-multiples x-axis) ───────────
    // A single, slim native scrollbar mounted below the panel grid. Its
    // scrollLeft drives a synchronized translate(-x, 0) on every panel's
    // `x-scroll-content` group, so all panels' x-axes pan in lockstep.
    private renderSharedXScrollbar(
        visible: boolean,
        leftPx: number,
        topPx: number,
        widthPx: number,
        heightPx: number,
        virtualPlotW: number,
        visiblePlotW: number
    ): void {
        renderSharedXScrollbarFn(
            this.rootElement,
            this.svg,
            this.sharedScrollbarState,
            visible, leftPx, topPx, widthPx, heightPx,
            virtualPlotW, visiblePlotW
        );
    }

    // ─── Main Update ────────────────────────────────────────────────────
    public update(options: VisualUpdateOptions): void {
        // Clear main chart + overlays
        this.svg.selectAll("*").remove();
        this.legendOverlay.selectAll("*").remove();
        this.xTitleOverlay.selectAll("*").remove();
        this.yTitleOverlay.selectAll("*").remove();
        this.yAxisOverlay.selectAll("*").remove();
        this.refLineLabelOverlay.selectAll("*").remove();

        const dataView = options.dataViews && options.dataViews[0];
        if (!dataView) return;

        this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
            VisualFormattingSettingsModel, dataView
        );

        // Handle Reference Line add/delete toggles BEFORE rendering — this
        // both mutates the in-memory settings model (so the current frame
        // is correct) and calls persistProperties to write the new state.
        this.handleReferenceLineEdits();

        // Load user-picked per-category colors from persisted settings
        this.categoryColorMap = loadCategoryColorMap(dataView, this.formattingSettings);

        const viewModel = this.createViewModel(dataView);
        if (!viewModel || viewModel.dataPoints.length === 0) return;

        // Drive the format-pane numeric-vs-date Min/Max swap. The next
        // call to getFormattingModel() routes this through
        // updateSliceVisibility(), which hides the numeric pair and
        // shows the DatePicker pair (or vice-versa).
        this.formattingSettings.xIsDate = viewModel.xLeafDataType === "date";

        // Load and apply multi-level sorting
        this.sortLevels = loadSortConfig(this.formattingSettings);
        applySortingFn(viewModel, this.sortLevels, this.availableFields);

        // ── X-axis Min/Max — semantics depend on axisType ───────────────
        // CATEGORICAL: Min / Max are 0-based category indices.
        //   - Default 0 / 0 = "Auto" (show every category).
        //   - 5 / 20 = show categories 5 through 20 inclusive.
        //   We prune `xCategories` AND `dataPoints` in lockstep so dropped
        //   categories don't leak through sorting / legend / overlays.
        // CONTINUOUS: Min / Max are actual X-VALUES (numeric, or ms-epoch
        //   for dates). We DON'T prune here — the continuous renderer
        //   applies the bounds at the scale.domain() level instead, which
        //   keeps the original dataPoints intact (points outside the
        //   domain are clipped by the plot rect / SVG, not deleted).
        // Both modes honour the fx (instanceKind: ConstantOrRule) binding
        // so report authors can compute the bound from a measure.
        const xCard = this.formattingSettings.xAxisSettingsCard;
        const xAxisTypeIsContinuous = String(xCard.axisType.value.value) === "continuous";
        if (!xAxisTypeIsContinuous) {
            // CRITICAL: resolve each bound independently via
            // `resolveAxisRange`. The original gate required BOTH
            // bounds before either took effect, so partial / fx-bound
            // overrides silently did nothing. The resolver also
            // tolerates NaN / null / undefined per bound so a
            // half-resolved fx rule can't propagate `Math.floor(NaN)`
            // into `keep` and blank the entire visual.
            const xRange = resolveAxisRange(xCard.minValue.value, xCard.maxValue.value);
            const total = viewModel.xCategories.length;
            if (total > 0 && (xRange.overriddenMin || xRange.overriddenMax)) {
                let lo = xRange.overriddenMin ? Math.floor(xRange.min) : 0;
                let hi = xRange.overriddenMax ? Math.floor(xRange.max) : (total - 1);
                // Tolerate inverted user input.
                if (lo > hi) { const tmp = lo; lo = hi; hi = tmp; }
                // Clamp to valid category-index range.
                lo = Math.max(0, Math.min(total - 1, lo));
                hi = Math.max(0, Math.min(total - 1, hi));
                if (lo !== 0 || hi !== total - 1) {
                    const keep = new Set(viewModel.xCategories.slice(lo, hi + 1));
                    viewModel.xCategories = viewModel.xCategories.filter(c => keep.has(c));
                    viewModel.dataPoints = viewModel.dataPoints.filter(d => keep.has(d.xCategory));
                }
            }
        } else if (viewModel.xLeafDataType === "text") {
            // User asked for Continuous but the X column is text — log
            // once and let the categorical path keep working below.
            // eslint-disable-next-line no-console
            console.warn("[bubbleChartCategorical] X-Axis Type=Continuous requested but X field is text; falling back to Categorical rendering.");
        }

        const viewportWidth = options.viewport.width;
        const viewportHeight = options.viewport.height;

        // Build color map for legend (based on legend category)
        const colorMap = new Map<string, string>();
        viewModel.dataPoints.forEach(dp => {
            const key = dp.legendCategory || dp.xCategory;
            if (!colorMap.has(key)) colorMap.set(key, dp.color);
        });

        // ── Legend (rendered in overlay, anchored to viewport) ──────────
        let legendHeightTop = 0;
        let legendHeightBottom = 0;
        let legendWidthLeft = 0;
        let legendWidthRight = 0;
        const legendSettings = this.formattingSettings.legendSettingsCard;
        const legendPosMode = this.resolveLegendPosition();
        const legendIsBottom = legendPosMode.startsWith("bottom");
        const legendIsCenterSide = legendPosMode === "centerLeft" || legendPosMode === "centerRight";
        const legendIsStacked = legendPosMode.endsWith("Stacked");
        const legendIsRightStacked = legendPosMode === "topRightStacked";
        const legendIsLeftStacked = legendPosMode === "topLeftStacked";

        // Honour the user's "Maximum height" / "Maximum width" budgets
        // by clamping the area we offer the legend to.
        const legendMaxHeight = Math.max(20, Math.floor(viewportHeight * (legendSettings.maximumHeight.value / 100)));

        if (legendSettings.show.value && viewModel.legendCategories.length > 0) {
            const legendG = this.legendOverlay.append("g").classed("legend-group", true);

            if (legendIsCenterSide || legendIsStacked) {
                // Stacked / side legend: render in a narrow column whose
                // width is sized to the ACTUAL content (longest item or
                // title, whichever wins) instead of a fixed 160-280 px
                // budget. The old fixed range left a big white-space gap
                // when items were short (e.g. just numbers) and also
                // clipped long titles when they exceeded the budget.
                const itemFs = legendSettings.fontSize.value;
                const titleFs = legendSettings.titleFontSize.value;
                let maxItemContentW = 0;
                viewModel.legendCategories.forEach(cat => {
                    // +24 covers the swatch circle (5r) + gap to label.
                    const w = (cat ? cat.length : 0) * itemFs * 0.6 + 24;
                    if (w > maxItemContentW) maxItemContentW = w;
                });
                let titleContentW = 0;
                if (legendSettings.showTitle.value) {
                    const t = legendSettings.titleText.value || viewModel.legendFieldName || "Legend";
                    titleContentW = t.length * titleFs * 0.65 + 4;
                }
                // Natural width = the wider of the two + tight horizontal
                // padding. Previously this added 20 px which left a
                // noticeable gap between the legend column and the
                // adjacent edge (chart for LEFT-stacked, visual border
                // for RIGHT-stacked). 12 px (≈6 each side) is enough
                // breathing room without leaving an obvious gap.
                const naturalWidth = Math.max(maxItemContentW, titleContentW) + 12;
                // Clamp: hard min so very short labels don't make the
                // column unreadable; hard max so the legend doesn't eat
                // more than 30 % of the visual.
                // Lowered min from 70 → 50: with the new left-aligned
                // rendering for left-side stacked legends, items hug the
                // visual border tightly so a wider min is wasteful. The
                // ceil(naturalWidth) still wins for long labels.
                const legendBlockWidth = Math.min(
                    Math.max(50, Math.ceil(naturalWidth)),
                    Math.floor(viewportWidth * 0.30)
                );

                // Vertical reserve at the TOP of the left-stacked legend
                // so its title/items don't render on top of the palette
                // and sort buttons (the toolbar lives at top:4 left:4,
                // ~30 px tall including margin).
                const TOOLBAR_TOP_RESERVE = 30;

                const totalLegendHeight = this.renderLegend(
                    legendG, viewModel.legendCategories, colorMap, legendBlockWidth, viewModel, viewportHeight
                );
                const usedH = Math.min(totalLegendHeight, viewportHeight);

                if (legendPosMode === "centerLeft" || legendIsLeftStacked) {
                    legendWidthLeft = legendBlockWidth;
                    // For TOP-LEFT-STACKED, push the legend overlay down by
                    // TOOLBAR_TOP_RESERVE so the title sits below the
                    // toolbar buttons instead of behind them.
                    const topY = legendPosMode === "centerLeft"
                        ? Math.max(0, (viewportHeight - usedH) / 2)
                        : TOOLBAR_TOP_RESERVE;
                    const overlayH = Math.min(usedH, Math.max(0, viewportHeight - topY));
                    this.legendOverlay
                        .style("top", topY + "px")
                        .style("left", "0")
                        .style("width", legendBlockWidth + "px")
                        .style("height", overlayH + "px")
                        .attr("width", legendBlockWidth)
                        .attr("height", overlayH);
                } else {
                    legendWidthRight = legendBlockWidth;
                    const topY = legendPosMode === "centerRight"
                        ? Math.max(0, (viewportHeight - usedH) / 2)
                        : 0;
                    this.legendOverlay
                        .style("top", topY + "px")
                        .style("left", (viewportWidth - legendBlockWidth) + "px")
                        .style("width", legendBlockWidth + "px")
                        .style("height", usedH + "px")
                        .attr("width", legendBlockWidth)
                        .attr("height", usedH);
                }
                // For right-stacked, top-stacked etc, also reserve a small
                // top strip so the chart doesn't run flush behind the title.
                if (legendIsRightStacked || legendIsLeftStacked) {
                    // Stacked variants reserve a horizontal strip equal to
                    // the legend's title height so the chart doesn't sit
                    // directly under it. The bulk of the legend overlays
                    // the chart's right/left margin.
                    legendHeightTop = 0;
                }
            } else {
                // Top / bottom inline legend — width = full viewport.
                let totalLegendHeight = this.renderLegend(
                    legendG, viewModel.legendCategories, colorMap, viewportWidth, viewModel
                );
                totalLegendHeight = Math.min(totalLegendHeight, legendMaxHeight);
                if (legendIsBottom) {
                    legendHeightBottom = totalLegendHeight;
                    this.legendOverlay
                        .style("top", (viewportHeight - totalLegendHeight) + "px")
                        .style("left", "0")
                        .style("width", viewportWidth + "px")
                        .style("height", totalLegendHeight + "px")
                        .attr("width", viewportWidth)
                        .attr("height", totalLegendHeight);
                } else {
                    legendHeightTop = totalLegendHeight;
                    this.legendOverlay
                        .style("top", "0")
                        .style("left", "0")
                        .style("width", viewportWidth + "px")
                        .style("height", totalLegendHeight + "px")
                        .attr("width", viewportWidth)
                        .attr("height", totalLegendHeight);
                }
            }
        } else {
            this.legendOverlay.style("width", "0").style("height", "0")
                .attr("width", 0).attr("height", 0);
        }

        // Toolbar (palette + sort buttons) lives at top:4 left:4 and is
        // ~22px tall with z-index 10 (above the Y-axis overlay's z-index
        // 6). Reserve at least this much vertical space at the top of the
        // chart area so the Y-axis tick labels at the top don't render
        // behind the toolbar buttons. The reserve only kicks in when the
        // top legend doesn't already push the chart down past the toolbar.
        const TOOLBAR_TOP_RESERVE = 30;
        const topReserve = Math.max(legendHeightTop, TOOLBAR_TOP_RESERVE);

        const chartAreaHeight = Math.max(0, viewportHeight - topReserve - legendHeightBottom);
        // Side-legend width reservations (only used for the center-left/right and stacked variants).
        const chartAreaLeftOffset = legendWidthLeft;
        const chartAreaWidth = Math.max(0, viewportWidth - legendWidthLeft - legendWidthRight);
        // Vertical space reserved for the horizontal scrollbar in
        // single-chart mode. Includes the scrollbar's own height (~15px)
        // PLUS a small visual gap so the rotated X-axis date labels
        // (e.g. "02/25/2026") don't have their year clipped by the
        // scrollbar sitting flush against the SVG bottom edge.
        // (Tuned from 34 → 22 — leaves ~6px gap above the ~16px tall
        // scrollbar, tight enough to remove the obvious whitespace band
        // between the X-axis area and the visual's bottom border while
        // still preserving enough clearance for rotated label descenders.)
        const SCROLLBAR_RESERVE = 22;
        const smSettings = this.formattingSettings.smallMultipleSettingsCard;
        const isSmallMultiples = viewModel.smallMultiples.length > 0;

        // ── External Y-axis layout decision ─────────────────────────────
        // Single-chart mode renders the Y-axis line/labels in a viewport-
        // pinned overlay so they stay fixed at the LEFT EDGE while the
        // bubbles scroll horizontally. Small-multiples mode keeps each
        // panel's Y-axis inline (every panel has its own scale).
        const yAxisCard = this.formattingSettings.yAxisSettingsCard;
        const externalYAxis = !isSmallMultiples && yAxisCard.show.value;
        const Y_TITLE_W = (externalYAxis && yAxisCard.title.value) ? 14 : 0;
        const Y_LABELS_W = externalYAxis ? 32 : 0;
        const yAxisOverlayWidth = Y_TITLE_W + Y_LABELS_W;

        // The scrollable chart container is offset to the right by the
        // external Y-axis (when present). In small-multiples mode we use
        // the full viewport width for the panel grid.
        // chartAreaLeftOffset / chartAreaWidth respect any side-mounted
        // legend (center-left, center-right, top-*-stacked).
        const containerLeft = chartAreaLeftOffset + yAxisOverlayWidth;
        const containerWidth = Math.max(0, chartAreaWidth - yAxisOverlayWidth);

        if (isSmallMultiples) {
            // ── Small Multiples Layout ──────────────────────────────────
            // All panels stay visible in the viewport. The x-axis content
            // (bubbles + tick labels) inside every panel is clipped to the
            // panel's visible plot width. A single horizontal scrollbar
            // mounted below the panel grid drives a synchronized x-offset
            // applied to every panel's clipped scroll layer — so all
            // panels' x-axes pan together in one shared "window".
            //
            // Grid sizing rules:
            //   1. If the user set "Rows" (> 0) AND "Columns" (> 0), use
            //      both as-is — the user gets exactly that grid (extra
            //      panels overflow and are scrollable vertically).
            //   2. Else if only Columns is set, derive rows = ceil(N/cols).
            //   3. Else if only Rows is set, derive cols = ceil(N/rows).
            //   4. Else: cols defaults to 1, rows = ceil(N/cols).
            const N = viewModel.smallMultiples.length;
            const userCols = smSettings.maxColumns.value || 0;
            const userRows = smSettings.maxRows.value || 0;
            let cols: number;
            let rows: number;
            if (userCols > 0 && userRows > 0) {
                cols = Math.min(userCols, N);
                rows = Math.min(userRows, Math.ceil(N / cols));
            } else if (userCols > 0) {
                cols = Math.min(userCols, N);
                rows = Math.ceil(N / cols);
            } else if (userRows > 0) {
                rows = Math.min(userRows, N);
                cols = Math.ceil(N / rows);
            } else {
                cols = 1;
                rows = N;
            }

            // "Fit to visual" makes panels scale to fill the viewport
            // proportional to the rows/cols grid; otherwise the user-
            // configured panelWidth / panelHeight sets each panel's size
            // and the visual will scroll if the grid is larger than the
            // viewport.
            const fitToVisual = !!smSettings.fitToVisual.value;
            const userPanelW = smSettings.panelWidth.value || 380;
            const userPanelH = smSettings.panelHeight.value || 280;

            // Reserve room at the bottom of the chart area for the shared
            // x-scrollbar (only consumed when scrolling is actually needed —
            // we'll decide after computing the virtual plot width).
            const SHARED_SCROLLBAR_H = 16;

            // First pass: lay panels out as if there were no shared
            // scrollbar. We'll decide whether to subtract its height once
            // we know the virtual plot width.
            const fitW = containerWidth / cols;
            const panelW = fitToVisual ? Math.max(120, fitW) : userPanelW;

            // Estimate the visible plot width inside one panel so we can
            // decide if scrolling is required. We must mirror the inline
            // panel margins computed inside renderPanel — hence the rough
            // chrome estimate (Y-axis label strip + panel padding).
            const padding = smSettings.padding.value;
            const titleH = smSettings.showTitle.value ? (smSettings.titleFontSize.value + 8) : 0;
            const panelInnerW = panelW - padding * 2;
            const inlineYWidth = this.formattingSettings.yAxisSettingsCard.show.value ? 50 : 10;
            const visiblePlotW = Math.max(0, panelInnerW - inlineYWidth - 20);

            // Per-category pixel budget for legibility on the x-axis.
            // Only applies in Categorical mode — Continuous packs all
            // points into the visible plot via its linear/time scale, so
            // we never widen the SVG (no horizontal scroll needed).
            const xModeContinuousSM = xAxisTypeIsContinuous
                && (viewModel.xLeafDataType === "numeric" || viewModel.xLeafDataType === "date")
                && viewModel.xLevels <= 1;
            const MIN_CATEGORY_WIDTH = 30;
            const naturalPlotW = xModeContinuousSM
                ? visiblePlotW
                : viewModel.xCategories.length * MIN_CATEGORY_WIDTH;
            const needsXScroll = !xModeContinuousSM && naturalPlotW > visiblePlotW && visiblePlotW > 0;
            const virtualPlotW = needsXScroll ? naturalPlotW : visiblePlotW;

            // Subtract scrollbar height ONLY if we actually need it.
            const reservedScrollbar = needsXScroll ? SHARED_SCROLLBAR_H : 0;
            const fitH = (chartAreaHeight - reservedScrollbar) / rows;
            const panelH = fitToVisual ? Math.max(120, fitH) : userPanelH;
            const totalSvgWidth = panelW * cols;
            const totalSvgHeight = panelH * rows;

            // The container never scrolls horizontally for the X-axis pan
            // (that's the shared scrollbar's job). When fit-to-visual is
            // off and the explicit panel size overflows, allow horizontal
            // scroll so the user can pan across the panel grid.
            const needsScrollY = totalSvgHeight > (chartAreaHeight - reservedScrollbar);
            const needsScrollX = !fitToVisual && totalSvgWidth > containerWidth;

            this.container
                .style("position", "absolute")
                .style("top", topReserve + "px")
                .style("left", containerLeft + "px")
                .style("width", containerWidth + "px")
                .style("height", (chartAreaHeight - reservedScrollbar) + "px")
                .style("overflow-x", needsScrollX ? "auto" : "hidden")
                .style("overflow-y", needsScrollY ? "auto" : "hidden");

            this.svg.attr("width", totalSvgWidth).attr("height", totalSvgHeight);

            // Clamp persisted scroll offset to current virtual range.
            const maxScroll = Math.max(0, virtualPlotW - visiblePlotW);
            if (this.sharedScrollbarState.xScrollLeft > maxScroll) this.sharedScrollbarState.xScrollLeft = maxScroll;
            if (this.sharedScrollbarState.xScrollLeft < 0) this.sharedScrollbarState.xScrollLeft = 0;

            viewModel.smallMultiples.forEach((smVal, idx) => {
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                const gx = col * panelW;
                const gy = row * panelH;

                const panelG = this.svg.append("g")
                    .attr("transform", `translate(${gx},${gy})`);

                // Clip each panel to its own bounding rect so that any
                // overflow from rotated X-axis tick labels (and any other
                // content whose ink extends beyond the panel's plotW)
                // cannot bleed sideways into the neighbouring panel.
                // The last label is already flipped to point down-LEFT
                // (see renderPanel), but penultimate / earlier labels
                // still rotate down-RIGHT — without this clip their tails
                // were visible inside the next panel's plot area.
                const panelClipId = `bubble-panel-clip-${idx}-${Date.now() & 0xffff}`;
                panelG.append("defs").append("clipPath")
                    .attr("id", panelClipId)
                    .append("rect")
                    .attr("x", 0).attr("y", 0)
                    .attr("width", panelW).attr("height", panelH);
                panelG.attr("clip-path", `url(#${panelClipId})`);

                if (smSettings.showBorder.value) {
                    panelG.append("rect")
                        .attr("width", panelW).attr("height", panelH)
                        .attr("fill", "none")
                        .attr("stroke", smSettings.borderColor.value.value)
                        .attr("stroke-width", 1);
                }

                if (smSettings.showTitle.value) {
                    const titleTextValue = (smSettings.titleText.value || "").trim() || smVal;
                    panelG.append("text")
                        .attr("x", panelW / 2).attr("y", smSettings.titleFontSize.value + 2)
                        .attr("text-anchor", "middle")
                        .attr("font-size", smSettings.titleFontSize.value + "px")
                        .attr("font-family", smSettings.titleFontFamily.value || "Segoe UI, -apple-system, sans-serif")
                        .attr("fill", smSettings.titleColor.value.value)
                        .attr("font-weight", smSettings.titleFontBold.value ? "bold" : "normal")
                        .attr("font-style", smSettings.titleFontItalic.value ? "italic" : "normal")
                        .attr("text-decoration", smSettings.titleFontUnderline.value ? "underline" : "none")
                        .text(titleTextValue);
                }

                const panelData = viewModel.dataPoints.filter(d => d.smallMultiple === smVal);
                // Tighten the panel's vertical chrome so the Y axis gets
                // more pixels: drop the extra `padding` gap between the
                // title and the chart top, and the unused `padding` at
                // the panel bottom. `yTickCount` scales with plotH, so
                // these reclaimed pixels translate into additional Y
                // tick labels fitting on screen.
                const innerG = panelG.append("g")
                    .attr("transform", `translate(${padding},${titleH})`);

                this.renderPanel(
                    innerG,
                    panelData,
                    viewModel.xCategories,
                    panelW - padding * 2,
                    panelH - titleH - padding,
                    viewModel,
                    /* drawAxisTitlesInline */ true,
                    /* skipYAxisInline */ false,
                    /* xVirtualPlotW */ needsXScroll ? virtualPlotW : 0,
                    /* xScrollLeft */ this.sharedScrollbarState.xScrollLeft,
                    /* panelKey */ `sm-${idx}`
                );
            });

            // Mount or refresh the shared horizontal scrollbar below panels.
            this.renderSharedXScrollbar(
                needsXScroll,
                /* leftPx */ containerLeft,
                /* topPx */ topReserve + chartAreaHeight - SHARED_SCROLLBAR_H,
                /* widthPx */ containerWidth,
                /* heightPx */ SHARED_SCROLLBAR_H,
                /* virtualPlotW */ virtualPlotW,
                /* visiblePlotW */ visiblePlotW
            );

            // Hide all viewport overlays — small multiples render axes &
            // titles inline in each panel.
            this.xTitleOverlay.style("width", "0").style("height", "0").attr("width", 0).attr("height", 0);
            this.yTitleOverlay.style("width", "0").style("height", "0").attr("width", 0).attr("height", 0);
            this.yAxisOverlay.style("width", "0").style("height", "0").attr("width", 0).attr("height", 0);
        } else {
            // ── Single Chart ────────────────────────────────────────────
            // Continuous mode packs all data points into the visible plot
            // via the linear/time scale, so we never widen the SVG; the
            // horizontal scrollbar is skipped entirely.
            const xModeContinuousSC = xAxisTypeIsContinuous
                && (viewModel.xLeafDataType === "numeric" || viewModel.xLeafDataType === "date")
                && viewModel.xLevels <= 1;
            const MIN_CATEGORY_WIDTH = 50;
            const estimatedMargins = 60;
            const minRequiredWidth = xModeContinuousSC
                ? containerWidth
                : viewModel.xCategories.length * MIN_CATEGORY_WIDTH + estimatedMargins;
            const svgWidth = Math.max(minRequiredWidth, containerWidth);
            const needsHScroll = svgWidth > containerWidth;
            const effectiveChartHeight = needsHScroll
                ? Math.max(0, chartAreaHeight - SCROLLBAR_RESERVE)
                : chartAreaHeight;

            this.container
                .style("position", "absolute")
                .style("top", topReserve + "px")
                .style("left", containerLeft + "px")
                .style("width", containerWidth + "px")
                .style("height", chartAreaHeight + "px")
                .style("overflow-x", needsHScroll ? "auto" : "hidden")
                .style("overflow-y", "hidden");

            this.svg.attr("width", svgWidth).attr("height", effectiveChartHeight);

            // Size the Y-axis reference-line label overlay to cover the
            // entire visual viewport. Y-axis labels will be placed at
            // absolute viewport coords so they stay anchored to the
            // visible container regardless of horizontal scroll.
            this.refLineLabelOverlay
                .style("top", "0").style("left", "0")
                .style("width", viewportWidth + "px")
                .style("height", viewportHeight + "px")
                .attr("width", viewportWidth)
                .attr("height", viewportHeight);

            const chartG = this.svg.append("g")
                .attr("transform", `translate(0,0)`);
            const geom = this.renderPanel(
                chartG, viewModel.dataPoints, viewModel.xCategories,
                svgWidth, effectiveChartHeight, viewModel,
                /* drawAxisTitlesInline */ false,
                /* skipYAxisInline */ externalYAxis,
                /* xVirtualPlotW */ 0,
                /* xScrollLeft */ 0,
                /* panelKey */ "",
                /* panelLeftInVisual */ containerLeft,
                /* panelTopInVisual */ topReserve,
                /* visibleContainerW */ containerWidth
            );

            if (geom && geom.plotW > 0 && geom.plotH > 0) {
                                // chartTopOffset = visual-viewport Y at the top of the plot
                // area. Use topReserve (which already factors in the toolbar
                // reserve) instead of raw legendHeightTop so Y-axis labels
                // at the top don't render behind the toolbar buttons.
                const chartTopOffset = topReserve + geom.marginTop;

                // Render the external Y-axis line + ticks + labels using
                // the scale that the inline panel computed, so they stay
                // perfectly aligned with the gridlines and bubbles.
                if (externalYAxis) {
                    this.renderYAxisOverlay(
                        geom.yScale, geom.plotH, chartTopOffset, geom.yTickValues,
                        /* leftOffset */ chartAreaLeftOffset
                    );
                } else {
                    this.yAxisOverlay.style("width", "0").style("height", "0")
                        .attr("width", 0).attr("height", 0);
                }

                // X- and Y-title overlays: align X-title to the chart area
                // (offset right by the Y-axis width) so it visually centres
                // over the bubbles, not the axis label strip. Y-title also
                // shifts past any left-side legend so the rotated label
                // doesn't render inside the legend column.
                this.renderAxisTitlesOverlay(
                    viewportWidth,
                    viewportHeight,
                    topReserve,
                    legendHeightBottom,
                    chartTopOffset,
                    0,
                    geom.marginLeft,
                    geom.plotH,
                    viewModel,
                    needsHScroll ? SCROLLBAR_RESERVE : 0,
                    /* xTitleLeftOffset */ chartAreaLeftOffset + yAxisOverlayWidth,
                    /* yTitleLeftOffset */ chartAreaLeftOffset
                );
            } else {
                this.yAxisOverlay.style("width", "0").style("height", "0")
                    .attr("width", 0).attr("height", 0);
            }

            // Hide the shared multi-panel scrollbar in single-chart mode.
            this.renderSharedXScrollbar(false, 0, 0, 0, 0, 0, 0);
        }

        // Clear selection on background click
        this.svg.on("click", () => {
            this.selectionManager.clear();
        });

        // Background right-click -> Power BI context menu (drill up / expand)
        this.svg.on("contextmenu", (event: MouseEvent) => {
            const sm: any = this.selectionManager;
            if (sm && typeof sm.showContextMenu === "function") {
                sm.showContextMenu({}, { x: event.clientX, y: event.clientY });
            }
            event.preventDefault();
        });
    }

    // --- Formatting Pane ---
    public getFormattingModel(): powerbi.visuals.FormattingModel {
        // Recompute nested-slice visibility based on current toggle state
        // before Power BI builds the format pane.
        if (this.formattingSettings && typeof (this.formattingSettings as any).updateSliceVisibility === "function") {
            (this.formattingSettings as any).updateSliceVisibility();
        }
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
