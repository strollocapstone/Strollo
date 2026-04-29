// FEATURE: home-discovery + home-chat + home-voice + home-journey  (multi — phase 5 splits)
// OWNER: shared
// DEPENDS ON: ./geminiService, ./mapUtils, ./useSpeechRecognition, ./WalkCompanionWidget (chat-overlay mode), various CSS
// CONSUMED BY: ./App.js
//
// Home hub. Currently mixes (1) nearby-places fetch via Overpass, (2) the AI
// chat sheet that geocodes Gemini's place suggestions into map pins, (3) a
// voice listen card driven by useSpeechRecognition, (4) the added-stops
// journey list and favorites, and (5) chrome FABs (locate, settings, quiz
// gateway). PHASE 5 of the refactor splits this into widgets/NearbyPlacesSheet,
// widgets/ChatSheet, widgets/VoiceListenCard, widgets/JourneySheet — leaving
// HomeScreen.js as a ~300-line layout shell. Don't add new features in here;
// add them to (or create) one of the target widget folders.

import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { MapContainer, TileLayer, Marker, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./HomeScreen.css";
import { ReactComponent as RightSoleSvg } from "./assets/right-sole.svg";
import { ReactComponent as LeftSoleSvg } from "./assets/left-sole.svg";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { sendMessage, buildSystemPrompt, extractPlaces, cleanResponseText, geocodePlace, getWalkingRoute, fetchNearbyPlaces } from "./geminiService";
import { youIcon, WatchLocation, LocateMe, FlyTo, TrackUserPosition, MapDragListener, MapCenterTracker, ZoomTracker, MapClickListener, isWithinWalkingRadius, haversineKm } from "./mapUtils";

const CATEGORY_ICONS = {
  "Coffee":     "local_cafe",
  "Restaurant": "restaurant",
  "Bar":        "local_bar",
  "Ice Cream":  "icecream",
  "Bakery":     "bakery",
  "Bookstore":  "menu_book",
  "Library":    "local_library",
  "Theatre":    "theater_comedy",
  "Florist":    "local_florist",
  "Museum":     "museum",
  "Gallery":    "palette",
  "Art":        "brush",
  "Viewpoint":  "landscape",
  "Attraction": "attractions",
  "Arts":       "theater_comedy",
  "Park":       "park",
  "Garden":     "yard",
};

// Floating destination-pin marker — sits ABOVE the final stop's pill (rendered
// as its own Leaflet Marker so the glyph lives outside the pill chrome).
// Mirrors TimelineScreen's FinalStopPin so all surfaces share one
// "this is your end" cue.
const finalDestPinIcon = () => L.divIcon({
  className: "",
  html: `<div class="sugg-pin-final-marker" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="#8851D4" stroke="none">
      <path d="M12 22s7-7.06 7-12a7 7 0 1 0-14 0c0 4.94 7 12 7 12z"/>
      <circle cx="12" cy="10" r="2.6" fill="white"/>
    </svg>
  </div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

const makePinIcon = (name, desc, added, expanded, sequence, mode = 'dot') => {
  const icon = CATEGORY_ICONS[desc] || "location_on";
  const isDot = mode === 'dot';
  const isMini = mode === 'mini';
  const isPill = mode === 'pill';
  const classes = ['sugg-pin'];
  if (isDot) classes.push('sugg-pin--dot');
  if (isMini) classes.push('sugg-pin--mini');
  if (isPill && expanded) classes.push('sugg-pin--open');
  if (added) classes.push('sugg-pin--added');
  return L.divIcon({
    className: "",
    html: `<div class="${classes.join(' ')}">
    <div class="sugg-pin-dot">
      ${added && sequence
        ? `<span class="sugg-pin-dot-number">${sequence}</span>`
        : `<span class="material-symbols-rounded sugg-pin-dot-icon">${icon}</span>`}
    </div>
    ${!isMini ? `<span class="${isPill ? 'sugg-pin-name' : 'sugg-pin-label'}">${name}</span>` : ''}
    ${isPill && expanded ? `<div class="sugg-pin-extra">
      <button class="sugg-pin-add-btn${added ? ' sugg-pin-add-btn--remove' : ''}" data-action="toggle" aria-label="${added ? 'Remove from itinerary' : 'Add to itinerary'}">
        ${added
          ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5A4B64" stroke-width="3.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`
          : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8851D4" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`}
      </button>
    </div>` : ''}
  </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

const makeAiPinIcon = (name, desc, expanded, added = false, sequence = null) => {
  // Mirror the homescreen pin treatment: category-driven Material Symbol
  // glyph in the dot (so a coffee suggestion shows a cup, a bookstore a
  // book, etc.). Falls back to a sparkle when the AI-suggested place
  // doesn't map to a known category. When the stop is added, the dot
  // shows the sequence number (yellow added background) — same swap as
  // makePinIcon — instead of a separate badge.
  const icon = CATEGORY_ICONS[desc] || "auto_awesome";
  const classes = ['sugg-pin', 'sugg-pin--ai'];
  if (expanded) classes.push('sugg-pin--open');
  if (added) classes.push('sugg-pin--added');
  return L.divIcon({
    className: "",
    html: `<div class="${classes.join(' ')}">
      <div class="sugg-pin-dot sugg-pin-dot--ai">
        ${added && sequence
          ? `<span class="sugg-pin-dot-number">${sequence}</span>`
          : `<span class="material-symbols-rounded sugg-pin-dot-icon">${icon}</span>`}
      </div>
      <span class="sugg-pin-name">${name}</span>
      ${expanded ? `<div class="sugg-pin-extra">
        ${desc ? `<span class="sugg-pin-desc">${desc}</span>` : ''}
        <button class="sugg-pin-add-btn${added ? ' sugg-pin-add-btn--remove' : ''}" data-action="toggle" aria-label="${added ? 'Remove from itinerary' : 'Add to itinerary'}">
          ${added
            ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5A4B64" stroke-width="3.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>`
            : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8851D4" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`}
        </button>
      </div>` : ''}
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

// ── Location card ──────────────────────────────────────────────────────────
const LocationCard = memo(function LocationCard({ item, added, onToggle }) {
  return (
    <div className={`location-card${added ? " location-card--added" : ""}`}>
      <div className="location-card-info">
        <div className="location-card-name-row">
          <span className="location-card-name">{item.name}</span>
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
        <div className="location-card-category">
          <span className="material-symbols-rounded location-card-icon">
            {CATEGORY_ICONS[item.desc] || "location_on"}
          </span>
          <span className="location-card-address">{item.desc || ""}</span>
        </div>
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

// ── Map helper: fly to a target [lat, lng] when it changes ──────────────
// `bottomOffset` (px) shifts the centering point DOWN in pixel space so the
// target lat/lng appears at the visual center of the *visible* map area —
// used in split-chat mode where the bottom of the map is hidden by the sheet.
function MapFocusFly({ target, zoom = 17, bottomOffset = 0 }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    try {
      if (bottomOffset > 0) {
        const px = map.project(target, zoom).add([0, bottomOffset / 2]);
        map.flyTo(map.unproject(px, zoom), zoom, { duration: 0.6 });
      } else {
        map.flyTo(target, zoom, { duration: 0.6 });
      }
    } catch (_) {}
  }, [target?.[0], target?.[1], zoom, bottomOffset, map]);
  return null;
}

// ── Map helper: one-shot fitBounds to enclose user + suggestions ──────────
// `bottomPadding` (px) reserves space at the bottom for the chat sheet so
// fitBounds keeps every point inside the *visible* map band.
function MapFitToSuggestions({ active, points, bottomPadding = 0 }) {
  const map = useMap();
  const lastFitCountRef = useRef(0);
  useEffect(() => {
    if (!active) { lastFitCountRef.current = 0; return; }
    if (!points || points.length < 1) return;
    // Re-fit each time more points arrive (geocoding streams in serially).
    if (points.length === lastFitCountRef.current) return;
    try {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, {
        paddingTopLeft: [40, 40],
        paddingBottomRight: [40, 40 + bottomPadding],
        maxZoom: 16,
        animate: true,
      });
      lastFitCountRef.current = points.length;
    } catch (_) {}
  }, [active, points, bottomPadding, map]);
  return null;
}

// ── HomeScreen ─────────────────────────────────────────────────────────────
export default function HomeScreen({
  onStartWalk,
  onSetConstraints,
  onOpenTimeline,
  onOpenQuiz,
  initialLocation,
  initialSheetOpen,
  initialChatOpen,
  onSheetOpenConsumed,
  onChatOpenConsumed,
  // When true, HomeScreen renders ONLY the chat overlay (no map, no
  // bottom search, no FABs) — used by NavigationMapScreen to show the
  // homepage chat overlay layered on top of the walk without leaving it.
  chatOverlayOnly = false,
  // Fired after the chat overlay's slide-down close animation finishes,
  // so the parent (App.js) can unmount the chat-overlay-only HomeScreen.
  onChatClose,
  preferences,
  vibePreferences,
  nearbyPlaces,
  setNearbyPlaces,
  addedIds,
  setAddedIds,
  favedIds,
  setFavedIds,
  lastFetchedLocationRef,
  lastFetchTimeRef,
  settingsHighlight,
  quizPending,
}) {
  const [userLocation, setUserLocation]   = useState(initialLocation || null);
  // Per-mount key for MapContainer. Forces React to allocate a fresh
  // DOM node on every Home mount so that, when navigating back from
  // NavigationMapScreen, leaflet doesn't see a stale `_leaflet_id` on
  // the reused node and crash with "Map container is already
  // initialized".
  const homeMapKeyRef = useRef(`home-map-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [locateTrigger, setLocateTrigger] = useState(1); // trigger on mount
  const [showLocatePrompt, setShowLocatePrompt] = useState(false);
  const [locateError, setLocateError]           = useState("");
  const [locateActive, setLocateActive]         = useState(false);
  const [userScreenPos, setUserScreenPos] = useState({ x: 187, y: 406 });
  const [sheetOpen, setSheetOpen]         = useState(Boolean(initialSheetOpen));

  useEffect(() => {
    if (initialSheetOpen) onSheetOpenConsumed?.();
    if (initialChatOpen) onChatOpenConsumed?.();
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
  const [chatMode, setChatMode]                 = useState(Boolean(initialChatOpen));
  const [chatMessages, setChatMessages]         = useState([]);
  const [chatLoading, setChatLoading]           = useState(false);
  const [chatListening, setChatListening]       = useState(false);
  const [chatClosing, setChatClosing]           = useState(false);
  const [chatHistory, setChatHistory]           = useState([]);
  const [showHistory, setShowHistory]           = useState(false);
  const [viewingHistory, setViewingHistory]     = useState(null);
  const [listenTextMode, setListenTextMode]     = useState(false);
  const [suggestedStops, setSuggestedStops]     = useState([]);
  const [geocodedSuggestions, setGeocodedSuggestions] = useState([]);
  const [currentGeocodeReqId, setCurrentGeocodeReqId] = useState(0);
  const [planLoading, setPlanLoading]           = useState(false);
  // Cross-query selection state — keyed by place name so selections persist
  // when the user sends another prompt (suggestedStops gets replaced but
  // selections stay intact in this Set).
  const [selectedStopNames, setSelectedStopNames] = useState(() => new Set());
  // When set, the chat flips into the "plan confirmed" handoff screen.
  const [planConfirmed, setPlanConfirmed]       = useState(null);
  const [selectedPoi, setSelectedPoi]           = useState(null);
  const [flyToTarget, setFlyToTarget]           = useState(null);
  const [mapZoom, setMapZoom]                   = useState(15);
  const [focusedSuggestionId, setFocusedSuggestionId] = useState(null);
  const suggestRailRef = useRef(null);
  const cardRefs = useRef({});
  const chatMsgsDomRef = useRef(null);
  const railScrollingRef = useRef(false); // true while user is manually scrolling the rail
  const chatReqIdRef = useRef(0); // incremented when chat closes, used to discard stale Gemini responses
  // Derived early so child effects below can depend on it without TDZ.
  const _earlyScreenMode =
    planConfirmed                                    ? 'confirmed' :
    chatMessages.length === 0 && !chatLoading        ? 'empty'     :
    chatLoading || suggestedStops.length === 0       ? 'thinking'  :
    chatListening                                    ? 'refining'  :
                                                       'suggestions';
  const chatSplitActive = chatMode && _earlyScreenMode !== 'confirmed';
  const chatHistoryIdCounter = useRef(0);
  const chatIdCounter = useRef(0);
  const resultTimer = useRef(null);
  const nearbyAbortRef = useRef(null);
  const dragDebounceRef = useRef(null);
  const geocodeReqRef = useRef(0);
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;

  // Clean up resultTimer on unmount
  useEffect(() => { return () => clearTimeout(resultTimer.current); }, []);
  useEffect(() => () => { nearbyAbortRef.current?.abort(); }, []);
  useEffect(() => () => clearTimeout(dragDebounceRef.current), []);

  // Track bottom-search height and push button stack above it (per-frame, no re-renders).
  // While the chat sheet is open we let CSS pin the float bar above the sheet instead.
  useEffect(() => {
    const el = bottomSearchRef.current;
    if (!el) return;
    if (chatSplitActive) {
      if (buttonStackRef.current) buttonStackRef.current.style.bottom = "";
      return;
    }
    const ro = new ResizeObserver(entries => {
      const h = entries[0].borderBoxSize?.[0]?.blockSize ?? entries[0].contentRect.height;
      if (buttonStackRef.current) buttonStackRef.current.style.bottom = `${h + 12}px`;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [voiceExpanded, chatSplitActive]);

  const geocodeSuggestions = useCallback((places) => {
    const loc = userLocationRef.current;
    if (!loc || !places || places.length === 0) return;
    const reqId = ++geocodeReqRef.current;
    setCurrentGeocodeReqId(reqId);
    places.forEach((place, i) => {
      const pinId = `ai-${reqId}-${i}`;
      (async () => {
        // Step 1: pin immediately using Gemini's hint coords — zero latency, always visible.
        if (place.hintLat != null && place.hintLng != null) {
          if (geocodeReqRef.current !== reqId) return;
          setGeocodedSuggestions(prev => {
            if (prev.some(p => p.id === pinId)) return prev;
            return [...prev, { id: pinId, name: place.name, desc: place.desc, lat: place.hintLat, lng: place.hintLng }];
          });
        }
        // Step 2: refine with Nominatim in the background (replaces hint coords if successful).
        const result = await geocodePlace(place.name, loc[0], loc[1], place.hintLat, place.hintLng);
        if (geocodeReqRef.current !== reqId) return;
        if (!result) return;
        setGeocodedSuggestions(prev => {
          const existing = prev.find(p => p.id === pinId);
          if (existing) {
            return prev.map(p => p.id === pinId ? { ...p, lat: result.lat, lng: result.lng } : p);
          }
          if (prev.some(p => Math.abs(p.lat - result.lat) < 0.0002 && Math.abs(p.lng - result.lng) < 0.0002)) return prev;
          return [...prev, { id: pinId, name: place.name, desc: place.desc, lat: result.lat, lng: result.lng }];
        });
      })();
    });
  }, []);

  // Default focus to the first geocoded suggestion when results arrive.
  useEffect(() => {
    if (!chatSplitActive) { setFocusedSuggestionId(null); return; }
    if (geocodedSuggestions.length === 0) { setFocusedSuggestionId(null); return; }
    setFocusedSuggestionId(prev => {
      if (prev && geocodedSuggestions.some(g => g.id === prev)) return prev;
      return geocodedSuggestions[0].id;
    });
  }, [chatSplitActive, geocodedSuggestions]);

  // Carousel scroll → focused card: whichever card's left edge is nearest the
  // rail's left boundary is the "shown left card" the user is looking at.
  useEffect(() => {
    if (!chatSplitActive) return;
    const rail = suggestRailRef.current;
    if (!rail) return;
    let scrollEndTimer = null;
    const update = () => {
      const cards = Array.from(rail.querySelectorAll('[data-suggestion-id]'));
      if (!cards.length) return;
      const scrollLeft = rail.scrollLeft;
      // Focus the first card whose left edge hasn't yet crossed the left boundary.
      // The moment the previous card starts sliding off-screen (left < 0), the next
      // card (left >= 0) becomes focused. 2px tolerance absorbs scroll-snap rounding.
      let best = null;
      for (const card of cards) {
        if (card.offsetLeft - scrollLeft >= -2) { best = card; break; }
      }
      if (!best) best = cards[cards.length - 1];
      const sid = best.getAttribute('data-suggestion-id');
      if (sid && sid.startsWith('ai-')) setFocusedSuggestionId(sid);
    };
    const onScroll = () => {
      railScrollingRef.current = true;
      clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(() => { railScrollingRef.current = false; }, 200);
      update();
    };
    update();
    rail.addEventListener('scroll', onScroll, { passive: true });
    return () => { rail.removeEventListener('scroll', onScroll); clearTimeout(scrollEndTimer); };
  }, [chatSplitActive, geocodedSuggestions, suggestedStops]);

  // Sync map's expanded pin to the focused card.
  useEffect(() => {
    if (!chatSplitActive) return;
    if (focusedSuggestionId) setSelectedPoi(focusedSuggestionId);
  }, [chatSplitActive, focusedSuggestionId]);

  // Reverse direction: tapping a pin → scroll its card into view.
  // Suppressed while the user is manually scrolling the rail to avoid fighting them.
  useEffect(() => {
    if (!chatSplitActive || !selectedPoi || railScrollingRef.current) return;
    const el = cardRefs.current[selectedPoi];
    if (el && el.scrollIntoView) {
      try { el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (_) {}
    }
  }, [chatSplitActive, selectedPoi]);

  const loadNearbyPlaces = useCallback(async (loc, force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchTimeRef.current < 10000) return;

    // Supersede any in-flight request — a newer call owns the result set now
    nearbyAbortRef.current?.abort();
    const controller = new AbortController();
    nearbyAbortRef.current = controller;

    setNearbyLoading(true);
    setNearbyError("");

    let loadingCleared = false;

    try {
      // Single 1500 m fetch instead of three nested rings — the inner
      // 300/800 m radii were already a strict subset of the 1500 m result
      // and tripling the request count was driving Overpass to 429.
      try {
        const places = await fetchNearbyPlaces(loc[0], loc[1], 1500, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setNearbyPlaces(places);
        loadingCleared = true;
        setNearbyLoading(false);
        lastFetchedLocationRef.current = loc;
        lastFetchTimeRef.current = Date.now();
      } catch (err) {
        if (err?.name === "AbortError") return;
        console.warn(`[Strollo] nearby fetch failed:`, err);
        setNearbyError("Couldn't load nearby places. Tap refresh to retry.");
      }
    } finally {
      if (!controller.signal.aborted && !loadingCleared) setNearbyLoading(false);
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

    // In chat mode, mirror the homepage flow: silence = auto-send to Gemini.
    if (chatModeRef.current) {
      setChatListening(false);
      if (text) sendChatMessageRef.current?.(text);
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

        const chatReqId = chatReqIdRef.current;
        try {
          const systemPrompt = buildSystemPrompt({
            userLocation,
            journeyItems: [],
            elapsedMinutes: 0,
            currentStopIndex: 0,
            totalStops: 0,
            preferences,
            vibePreferences,
          });
          const response = await sendMessage([userMsg], systemPrompt);
          if (chatReqIdRef.current !== chatReqId) return;
          const places = extractPlaces(response);
          const displayText = cleanResponseText(response);
          const aiMsg = { id: ++chatIdCounter.current, role: "ai", text: displayText, places: places.length > 0 ? places : undefined };
          setChatMessages(prev => {
            const updated = [...prev, aiMsg];
            if (places.length > 0) {
              setSuggestedStops(places);
              geocodeSuggestions(places);
            }
            return updated;
          });
        } catch (err) {
          if (chatReqIdRef.current !== chatReqId) return;
          console.error("Gemini error:", err);
          const errMsg = { id: ++chatIdCounter.current, role: "ai", text: `Gemini error: ${err?.message || "unknown"}. Tap the mic to try again!` };
          setChatMessages(prev => [...prev, errMsg]);
        } finally {
          if (chatReqIdRef.current === chatReqId) setChatLoading(false);
        }
      }, 1000);
    } else {
      setListenCardMode(false);
      setListenTextMode(false);
      setVoiceActive(false);
    }
  }, [userLocation, geocodeSuggestions, preferences, vibePreferences]);

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

    const chatReqId = chatReqIdRef.current;
    try {
      const systemPrompt = buildSystemPrompt({
        userLocation,
        journeyItems: [],
        elapsedMinutes: 0,
        currentStopIndex: 0,
        totalStops: 0,
        preferences,
        vibePreferences,
      });
      // Send full conversation history so LLM has session context
      const fullHistory = [...chatMessagesRef.current, userMsg];
      const response = await sendMessage(fullHistory, systemPrompt);
      if (chatReqIdRef.current !== chatReqId) return;
      const places = extractPlaces(response);
      const displayText = cleanResponseText(response);
      const aiMsg = { id: ++chatIdCounter.current, role: "ai", text: displayText, places: places.length > 0 ? places : undefined };
      setChatMessages(prev => [...prev, aiMsg]);
      if (places.length > 0) {
        setSuggestedStops(places);
        geocodeSuggestions(places);
      }
    } catch (err) {
      if (chatReqIdRef.current !== chatReqId) return;
      console.error("Gemini error:", err);
      const errMsg = { id: ++chatIdCounter.current, role: "ai", text: "Gemini is busy right now. Tap the mic to try again!" };
      setChatMessages(prev => [...prev, errMsg]);
    } finally {
      if (chatReqIdRef.current === chatReqId) setChatLoading(false);
    }
  }, [userLocation, geocodeSuggestions, preferences, vibePreferences]);
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
    const chatReqId = chatReqIdRef.current;
    const systemPrompt = buildSystemPrompt({ userLocation, journeyItems: [], elapsedMinutes: 0, currentStopIndex: 0, totalStops: 0, preferences, vibePreferences });
    sendMessage([{ role: "user", text: trimmed }], systemPrompt).then(response => {
      if (chatReqIdRef.current !== chatReqId) return;
      const places = extractPlaces(response);
      const displayText = cleanResponseText(response);
      setChatMessages(prev => [...prev, { id: ++chatIdCounter.current, role: "ai", text: displayText, places: places.length > 0 ? places : undefined }]);
      if (places.length > 0) {
        setSuggestedStops(places);
        geocodeSuggestions(places);
      }
    }).catch(() => {
      if (chatReqIdRef.current !== chatReqId) return;
      setChatMessages(prev => [...prev, { id: ++chatIdCounter.current, role: "ai", text: "Gemini is busy right now. Tap the mic to try again!" }]);
    }).finally(() => { if (chatReqIdRef.current === chatReqId) setChatLoading(false); });
  }, [userLocation, geocodeSuggestions, preferences, vibePreferences]);

  const handlePlanWalk = useCallback(async (passedStops) => {
    const stops = passedStops || suggestedStops;
    if (stops.length === 0) return;
    setPlanLoading(true);

    try {
      // Resolve each stop's coordinates. Priority:
      //   1. Already-geocoded entry (hint coords placed immediately, possibly refined)
      //   2. Nominatim with hint coords as a sanity check
      //   3. Gemini's hint coords directly (never leave a stop unresolved if hints exist)
      const geocoded = [];
      for (const stop of stops) {
        const existing = geocodedSuggestions.find(g => g.name === stop.name);
        if (existing) {
          geocoded.push({ id: Date.now() + geocoded.length, name: stop.name, desc: stop.desc, lat: existing.lat, lng: existing.lng, walk: stop.walk });
          continue;
        }
        const result = await geocodePlace(stop.name, userLocation[0], userLocation[1], stop.hintLat, stop.hintLng);
        if (result) {
          geocoded.push({ id: Date.now() + geocoded.length, name: stop.name, desc: stop.desc, lat: result.lat, lng: result.lng, walk: stop.walk });
        } else if (stop.hintLat != null && stop.hintLng != null) {
          geocoded.push({ id: Date.now() + geocoded.length, name: stop.name, desc: stop.desc, lat: stop.hintLat, lng: stop.hintLng, walk: stop.walk });
        }
      }

      const nearby = geocoded.filter((s) => isWithinWalkingRadius(userLocation, s));

      if (nearby.length === 0) {
        const errMsg = { id: ++chatIdCounter.current, role: "ai", text: "Sorry, I couldn't find those places on the map. Try asking for specific place names!" };
        setChatMessages(prev => [...prev, errMsg]);
        setPlanLoading(false);
        return;
      }

      // Estimate distance + duration from straight-line stop-to-stop legs (~80 m/min walking)
      const haversineKmLocal = (a, b) => {
        const R = 6371, toRad = (d) => (d * Math.PI) / 180;
        const dLat = toRad(b[0] - a[0]); const dLng = toRad(b[1] - a[1]);
        const s = Math.sin(dLat/2)**2 + Math.cos(toRad(a[0]))*Math.cos(toRad(b[0]))*Math.sin(dLng/2)**2;
        return 2 * R * Math.asin(Math.sqrt(s));
      };
      let totalKm = haversineKmLocal(userLocation, [nearby[0].lat, nearby[0].lng]);
      for (let i = 1; i < nearby.length; i++) {
        totalKm += haversineKmLocal([nearby[i-1].lat, nearby[i-1].lng], [nearby[i].lat, nearby[i].lng]);
      }
      const distanceMi = +(totalKm * 0.621371).toFixed(1);
      const totalMin = Math.max(1, Math.round((totalKm * 1000) / 80));

      // Flip into screen 5 — plan-confirmed handoff. The Start-walk CTA in JSX
      // dispatches onStartWalk when pressed.
      setPlanConfirmed({
        stops: nearby,
        distanceMi,
        totalMin,
        title: nearby[0]?.name ? `${nearby[0].name.split(",")[0]} loop` : "Your walk",
        area: `${nearby.length} stops nearby`,
      });
    } catch (err) {
      console.error("Plan walk error:", err);
      const errMsg = { id: ++chatIdCounter.current, role: "ai", text: "Something went wrong while planning the route. Please try again." };
      setChatMessages(prev => [...prev, errMsg]);
    } finally {
      setPlanLoading(false);
    }
  }, [suggestedStops, geocodedSuggestions, userLocation]);

  // activeStops gathers every selected place across ALL AI messages (not just
  // the current rail), so selections persist when the user asks a follow-up.
  // Order = first-seen across messages, then current suggestedStops.
  const activeStops = useMemo(() => {
    const out = [];
    const seen = new Set();
    const consider = (p) => {
      if (!p || !p.name || seen.has(p.name)) return;
      if (!selectedStopNames.has(p.name)) return;
      out.push(p);
      seen.add(p.name);
    };
    for (const msg of chatMessages) {
      if (msg.role === 'ai' && Array.isArray(msg.places)) msg.places.forEach(consider);
    }
    suggestedStops.forEach(consider);
    return out;
  }, [chatMessages, suggestedStops, selectedStopNames]);

  const toggleStopByName = useCallback((name) => {
    if (!name) return;
    setSelectedStopNames(prev => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  }, []);
  const toggleStop = useCallback((i) => {
    const stop = suggestedStops[i];
    if (stop) toggleStopByName(stop.name);
  }, [suggestedStops, toggleStopByName]);

  // Scroll the LAST AI message bubble to the top of the messages viewport
  // when content changes, so the user sees the warm acknowledgement first
  // and the suggest rail just below. Falls back to scrolling the container
  // to its bottom if no bubble is found.
  useEffect(() => {
    const el = chatMsgsDomRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      const lastAi = el.querySelectorAll('.chat-msg--ai');
      const target = lastAi[lastAi.length - 1];
      if (target) {
        el.scrollTop = target.offsetTop - el.offsetTop;
      } else {
        el.scrollTop = el.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(id);
  }, [chatMessages, suggestedStops, chatLoading]);

  // Helper handlers (no-ops where the feature isn't yet built; safe to wire later)
  const startVoice = useCallback(() => {
    if (!speech.supported) return;
    setChatListening(true);
    speech.start();
  }, [speech]);
  const repeatWalk = useCallback(() => {}, []);
  const onReorder = useCallback(() => {}, []);
  const onVoiceTour = useCallback(() => {}, []);
  const onStartWalkConfirmed = useCallback(() => {
    if (!planConfirmed) return;
    setChatMode(false);
    setChatMessages([]);
    setSuggestedStops([]);
    setSelectedStopNames(new Set());
    geocodeReqRef.current++;
    setGeocodedSuggestions([]);
    const stops = planConfirmed.stops;
    setPlanConfirmed(null);
    onStartWalk(stops, userLocation);
  }, [planConfirmed, onStartWalk, userLocation]);
  const lastWalk = null; // placeholder until we surface a "last walk" record

  const screenMode = _earlyScreenMode;


  const closeChat = useCallback(() => {
    chatReqIdRef.current++;
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
      setSuggestedStops([]);
      setSelectedStopNames(new Set());
      geocodeReqRef.current++;
      // Tell the parent the chat is fully closed — used by App.js to unmount
      // the chat-overlay-only HomeScreen when the user is mid-walk.
      onChatClose?.();
      setGeocodedSuggestions([]);
    }, 350);
  }, []);

  const onScreenPos  = useCallback((pos) => setUserScreenPos(pos), []);
  const handleMapCenterChange = useCallback((center) => { mapCenterRef.current = center; }, []);
  const handleLocate = useCallback((pos) => {
    setUserLocation(pos);
    setShowLocatePrompt(false);
    setLocateActive(true);
  }, []);
  const handleMapDrag = useCallback(() => {
    setLocateActive(false);
    clearTimeout(dragDebounceRef.current);
    dragDebounceRef.current = setTimeout(() => {
      if (mapCenterRef.current) loadNearbyPlaces(mapCenterRef.current, true);
    }, 1500);
  }, [loadNearbyPlaces]);
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


  const bottomSearchRef = useRef(null);
  const buttonStackRef = useRef(null);

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
    // Drag-up to expand has been disabled — the sheet now opens only via the
    // handle tap or input focus. Drag-down still closes the sheet.
    if (endY - dragStartY.current > 20) setSheetOpen(false);
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
      setVoiceActive(false);
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

  const sequenceMap = useMemo(() => {
    const m = new Map();
    let i = 1;
    for (const id of addedIds) m.set(id, i++);
    return m;
  }, [addedIds]);

  // Last id in the user's added itinerary — gets the destination-pin glyph
  // on its pill. Set preserves insertion order, so iterating to the last
  // value matches "most recently added stop".
  const finalAddedId = useMemo(() => {
    let last = null;
    for (const id of addedIds) last = id;
    return last;
  }, [addedIds]);

  // Coords of every added nearby stop — drives the purple route-dot marks
  // beneath each added pill (mirrors NavigationMapScreen's CircleMarkers).
  const addedStopPositions = useMemo(() => {
    return nearbyPlaces
      .filter((p) => p.lat && p.lng && addedIds.has(p.id))
      .map((p) => ({ id: p.id, pos: [p.lat, p.lng] }));
  }, [nearbyPlaces, addedIds]);

  // Coords of the user's last/only added stop — drives the floating
  // destination-pin marker above its pill.
  const finalAddedPosition = useMemo(() => {
    if (!finalAddedId) return null;
    const place = nearbyPlaces.find((p) => p.id === finalAddedId && p.lat && p.lng);
    return place ? [place.lat, place.lng] : null;
  }, [nearbyPlaces, finalAddedId]);

  // Distance rank (0 = closest to user) — used for z-stacking so nearer pins appear on top
  const distanceRankMap = useMemo(() => {
    const m = new Map();
    if (!userLocation) return m;
    const ranked = nearbyPlaces
      .filter((p) => p.lat && p.lng)
      .map((p) => {
        const dLat = p.lat - userLocation[0];
        const dLng = p.lng - userLocation[1];
        return { id: p.id, dist2: dLat * dLat + dLng * dLng };
      })
      .sort((a, b) => a.dist2 - b.dist2);
    ranked.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [nearbyPlaces, userLocation]);

  // Icon cache: reuse identical-state icons so Leaflet only replaces DOM for pins that actually changed
  const iconCacheRef = useRef(new Map());

  // Spatial dedup: two-tier territory model.
  //   - Added pins always claim their label-cell first (never downgrade to mini).
  //   - Big cell (~90px) represents dot + name-label footprint → winner shows as labeled dot.
  //   - Small cell (~16px) dedupes the rest into tiny purple mini-dots (no icon/label).
  const { labeledDotIdSet, miniDotIdSet } = useMemo(() => {
    if (!userLocation) return { labeledDotIdSet: null, miniDotIdSet: null };
    const pxToDeg = 360 / (256 * Math.pow(2, mapZoom));
    const labelCellDeg = 90 * pxToDeg;
    const miniCellDeg = 16 * pxToDeg;
    const labelOwner = new Map();
    const miniOwner = new Map();
    const labeled = new Set();
    // Added pins reserve their label cells first (they always render as pills),
    // so nearby non-added pins can't crowd them.
    for (const p of nearbyPlaces) {
      if (!p.lat || !p.lng || !addedIds.has(p.id)) continue;
      const key = `${Math.floor(p.lat / labelCellDeg)},${Math.floor(p.lng / labelCellDeg)}`;
      if (!labelOwner.has(key)) labelOwner.set(key, p.id); // reserve only, don't mark as "labeled dot"
    }
    const ranked = nearbyPlaces
      .filter((p) => p.lat && p.lng && !addedIds.has(p.id))
      .map((p) => {
        const dLat = p.lat - userLocation[0];
        const dLng = p.lng - userLocation[1];
        return { id: p.id, lat: p.lat, lng: p.lng, dist2: dLat * dLat + dLng * dLng };
      })
      .sort((a, b) => a.dist2 - b.dist2);
    for (const p of ranked) {
      const key = `${Math.floor(p.lat / labelCellDeg)},${Math.floor(p.lng / labelCellDeg)}`;
      if (!labelOwner.has(key)) { labelOwner.set(key, p.id); labeled.add(p.id); }
    }
    const mini = new Set();
    for (const p of ranked) {
      if (labeled.has(p.id)) continue;
      const key = `${Math.floor(p.lat / miniCellDeg)},${Math.floor(p.lng / miniCellDeg)}`;
      if (!miniOwner.has(key)) { miniOwner.set(key, p.id); mini.add(p.id); }
    }
    return { labeledDotIdSet: labeled, miniDotIdSet: mini };
  }, [nearbyPlaces, mapZoom, userLocation, addedIds]);

  // Show all nearby places; tiering (pill / dot / hidden) decides visibility
  const visibleNearbyPlaces = nearbyPlaces;

  // Carousel ordering: closest place to the user first, farthest last.
  // Falls back to unsorted order when we don't yet have a user location.
  const allItems = useMemo(() => {
    if (!userLocation) return visibleNearbyPlaces;
    return [...visibleNearbyPlaces]
      .filter((p) => p.lat != null && p.lng != null)
      .sort((a, b) => {
        const dA = (a.lat - userLocation[0]) ** 2 + (a.lng - userLocation[1]) ** 2;
        const dB = (b.lat - userLocation[0]) ** 2 + (b.lng - userLocation[1]) ** 2;
        return dA - dB;
      });
  }, [visibleNearbyPlaces, userLocation]);

  return (
    <ChatOnlyWrapper enabled={chatOverlayOnly}>

      {/* ── MAP ── */}
      <div className="map-perspective-wrapper">
        <MapContainer key={homeMapKeyRef.current} center={userLocation || [0, 0]} zoom={userLocation ? 17 : 2} zoomControl={false} attributionControl={false} className="map-container">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" maxZoom={19} />
          {!chatSplitActive && visibleNearbyPlaces.filter((s) => s.lat && s.lng).map((s) => {
            const isAdded = addedIds.has(s.id);
            const isExpanded = selectedPoi === s.id;
            const sequence = sequenceMap.get(s.id);
            // Tier: pill when tapped or already added; otherwise labeled dot or mini.
            // After two zoom-outs from default 15 (so zoom ≤ 13), demote labels to mini dots —
            // the map is too crowded at that scale for any name text to be legible.
            let mode;
            if (isAdded || isExpanded) mode = 'pill';
            else if (mapZoom < 12) mode = 'hidden';
            else if (mapZoom < 14) {
              mode = (labeledDotIdSet?.has(s.id) || miniDotIdSet?.has(s.id)) ? 'mini' : 'hidden';
            }
            else if (labeledDotIdSet && labeledDotIdSet.has(s.id)) mode = 'dot';
            else if (miniDotIdSet && miniDotIdSet.has(s.id)) mode = 'mini';
            else mode = 'hidden';
            if (mode === 'hidden') return null;
            // Stable icon cache — keeps Leaflet from replacing DOM on unrelated state changes
            const cacheKey = `${s.id}|${s.name}|${s.desc}|${isAdded}|${isExpanded}|${sequence || 0}|${mode}`;
            let icon = iconCacheRef.current.get(cacheKey);
            if (!icon) {
              icon = makePinIcon(s.name, s.desc, isAdded, isExpanded, sequence, mode);
              iconCacheRef.current.set(cacheKey, icon);
            }
            const rank = distanceRankMap.get(s.id) ?? 0;
            const tierBase = isExpanded ? 5000 : isAdded ? 3000 : mode === 'pill' ? 1500 : mode === 'dot' ? 500 : 0;
            return (
              <Marker key={s.id} position={[s.lat, s.lng]}
                icon={icon}
                zIndexOffset={tierBase - rank}
                eventHandlers={{
                  click: (e) => {
                    const target = e.originalEvent?.target;
                    if (target?.closest?.('[data-action="toggle"]')) {
                      handleToggleAdd(s.id);
                      setSelectedPoi(null);
                      return;
                    }
                    setSelectedPoi(isExpanded ? null : s.id);
                  },
                }}
              />
            );
          })}

          {/* Solid purple route-dot beneath each added stop's pill — mirrors
              NavigationMapScreen's waypoint dots so home and nav share one
              visual cue for "this is on your itinerary". Rendered in the
              path overlay pane so existing pill markers sit on top. */}
          {!chatSplitActive && addedStopPositions.map(({ id, pos }) => (
            <CircleMarker
              key={`added-dot-${id}`}
              center={pos}
              pathOptions={{ color: "#8851D4", weight: 0, fillColor: "#8851D4", fillOpacity: 1 }}
              radius={5.5}
              interactive={false}
            />
          ))}

          {/* Floating destination-pin glyph above the final/only added stop's
              pill — separate Marker so the SVG sits OUTSIDE the pill chrome. */}
          {!chatSplitActive && finalAddedPosition && (
            <Marker
              key="added-final-dest-pin"
              position={finalAddedPosition}
              icon={finalDestPinIcon()}
              interactive={false}
              zIndexOffset={4000}
            />
          )}

          {geocodedSuggestions.map((s) => {
            const isExpanded = selectedPoi === s.id;
            const isCurrent = s.id.startsWith(`ai-${currentGeocodeReqId}-`);
            const isSelected = selectedStopNames.has(s.name);
            const sequence = isSelected
              ? activeStops.findIndex(p => p.name === s.name) + 1
              : null;
            return (
              <Marker key={s.id} position={[s.lat, s.lng]}
                icon={makeAiPinIcon(s.name, s.desc, isExpanded, isSelected, sequence || null)}
                zIndexOffset={isExpanded ? 1001 : (isSelected ? 600 : 1)}
                interactive={isCurrent}
                eventHandlers={isCurrent ? {
                  click: () => {
                    toggleStopByName(s.name);
                    const next = isExpanded ? null : s.id;
                    setSelectedPoi(next);
                    setFocusedSuggestionId(next);
                  },
                } : {}}
              />
            );
          })}
          {userLocation && <Marker position={userLocation} icon={youIcon} />}
          {userLocation && <TrackUserPosition userPos={userLocation} onScreenPos={onScreenPos} />}
          <LocateMe trigger={locateTrigger} zoom={17} onLocate={handleLocate} onError={(msg) => { setLocateError(msg); setShowLocatePrompt(true); }} />
          <WatchLocation onUpdate={setUserLocation} />
          <MapDragListener onDrag={handleMapDrag} />
          <MapCenterTracker onCenterChange={handleMapCenterChange} />
          <ZoomTracker onZoom={setMapZoom} />
          <MapClickListener onClick={() => setSelectedPoi(null)} />
          {/* In split mode the bottom 35vh is covered by the chat sheet. Pass
              that height so flyTo offsets the target to the visible center. */}
          {(() => {
            const sheetPx = chatSplitActive ? Math.max(window.innerHeight * 0.35, 260) : 0;
            const focused = chatSplitActive ? geocodedSuggestions.find(g => g.id === focusedSuggestionId) : null;
            return (
              <>
                <FlyTo target={flyToTarget} zoom={16} bottomOffset={sheetPx} />
                {focused && <MapFocusFly target={[focused.lat, focused.lng]} zoom={16} bottomOffset={sheetPx} />}
                <MapFitToSuggestions
                  active={chatSplitActive && geocodedSuggestions.length > 0}
                  points={(userLocation ? [userLocation] : []).concat(geocodedSuggestions.map(g => [g.lat, g.lng]))}
                  bottomPadding={sheetPx}
                />
              </>
            );
          })()}
        </MapContainer>
      </div>

      {/* ── TOP BAR: profile FAB (right) ── */}
      <div className="top-bar">
        <button
          type="button"
          className="fab-circle top-right-btn"
          aria-label="Profile"
        >
          <span className="top-right-initials">ST</span>
        </button>
      </div>

      {/* ── RADIAL GRADIENT on user ── */}
      <div className="user-gradient-overlay" style={{
        background: `radial-gradient(circle at ${x}px ${y}px,
          rgba(136,81,212,0.20) 0%,
          rgba(136,81,212,0.08) 25%,
          rgba(136,81,212,0.02) 50%,
          transparent 68%)`,
      }} />

      {/* ── BOTTOM FLOAT BAR: Start exploring + Preferences + Locate ── */}
      {!voiceActive && !voiceExpanded && (
        <div
          className={`bottom-float-bar ${chatSplitActive ? "bottom-float-bar--above-chat" : ""}`}
          ref={buttonStackRef}
        >
          {!chatSplitActive && (
            <button className="fab-circle start-walk-pill" onClick={handleStartWalk}>
              {addedIds.size > 0 ? `Start exploring · ${addedIds.size}` : 'Start exploring'}
            </button>
          )}
          <div className="bottom-right-stack">
            {!chatSplitActive && quizPending && (
              <button
                className="fab-circle bottom-right-btn quiz-gateway-btn"
                aria-label="Retake vibe quiz"
                onClick={onOpenQuiz}
              >
                <div className="quiz-gateway-blob quiz-gateway-blob--1" />
                <div className="quiz-gateway-blob quiz-gateway-blob--2" />
                <div className="quiz-gateway-blob quiz-gateway-blob--3" />
                <span className="quiz-gateway-icon" aria-hidden="true">💡</span>
              </button>
            )}
            {!chatSplitActive && (
            <button
              className={`fab-circle bottom-right-btn${settingsHighlight ? " bottom-right-btn--halo" : ""}`}
              aria-label="Preferences"
              onClick={onSetConstraints}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="6" x2="20" y2="6"/>
                <line x1="4" y1="12" x2="20" y2="12"/>
                <line x1="4" y1="18" x2="20" y2="18"/>
                <circle cx="9"  cy="6"  r="2" fill="#8851D4"/>
                <circle cx="15" cy="12" r="2" fill="#8851D4"/>
                <circle cx="8"  cy="18" r="2" fill="#8851D4"/>
              </svg>
            </button>
            )}
            <button
              className="fab-circle bottom-right-btn"
              aria-label="Focus on my location"
              onClick={() => { setLocateError(""); setLocateTrigger((t) => t + 1); }}
            >
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
          ref={bottomSearchRef}
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

          <div className="search-handle" />

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
                <button className="mic-btn" aria-label="Start exploring" onClick={handleStartWalk}>
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
            {/* Suggested-spots carousel removed — chat overlay is now the
                primary surface for discovering places. */}
          </div>
        </div>
      )}

      {/* ── CHAT MODE — 5-screen pre-walk planning flow ── */}
      {chatMode && (
        <div
          className={`chat-overlay ${chatClosing ? "chat-overlay--closing" : ""} ${chatSplitActive ? "chat-overlay--split" : ""}`}
          onPointerDown={(e) => {
            // Drag-down-to-close gesture: only when the gesture starts on
            // the grab handle at the top edge of the overlay, never on a
            // button or interactive child.
            if (!e.target.closest(".chat-grabber")) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.dataset.dragStartY = String(e.clientY);
          }}
          onPointerMove={(e) => {
            const start = Number(e.currentTarget.dataset.dragStartY);
            if (!start) return;
            if (e.clientY - start > 60) {
              delete e.currentTarget.dataset.dragStartY;
              closeChat();
            }
          }}
          onPointerUp={(e) => { delete e.currentTarget.dataset.dragStartY; }}
          onPointerCancel={(e) => { delete e.currentTarget.dataset.dragStartY; }}
        >
          {/* Drag handle along the top edge — pull down to dismiss the chat. */}
          <div className="chat-grabber" aria-hidden="true">
            <div className="chat-grabber-bar" />
          </div>

          {/* Header (shared all 5 screens) */}
          <div className="chat-header">
            <div className="chat-header-title">
              <div className="chat-header-eyebrow">Plan your exploration</div>
              <div className="chat-header-label">
                {screenMode === 'confirmed' ? 'walk ready' : 'conversation'}
              </div>
            </div>
            <button
              type="button"
              className="chat-header-close"
              onClick={closeChat}
              aria-label="Close conversation"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {/* SCREEN 1 — Empty / first open */}
          {screenMode === 'empty' && (
            <div className="chat-empty">
              <div className="chat-empty-hero">
                <div className="chat-empty-avatar">S</div>
                <h2 className="chat-empty-title">where shall we<br/>wander today?</h2>
                <p className="chat-empty-sub">ask for a vibe, a destination, or just say <em>surprise me</em></p>
              </div>

              <div className="chat-section-label">try one</div>
              <div className="chat-seeds">
                {[
                  { icon:'☕', label:'cafés around me' },
                  { icon:'🌳', label:'a green walk' },
                  { icon:'📚', label:'bookshops nearby' },
                  { icon:'🌅', label:'sunset spot' },
                  { icon:'🎨', label:'street art trail' },
                  { icon:'🥐', label:'bakery hop' },
                ].map(s => (
                  <button key={s.label} className="chat-seed" onClick={() => sendChatMessage(s.label)}>
                    <span className="chat-seed-icon">{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>

              {lastWalk && (
                <div className="chat-empty-divider">
                  <div className="chat-section-label">last walk · {lastWalk.timeAgo}</div>
                  <button className="chat-last-walk" onClick={() => repeatWalk(lastWalk)}>
                    <div className="chat-last-walk-thumb"/>
                    <div className="chat-last-walk-meta">
                      <div className="chat-last-walk-title">{lastWalk.title}</div>
                      <div className="chat-last-walk-sub">{lastWalk.stops} stops · {lastWalk.miles} mi · {lastWalk.minutes} min</div>
                    </div>
                    <span className="chat-last-walk-cta">repeat</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SCREENS 2–4 — Conversation (messages + cards + listening) */}
          {(screenMode === 'thinking' || screenMode === 'suggestions' || screenMode === 'refining') && (
            <div className="chat-messages" ref={chatMsgsDomRef}>
              {chatMessages.map((msg, idx) => {
                const isLastAi = msg.role === 'ai' && idx === chatMessages.length - 1;
                return (
                  <React.Fragment key={msg.id}>
                    <div className={`chat-msg chat-msg--${msg.role}`}>
                      {msg.role === 'ai' && <div className="chat-avatar">S</div>}
                      <div className={`chat-bubble chat-bubble--${msg.role}`}>{msg.text}</div>
                    </div>

                    {/* Past suggestions shown as compact chips — no cards, no horizontal scroll.
                        Click toggles selection (state persists across queries) AND flies the
                        map to the location for orientation. */}
                    {!isLastAi && msg.places?.length > 0 && (
                      <div className="chat-archived-pills">
                        {msg.places.map((stop, i) => {
                          const isSelected = selectedStopNames.has(stop.name);
                          return (
                            <button
                              key={i}
                              className={`chat-archived-pill ${isSelected ? 'chat-archived-pill--selected' : ''}`}
                              onClick={() => {
                                toggleStopByName(stop.name);
                                const geo = geocodedSuggestions.find(g => g.name === stop.name);
                                const lat = geo?.lat ?? stop.hintLat;
                                const lng = geo?.lng ?? stop.hintLng;
                                if (lat != null && lng != null) {
                                  setFlyToTarget({ lat, lng, ts: Date.now() });
                                }
                              }}
                            >
                              {stop.name.split(',')[0]}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {isLastAi && suggestedStops.length > 0 && !chatLoading && (
                      <div className="chat-suggest-rail" ref={suggestRailRef}>
                        {suggestedStops.map((stop, i) => {
                          const on = selectedStopNames.has(stop.name);
                          const compact = screenMode === 'refining';
                          const geo = geocodedSuggestions.find(g => g.id === `ai-${currentGeocodeReqId}-${i}`)
                            || geocodedSuggestions.find(g => g.name === stop.name);
                          const walkLabel = (userLocation && geo)
                            ? `${Math.max(1, Math.round((haversineKm(userLocation, [geo.lat, geo.lng]) * 1000) / 80))} min`
                            : (stop.walk || null);
                          const sid = geo ? geo.id : `stop-${i}`;
                          return (
                            <button
                              key={`${stop.name}-${i}`}
                              ref={(el) => { if (el) cardRefs.current[sid] = el; else delete cardRefs.current[sid]; }}
                              data-suggestion-id={sid}
                              className={`chat-suggest-card ${on ? 'on' : 'off'} ${compact ? 'compact' : ''} ${focusedSuggestionId === sid ? 'focused' : ''}`}
                              onClick={() => toggleStop(i)}
                            >
                              <div className="chat-card-top">
                                <div className="chat-card-name">{stop.name}</div>
                                <div className="chat-card-action">
                                  {on ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                                      <polyline points="5 12 10 17 19 7"/>
                                    </svg>
                                  ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                    </svg>
                                  )}
                                </div>
                              </div>
                              {stop.reason && (
                                <div className="chat-card-reason">{stop.reason}</div>
                              )}
                              <div className="chat-card-cat">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="1.7" strokeLinejoin="round">
                                  <path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z"/>
                                  <path d="M16 11h2a2.5 2.5 0 0 1 0 5h-2"/>
                                </svg>
                                <span>{stop.desc || stop.category || 'Cafe'}</span>
                                {walkLabel && <><span className="dot">·</span><span>{walkLabel}</span></>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}

              {chatLoading && (
                <>
                  <div className="chat-msg chat-msg--ai">
                    <div className="chat-avatar">S</div>
                    <div className="chat-bubble chat-bubble--ai chat-typing">
                      <span/><span/><span/>
                    </div>
                  </div>
                  <div className="chat-status">
                    <span className="chat-status-dot"/>
                    <span>scanning your neighborhood…</span>
                  </div>
                  <div className="chat-skeleton-rail">
                    {[0,1,2].map(i => (
                      <div key={i} className="chat-skeleton-card" style={{animationDelay: `${i*0.2}s`}}>
                        <div className="chat-skeleton-top">
                          <div>
                            <div className="chat-skeleton-line w70"/>
                            <div className="chat-skeleton-line w45"/>
                          </div>
                          <div className="chat-skeleton-action"/>
                        </div>
                        <div className="chat-skeleton-cat">
                          <div className="chat-skeleton-icon"/>
                          <div className="chat-skeleton-line w30 short"/>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {chatListening && speech.transcript && (
                <div className="chat-msg chat-msg--user">
                  <div className="chat-bubble chat-bubble--user chat-bubble--live">{speech.transcript}</div>
                </div>
              )}
            </div>
          )}

          {/* SCREEN 5 — Plan confirmed */}
          {screenMode === 'confirmed' && planConfirmed && (
            <div className="chat-confirmed">
              <div className="chat-msg chat-msg--ai">
                <div className="chat-avatar">S</div>
                <div className="chat-bubble chat-bubble--ai">
                  your walk is ready — <b>{planConfirmed.stops.length} stops</b>, <b>~{planConfirmed.totalMin} min</b>, looped back home.
                </div>
              </div>

              <div className="chat-plan-card">
                <div className="chat-plan-head">
                  <div>
                    <div className="chat-plan-area">{planConfirmed.area}</div>
                    <div className="chat-plan-title">{planConfirmed.title}</div>
                  </div>
                  <div className="chat-plan-stats">
                    <div className="chat-plan-distance">{planConfirmed.distanceMi}<span>mi</span></div>
                    <div className="chat-plan-time">~{planConfirmed.totalMin} min</div>
                  </div>
                </div>
                <div className="chat-plan-stops">
                  {planConfirmed.stops.map((s, i) => (
                    <div key={s.id || s.name} className="chat-plan-stop">
                      <div className="chat-plan-num-col">
                        <div className="chat-plan-num">{i+1}</div>
                        {i < planConfirmed.stops.length - 1 && <div className="chat-plan-line"/>}
                      </div>
                      <div className="chat-plan-stop-meta">
                        <div className="chat-plan-stop-name">{s.name}</div>
                        <div className="chat-plan-stop-loc">{s.loc || s.desc || s.category || 'Cafe'}</div>
                      </div>
                      {s.walk && <div className="chat-plan-stop-walk">{s.walk}</div>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="chat-plan-actions">
                <button className="chat-plan-action" onClick={onReorder}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                    <path d="M3 12 L9 6 L9 9 L21 9 L21 15 L9 15 L9 18 Z"/>
                  </svg>
                  reorder
                </button>
              </div>
            </div>
          )}

          {/* Voice listening surface (Screen 4) — gradient-blob bottom sheet
              that REPLACES the input row while listening, mirroring the
              homepage "What's on your mind?" sheet aesthetic. */}
          {screenMode === 'refining' && (
            <div className="chat-listen-sheet">
              <div className="chat-listen-blobs">
                <div className="listen-blob listen-blob--1"/>
                <div className="listen-blob listen-blob--2"/>
                <div className="listen-blob listen-blob--3"/>
              </div>
              <div className="chat-listen-handle"><div className="chat-listen-bar"/></div>
              <button
                className="chat-listen-keyboard"
                aria-label="Switch to typing"
                onClick={() => {
                  const partial = speech.transcript.trim();
                  speech.stop();
                  if (partial) setQuery(partial);
                  speech.reset();
                  setChatListening(false);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="14" rx="2"/>
                  <line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/>
                  <line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/>
                  <line x1="6" y1="12" x2="6.01" y2="12"/><line x1="10" y1="12" x2="10.01" y2="12"/>
                  <line x1="14" y1="12" x2="14.01" y2="12"/><line x1="18" y1="12" x2="18.01" y2="12"/>
                  <line x1="8" y1="16" x2="16" y2="16"/>
                </svg>
              </button>
              <button
                className="chat-listen-close"
                aria-label="Stop listening"
                onClick={() => {
                  const text = speech.getTranscript().trim();
                  speech.stop();
                  setChatListening(false);
                  if (text) sendChatMessage(text);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <div className="chat-listen-content">
                <p className="chat-listen-caption">{speech.transcript || "What's on your mind?"}</p>
              </div>
            </div>
          )}

          {/* Start-walk CTA (Screen 5) */}
          {screenMode === 'confirmed' && (
            <div className="chat-cta-strip chat-cta-strip--start">
              <button className="chat-start-btn" onClick={onStartWalkConfirmed}>
                <span className="chat-start-play">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#34233E"><path d="M8 5 L19 12 L8 19 Z"/></svg>
                </span>
                <span>start walk</span>
                <span className="chat-start-meta">· {planConfirmed?.distanceMi} mi</span>
              </button>
            </div>
          )}

          {/* Bottom input row — hidden on confirmed AND while listening
              (the listen-sheet replaces it during voice refinement). */}
          {screenMode !== 'confirmed' && screenMode !== 'refining' && (
            <div className="chat-input-row chat-input-row--home-style">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="search-input"
                placeholder={chatListening ? 'listening…' : "I'm in the mood for..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) sendChatMessage(query); }}
                disabled={chatListening || chatLoading}
              />
              {query.trim() ? (
                <button className="mic-btn" aria-label="Send" onClick={() => sendChatMessage(query)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </button>
              ) : (
                <button
                  className="mic-btn"
                  disabled={chatLoading}
                  onClick={() => {
                    if (chatListening) {
                      const text = speech.getTranscript().trim();
                      speech.stop(); setChatListening(false);
                      if (text) sendChatMessage(text);
                    } else {
                      if (!speech.supported) return;
                      setChatListening(true); speech.start();
                    }
                  }}
                  aria-label="Voice input"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2" strokeLinecap="round">
                    <line x1="6"  y1="9"  x2="6"  y2="15"/>
                    <line x1="10" y1="6"  x2="10" y2="18"/>
                    <line x1="14" y1="8"  x2="14" y2="16"/>
                    <line x1="18" y1="10" x2="18" y2="14"/>
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Plan-walk CTA — floats above the chat sheet (split mode) or above the
          input row (full-screen mode), so it never covers the conversation. */}
      {chatMode && screenMode === 'suggestions' && activeStops.length > 0 && (
        <div className={`chat-cta-strip ${chatSplitActive ? 'chat-cta-strip--above-chat' : ''}`}>
          <button className="chat-plan-btn" onClick={() => handlePlanWalk(activeStops)} disabled={planLoading}>
            {planLoading ? (
              <><div className="plan-spinner"/><span>finding places on map…</span></>
            ) : (
              <span>Plan this walk · {activeStops.length} {activeStops.length === 1 ? "stop" : "stops"}</span>
            )}
          </button>
        </div>
      )}

      {/* ── Voice unsupported toast ── */}
      {voiceUnsupported && (
        <div className="voice-toast">Voice input is not supported in this browser</div>
      )}
    </ChatOnlyWrapper>
  );
}

// Module-scope wrapper so React doesn't see a "new" component type on every
// HomeScreen render (which would unmount + remount the entire chat overlay
// and cause the visible glitch when used as a chat-only portal).
function ChatOnlyWrapper({ enabled, children }) {
  return enabled
    ? <div className="home-chat-only-portal">{children}</div>
    : <>{children}</>;
}
