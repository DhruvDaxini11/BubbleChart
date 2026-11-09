"use strict";

// =====================================================================
//  Category Colors Modal Dialog
// =====================================================================
//  Power-BI-window-level modal dialog for the Category Colors picker.
//  Opened by visual.ts via host.openModalDialog(...) when the host
//  supports modal dialogs (host.hostCapabilities.allowModalDialog).
//
//  The dialog renders in its own iframe controlled by Power BI, sized
//  to the dimensions requested in DialogOpenOptions. Power BI provides
//  the surrounding chrome (title bar with the visual's icon/name and
//  the OK / Cancel action buttons).
//
//  Communication:
//    Visual → Dialog:  initialState passed to constructor
//    Dialog → Visual:  host.setResult({ colors }) on every change,
//                      then host.close(DialogAction.OK, { colors }) on Apply.
//
//  Reference:
//    https://learn.microsoft.com/en-us/power-bi/developer/visuals/create-display-dialog-box
// =====================================================================

import powerbi from "powerbi-visuals-api";
import DialogConstructorOptions = powerbi.extensibility.visual.DialogConstructorOptions;
import DialogAction = powerbi.DialogAction;

import { buildCategoryColorsBody, PickerHandle } from "./categoryColorsPicker";

// initialState shape — keep in sync with what visual.ts passes in.
export interface CategoryColorsDialogState {
    keys: string[];
    currentColors: { [key: string]: string };
    defaultColors: { [key: string]: string };
    fieldName?: string;
    presetColors?: string[];
}

// Result shape — what the dialog returns to visual.ts via host.close.
export interface CategoryColorsDialogResult {
    colors: { [key: string]: string };
}

export class CategoryColorsDialog {
    static id = "CategoryColorsDialog";

    constructor(options: DialogConstructorOptions, initialState: object) {
        const state = (initialState || {}) as CategoryColorsDialogState;
        const host = options.host;
        const root = options.element;

        // Reset any default styles inherited from the dialog iframe so
        // the picker fills its viewport cleanly.
        root.style.margin = "0";
        root.style.padding = "0";
        root.style.background = "#ffffff";
        root.style.fontFamily = "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif";
        root.style.color = "#1a1a1a";
        root.style.display = "flex";
        root.style.flexDirection = "column";
        root.style.height = "100vh";

        // Optional sub-header showing the bound field name (the visual's
        // own title is already shown by Power BI in the dialog chrome).
        if (state.fieldName) {
            const subHeader = document.createElement("div");
            subHeader.style.padding = "10px 20px 6px";
            subHeader.style.fontSize = "12px";
            subHeader.style.color = "#777";
            subHeader.style.borderBottom = "1px solid #f0f0f0";
            subHeader.textContent = state.fieldName;
            root.appendChild(subHeader);
        }

        // Scrollable body — the shared picker UI fills this.
        const body = document.createElement("div");
        body.style.flex = "1";
        body.style.overflowY = "auto";
        body.style.padding = "8px 20px";
        root.appendChild(body);

        // Helper that pushes a colors map up to the host as the result
        // the OK button will return. Tolerant of pre-init calls.
        const setResultColors = (colors: { [key: string]: string }) => {
            try {
                host.setResult({ colors } as CategoryColorsDialogResult);
            } catch { /* host may not be ready yet */ }
        };

        let handle: PickerHandle | null = null;
        try {
            handle = buildCategoryColorsBody(body, {
                keys: state.keys || [],
                currentColors: state.currentColors || {},
                defaultColors: state.defaultColors || {},
                presetColors: state.presetColors,
                // CRITICAL: explicit onChange. Preset/Other/Reset color
                // changes happen inside a popover appended to document.body,
                // outside the dialog root — so their events do NOT bubble
                // to a capture listener on root. Without this callback the
                // OK button would return a stale result.
                onChange: (pending) => setResultColors(pending)
            });
        } catch (err) {
            // Surface any build failure inside the dialog so the user can
            // see what happened instead of staring at an empty modal.
            const errDiv = document.createElement("div");
            errDiv.style.padding = "16px";
            errDiv.style.color = "#a00";
            errDiv.style.fontSize = "13px";
            errDiv.textContent = "Failed to render color picker: " + String(err);
            root.appendChild(errDiv);
        }

        // Initial result so OK works even if the user makes no changes.
        if (handle) setResultColors(handle.getPending());

        // Belt-and-suspenders: also refresh on any interaction inside root.
        // This covers any user gesture we might not have explicitly hooked.
        const publishResult = () => {
            if (handle) setResultColors(handle.getPending());
        };
        ["click", "input", "change"].forEach(evt => {
            root.addEventListener(evt, () => publishResult(), true);
        });

        // If the user closes via the Power BI chrome OK button, the host
        // will resolve the openModalDialog promise with our latest result.
        // We don't need to call host.close() ourselves in that case.
        // However we keep an Enter-key shortcut for keyboard users:
        root.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter" && handle) {
                const pending = handle.getPending();
                setResultColors(pending);
                try {
                    host.close(DialogAction.OK, { colors: pending });
                } catch { /* ignore — host may have already closed */ }
            }
        });
    }
}

// =====================================================================
//  Dialog registry — Power BI looks up dialog classes by id on this
//  global object at openModalDialog time. This MUST run as a side
//  effect of importing this file (visual.ts uses a side-effect import).
// =====================================================================
declare const globalThis: { dialogRegistry?: { [id: string]: unknown } };
globalThis.dialogRegistry = globalThis.dialogRegistry || {};
globalThis.dialogRegistry[CategoryColorsDialog.id] = CategoryColorsDialog;
