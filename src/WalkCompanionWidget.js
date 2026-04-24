// Walk Companion minimized widget (top-pinned, during-walk).
// Replaces the bottom pill — sits fixed at the top of NavigationMapScreen
// and LockScreen while the user is on a walk. Shows next-waypoint nav
// context + voice controls. Drag up on the mic to lock speak mode
// (shows a lock chip beside the mic). Drag the bottom edge up to expand
// into the full companion (chat history) — full screen wired later.
import React, { useCallback, useRef } from "react";
import "./WalkCompanionWidget.css";

function SpeakerSvg({ muted }) {
  const color = muted ? "rgba(255,255,255,0.45)" : "#FFFFFF";
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      {muted
        ? <><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>
        : <><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></>
      }
    </svg>
  );
}

function MicSvg() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E1541" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" fill="#1E1541" stroke="#1E1541"/>
      <path d="M5 11v1a7 7 0 0 0 14 0v-1" stroke="#1E1541"/>
      <line x1="12" y1="19" x2="12" y2="22" stroke="#1E1541"/>
    </svg>
  );
}

function LockSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFD501">
      <rect x="4" y="11" width="16" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4" fill="none" stroke="#FFD501" strokeWidth="2.2" strokeLinecap="round"/>
    </svg>
  );
}

export default function WalkCompanionWidget({
  nextWaypoint = "your next stop",
  distance = "—",
  turn = "—",
  eta = "—",
  proximity = "far", // 'far' | 'near'
  listening = false,
  locked = false,
  muted = false,
  onMuteToggle,
  onListenStart,
  onListenEnd,
  onDragLock,
  onUnlock,
  onExpandVoice,
}) {
  const speakStartY = useRef(null);
  const speakDidLock = useRef(false);
  const expandStartY = useRef(null);

  // Hold-to-speak: press, drag up > 40px to lock, release to stop.
  const onSpeakDown = useCallback((e) => {
    if (locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    speakStartY.current = e.clientY;
    speakDidLock.current = false;
    onListenStart?.();
  }, [locked, onListenStart]);

  const onSpeakMove = useCallback((e) => {
    if (speakStartY.current === null || speakDidLock.current) return;
    if (speakStartY.current - e.clientY > 40) {
      speakDidLock.current = true;
      onDragLock?.();
    }
  }, [onDragLock]);

  const onSpeakUp = useCallback((e) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    speakStartY.current = null;
    if (!speakDidLock.current) onListenEnd?.();
  }, [onListenEnd]);

  const onSpeakClick = useCallback(() => {
    if (locked) onUnlock?.();
  }, [locked, onUnlock]);

  // Bottom-edge drag-up to expand into full companion.
  const onExpandDown = useCallback((e) => {
    if (!onExpandVoice) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    expandStartY.current = e.clientY;
  }, [onExpandVoice]);
  const onExpandMove = useCallback((e) => {
    if (!onExpandVoice || expandStartY.current === null) return;
    if (expandStartY.current - e.clientY > 60) {
      expandStartY.current = null;
      onExpandVoice();
    }
  }, [onExpandVoice]);
  const onExpandUp = useCallback((e) => {
    if (!onExpandVoice) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    expandStartY.current = null;
  }, [onExpandVoice]);

  const headline = proximity === "near"
    ? <>approaching — <span className="wcw-waypoint">{nextWaypoint}</span>.</>
    : <>keep going — <span className="wcw-waypoint">{nextWaypoint}</span> is just ahead.</>;

  return (
    <div className="wcw">
      <div className="wcw-status-pill">
        <span className="wcw-status-dot" />
        Strollo · Live
      </div>

      <h2 className="wcw-headline">{headline}</h2>

      <div className="wcw-stats">
        <div className="wcw-stat">
          <span className="wcw-stat-label">DIST</span>
          <span className="wcw-stat-value">{distance}</span>
        </div>
        <div className="wcw-stat">
          <span className="wcw-stat-label">TURN</span>
          <span className="wcw-stat-value">{turn}</span>
        </div>
        <div className="wcw-stat">
          <span className="wcw-stat-label">ETA</span>
          <span className="wcw-stat-value">{eta}</span>
        </div>
      </div>

      <div className="wcw-controls">
        <button
          className={`wcw-speaker ${muted ? "wcw-speaker--muted" : ""}`}
          onClick={onMuteToggle}
          aria-label={muted ? "Unmute companion" : "Mute companion"}
          aria-pressed={muted}
        >
          <SpeakerSvg muted={muted} />
          <span className="wcw-speaker-label">{muted ? "Muted" : "Mute"}</span>
        </button>

        <button
          className={`wcw-speak ${listening ? "wcw-speak--listening" : ""} ${locked ? "wcw-speak--locked" : ""}`}
          onPointerDown={onSpeakDown}
          onPointerMove={onSpeakMove}
          onPointerUp={onSpeakUp}
          onPointerCancel={onSpeakUp}
          onClick={onSpeakClick}
          style={{ touchAction: "none" }}
          aria-label={locked ? "Unlock speak" : "Hold to speak, drag up to lock"}
          aria-pressed={listening}
        >
          <MicSvg />
          <span className="wcw-speak-label">
            {locked ? "Locked · tap to stop" : listening ? "Listening…" : "Hold to speak"}
          </span>
        </button>

        {locked && (
          <div className="wcw-lock-chip" aria-hidden="true">
            <LockSvg />
          </div>
        )}
      </div>

      {onExpandVoice && (
        <div
          className="wcw-expand-handle"
          onPointerDown={onExpandDown}
          onPointerMove={onExpandMove}
          onPointerUp={onExpandUp}
          onPointerCancel={onExpandUp}
          style={{ touchAction: "none" }}
          aria-label="Drag up to expand companion"
          role="button"
        >
          <div className="wcw-expand-bar" />
        </div>
      )}
    </div>
  );
}
