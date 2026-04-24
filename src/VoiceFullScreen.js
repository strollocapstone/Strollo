import React, { useRef, useCallback, useEffect } from "react";
import { ReactComponent as RightSoleSvg } from "./assets/right-sole.svg";
import { ReactComponent as LeftSoleSvg } from "./assets/left-sole.svg";
import { MuteSvg, SoundWaveSvg } from "./WalkCompanionScreen";

// Marauder's Map footstep positions (walking up screen with meander)
const VFS_STEPS = [
  { x: "calc(50% + 6px)",  y: "88%", rot: -4,  mirror: false },
  { x: "calc(50% - 22px)", y: "81%", rot: -2,  mirror: true },
  { x: "calc(50% + 8px)",  y: "74%", rot: -6,  mirror: false },
  { x: "calc(50% - 18px)", y: "67%", rot: -3,  mirror: true },
  { x: "calc(50% + 12px)", y: "60%", rot: -8,  mirror: false },
  { x: "calc(50% - 16px)", y: "53%", rot: -5,  mirror: true },
  { x: "calc(50% + 10px)", y: "46%", rot: -10, mirror: false },
  { x: "calc(50% - 20px)", y: "39%", rot: -7,  mirror: true },
  { x: "calc(50% + 14px)", y: "32%", rot: -6,  mirror: false },
  { x: "calc(50% - 14px)", y: "25%", rot: -4,  mirror: true },
  { x: "calc(50% + 8px)",  y: "18%", rot: -8,  mirror: false },
  { x: "calc(50% - 18px)", y: "11%", rot: -3,  mirror: true },
];

export default function VoiceFullScreen({
  listening, locked, muted,
  messages = [],
  onMuteToggle, onListenStart, onListenEnd, onDragLock, onUnlock, onMinimize,
}) {
  const handleStartY = useRef(null);
  const speakStartY = useRef(null);
  const speakDidLock = useRef(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Drag-down to minimize
  const onHandleDown = useCallback((e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    handleStartY.current = e.clientY;
  }, []);
  const onHandleMove = useCallback((e) => {
    if (handleStartY.current === null) return;
    if (e.clientY - handleStartY.current > 60) {
      handleStartY.current = null;
      onMinimize();
    }
  }, [onMinimize]);
  const onHandleUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    handleStartY.current = null;
  }, []);

  // Speak button
  const onDown = useCallback((e) => {
    if (locked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    speakStartY.current = e.clientY;
    speakDidLock.current = false;
    onListenStart();
  }, [locked, onListenStart]);
  const onMove = useCallback((e) => {
    if (speakStartY.current === null || speakDidLock.current) return;
    if (speakStartY.current - e.clientY > 40) { speakDidLock.current = true; onDragLock(); }
  }, [onDragLock]);
  const onUp = useCallback((e) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    speakStartY.current = null;
    if (!speakDidLock.current) onListenEnd();
  }, [onListenEnd]);
  const onTap = useCallback(() => { if (locked) onUnlock(); }, [locked, onUnlock]);

  return (
    <div className="vfs">
      <div className="vfs-gradient" />

      <div className="vfs-footsteps">
        {VFS_STEPS.map((s, i) => (
          <div key={i} className="vfs-sole"
            style={{ left: s.x, top: s.y, width: 22, height: 28, animationDelay: `${i * 0.8}s`, transform: `rotate(${s.rot}deg)` }}>
            {s.mirror
              ? <LeftSoleSvg width="22" height="28" />
              : <RightSoleSvg width="22" height="28" />
            }
          </div>
        ))}
      </div>

      <div
        className="vfs-handle"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        style={{ touchAction: "none" }}
      >
        <div className="vfs-handle-bar" />
      </div>

      <div className="vfs-chat">
        {messages.map((msg) => (
          <div key={msg.id} className={`wcb wcb--${msg.role}`}>
            <div className={`wcb-bubble vfs-bubble vfs-bubble--${msg.role}`}>
              <p className="wcb-text">{msg.text}</p>
              <div className={`wcb-tail vfs-tail--${msg.role === "ai" ? "left" : "right"}`} />
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <div className="vfs-controls">
        <button className={`wc-btn wc-btn--lg wc-mute-btn ${muted ? "wc-muted" : ""}`} onClick={onMuteToggle} aria-label="Mute AI">
          <MuteSvg muted={muted} />
        </button>
        <button
          className={`wc-btn wc-btn--lg wc-speak-btn ${listening ? "wc-listening" : ""} ${locked ? "wc-locked" : ""}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onClick={onTap}
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
