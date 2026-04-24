import React, { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

// ── Leaflet setup (call once per bundle) ──────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

// ── User position marker (Marauder's Map boots) ──────────────────────────
export const youIcon = L.divIcon({
  className: "",
  html: `<div class="marauder-marker">
    <svg class="foot foot--left" width="18" height="30" viewBox="0 0 28 46" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 2 C5 2 3 5 3 10 L3 32 C3 38 5 44 10 44 L17 44 C20 44 22 42 23 38 L24 32 C24 28 22 26 19 26 L18 26 L18 10 C18 5 16 2 13 2 Z" fill="#1E1541"/>
      <line x1="6" y1="14" x2="17" y2="14" stroke="#fff" stroke-width="1.5" opacity="0.5"/>
      <line x1="6" y1="19" x2="17" y2="19" stroke="#fff" stroke-width="1.5" opacity="0.5"/>
    </svg>
    <svg class="foot foot--right" width="18" height="30" viewBox="0 0 28 46" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 2 C23 2 25 5 25 10 L25 32 C25 38 23 44 18 44 L11 44 C8 44 6 42 5 38 L4 32 C4 28 6 26 9 26 L10 26 L10 10 C10 5 12 2 15 2 Z" fill="#1E1541"/>
      <line x1="11" y1="14" x2="22" y2="14" stroke="#fff" stroke-width="1.5" opacity="0.5"/>
      <line x1="11" y1="19" x2="22" y2="19" stroke="#fff" stroke-width="1.5" opacity="0.5"/>
    </svg>
  </div>`,
  iconSize: [42, 32],
  iconAnchor: [21, 32],
});

// ── Fallback location if GPS is unavailable (UC Berkeley, Sproul Plaza) ──
export const MOCK_LOCATION = [37.8691, -122.2596];

// ── Watch user location (with 10m threshold to avoid waggle) ─────────────
export function WatchLocation({ onUpdate }) {
  const onUpdateRef = useRef(onUpdate);
  const lastPos = useRef(null);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (lastPos.current) {
          const dlat = Math.abs(coords.latitude - lastPos.current[0]);
          const dlng = Math.abs(coords.longitude - lastPos.current[1]);
          if (dlat < 0.0001 && dlng < 0.0001) return;
        }
        const pos = [coords.latitude, coords.longitude];
        lastPos.current = pos;
        onUpdateRef.current(pos);
      },
      (err) => { console.warn("[Strollo] Geolocation watch error:", err.message); },
      { enableHighAccuracy: false, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return null;
}

// ── Locate user (instant on first call, animated on subsequent) ──────────
// The caller passes the screen's default zoom so pressing "locate" always returns
// to that screen's baseline (HomeScreen = 15, NavigationMapScreen used 16 before).
export function LocateMe({ trigger, onLocate, onError, zoom = 16 }) {
  const map = useMap();
  const onLocateRef = useRef(onLocate);
  const onErrorRef = useRef(onError);
  const isFirstLocate = useRef(true);
  onLocateRef.current = onLocate;
  if (onError) onErrorRef.current = onError;

  useEffect(() => {
    if (!trigger) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (cancelled) return;
        const pos = [coords.latitude, coords.longitude];
        try {
          if (isFirstLocate.current) {
            map.setView(pos, zoom);
            isFirstLocate.current = false;
          } else {
            // Always fly to user at the default zoom — animates even if we're already there
            map.flyTo(pos, zoom, { duration: 0.9 });
          }
        } catch (_) { /* map may be unmounted */ }
        onLocateRef.current(pos);
      },
      (err) => {
        if (cancelled) return;
        if (onErrorRef.current) {
          if (err.code === 1) {
            onErrorRef.current("Location permission denied. Please enable it in your browser settings.");
          } else {
            onErrorRef.current("Unable to get your location. Please try again.");
          }
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5000 }
    );
    return () => { cancelled = true; };
  }, [trigger, map]);
  return null;
}

// ── Track user position on screen (for gradient overlay) ─────────────────
export function TrackUserPosition({ userPos, onScreenPos }) {
  const map = useMap();
  useEffect(() => {
    const update = () => {
      const pt = map.latLngToContainerPoint(L.latLng(userPos[0], userPos[1]));
      onScreenPos({ x: pt.x, y: pt.y });
    };
    update();
    map.on("move zoom moveend", update);
    return () => map.off("move zoom moveend", update);
  }, [map, userPos, onScreenPos]);
  return null;
}

// ── Listen for map background clicks (empty area, not markers) ───────────
export function MapClickListener({ onClick }) {
  const map = useMap();
  useEffect(() => {
    map.on("click", onClick);
    return () => map.off("click", onClick);
  }, [map, onClick]);
  return null;
}

// ── Listen for map drag ──────────────────────────────────────────────────
export function MapDragListener({ onDrag }) {
  const map = useMap();
  useEffect(() => {
    map.on("dragstart", onDrag);
    return () => map.off("dragstart", onDrag);
  }, [map, onDrag]);
  return null;
}

// ── Track map zoom level (fires on zoomend) ──────────────────────────────
export function ZoomTracker({ onZoom }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onZoom(map.getZoom());
    handler();
    map.on("zoomend", handler);
    return () => map.off("zoomend", handler);
  }, [map, onZoom]);
  return null;
}

// ── Track map center (fires on moveend: drag, zoom, flyTo) ───────────────
export function MapCenterTracker({ onCenterChange }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => {
      const c = map.getCenter();
      onCenterChange([c.lat, c.lng]);
    };
    handler();
    map.on("moveend", handler);
    return () => map.off("moveend", handler);
  }, [map, onCenterChange]);
  return null;
}

// ── Distance helpers ─────────────────────────────────────────────────────
const EARTH_RADIUS_KM = 6371;

export function haversineKm(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

export const WALKING_RADIUS_KM = 3;

export function isWithinWalkingRadius(origin, point, radiusKm = WALKING_RADIUS_KM) {
  if (!origin || !point) return false;
  const [oLat, oLng] = origin;
  const pLat = point.lat ?? point[0];
  const pLng = point.lng ?? point[1];
  if (oLat == null || oLng == null || pLat == null || pLng == null) return false;
  return haversineKm([oLat, oLng], [pLat, pLng]) <= radiusKm;
}

// ── Fit map bounds to a set of points ────────────────────────────────────
export function FitBounds({ points }) {
  const map = useMap();
  const fitted = React.useRef(false);
  useEffect(() => {
    if (fitted.current || points.length < 2) return;
    fitted.current = true;
    const bounds = L.latLngBounds(points.map(p => L.latLng(p[0], p[1])));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15, animate: true });
  }, [points, map]);
  return null;
}
