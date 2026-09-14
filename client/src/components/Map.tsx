/// <reference types="@types/google.maps" />
import { useEffect, useRef, useState } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global { interface Window { google?: typeof google; } }
const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const FORGE_BASE_URL = import.meta.env.VITE_FRONTEND_FORGE_API_URL || "https://forge.butterfly-effect.dev";
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;
let mapScriptPromise: Promise<void> | null = null;

function loadMapScript() {
  if (window.google?.maps) return Promise.resolve();
  if (mapScriptPromise) return mapScriptPromise;
  mapScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry`;
    script.async = true;
    script.onload = () => window.google?.maps ? resolve() : reject(new Error("Google Maps loaded without the Maps API"));
    script.onerror = () => { mapScriptPromise = null; reject(new Error("Google Maps could not be loaded")); };
    document.head.appendChild(script);
  });
  return mapScriptPromise;
}

interface MapViewProps { className?: string; initialCenter?: google.maps.LatLngLiteral; initialZoom?: number; onMapReady?: (map: google.maps.Map) => void; onMapError?: (error: Error) => void; }
export function MapView({ className, initialCenter = { lat: 20.5937, lng: 78.9629 }, initialZoom = 5, onMapReady, onMapError }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const init = usePersistFn(async () => {
    try {
      await loadMapScript();
      if (!mapContainer.current || !window.google?.maps) throw new Error("Map container is unavailable");
      map.current = new window.google.maps.Map(mapContainer.current, { zoom: initialZoom, center: initialCenter, mapTypeControl: true, fullscreenControl: true, zoomControl: true, streetViewControl: false, mapId: "DEMO_MAP_ID" });
      onMapReady?.(map.current);
      setLoading(false);
    } catch (err) {
      const next = err instanceof Error ? err : new Error("Map could not be initialized");
      setError(next.message); setLoading(false); onMapError?.(next);
    }
  });
  useEffect(() => { void init(); }, [init]);
  if (error) return <div className={cn("map-fallback-shell", className)} role="region" aria-label="Google Maps fallback"><iframe title="Google Maps live location" src={`https://www.google.com/maps?q=${initialCenter.lat},${initialCenter.lng}&z=${initialZoom}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /><div className="map-fallback-note"><strong>Google Maps live view</strong><span>The interactive API could not initialize, so this live Google Maps view is shown instead. Verified centre results remain below.</span></div></div>;
  return <div className={cn("relative w-full h-[500px]", className)}><div ref={mapContainer} className="w-full h-full" />{loading && <div className="map-loading-overlay" role="status">Loading Google Maps…</div>}</div>;
}
