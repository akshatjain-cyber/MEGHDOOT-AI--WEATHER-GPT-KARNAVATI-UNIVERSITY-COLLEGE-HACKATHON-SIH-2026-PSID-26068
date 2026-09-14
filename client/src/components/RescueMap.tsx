/// <reference types="@types/google.maps" />
import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";
import { useEffect, useMemo, useRef, useState } from "react";
import { Cross, Hospital, MapPin, Navigation, Phone, Search, ShieldCheck, Waves } from "lucide-react";

type RescueMapProps = { latitude: number; longitude: number; locationLabel: string };
type RescueKind = "shelter" | "hospital" | "relief" | "refugee";
type RescuePlace = { id: number; name: string; address: string; latitude: number; longitude: number; distanceKm: number; source?: string | null; phone?: string | null; kind: RescueKind; directionsUrl: string };
const FENCE_OPTIONS = [10, 25, 50, 100];
function kindLabel(kind: RescueKind) { return kind === "hospital" ? "Hospital" : kind === "refugee" ? "Refugee centre" : kind === "shelter" ? "Shelter" : "Emergency facility"; }
function kindIcon(kind: RescueKind) { if (kind === "hospital") return <Hospital className="h-4 w-4" />; if (kind === "refugee") return <Waves className="h-4 w-4" />; if (kind === "shelter") return <ShieldCheck className="h-4 w-4" />; return <Cross className="h-4 w-4" />; }

export default function RescueMap({ latitude, longitude, locationLabel }: RescueMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const fenceRef = useRef<google.maps.Circle[]>([]);
  const [places, setPlaces] = useState<RescuePlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [areaSummary, setAreaSummary] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [fenceKm, setFenceKm] = useState(25);
  const rescueInput = useMemo(() => ({ latitude, longitude, radiusKm: fenceKm }), [latitude, longitude, fenceKm]);
  const rescueQuery = trpc.rescue.nearby.useQuery(rescueInput, { enabled: false, retry: false });
  const areaWeatherQuery = trpc.weather.current.useQuery({ latitude: selectedPoint?.lat ?? latitude, longitude: selectedPoint?.lng ?? longitude, location: "Selected map area" }, { enabled: false, retry: false });

  function clearMarkers() { markersRef.current.forEach(marker => { marker.map = null; }); markersRef.current = []; }
  function drawGeofence() {
    if (!mapRef.current || !window.google?.maps || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    fenceRef.current.forEach(circle => circle.setMap(null));
    const center = { lat: latitude, lng: longitude };
    fenceRef.current = [
      new window.google.maps.Circle({ map: mapRef.current, center, radius: fenceKm * 1000, fillColor: "#dc2626", fillOpacity: 0.08, strokeColor: "#ef4444", strokeOpacity: 0.82, strokeWeight: 2 }),
      new window.google.maps.Circle({ map: mapRef.current, center, radius: fenceKm * 0.66 * 1000, fillColor: "#16a34a", fillOpacity: 0.04, strokeColor: "#4ade80", strokeOpacity: 0.44, strokeWeight: 1 }),
      new window.google.maps.Circle({ map: mapRef.current, center, radius: fenceKm * 0.33 * 1000, fillColor: "#16a34a", fillOpacity: 0.08, strokeColor: "#86efac", strokeOpacity: 0.5, strokeWeight: 1 }),
    ];
  }
  function drawMarkers(nextPlaces: RescuePlace[]) {
    if (!mapRef.current || !window.google?.maps?.marker) return;
    clearMarkers();
    const userPin = document.createElement("div"); userPin.className = "rescue-user-marker"; userPin.title = "Your detected location";
    markersRef.current.push(new window.google.maps.marker.AdvancedMarkerElement({ map: mapRef.current, position: { lat: latitude, lng: longitude }, title: "Your detected location", content: userPin }));
    nextPlaces.forEach(place => {
      const pin = document.createElement("div"); pin.className = `rescue-marker rescue-marker-${place.kind}`; pin.title = `${place.name} · ${place.distanceKm} km`;
      const marker = new window.google.maps.marker.AdvancedMarkerElement({ map: mapRef.current!, position: { lat: place.latitude, lng: place.longitude }, title: place.name, content: pin });
      marker.addListener("click", () => { const safeName = place.name.replace(/</g, "&lt;").replace(/>/g, "&gt;"); const info = new window.google.maps.InfoWindow({ content: `<strong>${safeName}</strong><br>${kindLabel(place.kind)} · ${place.distanceKm} km away<br><a href="${place.directionsUrl}" target="_blank" rel="noreferrer">Start navigation</a>` }); info.open({ map: mapRef.current!, anchor: marker }); });
      markersRef.current.push(marker);
    });
  }
  useEffect(() => { if (!mapRef.current || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return; mapRef.current.setCenter({ lat: latitude, lng: longitude }); drawGeofence(); drawMarkers(places); }, [latitude, longitude, fenceKm, places]);
  async function searchNearby() {
    setSearching(true); setSearchError(null);
    try { const result = await rescueQuery.refetch(); if (result.error) throw result.error; const next = (result.data ?? []) as RescuePlace[]; setPlaces(next); drawMarkers(next); if (!next.length) setSearchError(`No mapped verified facility was returned inside the ${fenceKm} km operating radius. Try a wider radius or check the district disaster-management directory.`); }
    catch (error) { setSearchError(error instanceof Error ? error.message : "The verified centre search timed out. Please retry."); }
    finally { setSearching(false); }
  }
  async function analyzeSelectedArea() {
    if (!selectedPoint) return;
    setAnalyzing(true); setAreaSummary(null);
    try { const result = await areaWeatherQuery.refetch(); const data = result.data?.data as any; const current = data?.current; const daily = data?.daily; const rain = daily?.precipitation_probability_max?.[0] ?? 0; const code = current?.weather_code ?? 0; const risk = rain >= 70 || code >= 95 ? "High" : rain >= 40 || code >= 80 ? "Moderate" : "Low"; setAreaSummary(`Selected point · ${Math.round(current?.temperature_2m ?? 0)}°C · ${rain}% rain probability · ${Math.round(current?.wind_speed_10m ?? 0)} km/h wind · ${risk} rain risk. Follow official warnings before entering the area.`); }
    catch { setAreaSummary("This selected region could not be analyzed before the timeout. Choose another point or retry."); }
    finally { setAnalyzing(false); }
  }
  const insideFenceCount = places.filter(place => place.distanceKm <= fenceKm).length;
  return <div className="rescue-map-shell">
    <div className="rescue-command-head"><div><span className="panel-kicker">India relief network · live map layer</span><h2>Rescue areas near your location</h2><p>Use the geofence to scan mapped hospitals, shelters, emergency facilities, and refugee centres around your detected position.</p></div><div className="rescue-command-actions"><button className="secondary-button" onClick={analyzeSelectedArea} disabled={!selectedPoint || analyzing}>{analyzing ? "Analyzing…" : "Analyze selected point"}</button><button className="primary-button" onClick={searchNearby} disabled={searching}>{searching ? "Scanning network…" : <><Search className="h-4 w-4" /> Scan nearby areas</>}</button></div></div>
    <div className="geofence-strip"><div className="geofence-orbit"><span /><span /><span /></div><div className="geofence-copy"><span className="panel-kicker">Active geofence</span><b>{fenceKm} km response radius</b><small>{insideFenceCount} mapped facilities currently inside the fence</small></div><div className="geofence-controls"><span>Radius</span>{FENCE_OPTIONS.map(value => <button key={value} className={fenceKm === value ? "geofence-active" : ""} onClick={() => setFenceKm(value)}>{value} km</button>)}</div></div>
    <div className="rescue-map"><MapView initialCenter={{ lat: latitude || 20.5937, lng: longitude || 78.9629 }} initialZoom={latitude ? 10 : 5} onMapReady={map => { mapRef.current = map; map.addListener("click", (event: google.maps.MapMouseEvent) => { if (event.latLng) setSelectedPoint({ lat: event.latLng.lat(), lng: event.latLng.lng() }); }); setMapError(null); drawGeofence(); drawMarkers(places); }} onMapError={error => setMapError(error.message)} /></div>
    {mapError && <div className="map-error-inline" role="alert">{mapError} Facility results and navigation links remain available below.</div>}
    <div className="map-note"><Navigation className="h-4 w-4" /><span>Fence origin: <b>{locationLabel}</b></span><span className="map-note-right"><span className="legend-dot legend-user" /> You <span className="legend-dot legend-rescue" /> Rescue area <span className="legend-dot legend-alert" /> Fence edge</span></div>
    {areaSummary && <div className="area-analysis"><ShieldCheck className="h-4 w-4" /><span>{areaSummary}</span></div>}
    {searchError && <div className="map-error-inline" role="alert">{searchError}</div>}
    <div className="rescue-list-heading"><div><span className="panel-kicker">Mapped facilities · sorted by distance</span><h3>Nearby rescue areas</h3></div><small>Always verify availability before travel</small></div>
    <div className="rescue-list">{places.length === 0 ? <div className="rescue-empty"><MapPin className="h-5 w-5" /><div><b>{searching ? "Scanning the expanded radius…" : "No scan run yet"}</b><small>Results come from mapped OpenStreetMap / Overpass facilities. This list does not imply live bed or camp availability.</small></div></div> : places.map(place => <div className="rescue-place" key={`${place.id}-${place.latitude}`}><button className="rescue-place-main" onClick={() => { mapRef.current?.panTo({ lat: place.latitude, lng: place.longitude }); mapRef.current?.setZoom(15); }}><span className={`rescue-kind rescue-kind-${place.kind}`}>{kindIcon(place.kind)}</span><span><b>{place.name}</b><small>{place.address}</small><small>{place.distanceKm} km away · {kindLabel(place.kind)} · {place.source ?? "Mapped source"}</small></span></button><a className="rescue-nav" href={place.directionsUrl} target="_blank" rel="noreferrer"><Navigation className="h-3.5 w-3.5" /> Navigate</a></div>)}</div>
    <div className="rescue-data-note"><ShieldCheck className="h-4 w-4" /><div><b>Verified map data, not a live shelter roster</b><small>Meghdoot surfaces mapped facilities across India, but refugee-centre capacity, opening hours, and emergency intake can change quickly. Confirm with district authorities before moving.</small></div></div>
    <div className="official-contacts"><div className="panel-heading"><div><span className="panel-kicker">Official emergency contacts</span><h2>Help when minutes matter</h2></div><Phone className="h-4 w-4 text-emerald-300" /></div><div className="contacts-grid"><a href="tel:112"><b>112</b><small>Unified emergency response</small></a><a href="tel:101"><b>101</b><small>Fire and rescue</small></a><a href="tel:108"><b>108</b><small>Emergency ambulance</small></a><a href="tel:1098"><b>1098</b><small>Child helpline</small></a></div><small className="contacts-source">Verify state-specific services through the official <a href="https://112.gov.in/" target="_blank" rel="noreferrer">ERSS 112 portal</a>. Numbers are not AI-generated.</small></div>
  </div>;
}
