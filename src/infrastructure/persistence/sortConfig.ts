import { VisualFormattingSettingsModel } from "../../settings";

export interface PersistedSortLevel {
    field: string;
    order: string;
}

// Read the persisted sort-level array (`sorting.sortConfig`) out of the
// settings card's hidden TextInput slice. The sortConfig string round-trips
// through Power BI's serializer via the settings card; the field never
// surfaces in the format pane (sort UI is a custom toolbar dialog).
export function loadSortConfig(
    formattingSettings: VisualFormattingSettingsModel | undefined
): PersistedSortLevel[] {
    const raw = formattingSettings?.sortingCard?.sortConfig?.value;
    if (!raw) return [];
    try {
        const arr = JSON.parse(String(raw));
        if (Array.isArray(arr)) {
            return arr.filter((l: any) => l && l.field && l.order);
        }
    } catch { /* ignore */ }
    return [];
}

// Serialize the sort-level array and persist it via host.persistProperties.
export function persistSortConfig(host: any, levels: PersistedSortLevel[]): void {
    const json = JSON.stringify(levels);
    try {
        host.persistProperties({
            merge: [{
                objectName: "sorting",
                selector: null,
                properties: { sortConfig: json }
            }]
        });
    } catch { /* ignore */ }
}
