// FEATURE: walk-nav
// LAST UPDATED BY: Seemin Masood
// UPDATE DATE: 2026-05-07
// BUILD: 39ece31e
// DEPENDS ON: ./WalkCompanionWidget, ./mapUtils, ./geminiService, ./useJourneyVoice, ./HomeScreen (chat-overlay mode for in-walk chat)
// CONSUMED BY: ./App.js
//
// Active-walk screen. Renders the Leaflet map with the route polyline, the
// next-stop pin and arrival geofence, the journey-flag and locate FABs, and
// mounts WalkCompanionWidget along the bottom for nav chrome. Owns the GPS
// watch + arrival detection + AI-narration trigger. OUT OF SCOPE: nav TTS
// (handled inside WalkCompanionWidget), conversation reel (also inside
// WalkCompanionWidget), home-discovery state.

import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./NavigationMapScreen.css";
import WalkCompanionWidget from "./WalkCompanionWidget";
import { getWalkingRoute, geocodePlace } from "./geminiService";
import { useJourneyVoice } from "./useJourneyVoice";
import { youIcon, youIconBelow, WatchLocation, haversineKm, ZoomTracker } from "./mapUtils";

// ── Stop label icon for journey locations on map ──────────────────────────
// Category → Material Symbol glyph (mirrors the one used on HomeScreen for added pins).
const NAV_CATEGORY_ICONS = {
  "Coffee": "local_cafe", "Restaurant": "restaurant", "Bar": "local_bar",
  "Ice Cream": "icecream", "Bakery": "bakery", "Bookstore": "menu_book",
  "Library": "local_library", "Theatre": "theater_comedy", "Florist": "local_florist",
  "Museum": "museum", "Gallery": "palette", "Art": "brush",
  "Viewpoint": "landscape", "Attraction": "attractions", "Arts": "theater_comedy",
  "Park": "park", "Garden": "yard",
};

// Shared "remove" pip — same X icon and button treatment as the HomeScreen
// pin pill so adding/removing stops looks identical across screens.
const REMOVE_BTN_HTML = `<div class="sugg-pin-extra">
  <button class="sugg-pin-add-btn sugg-pin-add-btn--remove" data-action="remove" aria-label="Remove from itinerary">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5A4B64" stroke-width="3.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
  </button>
</div>`;

// Stop pin — mirrors the HomeScreen makePinIcon tier ladder so nav and home
// share one visual vocabulary. mode: 'pill' (full white-bg pill with name),
// 'dot' (yellow circle + name beneath), 'mini' (bare purple dot), 'hidden'.
// `sequence` (when provided) puts the number inside the yellow circle in
// place of the category icon. `muted` is purely a visual variant for the
// non-active stops (faded purple-dot version of mini).
// Floating destination-pin marker — sits ABOVE the final stop's pill as its
// own Leaflet Marker (rendered separately from the pill icon so the SVG
// lives outside the pill chrome). Mirrors TimelineScreen's FinalStopPin so
// all surfaces share one "this is your end" cue.
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

const stopLabelIcon = (name, desc, sequence, mode = 'pill', removable = false, muted = false) => {
  const icon = NAV_CATEGORY_ICONS[desc] || "location_on";
  if (mode === 'mini') {
    return L.divIcon({
      className: "",
      html: `<div class="sugg-pin sugg-pin--mini${muted ? ' sugg-pin--muted' : ''}" aria-label="${name}">
        <div class="sugg-pin-dot"></div>
      </div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }
  if (mode === 'dot') {
    return L.divIcon({
      className: "",
      html: `<div class="sugg-pin sugg-pin--dot${muted ? ' sugg-pin--muted' : ''}" aria-label="${name}">
        <div class="sugg-pin-dot">
          ${sequence
            ? `<span class="sugg-pin-dot-number">${sequence}</span>`
            : `<span class="material-symbols-rounded sugg-pin-dot-icon">${icon}</span>`}
        </div>
        <span class="sugg-pin-label">${name}</span>
      </div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }
  // pill (default)
  const classes = ["sugg-pin", "sugg-pin--added"];
  if (mode === 'open') classes.push("sugg-pin--open");
  return L.divIcon({
    className: "",
    html: `<div class="${classes.join(' ')}">
      <div class="sugg-pin-dot">
        ${sequence
          ? `<span class="sugg-pin-dot-number">${sequence}</span>`
          : `<span class="material-symbols-rounded sugg-pin-dot-icon">${icon}</span>`}
      </div>
      <span class="sugg-pin-name">${name}</span>
      ${mode === 'open' && removable ? REMOVE_BTN_HTML : ""}
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

// Auto-zoom the map to fit both the user and the next destination in the visible
// area above the bottom card, at the highest zoom level that still fits. Padding
// reserves vertical space for the navigation card (~260px including gap) and the
// top bar (~60px), so the route sits centered between them.
// AI-suggested pin — purple sparkle bubble that floats above the spot
// Gemini just recommended. Visually distinct from confirmed-stop pins so
// the user knows it's an AI suggestion (not yet added to their route).
const aiPinIcon = (name) => L.divIcon({
  className: "",
  html: `<div class="ai-pin">
    <span class="ai-pin-glyph">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
        <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2z"/>
      </svg>
    </span>
    <span class="ai-pin-name">${name}</span>
  </div>`,
  iconSize: [0, 0],
  iconAnchor: [0, 0],
});

// Pans the map so a target latlng sits in the vertical CENTER of the band
// above the bottom-pinned WalkCompanionWidget. Computed by projecting the
// target to screen pixels, shifting Y down by half the widget's height
// (which moves the pin up on screen), and unprojecting to a new center.
function PanAboveWidget({ target, widgetHeight }) {
  const map = useMap();
  useEffect(() => {
    if (!target || !map) return;
    try {
      const z = map.getZoom();
      const pt = map.project([target.lat, target.lng], z);
      const offsetY = (widgetHeight + 16) / 2;
      const newCenter = map.unproject([pt.x, pt.y + offsetY], z);
      map.flyTo(newCenter, z, { duration: 0.6 });
    } catch (e) { /* ignore */ }
  }, [target, widgetHeight, map]);
  return null;
}

function NavFitRoute({ userLocation, destination, trigger }) {
  const map = useMap();
  // Fit once when both coords first arrive, then only when the user explicitly
  // bumps `trigger` (locate FAB). Without this guard, every GPS tick re-fit
  // the map and stomped on any user pan/drag.
  const fittedRef = useRef(false);
  const lastTriggerRef = useRef(trigger);
  const userLocationRef = useRef(userLocation);
  const destinationRef = useRef(destination);
  userLocationRef.current = userLocation;
  destinationRef.current = destination;
  useEffect(() => {
    const ul = userLocationRef.current;
    const dest = destinationRef.current;
    if (!ul || !dest) return;
    const triggerBumped = trigger !== lastTriggerRef.current;
    lastTriggerRef.current = trigger;
    if (fittedRef.current && !triggerBumped) return;
    fittedRef.current = true;
    const bounds = L.latLngBounds([ul, dest]);
    map.fitBounds(bounds, {
      paddingTopLeft: [50, 60],
      paddingBottomRight: [50, 260],
      maxZoom: 18,
      animate: true,
      duration: 0.6,
    });
  }, [trigger, userLocation, destination, map]);
  return null;
}

// Pure "locate me" — always flies to the user's coords on every trigger
// bump, even when there's no journey destination. Pans with a vertical
// offset so the user dot ends up in the CENTER of the band above the
// bottom-pinned widget (not the geometric center of the whole screen).
function LocateMeOnTrigger({ userLocation, trigger, widgetHeight }) {
  const map = useMap();
  const firstRef = useRef(true);
  // Refs so a GPS tick or widget-height tweak doesn't re-fly the map and
  // fight the user's drag. Only the manual `trigger` bump should refire.
  const userLocationRef = useRef(userLocation);
  const widgetHeightRef = useRef(widgetHeight);
  userLocationRef.current = userLocation;
  widgetHeightRef.current = widgetHeight;
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; }
    const ul = userLocationRef.current;
    if (!ul || !map) return;
    try {
      const z = 17;
      const pt = map.project(ul, z);
      const offsetY = (widgetHeightRef.current + 16) / 2;
      const newCenter = map.unproject([pt.x, pt.y + offsetY], z);
      map.flyTo(newCenter, z, { duration: 0.6 });
    } catch (e) { /* ignore */ }
  }, [trigger, map]);
  return null;
}

// Bearing from point A to point B in degrees clockwise from north (0..360).
function computeBearing([lat1, lng1], [lat2, lng2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ── NavigationMapScreen ────────────────────────────────────────────────────
export default function NavigationMapScreen({ onGoBack, onEndWalk, onSetConstraints, onOpenTimeline, journeyItems = [], startLocation, onJourneyChange, addedIds, setAddedIds, visitedIds, setVisitedIds, setVisitedAt, setStopDwellMs, vibePreferences, preferences, showVoice = true, widgetPreview = null, onSetWidgetPreview }) {
  // Confirmed stops match the Timeline's confirmed list: items the user has
  // explicitly added (in addedIds) AND that have valid coordinates. Falling
  // back to "all journey items with coords" preserves behavior if addedIds
  // wasn't passed.
  const confirmedStops = React.useMemo(() => {
    const withCoords = journeyItems.filter((s) => s.lat && s.lng);
    return addedIds ? withCoords.filter((s) => addedIds.has(s.id)) : withCoords;
  }, [journeyItems, addedIds]);
  // Exploration mode: user landed on this screen with NO journey planned
  // (came from "Start exploring · 0" or similar). In this mode they're
  // just browsing/conversing — saving a place via the conversation pill
  // adds it to the trip but should NOT start navigation. Route drawing
  // and `nextTarget` stay null until the user explicitly hits the
  // floating "Start exploring · N" button (which mirrors home's flow).
  const initialJourneyHadItemsRef = React.useRef(journeyItems.length > 0);
  const [isExplorationMode, setIsExplorationMode] = useState(
    !initialJourneyHadItemsRef.current
  );
  // The actual routing target: first confirmed stop NOT yet visited. As the
  // user confirms "I am here", we advance to the next non-visited stop.
  // Suppressed in exploration mode so saving doesn't kick off navigation.
  const nextTarget = React.useMemo(
    () => isExplorationMode ? null : (confirmedStops.find((s) => !visitedIds?.has(s.id)) || null),
    [confirmedStops, visitedIds, isExplorationMode]
  );
  // The user's last stop in the trip — pin glyph appears on this stop's
  // pill (also covers the only-stop case, where final == nextTarget).
  const finalStopId = confirmedStops.length > 0
    ? confirmedStops[confirmedStops.length - 1].id
    : null;

  // Dev-only diagnostic: log the journey state every time it changes so
  // we can see whether saved stops actually land in confirmedStops in
  // the right order (and which ones have geocoded coords yet).
  useEffect(() => {
    console.log("[Nav] journeyItems=", journeyItems.map((j) => `${j.name}(${j.lat ? "✓" : "—"})`));
    console.log("[Nav] confirmedStops=", confirmedStops.map((s) => s.name));
    console.log("[Nav] nextTarget=", nextTarget?.name || "(none)");
  }, [journeyItems, confirmedStops, nextTarget]);
  // Stable per-stop icon cache. Without this, every render generates a
  // fresh L.divIcon for each marker, react-leaflet calls marker.setIcon()
  // and replaces the underlying DOM. If the user happens to start a drag
  // mid-render Leaflet's drag handler walks a now-detached parent chain
  // and throws "Cannot read properties of null (reading 'offsetWidth')".
  const stopIconCacheRef = useRef(new Map());
  const getStopIcon = useCallback((name, desc, sequence, mode, removable, muted) => {
    const key = `${name}|${desc}|${sequence ?? ''}|${mode}|${removable ? 'r' : ''}|${muted ? 'm' : ''}`;
    const cache = stopIconCacheRef.current;
    let icon = cache.get(key);
    if (!icon) {
      icon = stopLabelIcon(name, desc, sequence, mode, removable, muted);
      cache.set(key, icon);
    }
    return icon;
  }, []);

  // Final-destination pin and AI-suggestion pin are both static glyphs —
  // memoise their L.divIcon instances so react-leaflet never feels the
  // need to swap their DOM nodes on render (same drag-crash mitigation
  // as the per-stop cache above).
  const finalDestIconRef = useRef(null);
  const getFinalDestIcon = useCallback(() => {
    if (!finalDestIconRef.current) finalDestIconRef.current = finalDestPinIcon();
    return finalDestIconRef.current;
  }, []);
  const aiPinIconCacheRef = useRef(new Map());
  const getAiPinIcon = useCallback((name) => {
    const cache = aiPinIconCacheRef.current;
    let icon = cache.get(name);
    if (!icon) {
      icon = aiPinIcon(name);
      cache.set(name, icon);
    }
    return icon;
  }, []);

  // Initial map center — real anchor when we have one (saved start, first
  // journey item), otherwise [0, 0] so Leaflet still mounts. The boots
  // marker is gated on `hasRealUserLocation` below so it never paints on
  // the (0, 0) fallback (the Atlantic off Africa) before WatchLocation /
  // LocateMe deliver real coords.
  const initialCenter = startLocation || (journeyItems.length > 0 && journeyItems[0].lat
    ? [journeyItems[0].lat, journeyItems[0].lng]
    : [0, 0]);
  const isRealLatLng = (p) => Array.isArray(p) && p.length === 2
    && typeof p[0] === 'number' && typeof p[1] === 'number'
    && !(p[0] === 0 && p[1] === 0);
  const [userLocation, setUserLocation] = useState(
    isRealLatLng(initialCenter) ? initialCenter : null
  );
  const hasRealUserLocation = isRealLatLng(userLocation);
  // Unique-per-mount key for the MapContainer. Prevents the
  // "Map container is already initialized" crash that fires in
  // production when React 18 reuses a DOM node across screen
  // transitions: leaflet's `_leaflet_id` is attached to that node and
  // the new map's `_initContainer` rejects re-init. A fresh key forces
  // React to allocate a new DOM node, breaking the reuse.
  const mapKeyRef = useRef(`nav-map-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [locateTrigger, setLocateTrigger] = useState(1); // auto-locate on mount
  // Pin dropped on the map when Gemini suggests a specific place. Pans the
  // map so the pin sits in the vertical center of the band above the widget.
  const [aiSuggestedPin, setAiSuggestedPin] = useState(null);

  // Live widget height — tracked in state so the right-side FAB stack can
  // sit just above the widget's top-right corner regardless of the widget's
  // current mode (Tips / Conversation / Minimized).
  const widgetRef = useRef(null);
  const screenRef = useRef(null);
  const [widgetHeight, setWidgetHeight] = useState(248);
  useLayoutEffect(() => {
    const el = widgetRef.current;
    if (!el) return;
    // Keep the last non-zero height when the widget gets hidden (e.g. by a
    // visibility:hidden parent during Timeline / Preferences). Otherwise the
    // FABs and Start-exploring CTA — which are positioned relative to
    // `widgetHeight` — would jump to bottom: 32px while the sheet is open
    // and snap back when it closes.
    const apply = () => {
      const h = el.offsetHeight;
      if (h > 0) setWidgetHeight(h);
    };
    apply();
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(apply);
      ro.observe(el);
    }
    return () => { if (ro) ro.disconnect(); };
  });
  // Dev/test cycler so designers can preview the AI presentation modes
  // (none → narration → suggestion → narration+suggestion → none).
  const [aiTestMode, setAiTestMode] = useState(0);
  const [aiSampleIdx, setAiSampleIdx] = useState(0);

  // ── Widget state preview (dev / design only) ────────────────────────────
  // Profile FAB opens a menu with the 11 widget states designers want to
  // verify. Picking an option flows up through onSetWidgetPreview to App.js
  // (which configures the journey + screen) and back down via the
  // `widgetPreview` prop, which we use here to override the aiNarration /
  // aiSuggestion / atTarget signals so the active-walk render branches in
  // WalkCompanionWidget match the chosen preview.
  const [isPreviewMenuOpen, setIsPreviewMenuOpen] = useState(false);
  const PREVIEW_STATES = [
    { key: 'no-stops',                 label: 'No locations added' },
    { key: 'stops-added',              label: 'Stops added (start not selected)' },
    { key: 'walking',                  label: 'Walking to stop' },
    { key: 'arrived',                  label: 'Arrived at a stop' },
    { key: 'user-speaking',            label: 'User speaking' },
    { key: 'strollo-thinking',         label: 'Strollo thinking…' },
    { key: 'strollo-speaking',         label: 'Strollo speaking' },
    { key: 'nudge-add-stop',           label: 'Nudge: add a stop' },
    { key: 'nudge-tidbit',             label: 'Nudge: tidbit' },
    { key: 'nudge-incident',           label: 'Nudge: live incident' },
    { key: 'incident-with-suggestion', label: 'Incident + suggestion' },
  ];
  const PREVIEW_NARRATION = {
    'strollo-speaking':         "On your left — the historic Claremont Hotel, built in 1915 and once nicknamed the \"Million Dollar Hotel\".",
    'nudge-tidbit':             "Did you know? This block was a thriving jazz district back in the 1940s.",
    'incident-with-suggestion': "Heads up — there's roadwork on Market Street ahead.",
  };
  const PREVIEW_SUGGESTION = {
    'nudge-add-stop':           "Tartine Bakery is two blocks away — want to add it as a stop?",
    'nudge-incident':           "Heads up — there's roadwork on Market Street ahead. Tap to reroute.",
    'incident-with-suggestion': "I can route you down 17th Street instead — want me to switch?",
  };
  const AI_NARRATIONS = [
    "On your left — the historic Claremont Hotel, built in 1915 and once nicknamed the \"Million Dollar Hotel\".",
    "You're walking along Telegraph Ave, the spine of UC Berkeley's counterculture in the 1960s.",
    "That mural across the street is by local artist Edythe Boone — finished in 2019.",
  ];
  const AI_SUGGESTIONS = [
    "There's a bookstore one block ahead with a great rare-books section. Worth a detour?",
    "A nearby café opens in 5 minutes — want to add it as a stop?",
    "Did you know? This corner appeared in the film The Graduate.",
  ];
  // Preview key wins over the existing aiTestMode cycler so designers can
  // jump straight to a specific narration / suggestion variant without
  // tapping through the four-step cycle.
  const aiNarration = (widgetPreview && PREVIEW_NARRATION[widgetPreview]) ?? (
    aiTestMode === 1 || aiTestMode === 3
      ? AI_NARRATIONS[aiSampleIdx % AI_NARRATIONS.length]
      : ""
  );
  const aiSuggestion = (widgetPreview && PREVIEW_SUGGESTION[widgetPreview]) ?? (
    aiTestMode === 2 || aiTestMode === 3
      ? AI_SUGGESTIONS[aiSampleIdx % AI_SUGGESTIONS.length]
      : ""
  );
  // Snapshot of the route distance (m) when each next-stop was first targeted,
  // so the companion widget's progress strip can render walked vs remaining.
  const initialDistRef = React.useRef({ id: null, dist: 0 });
  const [headingUp, setHeadingUp] = useState(false);     // false = north-up, true = next-maneuver-up
  const [walkingRoute, setWalkingRoute]   = useState(null);
  const [routeInfo, setRouteInfo]         = useState(null);
  const [routeSteps, setRouteSteps]       = useState([]);
  // Walking geometry chaining the *future* unvisited stops together
  // (target → stop2 → stop3 …). Drawn faintly behind the salient
  // user→target leg so the user sees the real shape of the rest of the
  // walk instead of a straight line cutting across blocks.
  const [remainingRoute, setRemainingRoute] = useState(null);
  // voiceMode (full-screen voice overlay) was removed; the bottom widget
  // owns the conversation experience now.
  const voiceMode = null;
  // Which stop pin is currently expanded (showing its X remove button).
  // Only one can be open at a time; tapping another pin or the same pin
  // again closes it.
  const [expandedStopId, setExpandedStopId] = useState(null);
  // Tracks the live Leaflet zoom so we can demote stop pins to mini purple
  // dots when the map auto-fits to a wide bounds (mirrors HomeScreen tier).
  const [mapZoom, setMapZoom] = useState(14);

  // Drop a stop from the route + addedIds. Mirrors the WCW skip logic so
  // map removal and "skip next stop" stay in sync.
  const removeStop = useCallback((id) => {
    if (!onJourneyChange) return;
    onJourneyChange(journeyItems.filter((j) => j.id !== id));
    if (setAddedIds) {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    setExpandedStopId(null);
  }, [journeyItems, onJourneyChange, setAddedIds]);

  const handleLocate = (pos) => {
    setUserLocation(pos);
  };

  // Route follows the Timeline: route to the FIRST non-visited confirmed
  // stop. If nothing is confirmed (or all visited), stopPositions is empty
  // and no route is fetched.
  const stopPositions = nextTarget ? [[nextTarget.lat, nextTarget.lng]] : [];

  // Future unvisited stops AFTER the active target — for the chained
  // walking geometry that replaces the straight dashed line.
  const remainingStops = React.useMemo(() => {
    if (!nextTarget) return [];
    const idx = confirmedStops.findIndex((s) => s.id === nextTarget.id);
    if (idx < 0) return [];
    return confirmedStops
      .slice(idx + 1)
      .filter((s) => !visitedIds?.has(s.id));
  }, [confirmedStops, visitedIds, nextTarget]);

  // Live straight-line distance to the next target — drives the "I am here"
  // affordance and the wcw stats. Computed at component scope so the button
  // (above wcw) can read it too.
  const liveDistToTargetM = React.useMemo(() => {
    if (!nextTarget || !userLocation) return null;
    return haversineKm(userLocation, [nextTarget.lat, nextTarget.lng]) * 1000;
  }, [nextTarget, userLocation]);
  // Show the "I'm here" affordance once the user is within ~300 ft (≈91 m)
  // of the next confirmed stop. Below that threshold the widget's Skip
  // button flips to a confirm-arrival button.
  const FT_300_M = 91.44;
  // Dev-only override so the profile FAB can toggle the at-target ("You
  // made it. Now enjoy it.") state without actually walking 300 ft up to
  // a real stop. Force-flag OR'd with the live geofence test below.
  const [forceAtTarget, setForceAtTarget] = useState(false);
  const isAtTarget = widgetPreview === 'arrived' || forceAtTarget || (liveDistToTargetM !== null && liveDistToTargetM <= FT_300_M);

  // Boots overlap the stop pin once the user is on top of it. When the
  // user is within ~30 m of ANY confirmed stop, swap the boots to the
  // "below" variant so they hang beneath the purple route-dot instead of
  // covering the pill. Threshold is tighter than FT_300_M so the boots
  // only flip when the icons would actually collide on screen.
  const NEAR_STOP_M = 30;
  const isNearAnyStop = React.useMemo(() => {
    if (!userLocation) return false;
    if (widgetPreview === 'arrived') return true;
    if (!confirmedStops?.length) return false;
    for (const s of confirmedStops) {
      if (s.lat == null || s.lng == null) continue;
      const m = haversineKm(userLocation, [s.lat, s.lng]) * 1000;
      if (m <= NEAR_STOP_M) return true;
    }
    return false;
  }, [userLocation, confirmedStops, widgetPreview]);

  // ── Real-time per-stop dwell tracker ────────────────────────────────────
  // Watches the user's geolocation and accumulates the actual time spent
  // within ~50m of each confirmed stop. Drives accurate per-stop minutes on
  // the Reward screen without requiring the user to tap "I'm here" — and
  // still works correctly if they do.
  const dwellRef = React.useRef({ stopId: null, enteredAt: 0 });
  const setStopDwellMsRef = React.useRef(setStopDwellMs);
  setStopDwellMsRef.current = setStopDwellMs;
  useEffect(() => {
    if (!userLocation || !setStopDwellMs || !confirmedStops?.length) return;

    // Closest stop the user is currently inside (within ~50m).
    let currentStopId = null;
    for (const stop of confirmedStops) {
      if (stop.lat == null || stop.lng == null) continue;
      const distM = haversineKm(userLocation, [stop.lat, stop.lng]) * 1000;
      if (distM <= 50) { currentStopId = stop.id; break; }
    }

    const prev = dwellRef.current;
    if (currentStopId === prev.stopId) return; // still at the same place (or still nowhere)

    const now = Date.now();
    if (prev.stopId != null && prev.enteredAt) {
      // Just left a stop — bank the time we spent there.
      const delta = now - prev.enteredAt;
      setStopDwellMs((m) => {
        const next = new Map(m);
        next.set(prev.stopId, (next.get(prev.stopId) || 0) + delta);
        return next;
      });
    }
    dwellRef.current = { stopId: currentStopId, enteredAt: currentStopId ? now : 0 };
  }, [userLocation, confirmedStops, setStopDwellMs]);

  // On unmount (or screen change), bank any in-progress dwell so the user
  // doesn't lose credit for the stop they were standing in when they ended.
  useEffect(() => {
    return () => {
      const prev = dwellRef.current;
      const setDwell = setStopDwellMsRef.current;
      if (prev.stopId != null && prev.enteredAt && setDwell) {
        const delta = Date.now() - prev.enteredAt;
        setDwell((m) => {
          const next = new Map(m);
          next.set(prev.stopId, (next.get(prev.stopId) || 0) + delta);
          return next;
        });
      }
    };
  }, []);

  const handleArrived = () => {
    if (!nextTarget || !setVisitedIds) return;
    // Was this the last unvisited stop? If so, the walk is complete —
    // arriving here should return to the homepage instead of falling
    // through into the empty-destination "Start exploring" state, which
    // would happen automatically once nextTarget becomes null.
    const remainingAfter = confirmedStops.filter(
      (s) => !visitedIds?.has(s.id) && s.id !== nextTarget.id
    ).length;
    setVisitedIds((prev) => {
      const out = new Set(prev);
      out.add(nextTarget.id);
      return out;
    });
    if (setVisitedAt) {
      setVisitedAt((prev) => {
        const out = new Map(prev);
        out.set(nextTarget.id, Date.now());
        return out;
      });
    }
    if (remainingAfter === 0) {
      // Last stop confirmed — bounce to the Reward screen so the user
      // sees their walk reflection. Falls back to onGoBack if the
      // parent didn't wire onEndWalk. Deferred one tick so the
      // visitedIds update flushes before the parent unmounts this
      // screen.
      const finish = onEndWalk || onGoBack;
      if (finish) setTimeout(() => finish(), 0);
    }
  };

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

    const addedFromVoice = [];
    if (adds && adds.length && userLocation) {
      for (const place of adds) {
        const result = await geocodePlace(place.name, userLocation[0], userLocation[1]);
        if (result) {
          const newStop = {
            id: Date.now() + next.length,
            name: place.name,
            desc: place.desc,
            lat: result.lat,
            lng: result.lng,
          };
          next.push(newStop);
          addedFromVoice.push(newStop.id);
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
    // Voice-added places should also count as confirmed in the Timeline,
    // otherwise the route filter (addedIds) would drop them immediately.
    if (addedFromVoice.length && setAddedIds) {
      setAddedIds((prev) => {
        const out = new Set(prev);
        addedFromVoice.forEach((id) => out.add(id));
        return out;
      });
    }
  }, [journeyItems, userLocation, onJourneyChange, setAddedIds]);

  const voice = useJourneyVoice({
    userLocation,
    journeyItems,
    mode: "during-walk",
    vibePreferences,
    onApplyActions: applyActions,
  });

  // Fetch walking route from user location to the next stop.
  // Re-fetch whenever (a) the target stop changes (e.g. user skipped a stop),
  // or (b) the user has moved > ~200m since the last fetch.
  const routeFetchedFor = React.useRef(null);
  const routeTargetRef = React.useRef(null);
  useEffect(() => {
    if (!userLocation || stopPositions.length < 1) return;
    const target = stopPositions[0];
    const targetKey = `${target[0]},${target[1]}`;
    const targetChanged = routeTargetRef.current !== targetKey;
    if (routeFetchedFor.current && !targetChanged) {
      const [prevLat, prevLng] = routeFetchedFor.current;
      const dlat = Math.abs(userLocation[0] - prevLat);
      const dlng = Math.abs(userLocation[1] - prevLng);
      if (dlat < 0.002 && dlng < 0.002) return;
    }
    routeFetchedFor.current = userLocation;
    routeTargetRef.current = targetKey;
    // Clear stale route/steps immediately so the UI doesn't point at the skipped stop
    if (targetChanged) {
      setWalkingRoute(null);
      setRouteInfo(null);
      setRouteSteps([]);
    }
    const waypoints = [userLocation, target];
    getWalkingRoute(waypoints).then((result) => {
      if (result) {
        setWalkingRoute(result.coordinates);
        setRouteInfo({ distance: result.distance, duration: result.duration });
        setRouteSteps(result.steps || []);
      }
    }).catch(err => { console.warn("Route fetch failed:", err); });
  }, [userLocation, stopPositions]);

  // Fetch chained walking geometry for the remaining (future) unvisited
  // stops, anchored at the active target so the seam matches the salient
  // leg. Re-fetches whenever the remaining-stop list changes (skip,
  // arrive, add).
  const remainingKey = remainingStops.map((s) => s.id).join("|");
  useEffect(() => {
    if (!nextTarget || remainingStops.length === 0) {
      setRemainingRoute(null);
      return;
    }
    let cancelled = false;
    const waypoints = [
      [nextTarget.lat, nextTarget.lng],
      ...remainingStops.map((s) => [s.lat, s.lng]),
    ];
    getWalkingRoute(waypoints).then((result) => {
      if (cancelled) return;
      if (result?.coordinates) setRemainingRoute(result.coordinates);
      else setRemainingRoute(null);
    }).catch((err) => {
      console.warn("Remaining-route fetch failed:", err);
      if (!cancelled) setRemainingRoute(null);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextTarget?.id, remainingKey]);

  // Bearing from user to the next maneuver (falls back to destination).
  // The map rotates by -bearing when headingUp is on, so the road ahead points "up".
  const navBearing = useMemo(() => {
    if (!userLocation) return 0;
    const nextTurn = routeSteps.find(
      (s) => s.maneuver?.location && s.maneuver?.modifier
          && s.maneuver?.type !== "depart" && s.maneuver?.type !== "arrive"
    );
    let target;
    if (nextTurn) target = [nextTurn.maneuver.location[1], nextTurn.maneuver.location[0]];
    else if (stopPositions[0]) target = stopPositions[0];
    else return 0;
    return computeBearing(userLocation, target);
  }, [userLocation, routeSteps, stopPositions]);

  return (
    <div ref={screenRef} className="nav-screen-root" style={{ display: "contents" }}>

      {/* ── MAP ── */}
      <div
        className={`map-wrapper${headingUp ? " heading-up" : ""}`}
        style={{ "--map-rotation": `${navBearing}deg` }}
      >
        <MapContainer key={mapKeyRef.current} center={initialCenter} zoom={14} zoomControl={false} attributionControl={false} className="map-container">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" maxZoom={19} />
          <ZoomTracker onZoom={setMapZoom} />

          {/* WALKED path — start → visited stops → user. Transparent dotted
              line so the user can see where they've already been without
              the trail competing visually with the upcoming legs. */}
          {(() => {
            if (!userLocation) return null;
            const walked = [
              startLocation,
              ...confirmedStops
                .filter((s) => visitedIds?.has(s.id))
                .map((s) => [s.lat, s.lng]),
              userLocation,
            ].filter(Boolean);
            if (walked.length < 2) return null;
            return (
              <Polyline
                positions={walked}
                pathOptions={{
                  color: "#8851D4",
                  weight: 4,
                  opacity: 0.45,
                  dashArray: "1 8",
                  lineCap: "round",
                  lineJoin: "round",
                }}
              />
            );
          })()}

          {/* FUTURE leg (after the immediate next stop) — dotted in a
              lighter purple so it reads as "upcoming" without being so
              faded it disappears. Uses OSRM geometry where available,
              falls back to straight lines while it loads. */}
          {remainingRoute && (
            <Polyline
              positions={remainingRoute}
              pathOptions={{
                color: "#C77DFF",
                weight: 4,
                opacity: 0.85,
                dashArray: "1 8",
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          )}
          {!remainingRoute && nextTarget && remainingStops.length > 0 && (
            <Polyline
              positions={[
                [nextTarget.lat, nextTarget.lng],
                ...remainingStops.map((s) => [s.lat, s.lng]),
              ]}
              pathOptions={{
                color: "#C77DFF",
                weight: 4,
                opacity: 0.85,
                dashArray: "1 8",
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          )}

          {/* IMMEDIATE next stop — dotted purple line from the user to the
              next target along real streets (OSRM); falls back to a
              straight dotted line while the route fetch is in flight. */}
          {walkingRoute && (
            <Polyline positions={walkingRoute} pathOptions={{ color: "#8851D4", weight: 5, opacity: 0.95, dashArray: "1 8", lineCap: "round", lineJoin: "round" }} />
          )}
          {!walkingRoute && userLocation && stopPositions.length > 0 && (
            <Polyline positions={[userLocation, ...stopPositions]} pathOptions={{ color: "#8851D4", weight: 5, opacity: 0.85, dashArray: "1 8", lineCap: "round", lineJoin: "round" }} />
          )}

          {/* Route waypoint dots — solid purple discs at the spot the user
              pressed "Start exploring" and at every confirmed stop. Mirrors
              TimelineScreen's vertical-rail nodes. Only rendered at zooms
              where the stop pins are showing as pills/labeled-dots
              (mapZoom >= 14); below that, pins demote to bare mini-dots
              and an extra route-dot would orphan itself with no pill to
              anchor to. Single-stop journeys get the dot even in
              exploration mode so the lone pin matches the HomeScreen
              treatment (purple route-dot underneath the yellow pill). */}
          {userLocation && confirmedStops.length > 0 && mapZoom >= 14 && (!isExplorationMode || confirmedStops.length === 1) && (
            <>
              {(() => {
                // Start dot only renders when a real start anchor exists
                // (i.e. user has pressed Start exploring). In exploration
                // mode startLocation is null, so the dot self-suppresses —
                // the single-stop case still gets its own dot below.
                if (isExplorationMode) return null;
                // Snap the start dot to the first vertex of the OSRM route
                // when one is loaded — the route is snapped to the road
                // network, so anchoring the dot at the raw GPS coords would
                // float it a few metres off the purple line.
                const startCenter = (walkingRoute && walkingRoute.length > 0)
                  ? walkingRoute[0]
                  : startLocation;
                if (!startCenter) return null;
                return (
                  <CircleMarker
                    key="route-dot-start"
                    center={startCenter}
                    pathOptions={{ color: "#8851D4", weight: 0, fillColor: "#8851D4", fillOpacity: 1 }}
                    radius={5.5}
                    interactive={false}
                  />
                );
              })()}
              {confirmedStops.map((s) => (
                <CircleMarker
                  key={`route-dot-${s.id}`}
                  center={[s.lat, s.lng]}
                  pathOptions={{ color: "#8851D4", weight: 0, fillColor: "#8851D4", fillOpacity: 1 }}
                  radius={5.5}
                  interactive={false}
                />
              ))}
            </>
          )}

          {/* Muted pins for every other confirmed stop (visited + future).
              Faded and label-less — they hint at the broader plan without
              competing with the next target. Tapping one expands it into a
              named pill with an X to drop the stop from the route. */}
          {confirmedStops
            .filter((s) => s.id !== nextTarget?.id)
            .map((s) => {
              const expanded = expandedStopId === s.id;
              const isVisited = visitedIds?.has(s.id);
              const seq = confirmedStops.findIndex((c) => c.id === s.id) + 1;
              // Pill mode for any confirmed stop in this loop so the name
              // and sequence number are always visible — single-stop
              // journeys (especially in exploration mode where this loop
              // owns the lone pin) match HomeScreen's added-pill visual.
              // Demote to mini below mapZoom 14 only when the pin would
              // otherwise crowd a tight cluster — at single-stop scale it
              // never does, so we keep the pill there too.
              let mode;
              if (expanded) mode = 'open';
              else if (mapZoom < 12) mode = 'hidden';
              else mode = 'pill';
              if (mode === 'hidden') return null;
              // Lone confirmed stop = the journey itself; render at full
              // strength like HomeScreen instead of fading to muted-purple.
              const isLone = confirmedStops.length === 1;
              return (
                <Marker
                  key={`stop-muted-${s.id}`}
                  position={[s.lat, s.lng]}
                  icon={getStopIcon(s.name, s.desc, seq, mode, !isVisited, !isLone)}
                  eventHandlers={{
                    click: (e) => {
                      const target = e.originalEvent?.target;
                      if (target?.closest?.('[data-action="remove"]')) {
                        if (!isVisited) removeStop(s.id);
                        return;
                      }
                      setExpandedStopId(expanded ? null : s.id);
                    },
                  }}
                />
              );
            })}

          {/* Salient pin for the active destination = first non-visited
              confirmed Timeline item. Stays a pill (it's the focus) but
              shrinks to a labeled dot / mini when the map is zoomed out,
              matching HomeScreen's tier ladder. Tap to reveal X. */}
          {nextTarget && (() => {
            const expanded = expandedStopId === nextTarget.id;
            const isVisited = visitedIds?.has(nextTarget.id);
            const seq = confirmedStops.findIndex((c) => c.id === nextTarget.id) + 1;
            let mode;
            if (expanded) mode = 'open';
            else if (mapZoom < 12) mode = 'hidden';
            else if (mapZoom < 14) mode = 'mini';
            else mode = 'pill';
            if (mode === 'hidden') return null;
            return (
              <Marker
                key={`stop-${nextTarget.id}`}
                position={[nextTarget.lat, nextTarget.lng]}
                icon={getStopIcon(nextTarget.name, nextTarget.desc, seq, mode, !isVisited, false)}
                eventHandlers={{
                  click: (e) => {
                    const target = e.originalEvent?.target;
                    if (target?.closest?.('[data-action="remove"]')) {
                      if (!isVisited) removeStop(nextTarget.id);
                      return;
                    }
                    setExpandedStopId(expanded ? null : nextTarget.id);
                  },
                }}
              />
            );
          })()}

          {/* Floating destination-pin glyph above the final/only confirmed
              stop's pill — separate Marker so the SVG sits OUTSIDE the
              pill chrome. Always rendered when a final stop exists; pairs
              with whichever pin marker (active or muted) is currently
              showing for that stop. */}
          {(() => {
            const finalStop = confirmedStops.find((s) => s.id === finalStopId);
            if (!finalStop || !finalStop.lat || !finalStop.lng) return null;
            return (
              <Marker
                key={`final-dest-pin-${finalStop.id}`}
                position={[finalStop.lat, finalStop.lng]}
                icon={getFinalDestIcon()}
                interactive={false}
                zIndexOffset={4000}
              />
            );
          })()}

          {/* User position */}
          {hasRealUserLocation && <Marker position={userLocation} icon={isNearAnyStop ? youIconBelow : youIcon} />}
          <WatchLocation onUpdate={setUserLocation} />

          {/* AI-suggested pin from Gemini's last reply. Pans into the
              vertical center of the map area above the widget. */}
          {aiSuggestedPin &&
            !(journeyItems || []).some(
              (j) => j.name && j.name.toLowerCase() === aiSuggestedPin.name.toLowerCase()
            ) && (
            <>
              <Marker
                key={`ai-pin-${aiSuggestedPin.lat}-${aiSuggestedPin.lng}`}
                position={[aiSuggestedPin.lat, aiSuggestedPin.lng]}
                icon={getAiPinIcon(aiSuggestedPin.name)}
              />
              <PanAboveWidget target={aiSuggestedPin} widgetHeight={widgetHeight} />
            </>
          )}

          {/* Zoom the map to fit user + next destination with max zoom possible.
              Re-runs whenever userLocation, destination, or the locate button trigger changes. */}
          <NavFitRoute
            userLocation={userLocation}
            destination={stopPositions[0] || null}
            trigger={locateTrigger}
          />
          {/* "Locate me" FAB: works even when there's no journey destination
              (NavFitRoute early-returns in that case). Centers the user dot
              vertically inside the band above the bottom widget. */}
          <LocateMeOnTrigger
            userLocation={userLocation}
            trigger={locateTrigger}
            widgetHeight={widgetHeight}
          />
        </MapContainer>
      </div>

      {/* Profile FAB — top-right of the map. Doubles as a dev toggle for
          the at-target ("You are at" / "You made it. Now enjoy it.")
          widget state, so the arrived UI can be previewed without
          walking 300 ft to a real stop. Each tap also advances the AI
          test mode for the secondary narration / suggestion previews. */}
      <button
        type="button"
        className="fab-circle top-right-btn"
        aria-label="Open widget state preview menu"
        aria-haspopup="menu"
        aria-expanded={isPreviewMenuOpen}
        onClick={() => setIsPreviewMenuOpen((v) => !v)}
      >
        <span className="top-right-initials">ST</span>
      </button>
      {isPreviewMenuOpen && (
        <>
          <div
            className="nav-preview-menu-backdrop"
            onClick={() => setIsPreviewMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="nav-preview-menu" role="menu" aria-label="Widget state preview">
            <div className="nav-preview-menu-header">
              <span className="nav-preview-menu-title">Widget state preview</span>
              {widgetPreview && (
                <button
                  type="button"
                  className="nav-preview-menu-exit"
                  onClick={() => {
                    if (onSetWidgetPreview) onSetWidgetPreview(null);
                    setForceAtTarget(false);
                    setAiTestMode(0);
                    setIsPreviewMenuOpen(false);
                  }}
                >
                  Exit preview
                </button>
              )}
            </div>
            <ul className="nav-preview-menu-list" role="none">
              {PREVIEW_STATES.map((opt) => {
                const isActive = widgetPreview === opt.key;
                return (
                  <li key={opt.key} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className={`nav-preview-menu-item${isActive ? " nav-preview-menu-item--active" : ""}`}
                      onClick={() => {
                        if (onSetWidgetPreview) onSetWidgetPreview(opt.key);
                        // Reset the manual cycler so its samples don't compete
                        // with the preview's curated copy.
                        setAiTestMode(0);
                        setForceAtTarget(false);
                        setIsPreviewMenuOpen(false);
                      }}
                    >
                      <span className="nav-preview-menu-item-label">{opt.label}</span>
                      {isActive && (
                        <span className="nav-preview-menu-item-check" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}

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

      {/* ── BOTTOM-RIGHT STACK: Journey flag (timeline) above Locate.
           Hidden via visibility (NOT unmounted) when the Timeline /
           Preferences sheet is on top, so the FABs don't reflow when
           those screens close — they stay anchored to the same widget
           offset across the whole walk session. */}
      {(
        <div
          className="bottom-right-stack bottom-right-stack--nav"
          style={{ bottom: `${widgetHeight + 32}px`, visibility: showVoice ? undefined : 'hidden' }}
        >
          {onOpenTimeline && (
            <button
              className="fab-circle bottom-right-btn bottom-right-btn--journey"
              onClick={onOpenTimeline}
              aria-label="Open journey timeline"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#FFD501" stroke="none" aria-hidden="true">
                <path d="M8 3 L8 21" stroke="#FFD501" strokeWidth="2" strokeLinecap="round"/>
                <path d="M8 3 L18 6 L8 10 Z"/>
                <circle cx="8" cy="21" r="2"/>
              </svg>
            </button>
          )}
          {onSetConstraints && (
            <button
              type="button"
              className="fab-circle bottom-right-btn"
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
      )}

      {/* ── "Start exploring · N" floating CTA — appears once the user has
           saved at least one place via the conversation pill. Mirrors the
           same button on home: clicking flips exploration mode off, which
           lets nextTarget compute, the OSRM route render, and the widget
           transition into walk mode. ── */}
      {isExplorationMode && confirmedStops.length > 0 && (
        <button
          type="button"
          className="fab-circle start-walk-pill nav-start-walk-pill"
          style={{ bottom: `${widgetHeight + 32}px`, visibility: showVoice ? undefined : 'hidden' }}
          onClick={() => {
            setIsExplorationMode(false);
            setLocateTrigger((t) => t + 1);
          }}
        >
          {`Start exploring · ${confirmedStops.length}`}
        </button>
      )}

      {/* The standalone "I am here" green bar was removed — the widget's
          own skip button now flips to "I'm here" via the `atTarget` prop
          when the user is within 300 ft of the next stop. */}

      {/* ── WALK COMPANION WIDGET (top-pinned, voice + nav context) ──
           Always rendered while NavigationMapScreen is mounted so the
           widget's TTS/conversation/tip state survives detours into the
           Timeline or Preferences sheets. CSS visibility is driven by
           `showVoice` — when the user opens Timeline or Prefs from nav,
           we just hide the widget instead of unmounting it. */}
      {voiceMode !== "full" && (() => {
        // The "next stop" being routed to == first non-visited confirmed
        // Timeline item. When the user has saved stops but hasn't pressed
        // Start exploring yet (`isExplorationMode === true`), preview the
        // walk by pointing the widget at the FIRST confirmed stop —
        // exposes DIST/ETA/TURN and the "Heading to <name>" header even
        // before the route is committed. The map's actual stopPositions /
        // OSRM fetch remain gated on `nextTarget`, so no purple line is
        // drawn until the user explicitly starts the walk.
        const previewStop = isExplorationMode && confirmedStops.length > 0
          ? confirmedStops[0]
          : null;
        const nextStop = nextTarget || previewStop;
        const isEmpty = !nextStop;
        const nextWaypoint = nextStop ? nextStop.name.split(",")[0] : null;
        // Live route values when available, static placeholders otherwise.
        // DIST stat: TOTAL route distance from user to the next destination (along streets),
        // from OSRM — longer than straight-line because it follows the route geometry.
        // Imperial units: feet when under 0.1 mile, miles above
        const fmtDist = (m) => {
          const feet = m * 3.28084;
          if (feet < 528) return `${Math.round(feet)} ft`;
          return `${(m / 1609.344).toFixed(1)} mi`;
        };
        // Conversational distance phrasing for the TURN instruction line —
        // short walks read in feet; once the distance crosses ~0.1 mi the
        // headline switches to time ("about 3 minutes") since most people
        // think in walking minutes for non-trivial distances.
        const fmtDistNatural = (m) => {
          const feet = m * 3.28084;
          if (feet < 25) return "a few steps";
          if (feet < 150) return `${Math.round(feet / 10) * 10} feet`;
          if (feet < 528) return `${Math.round(feet / 50) * 50} feet`;
          const mins = Math.max(1, Math.round(m / 80));
          return `about ${mins} minute${mins === 1 ? "" : "s"}`;
        };
        // Live straight-line distance to the NEXT destination — updates every time
        // userLocation ticks or nextStop changes (e.g. after a skip). No OSRM dependency,
        // so it refreshes immediately on every render rather than waiting for a refetch.
        const WALK_M_PER_MIN = 80; // ≈ 4.8 km/h walking pace
        const liveDistToStopM = nextStop && userLocation
          ? haversineKm(userLocation, [nextStop.lat, nextStop.lng]) * 1000
          : null;
        const distance = liveDistToStopM !== null ? fmtDist(liveDistToStopM) : "—";
        const etaMin = liveDistToStopM !== null
          ? Math.max(1, Math.round(liveDistToStopM / WALK_M_PER_MIN))
          : null;
        const eta = etaMin !== null ? `${etaMin} min` : "—";
        // Track the initial distance for this stop so progress can be derived.
        if (nextStop?.id && liveDistToStopM != null) {
          if (initialDistRef.current.id !== nextStop.id) {
            initialDistRef.current = { id: nextStop.id, dist: Math.max(liveDistToStopM, 1) };
          } else if (liveDistToStopM > initialDistRef.current.dist) {
            initialDistRef.current.dist = liveDistToStopM;
          }
        }
        const progress = liveDistToStopM != null && initialDistRef.current.dist > 0
          ? Math.max(0, Math.min(1, 1 - liveDistToStopM / initialDistRef.current.dist))
          : 0;
        // Instruction: live distance to the NEXT maneuver (turn), from OSRM step data.
        // Switch to "TURN {direction}" once we're within ~15m of that maneuver point.
        const nextTurn = routeSteps.find((s) =>
          s.maneuver?.location && s.maneuver?.modifier && s.maneuver?.type !== "depart" && s.maneuver?.type !== "arrive"
        );
        const distToTurnM = nextTurn
          ? haversineKm(userLocation, [nextTurn.maneuver.location[1], nextTurn.maneuver.location[0]]) * 1000
          : null;
        let instruction;
        if (isEmpty) {
          instruction = "—";
        } else if (previewStop && nextStop === previewStop) {
          // Preview state — user has saved stops but hasn't pressed
          // Start exploring yet. Override the directions headline with
          // a calm "ready when you are" line so the widget doesn't fake
          // a live walk.
          instruction = "your stops are added. ready when you are.";
        } else if (!userLocation || liveDistToStopM === null) {
          instruction = "head out";
        } else if (distToTurnM !== null && distToTurnM <= 15) {
          instruction = `turn ${String(nextTurn.maneuver.modifier || "right").toLowerCase()}`;
        } else if (distToTurnM !== null) {
          instruction = `walk forward ${fmtDistNatural(distToTurnM)}`;
        } else if (liveDistToStopM <= 15) {
          instruction = "arriving";
        } else {
          instruction = `walk forward ${fmtDistNatural(liveDistToStopM)}`;
        }
        return (
          <div className="wcw-host" style={{ visibility: showVoice ? undefined : 'hidden' }}>
          <WalkCompanionWidget
            ref={widgetRef}
            previewState={widgetPreview}
            destination={nextWaypoint}
            instruction={instruction}
            distance={isEmpty ? "—" : distance}
            eta={isEmpty ? "—" : eta}
            canSkip={confirmedStops.filter((s) => !visitedIds?.has(s.id)).length >= 1}
            atTarget={isAtTarget}
            isLastStop={!!nextStop && confirmedStops.length > 0 && confirmedStops[confirmedStops.length - 1].id === nextStop.id}
            progress={progress}
            narration={aiNarration}
            suggestion={aiSuggestion}
            onArrived={handleArrived}
            onOpenTimeline={onOpenTimeline}
            onEnd={onEndWalk || onGoBack}
            onSkip={() => {
              if (!nextStop || !onJourneyChange) return;
              // Drop the current (next) confirmed stop from both the journey
              // and addedIds, so Timeline + route stay in sync.
              const skippedId = nextStop.id;
              onJourneyChange(journeyItems.filter((j) => j.id !== skippedId));
              if (setAddedIds) {
                setAddedIds((prev) => {
                  const next = new Set(prev);
                  next.delete(skippedId);
                  return next;
                });
              }
            }}
            // End walk → return home, which clears walk state via onGoBack
            // and lets HomeScreen's mount-time GPS request re-run cleanly.
            // onExpand removed: full-screen voice overlay was deleted.
            // Strollo Conversation (empty-state) integration
            userLocation={userLocation}
            vibePreferences={vibePreferences}
            preferences={preferences}
            trip={journeyItems}
            onAddByName={async (name) => {
              if (!name || !onJourneyChange) return;
              const existing = (journeyItems || []).find(
                (j) => j.name && j.name.toLowerCase() === name.toLowerCase()
              );
              if (existing) {
                if (setAddedIds) setAddedIds((p) => {
                  if (p.has(existing.id)) return p;
                  const n = new Set(p); n.add(existing.id); return n;
                });
                return;
              }
              // Fast path: if we already have the AI sparkle pin's coords for
              // this name, use them — appending immediately so the pill flips
              // to "saved" without waiting for Nominatim. Background-geocode
              // only when we don't have coords on hand.
              const cachedPin = aiSuggestedPin && aiSuggestedPin.name &&
                aiSuggestedPin.name.toLowerCase() === name.toLowerCase()
                ? aiSuggestedPin
                : null;
              const id = `ai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
              const initialItem = {
                id,
                name,
                desc: "AI",
                lat: cachedPin?.lat ?? null,
                lng: cachedPin?.lng ?? null,
              };
              // Optimistic append + addedIds flip → pill flips instantly.
              const optimisticList = [...(journeyItems || []), initialItem];
              onJourneyChange(optimisticList);
              if (setAddedIds) setAddedIds((p) => {
                const n = new Set(p); n.add(id); return n;
              });
              // Backfill coords in the background if we didn't have them.
              // We pass the FULL list (with backfilled coords on the new
              // item) — never a functional updater, since the parent
              // stores whatever it receives directly. Passing a function
              // would corrupt the journey to the function itself and
              // collapse the list down to whatever the parent assumes.
              if (!cachedPin) {
                try {
                  const geo = await geocodePlace(name, userLocation?.[0], userLocation?.[1]);
                  if (geo?.lat && geo?.lng) {
                    onJourneyChange(
                      optimisticList.map((it) =>
                        it.id === id ? { ...it, lat: geo.lat, lng: geo.lng } : it
                      )
                    );
                  }
                } catch (e) { /* keep null coords */ }
              }
            }}
            onRemoveByName={(name) => {
              if (!name || !onJourneyChange) return;
              const target = (journeyItems || []).find(
                (j) => j.name && j.name.toLowerCase() === name.toLowerCase()
              );
              if (!target) return;
              onJourneyChange(journeyItems.filter((j) => j.id !== target.id));
              if (setAddedIds) setAddedIds((p) => {
                if (!p.has(target.id)) return p;
                const n = new Set(p); n.delete(target.id); return n;
              });
            }}
            onAiSuggestPlace={(pin) => { console.log("[Pin] NavigationMapScreen received pin:", pin); setAiSuggestedPin(pin); }}
          />
          </div>
        );
      })()}

    </div>
  );
}
