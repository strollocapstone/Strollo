import React, { useState, useEffect, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./NavigationMapScreen.css";
import WalkCompanionWidget from "./WalkCompanionWidget";
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

// ── Organic area-of-interest blob markers (atmospheric, behind route) ─────
const ORGANIC_RADII = [
  "65% 35% 50% 50% / 40% 60% 40% 60%",
  "40% 60% 45% 55% / 55% 45% 60% 40%",
  "55% 45% 60% 40% / 50% 50% 45% 55%",
  "45% 55% 35% 65% / 60% 40% 55% 45%",
  "60% 40% 55% 45% / 35% 65% 50% 50%",
  "50% 50% 40% 60% / 45% 55% 60% 40%",
  "35% 65% 55% 45% / 50% 50% 40% 60%",
];

const makeBlob = (w, h, rot, idx) => L.divIcon({
  className: "",
  html: `<div style="width:${w}px;height:${h}px;border-radius:${ORGANIC_RADII[idx % ORGANIC_RADII.length]};background:radial-gradient(ellipse at 42% 42%,rgba(136,81,212,0.15) 0%,rgba(136,81,212,0.06) 45%,transparent 70%);transform:rotate(${rot}deg);pointer-events:none;"></div>`,
  iconSize: [w, h],
  iconAnchor: [w / 2, h / 2],
});

// Scatter pattern — applied relative to a center lat/lng.
const BLOB_OFFSETS = [
  { dLat:  0.0045, dLng:  0.0025, w: 120, h:  90, rot:  15 },
  { dLat: -0.0010, dLng: -0.0060, w: 180, h: 110, rot: -25 },
  { dLat:  0.0008, dLng: -0.0005, w:  90, h:  70, rot:  40 },
  { dLat: -0.0012, dLng:  0.0015, w:  70, h:  55, rot: -10 },
  { dLat:  0.0030, dLng:  0.0050, w: 110, h:  80, rot:  55 },
  { dLat: -0.0030, dLng: -0.0070, w: 140, h: 100, rot: -35 },
  { dLat:  0.0015, dLng:  0.0035, w:  80, h:  65, rot:  20 },
  { dLat:  0.0050, dLng:  0.0005, w: 100, h:  75, rot: -45 },
  { dLat: -0.0010, dLng: -0.0030, w:  75, h:  55, rot:  30 },
  { dLat:  0.0025, dLng: -0.0012, w:  60, h:  50, rot: -15 },
];

// ── Journey edit overlay ──────────────────────────────────────────────────
function JourneyOverlay({ items, onRemove, onClose, onEndWalk }) {
  return (
    <div className="journey-overlay">
      <div className="handle-bar" style={{ margin: "0 auto 16px" }} />
      <h3 className="journey-title">Your journey</h3>

      <div className="journey-stops">
        {items.length === 0 && (
          <p style={{ fontSize: 13, color: "#888", margin: 0 }}>No stops added yet.</p>
        )}
        {items.map((stop, i) => (
          <React.Fragment key={stop.id}>
            {i > 0 && (
              <div className="add-between">
                <div className="add-between-line" />
                <button className="add-between-btn" disabled>+ Add stop</button>
                <div className="add-between-line" />
              </div>
            )}
            <div className="journey-stop">
              <div className="stop-dot" />
              <div className="stop-info">
                <span className="stop-name">{stop.name}</span>
                <span className="stop-desc">{stop.desc}</span>
              </div>
              {onRemove && (
                <button className="stop-remove" onClick={() => onRemove(stop.id)} aria-label="Remove stop">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                </button>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="journey-actions">
        <button className="journey-btn journey-btn--pause" onClick={onClose}>Pause walk</button>
        <button className="journey-btn journey-btn--end" onClick={onEndWalk}>End walk</button>
      </div>
    </div>
  );
}

// ── NavigationMapScreen ────────────────────────────────────────────────────
export default function NavigationMapScreen({ onGoBack, onSetConstraints, onOpenTimeline, journeyItems = [], startLocation, onJourneyChange, vibePreferences, showVoice = true }) {
  const initialCenter = startLocation || (journeyItems.length > 0 && journeyItems[0].lat
    ? [journeyItems[0].lat, journeyItems[0].lng]
    : [0, 0]);
  const [userLocation, setUserLocation] = useState(initialCenter);
  const [locateTrigger, setLocateTrigger] = useState(1); // auto-locate on mount
  const [walkingRoute, setWalkingRoute]   = useState(null);
  const [routeInfo, setRouteInfo]         = useState(null);
  const [voiceMode, setVoiceMode]         = useState(null); // null | "full"
  const [journeyOpen, setJourneyOpen]     = useState(false);
  const [pathHistory, setPathHistory]     = useState([]);

  // Track the walked trail as user location updates.
  useEffect(() => {
    if (!userLocation) return;
    setPathHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last && Math.abs(last[0] - userLocation[0]) < 1e-5 && Math.abs(last[1] - userLocation[1]) < 1e-5) {
        return prev;
      }
      return [...prev, userLocation].slice(-200);
    });
  }, [userLocation]);

  // Atmospheric blob markers pinned around the initial center (once).
  const blobs = useMemo(() => {
    const [lat, lng] = initialCenter;
    if (!lat || !lng) return [];
    return BLOB_OFFSETS.map((b, i) => ({
      pos: [lat + b.dLat, lng + b.dLng],
      w: b.w, h: b.h, rot: b.rot, idx: i,
    }));
    // initialCenter is computed on every render but its value only changes when
    // startLocation/journeyItems change; memo guards against churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCenter[0], initialCenter[1]]);

  const handleLocate = (pos) => {
    setUserLocation(pos);
  };

  const handleRemoveStop = (id) => {
    if (!onJourneyChange) return;
    onJourneyChange(journeyItems.filter((s) => s.id !== id));
  };

  const handleEndWalk = () => {
    setJourneyOpen(false);
    if (onOpenTimeline) onOpenTimeline();
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
    vibePreferences,
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
    }).catch(err => { console.warn("Route fetch failed:", err); });
  }, [userLocation, stopPositions]);

  return (
    <>

      {/* ── MAP ── */}
      <div className="map-wrapper">
        <MapContainer center={initialCenter} zoom={14} zoomControl={false} attributionControl={false} className="map-container">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" maxZoom={19} />

          {/* Atmospheric purple area-of-interest blobs */}
          {blobs.map((b, i) => (
            <Marker key={`blob-${i}`} position={b.pos} icon={makeBlob(b.w, b.h, b.rot, b.idx)} />
          ))}

          {/* Walked trail — dashed dots behind the user */}
          {pathHistory.length > 1 && (
            <Polyline positions={pathHistory} pathOptions={{ color: "rgba(136,81,212,0.50)", weight: 4, dashArray: "6 10", lineCap: "round" }} />
          )}

          {/* Walking route along streets (from OSRM) */}
          {walkingRoute && (
            <Polyline positions={walkingRoute} pathOptions={{ color: "#8851D4", weight: 6, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />
          )}
          {/* Fallback dashed line while route loads */}
          {!walkingRoute && stopPositions.length > 0 && (
            <Polyline positions={[userLocation, ...stopPositions]} pathOptions={{ color: "#8851D4", weight: 5, opacity: 0.75, dashArray: "6 8", lineCap: "round" }} />
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

      {/* ── TOP BAR (hidden while companion widget owns the top; back is
           reachable via the journey flag in the bottom-right stack) ── */}
      {!showVoice && (
        <div className="nav-top-bar">
          <button className="back-btn" onClick={onGoBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E1541" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div style={{ flex: 1 }} />
          <div style={{ width: 36 }} />
        </div>
      )}

      {/* ── BOTTOM-RIGHT STACK: Edit journey (flag) + Preferences + Locate ── */}
      <div className="bottom-right-stack">
        <button className="fab-circle bottom-right-btn" onClick={() => setJourneyOpen(true)} aria-label="Edit journey">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <polygon points="10,2 22,7 10,12" fill="#8851D4"/>
            <rect x="8" y="2" width="2" height="20" rx="1" fill="#8851D4"/>
            <circle cx="5" cy="20" r="1" fill="#8851D4"/>
            <circle cx="2" cy="17" r="1" fill="#8851D4"/>
          </svg>
        </button>
        <button className="fab-circle bottom-right-btn" onClick={onSetConstraints} aria-label="Preferences">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="4" y1="12" x2="20" y2="12"/>
            <line x1="4" y1="18" x2="20" y2="18"/>
            <circle cx="9"  cy="6"  r="2" fill="#8851D4"/>
            <circle cx="15" cy="12" r="2" fill="#8851D4"/>
            <circle cx="8"  cy="18" r="2" fill="#8851D4"/>
          </svg>
        </button>
        <button className="fab-circle bottom-right-btn" onClick={() => setLocateTrigger((t) => t + 1)} aria-label="Focus on my location">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="2.5" fill="#8851D4" stroke="none"/>
            <circle cx="12" cy="12" r="8"/>
            <line x1="12" y1="2" x2="12" y2="5"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
            <line x1="2" y1="12" x2="5" y2="12"/>
            <line x1="19" y1="12" x2="22" y2="12"/>
          </svg>
        </button>
      </div>

      {/* ── WALK COMPANION WIDGET (top-pinned, voice + nav context) ── */}
      {showVoice && voiceMode !== "full" && (() => {
        const nextStop = journeyItems.find((s) => s.lat && s.lng);
        const nextWaypoint = nextStop ? nextStop.name.split(",")[0] : "your next stop";
        // Live route values when available, static placeholders otherwise.
        const distance = routeInfo
          ? routeInfo.distance < 1000
            ? `${Math.round(routeInfo.distance)} m`
            : `${(routeInfo.distance / 1000).toFixed(1)} km`
          : "—";
        const etaMin = routeInfo ? Math.max(1, Math.round(routeInfo.duration / 60)) : null;
        const eta = etaMin !== null ? `${etaMin} min` : "—";
        const proximity = routeInfo && routeInfo.distance < 80 ? "near" : "far";
        return (
          <WalkCompanionWidget
            nextWaypoint={nextWaypoint}
            distance={distance}
            turn="right"
            eta={eta}
            proximity={proximity}
            listening={voice.listening}
            locked={voice.locked}
            muted={voice.muted}
            onMuteToggle={voice.onMuteToggle}
            onListenStart={voice.onListenStart}
            onListenEnd={voice.onListenEnd}
            onDragLock={voice.onDragLock}
            onUnlock={voice.onUnlock}
            onExpandVoice={() => setVoiceMode("full")}
          />
        );
      })()}

      {/* ── JOURNEY EDIT OVERLAY (flag opens this inline sheet) ── */}
      {journeyOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setJourneyOpen(false)} />
          <JourneyOverlay
            items={journeyItems}
            onRemove={handleRemoveStop}
            onClose={() => setJourneyOpen(false)}
            onEndWalk={handleEndWalk}
          />
        </>
      )}

      {/* ── VOICE FULL-SCREEN OVERLAY ── */}
      {showVoice && voiceMode === "full" && (
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
