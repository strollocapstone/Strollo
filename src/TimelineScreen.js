import React, { useState, useEffect, useRef } from "react";
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
function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

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
function CardDetail({ item, onCollapse, onAdd, onRemove }) {
  return (
    <div className={`tl-card-detail ${item.type === "suggestion" ? "tl-card-detail--suggestion" : ""}`}>
      {/* Header: place name at the top */}
      <div className="tl-detail-header">
        <h3 className="tl-detail-title">{item.name}</h3>
        <button className="tl-detail-close" onClick={onCollapse} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5A4B64" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Accurate category-based image */}
      <div className="tl-detail-image">
        <img src={item.image} alt={item.name} onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }} />
      </div>

      {/* Body: category subheader + metadata + description */}
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

      <div className="tl-detail-actions">
        <button className="tl-btn tl-btn--outline">See all details</button>
        {item.type === "suggestion"
          ? <button className="tl-btn tl-btn--primary" onClick={onAdd}>Add to Timeline</button>
          : <button className="tl-btn tl-btn--outline" onClick={onRemove}>Remove</button>
        }
      </div>
    </div>
  );
}

// ── Stopwatch hook ────────────────────────────────────────────────────────
function useStopwatch() {
  const startTime = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Date.now() - startTime.current);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const totalSec = Math.floor(elapsed / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ── TimelineScreen ────────────────────────────────────────────────────────
const MAX_SUGGESTIONS = 3;

export default function TimelineScreen({ nearbyPlaces = [], addedIds, setAddedIds, userLocation, onGoBack }) {
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const time = useStopwatch();

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
      {/* ── Top bar: back + suggestions toggle ── */}
      <div className="tl-topbar">
        {onGoBack && (
          <button className="tl-back-btn" onClick={onGoBack} aria-label="Back to map">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E1541" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        <span className="tl-suggestions-title">Suggestions</span>
        <div className="tl-toggle">
          <button
            className={`tl-toggle-btn ${showSuggestions ? "active" : ""}`}
            onClick={() => setShowSuggestions(true)}
          >
            {showSuggestions && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            Show
          </button>
          <button
            className={`tl-toggle-btn ${!showSuggestions ? "active" : ""}`}
            onClick={() => setShowSuggestions(false)}
          >
            Hide
          </button>
        </div>
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
            return (
              <div className="tl-row tl-row--add" key={row.key}>
                <div className="tl-rail-cell">
                  <button className="tl-add-btn" aria-label="Add stop">
                    <PlusIcon />
                  </button>
                </div>
                <div className="tl-content-cell">
                  {row.showWalk && (
                    <span className="tl-walk-label">
                      {row.walkMin} min walk
                      {row.warning && <WarningIcon />}
                    </span>
                  )}
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
                <div className={`tl-dot ${isFirst ? "tl-dot--current" : ""} ${isSuggestion ? "tl-dot--suggestion" : ""}`} />
              </div>
              <div className="tl-content-cell">
                {isExpanded ? (
                  <CardDetail
                    item={item}
                    onCollapse={() => setExpandedId(null)}
                    onAdd={() => handleAdd(item.id)}
                    onRemove={() => handleRemove(item.id)}
                  />
                ) : (
                  <div
                    className={`tl-card ${isSuggestion ? "tl-card--suggestion" : ""}`}
                    onClick={() => setExpandedId(item.id)}
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
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Sticky bottom bar: small stopwatch + End Walk ── */}
      <div className="tl-bottom-bar">
        <div className="tl-bottom-stopwatch">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8851D4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="13" r="8" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="9" y1="2" x2="15" y2="2" />
          </svg>
          <span className="tl-bottom-time">{time}</span>
          <span className="tl-bottom-label">elapsed</span>
        </div>
        <button className="tl-end-btn">End Walk</button>
      </div>
    </div>
  );
}
