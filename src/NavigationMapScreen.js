import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./NavigationMapScreen.css";
import JourneyEditScreen from "./JourneyEditScreen";
import { getWalkingRoute } from "./geminiService";
import { youIcon, WatchLocation, LocateMe, FitBounds } from "./mapUtils";

// ── Stop label icon for journey locations on map ──────────────────────────
const stopLabelIcon = (name) => L.divIcon({
  className: "",
  html: `<div class="nav-stop-pin">
    <div class="nav-stop-dot"></div>
    <span class="nav-stop-name">${name}</span>
  </div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

// ── Final destination pin (purple teardrop with accent dot) ───────────────
const destinationIcon = L.divIcon({
  className: "",
  html: `<div class="dest-pin-wrap">
    <svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 29 C11 29 2 18 2 10 A9 9 0 1 1 20 10 C20 18 11 29 11 29Z" fill="#8851D4"/>
      <circle cx="11" cy="10" r="3.5" fill="#FFD501"/>
    </svg>
  </div>`,
  iconSize: [22, 30],
  iconAnchor: [11, 30],
});




// ── NavigationMapScreen ────────────────────────────────────────────────────
export default function NavigationMapScreen({ onGoBack, journeyItems = [], startLocation }) {
  const initialCenter = startLocation || (journeyItems.length > 0 && journeyItems[0].lat
    ? [journeyItems[0].lat, journeyItems[0].lng]
    : [0, 0]);
  const [userLocation, setUserLocation] = useState(initialCenter);
  const [locateTrigger, setLocateTrigger] = useState(1); // auto-locate on mount
  const [journeyOpen, setJourneyOpen]     = useState(false);
  const [walkingRoute, setWalkingRoute]   = useState(null);
  const [routeInfo, setRouteInfo]         = useState(null);
  const [routeError, setRouteError]       = useState(false);

  const handleLocate = (pos) => {
    setUserLocation(pos);
  };

  // Build route from user location through all stops
  const stopPositions = journeyItems
    .filter((s) => s.lat && s.lng)
    .map((s) => [s.lat, s.lng]);

  // Fetch walking route from user location through stops
  const routeFetchedFor = React.useRef(null);
  useEffect(() => {
    if (!userLocation || stopPositions.length < 1) return;
    // Only re-fetch if user moved significantly (~200m) from last route origin
    if (routeFetchedFor.current) {
      const [prevLat, prevLng] = routeFetchedFor.current;
      const dlat = Math.abs(userLocation[0] - prevLat);
      const dlng = Math.abs(userLocation[1] - prevLng);
      if (dlat < 0.002 && dlng < 0.002) return;
    }
    routeFetchedFor.current = userLocation;
    const waypoints = [userLocation, ...stopPositions];
    getWalkingRoute(waypoints).then((result) => {
      if (result) {
        setWalkingRoute(result.coordinates);
        setRouteInfo({ distance: result.distance, duration: result.duration });
      }
    }).catch(err => { console.warn("Route fetch failed:", err); setRouteError(true); });
  }, [userLocation, stopPositions]);

  return (
    <>

      {/* ── MAP ── */}
      <div className="map-wrapper">
        <MapContainer center={initialCenter} zoom={14} zoomControl={false} attributionControl={false} className="map-container">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" maxZoom={19} />

          {/* Walking route along streets (from OSRM) */}
          {walkingRoute && (
            <Polyline positions={walkingRoute} pathOptions={{ color: "#8851D4", weight: 3, opacity: 0.5, lineCap: "round", lineJoin: "round" }} />
          )}
          {/* Fallback dashed line while route loads */}
          {!walkingRoute && stopPositions.length > 0 && (
            <Polyline positions={[userLocation, ...stopPositions]} pathOptions={{ color: "#8851D4", weight: 2, opacity: 0.3, dashArray: "6 8", lineCap: "round" }} />
          )}

          {/* Journey stop pins with labels */}
          {journeyItems.filter((s) => s.lat && s.lng).map((s, i, arr) => (
            <Marker
              key={`stop-${s.id}`}
              position={[s.lat, s.lng]}
              icon={i === arr.length - 1 ? destinationIcon : stopLabelIcon(s.name)}
            />
          ))}

          {/* User position */}
          <Marker position={userLocation} icon={youIcon} />
          <LocateMe trigger={locateTrigger} onLocate={handleLocate} />
          <WatchLocation onUpdate={setUserLocation} />

          {/* Fit map to show user + all stops */}
          {stopPositions.length > 0 && (
            <FitBounds points={[userLocation, ...stopPositions]} />
          )}
        </MapContainer>
      </div>

      {/* ── TOP BAR ── */}
      <div className="nav-top-bar">
        <button className="back-btn" onClick={onGoBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E1541" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>
        <span className="app-name">strollo</span>
        <div style={{ width: 36 }} />
      </div>

      {/* ── JOURNEY STOPS BAR ── */}
      {journeyItems.length > 0 && (
        <div className="nav-stops-bar">
          <div className="nav-stops-list">
            {journeyItems.map((s, i) => (
              <span key={s.id} className="nav-stop-chip">
                {i > 0 && <span className="nav-stop-arrow">→</span>}
                {s.name.split(',')[0]}
              </span>
            ))}
          </div>
          {routeInfo && (
            <div className="nav-route-info">
              <span>{Math.round(routeInfo.distance / 1000 * 10) / 10} km</span>
              <span>·</span>
              <span>{Math.round(routeInfo.duration / 60)} min walk</span>
            </div>
          )}
          {routeError && !routeInfo && (
            <div className="nav-route-info" style={{ color: '#999' }}>
              <span>Route unavailable — follow the pins</span>
            </div>
          )}
        </div>
      )}

      {/* ── MAP ACTION BUTTONS (matching HomeScreen style) ── */}
      <div className="nav-actions">
        <button className="map-action-btn" onClick={() => setJourneyOpen(true)} aria-label="Edit journey">
          <svg width="14" height="16" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6,2 20,8 6,14"/>
            <rect x="4" y="2" width="2" height="18" rx="1"/>
          </svg>
          <span>Journey</span>
        </button>
        <button className="locate-circle" onClick={() => setLocateTrigger((t) => t + 1)} aria-label="Locate me">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
        </button>
      </div>

      {/* ── JOURNEY OVERLAY ── */}
      {journeyOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setJourneyOpen(false)} />
          <JourneyEditScreen items={journeyItems} onClose={() => setJourneyOpen(false)} onGoBack={onGoBack} />
        </>
      )}




    </>
  );
}
