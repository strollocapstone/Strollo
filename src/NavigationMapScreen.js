import React, { useState, useEffect, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./NavigationMapScreen.css";
import WalkCompanionWidget from "./WalkCompanionWidget";
import VoiceFullScreen from "./VoiceFullScreen";
import { getWalkingRoute, geocodePlace } from "./geminiService";
import { useJourneyVoice } from "./useJourneyVoice";
import { youIcon, WatchLocation, haversineKm, reverseGeocode } from "./mapUtils";

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

// Final-stop flag pin — same shape as the timeline's FinalStopPin. Positions
// itself above the labeled pill via .sugg-pin-final-pin (absolute, bottom:100%).
const FINAL_PIN_HTML = `<span class="sugg-pin-final-pin" aria-hidden="true">
  <svg width="22" height="22" viewBox="0 0 24 24" fill="#8851D4" stroke="none">
    <path d="M12 22s7-7.06 7-12a7 7 0 1 0-14 0c0 4.94 7 12 7 12z"/>
    <circle cx="12" cy="10" r="2.6" fill="white"/>
  </svg>
</span>`;

// Added-pill stop pin — identical look to the HomeScreen "added" pill so navigation
// and home share one visual vocabulary (purple icon circle + name + sequence badge).
// When `expanded` is true and `removable` is true, the pill reveals an X button
// the user can tap to drop that stop from the route. When `isFinal` is true, a
// purple flag pin floats above the pill (matches TimelineScreen's FinalStopPin).
const stopLabelIcon = (name, desc, sequence, expanded = false, removable = false, isFinal = false) => {
  const icon = NAV_CATEGORY_ICONS[desc] || "location_on";
  const classes = ["sugg-pin", "sugg-pin--added"];
  if (expanded) classes.push("sugg-pin--open");
  if (isFinal) classes.push("sugg-pin--final");
  return L.divIcon({
    className: "",
    html: `<div class="${classes.join(' ')}">
      ${isFinal ? FINAL_PIN_HTML : ""}
      <div class="sugg-pin-dot">
        ${sequence
          ? `<span class="sugg-pin-dot-number">${sequence}</span>`
          : `<span class="material-symbols-rounded sugg-pin-dot-icon">${icon}</span>`}
      </div>
      <span class="sugg-pin-name">${name}</span>
      ${expanded && removable ? REMOVE_BTN_HTML : ""}
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

// Compact label pin for nearby suggestions on the map (places that aren't
// in the user's plan but might catch their eye mid-walk). Mirrors the
// HomeScreen dot-mode look so the navigation map reads the same as Home.
// When `expanded` is true it grows into the labeled pill with a "+" add
// button so the user can pull the place into their walk on the fly.
const nearbyPinIcon = (name, desc, expanded = false) => {
  const icon = NAV_CATEGORY_ICONS[desc] || "location_on";
  if (expanded) {
    const classes = ["sugg-pin", "sugg-pin--open"];
    return L.divIcon({
      className: "",
      html: `<div class="${classes.join(' ')}">
        <div class="sugg-pin-dot">
          <span class="material-symbols-rounded sugg-pin-dot-icon">${icon}</span>
        </div>
        <span class="sugg-pin-name">${name}</span>
        <div class="sugg-pin-extra">
          <button class="sugg-pin-add-btn" data-action="add" aria-label="Add to itinerary">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8851D4" stroke-width="3" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }
  return L.divIcon({
    className: "",
    html: `<div class="sugg-pin sugg-pin--dot" aria-label="${name}">
      <div class="sugg-pin-dot">
        <span class="material-symbols-rounded sugg-pin-dot-icon">${icon}</span>
      </div>
      <span class="sugg-pin-label">${name}</span>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

// Faint companion pin for non-current confirmed stops (visited + future
// stops on the planned route). Same shape as stopLabelIcon but smaller,
// label-less, and dimmed — they're context, not the active destination.
// When tapped/expanded, becomes a full pill with the same X remove control.
const stopLabelIconMuted = (name, desc, expanded = false, removable = false) => {
  const icon = NAV_CATEGORY_ICONS[desc] || "location_on";
  if (expanded) {
    const classes = ["sugg-pin", "sugg-pin--added", "sugg-pin--open"];
    return L.divIcon({
      className: "",
      html: `<div class="${classes.join(' ')}">
        <div class="sugg-pin-dot">
          <span class="material-symbols-rounded sugg-pin-dot-icon">${icon}</span>
        </div>
        <span class="sugg-pin-name">${name}</span>
        ${removable ? REMOVE_BTN_HTML : ""}
      </div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });
  }
  return L.divIcon({
    className: "",
    html: `<div class="sugg-pin sugg-pin--dot sugg-pin--muted" aria-label="${name}">
      <div class="sugg-pin-dot">
        <span class="material-symbols-rounded sugg-pin-dot-icon">${icon}</span>
      </div>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

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

// Auto-zoom the map to fit both the user and the next destination in the visible
// area above the bottom card, at the highest zoom level that still fits. Padding
// reserves vertical space for the navigation card (~260px including gap) and the
// top bar (~60px), so the route sits centered between them.
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

// ── NavigationMapScreen ────────────────────────────────────────────────────
export default function NavigationMapScreen({ onGoBack, onEndWalk, onSetConstraints, onOpenTimeline, onOpenChat, journeyItems = [], startLocation, onJourneyChange, addedIds, setAddedIds, visitedIds, setVisitedIds, setVisitedAt, setStopDwellMs, vibePreferences, nearbyPlaces = [], showVoice = true }) {
  // Confirmed stops match the Timeline's confirmed list: items the user has
  // explicitly added (in addedIds) AND that have valid coordinates. Falling
  // back to "all journey items with coords" preserves behavior if addedIds
  // wasn't passed.
  const confirmedStops = React.useMemo(() => {
    const withCoords = journeyItems.filter((s) => s.lat && s.lng);
    return addedIds ? withCoords.filter((s) => addedIds.has(s.id)) : withCoords;
  }, [journeyItems, addedIds]);
  // The actual routing target: first confirmed stop NOT yet visited. As the
  // user confirms "I am here", we advance to the next non-visited stop.
  const nextTarget = React.useMemo(
    () => confirmedStops.find((s) => !visitedIds?.has(s.id)) || null,
    [confirmedStops, visitedIds]
  );
  // Nearby places that aren't already on the user's plan — shown on the map
  // as small label pins so the navigation view has the same surrounding
  // context the homepage map does (not just the route + stops in isolation).
  const nearbyOnMap = React.useMemo(() => {
    if (!Array.isArray(nearbyPlaces) || nearbyPlaces.length === 0) return [];
    return nearbyPlaces.filter(
      (p) => p && p.lat && p.lng && !addedIds?.has(p.id)
    );
  }, [nearbyPlaces, addedIds]);
  const initialCenter = startLocation || (journeyItems.length > 0 && journeyItems[0].lat
    ? [journeyItems[0].lat, journeyItems[0].lng]
    : [0, 0]);
  const [userLocation, setUserLocation] = useState(initialCenter);
  const [locateTrigger, setLocateTrigger] = useState(1); // auto-locate on mount
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
  const [voiceMode, setVoiceMode]         = useState(null); // null | "full"
  // Which stop pin is currently expanded (showing its X remove button).
  // Only one can be open at a time; tapping another pin or the same pin
  // again closes it.
  const [expandedStopId, setExpandedStopId] = useState(null);

  // Reverse-geocoded place name for the user's current location, used by
  // the WCW empty-state header ("You are at <currentLocationName>"). Only
  // fetched when there's no planned next stop and the user has been still
  // for ~1.5s; cached per ~110m grid so GPS jitter doesn't re-ping the
  // (free, unauthenticated) Nominatim endpoint above its 1 req/sec limit.
  const [currentLocationName, setCurrentLocationName] = useState(null);
  const fetchedNameKeyRef = React.useRef(null);
  const isJourneyEmpty = !nextTarget;
  useEffect(() => {
    if (!isJourneyEmpty) {
      setCurrentLocationName(null);
      fetchedNameKeyRef.current = null;
      return;
    }
    if (!userLocation) return;
    const t = setTimeout(() => {
      const [lat, lng] = userLocation;
      const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
      if (fetchedNameKeyRef.current === key) return;
      fetchedNameKeyRef.current = key;
      reverseGeocode(lat, lng).then((name) => {
        if (name) setCurrentLocationName(name);
      });
    }, 1500);
    return () => clearTimeout(t);
  }, [isJourneyEmpty, userLocation]);

  // Measured height of the WCW so the locate / journey FABs can hover just
  // above it instead of at a hard-coded offset (the widget grows when the
  // user is listening / when narration appears, so a fixed offset overlaps).
  const [wcwHeight, setWcwHeight] = useState(0);
  const wcwResizeObserverRef = React.useRef(null);
  const wcwRef = useCallback((node) => {
    if (wcwResizeObserverRef.current) {
      wcwResizeObserverRef.current.disconnect();
      wcwResizeObserverRef.current = null;
    }
    if (node && typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        const e = entries[0];
        if (!e) return;
        // Defer the state update one frame so a sync setState inside the
        // observer callback can't trigger React's "ResizeObserver loop
        // completed with undelivered notifications" surfaced-as-error in
        // Chrome/Safari devtools. getBoundingClientRect includes padding +
        // border (the visible box) — contentRect would underestimate.
        const target = e.target;
        requestAnimationFrame(() => {
          setWcwHeight(target.getBoundingClientRect().height);
        });
      });
      ro.observe(node);
      wcwResizeObserverRef.current = ro;
    } else if (!node) {
      setWcwHeight(0);
    }
  }, []);

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

  // Add a nearby suggestion to the active walk. The user taps a nearby
  // pin → it expands into a pill → tapping "+" runs this. We append to
  // journeyItems and addedIds so the new stop joins the route + timeline.
  const addNearbyStop = useCallback((place) => {
    if (!onJourneyChange || !place) return;
    if (journeyItems.some((j) => j.id === place.id)) {
      setExpandedStopId(null);
      return;
    }
    onJourneyChange([...journeyItems, place]);
    if (setAddedIds) {
      setAddedIds((prev) => {
        const next = new Set(prev);
        next.add(place.id);
        return next;
      });
    }
    setExpandedStopId(null);
  }, [journeyItems, onJourneyChange, setAddedIds]);

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

  // Route follows the Timeline: route to the FIRST non-visited confirmed
  // stop. If nothing is confirmed (or all visited), stopPositions is empty
  // and no route is fetched.
  const stopPositions = nextTarget ? [[nextTarget.lat, nextTarget.lng]] : [];

  // Live straight-line distance to the next target — drives the "I am here"
  // affordance and the wcw stats. Computed at component scope so the button
  // (above wcw) can read it too.
  const liveDistToTargetM = React.useMemo(() => {
    if (!nextTarget || !userLocation) return null;
    return haversineKm(userLocation, [nextTarget.lat, nextTarget.lng]) * 1000;
  }, [nextTarget, userLocation]);
  // The WCW's skip pill swaps into "I am here" once the user is within
  // ~300 ft (≈91.5 m) of the next confirmed stop. The map no longer shows
  // a separate "I am here" bar — the affordance lives inside the widget.
  const isAtTarget = liveDistToTargetM !== null && liveDistToTargetM <= 91.5;

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
    setVisitedIds((prev) => {
      const out = new Set(prev);
      out.add(nextTarget.id);
      return out;
    });
    // Stamp the arrival time so the Reward screen can compute real per-stop
    // dwell minutes (next stop's arrival - this stop's arrival).
    if (setVisitedAt) {
      setVisitedAt((prev) => {
        const out = new Map(prev);
        out.set(nextTarget.id, Date.now());
        return out;
      });
    }
    // If this was the LAST non-visited stop, the journey is complete →
    // hand off to the Reward screen instead of leaving the user staring at
    // an empty map ("No current destination").
    const remaining = confirmedStops.filter(
      (s) => s.id !== nextTarget.id && !visitedIds?.has(s.id)
    );
    if (remaining.length === 0 && onEndWalk) {
      onEndWalk();
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
    <>

      {/* ── MAP ── */}
      <div
        className={`map-wrapper${headingUp ? " heading-up" : ""}`}
        style={{ "--map-rotation": `${navBearing}deg` }}
      >
        <MapContainer center={initialCenter} zoom={14} zoomControl={false} attributionControl={false} className="map-container">
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" maxZoom={19} />

          {/* Atmospheric purple area-of-interest blobs */}
          {blobs.map((b, i) => (
            <Marker key={`blob-${i}`} position={b.pos} icon={makeBlob(b.w, b.h, b.rot, b.idx)} />
          ))}

          {/* Faint hint of the WHOLE confirmed route (visited + future) so
              the user sees the broader plan even though only the active
              leg is highlighted. Drawn FIRST so the salient OSRM line and
              walked trail layer on top of it. Straight-line dashed —
              context, not navigation. */}
          {confirmedStops.length > 1 && (
            <Polyline
              positions={confirmedStops.map((s) => [s.lat, s.lng])}
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
              user to next target. Only renders while there's a destination;
              when the journey is empty, no purple line clutters the map. */}
          {nextTarget && walkingRoute && (
            <Polyline positions={walkingRoute} pathOptions={{ color: "#8851D4", weight: 6, opacity: 0.9, lineCap: "round", lineJoin: "round" }} />
          )}
          {/* Fallback dashed line while route loads (also gated on nextTarget). */}
          {nextTarget && !walkingRoute && stopPositions.length > 0 && (
            <Polyline positions={[userLocation, ...stopPositions]} pathOptions={{ color: "#8851D4", weight: 5, opacity: 0.75, dashArray: "6 8", lineCap: "round" }} />
          )}

          {/* Nearby places that aren't on the plan — same look as HomeScreen
              dot pins so the navigation map carries the same surrounding
              context. Tap to expand into a pill; tap "+" to pull the place
              into the active walk. Drawn first so confirmed/active stops
              stack above. */}
          {nearbyOnMap.map((p) => {
            const expanded = expandedStopId === p.id;
            return (
              <Marker
                key={`nearby-${p.id}`}
                position={[p.lat, p.lng]}
                icon={nearbyPinIcon(p.name, p.desc, expanded)}
                eventHandlers={{
                  click: (e) => {
                    const target = e.originalEvent?.target;
                    if (target?.closest?.('[data-action="add"]')) {
                      addNearbyStop(p);
                      return;
                    }
                    setExpandedStopId(expanded ? null : p.id);
                  },
                }}
              />
            );
          })}

          {/* All confirmed stops render as labeled location pills with their
              journey-order sequence number. The final stop in the journey
              gets a purple flag pin floating above it (mirrors TimelineScreen's
              FinalStopPin). Tap any pill to reveal an X for removal. */}
          {confirmedStops.map((s, idx) => {
            const expanded = expandedStopId === s.id;
            const isVisited = visitedIds?.has(s.id);
            const isFinal = idx === confirmedStops.length - 1;
            const sequence = idx + 1;
            return (
              <Marker
                key={`stop-${s.id}`}
                position={[s.lat, s.lng]}
                icon={stopLabelIcon(s.name, s.desc, sequence, expanded, !isVisited, isFinal)}
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

          {/* User position */}
          <Marker position={userLocation} icon={youIcon} />
          <WatchLocation onUpdate={setUserLocation} />

          {/* Zoom the map to fit user + next destination with max zoom possible.
              Re-runs whenever userLocation, destination, or the locate button trigger changes. */}
          <NavFitRoute
            userLocation={userLocation}
            destination={stopPositions[0] || null}
            trigger={locateTrigger}
          />
        </MapContainer>
      </div>

      {/* Profile FAB — top-right of the map. Doubles as a dev cycler that
          steps through AI presentation modes (none → narration → suggestion
          → narration+suggestion → at-target "I am here" preview). */}
      <button
        type="button"
        className="fab-circle top-right-btn"
        aria-label={`Profile (AI test mode ${aiTestMode})`}
        onClick={() => {
          setAiTestMode((m) => (m + 1) % 5);
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

      {/* ── BOTTOM-RIGHT STACK: just Locate (map is always north-up).
           Hidden when this screen is rendered as the Timeline backdrop
           (showVoice=false), so the locate FAB doesn't sit on top of
           the Timeline overlay. ── */}
      {showVoice && (
        <div
          className="bottom-right-stack bottom-right-stack--nav"
          style={wcwHeight > 0
            ? { bottom: `${16 + wcwHeight + 16}px` }
            : undefined
          }
        >
          <button
            className={`fab-circle bottom-right-btn bottom-right-btn--journey${confirmedStops.length === 0 ? " bottom-right-btn--disabled" : ""}`}
            onClick={onOpenTimeline}
            aria-label="Check journey"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#FFD501" stroke="none" aria-hidden="true">
              <path d="M8 3 L8 21" stroke="#FFD501" strokeWidth="2" strokeLinecap="round"/>
              <path d="M8 3 L18 6 L8 10 Z"/>
              <circle cx="8" cy="21" r="2"/>
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
      )}

      {/* ── WALK COMPANION WIDGET (top-pinned, voice + nav context).
           The widget owns the "I am here" affordance now: when the user is
           within 300 ft of the next stop, its skip pill swaps to "I am here". ── */}
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
            ref={wcwRef}
            destination={nextWaypoint}
            currentLocationName={currentLocationName}
            instruction={instruction}
            distance={isEmpty ? "—" : distance}
            eta={isEmpty ? "—" : eta}
            atTarget={(isAtTarget || aiTestMode === 4) && !!nextStop}
            progress={progress}
            narration={aiNarration}
            suggestion={aiSuggestion}
            transcript={voice.speech.transcript}
            onSpeakStart={voice.onListenStart}
            onSpeakEnd={voice.onListenEnd}
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
            onArrived={handleArrived}
            onChat={onOpenChat}
            onEnd={onEndWalk || onGoBack}
            onExpand={() => setVoiceMode("full")}
          />
        );
      })()}

      {voiceMode === "full" && (
        <VoiceFullScreen
          listening={false}
          locked={false}
          muted={false}
          messages={[]}
          onMuteToggle={() => {}}
          onListenStart={() => {}}
          onListenEnd={() => {}}
          onDragLock={() => {}}
          onUnlock={() => {}}
          onMinimize={() => setVoiceMode(null)}
        />
      )}
    </>
  );
}
