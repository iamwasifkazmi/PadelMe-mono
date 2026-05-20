import { prisma } from "./prisma.js";

export type VenueSearchResult = {
  id?: string;
  name: string;
  address: string;
  city?: string;
  lat: number | null;
  lng: number | null;
  source: "internal" | "map";
};

function sportTag(sport: string): string {
  const s = (sport || "padel").toLowerCase();
  return { padel: "padel", tennis: "tennis", pickleball: "pickleball" }[s] || s;
}

export async function searchInternalVenues(
  query: string,
  sport: string,
  limit = 200,
): Promise<VenueSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const sportLower = sportTag(sport);
  const all = await prisma.venue.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return all
    .filter((v) => {
      const matchesSport = !sportLower || !v.sport || v.sport.toLowerCase() === sportLower;
      const matchesQuery =
        v.name?.toLowerCase().includes(q) ||
        v.city?.toLowerCase().includes(q) ||
        (v.postcode || "").toLowerCase().includes(q) ||
        (v.address || "").toLowerCase().includes(q);
      return matchesSport && matchesQuery;
    })
    .map((v) => ({
      id: v.id,
      name: v.name,
      address: [v.address, v.city, v.postcode].filter(Boolean).join(", "),
      city: v.city,
      lat: v.lat,
      lng: v.lng,
      source: "internal" as const,
    }));
}

async function geocodeCenter(query: string): Promise<{ lat: string; lon: string } | null> {
  const url =
    "https://nominatim.openstreetmap.org/search?q=" +
    encodeURIComponent(query) +
    "&format=json&limit=1";
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": "PadelMe/1.0 (venue search; contact@padelme.app)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ lat: string; lon: string }>;
  return data[0] ?? null;
}

async function searchOverpassPadelCourts(
  centerLat: string,
  centerLon: string,
  sport: string,
  radiusM: number,
): Promise<VenueSearchResult[]> {
  const sportTagVal = sportTag(sport);
  const oq =
    '[out:json][timeout:15];(node["sport"~"' +
    sportTagVal +
    '",i](around:' +
    radiusM +
    "," +
    centerLat +
    "," +
    centerLon +
    ');way["sport"~"' +
    sportTagVal +
    '",i](around:' +
    radiusM +
    "," +
    centerLat +
    "," +
    centerLon +
    "););out center 20;";
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(oq),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const od = (await res.json()) as {
    elements?: Array<{
      tags?: Record<string, string>;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
    }>;
  };

  const results: VenueSearchResult[] = [];
  for (const el of od.elements || []) {
    if (!el.tags?.name) continue;
    const addr = [el.tags["addr:street"], el.tags["addr:city"]].filter(Boolean).join(", ");
    results.push({
      name: el.tags.name,
      address: addr || "",
      city: el.tags["addr:city"],
      lat: el.lat ?? el.center?.lat ?? null,
      lng: el.lon ?? el.center?.lon ?? null,
      source: "map",
    });
  }
  return results;
}

export async function searchVenues(
  query: string,
  sport = "padel",
  expandedRadius = false,
): Promise<VenueSearchResult[]> {
  const internal = await searchInternalVenues(query, sport);
  const seen = new Set(internal.map((r) => r.name.toLowerCase()));

  let overpass: VenueSearchResult[] = [];
  try {
    const center = await geocodeCenter(query);
    if (center) {
      const radius = expandedRadius ? 40000 : 20000;
      const raw = await searchOverpassPadelCourts(
        center.lat,
        center.lon,
        sport,
        radius,
      );
      overpass = raw.filter((r) => !seen.has(r.name.toLowerCase()));
    }
  } catch {
    // silent fallback — internal results still returned
  }

  return [...internal, ...overpass];
}

export async function saveVenueFromMapPick(
  pick: VenueSearchResult,
  sport: string,
  addedBy?: string,
): Promise<void> {
  if (!pick.name?.trim()) return;
  const city =
    pick.city ||
    pick.address.split(",").pop()?.trim() ||
    "Unknown";
  await prisma.venue.create({
    data: {
      name: pick.name.trim(),
      sport: sportTag(sport),
      address: pick.address || undefined,
      city,
      lat: pick.lat ?? undefined,
      lng: pick.lng ?? undefined,
      addedBy: addedBy || undefined,
    },
  });
}
