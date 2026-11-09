export function formatValue(val: number, displayUnits: string, decimalPlaces: number): string {
    if (val == null || isNaN(val)) return "";
    let divisor = 1;
    let suffix = "";
    if (displayUnits === "auto") {
        if (Math.abs(val) >= 1e9) { divisor = 1e9; suffix = "B"; }
        else if (Math.abs(val) >= 1e6) { divisor = 1e6; suffix = "M"; }
        else if (Math.abs(val) >= 1e3) { divisor = 1e3; suffix = "K"; }
    } else if (displayUnits === "thousands") { divisor = 1e3; suffix = "K"; }
    else if (displayUnits === "millions") { divisor = 1e6; suffix = "M"; }
    else if (displayUnits === "billions") { divisor = 1e9; suffix = "B"; }

    const formatted = (val / divisor).toFixed(decimalPlaces);
    const cleaned = decimalPlaces > 0 ? formatted.replace(/\.?0+$/, "") : formatted;
    return cleaned + suffix;
}
