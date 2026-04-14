// Walk Companion Screen (During-Walk).
// Houses the minimized pill widget component shared with LockScreen.js.
import React, { useRef, useCallback } from "react";
import "./NavigationMapScreen.css";

// ── Shared widget icons ───────────────────────────────────────────────────
export function MuteSvg({ muted }) {
  const color = muted ? "#FF9900" : "white";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
      {muted
        ? <><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></>
        : <><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></>
      }
    </svg>
  );
}

export function SoundWaveSvg({ active }) {
  const color = active ? "#FFFFFF" : "rgba(225,177,255,0.70)";
  const cls = active ? "sw-bar sw-bar--active" : "sw-bar";
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" fill={color}>
      <rect className={cls} x="1"  y="6"  width="3" height="6"  rx="1.5" style={{ animationDelay: "0s" }} />
      <rect className={cls} x="5.5" y="3"  width="3" height="12" rx="1.5" style={{ animationDelay: "0.15s" }} />
      <rect className={cls} x="10" y="0"  width="3" height="18" rx="1.5" style={{ animationDelay: "0.3s" }} />
      <rect className={cls} x="14.5" y="3"  width="3" height="12" rx="1.5" style={{ animationDelay: "0.15s" }} />
      <rect className={cls} x="19" y="6"  width="3" height="6"  rx="1.5" style={{ animationDelay: "0s" }} />
    </svg>
  );
}

// ── Chat bubble for widget ────────────────────────────────────────────────
export function WidgetBubble({ listening, aiSpeaking, muted, userText, aiText }) {
  if (listening && userText) {
    return (
      <div className="wcb wcb--user" key="user">
        <div className="wcb-bubble wcb-bubble--user">
          <p className="wcb-text">{userText}</p>
          <div className="wcb-tail wcb-tail--right" />
        </div>
      </div>
    );
  }
  if (aiSpeaking) {
    return (
      <div className="wcb wcb--ai" key="ai">
        <div className="wcb-bubble wcb-bubble--ai">
          {!muted && !aiText ? (
            <div className="wcb-typing"><div className="wcb-dot" /><div className="wcb-dot" /><div className="wcb-dot" /></div>
          ) : (
            <p className="wcb-text">{aiText}</p>
          )}
          <div className="wcb-tail wcb-tail--left" />
        </div>
      </div>
    );
  }
  return null;
}

// ── Walk Companion pill (minimized widget — shared with LockScreen.js) ────
export function WalkCompanionPill({ listening, locked, muted, aiSpeaking, userText, aiText, onMuteToggle, onListenStart, onListenEnd, onDragLock, onUnlock, onExpandVoice }) {
  const speakStartY = useRef(null);
  const speakDidLock = useRef(false);
  const handleStartY = useRef(null);

  // Speak button pointer events
  const onDown = useCallback((e) => {
    if (locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    speakStartY.current = e.clientY;
    speakDidLock.current = false;
    onListenStart();
  }, [locked, onListenStart]);

  const onMove = useCallback((e) => {
    if (speakStartY.current === null || speakDidLock.current) return;
    if (speakStartY.current - e.clientY > 40) {
      speakDidLock.current = true;
      onDragLock();
    }
  }, [onDragLock]);

  const onUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    speakStartY.current = null;
    if (!speakDidLock.current) onListenEnd();
  }, [onListenEnd]);

  const onTap = useCallback(() => {
    if (locked) onUnlock();
  }, [locked, onUnlock]);

  // Handle drag-up to expand (skipped when onExpandVoice is not provided, e.g. LockScreen)
  const onHandleDown = useCallback((e) => {
    if (!onExpandVoice) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    handleStartY.current = e.clientY;
  }, [onExpandVoice]);
  const onHandleMove = useCallback((e) => {
    if (!onExpandVoice) return;
    if (handleStartY.current === null) return;
    if (handleStartY.current - e.clientY > 60) {
      handleStartY.current = null;
      onExpandVoice();
    }
  }, [onExpandVoice]);
  const onHandleUp = useCallback((e) => {
    if (!onExpandVoice) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    handleStartY.current = null;
  }, [onExpandVoice]);

  return (
    <div className="voice-minimized">
      <div
        className="voice-min-handle"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        style={{ touchAction: "none" }}
      >
        <div className="handle-bar" />
      </div>
      <div className="voice-min-content">
        <button className={`wc-btn wc-mute-btn ${muted ? "wc-muted" : ""}`} onClick={onMuteToggle} aria-label="Mute AI">
          <MuteSvg muted={muted} />
        </button>
        <div className="wc-bubble-area">
          <WidgetBubble listening={listening} aiSpeaking={aiSpeaking} muted={muted} userText={userText} aiText={aiText} />
        </div>
        <button
          className={`wc-btn wc-speak-btn ${listening ? "wc-listening" : ""} ${locked ? "wc-locked" : ""}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onClick={onTap}
          style={{ touchAction: "none" }}
          aria-label="Speak"
        >
          {locked && <div className="wc-pulse-ring" />}
          {locked && <div className="wc-lock-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFD501"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="#FFD501" strokeWidth="2"/></svg>
          </div>}
          <SoundWaveSvg active={listening} />
        </button>
      </div>
    </div>
  );
}

// Placeholder default export — Walk Companion full screen is not yet implemented.
export default function WalkCompanionScreen() {
  return (
    <div className="phone-frame">
      <h1>Walk Companion Screen</h1>
    </div>
  );
}
