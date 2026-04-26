import React, { useState, useRef, useCallback, useEffect } from "react";
import "./QuizScreen.css";

// ── Deck (6 lifestyle bundles) ────────────────────────────────────────────
// Each polaroid is a complete lifestyle preset: caption sells the vibe,
// preset fields seed PreferencesScreen when the card is liked. Fields use
// the exact option values from src/PreferencesScreen.js (DESTINATION_OPTIONS,
// DURATION_OPTIONS, ACCESSIBILITY_OPTIONS, AVOIDANCE_OPTIONS, MAP_FILTERS ids).
// antiAvoidances apply when the card is hard-passed.
// Six cards cover every preference dimension at least once between them.
const QUIZ_DECK = [
  { id: "p1",  image: "https://mycahvauae.com/cdn/shop/articles/aromatic-coffee-cup-rustic-table-refreshing-caffeine-boost-generated-by-artificial-intelligence.webp?v=1737708271&width=2200",
    caption: "slow latte, short loop, back before noon",
    vibes: ["cozy", "quiet", "foodie"],
    preset: { destination: "loop", duration: "30 min", distance: 1.0,
              avoidances: ["Hilly terrain", "Busy roads"],
              mapFilters: ["cafes", "ai-highlights", "saved-places"] } },
  { id: "p2",  image: "https://fastly.picsum.photos/id/190/2048/1365.jpg?hmac=NWS1_X_JJ-Edi-9SZRhNwHyjKt1nECckxrGLS8_idjY",
    caption: "leafy paths, benches, no time limit",
    vibes: ["leafy", "quiet", "cozy", "bright"],
    preset: { destination: "open", duration: "120 min", distance: 3.0,
              accessibility: ["Wheelchair"],
              avoidances: ["Big crowds", "Construction"],
              mapFilters: ["parks", "benches", "ai-highlights", "saved-places"] } },
  { id: "p3",  image: "https://ca-times.brightspotcdn.com/dims4/default/3effaf1/2147483647/strip/true/crop/4999x2624+1+535/resize/1200x630!/quality/75/?url=https%3A%2F%2Fcalifornia-times-brightspot.s3.amazonaws.com%2Fd7%2Fac%2F36d9ec5b4d559a8fbc7e710a9cab%2F1-exclusive.jpg",
    caption: "museums, landmarks, postcard stops",
    vibes: ["artsy", "bookish", "bright", "social"],
    preset: { destination: "specific", duration: "120 min", distance: 2.5,
              mapFilters: ["museums", "attractions", "ai-highlights", "saved-places"],
              antiAvoidances: ["Touristy spots"] } },
  { id: "p4",  image: "https://media.istockphoto.com/id/1399630042/photo/personal-perspective-shot-of-a-womans-hand-holding-a-bao-bun-with-tofu-at-a-street-market.jpg?s=612x612&w=0&k=20&c=Gf6nwc3z-Sxthx5tlnJqDNeXhSi7J4rghMtcM49UsvQ=",
    caption: "street food, neon, one more block",
    vibes: ["foodie", "social", "moody", "retro"],
    preset: { destination: "specific", duration: "60 min", distance: 1.5,
              avoidances: ["Busy roads"],
              mapFilters: ["food", "attractions", "ai-highlights", "saved-places"],
              antiAvoidances: ["Bars & nightlife"] } },
  { id: "p5",  image: "https://thumbs.dreamstime.com/b/picnic-blanket-grass-park-picnic-blanket-basket-grass-park-158134356.jpg",
    caption: "picnics, playgrounds, naptime at noon",
    vibes: ["playful", "leafy", "bright"],
    preset: { destination: "loop", duration: "60 min", distance: 0.8,
              accessibility: ["Stroller"],
              avoidances: ["Hilly terrain", "Construction"],
              mapFilters: ["parks", "dog-friendly", "ai-highlights", "saved-places"] } },
  { id: "p6",  image: "https://malt.org/wp-content/uploads/2024/03/wildflower_hikes_san_francisco_MALT.jpg",
    caption: "wildflower trails, long views, no crowds",
    vibes: ["leafy", "moody", "boho", "bright"],
    preset: { destination: "open", duration: "No time limit", distance: 4.0,
              avoidances: ["Touristy spots", "Big crowds", "Places I've already explored"],
              mapFilters: ["parks", "sights", "attractions", "ai-highlights", "saved-places"] } },
];

// ── Preset aggregation ────────────────────────────────────────────────────
const DURATION_ORDER = ["15 min", "30 min", "60 min", "120 min", "No time limit"];

function buildMergedPreset(history, deck) {
  const liked = [], hated = [];
  for (const h of history) {
    const card = deck.find(d => d.id === h.polaroidId);
    if (!card?.preset) continue;
    const w = LABELS[h.direction].weight;
    if (w >= 1) liked.push(card);
    else if (w <= -1) hated.push(card);
  }
  if (liked.length === 0 && hated.length === 0) return null;

  const destCounts = {};
  for (const c of liked) if (c.preset.destination) destCounts[c.preset.destination] = (destCounts[c.preset.destination] || 0) + 1;
  const destination = Object.keys(destCounts).sort((a, b) => destCounts[b] - destCounts[a])[0] || null;

  const durIdxs = liked
    .map(c => DURATION_ORDER.indexOf(c.preset.duration))
    .filter(i => i >= 0)
    .sort((a, b) => a - b);
  const duration = durIdxs.length ? DURATION_ORDER[durIdxs[Math.floor(durIdxs.length / 2)]] : null;

  const customDuration = liked.find(c => c.preset.customDuration)?.preset.customDuration || null;

  const dists = liked.map(c => c.preset.distance).filter(v => typeof v === "number");
  const distance = dists.length ? Math.round((dists.reduce((a, b) => a + b, 0) / dists.length) * 2) / 2 : null;

  const accessibility = [...new Set(liked.flatMap(c => c.preset.accessibility || []))];

  const avoidSet = new Set();
  for (const c of liked) for (const a of (c.preset.avoidances || [])) avoidSet.add(a);
  for (const c of hated) for (const a of (c.preset.antiAvoidances || [])) avoidSet.add(a);
  const avoidances = [...avoidSet];

  const mapFiltersArr = [...new Set(liked.flatMap(c => c.preset.mapFilters || []))];

  return {
    destination,
    destChosen: null,
    duration: customDuration ? null : duration,
    customDuration,
    distance,
    accessibility,
    avoidances,
    mapFilters: mapFiltersArr.length ? mapFiltersArr : null,
  };
}

// ── Swipe directions (binary: up = yes, down = no) ───────────────────────
const LABELS = {
  up:   { text: "YES, please", weight:  1, pinned: true  },
  down: { text: "NO, thanks",  weight: -1, pinned: false },
};

// Low threshold — any meaningful vertical intent commits.
const THRESHOLD_PX = 10;
const VELOCITY_MIN = 0.3;

function classifyDrag(dx, dy, vx, vy) {
  const absY = Math.abs(dy);
  const overThreshold = absY > THRESHOLD_PX;
  const fastEnough = Math.abs(vy) > VELOCITY_MIN;
  if (!overThreshold && !fastEnough) return null;
  return dy > 0 ? "down" : "up";
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Mini polaroid for the clothesline ─────────────────────────────────────
function MiniPolaroid({ item, angle, delay }) {
  return (
    <div className="quiz-mini-wrap" style={{ animationDelay: `${delay}ms` }}>
      <svg className="quiz-pin" width="14" height="14" viewBox="0 0 24 24" fill="none">
        <rect x="6" y="2" width="12" height="8" rx="2" fill="#C4A373" />
        <rect x="10" y="8" width="4" height="14" fill="#C4A373" />
        <circle cx="9" cy="6" r="1.2" fill="#1E1541" opacity="0.5" />
      </svg>
      <div
        className="quiz-mini"
        style={{
          transform: `rotate(${angle}deg)`,
          backgroundImage: item.image ? `url(${item.image})` : undefined,
        }}
      />
    </div>
  );
}

// ── Quiz Screen ───────────────────────────────────────────────────────────
export default function QuizScreen({ initialPreferences, onComplete, onClose, onSkip }) {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState([]); // [{ polaroidId, direction }]
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exitDir, setExitDir] = useState(null);
  const [peekDir, setPeekDir] = useState(null);
  const [closing, setClosing] = useState(false);
  // "drag" uses CSS transition (card has momentum from the finger); "button"
  // uses a keyframes animation with a subtle wind-up so the tap doesn't feel teleport-y.
  const exitSourceRef = useRef("drag");

  const startPos = useRef({ x: 0, y: 0, t: 0 });
  const lastPos = useRef({ x: 0, y: 0, t: 0 });
  const cardRef = useRef(null);
  const animatingRef = useRef(false);
  const lineItemsRef = useRef(null);
  const lineDragRef = useRef({ active: false, startX: 0, scrollLeft: 0 });

  const handleLineDown = (e) => {
    const el = lineItemsRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    lineDragRef.current = {
      active: true,
      startX: e.pageX - el.offsetLeft,
      scrollLeft: el.scrollLeft,
    };
    el.classList.add("quiz-line-items--dragging");
  };
  const handleLineMove = (e) => {
    if (!lineDragRef.current.active) return;
    const el = lineItemsRef.current;
    if (!el) return;
    e.preventDefault();
    const walk = (e.pageX - el.offsetLeft) - lineDragRef.current.startX;
    el.scrollLeft = lineDragRef.current.scrollLeft - walk;
  };
  const handleLineUp = () => {
    if (!lineDragRef.current.active) return;
    lineDragRef.current.active = false;
    lineItemsRef.current?.classList.remove("quiz-line-items--dragging");
  };

  const total = QUIZ_DECK.length;
  const current = QUIZ_DECK[index] || null;
  const next = QUIZ_DECK[index + 1] || null;
  const nextNext = QUIZ_DECK[index + 2] || null;
  const done = index >= total;

  useEffect(() => {
    if (!drag.active) { setPeekDir(null); return; }
    if (Math.abs(drag.y) < 6) { setPeekDir(null); return; }
    setPeekDir(drag.y > 0 ? "down" : "up");
  }, [drag]);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const completionScheduledRef = useRef(false);
  useEffect(() => {
    if (!done || completionScheduledRef.current) return;
    completionScheduledRef.current = true;
    setClosing(true);
    const vibeScores = {};
    for (const h of history) {
      const card = QUIZ_DECK.find(d => d.id === h.polaroidId);
      if (!card) continue;
      const w = LABELS[h.direction].weight;
      for (const v of card.vibes) vibeScores[v] = (vibeScores[v] || 0) + w;
    }
    const payload = {
      vibeScores,
      mergedPreset: buildMergedPreset(history, QUIZ_DECK),
      quizHistory: history,
      completedAt: new Date().toISOString(),
    };
    // Linger on the "all set" screen long enough for the user to read the
    // headline + summary chips before the home page takes over.
    const t = setTimeout(() => {
      onCompleteRef.current?.(payload);
    }, 2800);
    return () => clearTimeout(t);
  }, [done, history]);

  const commitSwipe = useCallback((direction, source = "drag") => {
    if (!current || animatingRef.current) return;
    animatingRef.current = true;
    exitSourceRef.current = source;
    setExitDir(direction);

    const exitMs = prefersReducedMotion() ? 200 : (exitSourceRef.current === "button" ? 720 : 640);
    setTimeout(() => {
      setHistory(h => [...h, { polaroidId: current.id, direction }]);
      setIndex(i => i + 1);
      setExitDir(null);
      setDrag({ x: 0, y: 0, active: false });
      animatingRef.current = false;
    }, exitMs);
  }, [current]);

  const onPointerDown = (e) => {
    if (!current || animatingRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const t = performance.now();
    startPos.current = { x: e.clientX, y: e.clientY, t };
    lastPos.current = { x: e.clientX, y: e.clientY, t };
    setDrag({ x: 0, y: 0, active: true });
  };

  const onPointerMove = (e) => {
    if (!drag.active) return;
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    setDrag({ x: dx, y: dy, active: true });
  };

  const onPointerUp = (e) => {
    if (!drag.active) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const dx = drag.x;
    const dy = drag.y;
    const dt = Math.max(1, lastPos.current.t - startPos.current.t);
    const vx = dx / dt;
    const vy = dy / dt;
    const direction = classifyDrag(dx, dy, vx, vy);
    if (direction) {
      commitSwipe(direction);
    } else {
      setDrag({ x: 0, y: 0, active: false });
    }
  };

  const handleUndo = useCallback(() => {
    if (history.length === 0 || animatingRef.current) return;
    setHistory(h => h.slice(0, -1));
    setIndex(i => Math.max(0, i - 1));
    setExitDir(null);
    setDrag({ x: 0, y: 0, active: false });
  }, [history.length]);

  // Only up/right swipes are pinned to the clothesline.
  const pinnedItems = history
    .filter(h => LABELS[h.direction].pinned)
    .map((h, i) => {
      const card = QUIZ_DECK.find(d => d.id === h.polaroidId);
      return { ...card, angle: (i * 37) % 16 - 8, delay: i * 40 };
    });

  // Active-card transform
  const cardStyle = (() => {
    if (exitDir) {
      // Button-triggered exits use a CSS keyframe animation with a small wind-up
      // so the tap feels intentional instead of an instant teleport.
      if (exitSourceRef.current === "button") {
        return {
          animation: `quiz-exit-${exitDir} 720ms cubic-bezier(0.5, 0.05, 0.3, 1) forwards`,
        };
      }
      const travel = 800;
      const ty = exitDir === "up" ? -travel : travel;
      return {
        transform: `translate(0, ${ty}px) rotate(0deg)`,
        transition: "transform 640ms cubic-bezier(0.22, 1, 0.36, 1), opacity 520ms ease-out 80ms",
        opacity: 0,
      };
    }
    if (drag.active) {
      const rot = drag.x / 20;
      return {
        transform: `translate(${drag.x}px, ${drag.y}px) rotate(${rot}deg)`,
        transition: "none",
      };
    }
    return {
      transform: "translate(0, 0) rotate(0deg)",
      transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
    };
  })();

  if (done) {
    return (
      <div className={`quiz-screen quiz-done${closing ? " quiz-screen--closing" : ""}`}>
        <div className="quiz-blobs">
          <div className="quiz-blob quiz-blob--1" />
          <div className="quiz-blob quiz-blob--2" />
          <div className="quiz-blob quiz-blob--3" />
        </div>
        <div className={`quiz-done-inner${closing ? " quiz-done-inner--fading" : ""}`}>
          <h1>All set!</h1>
          <p>We've got a feel for your vibe.</p>
          <p className="quiz-done-hint">You can always tweak these later in the settings button.</p>
        </div>
      </div>
    );
  }

  // Slide-down + fade before letting App.js swap to Home so the user feels
  // the screen leaving instead of vanishing.
  const handleSkip = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onSkip?.(), 380);
  };

  return (
    <div className={`quiz-screen${closing ? " quiz-screen--closing" : ""}`}>
      <div className={`quiz-blobs${closing ? " quiz-blobs--genie" : ""}`}>
        <div className="quiz-blob quiz-blob--1" />
        <div className="quiz-blob quiz-blob--2" />
        <div className="quiz-blob quiz-blob--3" />
      </div>
      {/* Close */}
      <div className="quiz-topbar">
        <div style={{ flex: 1 }} />
        {onClose && (
          <button className="quiz-close" onClick={onClose} aria-label="Close quiz">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        )}
      </div>

      {/* Title */}
      <div className="quiz-header">
        <h1 className="quiz-title">Would you go here?</h1>
      </div>

      {/* Clothesline (only kept/liked polaroids) */}
      <div className="quiz-line-wrap">
        <svg className="quiz-line" viewBox="0 0 320 40" preserveAspectRatio="none">
          <path d="M 4 6 Q 160 44 316 6" stroke="#3E2A10" strokeWidth="1.3" fill="none" opacity="0.55" />
        </svg>
        {/* Decorative pins — show regardless of pinned items */}
        <div className="quiz-line-decor">
          {[
            { left: "8%",  top: 6,  rot: -10 },
            { left: "22%", top: 12, rot: 6 },
            { left: "38%", top: 18, rot: -4 },
            { left: "54%", top: 20, rot: 8 },
            { left: "70%", top: 14, rot: -6 },
            { left: "86%", top: 8,  rot: 10 },
          ].map((p, i) => (
            <svg key={i} className="quiz-line-decor-pin" width="12" height="12" viewBox="0 0 24 24" fill="none"
              style={{ left: p.left, top: p.top, transform: `translateX(-50%) rotate(${p.rot}deg)` }}>
              <rect x="6" y="2" width="12" height="8" rx="2" fill="#C4A373" />
              <rect x="10" y="8" width="4" height="14" fill="#C4A373" />
              <circle cx="9" cy="6" r="1.2" fill="#1E1541" opacity="0.5" />
            </svg>
          ))}
        </div>
        <div
          className="quiz-line-items"
          ref={lineItemsRef}
          onMouseDown={handleLineDown}
          onMouseMove={handleLineMove}
          onMouseUp={handleLineUp}
          onMouseLeave={handleLineUp}
        >
          {pinnedItems.map((it, i) => (
            <MiniPolaroid key={`${it.id}-${i}`} item={it} angle={it.angle} delay={it.delay} />
          ))}
        </div>
      </div>

      {/* Direction labels around the polaroid — arrows hint at the swipe direction.
          Also clickable: tap commits the same swipe action for users who don't want to drag. */}
      <button type="button" className="quiz-dir quiz-dir--top" onClick={() => commitSwipe("up", "button")} aria-label="YES, please">
        <svg className="quiz-dir-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
        </svg>
        <span>YES, please</span>
      </button>
      <button type="button" className="quiz-dir quiz-dir--bottom" onClick={() => commitSwipe("down", "button")} aria-label="NO, thanks">
        <svg className="quiz-dir-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
        </svg>
        <span>NO, thanks</span>
      </button>

      {/* Polaroid stack — rendered as a keyed list so the same DOM element
          carries a card through under2 → under1 → active. When the active card
          leaves, React keeps card(n+1)'s element mounted and only swaps its
          layer class, which lets CSS transitions handle the "float up". */}
      <div className="quiz-stack">
        {(() => {
          const layers = [];
          if (nextNext) layers.push({ card: nextNext, cls: "under2", label: index + 3 });
          if (next)     layers.push({ card: next,     cls: "under1", label: index + 2 });
          if (current)  layers.push({ card: current,  cls: "active", label: index + 1 });
          return layers.map(({ card, cls, label }) => {
            const isActive = cls === "active";
            const scribbleDir = isActive ? (exitDir || peekDir) : null;
            return (
              <div
                key={card.id}
                ref={isActive ? cardRef : null}
                className={`quiz-card quiz-card--${cls}${isActive && exitDir ? ` quiz-card--exit-${exitDir}` : ""}`}
                style={isActive ? cardStyle : undefined}
                aria-hidden={!isActive}
                onPointerDown={isActive ? onPointerDown : undefined}
                onPointerMove={isActive ? onPointerMove : undefined}
                onPointerUp={isActive ? onPointerUp : undefined}
                onPointerCancel={isActive ? onPointerUp : undefined}
              >
                <div className="quiz-card-photo" style={card.image ? { backgroundImage: `url(${card.image})` } : undefined} />
                <div className="quiz-card-caption">
                  <span className="quiz-card-index">{label}/{total}</span> {card.caption}
                </div>
                {isActive && scribbleDir === "down" && (
                  <svg className={`quiz-scribble quiz-scribble--${scribbleDir}`} viewBox="0 0 220 320" preserveAspectRatio="none">
                    <path
                      className="quiz-scribble-line quiz-scribble-line--1"
                      pathLength="1"
                      d="M 22 28 Q 72 8, 118 42 T 200 30 L 210 72 Q 150 96, 88 72 T 18 104 Q 82 126, 160 108 L 212 148 Q 152 176, 74 152 T 20 192 Q 92 216, 178 196 L 210 236 Q 136 268, 64 246 T 16 292 Q 86 312, 172 290"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      className="quiz-scribble-line quiz-scribble-line--2"
                      pathLength="1"
                      d="M 206 22 Q 138 56, 70 24 T 14 58 Q 70 88, 150 66 L 210 100 Q 152 138, 82 112 T 22 148 L 18 182 Q 104 168, 186 184 T 208 218 Q 136 246, 60 230 L 20 268 Q 94 282, 180 268"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      className="quiz-scribble-line quiz-scribble-line--3"
                      pathLength="1"
                      d="M 40 60 Q 110 34, 180 80 Q 120 110, 54 92 L 90 140 Q 160 128, 200 166 Q 130 196, 60 178 L 100 220 Q 170 208, 196 244 Q 130 276, 56 258"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* Footer */}
      <div className="quiz-footer">
        {history.length > 0 && (
          <button className="fab-circle quiz-undo-btn" onClick={handleUndo} aria-label="Undo last swipe">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E1541" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 14L4 9l5-5" />
              <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
            </svg>
          </button>
        )}
        {onSkip && (
          <button type="button" className="quiz-skip" onClick={handleSkip}>
            Skip for now
          </button>
        )}
      </div>
    </div>
  );
}
