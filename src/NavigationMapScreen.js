import React, { useState, useEffect, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./NavigationMapScreen.css";
import { WalkCompanionPill } from "./WalkCompanionScreen";
import VoiceFullScreen from "./VoiceFullScreen";
import { getWalkingRoute, geocodePlace } from "./geminiService";
import { useJourneyVoice } from "./useJourneyVoice";
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
export default function NavigationMapScreen({ onGoBack, onSetConstraints, onOpenTimeline, journeyItems = [], startLocation, onJourneyChange }) {
  const initialCenter = startLocation || (journeyItems.length > 0 && journeyItems[0].lat
    ? [journeyItems[0].lat, journeyItems[0].lng]
    : [0, 0]);
  const [userLocation, setUserLocation] = useState(initialCenter);
  const [locateTrigger, setLocateTrigger] = useState(1); // auto-locate on mount
  const [walkingRoute, setWalkingRoute]   = useState(null);
  const [routeInfo, setRouteInfo]         = useState(null);
  const [routeError, setRouteError]       = useState(false);
  const [voiceMode, setVoiceMode]         = useState(null); // null | "full"

  const handleLocate = (pos) => {
    setUserLocation(pos);
  };

  // Build route from user location through all stops
  const stopPositions = journeyItems
    .filter((s) => s.lat && s.lng)
    .map((s) => [s.lat, s.lng]);

  // Apply voice-extracted edit actions to the journey
  const applyActions = useCallback(async ({ adds, removes, reorder }) => {
    if (!onJourneyChange) return;
    let next = [...journeyItems];

    if (removes && removes.length) {
      const normalized = removes.map(r => r.toLowerCase());
      next = next.filter(stop => {
        const stopLc = stop.name.toLowerCase();
        return !normalized.some(r => stopLc.includes(r) || r.includes(stopLc));
      });
    }

    if (adds && adds.length && userLocation) {
      for (const place of adds) {
        const result = await geocodePlace(place.name, userLocation[0], userLocation[1]);
        if (result) {
          next.push({
            id: Date.now() + next.length,
            name: place.name,
            desc: place.desc,
            lat: result.lat,
            lng: result.lng,
          });
        }
      }
    }

    if (reorder && reorder.length) {
      const byName = new Map(next.map(s => [s.name.toLowerCase(), s]));
      const reordered = [];
      for (const name of reorder) {
        const match = byName.get(name.toLowerCase())
          || [...byName.values()].find(s => s.name.toLowerCase().includes(name.toLowerCase()));
        if (match) {
          reordered.push(match);
          byName.delete(match.name.toLowerCase());
        }
      }
      // Append any stops not mentioned in the reorder list at the end
      next = [...reordered, ...byName.values()];
    }

    onJourneyChange(next);
  }, [journeyItems, userLocation, onJourneyChange]);

  const voice = useJourneyVoice({
    userLocation,
    journeyItems,
    mode: "during-walk",
    onApplyActions: applyActions,
  });

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

      {/* ── BOTTOM-RIGHT STACK: Timeline (flag) + Preferences + Locate ── */}
      <div className="bottom-right-stack">
        <button className="fab-circle bottom-right-btn" onClick={onOpenTimeline} aria-label="Timeline">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <polygon points="10,2 22,7 10,12" fill="#8851D4"/>
            <rect x="8" y="2" width="2" height="20" rx="1" fill="#8851D4"/>
            <circle cx="5" cy="20" r="1" fill="#8851D4"/>
            <circle cx="2" cy="17" r="1" fill="#8851D4"/>
          </svg>
        </button>
        <button className="fab-circle bottom-right-btn" onClick={onSetConstraints} aria-label="Preferences">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="4" y1="12" x2="20" y2="12"/>
            <line x1="4" y1="18" x2="20" y2="18"/>
            <circle cx="9"  cy="6"  r="2" fill="#8851D4"/>
            <circle cx="15" cy="12" r="2" fill="#8851D4"/>
            <circle cx="8"  cy="18" r="2" fill="#8851D4"/>
          </svg>
        </button>
        <button className="fab-circle bottom-right-btn" onClick={() => setLocateTrigger((t) => t + 1)} aria-label="Focus on my location">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="2.5" fill="#8851D4" stroke="none"/>
            <circle cx="12" cy="12" r="8"/>
            <line x1="12" y1="2" x2="12" y2="5"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <line x1="2" y1="12" x2="5" y2="12"/>
            <line x1="19" y1="12" x2="22" y2="12"/>
          </svg>
        </button>
      </div>

      {/* ── WALK COMPANION PILL (voice always available during walk) ── */}
      {voiceMode !== "full" && (
        <WalkCompanionPill
          listening={voice.listening}
          locked={voice.locked}
          muted={voice.muted}
          aiSpeaking={voice.aiSpeaking}
          userText={voice.userText}
          aiText={voice.aiText}
          onMuteToggle={voice.onMuteToggle}
          onListenStart={voice.onListenStart}
          onListenEnd={voice.onListenEnd}
          onDragLock={voice.onDragLock}
          onUnlock={voice.onUnlock}
          onExpandVoice={() => setVoiceMode("full")}
        />
      )}

      {/* ── VOICE FULL-SCREEN OVERLAY ── */}
      {voiceMode === "full" && (
        <VoiceFullScreen
          listening={voice.listening}
          locked={voice.locked}
          muted={voice.muted}
          messages={voice.messages}
          onMuteToggle={voice.onMuteToggle}
          onListenStart={voice.onListenStart}
          onListenEnd={voice.onListenEnd}
          onDragLock={voice.onDragLock}
          onUnlock={voice.onUnlock}
          onMinimize={() => setVoiceMode(null)}
        />
      )}

    </>
  );
}
