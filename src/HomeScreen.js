import React, { useState, useEffect, useCallback, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./HomeScreen.css";
import { ReactComponent as RightSoleSvg } from "./assets/right-sole.svg";
import { ReactComponent as LeftSoleSvg } from "./assets/left-sole.svg";

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

const suggestionLabelIcon = (name, emoji, added) => L.divIcon({
  className: "",
  html: `<div class="sugg-label-pin${added ? " sugg-label-pin--added" : ""}">
    <div class="sugg-label-ic">${emoji}</div>
    <span class="sugg-label-nm">${name}</span>
  </div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

// ── Data ───────────────────────────────────────────────────────────────────
const YOU = [37.7820, -122.4070];
const MAP_CENTER = [37.7850, -122.4030];

const SUGGESTIONS = [
  { id: 1, name: "Tartine Bakery",       desc: "Mission · Bakery",    lat: 37.7814, lng: -122.4041, icon: "🥐" },
  { id: 2, name: "Dolores Park",         desc: "Mission · Park",      lat: 37.7836, lng: -122.4072, icon: "🌿" },
  { id: 3, name: "Bi-Rite Creamery",     desc: "Mission · Ice Cream", lat: 37.7812, lng: -122.4049, icon: "🍦" },
  { id: 4, name: "Clarion Alley Murals", desc: "Mission · Art",       lat: 37.7830, lng: -122.4224, icon: "🎨" },
  { id: 5, name: "Mission Dolores",      desc: "Mission · Historic",  lat: 37.7849, lng: -122.4270, icon: "⛪" },
];

const RECENT = [
  { id: 6, name: "Sightglass Coffee",  desc: "SoMa · Coffee"              },
  { id: 7, name: "The Painted Ladies", desc: "Alamo Square · Landmark"    },
  { id: 8, name: "Ferry Building",     desc: "Embarcadero · Market"       },
];

// ── Inner components ───────────────────────────────────────────────────────
function TrackUserPosition({ userPos, onScreenPos }) {
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

function LocateMe({ trigger, onLocate }) {
  const map = useMap();
  useEffect(() => {
    if (!trigger) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const pos = [coords.latitude, coords.longitude];
        map.flyTo(pos, 16, { duration: 1.4 });
        onLocate(pos);
      },
      () => { map.flyTo(YOU, 16, { duration: 1.4 }); onLocate(YOU); }
    );
  }, [trigger, map, onLocate]);
  return null;
}

// ── Swipe row ──────────────────────────────────────────────────────────────
const SWIPE_MAX = 80;
const SWIPE_THRESHOLD = 55;

function SwipeRow({ item, added, onAdd, onFave, onRemove }) {
  const startX = useRef(null);
  const [dx, setDx] = useState(0);
  const [settled, setSettled] = useState(false); // true when action triggered

  const start = (e) => {
    startX.current = e.touches?.[0]?.clientX ?? e.clientX;
    setSettled(false);
  };
  const move = (e) => {
    if (startX.current === null) return;
    const x = e.touches?.[0]?.clientX ?? e.clientX;
    setDx(Math.max(-SWIPE_MAX, Math.min(SWIPE_MAX, x - startX.current)));
  };
  const end = () => {
    if (dx > SWIPE_THRESHOLD) { onFave(item.id); setSettled(true); }
    else if (dx < -SWIPE_THRESHOLD) { onRemove(item.id); setSettled(true); }
    startX.current = null;
    setDx(0);
  };

  return (
    <div className="swipe-wrapper">
      {/* Revealed actions */}
      <div className="swipe-action swipe-action--fave">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFD501"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z"/></svg>
      </div>
      <div className="swipe-action swipe-action--remove">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      </div>

      {/* Item */}
      <div
        className="suggestion-item"
        style={{ transform: `translateX(${dx}px)`, transition: settled || dx === 0 ? 'transform 0.25s' : 'none' }}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        onMouseDown={start} onMouseMove={move} onMouseUp={end}
      >
        <div className="suggestion-text">
          <span className="suggestion-name">{item.name}</span>
          <span className="suggestion-desc">{item.desc}</span>
        </div>
        <button className={`add-btn ${added ? "added" : ""}`} onClick={() => onAdd(item.id)}>
          {added ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 0C7 0 3 4 3 9c0 6.5 9 15 9 15s9-8.5 9-15c0-5-4-9-9-9z" fill="#8851D4" opacity="0.9"/>
              <line x1="12" y1="6" x2="12" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="9" y1="9" x2="15" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="rgba(136,81,212,0.1)"/>
              <line x1="12" y1="7" x2="12" y2="17" stroke="#8851D4" strokeWidth="2" strokeLinecap="round"/>
              <line x1="7" y1="12" x2="17" y2="12" stroke="#8851D4" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Mute icon ─────────────────────────────────────────────────────────────
function MuteSvg({ muted }) {
  const color = muted ? "#FF9900" : "white";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      {muted
        ? <><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>
        : <><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></>
      }
    </svg>
  );
}

// ── Chat bubble for widget ────────────────────────────────────────────────
function WidgetBubble({ listening, aiSpeaking, muted, userText, aiText }) {
  if (listening && userText) {
    return (
      <div className="wcb wcb--user" key="user">
        <div className="wcb-bubble wcb-bubble--user">
          <p className="wcb-text">{userText}</p>
          <div className="wcb-tail wcb-tail--right" />
        </div>
      </div>
    );
  }
  if (aiSpeaking) {
    return (
      <div className="wcb wcb--ai" key="ai">
        <div className="wcb-bubble wcb-bubble--ai">
          {!muted && !aiText ? (
            <div className="wcb-typing"><div className="wcb-dot" /><div className="wcb-dot" /><div className="wcb-dot" /></div>
          ) : (
            <p className="wcb-text">{aiText}</p>
          )}
          <div className="wcb-tail wcb-tail--left" />
        </div>
      </div>
    );
  }
  return null;
}

// ── Marauder's Map footstep positions ──────────────────────────────────────
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

// ── Demo conversation history ─────────────────────────────────────────────
const CHAT_HISTORY = [
  { id: 1, role: "ai",   text: "Hey! You're moving — love that energy. What are you feeling today?" },
  { id: 2, role: "user", text: "Something cozy. Maybe a bakery or a hidden garden?" },
  { id: 3, role: "ai",   text: "Perfect. There's a secret courtyard 3 blocks east locals swear by on Sunday mornings." },
  { id: 4, role: "user", text: "That sounds great, add it!" },
  { id: 5, role: "ai",   text: "Done! Tartine is nearby too if you want pastries first. Should I add both?" },
];

// ── Sound wave icon (matches Walk Companion pill) ─────────────────────────
function SoundWaveSvg({ active }) {
  const color = active ? "#FFFFFF" : "rgba(225,177,255,0.70)";
  const cls = active ? "sw-bar sw-bar--active" : "sw-bar";
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" fill={color}>
      <rect className={cls} x="1"  y="6"  width="3" height="6"  rx="1.5" style={{ animationDelay: "0s" }} />
      <rect className={cls} x="5.5" y="3"  width="3" height="12" rx="1.5" style={{ animationDelay: "0.15s" }} />
      <rect className={cls} x="10" y="0"  width="3" height="18" rx="1.5" style={{ animationDelay: "0.3s" }} />
      <rect className={cls} x="14.5" y="3"  width="3" height="12" rx="1.5" style={{ animationDelay: "0.15s" }} />
      <rect className={cls} x="19" y="6"  width="3" height="6"  rx="1.5" style={{ animationDelay: "0s" }} />
    </svg>
  );
}

// ── HomeScreen ─────────────────────────────────────────────────────────────
export default function HomeScreen({ onStartWalk }) {
  const [userLocation, setUserLocation]   = useState(YOU);
  const [locateTrigger, setLocateTrigger] = useState(0);
  const [userScreenPos, setUserScreenPos] = useState({ x: 187, y: 406 });
  const [sheetOpen, setSheetOpen]         = useState(false);
  const [activeTab, setActiveTab]         = useState("suggested");
  const [addedIds, setAddedIds]           = useState(new Set());
  const [favedIds, setFavedIds]           = useState(new Set());
  const [hiddenIds, setHiddenIds]         = useState(new Set());
  const [voiceActive, setVoiceActive]     = useState(false);
  const [listening, setListening]         = useState(false);
  const [locked, setLocked]              = useState(false);
  const [muted, setMuted]                = useState(false);
  const [voiceExpanded, setVoiceExpanded] = useState(false);
  const [query, setQuery]                 = useState("");

  const onScreenPos  = useCallback((pos) => setUserScreenPos(pos), []);
  const handleAdd    = (id) => setAddedIds((p) => new Set([...p, id]));
  const handleFave   = (id) => setFavedIds((p) => new Set([...p, id]));
  const handleRemove = (id) => setHiddenIds((p) => new Set([...p, id]));

  const dragStartY = useRef(null);
  const homeStartY = useRef(null);
  const homeDidLock = useRef(false);
  const homeHandleY = useRef(null);
  const onDragStart = (e) => { dragStartY.current = e.touches?.[0]?.clientY ?? e.clientY; };
  const onDragEnd   = (e) => {
    if (dragStartY.current === null) return;
    const endY = e.changedTouches?.[0]?.clientY ?? e.clientY;
    if (dragStartY.current - endY > 20) setSheetOpen(true);
    else if (endY - dragStartY.current > 20) setSheetOpen(false);
    dragStartY.current = null;
  };

  const handleStartWalk = () => {
    const items = SUGGESTIONS.filter((s) => addedIds.has(s.id));
    onStartWalk(items.length ? items : [{ id: 0, name: "Sightglass Coffee", desc: "SoMa · Coffee" }]);
  };

  const toggleVoice = () => {
    if (voiceActive) {
      setTimeout(() => { setVoiceActive(false); }, 320);
    } else {
      setSheetOpen(false);
      setVoiceActive(true);
    }
  };

  const { x, y } = userScreenPos;

  const allItems = activeTab === "suggested"
    ? SUGGESTIONS.filter((s) => !hiddenIds.has(s.id))
    : activeTab === "recent"
      ? RECENT.filter((s) => !hiddenIds.has(s.id))
      : SUGGESTIONS.filter((s) => favedIds.has(s.id));

  return (
    <div className="phone-frame">

      {/* ── MAP ── */}
      <div className="map-perspective-wrapper">
        <MapContainer center={MAP_CENTER} zoom={15} zoomControl={false} attributionControl={false} className="map-container">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" maxZoom={19} />
          {sheetOpen && SUGGESTIONS.filter((s) => !hiddenIds.has(s.id)).map((s) => (
            <Marker key={s.id} position={[s.lat, s.lng]}
              icon={suggestionLabelIcon(s.name, s.icon, addedIds.has(s.id))} />
          ))}
          <Marker position={userLocation} icon={youIcon} />
          <TrackUserPosition userPos={userLocation} onScreenPos={onScreenPos} />
          <LocateMe trigger={locateTrigger} onLocate={setUserLocation} />
        </MapContainer>
      </div>

      {/* ── RADIAL GRADIENT on user ── */}
      <div className="user-gradient-overlay" style={{
        background: `radial-gradient(circle at ${x}px ${y}px,
          rgba(136,81,212,0.20) 0%,
          rgba(136,81,212,0.08) 25%,
          rgba(136,81,212,0.02) 50%,
          transparent 68%)`,
      }} />

      {/* ── TOP BAR ── */}
      <div className="top-bar">
        <span className="app-name">strollo</span>
      </div>

      {/* ── PROFILE (floats over map, top-right) ── */}
      <button className="fab-circle profile-btn" aria-label="Profile">
        <span className="profile-initials">E</span>
      </button>

      {/* ── LOCATE (bottom-right, rises above sheet when open) ── */}
      <button
        className="locate-fixed"
        style={{ bottom: sheetOpen ? 440 : 128, transition: "bottom 0.42s cubic-bezier(0.22,1,0.36,1)" }}
        onClick={() => setLocateTrigger((t) => t + 1)}
        aria-label="Locate me"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#8851D4">
          <circle cx="12" cy="12" r="3.5"/>
          <rect x="11" y="2" width="2" height="4" rx="1"/>
          <rect x="11" y="18" width="2" height="4" rx="1"/>
          <rect x="2" y="11" width="4" height="2" rx="1"/>
          <rect x="18" y="11" width="4" height="2" rx="1"/>
        </svg>
      </button>

      {/* ── BACKDROP ── */}
      {sheetOpen && <div className="sheet-backdrop" onClick={() => setSheetOpen(false)} />}

      {/* ── VOICE PILL (minimized) ── */}
      {voiceActive && !voiceExpanded && (() => {
        const demoUserText = listening ? "Something cozy, maybe a bakery?" : "";
        const demoAiSpeaking = !listening && (locked || muted);
        const demoAiText = muted ? "There's a courtyard 3 blocks east…" : "";
        return (
          <div className="home-voice-pill">
            <div
              className="voice-min-handle"
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); homeHandleY.current = e.clientY; }}
              onPointerMove={(e) => { if (homeHandleY.current !== null && homeHandleY.current - e.clientY > 60) { homeHandleY.current = null; setVoiceExpanded(true); } }}
              onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); homeHandleY.current = null; }}
              style={{ touchAction: "none" }}
            >
              <div className="handle-bar handle-bar--light" />
            </div>
            <div className="voice-min-content">
              <button className={`wc-btn wc-mute-btn ${muted ? "wc-muted" : ""}`} onClick={() => setMuted((m) => !m)} aria-label="Mute AI">
                <MuteSvg muted={muted} />
              </button>
              <div className="wc-bubble-area">
                <WidgetBubble listening={listening} aiSpeaking={demoAiSpeaking} muted={muted} userText={demoUserText} aiText={demoAiText} />
              </div>
              <button
                className={`wc-btn wc-speak-btn ${listening ? "wc-listening" : ""} ${locked ? "wc-locked" : ""}`}
                onPointerDown={(e) => {
                  if (locked) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  homeStartY.current = e.clientY;
                  homeDidLock.current = false;
                  setListening(true);
                }}
                onPointerMove={(e) => {
                  if (homeStartY.current === null || homeDidLock.current) return;
                  if (homeStartY.current - e.clientY > 40) { homeDidLock.current = true; setLocked(true); }
                }}
                onPointerUp={(e) => {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  homeStartY.current = null;
                  if (!homeDidLock.current) setListening(false);
                }}
                onClick={() => { if (locked) { setLocked(false); setListening(false); } }}
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
      })()}

      {/* ── VOICE FULL SCREEN ── */}
      {voiceActive && voiceExpanded && (() => {
        const fsHandleY = { current: null };
        return (
          <div className="vfs">
            <div className="vfs-gradient" />
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
            <div
              className="vfs-handle"
              onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fsHandleY.current = e.clientY; }}
              onPointerMove={(e) => { if (fsHandleY.current !== null && e.clientY - fsHandleY.current > 60) { fsHandleY.current = null; setVoiceExpanded(false); } }}
              onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); fsHandleY.current = null; }}
              style={{ touchAction: "none" }}
            >
              <div className="vfs-handle-bar" />
            </div>
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
            <div className="vfs-controls">
              <button className={`wc-btn wc-btn--lg wc-mute-btn ${muted ? "wc-muted" : ""}`} onClick={() => setMuted((m) => !m)} aria-label="Mute AI">
                <MuteSvg muted={muted} />
              </button>
              <button
                className={`wc-btn wc-btn--lg wc-speak-btn ${listening ? "wc-listening" : ""} ${locked ? "wc-locked" : ""}`}
                onPointerDown={(e) => {
                  if (locked) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  homeStartY.current = e.clientY;
                  homeDidLock.current = false;
                  setListening(true);
                }}
                onPointerMove={(e) => {
                  if (homeStartY.current === null || homeDidLock.current) return;
                  if (homeStartY.current - e.clientY > 40) { homeDidLock.current = true; setLocked(true); }
                }}
                onPointerUp={(e) => {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  homeStartY.current = null;
                  if (!homeDidLock.current) setListening(false);
                }}
                onClick={() => { if (locked) { setLocked(false); setListening(false); } }}
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
      })()}

      {/* ── BOTTOM SEARCH / SHEET ── */}
      {!voiceActive && (
        <div
          className={`bottom-search ${sheetOpen ? "open" : ""}`}
          onMouseDown={onDragStart} onMouseUp={onDragEnd}
          onTouchStart={onDragStart} onTouchEnd={onDragEnd}
        >
          <div className="search-handle" onClick={() => setSheetOpen((o) => !o)}>
            <div className="handle-bar" />
          </div>

          <div className="search-input-row">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="search-input"
              placeholder="I'm in the mood for..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSheetOpen(true)}
            />
            <button className="mic-btn" aria-label="Voice input" onClick={toggleVoice}>
              <SoundWaveSvg active={false} />
            </button>
          </div>

          {sheetOpen && (
            <>
              <div className="sheet-tabs">
                {["suggested", "recent", "faves"].map((tab) => (
                  <button
                    key={tab}
                    className={`tab-btn ${activeTab === tab ? "active" : ""}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div className="suggestion-list">
                {allItems.length === 0 && (
                  <p className="empty-state">
                    {activeTab === "faves" ? "Swipe right on suggestions to fave them ♥" : "Nothing here yet."}
                  </p>
                )}
                {allItems.map((item) => (
                  <SwipeRow
                    key={item.id}
                    item={item}
                    added={addedIds.has(item.id)}
                    onAdd={handleAdd}
                    onFave={handleFave}
                    onRemove={handleRemove}
                  />
                ))}
              </div>

              {addedIds.size > 0 && (
                <button className="cta-btn" onClick={handleStartWalk}>
                  Start walk · {addedIds.size} {addedIds.size === 1 ? "stop" : "stops"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
