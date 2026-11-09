"use strict";

// =====================================================================
//  Sort Criteria Modal Dialog
// =====================================================================
//  Power-BI-window-level modal dialog for the multi-level sorting
//  editor. Opened by visual.ts via host.openModalDialog(...) when the
//  host supports modal dialogs (host.hostCapabilities.allowModalDialog).
//
//  Communication:
//    Visual → Dialog:  initialState passed to constructor (fields, levels)
//    Dialog → Visual:  host.setResult({ levels }) on every change,
//                      then host.close(DialogAction.OK, { levels }) on OK.
//
//  Reference:
//    https://learn.microsoft.com/en-us/power-bi/developer/visuals/create-display-dialog-box
// =====================================================================

import powerbi from "powerbi-visuals-api";
import DialogConstructorOptions = powerbi.extensibility.visual.DialogConstructorOptions;
import DialogAction = powerbi.DialogAction;

import {
    buildSortCriteriaBody,
    SortField,
    SortLevel,
    SortPickerHandle
} from "./sortCriteriaPicker";

export interface SortCriteriaDialogState {
    fields: SortField[];
    initialLevels: SortLevel[];
}

export interface SortCriteriaDialogResult {
    levels: SortLevel[];
}

export class SortCriteriaDialog {
    static id = "SortCriteriaDialog";

    constructor(options: DialogConstructorOptions, initialState: object) {
        const state = (initialState || {}) as SortCriteriaDialogState;
        const host = options.host;
        const root = options.element;

        // Reset inherited iframe styles so the picker fills cleanly.
        root.style.margin = "0";
        root.style.padding = "0";
        root.style.background = "#ffffff";
        root.style.fontFamily = "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif";
        root.style.color = "#1a1a1a";
        root.style.display = "flex";
        root.style.flexDirection = "column";
        root.style.height = "100vh";

        // Scrollable body — shared picker UI fills this.
        const body = document.createElement("div");
        body.style.flex = "1";
        body.style.overflowY = "auto";
        body.style.padding = "12px 20px";
        root.appendChild(body);

        let handle: SortPickerHandle | null = null;
        try {
            handle = buildSortCriteriaBody(body, {
                fields: state.fields || [],
                initialLevels: state.initialLevels || []
            });
        } catch (err) {
            const errDiv = document.createElement("div");
            errDiv.style.padding = "16px";
            errDiv.style.color = "#a00";
            errDiv.style.fontSize = "13px";
            errDiv.textContent = "Failed to render sort editor: " + String(err);
            root.appendChild(errDiv);
        }

        // Push the latest pending levels to the host on each interaction
        // so the OK action button has fresh data to return.
        const publishResult = () => {
            if (!handle) return;
            const result: SortCriteriaDialogResult = { levels: handle.getPending() };
            try { host.setResult(result); } catch { /* host may not be ready yet */ }
        };

        // Initial result so OK works even if the user makes no changes.
        publishResult();

        ["click", "change", "input"].forEach(evt => {
            root.addEventListener(evt, () => publishResult(), true);
        });

        // Enter-key shortcut: commit and close.
        root.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" && handle) {
                publishResult();
                try {
                    host.close(DialogAction.OK, { levels: handle.getPending() });
                } catch { /* host may already have closed */ }
            }
        });
    }
}

// =====================================================================
//  Dialog registry — must run as a side effect of importing this file.
// =====================================================================
declare const globalThis: { dialogRegistry?: { [id: string]: unknown } };
globalThis.dialogRegistry = globalThis.dialogRegistry || {};
globalThis.dialogRegistry[SortCriteriaDialog.id] = SortCriteriaDialog;
