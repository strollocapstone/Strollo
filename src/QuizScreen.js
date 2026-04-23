import React, { useState, useRef, useCallback, useEffect } from "react";
import "./QuizScreen.css";

// ── Deck (12 polaroids) ───────────────────────────────────────────────────
// Images are interior shots of each kind of space.
// Interior shots from Unsplash. If any of these don't look like the inside of the
// described space, swap the photo ID for a better match.
const IMG = (id) => `https://images.unsplash.com/photo-${id}?w=520&h=680&fit=crop&q=80`;
const QUIZ_DECK = [
  { id: "p1",  image: IMG("1524995997946-a1c2e315a42f"),  caption: "bookshop with gothic aesthetic",     vibes: ["bookish", "moody", "quiet"] },
  { id: "p2",  image: IMG("1559305289-4c31d1a4d5dd"),     caption: "boba shop with biophilic decor",     vibes: ["leafy", "foodie", "playful"] },
  { id: "p3",  image: IMG("1586023492125-27b2c045efd7"),  caption: "coffeeshop with nook seating",       vibes: ["cozy", "quiet", "bookish"] },
  { id: "p4",  image: IMG("1528605248644-14dd04022da1"),  caption: "leafy courtyard, mismatched chairs", vibes: ["leafy", "boho", "social"] },
  { id: "p5",  image: IMG("1526318896980-cf78c088247c"),  caption: "neon ramen bar",                     vibes: ["foodie", "moody", "social"] },
  { id: "p6",  image: IMG("1526669281048-b7e6f0cdd66e"),  caption: "vintage record store",               vibes: ["retro", "artsy", "indoor"] },
  { id: "p7",  image: IMG("1509600110300-21b9d5fedeb7"),  caption: "quiet rooftop garden",               vibes: ["leafy", "quiet", "bright"] },
  { id: "p8",  image: IMG("1555507036-ab1f4038808a"),     caption: "bakery with copper ovens",           vibes: ["foodie", "cozy", "maker"] },
  { id: "p9",  image: IMG("1544967082-d9d25d867d66"),     caption: "gallery of tiny sculptures",         vibes: ["artsy", "quiet", "maker"] },
  { id: "p10", image: IMG("1514933651103-005eec06c04b"),  caption: "dive bar with a disco ball",         vibes: ["retro", "social", "playful"] },
  { id: "p11", image: IMG("1441986300917-64674bd600d8"),  caption: "botanical greenhouse café",          vibes: ["leafy", "bright", "foodie"] },
  { id: "p12", image: IMG("1565193566173-7a0ee3dbe261"),  caption: "pottery studio you can wander in",   vibes: ["maker", "artsy", "cozy"] },
];

// ── Swipe directions ──────────────────────────────────────────────────────
const LABELS = {
  up:    { text: "YES, please",  weight:  2, pinned: true  },
  right: { text: "Could go",     weight:  1, pinned: true  },
  left:  { text: "Meh",          weight: -1, pinned: false },
  down:  { text: "Hard pass",    weight: -2, pinned: false },
};

const THRESHOLD_PX = 80;
const VELOCITY_MIN = 0.6;

function classifyDrag(dx, dy, vx, vy) {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const overThreshold = absX > THRESHOLD_PX || absY > THRESHOLD_PX;
  const fastEnough = Math.abs(vx) > VELOCITY_MIN || Math.abs(vy) > VELOCITY_MIN;
  if (!overThreshold && !fastEnough) return null;
  if (absX > absY) return dx > 0 ? "right" : "left";
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
export default function QuizScreen({ initialPreferences, onComplete, onClose }) {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState([]); // [{ polaroidId, direction }]
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exitDir, setExitDir] = useState(null);
  const [peekDir, setPeekDir] = useState(null);

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
    const { x, y } = drag;
    if (Math.abs(x) < 20 && Math.abs(y) < 20) { setPeekDir(null); return; }
    setPeekDir(Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : (y > 0 ? "down" : "up"));
  }, [drag]);

  useEffect(() => {
    if (!done || !onComplete) return;
    const vibeScores = {};
    for (const h of history) {
      const card = QUIZ_DECK.find(d => d.id === h.polaroidId);
      if (!card) continue;
      const w = LABELS[h.direction].weight;
      for (const v of card.vibes) vibeScores[v] = (vibeScores[v] || 0) + w;
    }
    onComplete({
      vibeScores,
      quizHistory: history,
      completedAt: new Date().toISOString(),
    });
  }, [done, history, onComplete]);

  const commitSwipe = useCallback((direction) => {
    if (!current || animatingRef.current) return;
    animatingRef.current = true;
    setExitDir(direction);

    const exitMs = prefersReducedMotion() ? 160 : 380;
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
      const travel = 800;
      const map = { up: [0, -travel], down: [0, travel], left: [-travel, 0], right: [travel, 0] };
      const [tx, ty] = map[exitDir];
      const rot = exitDir === "left" ? -15 : exitDir === "right" ? 15 : 0;
      return {
        transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg)`,
        transition: "transform 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 380ms ease-out",
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
      <div className="quiz-screen quiz-done">
        <div className="quiz-done-inner">
          <h1>All set!</h1>
          <p>We've got a feel for your vibe.</p>
        </div>
      </div>
    );
  }

  const progressLabel = `${index + 1}/${total}`;

  return (
    <div className="quiz-screen">
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

      {/* Title + subtitle */}
      <div className="quiz-header">
        <h1 className="quiz-title">Would you go here?</h1>
        <p className="quiz-subtitle">
          <span>Swipe</span>
          <span className="quiz-subtitle-arrows">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </span>
          <span>to sort</span>
        </p>
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

      {/* Direction labels around the polaroid */}
      <div className="quiz-dir quiz-dir--top">YES, please</div>
      <div className="quiz-dir quiz-dir--right">Could go</div>
      <div className="quiz-dir quiz-dir--left">Meh</div>
      <div className="quiz-dir quiz-dir--bottom">Hard pass</div>

      {/* Polaroid stack */}
      <div className="quiz-stack">
        {nextNext && (
          <div className="quiz-card quiz-card--under2" aria-hidden>
            <div className="quiz-card-photo" style={nextNext.image ? { backgroundImage: `url(${nextNext.image})` } : undefined} />
            <div className="quiz-card-caption"><span className="quiz-card-index">{index + 3}/{total}</span> {nextNext.caption}</div>
          </div>
        )}
        {next && (
          <div className="quiz-card quiz-card--under1" aria-hidden>
            <div className="quiz-card-photo" style={next.image ? { backgroundImage: `url(${next.image})` } : undefined} />
            <div className="quiz-card-caption"><span className="quiz-card-index">{index + 2}/{total}</span> {next.caption}</div>
          </div>
        )}
        {current && (
          <div
            ref={cardRef}
            className={`quiz-card quiz-card--active ${exitDir ? `quiz-card--exit-${exitDir}` : ""}`}
            style={cardStyle}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="quiz-card-photo" style={current.image ? { backgroundImage: `url(${current.image})` } : undefined} />
            <div className="quiz-card-caption">
              <span className="quiz-card-index">{progressLabel}</span> {current.caption}
            </div>
            {(() => {
              const dir = exitDir || peekDir;
              if (dir !== "left" && dir !== "down") return null;
              return (
                <svg className={`quiz-scribble quiz-scribble--${dir}`} viewBox="0 0 220 320" preserveAspectRatio="none">
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
              );
            })()}
            {/* Peek stamps only for positive swipes — left/down use the scribble scratch-out instead. */}
            {peekDir && (peekDir === "up" || peekDir === "right") && (
              <div className={`quiz-stamp quiz-stamp--${peekDir}`}>{LABELS[peekDir].text}</div>
            )}
          </div>
        )}
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
      </div>
    </div>
  );
}
