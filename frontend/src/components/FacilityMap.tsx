import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

// Minimal point shape the map needs; both Overview points and Hospitals satisfy it.
export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  good: number; // valid status checks
  state?: string;
  city?: string;
}

// Marker color by the share of status checks that pass for the facility.
function colorFor(good: number, checks: number): string {
  const ratio = checks ? good / checks : 0;
  if (ratio >= 0.85) return "#10b981"; // emerald
  if (ratio >= 0.5) return "#f59e0b"; // amber
  return "#ef4444"; // rose
}

// Refit the viewport whenever the visible points change.
function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  const key = `${points.length}:${points[0]?.id ?? ""}`;
  useEffect(() => {
    if (points.length === 0) return;
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [30, 30], maxZoom: 12 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

export default function FacilityMap({
  points,
  checks,
  height = 460,
  onSelect,
  selectedId,
  fitToPoints = false,
}: {
  points: MapPoint[];
  checks: number;
  height?: number;
  onSelect?: (id: string) => void;
  selectedId?: string;
  fitToPoints?: boolean;
}) {
  return (
    <MapContainer
      center={[22.5, 80]}
      zoom={5}
      minZoom={4}
      maxZoom={14}
      scrollWheelZoom
      style={{ width: "100%", height, borderRadius: "0.5rem", background: "#f5f5f5" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        subdomains={["a", "b", "c", "d"]}
      />
      {fitToPoints && <FitBounds points={points} />}
      {points.map((p) => {
        const isSelected = p.id === selectedId;
        return (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={isSelected ? 8 : 4}
            pathOptions={{
              color: isSelected ? "#1d4ed8" : "#ffffff",
              weight: isSelected ? 2.5 : 1,
              fillColor: colorFor(p.good, checks),
              fillOpacity: isSelected ? 1 : 0.85,
            }}
            eventHandlers={onSelect ? { click: () => onSelect(p.id) } : undefined}
          >
            <Tooltip direction="top" offset={[0, -4]}>
              <div className="text-xs font-medium">{p.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {[p.city, p.state].filter(Boolean).join(", ")} · {p.good}/{checks} checks valid
              </div>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
