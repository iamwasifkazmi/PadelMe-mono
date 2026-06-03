import { Router } from "express";
import { resolveVenueCoordinates, saveVenueFromMapPick, searchVenues } from "../../lib/venueSearch.js";
export const venuesRouter = Router();
venuesRouter.post("/resolve-coordinates", async (req, res) => {
    const body = req.body;
    try {
        const coords = await resolveVenueCoordinates(body);
        if (!coords) {
            return res.status(404).json({
                error: "Could not find map coordinates. Add a UK postcode or pick a map search result.",
            });
        }
        return res.json(coords);
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error("[venues/resolve-coordinates]", e);
        return res.status(500).json({ error: "Geocoding failed" });
    }
});
venuesRouter.get("/search", async (req, res) => {
    const q = String(req.query.q || "").trim();
    const sport = String(req.query.sport || "padel");
    const expanded = String(req.query.expanded || "") === "1" || req.query.expanded === "true";
    if (!q)
        return res.status(400).json({ error: "q is required" });
    try {
        const results = await searchVenues(q, sport, expanded);
        return res.json(results);
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error("[venues/search]", e);
        return res.status(500).json({ error: "Venue search failed" });
    }
});
venuesRouter.post("/", async (req, res) => {
    const body = req.body;
    if (body.fromMap && body.pick?.name) {
        await saveVenueFromMapPick({
            name: body.pick.name,
            address: body.pick.address,
            city: body.pick.city,
            lat: body.pick.lat,
            lng: body.pick.lng,
            source: "map",
        }, body.sport || "padel", body.addedBy);
        return res.status(201).json({ ok: true });
    }
    if (!body.name?.trim() || !body.city?.trim()) {
        return res.status(400).json({ error: "name and city are required" });
    }
    const { prisma } = await import("../../lib/prisma.js");
    const created = await prisma.venue.create({
        data: {
            name: body.name.trim(),
            sport: (body.sport || "padel").toLowerCase(),
            address: body.address || undefined,
            city: body.city.trim(),
            postcode: body.postcode || undefined,
            lat: typeof body.lat === "number" ? body.lat : undefined,
            lng: typeof body.lng === "number" ? body.lng : undefined,
            addedBy: body.addedBy || undefined,
        },
    });
    return res.status(201).json(created);
});
