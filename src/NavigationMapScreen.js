import React, { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./NavigationMapScreen.css";
import WalkCompanionWidget from "./WalkCompanionWidget";
import { getWalkingRoute, geocodePlace } from "./geminiService";
import { useJourneyVoice } from "./useJourneyVoice";
import { youIcon, WatchLocation, haversineKm, ZoomTracker } from "./mapUtils";

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
  useEffect(() => {
    if (!userLocation || !destination) return;
    const bounds = L.latLngBounds([userLocation, destination]);
    map.fitBounds(bounds, {
      paddingTopLeft: [50, 60],
      paddingBottomRight: [50, 260],
      maxZoom: 18,
      animate: true,
      duration: 0.6,
    });
  }, [userLocation, destination, trigger, map]);
  return null;
}

// Pure "locate me" — always flies to the user's coords on every trigger
// bump, even when there's no journey destination. Pans with a vertical
// offset so the user dot ends up in the CENTER of the band above the
// bottom-pinned widget (not the geometric center of the whole screen).
function LocateMeOnTrigger({ userLocation, trigger, widgetHeight }) {
  const map = useMap();
  const firstRef = useRef(true);
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return; }
    if (!userLocation || !map) return;
    try {
      const z = 17;
      const pt = map.project(userLocation, z);
      const offsetY = (widgetHeight + 16) / 2;
      const newCenter = map.unproject([pt.x, pt.y + offsetY], z);
      map.flyTo(newCenter, z, { duration: 0.6 });
    } catch (e) { /* ignore */ }
  }, [trigger, userLocation, widgetHeight, map]);
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
export default function NavigationMapScreen({ onGoBack, onEndWalk, onSetConstraints, onOpenTimeline, journeyItems = [], startLocation, onJourneyChange, addedIds, setAddedIds, visitedIds, setVisitedIds, setVisitedAt, setStopDwellMs, vibePreferences, preferences, showVoice = true }) {
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

  // Dev-only diagnostic: log the journey state every time it changes so
  // we can see whether saved stops actually land in confirmedStops in
  // the right order (and which ones have geocoded coords yet).
  useEffect(() => {
    console.log("[Nav] journeyItems=", journeyItems.map((j) => `${j.name}(${j.lat ? "✓" : "—"})`));
    console.log("[Nav] confirmedStops=", confirmedStops.map((s) => s.name));
    console.log("[Nav] nextTarget=", nextTarget?.name || "(none)");
  }, [journeyItems, confirmedStops, nextTarget]);
  const initialCenter = startLocation || (journeyItems.length > 0 && journeyItems[0].lat
    ? [journeyItems[0].lat, journeyItems[0].lng]
    : [0, 0]);
  const [userLocation, setUserLocation] = useState(initialCenter);
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
    const apply = () => setWidgetHeight(el.offsetHeight);
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
  const aiNarration = aiTestMode === 1 || aiTestMode === 3
    ? AI_NARRATIONS[aiSampleIdx % AI_NARRATIONS.length]
    : "";
  const aiSuggestion = aiTestMode === 2 || aiTestMode === 3
    ? AI_SUGGESTIONS[aiSampleIdx % AI_SUGGESTIONS.length]
    : "";
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
  const isAtTarget = liveDistToTargetM !== null && liveDistToTargetM <= FT_300_M;

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
    if (remainingAfter === 0 && onGoBack) {
      // Defer one tick so the visitedIds update flushes before the
      // parent unmounts this screen.
      setTimeout(() => onGoBack(), 0);
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

          {/* Faint hint of the FUTURE leg of the route (target → next
              unvisited stops), drawn along real walking streets via
              OSRM rather than a straight line cutting across blocks.
              Falls back to a thin straight dashed line while OSRM is
              loading so the path doesn't disappear during a fetch. */}
          {remainingRoute && (
            <Polyline
              positions={remainingRoute}
              pathOptions={{
                color: "#8851D4",
                weight: 4,
                opacity: 0.45,
                dashArray: "6 8",
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
                color: "#8851D4",
                weight: 3,
                opacity: 0.30,
                dashArray: "4 8",
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          )}

          {/* Walking route along streets (from OSRM) — salient leg from
              user to next target. */}
          {walkingRoute && (
            <Polyline positions={walkingRoute} pathOptions={{ color: "#8851D4", weight: 6, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />
          )}
          {/* Fallback dashed line while route loads */}
          {!walkingRoute && stopPositions.length > 0 && (
            <Polyline positions={[userLocation, ...stopPositions]} pathOptions={{ color: "#8851D4", weight: 5, opacity: 0.75, dashArray: "6 8", lineCap: "round" }} />
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
              // Tier (mirrors HomeScreen): pill on tap, mini purple dot when
              // zoomed out, labeled dot otherwise. Hidden at extreme low zoom.
              let mode;
              if (expanded) mode = 'open';
              else if (mapZoom < 12) mode = 'hidden';
              else if (mapZoom < 14) mode = 'mini';
              else mode = 'dot';
              if (mode === 'hidden') return null;
              return (
                <Marker
                  key={`stop-muted-${s.id}`}
                  position={[s.lat, s.lng]}
                  icon={stopLabelIcon(s.name, s.desc, null, mode, !isVisited, true)}
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
                icon={stopLabelIcon(nextTarget.name, nextTarget.desc, 1, mode, !isVisited, false)}
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

          {/* User position */}
          <Marker position={userLocation} icon={youIcon} />
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
                icon={aiPinIcon(aiSuggestedPin.name)}
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

      {/* Profile FAB — top-right of the map. Doubles as a dev cycler that
          steps through AI presentation modes (none → narration → suggestion
          → narration+suggestion). */}
      <button
        type="button"
        className="fab-circle top-right-btn"
        aria-label={`Profile (AI test mode ${aiTestMode})`}
        onClick={() => {
          setAiTestMode((m) => (m + 1) % 4);
          setAiSampleIdx((i) => i + 1);
        }}
      >
        <span className="top-right-initials">ST</span>
      </button>

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
           Hidden when this screen is rendered as the Timeline backdrop
           (showVoice=false), so the FABs don't sit on top of the
           Timeline overlay. ── */}
      {showVoice && (
        <div
          className="bottom-right-stack bottom-right-stack--nav"
          style={{ bottom: `${widgetHeight + 32}px` }}
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
      {showVoice && isExplorationMode && confirmedStops.length > 0 && (
        <button
          type="button"
          className="fab-circle start-walk-pill nav-start-walk-pill"
          style={{ bottom: `${widgetHeight + 32}px` }}
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

      {/* ── WALK COMPANION WIDGET (top-pinned, voice + nav context) ── */}
      {showVoice && voiceMode !== "full" && (() => {
        // The "next stop" being routed to == first non-visited confirmed
        // Timeline item. When nothing is confirmed/all visited, the widget
        // shows an empty state and the CTA flips to "See suggestions".
        const nextStop = nextTarget;
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
        } else if (!userLocation || liveDistToStopM === null) {
          instruction = "head out";
        } else if (distToTurnM !== null && distToTurnM <= 15) {
          instruction = `turn ${String(nextTurn.maneuver.modifier || "right").toLowerCase()}`;
        } else if (distToTurnM !== null) {
          instruction = `walk forward ${fmtDist(distToTurnM)}`;
        } else if (liveDistToStopM <= 15) {
          instruction = "arriving";
        } else {
          instruction = `walk forward ${fmtDist(liveDistToStopM)}`;
        }
        return (
          <WalkCompanionWidget
            ref={widgetRef}
            destination={nextWaypoint}
            instruction={instruction}
            distance={isEmpty ? "—" : distance}
            eta={isEmpty ? "—" : eta}
            canSkip={confirmedStops.filter((s) => !visitedIds?.has(s.id)).length > 1}
            atTarget={isAtTarget}
            progress={progress}
            narration={aiNarration}
            suggestion={aiSuggestion}
            onArrived={handleArrived}
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
        );
      })()}

    </div>
  );
}
