import { appUserAgent } from "./appDomain.js";
import { prisma } from "./prisma.js";
import { ensureStarterVenues } from "./starterVenues.js";
import { searchLtaPadelCourts } from "./ltaCourtFinder.js";
const NOMINATIM_UA = process.env.NOMINATIM_USER_AGENT || appUserAgent("venue-search");
const OVERPASS_ENDPOINTS = (process.env.OVERPASS_URLS ||
    "https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
function sportTag(sport) {
    const s = (sport || "padel").toLowerCase();
    return { padel: "padel", tennis: "tennis", pickleball: "pickleball" }[s] || s;
}
function looksLikePadelPlace(text) {
    return /padel|paddle tennis|pádel/i.test(text);
}
export async function searchInternalVenues(query, sport, limit = 200) {
    const q = query.trim().toLowerCase();
    if (!q)
        return [];
    await ensureStarterVenues();
    const sportLower = sportTag(sport);
    const all = await prisma.venue.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
    });
    return all
        .filter((v) => {
        const matchesSport = !sportLower || !v.sport || v.sport.toLowerCase() === sportLower;
        const matchesQuery = v.name?.toLowerCase().includes(q) ||
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
        source: "internal",
    }));
}
async function nominatimSearch(query, limit = 8) {
    const country = (process.env.VENUE_SEARCH_COUNTRY || "gb").trim().toLowerCase();
    let url = "https://nominatim.openstreetmap.org/search?q=" +
        encodeURIComponent(query) +
        "&format=json&limit=" +
        limit +
        "&addressdetails=1";
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
    if (!res.ok)
        return [];
    return (await res.json());
}
async function geocodeCenter(query) {
    const hits = await nominatimSearch(query, 1);
    return hits[0] ? { lat: hits[0].lat, lon: hits[0].lon } : null;
}
/** Direct name/place search — finds clubs whose OSM listing matches "padel" + area text. */
async function searchNominatimPadelPlaces(query, seen) {
    const q = query.trim();
    if (!q)
        return [];
    const variants = [];
    if (looksLikePadelPlace(q)) {
        variants.push(q);
    }
    else {
        variants.push(`padel ${q}`, `${q} padel`, `padel club ${q}`, `padel court ${q}`);
    }
    const out = [];
    for (const term of variants) {
        const hits = await nominatimSearch(term, 10);
        for (const hit of hits) {
            const title = (hit.name || hit.display_name.split(",")[0] || "").trim();
            if (!title)
                continue;
            const key = title.toLowerCase();
            if (seen.has(key))
                continue;
            const display = hit.display_name || title;
            const isRelevant = looksLikePadelPlace(display) ||
                looksLikePadelPlace(title) ||
                /sports|leisure|pitch|club|centre|center|court|gym/i.test(display);
            if (!isRelevant)
                continue;
            seen.add(key);
            const parts = display.split(",").map((s) => s.trim());
            const city = parts.length > 1 ? parts[parts.length - 3] || parts[1] : undefined;
            out.push({
                name: title,
                address: display,
                city,
                lat: Number(hit.lat),
                lng: Number(hit.lon),
                source: "map",
            });
        }
    }
    return out.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}
async function runOverpassQuery(oq) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
            const res = await fetch(endpoint, {
                method: "POST",
                body: "data=" + encodeURIComponent(oq),
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                    "User-Agent": NOMINATIM_UA,
                },
                signal: AbortSignal.timeout(20000),
            });
            const text = await res.text();
            if (!res.ok || text.startsWith("<"))
                continue;
            const od = JSON.parse(text);
            const results = [];
            for (const el of od.elements || []) {
                if (!el.tags?.name)
                    continue;
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
        catch {
            continue;
        }
    }
    return [];
}
async function searchOverpassPadelCourts(centerLat, centerLon, sport, radiusM, queryFallback) {
    const sportTagVal = sportTag(sport);
    // Broader than sport=padel only — many UK courts are leisure=pitch / sports_centre with padel in the name.
    const oq = "[out:json][timeout:25];(" +
        `node["sport"="${sportTagVal}"](around:${radiusM},${centerLat},${centerLon});` +
        `way["sport"="${sportTagVal}"](around:${radiusM},${centerLat},${centerLon});` +
        `node["sport"="tennis"]["name"~"padel",i](around:${radiusM},${centerLat},${centerLon});` +
        `way["sport"="tennis"]["name"~"padel",i](around:${radiusM},${centerLat},${centerLon});` +
        `node["leisure"="pitch"]["name"~"padel",i](around:${radiusM},${centerLat},${centerLon});` +
        `way["leisure"="pitch"]["name"~"padel",i](around:${radiusM},${centerLat},${centerLon});` +
        `node["leisure"="sports_centre"]["name"~"padel",i](around:${radiusM},${centerLat},${centerLon});` +
        `way["leisure"="sports_centre"]["name"~"padel",i](around:${radiusM},${centerLat},${centerLon});` +
        ");out center 25;";
    const raw = await runOverpassQuery(oq);
    return raw.map((r) => ({
        ...r,
        address: r.address || queryFallback,
        city: r.city || queryFallback,
    }));
}
export async function searchVenues(query, sport = "padel", expandedRadius = false) {
    const q = query.trim();
    let internal = [];
    try {
        internal = await searchInternalVenues(q, sport);
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[venueSearch] internal DB search failed:", e);
    }
    const seen = new Set(internal.map((r) => r.name.toLowerCase()));
    const mapResults = [];
    try {
        const ltaResults = await searchLtaPadelCourts(q);
        for (const r of ltaResults) {
            const key = r.name.toLowerCase();
            if (seen.has(key))
                continue;
            seen.add(key);
            mapResults.push(r);
        }
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[venueSearch] LTA court finder failed:", e);
    }
    try {
        const nominatimPlaces = await searchNominatimPadelPlaces(q, seen);
        for (const r of nominatimPlaces) {
            seen.add(r.name.toLowerCase());
            mapResults.push(r);
        }
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[venueSearch] nominatim padel places failed:", e);
    }
    try {
        const center = await geocodeCenter(q);
        if (center) {
            const radius = expandedRadius ? 40000 : 20000;
            const raw = await searchOverpassPadelCourts(center.lat, center.lon, sport, radius, q);
            for (const r of raw) {
                const key = r.name.toLowerCase();
                if (seen.has(key))
                    continue;
                seen.add(key);
                mapResults.push(r);
            }
        }
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[venueSearch] overpass failed:", e);
    }
    return [...internal, ...mapResults];
}
export async function saveVenueFromMapPick(pick, sport, addedBy) {
    if (!pick.name?.trim())
        return;
    const city = pick.city ||
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
