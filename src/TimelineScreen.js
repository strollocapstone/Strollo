import React, { useState, useEffect } from "react";
import "./TimelineScreen.css";

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
function CardDetail({ item, onCollapse, onAdd }) {
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
        <p className="tl-detail-desc">{item.description}</p>
      </div>

      {item.type === "suggestion" && (
        <div className="tl-detail-actions">
          <button
            className="tl-btn tl-btn--primary"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
          >
            Add to Timeline
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

export default function TimelineScreen({
  nearbyPlaces = [],
  addedIds,
  setAddedIds,
  userLocation,
  tripStartTime,
  onEndWalk,
  onGoBack,
}) {
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  // Swipe-to-reveal: while dragging, track {id, dx}. On release past the
  // threshold, set revealedId so a '−' button appears to the right of the
  // card; the user then taps '−' to actually remove. Tapping the revealed
  // card (without dragging) closes the reveal.
  const [swipe, setSwipe] = useState({ id: null, dx: 0 });
  const [revealedId, setRevealedId] = useState(null);
  useStopwatch(tripStartTime);

  const SWIPE_THRESHOLD = 50;
  const REVEALED_OFFSET = -72;
  const swipeStartRef = React.useRef({ id: null, startX: 0, moved: false });

  const onCardPointerDown = (e, id, isConfirmed) => {
    if (!isConfirmed) return;
    swipeStartRef.current = { id, startX: e.clientX, moved: false };
    setSwipe({ id, dx: revealedId === id ? REVEALED_OFFSET : 0 });
  };
  const onCardPointerMove = (e) => {
    const s = swipeStartRef.current;
    if (!s.id) return;
    const raw = e.clientX - s.startX;
    const base = revealedId === s.id ? REVEALED_OFFSET : 0;
    const dx = Math.min(0, base + raw);
    if (Math.abs(raw) > 4) s.moved = true;
    setSwipe({ id: s.id, dx });
  };
  const onCardPointerUp = () => {
    const s = swipeStartRef.current;
    if (!s.id) return;
    const id = s.id;
    swipeStartRef.current = { id: null, startX: 0, moved: false };
    setSwipe((cur) => {
      if (cur.id !== id) return cur;
      // Closing a revealed card: user swiped right past threshold
      if (revealedId === id && cur.dx > REVEALED_OFFSET + SWIPE_THRESHOLD) {
        setRevealedId(null);
        return { id: null, dx: 0 };
      }
      // Opening reveal
      if (revealedId !== id && cur.dx <= -SWIPE_THRESHOLD) {
        setRevealedId(id);
        return { id: null, dx: 0 };
      }
      // Snap back to current state
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

  // Split places by added state
  const confirmedPlaces = nearbyPlaces.filter((p) => addedIds?.has(p.id));
  const suggestionPool = nearbyPlaces.filter((p) => !addedIds?.has(p.id));

  // Sort suggestions by distance from user, take top N
  const originPoint = userLocation
    ? { lat: userLocation[0], lng: userLocation[1] }
    : null;
  const rankedSuggestions = [...suggestionPool]
    .map((p) => ({ p, d: estimateWalkMin(originPoint, p) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ p }) => p);

  // Build timeline: confirmed places first, then the top nearest suggestions
  const orderedPlaces = [...confirmedPlaces, ...rankedSuggestions];

  const items = orderedPlaces.map((p, idx) => {
    const prev = idx > 0 ? orderedPlaces[idx - 1] : originPoint;
    const category = p.desc || "Place";
    return {
      id: p.id,
      type: addedIds?.has(p.id) ? "confirmed" : "suggestion",
      name: p.name,
      category,
      time: addedIds?.has(p.id) ? "Planned stop" : "Suggested nearby",
      walkMin: estimateWalkMin(prev, p),
      image: p.image || imageForCategory(category),
      hours: p.hours,
      description: p.description || `A nearby ${category.toLowerCase()} — worth a quick visit.`,
      lat: p.lat,
      lng: p.lng,
    };
  });

  const handleAdd = (id) => {
    setAddedIds?.((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setExpandedId(null);
  };

  const handleRemove = (id) => {
    setAddedIds?.((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setExpandedId(null);
  };

  const visibleItems = showSuggestions
    ? items
    : items.filter((it) => it.type === "confirmed");

  // Build rows.
  // Add buttons + walk-time labels appear only around CONFIRMED cards:
  //   - 0 confirmed  → one add button at the top (no walk label)
  //   - 1 confirmed  → add button before + card + add button after
  //   - 2+ confirmed → add button before, walk+add between pairs, add button after
  // Suggestion cards stack below without add/walk rows between them.
  const confirmedItems = items.filter((it) => it.type === "confirmed");
  const suggestionItems = visibleItems.filter((it) => it.type === "suggestion");

  const rows = [];

  if (confirmedItems.length === 0) {
    rows.push({ kind: "add", showWalk: false, key: "add-start" });
  } else {
    rows.push({ kind: "add", showWalk: false, key: "add-start" });
    confirmedItems.forEach((item, i) => {
      rows.push({ kind: "card", item, isFirst: i === 0, key: `card-${item.id}` });
      if (i < confirmedItems.length - 1) {
        const next = confirmedItems[i + 1];
        rows.push({
          kind: "add",
          showWalk: true,
          walkMin: next.walkMin,
          key: `add-between-${item.id}`,
        });
      }
    });
    rows.push({ kind: "add", showWalk: false, key: "add-end" });
  }

  // Suggestions — plain card rows, no add/walk in between
  suggestionItems.forEach((item) => {
    rows.push({ kind: "card", item, isFirst: false, key: `card-${item.id}` });
  });

  return (
    <div className="tl-screen">
      {/* Top-right X close — matches Preferences screen */}
      {onGoBack && (
        <button className="tl-close" onClick={onGoBack} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      )}

      {/* ── Top bar: title + lightbulb toggle ── */}
      <div className="tl-topbar">
        <span className="tl-suggestions-title">Your current exploration</span>
        <button
          className={`tl-bulb-btn ${showSuggestions ? "" : "tl-bulb-btn--off"}`}
          onClick={() => setShowSuggestions((v) => !v)}
          aria-label={showSuggestions ? "Hide suggestions" : "Show suggestions"}
          aria-pressed={!showSuggestions}
        >
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path
              d="M9 3.5c-2.8 1-4.5 3.6-4.5 6.4 0 1.9.8 3.6 2.2 4.8.6.5.9 1.2.9 2v.8h8.8v-.8c0-.8.3-1.5.9-2 1.4-1.2 2.2-2.9 2.2-4.8 0-4-3.5-7.1-7.6-6.4z"
              fill={showSuggestions ? "#FFD501" : "none"}
              stroke={showSuggestions ? "#B38600" : "#8851D4"}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M9 18h6M10 20.5h4"
              fill="none"
              stroke={showSuggestions ? "#B38600" : "#8851D4"}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          {!showSuggestions && (
            <svg className="tl-bulb-slash" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2.2" strokeLinecap="round">
              <line x1="4" y1="20" x2="20" y2="4" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Timeline ── */}
      <div className="tl-timeline">
        {rows.length === 0 && (
          <div className="tl-empty">
            <p>No suggestions yet.</p>
            <p className="tl-empty-hint">
              Visit the Map tab and ask Strollo for places nearby — they'll show up here.
            </p>
          </div>
        )}

        {/* Single continuous vertical line */}
        {rows.length > 0 && <div className="tl-rail" />}

        {rows.map((row) => {
          if (row.kind === "add") {
            // Users can no longer add stops from the timeline. Keep only the
            // walk-time label between confirmed cards; drop boundary rows.
            if (!row.showWalk) return null;
            return (
              <div className="tl-row tl-row--walk" key={row.key}>
                <div className="tl-rail-cell" />
                <div className="tl-content-cell">
                  <span className="tl-walk-label">
                    {row.walkMin} min walk
                    {row.warning && <WarningIcon />}
                  </span>
                </div>
              </div>
            );
          }

          const { item, isFirst } = row;
          const isSuggestion = item.type === "suggestion";
          const isExpanded = expandedId === item.id;

          return (
            <div className={`tl-row tl-row--card ${isSuggestion ? "tl-row--suggestion" : ""}`} key={row.key}>
              <div className="tl-rail-cell">
                {isSuggestion ? (
                  <button
                    type="button"
                    className="tl-rail-plus"
                    onClick={(e) => { e.stopPropagation(); handleAdd(item.id); }}
                    aria-label={`Add ${item.name} to your exploration`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="tl-rail-flag"
                    onClick={(e) => { e.stopPropagation(); handleRemove(item.id); }}
                    aria-label={`Remove ${item.name} from your exploration`}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <polygon points="10,2 22,7 10,12" fill="currentColor" />
                      <rect x="8" y="2" width="2" height="20" rx="1" fill="currentColor" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="tl-content-cell">
                {isExpanded ? (
                  <CardDetail
                    item={item}
                    onCollapse={() => setExpandedId(null)}
                    onAdd={() => handleAdd(item.id)}
                    onRemove={() => handleRemove(item.id)}
                  />
                ) : (() => {
                  const isDragging = swipe.id === item.id;
                  const isRevealed = revealedId === item.id && !isDragging;
                  const dx = isDragging ? swipe.dx : (isRevealed ? REVEALED_OFFSET : 0);
                  const transition = isDragging ? "none" : "transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)";
                  return (
                <div className={`tl-card-swipe ${isRevealed || isDragging ? "tl-card-swipe--active" : ""}`}>
                  {!isSuggestion && (
                    <button
                      className="tl-card-remove-action"
                      onClick={() => handleRemove(item.id)}
                      aria-label={`Remove ${item.name}`}
                      tabIndex={isRevealed ? 0 : -1}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  )}
                  <div
                    className={`tl-card ${isSuggestion ? "tl-card--suggestion" : ""}`}
                    onClick={() => onCardClick(item.id)}
                    onPointerDown={(e) => onCardPointerDown(e, item.id, !isSuggestion)}
                    onPointerMove={onCardPointerMove}
                    onPointerUp={onCardPointerUp}
                    onPointerCancel={onCardPointerUp}
                    style={{ transform: `translateX(${dx}px)`, transition }}
                  >
                    <div className="tl-card-text">
                      <span className="tl-card-name">{item.name}</span>
                      <span className="tl-card-time">{item.time}</span>
                      {(() => {
                        const tags = warningTagsForItem(item);
                        if (tags.length === 0) return null;
                        return (
                          <div className="tl-card-tags">
                            {tags.map((t) => (
                              <span key={t.id} className="tl-card-tag">
                                {t.icon}
                                <span>{t.label}</span>
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="tl-card-thumb">
                      <img src={item.image} alt={item.name} />
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

      {/* ── Sticky bottom bar: pause + End exploration ── */}
      <div className="tl-bottom-bar">
        <button
          className={`tl-pause-btn ${isPaused ? "tl-pause-btn--paused" : ""}`}
          onClick={() => setIsPaused((p) => !p)}
          aria-label={isPaused ? "Resume exploration" : "Pause exploration"}
        >
          {isPaused ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#8851D4">
              <polygon points="7,5 20,12 7,19" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#8851D4">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          )}
        </button>
        <button className="tl-end-btn" onClick={onEndWalk}>End exploration</button>
      </div>
    </div>
  );
}
