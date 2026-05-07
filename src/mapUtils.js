// FEATURE: shared-util  (multi — phase 3 splits)
// LAST UPDATED BY: Seemin Masood
// UPDATE DATE: 2026-05-07
// BUILD: cda47b3
// DEPENDS ON: react-leaflet, leaflet
// CONSUMED BY: ./HomeScreen, ./NavigationMapScreen, ./strollowConversation (reverseGeocode)
//
// Currently mixes: Leaflet helper components (WatchLocation, LocateMe, FlyTo,
// TrackUserPosition, MapDragListener, MapCenterTracker, ZoomTracker,
// MapClickListener), Leaflet icons (youIcon), pure geo math (haversineKm,
// isWithinWalkingRadius, MOCK_LOCATION, WALKING_RADIUS_KM), and Nominatim
// reverse geocoding. PHASE 3 splits into utils/leafletHelpers, utils/geoMath,
// utils/icons, services/geocoding (reverseGeocode).

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

// Defensive monkey-patch for Leaflet's drag start handler.
// Leaflet internally calls `getSizedParentNode(first.target)` on mousedown
// and dereferences `.offsetWidth` without checking that the parent chain is
// still attached. When a marker icon's DOM is swapped or removed in the
// same tick as a click (a real race during React re-renders), the chain
// has a `null` somewhere and the call throws:
//   "Cannot read properties of null (reading 'offsetWidth')".
// Patching `L.DomUtil.getSizedParentNode` doesn't help because Leaflet's
// Draggable imports the helper via module scope — the binding we'd
// override isn't the one the handler invokes. So wrap the handler itself
// in a try/catch and bail silently on the (harmless) crash.
if (L.Draggable && L.Draggable.prototype && L.Draggable.prototype._onDown) {
  const origOnDown = L.Draggable.prototype._onDown;
  L.Draggable.prototype._onDown = function safeOnDown(e) {
    try {
      return origOnDown.call(this, e);
    } catch (err) {
      if (err && /offsetWidth|offsetHeight/.test(String(err.message || err))) {
        // Detached parent chain — ignore so the drag attempt is just a no-op.
        // Reset the dragging guard so subsequent mousedowns aren't blocked.
        if (L.Draggable._dragging === this) L.Draggable._dragging = false;
        return;
      }
      throw err;
    }
  };
}

// ── User position marker (Marauder's Map boots) ──────────────────────────
const MARAUDER_MARKER_HTML = `<div class="marauder-marker">
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
  </div>`;

// Default: boots stand UP from the lat/lng (anchor at bottom-center).
export const youIcon = L.divIcon({
  className: "",
  html: MARAUDER_MARKER_HTML,
  iconSize: [42, 32],
  iconAnchor: [21, 32],
});

// "Below" variant: boots HANG below the lat/lng (anchor at top-center,
// pushed down 8px so the purple route-dot at the lat/lng stays clear).
// Used when the user is near a confirmed stop so the boots never sit
// on top of the stop's pill / purple dot.
export const youIconBelow = L.divIcon({
  className: "",
  html: MARAUDER_MARKER_HTML,
  iconSize: [42, 32],
  iconAnchor: [21, -8],
});

// ── Fallback location if GPS is unavailable (UC Berkeley, Sproul Plaza) ──
export const MOCK_LOCATION = [37.8691, -122.2596];

// ── IP-based geolocation fallback ────────────────────────────────────────
// Free public endpoint (CORS-enabled, HTTPS, ~1k req/day per IP). Returns
// a [lat, lng] that's usually accurate to the user's city — much closer
// than MOCK_LOCATION when CoreLocation/GPS are unavailable. Resolves to
// null on any failure (network, parse, missing fields, abort, timeout).
let __ipLocationPromise = null;
export function fetchIpLocation(timeoutMs = 6000) {
  if (__ipLocationPromise) return __ipLocationPromise;
  __ipLocationPromise = (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch("https://ipapi.co/json/", { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return null;
      const data = await res.json();
      const lat = Number(data?.latitude);
      const lng = Number(data?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return null;
      return [lat, lng];
    } catch (_) {
      return null;
    }
  })();
  return __ipLocationPromise;
}

// ── Watch user location (with 10m threshold to avoid waggle) ─────────────
export function WatchLocation({ onUpdate }) {
  const onUpdateRef = useRef(onUpdate);
  const lastPos = useRef(null);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    const handleSuccess = ({ coords }) => {
      // Drop bogus (0, 0) updates — see LocateMe note above.
      if (Math.abs(coords.latitude) < 1e-6 && Math.abs(coords.longitude) < 1e-6) return;
      if (lastPos.current) {
        const dlat = Math.abs(coords.latitude - lastPos.current[0]);
        const dlng = Math.abs(coords.longitude - lastPos.current[1]);
        if (dlat < 0.0001 && dlng < 0.0001) return;
      }
      const pos = [coords.latitude, coords.longitude];
      lastPos.current = pos;
      onUpdateRef.current(pos);
    };

    // Try GPS first; if the device can't get a fix (desktop without GPS,
    // CoreLocation kCLErrorLocationUnknown), fall back to a low-accuracy
    // watch using Wi-Fi/IP. City-level beats no boots at all.
    let activeId = navigator.geolocation.watchPosition(
      handleSuccess,
      (err) => {
        console.warn("[Strollo] Geolocation watch error:", err.message);
        if (err.code === 1) return; // permission denied — don't keep retrying
        navigator.geolocation.clearWatch(activeId);
        activeId = navigator.geolocation.watchPosition(
          handleSuccess,
          (e2) => { console.warn("[Strollo] Geolocation watch error (low-accuracy fallback):", e2.message); },
          { enableHighAccuracy: false, maximumAge: 30000 }
        );
      },
      { enableHighAccuracy: true, maximumAge: 2000 }
    );
    return () => navigator.geolocation.clearWatch(activeId);
  }, []);
  return null;
}

// ── Fly to an arbitrary map point (used by archived pill clicks) ─────────
// `bottomOffset` (px) pushes the centering point down by half its value so
// the target appears at the visible map center when a bottom sheet covers
// part of the map.
export function FlyTo({ target, zoom = 16, bottomOffset = 0 }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    try {
      if (bottomOffset > 0) {
        const px = map.project([target.lat, target.lng], zoom).add([0, bottomOffset / 2]);
        map.flyTo(map.unproject(px, zoom), zoom, { duration: 0.9 });
      } else {
        map.flyTo([target.lat, target.lng], zoom, { duration: 0.9 });
      }
    } catch (_) {}
  }, [target, map, zoom, bottomOffset]);
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

    const onSuccess = ({ coords }) => {
      if (cancelled) return;
      // Drop the (0, 0) sentinel some browsers return when they don't have
      // a real fix — keeps the boots from rendering in the Atlantic.
      if (Math.abs(coords.latitude) < 1e-6 && Math.abs(coords.longitude) < 1e-6) return;
      const pos = [coords.latitude, coords.longitude];
      try {
        if (isFirstLocate.current) {
          map.setView(pos, zoom);
          isFirstLocate.current = false;
        } else {
          // Leaflet's flyTo to the same lat/lng + zoom is silently a no-op,
          // which makes the focus FAB feel broken when the user is already
          // centered. If we're already there, do a brief zoom-out → zoom-in
          // pulse so the click always reads as a re-center.
          const center = map.getCenter();
          const sameSpot = Math.abs(center.lat - pos[0]) < 5e-5 &&
                           Math.abs(center.lng - pos[1]) < 5e-5 &&
                           Math.abs(map.getZoom() - zoom) < 0.1;
          if (sameSpot) {
            map.setZoom(Math.max(0, zoom - 1.2), { animate: true });
            setTimeout(() => {
              try { map.flyTo(pos, zoom, { duration: 0.55 }); } catch (_) {}
            }, 320);
          } else {
            map.flyTo(pos, zoom, { duration: 0.9 });
          }
        }
      } catch (_) { /* map may be unmounted */ }
      onLocateRef.current(pos);
    };

    // Try high-accuracy GPS first. If the device can't get a GPS fix
    // (kCLErrorLocationUnknown / TIMEOUT / POSITION_UNAVAILABLE — common on
    // desktops without GPS or with macOS Location Services warming up),
    // fall back to low-accuracy Wi-Fi/IP-based geolocation. City-level
    // precision is better than no boots at all.
    const fallbackToIp = async (priorErr) => {
      if (cancelled) return;
      const ipPos = await fetchIpLocation();
      if (cancelled) return;
      if (ipPos) {
        console.warn("[Strollo] Geolocation: using IP-based fallback", ipPos);
        onSuccess({ coords: { latitude: ipPos[0], longitude: ipPos[1] } });
        return;
      }
      console.warn("[Strollo] Geolocation: IP fallback failed, using MOCK_LOCATION (initial:", priorErr?.code, priorErr?.message, ")");
      onSuccess({ coords: { latitude: MOCK_LOCATION[0], longitude: MOCK_LOCATION[1] } });
    };

    const tryLowAccuracy = (highAccErr) => {
      if (cancelled) return;
      navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => {
          if (cancelled) return;
          fallbackToIp(err);
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
      );
    };

    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        if (cancelled) return;
        // Permission denied: surface the card so the user can re-grant.
        // Other errors (POSITION_UNAVAILABLE, TIMEOUT, kCLErrorLocationUnknown)
        // → low-accuracy → IP fallback → MOCK_LOCATION, all silent.
        if (err.code === 1) {
          console.warn("[Strollo] Geolocation error:", err.code, err.message);
          if (onErrorRef.current) {
            onErrorRef.current("Location permission denied. Please enable it in your browser settings.");
          }
          return;
        }
        tryLowAccuracy(err);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 }
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

// ── Reverse geocode (free OpenStreetMap Nominatim — no API key) ──────────
// Resolves a lat/lng to a short, human-readable place name (e.g. "Sproul
// Plaza", "Telegraph Avenue", "Berkeley"). Returns null on any failure.
// Note: Nominatim's usage policy asks callers to send max 1 req/sec — the
// caller should debounce and cache by rounded coords.
export async function reverseGeocode(lat, lng) {
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address || {};
    // Prefer specific landmarks/businesses, then fall back to roads,
    // neighborhoods, then administrative areas.
    const candidate =
      data.name ||
      a.attraction ||
      a.tourism ||
      a.shop ||
      a.amenity ||
      a.leisure ||
      a.building ||
      a.road ||
      a.neighbourhood ||
      a.suburb ||
      a.city_district ||
      a.city ||
      a.town ||
      a.village ||
      (data.display_name ? data.display_name.split(",")[0] : null);
    return candidate ? candidate.toString().trim() : null;
  } catch (e) {
    console.warn("reverseGeocode failed:", e);
    return null;
  }
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
