export function applyDateFormat(d: Date, fmt: string): string {
    const yyyy = d.getFullYear();
    const yy = String(yyyy).slice(-2);
    const M = d.getMonth() + 1;
    const dd = d.getDate();
    const dayOfWeek = d.getDay();
    const shortMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const longMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const shortDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const longDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const pad2 = (n: number) => String(n).padStart(2, "0");

    const parts: string[] = [];
    let result = fmt.replace(/dddd|ddd|dd|d|MMMM|MMM|MM|M|yyyy|yy/g, (token) => {
        let replacement = "";
        switch (token) {
            case "dddd": replacement = longDays[dayOfWeek]; break;
            case "ddd": replacement = shortDays[dayOfWeek]; break;
            case "dd": replacement = pad2(dd); break;
            case "d": replacement = String(dd); break;
            case "MMMM": replacement = longMonths[M - 1]; break;
            case "MMM": replacement = shortMonths[M - 1]; break;
            case "MM": replacement = pad2(M); break;
            case "M": replacement = String(M); break;
            case "yyyy": replacement = String(yyyy); break;
            case "yy": replacement = yy; break;
            default: replacement = token;
        }
        const idx = parts.length;
        parts.push(replacement);
        return `\x00${idx}\x00`;
    });
    result = result.replace(/\x00(\d+)\x00/g, (_, idx) => parts[Number(idx)]);
    return result;
}
