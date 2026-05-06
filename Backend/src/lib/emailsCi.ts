/** Normalised comparison for roster / invite emails (avoids duplicate joins from casing or double-submit races). */

export function emailsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function playersIncludesCi(players: string[], email: string): boolean {
  return players.some((p) => emailsEqual(p, email));
}

/** First-seen spelling wins; removes duplicates case-insensitively. */
export function dedupeEmailsCi(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = raw.trim();
    const key = e.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
