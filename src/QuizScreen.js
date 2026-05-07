// FEATURE: quiz
// LAST UPDATED BY: Eric Tsai
// UPDATE DATE: 2026-04-28
// BUILD: f718df0
// DEPENDS ON: leaf (exports QUIZ_DECK + buildMergedPreset for App.js dev-mode)
// CONSUMED BY: ./App.js
//
// Vibe-preference Polaroid swipe quiz. Each card has a set of vibes; swiping
// up = "yes" tallies the vibes; swiping down = "no". On completion, App.js
// reads the resulting `vibeScores` + `mergedPreset` and uses them as the seed
// for HomeScreen's preferences and any later AI prompts.

import React, { useState, useRef, useCallback, useEffect } from "react";
import "./QuizScreen.css";

// ── Deck (6 lifestyle bundles) ────────────────────────────────────────────
// Each polaroid is a complete lifestyle preset: caption sells the vibe,
// preset fields seed PreferencesScreen when the card is liked. Fields use
// the exact option values from src/PreferencesScreen.js (DESTINATION_OPTIONS,
// DURATION_OPTIONS, ACCESSIBILITY_OPTIONS, AVOIDANCE_OPTIONS, MAP_FILTERS ids).
// antiAvoidances apply when the card is hard-passed.
// Six cards cover every preference dimension at least once between them.
export const QUIZ_DECK = [
  { id: "p1",  image: "https://images.unsplash.com/photo-1759430711861-fc858ebce8b2?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    caption: "Late night food spots open past midnight",
    vibes: ["foodie", "moody", "social", "retro"],
    preset: { destination: "specific", duration: "60 min", distance: 1.5,
              mapFilters: ["food", "attractions", "ai-highlights", "saved-places"] } },
  { id: "p2",  image: "https://images.unsplash.com/photo-1718182147550-5d6f9208432d?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    caption: "Packed bars with live music",
    vibes: ["social", "moody", "playful", "music"],
    preset: { destination: "specific", duration: "120 min", distance: 1.5,
              mapFilters: ["attractions", "ai-highlights", "saved-places"],
              antiAvoidances: ["Bars & nightlife"] } },
  { id: "p3",  image: "https://images.unsplash.com/photo-1573822028151-731623cb0722?q=80&w=2672&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    caption: "Cozy coffee shops where you can work with a laptop",
    vibes: ["cozy", "quiet", "bookish", "foodie"],
    preset: { destination: "loop", duration: "60 min", distance: 1.0,
              avoidances: ["Big crowds", "Busy roads"],
              mapFilters: ["cafes", "ai-highlights", "saved-places"] } },
  { id: "p4",  image: "https://images.unsplash.com/photo-1615621734603-04c156e22380?q=80&w=2670&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    caption: "Record shops you could browse for hours",
    vibes: ["music", "cozy", "retro", "quiet"],
    preset: { destination: "open", duration: "60 min", distance: 1.2,
              avoidances: ["Big crowds"],
              mapFilters: ["sights", "attractions", "ai-highlights", "saved-places"] } },
  { id: "p5",  image: "https://images.unsplash.com/photo-1592753054398-9fa298d40e85?q=80&w=2518&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    caption: "Shady parks good for a picnic",
    vibes: ["leafy", "quiet", "cozy", "bright"],
    preset: { destination: "loop", duration: "120 min", distance: 1.5,
              avoidances: ["Busy roads", "Construction"],
              mapFilters: ["parks", "benches", "ai-highlights", "saved-places"] } },
  { id: "p6",  image: "https://images.unsplash.com/photo-1595445900031-f460e2d77d8d?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    caption: "Popup events and street fairs on weekends",
    vibes: ["social", "playful", "bright", "boho"],
    preset: { destination: "open", duration: "120 min", distance: 2.0,
              mapFilters: ["attractions", "food", "ai-highlights", "saved-places"],
              antiAvoidances: ["Big crowds"] } },
  { id: "p7",  image: "https://images.unsplash.com/photo-1738156674456-97cdf7793bb7?q=80&w=1740&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    caption: "Karaoke bars where you perform in front of everyone",
    vibes: ["social", "playful", "moody", "music"],
    preset: { destination: "specific", duration: "120 min", distance: 1.0,
              mapFilters: ["attractions", "ai-highlights", "saved-places"],
              antiAvoidances: ["Bars & nightlife"] } },
  { id: "p8",  image: "https://images.unsplash.com/photo-1648026141711-4837b280524c?q=80&w=2574&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    caption: "Art museums with rotating local exhibits",
    vibes: ["artsy", "bookish", "bright", "quiet"],
    preset: { destination: "specific", duration: "120 min", distance: 2.0,
              mapFilters: ["museums", "attractions", "ai-highlights", "saved-places"] } },
  { id: "p9",  image: "https://images.unsplash.com/photo-1559329007-40df8a9345d8?q=80&w=2574&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    caption: "Fancy sit-down restaurants that need reservations",
    vibes: ["foodie", "social", "bright"],
    preset: { destination: "specific", duration: "120 min", distance: 1.5,
              avoidances: ["Construction"],
              mapFilters: ["food", "ai-highlights", "saved-places"] } },
  { id: "p10", image: "https://images.unsplash.com/photo-1664273240076-f33f88b893a1?q=80&w=1875&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    caption: "Outdoor movie nights where you bring a blanket and snacks",
    vibes: ["cozy", "social", "moody", "leafy"],
    preset: { destination: "specific", duration: "120 min", distance: 1.2,
              mapFilters: ["parks", "attractions", "ai-highlights", "saved-places"] } },
];

// ── Preset aggregation ────────────────────────────────────────────────────
const DURATION_ORDER = ["15 min", "30 min", "60 min", "120 min", "No time limit"];

export function buildMergedPreset(history, deck) {
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

// ── Marker scribble overlay ───────────────────────────────────────────────
// Three irregular strokes over the photo when the card is being "no'd" —
// asymmetric back-and-forth with mixed L/Q segments plus two crossing slashes
// at slight angles, so the scribble reads as a quick rejection mark rather
// than a regular zigzag. Each stroke draws in via stroke-dashoffset with a
// tiny stagger so it feels like the strokes were laid down one after another.
function QuizScribble() {
  const strokes = [
    { d: "M 10 22 L 86 16 L 18 34 Q 50 46 84 38 L 14 52 L 92 60 L 22 72 Q 50 84 86 76 L 12 88 L 80 92", delay: 0,   width: 11 },
    { d: "M 28 8 Q 50 38 76 94",  delay: 90,  width: 10 },
    { d: "M 88 14 L 18 90",        delay: 160, width: 9  },
  ];
  return (
    <svg
      className="quiz-scribble"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {strokes.map((s, i) => (
        <path
          key={i}
          pathLength="100"
          d={s.d}
          stroke="#B91C1C"
          strokeWidth={s.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          vectorEffect="non-scaling-stroke"
          style={{ animationDelay: `${s.delay}ms` }}
        />
      ))}
    </svg>
  );
}

// ── Mini polaroid for the clothesline ─────────────────────────────────────
function MiniPolaroid({ item, angle, delay, skipAnim }) {
  return (
    <div
      className={`quiz-mini-wrap${skipAnim ? " quiz-mini-wrap--no-anim" : ""}`}
      style={skipAnim ? undefined : { animationDelay: `${delay}ms` }}
    >
      {/* Bulletin-board push-pin: small dark needle under a glossy red dome. */}
      <svg className="quiz-pin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <line x1="12" y1="13" x2="12" y2="22" stroke="#5A4632" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="12" cy="9" r="5" fill="#D33F3F" />
        <circle cx="10" cy="7" r="1.4" fill="#FFFFFF" opacity="0.6" />
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
export default function QuizScreen({ initialPreferences, onComplete, onClose, onSkip, entryMode = 'slide' }) {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState([]); // [{ polaroidId, direction }]
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exitDir, setExitDir] = useState(null);
  const [peekDir, setPeekDir] = useState(null);
  const [incomingDir, setIncomingDir] = useState(null); // direction the prior card exited; drives undo slide-back
  const [closing, setClosing] = useState(false);
  // For up-swipe exits: where on the clothesline the card should fly to
  // (delta from the stack's neutral position to the new mini's slot center).
  const [exitTarget, setExitTarget] = useState(null);
  // "drag" uses CSS transition (card has momentum from the finger); "button"
  // uses a keyframes animation with a subtle wind-up so the tap doesn't feel teleport-y.
  const exitSourceRef = useRef("drag");
  // Card id of the most recently up-swiped polaroid — used to skip the new
  // mini's drop-in animation since the active card already animated to its slot.
  const justAddedIdRef = useRef(null);

  const startPos = useRef({ x: 0, y: 0, t: 0 });
  const lastPos = useRef({ x: 0, y: 0, t: 0 });
  const cardRef = useRef(null);
  const animatingRef = useRef(false);
  const lineItemsRef = useRef(null);
  const lineDragRef = useRef({ active: false, startX: 0, scrollLeft: 0 });

  const handleLineDown = (e) => {
    const el = lineItemsRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    lineDragRef.current = {
      active: true,
      startX: e.pageX - el.offsetLeft,
      scrollLeft: el.scrollLeft,
      pointerId: e.pointerId,
    };
    el.classList.add("quiz-line-items--dragging");
  };
  const handleLineMove = (e) => {
    if (!lineDragRef.current.active) return;
    const el = lineItemsRef.current;
    if (!el) return;
    const walk = (e.pageX - el.offsetLeft) - lineDragRef.current.startX;
    el.scrollLeft = lineDragRef.current.scrollLeft - walk;
  };
  const handleLineUp = (e) => {
    if (!lineDragRef.current.active) return;
    try { e?.currentTarget?.releasePointerCapture?.(lineDragRef.current.pointerId); } catch (_) {}
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
    // Reveal sequence settles around 3s (route + pin landed), body copy
    // fades in around 3.8s. Hold long enough to comfortably read both lines,
    // THEN fade out, THEN hand off.
    const READ_MS = 7500;
    const FADE_MS = 600;
    const tFade = setTimeout(() => setClosing(true), READ_MS);
    const tDone = setTimeout(() => {
      onCompleteRef.current?.(payload);
    }, READ_MS + FADE_MS);
    return () => { clearTimeout(tFade); clearTimeout(tDone); };
  }, [done, history]);

  const commitSwipe = useCallback((direction, source = "drag") => {
    if (!current || animatingRef.current) return;
    animatingRef.current = true;
    exitSourceRef.current = source;

    // For "yes" swipes, compute the screen delta from the stack's neutral
    // center to the slot the new mini will occupy on the clothesline, so the
    // card animates directly into that spot (no off-screen disappear).
    if (direction === "up") {
      const stackEl = cardRef.current?.parentElement; // .quiz-stack — drag-free reference
      const stackRect = stackEl?.getBoundingClientRect();
      const lineRect = lineItemsRef.current?.getBoundingClientRect();
      if (stackRect && lineRect) {
        const N = history.filter(h => LABELS[h.direction].pinned).length;
        // Mirror the geometry in QuizScreen.css: items have padding 0 12px,
        // gap 10, mini is 42×54, mini-wrap padding-top 10.
        const MINI_W = 42, MINI_H = 54, GAP = 10, PAD_X = 12, PAD_TOP = 10;
        const miniCx = lineRect.left + PAD_X + N * (MINI_W + GAP) + MINI_W / 2;
        const miniCy = lineRect.top + PAD_TOP + MINI_H / 2;
        const stackCx = stackRect.left + stackRect.width / 2;
        const stackCy = stackRect.top + stackRect.height / 2;
        setExitTarget({
          dx: Math.round(miniCx - stackCx),
          dy: Math.round(miniCy - stackCy),
        });
      }
      justAddedIdRef.current = current.id;
    }

    setExitDir(direction);

    const exitMs = prefersReducedMotion() ? 200 : (exitSourceRef.current === "button" ? 720 : 640);
    setTimeout(() => {
      setHistory(h => [...h, { polaroidId: current.id, direction }]);
      setIndex(i => i + 1);
      setExitDir(null);
      setExitTarget(null);
      setDrag({ x: 0, y: 0, active: false });
      animatingRef.current = false;
    }, exitMs);
  }, [current, history]);

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

  const undoTimerRef = useRef(null);
  const handleUndo = useCallback(() => {
    if (history.length === 0 || animatingRef.current) return;
    const last = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setIndex(i => Math.max(0, i - 1));
    setExitDir(null);
    setDrag({ x: 0, y: 0, active: false });
    // Restored card slides back from the direction it had exited (up→down, down→up).
    animatingRef.current = true;
    setIncomingDir(last.direction);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const undoMs = prefersReducedMotion() ? 200 : 520;
    undoTimerRef.current = setTimeout(() => {
      setIncomingDir(null);
      animatingRef.current = false;
    }, undoMs);
  }, [history]);

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
      // Up swipe → fly to the clothesline slot and shrink to mini size so the
      // hand-off to the new mini polaroid looks like one continuous element.
      if (exitDir === "up" && exitTarget) {
        if (exitSourceRef.current === "button") {
          // Keyframe carries the wind-up; CSS vars feed the per-swipe target.
          return {
            animation: `quiz-exit-up 720ms cubic-bezier(0.5, 0.05, 0.3, 1) forwards`,
            "--exit-up-dx": `${exitTarget.dx}px`,
            "--exit-up-dy": `${exitTarget.dy}px`,
          };
        }
        return {
          transform: `translate(${exitTarget.dx}px, ${exitTarget.dy}px) rotate(-4deg) scale(0.17)`,
          transition: "transform 640ms cubic-bezier(0.22, 1, 0.36, 1)",
          opacity: 1,
        };
      }
      // Down swipe (no thanks) — keep flying off-screen (the tear effect plays on top).
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
    if (incomingDir) {
      return {
        animation: `quiz-undo-${incomingDir} 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
      };
    }
    return {
      transform: "translate(0, 0) rotate(0deg)",
      transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
    };
  })();

  if (done) {
    return (
      <div className={`quiz-screen quiz-done${entryMode === 'fade' ? " quiz-screen--enter-fade" : ""}${closing ? " quiz-screen--closing" : ""}`}>
        <div className="quiz-blobs">
          <div className="quiz-blob quiz-blob--1" />
          <div className="quiz-blob quiz-blob--2" />
          <div className="quiz-blob quiz-blob--3" />
        </div>
        <div className={`quiz-done-inner${closing ? " quiz-done-inner--fading" : ""}`}>
          <h1>Shaping your city for you</h1>
          {/* Hand-drawn route reveal — a faint pencil sketch hints at the
              path, a Strollo-purple marker draws over it, push-pin-styled
              place dots ping into existence as the marker passes them, and a
              yellow location pin lands at the destination with a soft drop
              and a settled bob. Sparkles fade in around the pin once it
              arrives so the moment of "arrival" reads. */}
          <div className="quiz-done-canvas" aria-hidden="true">
            <svg className="quiz-done-canvas-svg" viewBox="0 0 240 160" preserveAspectRatio="xMidYMid meet">
              {/* Pencil guide — barely visible, gives the eye a target */}
              <path
                className="qd-guide"
                d="M 24 138 C 50 100, 84 124, 116 92 S 156 54, 184 62 S 214 42, 220 36"
                fill="none"
                stroke="#8851D4"
                strokeOpacity="0.16"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeDasharray="2 5"
              />
              {/* Marker stroke draws over the sketch */}
              <path
                className="qd-route"
                pathLength="100"
                d="M 24 138 C 50 100, 84 124, 116 92 S 156 54, 184 62 S 214 42, 220 36"
                fill="none"
                stroke="#8851D4"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Place markers — bulletin push-pins (needle + glossy dome)
                  with a ping ring centered on the dome. The pin's needle tip
                  lands on the route point, dome rises above. */}
              {[
                { x: 58,  y: 118, color: "#D33F3F", delay: "700ms" },
                { x: 108, y: 92,  color: "#E8B43F", delay: "1100ms" },
                { x: 152, y: 58,  color: "#5C9F66", delay: "1500ms" },
                { x: 194, y: 58,  color: "#5276A8", delay: "1900ms" },
              ].map((p, i) => (
                <g key={i} transform={`translate(${p.x} ${p.y})`} style={{ "--qd-delay": p.delay }}>
                  <circle className="qd-poi-ring" cx="0" cy="-9" r="5" stroke={p.color} />
                  <g className="qd-poi-pin">
                    <line x1="0" y1="-4" x2="0" y2="0" stroke="#5A4632" strokeWidth="1.6" strokeLinecap="round" />
                    <circle cx="0" cy="-9" r="5" fill={p.color} />
                    <circle cx="-1.5" cy="-10.5" r="1.3" fill="#FFFFFF" opacity="0.6" />
                  </g>
                </g>
              ))}
              {/* Destination flag (drops with bounce, then bobs gently) —
                  matches the yellow flag from the WalkCompanionWidget so the
                  "you've arrived" cue reads consistently across the app. */}
              <g transform="translate(220 36)">
                <g className="qd-pin-drop">
                  <g className="qd-pin-bob">
                    <line x1="0" y1="0" x2="0" y2="-18" stroke="#FFD501" strokeWidth="2.2" strokeLinecap="round" />
                    <path d="M 0 -18 L 10 -15 L 0 -11 Z" fill="#FFD501" />
                    <circle cx="0" cy="0" r="2" fill="#FFD501" />
                  </g>
                </g>
              </g>
              {/* Sparkles around the destination after it lands */}
              <g className="qd-sparkles">
                <circle cx="206" cy="14" r="1.4" />
                <circle cx="232" cy="6"  r="1" />
                <circle cx="236" cy="48" r="1.2" />
                <circle cx="208" cy="50" r="0.9" />
              </g>
            </svg>
          </div>
          {/* Body copy waits for the loading reveal to finish before fading in. */}
          <div className="quiz-done-final">
            <p>All set! We've got a feel for your vibe.</p>
            <p className="quiz-done-hint">You can tweak these later in your settings.</p>
          </div>
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
    <div className={`quiz-screen${entryMode === 'fade' ? " quiz-screen--enter-fade" : ""}${closing ? " quiz-screen--closing" : ""}`}>
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
        {/* Decorative bulletin-board push-pins — varied colors so the empty
            line reads like a freshly cleared cork board. */}
        <div className="quiz-line-decor">
          {[
            { left: "8%",  top: 6,  rot: -10, color: "#D33F3F" },
            { left: "22%", top: 12, rot: 6,   color: "#E8B43F" },
            { left: "38%", top: 18, rot: -4,  color: "#5276A8" },
            { left: "54%", top: 20, rot: 8,   color: "#8851D4" },
            { left: "70%", top: 14, rot: -6,  color: "#5C9F66" },
            { left: "86%", top: 8,  rot: 10,  color: "#D77F2A" },
          ].map((p, i) => (
            <svg key={i} className="quiz-line-decor-pin" width="12" height="12" viewBox="0 0 24 24" fill="none"
              style={{ left: p.left, top: p.top, transform: `translateX(-50%) rotate(${p.rot}deg)` }}>
              <line x1="12" y1="13" x2="12" y2="22" stroke="#5A4632" strokeWidth="1.6" strokeLinecap="round" />
              <circle cx="12" cy="9" r="5" fill={p.color} />
              <circle cx="10" cy="7" r="1.4" fill="#FFFFFF" opacity="0.55" />
            </svg>
          ))}
        </div>
        <div
          className="quiz-line-items"
          ref={lineItemsRef}
          onPointerDown={handleLineDown}
          onPointerMove={handleLineMove}
          onPointerUp={handleLineUp}
          onPointerCancel={handleLineUp}
          onPointerLeave={handleLineUp}
        >
          {pinnedItems.map((it, i) => (
            <MiniPolaroid
              key={`${it.id}-${i}`}
              item={it}
              angle={it.angle}
              delay={it.delay}
              /* The just-added mini takes over directly from the active card's
                 fly-to-clothesline landing — skip its drop-in pin animation. */
              skipAnim={i === pinnedItems.length - 1 && it.id === justAddedIdRef.current}
            />
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
                <span className="quiz-card-index" aria-label={`Card ${label} of ${total}`}>
                  {label}<span className="quiz-card-index-sep">/</span>{total}
                </span>
                <div className="quiz-card-photo" style={card.image ? { backgroundImage: `url(${card.image})` } : undefined} />
                <div className="quiz-card-caption">{card.caption}</div>
                {isActive && scribbleDir === "down" && (
                  <div className="quiz-tear" aria-hidden="true">
                    <div className="quiz-tear-half quiz-tear-half--top">
                      <span className="quiz-card-index">
                        {label}<span className="quiz-card-index-sep">/</span>{total}
                      </span>
                      <div className="quiz-tear-photo" style={card.image ? { backgroundImage: `url(${card.image})` } : undefined} />
                      <div className="quiz-tear-caption">{card.caption}</div>
                      <QuizScribble />
                    </div>
                    <div className="quiz-tear-half quiz-tear-half--bottom">
                      <span className="quiz-card-index">
                        {label}<span className="quiz-card-index-sep">/</span>{total}
                      </span>
                      <div className="quiz-tear-photo" style={card.image ? { backgroundImage: `url(${card.image})` } : undefined} />
                      <div className="quiz-tear-caption">{card.caption}</div>
                      <QuizScribble />
                    </div>
                  </div>
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
