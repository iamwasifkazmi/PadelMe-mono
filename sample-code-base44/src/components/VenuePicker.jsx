import { useState } from "react";
import { MapPin, Search, ChevronRight, PenLine, Loader2, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";

export default function VenuePicker({ sport = "padel", value, onChange }) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [venues, setVenues] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualPostcode, setManualPostcode] = useState("");
  const [manualAddress, setManualAddress] = useState("");
  const [expandedRadius, setExpandedRadius] = useState(false);

  // Search internal DB + try Overpass silently
  const searchVenues = async (useExpandedRadius = false) => {
    if (!query.trim()) return;
    setSearching(true);
    setVenues(null);
    setManualMode(false);

    const q = query.trim().toLowerCase();
    const sportLower = (sport || "").toLowerCase();

    // 1. Internal Venue entity — match by name, city, postcode, or address
    let internalResults = [];
    try {
      const all = await base44.entities.Venue.list("-created_date", 200);
      internalResults = all.filter((v) => {
        const matchesSport = !sportLower || !v.sport || v.sport.toLowerCase() === sportLower;
        const matchesQuery =
          v.name?.toLowerCase().includes(q) ||
          v.city?.toLowerCase().includes(q) ||
          v.postcode?.toLowerCase().includes(q) ||
          v.address?.toLowerCase().includes(q);
        return matchesSport && matchesQuery;
      }).map((v) => ({
        id: v.id,
        name: v.name,
        address: [v.address, v.city, v.postcode].filter(Boolean).join(", "),
        city: v.city,
        lat: v.lat || null,
        lng: v.lng || null,
        source: "internal",
      }));
    } catch {}

    // 2. Overpass fallback — silent, does NOT block the user
    let overpassResults = [];
    try {
      const geoRes = await fetch(
        "https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(query) + "&format=json&limit=1",
        { headers: { "Accept-Language": "en" }, signal: AbortSignal.timeout(5000) }
      );
      const geoData = await geoRes.json();
      if (geoData.length) {
        const centerLat = geoData[0].lat;
        const centerLon = geoData[0].lon;
        const radius = useExpandedRadius ? 40000 : 20000;
        const sportTag = { padel: "padel", tennis: "tennis", pickleball: "pickleball" }[sportLower] || sportLower;
        const oq = '[out:json][timeout:15];(node["sport"~"' + sportTag + '",i](around:' + radius + ',' + centerLat + ',' + centerLon + ');way["sport"~"' + sportTag + '",i](around:' + radius + ',' + centerLat + ',' + centerLon + '););out center 20;';
        const or = await fetch("https://overpass-api.de/api/interpreter", {
          method: "POST",
          body: "data=" + encodeURIComponent(oq),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          signal: AbortSignal.timeout(8000),
        });
        if (or.ok) {
          const od = await or.json();
          const seen = new Set(internalResults.map((r) => r.name?.toLowerCase()));
          (od.elements || []).filter((el) => el.tags?.name && !seen.has(el.tags.name.toLowerCase())).forEach((el) => {
            const addr = [el.tags["addr:street"], el.tags["addr:city"] || query].filter(Boolean).join(", ");
            overpassResults.push({
              name: el.tags.name,
              address: addr || query,
              city: el.tags["addr:city"] || query,
              lat: el.lat ?? el.center?.lat ?? null,
              lng: el.lon ?? el.center?.lon ?? null,
              source: "map",
            });
          });
        }
      }
    } catch {}

    setVenues([...internalResults, ...overpassResults]);
    setExpandedRadius(useExpandedRadius);
    setSearching(false);
  };

  const handleSelectVenue = async (v) => {
    // If from map data, save to internal DB for future use
    if (v.source === "map") {
      try {
        const user = await base44.auth.me();
        await base44.entities.Venue.create({
          name: v.name,
          sport: (sport || "").toLowerCase(),
          address: v.address,
          city: v.city,
          lat: v.lat,
          lng: v.lng,
          added_by: user?.email,
        });
      } catch {}
    }
    onChange({ name: v.name, address: v.address, lat: v.lat, lng: v.lng });
  };

  const handleManualSave = async () => {
    if (!manualName.trim() || !manualCity.trim()) return;
    const address = [manualAddress, manualCity, manualPostcode].filter(Boolean).join(", ");
    // Save to internal DB
    try {
      const user = await base44.auth.me();
      await base44.entities.Venue.create({
        name: manualName.trim(),
        sport: (sport || "").toLowerCase(),
        address: manualAddress || undefined,
        city: manualCity.trim(),
        postcode: manualPostcode || undefined,
        added_by: user?.email,
      });
    } catch {}
    onChange({ name: manualName.trim(), address, lat: null, lng: null });
  };

  const handleClear = () => {
    onChange(null);
    setVenues(null);
    setQuery("");
    setManualMode(false);
    setManualName("");
    setManualCity("");
    setManualPostcode("");
    setManualAddress("");
  };

  // Selected state
  if (value) {
    return (
      <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{value.name}</p>
            {value.address && <p className="text-xs text-muted-foreground truncate">{value.address}</p>}
          </div>
        </div>
        <button onClick={handleClear} className="ml-2 text-muted-foreground hover:text-foreground flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search input */}
      {!manualMode && (
        <>
          <div className="flex gap-2">
            <Input
              placeholder="Town, city, postcode or venue name..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setVenues(null); }}
              onKeyDown={(e) => e.key === "Enter" && searchVenues()}
              className="rounded-xl h-11 bg-card flex-1"
            />
            <Button
              type="button"
              onClick={() => searchVenues()}
              disabled={searching || !query.trim()}
              className="rounded-xl h-11 px-4 flex-shrink-0"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {/* Results */}
          {venues !== null && (
            <div className="space-y-2">
              {venues.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {venues.length} venue{venues.length !== 1 ? "s" : ""} found — tap to select
                  </p>
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {venues.map((v, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleSelectVenue(v)}
                        className="w-full flex items-center justify-between p-3 bg-card border border-border rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{v.name}</p>
                            {v.address && <p className="text-xs text-muted-foreground truncate">{v.address}</p>}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setManualMode(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full justify-center py-1"
                  >
                    <PenLine className="w-3.5 h-3.5" /> Can't find your venue? Add it manually
                  </button>
                </>
              ) : (
                /* No results — always show recovery options */
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <p className="text-sm font-medium text-center">
                    No {sport ? sport : ""} venues found near <strong>"{query}"</strong>
                  </p>
                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      onClick={() => setManualMode(true)}
                      className="w-full rounded-xl h-10 gap-2"
                    >
                      <Plus className="w-4 h-4" /> Add Venue Manually
                    </Button>
                    {!expandedRadius && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => searchVenues(true)}
                        className="w-full rounded-xl h-10 gap-2"
                      >
                        <Search className="w-4 h-4" /> Expand Search Radius
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => { setVenues(null); setQuery(""); }}
                      className="text-xs text-muted-foreground hover:text-foreground text-center"
                    >
                      Try a different area
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Always-available manual entry shortcut */}
          {venues === null && !searching && (
            <button
              type="button"
              onClick={() => setManualMode(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <PenLine className="w-3.5 h-3.5" /> Enter venue manually instead
            </button>
          )}
        </>
      )}

      {/* Manual entry form */}
      {manualMode && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Add Venue Manually</Label>
            <button
              type="button"
              onClick={() => setManualMode(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← Search instead
            </button>
          </div>
          <div className="space-y-2">
            <Input
              placeholder="Venue / court name *"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="rounded-xl h-10 bg-background"
            />
            <Input
              placeholder="Town / city *"
              value={manualCity}
              onChange={(e) => setManualCity(e.target.value)}
              className="rounded-xl h-10 bg-background"
            />
            <Input
              placeholder="Postcode (optional)"
              value={manualPostcode}
              onChange={(e) => setManualPostcode(e.target.value)}
              className="rounded-xl h-10 bg-background"
            />
            <Input
              placeholder="Street address (optional)"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              className="rounded-xl h-10 bg-background"
            />
          </div>
          <Button
            type="button"
            onClick={handleManualSave}
            disabled={!manualName.trim() || !manualCity.trim()}
            className="w-full rounded-xl h-10"
          >
            Use This Venue
          </Button>
        </div>
      )}
    </div>
  );
}