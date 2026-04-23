import React, { useState, useEffect, useRef } from "react";
import "./TimelineScreen.css";

// ── Demo data ─────────────────────────────────────────────────────────────
const TIMELINE_ITEMS = [
  {
    id: 1,
    type: "confirmed",
    name: "Cashew Creamery",
    category: "Ice Cream Shop",
    time: "2:37 PM arrived",
    walkMin: 7,
    image: "https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=300&h=300&fit=crop",
    description: "A beloved local creamery known for its unique cashew-based flavors and cozy atmosphere.",
  },
  {
    id: 2,
    type: "confirmed",
    name: "Tay Tah Caf\u00e9",
    category: "Caf\u00e9",
    time: "2:52 PM estimated arrival",
    walkMin: 10,
    image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=300&h=300&fit=crop",
    description: "Charming neighborhood caf\u00e9 with house-made pastries and specialty lattes.",
  },
  {
    id: 3,
    type: "suggestion",
    name: "Five Little Monkeys",
    category: "Toy Store",
    time: "Adds 5 minutes walk time",
    walkMin: null,
    image: "https://images.unsplash.com/photo-1558060318-2e0f737f1463?w=300&h=300&fit=crop",
    description: "A whimsical independent toy store tucked away on a quiet side street. Great for a quick browse.",
    warning: true,
  },
  {
    id: 4,
    type: "confirmed",
    name: "Flowerland Nursery",
    category: "Garden & Nursery",
    time: "Planned for 4 PM",
    walkMin: 6,
    image: "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=300&h=300&fit=crop",
    description: "A sprawling urban nursery with rare plants, succulents, and a peaceful garden path to wander.",
  },
];

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
function CardDetail({ item, onCollapse, onAdd }) {
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
        <img src={item.image} alt={item.name} />
      </div>
      <h3 className="tl-detail-title">{item.name}</h3>
      <span className="tl-detail-walk">{item.walkMin ? `${item.walkMin} minute walk` : item.time}</span>
      <p className="tl-detail-desc">{item.description}</p>
      <div className="tl-detail-actions">
        <button className="tl-btn tl-btn--outline">See all details</button>
        {item.type === "suggestion"
          ? <button className="tl-btn tl-btn--primary" onClick={onAdd}>Add to journey</button>
          : <button className="tl-btn tl-btn--primary">Go now</button>
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
export default function TimelineScreen({ onBack, onEndWalk, onPauseWalk }) {
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [items, setItems] = useState(TIMELINE_ITEMS);
  const [isPaused, setIsPaused] = useState(false);
  const time = useStopwatch();

  const handleTogglePause = () => {
    setIsPaused((prev) => {
      const next = !prev;
      if (onPauseWalk) onPauseWalk(next);
      return next;
    });
  };

  const handleAdd = (id) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, type: "confirmed" } : it))
    );
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
        {onBack && (
          <button className="tl-back-btn" onClick={onBack} aria-label="Back">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
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
        {/* Single continuous vertical line */}
        <div className="tl-rail" />

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

      {/* ── Pause + End exploration ── */}
      <div className="tl-footer">
        <button
          className={`tl-pause-btn${isPaused ? " tl-pause-btn--paused" : ""}`}
          onClick={handleTogglePause}
          aria-label={isPaused ? "Resume exploring" : "Pause exploring"}
        >
          {isPaused ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
            </svg>
          )}
          <span>{isPaused ? "Resume" : "Pause"}</span>
        </button>
        <button className="tl-end-btn" onClick={onEndWalk}>End exploration</button>
      </div>
    </div>
  );
}
