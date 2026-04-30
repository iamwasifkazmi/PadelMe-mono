import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Link } from "react-router-dom";
import { Users, Clock } from "lucide-react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

export default function MapView({ matches }) {
  const validMatches = matches.filter((m) => m.location_lat && m.location_lng);
  const center = validMatches.length > 0
    ? [validMatches[0].location_lat, validMatches[0].location_lng]
    : [40.4168, -3.7038]; // Default Madrid

  return (
    <div className="rounded-2xl overflow-hidden border border-border h-[60vh]">
      <MapContainer center={center} zoom={12} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validMatches.map((match) => (
          <Marker key={match.id} position={[match.location_lat, match.location_lng]}>
            <Popup>
              <div className="p-1">
                <Link to={`/match/${match.id}`} className="font-semibold text-sm text-primary hover:underline">
                  {match.title}
                </Link>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {match.time}
                </p>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Users className="w-3 h-3" /> {match.players?.length || 1}/{match.max_players}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}