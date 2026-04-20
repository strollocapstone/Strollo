import React, { useState, useEffect, useRef } from "react";
import "./TimelineScreen.css";

// Fallback image when the place doesn't have one
const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=400&h=300&fit=crop";

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

function SuggestionBadge() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF9900">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 5h2v2h-2V7zm-1 4h4v6h-4v-6z" opacity="0.9" />
    </svg>
  );
}

// ── Expanded card detail ──────────────────────────────────────────────────
function CardDetail({ item, onCollapse, onAdd, onRemove }) {
  return (
    <div className={`tl-card-detail ${item.type === "suggestion" ? "tl-card-detail--suggestion" : ""}`}>
      <div className="tl-detail-header">
        <span className="tl-detail-category">{item.category}</span>
        <button className="tl-detail-close" onClick={onCollapse} aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5A4B64" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="tl-detail-image">
        <img src={item.image} alt={item.name} onError={(e) => { e.currentTarget.src = FALLBACK_IMAGE; }} />
      </div>
      <h3 className="tl-detail-title">{item.name}</h3>
      <span className="tl-detail-walk">{item.walkMin ? `${item.walkMin} minute walk` : item.time}</span>
      <p className="tl-detail-desc">{item.description}</p>
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
    return {
      id: p.id,
      type: addedIds?.has(p.id) ? "confirmed" : "suggestion",
      name: p.name,
      category: p.desc || "Place",
      time: addedIds?.has(p.id) ? "Planned stop" : "Suggested nearby",
      walkMin: estimateWalkMin(prev, p),
      image: p.image || FALLBACK_IMAGE,
      description: p.description || `${p.desc || "A nearby spot"} — worth a quick visit.`,
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

  // Build flat list of rows: each item gets an optional "add-row" before it, then the card row
  const rows = [];
  visibleItems.forEach((item, idx) => {
    const isFirst = idx === 0;
    const isSuggestion = item.type === "suggestion";

    // Walk-time + plus row before confirmed cards (except the first)
    if (!isFirst && !isSuggestion) {
      rows.push({ kind: "add", walkMin: item.walkMin, key: `add-${item.id}` });
    }

    rows.push({ kind: "card", item, isFirst, key: `card-${item.id}` });

    // Walk-time + plus row after suggestion cards
    if (isSuggestion) {
      const nextItem = visibleItems[idx + 1];
      if (nextItem) {
        rows.push({
          kind: "add",
          walkMin: item.walkMin,
          warning: nextItem.warning,
          key: `add-after-${item.id}`,
        });
      }
    }
  });

  return (
    <div className="tl-screen">
      {/* ── Header ── */}
      <div className="tl-header">
        {onGoBack && (
          <button className="tl-back-btn" onClick={onGoBack} aria-label="Back to map">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E1541" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
        )}
        <div className="tl-elapsed-time">{time}</div>
        <div className="tl-elapsed-label">Elapsed exploration time</div>
        <div className="tl-header-divider" />
      </div>

      {/* ── Suggestions toggle ── */}
      <div className="tl-suggestions-row">
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
                      <span className="tl-card-name">
                        {item.name}
                        {isSuggestion && <SuggestionBadge />}
                      </span>
                      <span className="tl-card-time">{item.time}</span>
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

      {/* ── End walk ── */}
      <div className="tl-footer">
        <button className="tl-end-btn">End Walk</button>
      </div>
    </div>
  );
}
