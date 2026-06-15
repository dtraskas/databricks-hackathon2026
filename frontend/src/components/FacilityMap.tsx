import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { FacilityPoint } from "@/lib/api";

// Marker color by the share of status checks that pass for the facility.
function colorFor(good: number, checks: number): string {
  const ratio = checks ? good / checks : 0;
  if (ratio >= 0.85) return "#10b981"; // emerald
  if (ratio >= 0.5) return "#f59e0b"; // amber
  return "#ef4444"; // rose
}

export default function FacilityMap({
  points,
  checks,
  height = 460,
}: {
  points: FacilityPoint[];
  checks: number;
  height?: number;
}) {
  return (
    <MapContainer
      center={[22.5, 80]}
      zoom={5}
      minZoom={4}
      maxZoom={12}
      scrollWheelZoom
      style={{ width: "100%", height, borderRadius: "0.5rem", background: "#f5f5f5" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
      />
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={4}
          pathOptions={{
            color: "#ffffff",
            weight: 1,
            fillColor: colorFor(p.good, checks),
            fillOpacity: 0.85,
          }}
        >
          <Tooltip direction="top" offset={[0, -4]}>
            <div className="text-xs font-medium">{p.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {p.state} · {p.good}/{checks} checks valid
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
