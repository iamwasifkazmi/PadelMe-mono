import { appUserAgent } from "./appDomain.js";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
let lastRequestAt = 0;

/** OSM policy: max 1 request per second. */
async function waitForNominatimSlot(): Promise<void> {
  const minGapMs = 1100;
  const now = Date.now();
  const wait = Math.max(0, minGapMs - (now - lastRequestAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

export async function nominatimFetchJson<T>(queryParams: string): Promise<T | null> {
  await waitForNominatimSlot();
  const url = `${NOMINATIM_BASE}?${queryParams}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en",
        "User-Agent": process.env.NOMINATIM_USER_AGENT || appUserAgent("venue-search"),
      },
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    if (!res.ok || /rate exceeded/i.test(text)) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
