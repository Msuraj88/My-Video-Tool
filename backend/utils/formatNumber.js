/**
 * Formats numeric values for overlay labels.
 * Examples:
 * 1500   -> "$1,500"
 * "772"  -> "$772"
 * "$1500" -> "$1,500"
 * "20%"  -> "20%" (unchanged, treated as percentage)
 */
function formatNumber(value) {
    if (value == null) return '';

    const raw = String(value).trim();
    if (!raw) return '';

    // Leave percentages as-is
    if (raw.includes('%')) {
        return raw;
    }

    // Preserve trailing '+' (e.g. "$1000+")
    const hasPlus = raw.endsWith('+');
    const trimmed = hasPlus ? raw.slice(0, -1) : raw;

    // Strip leading '$' and commas for parsing
    const numericPart = trimmed.replace(/^\$/, '').replace(/,/g, '');
    const n = Number.parseFloat(numericPart);
    if (!Number.isFinite(n)) {
        return raw;
    }

    const formatted = n.toLocaleString('en-US', {
        maximumFractionDigits: 2,
        useGrouping: true
    });

    const withDollar = `$${formatted}`;
    return hasPlus ? `${withDollar}+` : withDollar;
}

module.exports = {
    formatNumber
};

