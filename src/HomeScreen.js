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
  { id: 1, name: "Tartine Bakery",       desc: "Mission · Bakery",    lat: 37.7814, lng: -122.4041, icon: "🥐", address: "600 Guerrero St",      openStatus: "open",   closesAt: "7 PM",  image: null },
  { id: 2, name: "Dolores Park",         desc: "Mission · Park",      lat: 37.7836, lng: -122.4072, icon: "🌿", address: "19th & Dolores St",    openStatus: "open",   closesAt: "10 PM", image: null },
  { id: 3, name: "Bi-Rite Creamery",     desc: "Mission · Ice Cream", lat: 37.7812, lng: -122.4049, icon: "🍦", address: "3692 18th St",         openStatus: "open",   closesAt: "9 PM",  image: null },
  { id: 4, name: "Clarion Alley Murals", desc: "Mission · Art",       lat: 37.7830, lng: -122.4224, icon: "🎨", address: "Clarion Alley",        openStatus: "open",   closesAt: "Sunset", image: null },
  { id: 5, name: "Mission Dolores",      desc: "Mission · Historic",  lat: 37.7849, lng: -122.4270, icon: "⛪", address: "3321 16th St",         openStatus: "closed", opensAt: "9 AM",   image: null },
];

const RECENT = [
  { id: 6, name: "Sightglass Coffee",  desc: "SoMa · Coffee",           address: "270 7th St",           openStatus: "open",   closesAt: "6 PM",  image: null },
  { id: 7, name: "The Painted Ladies", desc: "Alamo Square · Landmark", address: "Steiner & Hayes St",   openStatus: "open",   closesAt: "Sunset", image: null },
  { id: 8, name: "Ferry Building",     desc: "Embarcadero · Market",    address: "1 Ferry Building",     openStatus: "closed", opensAt: "7 AM",   image: null },
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

// ── Location card ──────────────────────────────────────────────────────────
const LOVED_PLACES = ["Sightglass Coffee", "Dolores Park", "Ferry Building"];

const trustTagFor = (id) => {
  const variant = id % 3;
  if (variant === 0) return "From your last walk";
  if (variant === 1) return `Because you loved ${LOVED_PLACES[id % LOVED_PLACES.length]}`;
  return "Based on your preferences";
};

function LocationCard({ item, added, faved, onAdd, onFave }) {
  return (
    <div className="location-card">
      <div
        className="location-card-image"
        style={item.image ? { backgroundImage: `url(${item.image})` } : undefined}
      >
        <div className="location-card-gradient" />
        <button
          className={`location-card-add ${added ? "added" : ""}`}
          onClick={() => onAdd(item.id)}
          aria-label={added ? "Added to itinerary" : "Add to itinerary"}
        >
          {added ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="3" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </button>
      </div>
      <div className="location-card-info">
        <div className="location-card-name-row">
          <span className="location-card-name">{item.name}</span>
          <button
            className={`location-card-fave ${faved ? "faved" : ""}`}
            onClick={() => onFave(item.id)}
            aria-label={faved ? "Unfave" : "Fave"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill={faved ? "#FF6B6B" : "none"} stroke={faved ? "#FF6B6B" : "#ccc"} strokeWidth="2">
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.6z"/>
            </svg>
          </button>
        </div>
        <span className="location-card-address">{item.address}</span>
        <span className="location-card-tag">{trustTagFor(item.id)}</span>
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
export default function HomeScreen({ onStartWalk, onSetConstraints }) {
  const [userLocation, setUserLocation]   = useState(YOU);
  const [locateTrigger, setLocateTrigger] = useState(0);
  const [userScreenPos, setUserScreenPos] = useState({ x: 187, y: 406 });
  const [sheetOpen, setSheetOpen]         = useState(false);
  const [activeTab, setActiveTab]         = useState("suggested");
  const [addedIds, setAddedIds]           = useState(new Set());
  const [favedIds, setFavedIds]           = useState(new Set());
  const [hiddenIds]                        = useState(new Set());
  const [voiceActive, setVoiceActive]     = useState(false);
  const [listening, setListening]         = useState(false);
  const [locked, setLocked]              = useState(false);
  const [muted, setMuted]                = useState(false);
  const [voiceExpanded, setVoiceExpanded] = useState(false);
  const [query, setQuery]                 = useState("");

  const onScreenPos  = useCallback((pos) => setUserScreenPos(pos), []);
  const handleAdd    = (id) => setAddedIds((p) => new Set([...p, id]));
  const handleFave   = (id) => setFavedIds((p) => {
    const next = new Set(p);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const carouselRef = useRef(null);
  const carouselDrag = useRef({ active: false, startX: 0, scrollLeft: 0 });
  const onCarouselMouseDown = (e) => {
    const el = carouselRef.current;
    if (!el) return;
    carouselDrag.current = { active: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft };
    el.style.cursor = "grabbing";
  };
  const onCarouselMouseMove = (e) => {
    if (!carouselDrag.current.active) return;
    e.preventDefault();
    const el = carouselRef.current;
    const x = e.pageX - el.offsetLeft;
    el.scrollLeft = carouselDrag.current.scrollLeft - (x - carouselDrag.current.startX);
  };
  const onCarouselMouseUp = () => {
    carouselDrag.current.active = false;
    if (carouselRef.current) carouselRef.current.style.cursor = "grab";
  };

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
    <>

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
        style={{ bottom: sheetOpen ? 460 : 184, transition: "bottom 0.42s cubic-bezier(0.22,1,0.36,1)" }}
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
                <button className="sheet-prefs-btn" aria-label="Preferences" onClick={onSetConstraints}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="6" x2="20" y2="6"/>
                    <line x1="4" y1="12" x2="20" y2="12"/>
                    <line x1="4" y1="18" x2="20" y2="18"/>
                    <circle cx="9"  cy="6"  r="2" fill="currentColor"/>
                    <circle cx="15" cy="12" r="2" fill="currentColor"/>
                    <circle cx="8"  cy="18" r="2" fill="currentColor"/>
                  </svg>
                </button>
              </div>

              <div
                className="location-card-carousel"
                ref={carouselRef}
                onMouseDown={onCarouselMouseDown}
                onMouseMove={onCarouselMouseMove}
                onMouseUp={onCarouselMouseUp}
                onMouseLeave={onCarouselMouseUp}
                style={{ cursor: "grab" }}
              >
                {allItems.length === 0 && (
                  <p className="empty-state">
                    {activeTab === "faves" ? "Tap the heart on a card to fave it" : "Nothing here yet."}
                  </p>
                )}
                {allItems.map((item) => (
                  <LocationCard
                    key={item.id}
                    item={item}
                    added={addedIds.has(item.id)}
                    faved={favedIds.has(item.id)}
                    onAdd={handleAdd}
                    onFave={handleFave}
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
    </>
  );
}
