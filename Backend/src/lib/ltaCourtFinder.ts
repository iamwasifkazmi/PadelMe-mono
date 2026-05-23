import type { VenueSearchResult } from "./venueSearch.js";

const LTA_BASE =
  process.env.LTA_PADEL_FINDER_URL?.trim() ||
  "https://www.ltapadel.org.uk/play/find-a-padel-court/";

const LTA_UA =
  process.env.LTA_USER_AGENT ||
  "MiPadel/1.0 (+https://mipadel.app; lta-court-finder; contact@mipadel.co.uk)";

const NOMINATIM_UA =
  process.env.NOMINATIM_USER_AGENT ||
  "MiPadel/1.0 (+https://mipadel.app; venue-search; contact@mipadel.co.uk)";

export function ltaCourtFinderEnabled(): boolean {
  return process.env.LTA_PADEL_FINDER_ENABLED !== "0";
}

async function geocodeQuery(query: string): Promise<{ lat: string; lon: string } | null> {
  const country = (process.env.VENUE_SEARCH_COUNTRY || "gb").trim().toLowerCase();
  let url =
    "https://nominatim.openstreetmap.org/search?q=" +
    encodeURIComponent(query) +
    "&format=json&limit=1";
  if (country && country !== "any") {
    url += "&countrycodes=" + encodeURIComponent(country);
  }
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": NOMINATIM_UA,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { lat: string; lon: string }[];
  return data[0] ?? null;
}

async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number } | null> {
  const hit = await geocodeQuery(`${postcode}, United Kingdom`);
  if (!hit) return null;
  const lat = Number.parseFloat(hit.lat);
  const lng = Number.parseFloat(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Parse LTA Padel court finder HTML (server-rendered list view). */
export function parseLtaCourtFinderHtml(html: string): Omit<VenueSearchResult, "source">[] {
  const chunks = html.split('class="lta-card lta-card--borderless lta-card-court-booking');
  const out: Omit<VenueSearchResult, "source">[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < chunks.length; i++) {
    const block = chunks[i]!.slice(0, 12000);

    let name = "";
    const spanTitle = block.match(
      /<h2[^>]*class="lta-card-title[^"]*"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/i,
    );
    if (spanTitle?.[1]) name = decodeHtml(spanTitle[1]);
    if (!name) {
      const linkTitle = block.match(
        /<h2[^>]*class="lta-card-title[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i,
      );
      if (linkTitle?.[1]) name = decodeHtml(linkTitle[1]);
    }
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const detail = block.match(
      /([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\s*\(([0-9.]+)\s*miles away\)/i,
    );
    const postcode = detail?.[1]?.trim();
    const distanceMiles = detail?.[2] ? Number.parseFloat(detail[2]) : undefined;

    let bookingUrl: string | undefined;
    const siteLink = block.match(
      /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*target="_blank"[^>]*>[\s\S]*?View court details/i,
    );
    if (siteLink?.[1] && !siteLink[1].includes("ltapadel.org.uk")) {
      bookingUrl = siteLink[1];
    } else {
      const anyExternal = block.match(/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*target="_blank"/i);
      if (
        anyExternal?.[1] &&
        !anyExternal[1].includes("ltapadel.org.uk") &&
        !anyExternal[1].includes("lta.org.uk")
      ) {
        bookingUrl = anyExternal[1];
      }
    }

    const courtTypeMatch = block.match(/Court Type:\s*<b>([^<]+)<\/b>/i);
    const courtType = courtTypeMatch?.[1]?.trim();

    const addressParts = [postcode, distanceMiles != null ? `${distanceMiles} mi` : null].filter(
      Boolean,
    );

    out.push({
      name,
      address: addressParts.join(" · ") || "United Kingdom",
      city: undefined,
      lat: null,
      lng: null,
      postcode,
      distanceMiles,
      courtType,
      bookingUrl,
      ltaRegistered: /LTA Registered venue/i.test(block),
    });
  }

  return out;
}

export async function searchLtaPadelCourts(query: string): Promise<VenueSearchResult[]> {
  if (!ltaCourtFinderEnabled()) return [];

  const center = await geocodeQuery(query.includes("United Kingdom") ? query : `${query}, UK`);
  if (!center) return [];

  const searchUrl =
    `${LTA_BASE.replace(/\/$/, "")}/?latitude=${encodeURIComponent(center.lat)}` +
    `&longitude=${encodeURIComponent(center.lon)}` +
    `&location=${encodeURIComponent(query.trim())}`;

  const res = await fetch(searchUrl, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-GB",
      "User-Agent": LTA_UA,
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.warn("[ltaCourtFinder] HTTP", res.status, searchUrl);
    return [];
  }

  const html = await res.text();
  if (!html.includes("lta-card-court-booking")) {
    return [];
  }

  const parsed = parseLtaCourtFinderHtml(html);

  return parsed.slice(0, 25).map((row) => {
    const address =
      row.postcode && row.distanceMiles != null
        ? `${row.postcode} (${row.distanceMiles} mi)${row.courtType ? ` · ${row.courtType}` : ""}`
        : row.address;

    return {
      ...row,
      address,
      lat: row.lat,
      lng: row.lng,
      source: "lta" as const,
    };
  });
}
