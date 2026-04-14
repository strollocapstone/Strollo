import React, { useState, useEffect, useRef, useCallback } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./NavigationMapScreen.css";
import { ReactComponent as RightSoleSvg } from "./assets/right-sole.svg";
import { ReactComponent as LeftSoleSvg } from "./assets/left-sole.svg";
// Minimized pill widget is shared with LockScreen.js — owned by WalkCompanionScreen.js.
import { MuteSvg, SoundWaveSvg, WalkCompanionPill } from "./WalkCompanionScreen";

// ── Leaflet setup ──────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

const youIcon = L.divIcon({
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

// ── Organic gradient blob markers ──────────────────────────────────────────
const ORGANIC_RADII = [
  "65% 35% 50% 50% / 40% 60% 40% 60%",
  "40% 60% 45% 55% / 55% 45% 60% 40%",
  "55% 45% 60% 40% / 50% 50% 45% 55%",
  "45% 55% 35% 65% / 60% 40% 55% 45%",
  "60% 40% 55% 45% / 35% 65% 50% 50%",
  "50% 50% 40% 60% / 45% 55% 60% 40%",
  "35% 65% 55% 45% / 50% 50% 40% 60%",
];

const makeBlob = (w, h, rot, c1, c2, idx) => L.divIcon({
  className: "",
  html: `<div style="width:${w}px;height:${h}px;border-radius:${ORGANIC_RADII[idx % ORGANIC_RADII.length]};background:radial-gradient(ellipse at 42% 42%,${c1} 0%,${c2} 45%,transparent 70%);transform:rotate(${rot}deg);pointer-events:none;"></div>`,
  iconSize: [w, h],
  iconAnchor: [w / 2, h / 2],
});

// ── Area-of-interest pins (purple) ─────────────────────────────────────────
const NAV_PINS = [
  { pos: [37.7895, -122.4005], w: 120, h:  90, rot:  15 },
  { pos: [37.7850, -122.4090], w: 180, h: 110, rot: -25 },
  { pos: [37.7858, -122.4035], w:  90, h:  70, rot:  40 },
  { pos: [37.7838, -122.4015], w:  70, h:  55, rot: -10 },
  { pos: [37.7880, -122.3980], w: 110, h:  80, rot:  55 },
  { pos: [37.7820, -122.4100], w: 140, h: 100, rot: -35 },
  { pos: [37.7865, -122.3995], w:  80, h:  65, rot:  20 },
  { pos: [37.7900, -122.4025], w: 100, h:  75, rot: -45 },
  { pos: [37.7840, -122.4060], w:  75, h:  55, rot:  30 },
  { pos: [37.7875, -122.4042], w:  60, h:  50, rot: -15 },
];


const YOU = [37.7820, -122.4070];
const MAP_CENTER = [37.7850, -122.4030];

const DEMO_PATH_START = [
  [37.7812, -122.4082],
  [37.7815, -122.4078],
  [37.7817, -122.4074],
  YOU,
];

function LocateMe({ trigger, onLocate }) {
  const map = useMap();
  useEffect(() => {
    if (!trigger) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { const p = [coords.latitude, coords.longitude]; map.flyTo(p, 16, { duration: 1.4 }); onLocate(p); },
      () => { map.flyTo(YOU, 16, { duration: 1.4 }); onLocate(YOU); }
    );
  }, [trigger, map, onLocate]);
  return null;
}

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


// ── Demo conversation history for full screen ─────────────────────────────
const CHAT_HISTORY = [
  { id: 1, role: "ai",   text: "Hey! You're moving — love that energy. What are you feeling today?" },
  { id: 2, role: "user", text: "Something cozy. Maybe a bakery or a hidden garden?" },
  { id: 3, role: "ai",   text: "Perfect. There's a secret courtyard 3 blocks east locals swear by on Sunday mornings." },
  { id: 4, role: "user", text: "That sounds great, add it!" },
  { id: 5, role: "ai",   text: "Done! Tartine is nearby too if you want pastries first. Should I add both?" },
];

// ── Marauder's Map footstep positions (walking up screen with meander) ────
const VFS_STEPS = [
  { x: "calc(50% + 6px)",  y: "88%", rot: -4,  mirror: false },
  { x: "calc(50% - 22px)", y: "81%", rot: -2,  mirror: true },
  { x: "calc(50% + 8px)",  y: "74%", rot: -6,  mirror: false },
  { x: "calc(50% - 18px)", y: "67%", rot: -3,  mirror: true },
  { x: "calc(50% + 12px)", y: "60%", rot: -8,  mirror: false },
  { x: "calc(50% - 16px)", y: "53%", rot: -5,  mirror: true },
  { x: "calc(50% + 10px)", y: "46%", rot: -10, mirror: false },
  { x: "calc(50% - 20px)", y: "39%", rot: -7,  mirror: true },
  { x: "calc(50% + 14px)", y: "32%", rot: -6,  mirror: false },
  { x: "calc(50% - 14px)", y: "25%", rot: -4,  mirror: true },
  { x: "calc(50% + 8px)",  y: "18%", rot: -8,  mirror: false },
  { x: "calc(50% - 18px)", y: "11%", rot: -3,  mirror: true },
];

// ── Voice Full Screen ─────────────────────────────────────────────────────
function VoiceFullScreen({ listening, locked, muted, onMuteToggle, onListenStart, onListenEnd, onDragLock, onUnlock, onMinimize }) {
  const handleStartY = useRef(null);
  const speakStartY = useRef(null);
  const speakDidLock = useRef(false);

  // Handle drag-down to minimize
  const onHandleDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    handleStartY.current = e.clientY;
  }, []);
  const onHandleMove = useCallback((e) => {
    if (handleStartY.current === null) return;
    if (e.clientY - handleStartY.current > 60) {
      handleStartY.current = null;
      onMinimize();
    }
  }, [onMinimize]);
  const onHandleUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    handleStartY.current = null;
  }, []);

  // Speak button
  const onDown = useCallback((e) => {
    if (locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    speakStartY.current = e.clientY;
    speakDidLock.current = false;
    onListenStart();
  }, [locked, onListenStart]);
  const onMove = useCallback((e) => {
    if (speakStartY.current === null || speakDidLock.current) return;
    if (speakStartY.current - e.clientY > 40) { speakDidLock.current = true; onDragLock(); }
  }, [onDragLock]);
  const onUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    speakStartY.current = null;
    if (!speakDidLock.current) onListenEnd();
  }, [onListenEnd]);
  const onTap = useCallback(() => { if (locked) onUnlock(); }, [locked, onUnlock]);

  return (
    <div className="vfs">
      {/* Background gradient */}
      <div className="vfs-gradient" />

      {/* Marauder's Map footstep trail */}
      <div className="vfs-footsteps">
        {VFS_STEPS.map((s, i) => (
          <div key={i} className="vfs-sole"
            style={{ left: s.x, top: s.y, width: 22, height: 28, animationDelay: `${i * 0.8}s`, transform: `rotate(${s.rot}deg)` }}>
            {s.mirror
              ? <LeftSoleSvg width="22" height="28" />
              : <RightSoleSvg width="22" height="28" />
            }
          </div>
        ))}
      </div>

      {/* Drag handle */}
      <div
        className="vfs-handle"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        style={{ touchAction: "none" }}
      >
        <div className="vfs-handle-bar" />
      </div>

      {/* Chat history */}
      <div className="vfs-chat">
        {CHAT_HISTORY.map((msg) => (
          <div key={msg.id} className={`wcb wcb--${msg.role}`}>
            <div className={`wcb-bubble vfs-bubble vfs-bubble--${msg.role}`}>
              <p className="wcb-text">{msg.text}</p>
              <div className={`wcb-tail vfs-tail--${msg.role === "ai" ? "left" : "right"}`} />
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="vfs-controls">
        <button className={`wc-btn wc-btn--lg wc-mute-btn ${muted ? "wc-muted" : ""}`} onClick={onMuteToggle} aria-label="Mute AI">
          <MuteSvg muted={muted} />
        </button>
        <button
          className={`wc-btn wc-btn--lg wc-speak-btn ${listening ? "wc-listening" : ""} ${locked ? "wc-locked" : ""}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onClick={onTap}
          style={{ touchAction: "none" }}
          aria-label="Speak"
        >
          {locked && <div className="wc-pulse-ring" />}
          {locked && <div className="wc-lock-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFD501"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="#FFD501" strokeWidth="2"/></svg>
          </div>}
          <SoundWaveSvg active={listening} />
        </button>
      </div>
    </div>
  );
}

// ── Journey Overlay ────────────────────────────────────────────────────────
function JourneyOverlay({ items, onClose, onGoBack }) {
  const defaultItems = items.length
    ? items
    : [{ id: 0, name: "Sightglass Coffee", desc: "SoMa · Coffee" }];
  const [stops, setStops] = useState(defaultItems);

  const removeStop = (id) => setStops((s) => s.filter((x) => x.id !== id));

  return (
    <div className="journey-overlay">
      <div className="handle-bar" style={{ margin: "0 auto 16px" }} />
      <h3 className="journey-title">Your journey</h3>

      <div className="journey-stops">
        {stops.map((stop, i) => (
          <React.Fragment key={stop.id}>
            {i > 0 && (
              <div className="add-between">
                <div className="add-between-line" />
                <button className="add-between-btn">+ Add stop</button>
                <div className="add-between-line" />
              </div>
            )}
            <div className="journey-stop">
              <div className="stop-dot" />
              <div className="stop-info">
                <span className="stop-name">{stop.name}</span>
                <span className="stop-desc">{stop.desc}</span>
              </div>
              <button className="stop-remove" onClick={() => removeStop(stop.id)} aria-label="Remove">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
              </button>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="journey-actions">
        <button className="journey-btn journey-btn--pause" onClick={onClose}>Pause walk</button>
        <button className="journey-btn journey-btn--end" onClick={onGoBack}>End walk</button>
      </div>
    </div>
  );
}

// ── NavigationMapScreen ────────────────────────────────────────────────────
export default function NavigationMapScreen({ onGoBack, journeyItems = [] }) {
  const [userLocation, setUserLocation] = useState(YOU);
  const [locateTrigger, setLocateTrigger] = useState(0);
  const [pathHistory, setPathHistory]     = useState(DEMO_PATH_START);
  const [voiceMode, setVoiceMode]         = useState(null); // null | 'full'
  const [muted, setMuted]                 = useState(false);
  const [listening, setListening]         = useState(false);
  const [locked, setLocked]              = useState(false);
  const [journeyOpen, setJourneyOpen]     = useState(false);

  // Demo transcript state
  const demoUserText = listening ? "Something cozy, maybe a bakery?" : "";
  const demoAiSpeaking = !listening && (locked || muted);
  const demoAiText = muted ? "There's a courtyard 3 blocks east…" : "";

  const handleLocate = (pos) => {
    setUserLocation(pos);
    setPathHistory((prev) => [...prev, pos]);
  };

  // Build ahead route: user → stop1 → stop2 → ...
  const stopPositions = journeyItems
    .filter((s) => s.lat && s.lng)
    .map((s) => [s.lat, s.lng]);
  const aheadRoute = stopPositions.length
    ? [userLocation, ...stopPositions]
    : [];

  return (
    <div className="phone-frame">

      {/* ── MAP ── */}
      <div className="map-wrapper">
        <MapContainer center={MAP_CENTER} zoom={15} zoomControl={false} attributionControl={false} className="map-container">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" maxZoom={19} />
          {/* Purple area-of-interest blobs (10-15% opacity) */}
          {NAV_PINS.map((pin, i) => (
            <Marker key={`p${i}`} position={pin.pos}
              icon={makeBlob(pin.w, pin.h, pin.rot, "rgba(136,81,212,0.15)", "rgba(136,81,212,0.06)", i)}
            />
          ))}
          {/* Walked trail — dashed dots, lower opacity */}
          <Polyline positions={pathHistory} pathOptions={{ color: "rgba(136,81,212,0.28)", weight: 4, dashArray: "6 10", lineCap: "round" }} />
          {/* Ahead route — solid line, more opaque */}
          {aheadRoute.length > 1 && (
            <Polyline positions={aheadRoute} pathOptions={{ color: "rgba(136,81,212,0.55)", weight: 3, dashArray: null, lineCap: "round" }} />
          )}
          {/* Journey stop pins — intermediate use label, last uses destination pin */}
          {(() => {
            const valid = journeyItems.filter((s) => s.lat && s.lng);
            const intermediate = valid.slice(0, -1);
            const last = valid.length ? valid[valid.length - 1] : null;
            return (
              <>
                {intermediate.map((s) => (
                  <Marker key={`stop-${s.id}`} position={[s.lat, s.lng]} icon={stopLabelIcon(s.name)} />
                ))}
                {last && (
                  <Marker key={`dest-${last.id}`} position={[last.lat, last.lng]} icon={destinationIcon} />
                )}
              </>
            );
          })()}
          <Marker position={userLocation} icon={youIcon} />
          <LocateMe trigger={locateTrigger} onLocate={handleLocate} />
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

      {/* ── RIGHT-SIDE BUTTONS (flag + locate, stacked) ── */}
      <div className="nav-right-stack">
        {/* Flag — opens journey edit overlay */}
        <button className="locate-fixed" onClick={() => setJourneyOpen(true)} aria-label="Edit journey">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#8851D4">
            <polygon points="6,2 20,8 6,14"/>
            <rect x="4" y="2" width="2" height="18" rx="1"/>
          </svg>
        </button>
        {/* Locate */}
        <button className="locate-fixed" onClick={() => setLocateTrigger((t) => t + 1)} aria-label="Locate me">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#8851D4">
            <circle cx="12" cy="12" r="3.5"/>
            <rect x="11" y="2" width="2" height="4" rx="1"/>
            <rect x="11" y="18" width="2" height="4" rx="1"/>
            <rect x="2" y="11" width="4" height="2" rx="1"/>
            <rect x="18" y="11" width="4" height="2" rx="1"/>
          </svg>
        </button>
      </div>

      {/* ── JOURNEY OVERLAY ── */}
      {journeyOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setJourneyOpen(false)} />
          <JourneyOverlay items={journeyItems} onClose={() => setJourneyOpen(false)} onGoBack={onGoBack} />
        </>
      )}

      {/* ── WALK COMPANION PILL (always visible) ── */}
      {voiceMode !== "full" && (
        <WalkCompanionPill
          listening={listening}
          locked={locked}
          muted={muted}
          aiSpeaking={demoAiSpeaking}
          userText={demoUserText}
          aiText={demoAiText}
          onMuteToggle={() => setMuted((m) => !m)}
          onListenStart={() => setListening(true)}
          onListenEnd={() => setListening(false)}
          onDragLock={() => setLocked(true)}
          onUnlock={() => { setLocked(false); setListening(false); }}
          onExpandVoice={() => setVoiceMode("full")}
        />
      )}

      {/* ── VOICE FULL-SCREEN OVERLAY ── */}
      {voiceMode === "full" && (
        <VoiceFullScreen
          listening={listening}
          locked={locked}
          muted={muted}
          onMuteToggle={() => setMuted((m) => !m)}
          onListenStart={() => setListening(true)}
          onListenEnd={() => setListening(false)}
          onDragLock={() => setLocked(true)}
          onUnlock={() => { setLocked(false); setListening(false); }}
          onMinimize={() => setVoiceMode(null)}
        />
      )}

    </div>
  );
}
