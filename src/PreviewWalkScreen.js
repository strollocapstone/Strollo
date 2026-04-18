import React, { useState, useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import PreWalkConstraintsScreen from "./PreWalkConstraintsScreen";
import "./PreviewWalkScreen.css";

const WALK_PREFS = [
  { icon: "schedule", label: "1 hr" },
  { icon: "straighten", label: "2.5 mi" },
  { label: "Wheelchair" },
  { label: "Avoidances (1)" },
];

const PREFS_COUNT = 4;

const CURRENT_LOCATION = {
  id: "current-location",
  name: "Current Location",
  address: "Your starting point",
  lat: 37.7820,
  lng: -122.4070,
  image: null,
};

// ── Map icons (same as NavigationMapScreen) ──────────────────────────────
const stopLabelIcon = (name) => L.divIcon({
  className: "",
  html: `<div class="nav-stop-pin">
    <div class="nav-stop-dot"></div>
    <span class="nav-stop-name">${name}</span>
  </div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

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

// ── FitBounds helper ─────────────────────────────────────────────────────
function FitBounds({ stops }) {
  const map = useMap();
  useEffect(() => {
    const valid = stops.filter((s) => s.lat && s.lng);
    if (valid.length === 0) return;
    const bounds = L.latLngBounds(valid.map((s) => [s.lat, s.lng]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, stops]);
  return null;
}

export default function PreviewWalkScreen({ journeyItems, onGoBack, onStartWalk }) {
  const [stops, setStops] = useState([CURRENT_LOCATION, ...journeyItems]);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const dragIdx = useRef(null);
  const dragOverIdx = useRef(null);
  const sheetStartY = useRef(null);

  const onDragStart = (idx) => { dragIdx.current = idx; };
  const onDragEnter = (idx) => { dragOverIdx.current = idx; };
  const onDragEnd = () => {
    if (dragIdx.current === null || dragOverIdx.current === null || dragIdx.current === dragOverIdx.current) {
      dragIdx.current = null;
      dragOverIdx.current = null;
      return;
    }
    const next = [...stops];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(dragOverIdx.current, 0, moved);
    setStops(next);
    dragIdx.current = null;
    dragOverIdx.current = null;
  };

  const handleStart = () => {
    onStartWalk(stops);
  };

  // Route positions for map polyline
  const routePositions = stops.filter((s) => s.lat && s.lng).map((s) => [s.lat, s.lng]);
  const validStops = stops.filter((s) => s.lat && s.lng);
  const intermediateStops = validStops.slice(0, -1);
  const lastStop = validStops.length ? validStops[validStops.length - 1] : null;

  return (
    <div className="pw-screen">

      {/* Header */}
      <div className="pw-header">
        <button className="pw-back" onClick={onGoBack} aria-label="Go back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34233E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <h1 className="pw-title">Your walk</h1>
      </div>

      <p className="pw-caption">
        Start planning your route. If you're not sure where to stop, you'll be able to add more stops later
      </p>

      {/* Preference pills */}
      <div className="pw-prefs">
        <button className="pw-pref-pill pw-pref-pill--count" onClick={() => setPrefsOpen(true)}>
          <span className="material-symbols-rounded pw-pref-icon">tune</span>
          ({PREFS_COUNT})
        </button>
        {WALK_PREFS.map((pref) => (
          <span className="pw-pref-pill" key={pref.label}>
            {pref.icon && <span className="material-symbols-rounded pw-pref-icon">{pref.icon}</span>}
            {pref.label}
          </span>
        ))}
      </div>

      {/* Search bar */}
      <div className="pw-search-row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          className="pw-search-input"
          placeholder="Add stops"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Timeline */}
      {stops.length > 0 && (
        <div className="pw-timeline">

          {stops.map((stop, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === stops.length - 1;
            return (
            <React.Fragment key={stop.id}>

              {/* Walk time between stops */}
              {idx > 0 && (
                <div className="pw-row pw-row--segment">
                  <div className="pw-rail-cell" />
                  <div className="pw-content-cell">
                    <span className="pw-walk-label">~7 min walk</span>
                  </div>
                </div>
              )}

              {/* Stop card */}
              <div className={`pw-row pw-row--card${isFirst ? " pw-row--first" : ""}${isLast ? " pw-row--last" : ""}`}>
                <div className="pw-rail-cell">
                  <div className={`pw-dot${isFirst ? " pw-dot--start" : ""}${isLast && !isFirst ? " pw-dot--end" : ""}`} />
                </div>
                <div className="pw-content-cell">
                  <div
                    className="pw-card"
                    draggable
                    onDragStart={() => onDragStart(idx)}
                    onDragEnter={() => onDragEnter(idx)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <div className="pw-drag-handle" aria-label="Drag to reorder">
                      <svg width="16" height="20" viewBox="0 0 16 20" fill="#5A4B64">
                        <circle cx="4" cy="4" r="2" />
                        <circle cx="12" cy="4" r="2" />
                        <circle cx="4" cy="10" r="2" />
                        <circle cx="12" cy="10" r="2" />
                        <circle cx="4" cy="16" r="2" />
                        <circle cx="12" cy="16" r="2" />
                      </svg>
                    </div>
                    <div className="pw-card-body">
                      <span className="pw-card-name">{stop.name}</span>
                      <span className="pw-card-address">{stop.address || stop.desc}</span>
                    </div>
                    <div className="pw-card-thumb">
                      {stop.image
                        ? <img src={stop.image} alt={stop.name} />
                        : <div className="pw-thumb-placeholder" />
                      }
                    </div>
                  </div>
                </div>
              </div>

            </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Map button */}
      {stops.length > 0 && routePositions.length > 0 && (
        <div className="pw-map-btn-row">
          <button className="pw-map-btn" onClick={() => setMapOpen(true)}>
            Map
            <span className="material-symbols-rounded" style={{ fontSize: 18 }}>map</span>
          </button>
        </div>
      )}

      {/* Empty state */}
      {stops.length === 0 && (
        <div className="pw-empty">
          <p>No stops yet. Go back to add some places.</p>
        </div>
      )}

      {/* Footer */}
      <div className="pw-footer">
        <p className="pw-footer-hint">You can always adjust during your walk</p>
        <button
          className="pw-start-btn"
          disabled={stops.length === 0}
          onClick={handleStart}
        >
          Start Walk
        </button>
      </div>

      {/* ── Map overlay ── */}
      {mapOpen && (
        <div className="pw-map-overlay">
          <button className="pw-map-close" onClick={() => setMapOpen(false)} aria-label="Close map">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34233E" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <MapContainer center={[37.785, -122.403]} zoom={15} zoomControl={false} attributionControl={false} className="pw-map-container">
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" maxZoom={19} />
            {routePositions.length > 1 && (
              <Polyline positions={routePositions} pathOptions={{ color: "rgba(136,81,212,0.55)", weight: 3, lineCap: "round" }} />
            )}
            {intermediateStops.map((s) => (
              <Marker key={`stop-${s.id}`} position={[s.lat, s.lng]} icon={stopLabelIcon(s.name)} />
            ))}
            {lastStop && (
              <Marker key={`dest-${lastStop.id}`} position={[lastStop.lat, lastStop.lng]} icon={destinationIcon} />
            )}
            <FitBounds stops={stops} />
          </MapContainer>
        </div>
      )}

      {/* ── Preferences bottom sheet ── */}
      {prefsOpen && (
        <>
          <div className="pw-sheet-backdrop" onClick={() => setPrefsOpen(false)} />
          <div className="pw-sheet">
            <div
              className="pw-sheet-handle"
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); sheetStartY.current = e.clientY; }}
              onPointerMove={(e) => {
                if (sheetStartY.current !== null && e.clientY - sheetStartY.current > 80) {
                  sheetStartY.current = null;
                  setPrefsOpen(false);
                }
              }}
              onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); sheetStartY.current = null; }}
              style={{ touchAction: "none" }}
            >
              <div className="pw-sheet-bar" />
            </div>
            <PreWalkConstraintsScreen
              onGoBack={() => setPrefsOpen(false)}
              onStartWalk={() => setPrefsOpen(false)}
              embedded
            />
          </div>
        </>
      )}

    </div>
  );
}
