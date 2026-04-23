import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./HomeScreen.css";
import { ReactComponent as RightSoleSvg } from "./assets/right-sole.svg";
import { ReactComponent as LeftSoleSvg } from "./assets/left-sole.svg";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { sendMessage, buildSystemPrompt, extractPlaces, cleanResponseText, geocodePlace, getWalkingRoute, fetchNearbyPlaces } from "./geminiService";
import { youIcon, WatchLocation, LocateMe, TrackUserPosition, MapDragListener, MapCenterTracker, isWithinWalkingRadius } from "./mapUtils";

const makePinIcon = (name, desc, added, expanded) => L.divIcon({
  className: "",
  html: `<div class="sugg-pin${expanded ? " sugg-pin--open" : ""}${added ? " sugg-pin--added" : ""}">
    <div class="sugg-pin-dot"></div>
    <span class="sugg-pin-name">${name}</span>
    <div class="sugg-pin-extra">
      <span class="sugg-pin-desc">${desc}</span>
      <button class="sugg-pin-btn sugg-pin-btn--icon" data-action="toggle" aria-label="${added ? "Remove from itinerary" : "Add to itinerary"}">
        ${added
          ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`
          : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
        }
      </button>
    </div>
  </div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

// ── Location card ──────────────────────────────────────────────────────────
const LOVED_PLACES = ["Sightglass Coffee", "Dolores Park", "Ferry Building"];

const trustTagFor = (id) => {
  const variant = id % 3;
  if (variant === 0) return "From your last walk";
  if (variant === 1) return `Because you loved ${LOVED_PLACES[id % LOVED_PLACES.length]}`;
  return "Based on your preferences";
};

const LocationCard = memo(function LocationCard({ item, added, faved, onToggle, onFave }) {
  return (
    <div className="location-card">
      <div
        className="location-card-image"
        style={item.image ? { backgroundImage: `url(${item.image})` } : undefined}
      >
        <div className="location-card-gradient" />
        <button
          className={`location-card-add ${added ? "added" : ""}`}
          onClick={() => onToggle(item.id)}
          aria-label={added ? "Remove from itinerary" : "Add to itinerary"}
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
        <span className="location-card-address">{item.desc || item.address || ""}</span>
        <span className="location-card-tag">{trustTagFor(item.id)}</span>
      </div>
    </div>
  );
});

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

// Map a PreferencesScreen "Show on Map" filter ID → Overpass place `desc` strings.
// Only these filter IDs correspond to fetched pin categories; others (ai-highlights,
// saved-places, benches, dog-friendly) don't map to Overpass results and are skipped.
const FILTER_DESCS = {
  cafes: new Set(["Coffee", "Bakery"]),
  food: new Set(["Restaurant", "Ice Cream", "Bar"]),
  museums: new Set(["Museum", "Gallery", "Art", "Arts"]),
  parks: new Set(["Park", "Garden"]),
  sights: new Set(["Viewpoint"]),
  attractions: new Set(["Attraction"]),
};

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


// ── Sound wave icon (matches Walk Companion pill) ─────────────────────────
function SoundWaveSvg({ active }) {
  const color = active ? "#FFFFFF" : "#8851D4";
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
export default function HomeScreen({
  onStartWalk,
  onSetConstraints,
  onOpenTimeline,
  onOpenQuiz,
  initialLocation,
  initialSheetOpen,
  onSheetOpenConsumed,
  preferences,
  nearbyPlaces,
  setNearbyPlaces,
  addedIds,
  setAddedIds,
  favedIds,
  setFavedIds,
  lastFetchedLocationRef,
  lastFetchTimeRef,
}) {
  const [userLocation, setUserLocation]   = useState(initialLocation || null);
  const [locateTrigger, setLocateTrigger] = useState(1); // trigger on mount
  const [showLocatePrompt, setShowLocatePrompt] = useState(false);
  const [locateError, setLocateError]           = useState("");
  const [locateActive, setLocateActive]         = useState(false);
  const [userScreenPos, setUserScreenPos] = useState({ x: 187, y: 406 });
  const [sheetOpen, setSheetOpen]         = useState(Boolean(initialSheetOpen));

  useEffect(() => {
    if (initialSheetOpen) onSheetOpenConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mapCenterRef                      = useRef(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError]     = useState("");
  const [voiceActive, setVoiceActive]     = useState(false);
  const [listening, setListening]         = useState(false);
  const [locked, setLocked]              = useState(false);
  const [muted, setMuted]                = useState(false);
  const [voiceExpanded, setVoiceExpanded] = useState(false);
  const [query, setQuery]                 = useState("");
  const [voiceUnsupported, setVoiceUnsupported] = useState(false);
  const [voiceResult, setVoiceResult]           = useState("");
  const [listenCardMode, setListenCardMode]     = useState(false);
  const [chatMode, setChatMode]                 = useState(false);
  const [chatMessages, setChatMessages]         = useState([]);
  const [chatLoading, setChatLoading]           = useState(false);
  const [chatListening, setChatListening]       = useState(false);
  const [chatClosing, setChatClosing]           = useState(false);
  const [chatHistory, setChatHistory]           = useState([]);
  const [showHistory, setShowHistory]           = useState(false);
  const [viewingHistory, setViewingHistory]     = useState(null);
  const [listenTextMode, setListenTextMode]     = useState(false);
  const [suggestedStops, setSuggestedStops]     = useState([]);
  const [planLoading, setPlanLoading]           = useState(false);
  const [selectedPoi, setSelectedPoi]           = useState(null);
  const chatHistoryIdCounter = useRef(0);
  const chatIdCounter = useRef(0);
  const resultTimer = useRef(null);
  const nearbyAbortRef = useRef(null);

  // Clean up resultTimer on unmount
  useEffect(() => { return () => clearTimeout(resultTimer.current); }, []);
  useEffect(() => () => { nearbyAbortRef.current?.abort(); }, []);

  const loadNearbyPlaces = useCallback(async (loc, force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < 10000) return;

    // Supersede any in-flight request — a newer call owns the result set now
    nearbyAbortRef.current?.abort();
    const controller = new AbortController();
    nearbyAbortRef.current = controller;

    setNearbyLoading(true);
    setNearbyError("");
    try {
      const places = await fetchNearbyPlaces(loc[0], loc[1], 800, { signal: controller.signal });
      if (controller.signal.aborted) return; // superseded — drop result
      setNearbyPlaces(places);
      lastFetchedLocationRef.current = loc;
      lastFetchTimeRef.current = Date.now();
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.warn("[Strollo] Failed to fetch nearby places:", err);
      setNearbyError("Couldn't load nearby places. Tap refresh to retry.");
    } finally {
      if (!controller.signal.aborted) setNearbyLoading(false);
      if (nearbyAbortRef.current === controller) nearbyAbortRef.current = null;
    }
  }, []);

  // Auto-fetch nearby places when real user location is available / changes significantly
  useEffect(() => {
    if (!userLocation) return; // wait for geolocation
    if (!lastFetchedLocationRef.current) {
      loadNearbyPlaces(userLocation, true);
      return;
    }
    // Only re-fetch if moved more than ~200m
    const [prevLat, prevLng] = lastFetchedLocationRef.current;
    const dlat = Math.abs(userLocation[0] - prevLat);
    const dlng = Math.abs(userLocation[1] - prevLng);
    if (dlat > 0.002 || dlng > 0.002) {
      loadNearbyPlaces(userLocation);
    }
  }, [userLocation, loadNearbyPlaces]);

  const chatModeRef = useRef(false);
  chatModeRef.current = chatMode;
  const handleAutoStop = useCallback(async (spokenText) => {
    setListening(false);
    setLocked(false);
    const text = spokenText?.trim() || "";

    // In chat mode, ignore auto-stop — user manually controls stop via button
    if (chatModeRef.current) {
      return;
    }
    setChatListening(false);

    if (text) {
      // Show result briefly, then transition to chat
      setVoiceResult(text);
      resultTimer.current = setTimeout(async () => {
        setVoiceResult("");
        setListenCardMode(false);
        setListenTextMode(false);
        setVoiceActive(false);

        // Enter chat mode
        const userMsg = { id: ++chatIdCounter.current, role: "user", text };
        setChatMessages([userMsg]);
        setChatMode(true);
        setChatLoading(true);

        try {
          const systemPrompt = buildSystemPrompt({
            userLocation,
            journeyItems: [],
            elapsedMinutes: 0,
            currentStopIndex: 0,
            totalStops: 0,
          });
          const response = await sendMessage([userMsg], systemPrompt);
          const places = extractPlaces(response);
          const displayText = cleanResponseText(response);
          const aiMsg = { id: ++chatIdCounter.current, role: "ai", text: displayText };
          setChatMessages(prev => {
            const updated = [...prev, aiMsg];
            if (places.length > 0) setSuggestedStops(places);
            return updated;
          });
        } catch (err) {
          console.error("Gemini error:", err);
          const errMsg = { id: ++chatIdCounter.current, role: "ai", text: "Gemini is busy right now. Tap the mic to try again!" };
          setChatMessages(prev => [...prev, errMsg]);
        } finally {
          setChatLoading(false);
        }
      }, 1000);
    } else {
      setListenCardMode(false);
      setListenTextMode(false);
      setVoiceActive(false);
    }
  }, [userLocation]);

  const speech = useSpeechRecognition({ onAutoStop: handleAutoStop });

  const chatLoadingRef = useRef(false);
  chatLoadingRef.current = chatLoading;
  const chatMessagesRef = useRef([]);
  chatMessagesRef.current = chatMessages;
  const sendChatMessage = useCallback(async (text) => {
    if (!text.trim() || chatLoadingRef.current) return;
    const userMsg = { id: ++chatIdCounter.current, role: "user", text: text.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setQuery("");
    setChatLoading(true);

    try {
      const systemPrompt = buildSystemPrompt({
        userLocation,
        journeyItems: [],
        elapsedMinutes: 0,
        currentStopIndex: 0,
        totalStops: 0,
      });
      // Send full conversation history so LLM has session context
      const fullHistory = [...chatMessagesRef.current, userMsg];
      const response = await sendMessage(fullHistory, systemPrompt);
      const places = extractPlaces(response);
      const displayText = cleanResponseText(response);
      const aiMsg = { id: ++chatIdCounter.current, role: "ai", text: displayText };
      setChatMessages(prev => [...prev, aiMsg]);
      if (places.length > 0) setSuggestedStops(places);
    } catch (err) {
      console.error("Gemini error:", err);
      const errMsg = { id: ++chatIdCounter.current, role: "ai", text: "Gemini is busy right now. Tap the mic to try again!" };
      setChatMessages(prev => [...prev, errMsg]);
    } finally {
      setChatLoading(false);
    }
  }, [userLocation]);
  const sendChatMessageRef = useRef(sendChatMessage);
  sendChatMessageRef.current = sendChatMessage;

  const handleSendQuery = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setChatMessages([{ id: ++chatIdCounter.current, role: "user", text: trimmed }]);
    setChatMode(true);
    setChatLoading(true);
    setQuery("");
    setListenCardMode(false);
    setListenTextMode(false);
    setVoiceActive(false);
    const systemPrompt = buildSystemPrompt({ userLocation, journeyItems: [], elapsedMinutes: 0, currentStopIndex: 0, totalStops: 0 });
    sendMessage([{ role: "user", text: trimmed }], systemPrompt).then(response => {
      const places = extractPlaces(response);
      const displayText = cleanResponseText(response);
      setChatMessages(prev => [...prev, { id: ++chatIdCounter.current, role: "ai", text: displayText }]);
      if (places.length > 0) setSuggestedStops(places);
    }).catch(() => {
      setChatMessages(prev => [...prev, { id: ++chatIdCounter.current, role: "ai", text: "Gemini is busy right now. Tap the mic to try again!" }]);
    }).finally(() => setChatLoading(false));
  }, [userLocation]);

  const handlePlanWalk = useCallback(async () => {
    if (suggestedStops.length === 0) return;
    setPlanLoading(true);

    try {
      // Geocode all suggested places
      const geocoded = [];
      for (const stop of suggestedStops) {
        const result = await geocodePlace(stop.name, userLocation[0], userLocation[1]);
        if (result) {
          geocoded.push({
            id: Date.now() + geocoded.length,
            name: stop.name,
            desc: stop.desc,
            lat: result.lat,
            lng: result.lng,
          });
        }
      }

      const nearby = geocoded.filter((s) => isWithinWalkingRadius(userLocation, s));

      if (nearby.length === 0) {
        const errMsg = { id: ++chatIdCounter.current, role: "ai", text: "Sorry, I couldn't find those places on the map. Try asking for specific place names!" };
        setChatMessages(prev => [...prev, errMsg]);
        setPlanLoading(false);
        return;
      }

      // Close chat and start walk
      setChatMode(false);
      setChatMessages([]);
      setSuggestedStops([]);
      onStartWalk(nearby, userLocation);
    } catch (err) {
      console.error("Plan walk error:", err);
      const errMsg = { id: ++chatIdCounter.current, role: "ai", text: "Something went wrong while planning the route. Please try again." };
      setChatMessages(prev => [...prev, errMsg]);
    } finally {
      setPlanLoading(false);
    }
  }, [suggestedStops, userLocation, onStartWalk]);

  const closeChat = useCallback(() => {
    setChatClosing(true);
    setTimeout(() => {
      // Save conversation to history if it has messages
      setChatMessages(prev => {
        if (prev.length > 0) {
          setChatHistory(h => [{
            id: ++chatHistoryIdCounter.current,
            timestamp: Date.now(),
            messages: prev,
          }, ...h]);
        }
        return [];
      });
      setChatMode(false);
      setChatClosing(false);
      setShowHistory(false);
      setViewingHistory(null);
    }, 350);
  }, []);

  const onScreenPos  = useCallback((pos) => setUserScreenPos(pos), []);
  const handleMapCenterChange = useCallback((center) => { mapCenterRef.current = center; }, []);
  const handleLocate = useCallback((pos) => {
    setUserLocation(pos);
    setShowLocatePrompt(false);
    setLocateActive(true);
  }, []);
  const handleMapDrag = useCallback(() => setLocateActive(false), []);
  const handleToggleAdd = useCallback((id) => setAddedIds((p) => {
    const next = new Set(p);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }), []);
  const handleFave = useCallback((id) => setFavedIds((p) => {
    const next = new Set(p);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }), []);

  const carouselRef = useRef(null);
  const carouselDrag = useRef({ active: false, startX: 0, scrollLeft: 0, moved: false });
  const onCarouselMouseDown = (e) => {
    const el = carouselRef.current;
    if (!el) return;
    carouselDrag.current = { active: true, startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft, moved: false };
    el.style.cursor = "grabbing";
  };
  const onCarouselMouseMove = (e) => {
    if (!carouselDrag.current.active) return;
    e.preventDefault();
    const el = carouselRef.current;
    const x = e.pageX - el.offsetLeft;
    const dx = x - carouselDrag.current.startX;
    if (Math.abs(dx) > 3) carouselDrag.current.moved = true;
    el.scrollLeft = carouselDrag.current.scrollLeft - dx;
  };
  const onCarouselMouseUp = () => {
    carouselDrag.current.active = false;
    if (carouselRef.current) carouselRef.current.style.cursor = "grab";
  };
  const onCarouselClickCapture = (e) => {
    if (carouselDrag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      carouselDrag.current.moved = false;
    }
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
    const origin = lastFetchedLocationRef.current || userLocation;
    const items = nearbyPlaces
      .filter((s) => addedIds.has(s.id))
      .filter((s) => isWithinWalkingRadius(origin, s));
    onStartWalk(items, origin);
  };

  const toggleVoice = () => {
    if (voiceActive) {
      speech.stop();
      clearTimeout(resultTimer.current);
      if (voiceResult.trim()) {
        setQuery(voiceResult.trim());
      } else if (speech.transcript.trim()) {
        setQuery(speech.transcript.trim());
      }
      setVoiceResult("");
      speech.reset();
      setListenCardMode(false);
      setListenTextMode(false);
      setTimeout(() => { setVoiceActive(false); }, 320);
    } else {
      if (!speech.supported) {
        setVoiceUnsupported(true);
        setTimeout(() => setVoiceUnsupported(false), 3000);
        return;
      }
      setSheetOpen(false);
      setListenCardMode(true);
      setVoiceActive(true);
      speech.start();
    }
  };

  const { x, y } = userScreenPos;

  const visibleNearbyPlaces = useMemo(() => {
    const active = preferences?.mapFilters?.filter((id) => FILTER_DESCS[id]) ?? [];
    if (active.length === 0) return nearbyPlaces;
    const allowed = new Set();
    for (const id of active) FILTER_DESCS[id].forEach((d) => allowed.add(d));
    return nearbyPlaces.filter((p) => allowed.has(p.desc));
  }, [nearbyPlaces, preferences]);

  const allItems = visibleNearbyPlaces;

  return (
    <>

      {/* ── MAP ── */}
      <div className="map-perspective-wrapper">
        <MapContainer center={userLocation || [0, 0]} zoom={userLocation ? 15 : 2} zoomControl={false} attributionControl={false} className="map-container">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" maxZoom={19} />
          {visibleNearbyPlaces.filter((s) => s.lat && s.lng).map((s) => {
            const isExpanded = selectedPoi === s.id;
            const isAdded = addedIds.has(s.id);
            return (
              <Marker key={s.id} position={[s.lat, s.lng]}
                icon={makePinIcon(s.name, s.desc, isAdded, isExpanded)}
                zIndexOffset={isExpanded ? 1000 : 0}
                eventHandlers={{
                  click: (e) => {
                    const target = e.originalEvent?.target;
                    if (target && target.closest && target.closest('[data-action="toggle"]')) {
                      handleToggleAdd(s.id);
                      setSelectedPoi(null);
                    } else if (isExpanded) {
                      setSelectedPoi(null);
                    } else {
                      setSelectedPoi(s.id);
                    }
                  },
                }}
              />
            );
          })}
          {userLocation && <Marker position={userLocation} icon={youIcon} />}
          {userLocation && <TrackUserPosition userPos={userLocation} onScreenPos={onScreenPos} />}
          <LocateMe trigger={locateTrigger} onLocate={handleLocate} onError={setLocateError} />
          <WatchLocation onUpdate={setUserLocation} />
          <MapDragListener onDrag={handleMapDrag} />
          <MapCenterTracker onCenterChange={handleMapCenterChange} />
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
        {!voiceActive && !sheetOpen && (
          <button className="fab-circle start-walk-pill" onClick={handleStartWalk}>
            {addedIds.size > 0 ? `Start exploring · ${addedIds.size}` : "Start exploring"}
          </button>
        )}
      </div>

      {/* ── PROFILE (floats over map, top-right) ── */}
      <button className="fab-circle profile-btn" onClick={onOpenQuiz} aria-label="Open quiz">
        <span className="profile-initials">E</span>
      </button>

      {/* ── BOTTOM-RIGHT STACK: Locate (flag only shown during walk) ── */}
      {!voiceActive && !sheetOpen && (
        <div className="bottom-right-stack">
          <button
            className="fab-circle bottom-right-btn"
            aria-label="Focus on my location"
            onClick={() => { setLocateError(""); setLocateTrigger((t) => t + 1); }}
          >
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
      )}

      {/* ── LOCATION PERMISSION POPOVER ── */}
      {showLocatePrompt && (
        <>
          <div className="locate-overlay" onClick={() => setShowLocatePrompt(false)} />
          <div className="locate-popover">
            <div className="locate-popover-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <p className="locate-popover-title">Use your location?</p>
            <p className="locate-popover-desc">Strollo needs your location to center the map and show nearby suggestions.</p>
            {locateError && <p className="locate-popover-error">{locateError}</p>}
            <div className="locate-popover-actions">
              <button className="locate-popover-btn locate-popover-btn--cancel" onClick={() => setShowLocatePrompt(false)}>Not now</button>
              <button className="locate-popover-btn locate-popover-btn--allow" onClick={() => setLocateTrigger((t) => t + 1)}>Allow</button>
            </div>
          </div>
        </>
      )}

      {/* ── BACKDROP ── */}
      {sheetOpen && <div className="sheet-backdrop" onClick={() => setSheetOpen(false)} />}

      {/* ── VOICE PILL (minimized) ── */}
      {voiceActive && !voiceExpanded && !listenCardMode && (() => {
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
                <WidgetBubble listening={listening} aiSpeaking={demoAiSpeaking} muted={muted} userText={speech.transcript || demoUserText} aiText={demoAiText} />
              </div>
              <button
                className={`wc-btn wc-speak-btn ${listening ? "wc-listening" : ""} ${locked ? "wc-locked" : ""}`}
                onPointerDown={(e) => {
                  if (locked) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  homeStartY.current = e.clientY;
                  homeDidLock.current = false;
                  setListening(true);
                  speech.start();
                }}
                onPointerMove={(e) => {
                  if (homeStartY.current === null || homeDidLock.current) return;
                  if (homeStartY.current - e.clientY > 40) { homeDidLock.current = true; setLocked(true); }
                }}
                onPointerUp={(e) => {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  homeStartY.current = null;
                  if (!homeDidLock.current) { setListening(false); speech.stop(); }
                }}
                onClick={() => { if (locked) { setLocked(false); setListening(false); speech.stop(); } }}
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
              {chatMessages.map((msg) => (
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
                  speech.start();
                }}
                onPointerMove={(e) => {
                  if (homeStartY.current === null || homeDidLock.current) return;
                  if (homeStartY.current - e.clientY > 40) { homeDidLock.current = true; setLocked(true); }
                }}
                onPointerUp={(e) => {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                  homeStartY.current = null;
                  if (!homeDidLock.current) { setListening(false); speech.stop(); }
                }}
                onClick={() => { if (locked) { setLocked(false); setListening(false); speech.stop(); } }}
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
      {!voiceExpanded && (
        <div
          className={`bottom-search ${sheetOpen ? "open" : ""} ${listenCardMode ? "listening" : ""}`}
          onMouseDown={onDragStart} onMouseUp={onDragEnd}
          onTouchStart={onDragStart} onTouchEnd={onDragEnd}
        >
          {/* Animated blobs (always in DOM for smooth fade) */}
          <div className={`listen-card-blobs ${listenCardMode ? "visible" : ""}`}>
            <div className="listen-blob listen-blob--1" />
            <div className="listen-blob listen-blob--2" />
            <div className="listen-blob listen-blob--3" />
          </div>

          <div className="search-handle" onClick={() => !listenCardMode && setSheetOpen((o) => !o)}>
            <div className="handle-bar" />
          </div>

          {/* State: idle — search input */}
          {!listenCardMode && (
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && query.trim()) {
                    e.target.blur();
                    handleSendQuery(query);
                  }
                }}
              />
              {query.trim() ? (
                <button className="mic-btn" aria-label="Send" onClick={() => handleSendQuery(query)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </button>
              ) : (
                <button className="mic-btn" aria-label="Voice input" onClick={toggleVoice}>
                  <SoundWaveSvg active={false} />
                </button>
              )}
            </div>
          )}

          {/* Close button — on the card, above listen-content */}
          {listenCardMode && (
            <button className="listen-card-close" aria-label="Close" onClick={() => {
              if (listenTextMode) {
                setListenTextMode(false);
                setListenCardMode(false);
              } else {
                toggleVoice();
              }
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}

          {/* Keyboard toggle — switch from voice to text input */}
          {listenCardMode && !listenTextMode && !voiceResult && (
            <button className="listen-card-keyboard" aria-label="Switch to typing" onClick={() => {
              speech.stop();
              const partial = speech.transcript.trim();
              if (partial) setQuery(partial);
              speech.reset();
              setVoiceActive(false);
              setVoiceResult("");
              setListenTextMode(true);
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="14" rx="2"/>
                <line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/>
                <line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/>
                <line x1="6" y1="12" x2="6.01" y2="12"/><line x1="10" y1="12" x2="10.01" y2="12"/>
                <line x1="14" y1="12" x2="14.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/>
                <line x1="8" y1="16" x2="16" y2="16"/>
              </svg>
            </button>
          )}

          {/* Mic toggle — switch back from text to voice input */}
          {listenCardMode && listenTextMode && (
            <button className="listen-card-keyboard" aria-label="Switch to voice" onClick={() => {
              if (!speech.supported) return;
              setListenTextMode(false);
              setVoiceActive(true);
              speech.start();
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="1" width="6" height="11" rx="3"/>
                <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
          )}

          {/* State: listening — live transcript */}
          {listenCardMode && !listenTextMode && !voiceResult && (
            <div className="listen-content visible">
              <p className="listen-card-caption">
                {speech.transcript || "What's on your mind?"}
              </p>
            </div>
          )}

          {/* State: result — final recognized text */}
          {listenCardMode && !listenTextMode && voiceResult && (
            <div className="listen-content visible">
              <p className="listen-card-caption listen-card-result">{voiceResult}</p>
            </div>
          )}

          {/* State: text input mode */}
          {listenCardMode && listenTextMode && (
            <div className="listen-content visible">
              <div className="listen-text-input-row">
                <input
                  className="listen-text-input"
                  placeholder="Type your message..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && query.trim()) {
                      e.target.blur();
                      handleSendQuery(query);
                    }
                  }}
                />
                {query.trim() && (
                  <button className="listen-text-send" aria-label="Send" onClick={() => handleSendQuery(query)}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          <div className={`sheet-content ${sheetOpen && !listenCardMode ? "visible" : ""}`}>
            <div className="sheet-tabs">
              <span className="sheet-tabs-label">Suggested</span>
              <button
                className={`sheet-refresh-btn ${nearbyLoading ? "sheet-refresh-btn--spinning" : ""}`}
                aria-label="Refresh nearby places"
                onClick={() => loadNearbyPlaces(mapCenterRef.current || userLocation, true)}
                disabled={nearbyLoading}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
              </button>
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
              onClickCapture={onCarouselClickCapture}
              style={{ cursor: "grab" }}
            >
              {nearbyLoading && allItems.length === 0 && (
                <p className="empty-state">Finding places near you...</p>
              )}
              {!nearbyLoading && nearbyError && (
                <p className="empty-state">{nearbyError}</p>
              )}
              {!nearbyLoading && !nearbyError && allItems.length === 0 && (
                <p className="empty-state">No places found nearby. Try refreshing.</p>
              )}
              {allItems.map((item) => (
                <LocationCard
                  key={item.id}
                  item={item}
                  added={addedIds.has(item.id)}
                  faved={favedIds.has(item.id)}
                  onToggle={handleToggleAdd}
                  onFave={handleFave}
                />
              ))}
            </div>

            {addedIds.size > 0 && (
              <button className="cta-btn" onClick={handleStartWalk}>
                Start walk · {addedIds.size} {addedIds.size === 1 ? "stop" : "stops"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── CHAT MODE ── */}
      {chatMode && (
        <div className={`chat-overlay ${chatClosing ? "chat-overlay--closing" : ""}`}>
          <div className="chat-header">
            <button className="chat-history-btn" onClick={() => { setShowHistory(h => !h); setViewingHistory(null); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </button>
            <span className="chat-title">{showHistory ? "History" : "strollo"}</span>
            <button className="chat-x-btn" onClick={closeChat}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* History list */}
          {showHistory && !viewingHistory && (
            <div className="chat-history-list">
              {chatHistory.length === 0 && (
                <p className="chat-history-empty">No past conversations yet</p>
              )}
              {chatHistory.map((conv) => {
                const firstMsg = conv.messages.find(m => m.role === "user");
                const ago = Math.round((Date.now() - conv.timestamp) / 60000);
                const timeLabel = ago < 1 ? "Just now" : ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
                return (
                  <button key={conv.id} className="chat-history-item" onClick={() => setViewingHistory(conv)}>
                    <span className="chat-history-text">{firstMsg?.text || "Conversation"}</span>
                    <span className="chat-history-time">{timeLabel}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Viewing a past conversation */}
          {showHistory && viewingHistory && (
            <div className="chat-messages">
              <button className="chat-history-back" onClick={() => setViewingHistory(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
                <span>Back to list</span>
              </button>
              {viewingHistory.messages.map((msg) => (
                <div key={msg.id} className={`chat-msg chat-msg--${msg.role}`}>
                  <div className={`chat-bubble chat-bubble--${msg.role}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Current conversation */}
          {!showHistory && (
            <div className="chat-messages">
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`chat-msg chat-msg--${msg.role}`}>
                  <div className={`chat-bubble chat-bubble--${msg.role}`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {chatListening && speech.transcript && (
                <div className="chat-msg chat-msg--user">
                  <div className="chat-bubble chat-bubble--user chat-bubble--live">
                    {speech.transcript}
                  </div>
                </div>
              )}
              {chatLoading && (
                <div className="chat-msg chat-msg--ai">
                  <div className="chat-bubble chat-bubble--ai chat-typing">
                    <div className="chat-dot" /><div className="chat-dot" /><div className="chat-dot" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Plan walk button */}
          {!showHistory && suggestedStops.length > 0 && !chatLoading && (
            <button className="chat-plan-btn" onClick={handlePlanWalk} disabled={planLoading}>
              {planLoading ? (
                <>
                  <div className="plan-spinner" />
                  <span>Finding places on map...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span>Plan this walk · {suggestedStops.length} {suggestedStops.length === 1 ? "stop" : "stops"}</span>
                </>
              )}
            </button>
          )}
          <div className="chat-input-row">
            <button
              className="chat-mic-btn"
              disabled={chatLoading}
              onClick={() => {
                if (chatListening) {
                  const text = speech.getTranscript().trim();
                  speech.stop();
                  setChatListening(false);
                  if (text) sendChatMessage(text);
                } else {
                  if (!speech.supported) return;
                  setChatListening(true);
                  speech.start();
                }
              }}
              aria-label="Voice input"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={chatListening ? "#fff" : "#8851D4"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="1" width="6" height="11" rx="3"/>
                <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
            <input
              className="chat-input"
              placeholder={chatListening ? "Listening..." : "Type a message..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendChatMessage(query); }}
              disabled={chatListening}
            />
            <button className="chat-send-btn" onClick={() => sendChatMessage(query)} disabled={chatLoading || !query.trim() || chatListening}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>

          {/* Floating speak FAB */}
          <button
            className={`chat-mic-fab ${chatListening ? "chat-mic-fab--active" : ""}`}
            disabled={chatLoading}
            onClick={() => {
              if (chatListening) {
                speech.stop();
                setChatListening(false);
                const text = speech.transcript.trim();
                if (text) sendChatMessage(text);
              } else {
                if (!speech.supported) return;
                setChatListening(true);
                speech.start();
              }
            }}
            aria-label="Speak"
          >
            {chatListening ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="1" width="6" height="11" rx="3"/>
                <path d="M19 10v1a7 7 0 0 1-14 0v-1"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            )}
          </button>
        </div>
      )}

      {/* ── Voice unsupported toast ── */}
      {voiceUnsupported && (
        <div className="voice-toast">Voice input is not supported in this browser</div>
      )}
    </>
  );
}
