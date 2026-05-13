/** Normalised comparison for roster / invite emails (avoids duplicate joins from casing or double-submit races). */
export function emailsEqual(a, b) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}
export function playersIncludesCi(players, email) {
    return players.some((p) => emailsEqual(p, email));
}
/** First-seen spelling wins; removes duplicates case-insensitively. */
export function dedupeEmailsCi(emails) {
    const seen = new Set();
    const out = [];
    for (const raw of emails) {
        const e = raw.trim();
        const key = e.toLowerCase();
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        out.push(e);
    }
    return out;
}
