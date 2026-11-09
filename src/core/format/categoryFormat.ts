import { applyDateFormat } from "./dateFormat";

export function formatCategoryValue(val: any, source?: any): string {
    if (val == null) return "";

    const displayName: string = (source && source.displayName) || "";
    const dnLower = displayName.toLowerCase().trim();
    const typeCategory: string = (source && source.type && source.type.category) || "";
    const tcLower = typeCategory.toLowerCase();

    const isYearLevel = dnLower === "year" || tcLower === "years" || tcLower === "year";
    const isQuarterLevel = dnLower === "quarter" || dnLower.startsWith("qtr") || tcLower === "quarters" || tcLower === "quarter";
    const isMonthLevel = dnLower === "month" || tcLower === "months" || tcLower === "month";
    const isDayLevel = dnLower === "day" || tcLower === "days" || tcLower === "day"
        || dnLower === "date" || tcLower === "date";

    if (isYearLevel) {
        if (typeof val === "number" && val > 1900 && val < 2200) return String(val);
        if (val instanceof Date) return String(val.getFullYear());
        return String(val);
    }
    if (isQuarterLevel) {
        if (typeof val === "number") return `Q${val}`;
        return String(val);
    }
    if (isMonthLevel) {
        if (typeof val === "number" && val >= 1 && val <= 12)
            return new Date(2000, val - 1, 1).toLocaleDateString("en-US", { month: "long" });
        if (val instanceof Date) return val.toLocaleDateString("en-US", { month: "long" });
        return String(val);
    }
    if (isDayLevel) {
        if (typeof val === "number" && val >= 1 && val <= 31) return String(val);
        if (val instanceof Date) return String(val.getDate());
        return String(val);
    }

    if (val instanceof Date) {
        const d = val;
        if (!isNaN(d.getTime())) {
            const fmt: string = (source && source.format) || "";
            if (fmt && /[dMyy]/.test(fmt)) {
                return applyDateFormat(d, fmt);
            }
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${mm}/${dd}/${d.getFullYear()}`;
        }
    }

    const s = String(val);
    if (/^\w{3} \w{3} \d{2} \d{4}/.test(s)) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
            const fmt: string = (source && source.format) || "";
            if (fmt && /[dMyy]/.test(fmt)) return applyDateFormat(d, fmt);
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            return `${mm}/${dd}/${d.getFullYear()}`;
        }
    }
    return s;
}
