import React, { useState, useEffect } from "react";
import "./TimelineScreen.css";
import { fetchNearbyPlaces } from "./geminiService";

// Fallback image when the place doesn't have one
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=400&h=300&fit=crop";

// Category → accurate establishment image (Unsplash source)
const CATEGORY_IMAGES = {
  Coffee:     "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&h=400&fit=crop",
  Bakery:     "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=600&h=400&fit=crop",
  Restaurant: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop",
  Bar:        "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600&h=400&fit=crop",
  "Ice Cream":"https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=600&h=400&fit=crop",
  Bookstore:  "https://images.unsplash.com/photo-1526243741027-444d633d7365?w=600&h=400&fit=crop",
  Library:    "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=600&h=400&fit=crop",
  Theatre:    "https://images.unsplash.com/photo-1503095396549-807759245b35?w=600&h=400&fit=crop",
  Florist:    "https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=600&h=400&fit=crop",
  Museum:     "https://images.unsplash.com/photo-1565060169187-5284a3352405?w=600&h=400&fit=crop",
  Gallery:    "https://images.unsplash.com/photo-1544967082-d9d25d867d66?w=600&h=400&fit=crop",
  Art:        "https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&h=400&fit=crop",
  Arts:       "https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&h=400&fit=crop",
  Viewpoint:  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=400&fit=crop",
  Attraction: "https://images.unsplash.com/photo-1499540633125-484965b60031?w=600&h=400&fit=crop",
  Park:       "https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=600&h=400&fit=crop",
  Garden:     "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=600&h=400&fit=crop",
};

function imageForCategory(category) {
  return CATEGORY_IMAGES[category] || FALLBACK_IMAGE;
}

// Estimate walk time (min) between two lat/lng points. Falls back to 5 min.
function estimateWalkMin(a, b) {
  if (!a || !b || !a.lat || !b.lat) return 5;
  const R = 6371; // km
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h));
  return Math.max(1, Math.round((km / 4.5) * 60));
}

// ── Icons ─────────────────────────────────────────────────────────────────
function WarningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#FF9900" stroke="none">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

// ── Location warning tags ────────────────────────────────────────────────
// Each tag has an icon + short label. Tags are assigned deterministically per
// place (hash of id) so the same location always surfaces the same warnings.
const WARNING_TAGS = [
  {
    id: "crowded",
    label: "Highly crowded",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
      </svg>
    ),
  },
  {
    id: "ticket",
    label: "Ticket required",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22 10V6c0-1.11-.9-2-2-2H4c-1.1 0-1.99.89-1.99 2v4c1.1 0 1.99.9 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-9 7.5h-2v-2h2v2zm0-4.5h-2v-2h2v2zm0-4.5h-2v-2h2v2z" />
      </svg>
    ),
  },
  {
    id: "accessibility",
    label: "Not wheelchair accessible",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm-2 19.5v-6l-3-3V8h10v2h-8v4l3 2v5.5h-2zm9.5-2.5l-2-2-1.5 1.5 3.5 3.5L22 18l-1.5-1.5z" />
      </svg>
    ),
  },
  {
    id: "construction",
    label: "Construction nearby",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L1 21h22L12 2zm1 14h-2v-2h2v2zm0-4h-2V8h2v4z" />
      </svg>
    ),
  },
  {
    id: "loud",
    label: "Loud environment",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8c1.48-.73 2.5-2.25 2.5-4zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77S18.01 4.14 14 3.23z" />
      </svg>
    ),
  },
  {
    id: "closing",
    label: "Closing soon",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 11h-4V7h2v4h2v2z" />
      </svg>
    ),
  },
  {
    id: "steep",
    label: "Steep uphill approach",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 20L20 4v16H4z" />
      </svg>
    ),
  },
];

// Category → Material Symbol glyph (mirrors HomeScreen / NavigationMapScreen).
const TL_CATEGORY_ICONS = {
  "Coffee": "local_cafe", "Restaurant": "restaurant", "Bar": "local_bar",
  "Ice Cream": "icecream", "Bakery": "bakery", "Bookstore": "menu_book",
  "Library": "local_library", "Theatre": "theater_comedy", "Florist": "local_florist",
  "Museum": "museum", "Gallery": "palette", "Art": "brush",
  "Viewpoint": "landscape", "Attraction": "attractions", "Arts": "theater_comedy",
  "Park": "park", "Garden": "yard",
};

// Deterministic "random" subset of warning tags for a given place id.
function warningTagsForItem(item) {
  const hash = Math.abs(Number(item.id) || item.name.length * 31);
  // ~50% of places get one warning, ~20% get two, rest get none
  const bucket = hash % 10;
  if (bucket < 3) return [];
  const count = bucket >= 8 ? 2 : 1;
  const start = hash % WARNING_TAGS.length;
  const tags = [];
  for (let i = 0; i < count; i++) {
    tags.push(WARNING_TAGS[(start + i) % WARNING_TAGS.length]);
  }
  return tags;
}

// ── Expanded card detail ──────────────────────────────────────────────────
// Map-pin marker rendered on the vertical rail at the user's current
// position (= the next-target confirmed card, or top of the rail when
// nothing is confirmed yet).
function RailPin() {
  return (
    <span className="tl-rail-here" aria-label="You are here" role="img">
      <span className="tl-rail-boots">
        <svg className="tl-rail-foot tl-rail-foot--left" width="14" height="22" viewBox="0 0 28 46" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 2 C5 2 3 5 3 10 L3 32 C3 38 5 44 10 44 L17 44 C20 44 22 42 23 38 L24 32 C24 28 22 26 19 26 L18 26 L18 10 C18 5 16 2 13 2 Z" fill="#1E1541"/>
          <line x1="6" y1="14" x2="17" y2="14" stroke="#fff" strokeWidth="1.5" opacity="0.5"/>
          <line x1="6" y1="19" x2="17" y2="19" stroke="#fff" strokeWidth="1.5" opacity="0.5"/>
        </svg>
        <svg className="tl-rail-foot tl-rail-foot--right" width="14" height="22" viewBox="0 0 28 46" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2 C23 2 25 5 25 10 L25 32 C25 38 23 44 18 44 L11 44 C8 44 6 42 5 38 L4 32 C4 28 6 26 9 26 L10 26 L10 10 C10 5 12 2 15 2 Z" fill="#1E1541"/>
          <line x1="11" y1="14" x2="22" y2="14" stroke="#fff" strokeWidth="1.5" opacity="0.5"/>
          <line x1="11" y1="19" x2="22" y2="19" stroke="#fff" strokeWidth="1.5" opacity="0.5"/>
        </svg>
      </span>
      <span className="tl-rail-node" aria-hidden="true" />
    </span>
  );
}

function FinalStopPin() {
  return (
    <svg
      className="tl-rail-final-pin"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="#8851D4"
      stroke="none"
      aria-label="Final stop"
      role="img"
    >
      <path d="M12 22s7-7.06 7-12a7 7 0 1 0-14 0c0 4.94 7 12 7 12z" />
      <circle cx="12" cy="10" r="2.6" fill="white" />
    </svg>
  );
}

function CardWarningTags({ item }) {
  const tags = warningTagsForItem(item);
  if (tags.length === 0) return null;
  return (
    <div className="tl-card-tags">
      {tags.map((t) => (
        <span className="tl-card-tag" key={t.id}>
          {t.icon}
          <span>{t.label}</span>
        </span>
      ))}
    </div>
  );
}

function CardDetail({ item, onCollapse, onAdd, onDismiss, onDislike }) {
  const mapsQuery = item.lat && item.lng
    ? `${item.lat},${item.lng}`
    : encodeURIComponent(item.name);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return (
    <div
      className={`tl-card-detail ${item.type === "suggestion" ? "tl-card-detail--suggestion" : ""}`}
      onClick={onCollapse}
    >
      {/* Header: place name + external-link-to-Maps icon */}
      <div className="tl-detail-header">
        <h3 className="tl-detail-title">{item.name}</h3>
        <a
          className="tl-detail-maps"
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${item.name} in Google Maps`}
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>

      <div className="tl-detail-image">
        <img src={item.image} alt={item.name} onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }} />
      </div>

      <div className="tl-detail-body">
        <span className="tl-detail-subheader">{item.category}</span>
        <div className="tl-detail-meta">
          <div className="tl-detail-meta-row">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5A4B64" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
            </svg>
            <span>{item.hours || "Hours vary — check before visiting"}</span>
          </div>
          <div className="tl-detail-meta-row">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5A4B64" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span>{item.walkMin ? `${item.walkMin} minute walk from you` : item.time}</span>
          </div>
        </div>
        <CardWarningTags item={item} />
        <p className="tl-detail-desc">{item.description}</p>
      </div>

      {item.type === "suggestion" && (
        <div className="tl-detail-actions tl-detail-actions--suggestion">
          <button
            className="tl-card-action tl-card-action--dislike tl-detail-action"
            onClick={(e) => { e.stopPropagation(); onDislike?.(); }}
            aria-label={`Dislike ${item.name}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 14V2" />
              <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
            </svg>
            <span className="tl-card-action-label">Dislike</span>
          </button>
          <button
            className="tl-card-action tl-card-action--dismiss tl-detail-action"
            onClick={(e) => { e.stopPropagation(); onDismiss?.(); }}
            aria-label={`Dismiss ${item.name}`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
            <span className="tl-card-action-label">Dismiss</span>
          </button>
          <button
            className="tl-card-action tl-card-action--add tl-detail-action"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
            aria-label={`Add ${item.name} to your plan`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span className="tl-card-action-label">Add</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Stopwatch hook — driven by an external start timestamp ───────────────
// When tripStartTime is null (trip not started / ended), the timer shows 00:00.
function useStopwatch(tripStartTime) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!tripStartTime) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [tripStartTime]);

  const elapsed = tripStartTime ? now - tripStartTime : 0;
  const totalSec = Math.max(0, Math.floor(elapsed / 1000));
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ── TimelineScreen ────────────────────────────────────────────────────────
const MAX_SUGGESTIONS = 3;

// Mirrors HomeScreen's preference → place-category mapping for suggestion filtering.
const TL_FILTER_DESCS = {
  cafes:      ["Coffee", "Bakery"],
  food:       ["Restaurant"],
  bars:       ["Bar"],
  museums:    ["Museum", "Gallery"],
  parks:      ["Park", "Garden"],
  attractions:["Attraction", "Viewpoint", "Arts", "Theatre"],
};

// Haversine (km) — used for the between-stop distance label
function tlHaversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const fmtImperial = (meters) => {
  const ft = meters * 3.28084;
  if (ft < 528) return `${Math.round(ft)} ft`;
  return `${(meters / 1609.344).toFixed(1)} mi`;
};

export default function TimelineScreen({
  nearbyPlaces = [],
  setNearbyPlaces,
  addedIds,
  setAddedIds,
  visitedIds,
  userLocation,
  tripStartTime,
  onGoBack,
  journeyItems = [],
  onJourneyChange,
  preferences,
}) {
  const [closing, setClosing] = useState(false);
  const screenRef = React.useRef(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [userLocationLabel, setUserLocationLabel] = useState("");
  // If the Timeline opens before the home screen had a chance to populate
  // nearbyPlaces (e.g. dev-mode skip, deep-link, or a stale session),
  // kick off a fallback fetch around the user's current location so the
  // suggestion rail isn't empty when no stops are added yet.
  useEffect(() => {
    if (nearbyPlaces && nearbyPlaces.length > 0) return;
    if (!userLocation || !setNearbyPlaces) return;
    let cancelled = false;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    (async () => {
      try {
        const places = await fetchNearbyPlaces(
          userLocation[0],
          userLocation[1],
          1500,
          controller ? { signal: controller.signal } : undefined,
        );
        if (cancelled) return;
        if (Array.isArray(places) && places.length > 0) setNearbyPlaces(places);
      } catch (_) { /* ignore — suggestions just stay empty */ }
    })();
    return () => {
      cancelled = true;
      if (controller) controller.abort();
    };
  }, [nearbyPlaces, userLocation, setNearbyPlaces]);

  // Snapshot the journey + addedIds when Timeline mounts so "Back to map"
  // can revert any reorder / skip / remove / add the user did this session
  // (Preferences-style cancel). "Save changes" just closes — edits are
  // already applied in real time as the user interacts.
  const originalStateRef = React.useRef({
    journeyItems,
    addedIds: addedIds ? new Set(addedIds) : new Set(),
  });
  const revertToSnapshot = React.useCallback(() => {
    const orig = originalStateRef.current;
    if (orig.journeyItems && onJourneyChange) onJourneyChange(orig.journeyItems);
    if (setAddedIds) setAddedIds(new Set(orig.addedIds));
  }, [onJourneyChange, setAddedIds]);
  useEffect(() => {
    if (!userLocation) return;
    let cancelled = false;
    const [lat, lng] = userLocation;
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18`;
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const a = data?.address || {};
        const label =
          a.amenity ||
          a.shop ||
          a.building ||
          [a.house_number, a.road].filter(Boolean).join(" ") ||
          a.neighbourhood ||
          a.suburb ||
          a.city ||
          data?.display_name?.split(",").slice(0, 2).join(", ");
        if (label) setUserLocationLabel(label);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userLocation]);
  const handleClose = () => {
    if (closing || !onGoBack) return;
    // Back to map = secondary "cancel" — toss any timeline edits before
    // the parent unmounts, mirroring Preferences' Back-to-map semantics.
    revertToSnapshot();
    setClosing(true);
    setTimeout(() => onGoBack(), 280);
  };
  const handleSaveChanges = () => {
    if (closing || !onGoBack) return;
    // Save changes = primary commit — edits are already applied in state,
    // so just play the close animation and bounce back to the map.
    setClosing(true);
    setTimeout(() => onGoBack(), 280);
  };
  const [expandedId, setExpandedId] = useState(null);
  // Lightbulb toggle in the topbar — when off, suggestion cards are hidden.
  const [showSuggestions, setShowSuggestions] = useState(true);
  // First-time hint: gently bounce the first card to the left every 5s so
  // the user discovers the swipe-to-reveal gesture. Persisted via
  // localStorage so it only ever fires once per device. Cleared as soon
  // as the user has demonstrably understood (any reveal / expand / drag).
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("strollo:tl-hint-seen")) {
        setShowSwipeHint(true);
        localStorage.setItem("strollo:tl-hint-seen", "1");
      }
    } catch (e) {
      // localStorage unavailable (private mode, etc.) — fail open, no hint.
    }
  }, []);
  // Swipe-to-reveal: while dragging, track {id, dx}. On release past the
  // threshold, set revealedId so the action stack appears behind the card.
  // Confirmed cards reveal 1 action (Remove); suggestion cards reveal 3
  // (Add / Dismiss / Dislike). Tapping the revealed card closes it.
  const [swipe, setSwipe] = useState({ id: null, dx: 0 });
  const [revealedId, setRevealedId] = useState(null);
  // Local-to-this-screen suggestion filtering: dismissed and disliked
  // suggestions drop out of the top-3 ranking, so the next-closest fills in.
  const [dismissedIds, setDismissedIds] = useState(() => new Set());
  const [dislikedIds, setDislikedIds] = useState(() => new Set());
  useStopwatch(tripStartTime);

  const SWIPE_THRESHOLD = 50;
  // Per-card reveal width: width of the action stack for that card type.
  // Buttons are 64px wide with 4px gap.
  const REVEALED_CONFIRMED = -64;
  const REVEALED_SUGGESTION = -(64 * 3 + 4 * 2);
  const swipeStartRef = React.useRef({ id: null, startX: 0, startY: 0, moved: false, offset: 0 });

  // ── Long-press → drag-to-reorder for non-visited confirmed cards ────────
  // After ~400ms of stillness on a reorderable card, the press becomes a
  // drag: the card lifts and follows the pointer. Releasing computes the
  // new index from row midpoints under the pointer and rewrites
  // journeyItems. Cards in visitedIds are not draggable.
  const [draggingId, setDraggingId] = useState(null);
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const dragRef = React.useRef({
    id: null,
    startY: 0,
    pointerY: 0,
    longPressTimer: null,
    rowRects: [],
    reorderableIds: [],
  });
  const rowElRefs = React.useRef(new Map());
  const setRowRef = (id) => (el) => {
    if (el) rowElRefs.current.set(id, el);
    else rowElRefs.current.delete(id);
  };

  const cancelLongPress = () => {
    if (dragRef.current.longPressTimer) {
      clearTimeout(dragRef.current.longPressTimer);
      dragRef.current.longPressTimer = null;
    }
  };

  const beginDrag = (id, reorderableIds) => {
    // Snapshot row rects so we can decide drop position from pointer Y.
    const rects = reorderableIds.map((rid) => {
      const el = rowElRefs.current.get(rid);
      return el ? { id: rid, rect: el.getBoundingClientRect() } : null;
    }).filter(Boolean);
    dragRef.current.rowRects = rects;
    dragRef.current.reorderableIds = reorderableIds;
    setDraggingId(id);
    setDragDeltaY(0);
    setSwipe({ id: null, dx: 0 });
    setRevealedId(null);
  };

  const computeDropIndex = (pointerY) => {
    const ids = dragRef.current.reorderableIds;
    let idx = 0;
    for (let i = 0; i < dragRef.current.rowRects.length; i++) {
      const r = dragRef.current.rowRects[i];
      const mid = r.rect.top + r.rect.height / 2;
      if (pointerY > mid) idx = i + 1;
    }
    return Math.min(ids.length - 1, Math.max(0, idx));
  };

  const onCardPointerDown = (e, id, offset, opts) => {
    const { isVisited = false, isReorderable = false, reorderableIds = [] } = opts || {};
    if (isVisited) return; // visited cards: no swipe, no drag
    swipeStartRef.current = { id, startX: e.clientX, startY: e.clientY, moved: false, offset };
    setSwipe({ id, dx: revealedId === id ? offset : 0 });
    cancelLongPress();
    if (isReorderable) {
      dragRef.current.startY = e.clientY;
      dragRef.current.pointerY = e.clientY;
      dragRef.current.longPressTimer = setTimeout(() => {
        const s = swipeStartRef.current;
        if (s.id === id && !s.moved) beginDrag(id, reorderableIds);
      }, 400);
    }
  };
  const onCardPointerMove = (e) => {
    if (draggingId !== null) {
      dragRef.current.pointerY = e.clientY;
      setDragDeltaY(e.clientY - dragRef.current.startY);
      return;
    }
    const s = swipeStartRef.current;
    if (!s.id) return;
    const raw = e.clientX - s.startX;
    const rawY = e.clientY - s.startY;
    if (Math.abs(raw) > 4 || Math.abs(rawY) > 4) {
      s.moved = true;
      cancelLongPress();
    }
    const base = revealedId === s.id ? s.offset : 0;
    const dx = Math.max(s.offset, Math.min(0, base + raw));
    setSwipe({ id: s.id, dx });
  };
  const onCardPointerUp = () => {
    cancelLongPress();
    if (draggingId !== null) {
      const id = draggingId;
      const ids = dragRef.current.reorderableIds;
      const orig = ids.indexOf(id);
      const target = computeDropIndex(dragRef.current.pointerY);
      if (target !== orig && onJourneyChange && orig >= 0) {
        const newReorder = ids.filter((_, i) => i !== orig);
        newReorder.splice(target, 0, id);
        // Rebuild journeyItems: visited stays first in current order, then
        // the reordered non-visited confirmed list, then any other items.
        const idToItem = new Map(journeyItems.map((j) => [j.id, j]));
        const visitedItems = journeyItems.filter((j) => visitedIds?.has(j.id));
        const reorderedItems = newReorder.map((rid) => idToItem.get(rid)).filter(Boolean);
        const otherItems = journeyItems.filter(
          (j) => !visitedIds?.has(j.id) && !ids.includes(j.id)
        );
        onJourneyChange([...visitedItems, ...reorderedItems, ...otherItems]);
      }
      setDraggingId(null);
      setDragDeltaY(0);
      return;
    }
    const s = swipeStartRef.current;
    if (!s.id) return;
    const id = s.id;
    const offset = s.offset;
    swipeStartRef.current = { id: null, startX: 0, startY: 0, moved: false, offset: 0 };
    setSwipe((cur) => {
      if (cur.id !== id) return cur;
      if (revealedId === id && cur.dx > offset + SWIPE_THRESHOLD) {
        setRevealedId(null);
        return { id: null, dx: 0 };
      }
      if (revealedId !== id && cur.dx <= -SWIPE_THRESHOLD) {
        setRevealedId(id);
        return { id: null, dx: 0 };
      }
      return { id: null, dx: 0 };
    });
  };
  const cardClickWasSwipe = () => swipeStartRef.current.moved;
  const onCardClick = (id) => {
    if (cardClickWasSwipe()) return;
    if (revealedId === id) { setRevealedId(null); return; }
    if (revealedId && revealedId !== id) { setRevealedId(null); return; }
    setExpandedId((cur) => (cur === id ? null : id));
  };
  // Split places by added state. Confirmed stops follow the journey order
  // (so an added suggestion stays where it was rendered, not at the end);
  // the suggestion pool keeps coming from the full nearby-places set.
  const confirmedPlaces = journeyItems.filter((p) => addedIds?.has(p.id));
  const suggestionPool = nearbyPlaces.filter((p) => !addedIds?.has(p.id));

  // Filter suggestions by the user's vibe preferences (if any are active)
  const activeFilters = preferences?.mapFilters?.filter((id) => TL_FILTER_DESCS[id]) ?? [];
  const allowedDescs = new Set();
  activeFilters.forEach((id) => TL_FILTER_DESCS[id].forEach((d) => allowedDescs.add(d)));
  const relevantPool = allowedDescs.size === 0
    ? suggestionPool
    : suggestionPool.filter((p) => allowedDescs.has(p.desc));

  // 3 closest attractions to the user (overall) become the suggestion set.
  // Dismissed and disliked suggestions are filtered out so the next-closest
  // attraction takes their slot.
  const userPoint = userLocation
    ? { lat: userLocation[0], lng: userLocation[1] }
    : null;
  const filteredPool = relevantPool.filter(
    (p) => !dismissedIds.has(p.id) && !dislikedIds.has(p.id)
  );
  const rankedSuggestions = [...filteredPool]
    .map((p) => ({ p, d: estimateWalkMin(userPoint, p) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ p }) => p);

  const buildItem = (p, prev, type) => {
    const category = p.desc || "Place";
    return {
      id: p.id,
      type,
      name: p.name,
      category,
      time: type === "confirmed" ? "Planned stop" : "Suggested nearby",
      walkMin: estimateWalkMin(prev, p),
      image: p.image || imageForCategory(category),
      hours: p.hours,
      description: p.description || `A nearby ${category.toLowerCase()} — worth a quick visit.`,
      lat: p.lat,
      lng: p.lng,
    };
  };

  const confirmedItems = confirmedPlaces.map((p, i) =>
    buildItem(p, i > 0 ? confirmedPlaces[i - 1] : userPoint, "confirmed")
  );
  // The current-target = first non-visited confirmed stop. Only used to place
  // the boots inline once the user has actually visited at least one stop.
  // Until then, the boots+address sit at the top of the rail above all stops.
  const hasVisited = (visitedIds?.size ?? 0) > 0;
  const currentTargetId = hasVisited
    ? confirmedItems.find((c) => !visitedIds?.has(c.id))?.id ?? null
    : null;
  // Final-stop = last confirmed item; gets a destination pin instead of a dot.
  const finalStopId = confirmedItems.length > 0
    ? confirmedItems[confirmedItems.length - 1].id
    : null;
  const reorderableIds = confirmedItems
    .filter((c) => !visitedIds?.has(c.id))
    .map((c) => c.id);
  const suggestionItems = showSuggestions
    ? rankedSuggestions.map((p) => buildItem(p, userPoint, "suggestion"))
    : [];
  const items = [...confirmedItems, ...suggestionItems];

  const handleAdd = (id) => {
    // Insert the place right after its closest existing confirmed stop, so
    // the new confirmed card replaces the suggestion in-place rather than
    // jumping to the end of the journey. With no confirmed stops yet, just
    // append.
    const place = nearbyPlaces.find((p) => p.id === id);
    if (place && onJourneyChange && !journeyItems.some((j) => j.id === id)) {
      let insertAt = journeyItems.length;
      if (journeyItems.length > 0 && place.lat && place.lng) {
        let bestIdx = journeyItems.length - 1;
        let bestD = Infinity;
        journeyItems.forEach((j, i) => {
          if (!j.lat || !j.lng) return;
          const d = tlHaversineKm([place.lat, place.lng], [j.lat, j.lng]);
          if (d < bestD) { bestD = d; bestIdx = i; }
        });
        insertAt = bestIdx + 1;
      }
      onJourneyChange([
        ...journeyItems.slice(0, insertAt),
        place,
        ...journeyItems.slice(insertAt),
      ]);
    }
    setAddedIds?.((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setExpandedId(null);
    setRevealedId(null);
  };

  const handleRemove = (id) => {
    setAddedIds?.((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setExpandedId(null);
    setRevealedId(null);
  };

  const handleDismiss = (id) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setExpandedId(null);
    setRevealedId(null);
  };

  const handleDislike = (id) => {
    setDislikedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setExpandedId(null);
    setRevealedId(null);
  };


  // Helper: distance between two coord-bearing items in meters (straight-line)
  const distMetersBetween = (a, b) => {
    if (!a?.lat || !a?.lng || !b?.lat || !b?.lng) return null;
    return tlHaversineKm([a.lat, a.lng], [b.lat, b.lng]) * 1000;
  };

  // Suggestion placement:
  //   - No confirmed stops: render in proximity order to the user.
  //   - With confirmed stops: each suggestion attaches to the confirmed stop
  //     it's closest to, and renders immediately after that stop.
  const suggestionsByConfirmed = new Map();
  confirmedItems.forEach((c) => suggestionsByConfirmed.set(c.id, []));
  if (confirmedItems.length > 0) {
    suggestionItems.forEach((s) => {
      let best = confirmedItems[0];
      let bestD = Infinity;
      confirmedItems.forEach((c) => {
        const d = distMetersBetween(s, c);
        if (d !== null && d < bestD) { bestD = d; best = c; }
      });
      suggestionsByConfirmed.get(best.id).push({ s, d: bestD });
    });
    suggestionsByConfirmed.forEach((arr) => arr.sort((a, b) => a.d - b.d));
  }

  // Once the user has successfully revealed an action stack, expanded a
  // card, or started a drag-reorder, kill the hint — they've found the
  // gesture and the bounce becomes noise.
  useEffect(() => {
    if (showSwipeHint && (revealedId || expandedId || draggingId)) {
      setShowSwipeHint(false);
    }
  }, [showSwipeHint, revealedId, expandedId, draggingId]);

  const rows = [];
  // Boots ("pin" row) represent the user's CURRENT position on the trail.
  //   • No visits yet → boots sit at the top of the rail (above the first
  //     queued stop), and there's no separate "start" dot since the boots
  //     ARE at the start.
  //   • As stops get visited → boots slide DOWN to just before the next
  //     non-visited stop (i.e. above the card the user is currently
  //     walking toward). A small "start-dot" row stays anchored at the
  //     very top of the rail to mark where the walk began.
  //   • All stops visited → boots end up below every card.
  if (!hasVisited && (confirmedItems.length > 0 || suggestionItems.length > 0)) {
    rows.push({ kind: "pin", key: "pin-top" });
  }
  if (confirmedItems.length === 0) {
    suggestionItems.forEach((it) => {
      rows.push({ kind: "card", item: it, isFirst: false, key: `card-${it.id}` });
    });
  } else {
    if (hasVisited) {
      rows.push({ kind: "start-dot", key: "start-dot" });
    }
    let pinInserted = !hasVisited; // already pushed above when nothing visited
    confirmedItems.forEach((item, i) => {
      // Drop the boots row right ABOVE the first non-visited stop the
      // user is currently walking toward.
      if (!pinInserted && !visitedIds?.has(item.id)) {
        rows.push({ kind: "pin", key: "pin-here" });
        pinInserted = true;
      }
      rows.push({ kind: "card", item, isFirst: i === 0, key: `card-${item.id}` });
      (suggestionsByConfirmed.get(item.id) || []).forEach(({ s }) => {
        rows.push({ kind: "card", item: s, isFirst: false, key: `card-${s.id}` });
      });
      if (i < confirmedItems.length - 1) {
        const next = confirmedItems[i + 1];
        rows.push({
          kind: "walk",
          walkMin: next.walkMin,
          distM: distMetersBetween(item, next),
          fromName: item.name,
          toName: next.name,
          key: `walk-between-${item.id}`,
        });
      }
    });
    // All confirmed stops visited — boots sit at the bottom of the trail.
    if (!pinInserted) {
      rows.push({ kind: "pin", key: "pin-end" });
    }
  }

  const firstCardItemId = rows.find((r) => r.kind === "card")?.item?.id ?? null;

  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    const update = () => {
      const overflowing = el.scrollHeight > el.clientHeight + 1;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      setIsScrollable(overflowing && !atBottom);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [rows.length, expandedId]);

  return (
    <div ref={screenRef} className={`tl-screen${closing ? " tl-screen--closing" : ""}`}>
      {/* ── Top bar: title + lightbulb suggestions toggle ── */}
      <div className="tl-topbar">
        <span className="tl-suggestions-title">Your current exploration</span>
        <button
          type="button"
          className="tl-bulb-btn"
          onClick={() => setShowSuggestions((v) => !v)}
          aria-pressed={showSuggestions}
          aria-label={showSuggestions ? "Hide suggestions" : "Show suggestions"}
          title={showSuggestions ? "Hide suggestions" : "Show suggestions"}
        >
          {showSuggestions ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#FFD501" stroke="#B5912E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7 4 4 0 0 1 1.5 3.1V18h5v-.2a4 4 0 0 1 1.5-3.1A7 7 0 0 0 12 2z" />
            </svg>
          ) : (
            <>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5A4B64" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path d="M12 2a7 7 0 0 0-4 12.7 4 4 0 0 1 1.5 3.1V18h5v-.2a4 4 0 0 1 1.5-3.1A7 7 0 0 0 12 2z" />
              </svg>
              <svg className="tl-bulb-slash" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5A4B64" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="20" x2="20" y2="4" />
              </svg>
            </>
          )}
        </button>
      </div>

      {/* ── Timeline ── */}
      <div className="tl-timeline">
        <div className="tl-timeline-inner">
        {rows.length === 0 && (
          <div className="tl-empty">
            <p className="tl-empty-title">No stops added to your exploration!</p>
            <p className="tl-empty-body">
              Add suggested stops or ask Strollo — it'll find something you'll actually like.
            </p>
          </div>
        )}

        {/* Single continuous vertical line */}
        {rows.length > 0 && <div className="tl-rail" />}

        {rows.map((row) => {
          if (row.kind === "pin") {
            return (
              <div className="tl-row tl-row--pin-only" key={row.key}>
                <div className="tl-rail-cell"><RailPin /></div>
                <div className="tl-content-cell">
                  <span className="tl-you-are-here">
                    {userLocationLabel || "You are here"}
                  </span>
                </div>
              </div>
            );
          }
          if (row.kind === "start-dot") {
            // Marks where the walk began. Sits at the very top of the rail
            // once the user has visited at least one stop, so the boots can
            // slide down without losing the "I started here" anchor.
            return (
              <div className="tl-row tl-row--start-dot" key={row.key}>
                <div className="tl-rail-cell">
                  <span className="tl-rail-node" aria-hidden="true" />
                </div>
                <div className="tl-content-cell">
                  <span className="tl-start-label">Started here</span>
                </div>
              </div>
            );
          }
          if (row.kind === "walk") {
            return (
              <div className="tl-row tl-row--walk" key={row.key}>
                <div className="tl-rail-cell" />
                <div className="tl-content-cell">
                  <div className="tl-walk-label">
                    <div className="tl-walk-primary">
                      {row.distM !== null && <span>{fmtImperial(row.distM)}</span>}
                      {row.distM !== null && <span className="tl-walk-dot">·</span>}
                      <span>{row.walkMin} min walk</span>
                    </div>
                    {row.fromName && row.toName && (
                      <div className="tl-walk-secondary">
                        from {row.fromName} to {row.toName}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          const { item } = row;
          const isSuggestion = item.type === "suggestion";
          const isExpanded = expandedId === item.id;
          const isVisited = !isSuggestion && (visitedIds?.has(item.id) ?? false);
          const isCurrentTarget = !isSuggestion && item.id === currentTargetId;
          const isReorderable = !isSuggestion && reorderableIds.includes(item.id);
          const isBeingDragged = draggingId === item.id;
          // First-card swipe hint applies to whichever card is rendered first
          // in the rows list (could be a confirmed stop or, when nothing is
          // confirmed, the top suggestion). Suppressed during any user
          // interaction with this card so the inline transform wins.
          const isFirstCard = item.id === firstCardItemId;

          return (
            <div
              className={`tl-row tl-row--card ${isSuggestion ? "tl-row--suggestion" : ""} ${isVisited ? "tl-row--visited" : ""}`}
              key={row.key}
              ref={isReorderable ? setRowRef(item.id) : undefined}
            >
              <div className="tl-rail-cell">
                {isCurrentTarget ? (
                  <RailPin />
                ) : !isSuggestion && item.id === finalStopId ? (
                  <FinalStopPin />
                ) : (
                  <div
                    className={`tl-rail-node${isSuggestion ? " tl-rail-node--suggest" : ""}${isVisited ? " tl-rail-node--visited" : ""}`}
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="tl-content-cell">
                {isExpanded ? (
                  <CardDetail
                    item={item}
                    onCollapse={() => setExpandedId(null)}
                    onAdd={() => handleAdd(item.id)}
                    onRemove={() => handleRemove(item.id)}
                    onDismiss={() => handleDismiss(item.id)}
                    onDislike={() => handleDislike(item.id)}
                  />
                ) : (() => {
                  const isDragging = swipe.id === item.id;
                  const isRevealed = revealedId === item.id && !isDragging;
                  const cardOffset = isSuggestion ? REVEALED_SUGGESTION : REVEALED_CONFIRMED;
                  const dx = isDragging ? swipe.dx : (isRevealed ? cardOffset : 0);
                  const swipeTransition = isDragging ? "none" : "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)";
                  // While the user is reorder-dragging this card, the
                  // translateY follows the pointer and translateX is 0.
                  const cardTransform = isBeingDragged
                    ? `translateY(${dragDeltaY}px)`
                    : `translateX(${dx}px)`;
                  const cardTransition = isBeingDragged ? "none" : swipeTransition;
                  // Visited cards: no swipe-to-reveal action stack.
                  const showActions = !isVisited;
                  // Show the bouncy hint only on the first card, only when
                  // the user isn't currently touching/expanding/dragging it.
                  const showHint =
                    showSwipeHint &&
                    isFirstCard &&
                    !isVisited &&
                    !isExpanded &&
                    !isDragging &&
                    !isBeingDragged &&
                    !isRevealed;
                  return (
                <div className={`tl-card-swipe ${isRevealed || isDragging ? "tl-card-swipe--active" : ""}`}>
                  {showActions && (
                    <div className="tl-card-actions" style={{ width: Math.max(0, -dx) }}>
                      {isSuggestion ? (
                        <>
                          <button
                            className="tl-card-action tl-card-action--dislike"
                            style={{ right: 136 }}
                            onClick={() => handleDislike(item.id)}
                            aria-label={`Dislike ${item.name}`}
                            tabIndex={isRevealed ? 0 : -1}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 14V2" />
                              <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z" />
                            </svg>
                            <span className="tl-card-action-label">Dislike</span>
                          </button>
                          <button
                            className="tl-card-action tl-card-action--dismiss"
                            style={{ right: 68 }}
                            onClick={() => handleDismiss(item.id)}
                            aria-label={`Dismiss ${item.name}`}
                            tabIndex={isRevealed ? 0 : -1}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                              <line x1="6" y1="6" x2="18" y2="18" />
                              <line x1="18" y1="6" x2="6" y2="18" />
                            </svg>
                            <span className="tl-card-action-label">Dismiss</span>
                          </button>
                          <button
                            className="tl-card-action tl-card-action--add"
                            style={{ right: 0 }}
                            onClick={() => handleAdd(item.id)}
                            aria-label={`Add ${item.name} to your plan`}
                            tabIndex={isRevealed ? 0 : -1}
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            <span className="tl-card-action-label">Add</span>
                          </button>
                        </>
                      ) : (
                        <button
                          className="tl-card-action tl-card-action--remove"
                          style={{ right: 0 }}
                          onClick={() => handleRemove(item.id)}
                          aria-label={`Skip ${item.name}`}
                          tabIndex={isRevealed ? 0 : -1}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                            <polygon points="4 5 13 12 4 19 4 5" />
                            <polygon points="13 5 22 12 13 19 13 5" />
                          </svg>
                          <span className="tl-card-action-label">Skip</span>
                        </button>
                      )}
                    </div>
                  )}
                  <div
                    className={`tl-card ${isSuggestion ? "tl-card--suggestion" : ""} ${isVisited ? "tl-card--visited" : ""} ${isBeingDragged ? "tl-card--reorder-dragging" : ""} ${showHint ? "tl-card--hint-swipe" : ""}`}
                    onClick={() => onCardClick(item.id)}
                    onPointerDown={(e) => onCardPointerDown(e, item.id, cardOffset, { isVisited, isReorderable, reorderableIds })}
                    onPointerMove={onCardPointerMove}
                    onPointerUp={onCardPointerUp}
                    onPointerCancel={onCardPointerUp}
                    style={{ transform: cardTransform, transition: cardTransition }}
                  >
                    <div className="tl-card-icon" aria-hidden="true">
                      <span className="material-symbols-rounded">
                        {isVisited ? "check" : (TL_CATEGORY_ICONS[item.category] || "location_on")}
                      </span>
                    </div>
                    <div className="tl-card-text">
                      <span className="tl-card-name">{item.name}</span>
                      <span className="tl-card-cat">{isVisited ? "Visited" : item.category}</span>
                      <CardWarningTags item={item} />
                    </div>
                  </div>
                </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* ── Sticky bottom bar: Back to map (secondary) + Save changes
           (primary) — mirrors PreferencesScreen's footer pattern. ── */}
      <div className={`tl-bottom-bar${isScrollable ? " tl-bottom-bar--scrollable" : ""}`}>
        <button
          type="button"
          className="tl-back-btn"
          onClick={handleClose}
          aria-label="Back to map"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21" />
            <line x1="8" y1="3" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="21" />
          </svg>
          <span>Back to map</span>
        </button>
        <button
          type="button"
          className="tl-save-btn"
          onClick={handleSaveChanges}
          aria-label="Save stops"
        >
          <span>Save stops</span>
        </button>
      </div>
    </div>
  );
}
