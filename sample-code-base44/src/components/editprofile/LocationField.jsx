import { useState, useEffect } from "react";
import { MapPin, Loader2, RefreshCw, Pencil, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
    { headers: { "Accept-Language": "en" } }
  );
  const data = await res.json();
  const { city, town, village, county, country, postcode } = data.address || {};
  const place = city || town || village || county || "";
  return {
    label: [place, country].filter(Boolean).join(", "),
    postcode: postcode || "",
    lat,
    lng,
  };
}

export default function LocationField({ value, onChange }) {
  const [useGeo, setUseGeo]       = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [editing, setEditing]     = useState(false);
  const [draft, setDraft]         = useState(value || "");
  const [error, setError]         = useState("");
  const [permDenied, setPermDenied] = useState(false);

  // Auto-detect on mount if browser previously granted permission
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.permissions?.query({ name: "geolocation" }).then((result) => {
      if (result.state === "granted") {
        setUseGeo(true);
        detect();
      }
    });
  }, []);

  const detect = () => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported on this device.");
      return;
    }
    setDetecting(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const geo = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          onChange(geo.label);
          setDraft(geo.label);
          setEditing(false);
          setPermDenied(false);
        } catch {
          setError("Could not resolve location. Please type your city.");
        }
        setDetecting(false);
      },
      (err) => {
        setDetecting(false);
        if (err.code === 1) {
          setPermDenied(true);
          setUseGeo(false);
          setError("Location access denied. Please type your city below.");
        } else {
          setError("Could not detect location. Try again or type manually.");
        }
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleToggleGeo = (on) => {
    setUseGeo(on);
    if (on) detect();
    else setError("");
  };

  const handleManualSave = () => {
    if (draft.trim()) {
      onChange(draft.trim());
      setEditing(false);
      setError("");
    }
  };

  const handleClear = () => {
    onChange("");
    setDraft("");
    setEditing(true);
    setUseGeo(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          Location <span className="text-destructive">*</span>
        </label>
        {!permDenied && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Use my location</span>
            <Switch
              checked={useGeo}
              onCheckedChange={handleToggleGeo}
              disabled={detecting}
            />
          </div>
        )}
      </div>

      {/* Detected / set location display */}
      {value && !editing ? (
        <div className="flex items-center justify-between p-3 bg-primary/5 border border-primary/20 rounded-xl">
          <div className="flex items-center gap-2 min-w-0">
            <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-sm font-medium truncate">{value}</span>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {useGeo && (
              <button
                type="button"
                onClick={detect}
                disabled={detecting}
                className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                title="Refresh location"
              >
                {detecting
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <RefreshCw className="w-3.5 h-3.5" />
                }
              </button>
            )}
            <button
              type="button"
              onClick={() => { setEditing(true); setDraft(value); setUseGeo(false); }}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Edit location"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Clear"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Manual input */
        <div className="space-y-2">
          {detecting ? (
            <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-xl border border-border">
              <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
              <span className="text-sm text-muted-foreground">Detecting your location…</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="e.g. London, UK"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleManualSave()}
                  className="rounded-xl h-11 bg-background pl-9"
                  autoFocus={editing}
                />
              </div>
              {draft.trim() && (
                <button
                  type="button"
                  onClick={handleManualSave}
                  className="px-3 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex-shrink-0"
                >
                  Set
                </button>
              )}
            </div>
          )}

          {!detecting && !permDenied && !useGeo && (
            <button
              type="button"
              onClick={() => handleToggleGeo(true)}
              className="flex items-center gap-1.5 text-xs text-primary font-medium"
            >
              <MapPin className="w-3 h-3" /> Detect my location automatically
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          ⚠️ {error}
        </p>
      )}

      {/* Permission denied helper */}
      {permDenied && (
        <p className="text-[11px] text-muted-foreground bg-muted/60 rounded-lg px-3 py-2">
          To enable auto-detection, allow location access in your browser/device settings, then refresh.
        </p>
      )}
    </div>
  );
}