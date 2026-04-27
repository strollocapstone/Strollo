// Walk Companion minimized widget (bottom-pinned, during-walk).
// Shows the next turn (biggest), current waypoint target, DIST/ETA stats,
// and a button section: Rest/End pills + Mute / Speak icons.
import React, { useId, useRef, useState } from "react";
import "./WalkCompanionWidget.css";

// Progress strip that replaces the divider above the buttons section.
// Renders boots → dotted curve → flag, where the boots position scales
// with `progress` (0..1) and the curve segment behind the boots is light
// purple ("walked") while the segment ahead is brand purple ("remaining").
// Five-bar sound-wave glyph; matches the audio button used in the
// HomeScreen search bar. Pass `active` to start the bouncy animation.
function SoundBars({ active, color = "#FFD501" }) {
  const cls = active ? "sw-bar sw-bar--active" : "sw-bar";
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" fill={color} aria-hidden="true">
      <rect className={cls} x="1"   y="6" width="3" height="6"  rx="1.5" style={{ animationDelay: "0s"   }} />
      <rect className={cls} x="5.5" y="3" width="3" height="12" rx="1.5" style={{ animationDelay: "0.15s" }} />
      <rect className={cls} x="10"  y="0" width="3" height="18" rx="1.5" style={{ animationDelay: "0.3s"  }} />
      <rect className={cls} x="14.5" y="3" width="3" height="12" rx="1.5" style={{ animationDelay: "0.15s" }} />
      <rect className={cls} x="19"  y="6" width="3" height="6"  rx="1.5" style={{ animationDelay: "0s"   }} />
    </svg>
  );
}

function ProgressStrip({ progress, disabled = false }) {
  const idSuffix = useId().replace(/:/g, "");
  const W = 320;
  const H = 32;
  const PAD = 14;
  const innerW = W - PAD * 2;
  // Cubic-bezier wave centered on the strip: gentle up-down-up curve.
  const path = `M ${PAD} ${H / 2} C ${PAD + innerW * 0.25} 4, ${PAD + innerW * 0.45} ${H - 4}, ${PAD + innerW * 0.55} ${H / 2} S ${PAD + innerW * 0.85} 4, ${W - PAD} ${H / 2}`;
  const p = Math.max(0, Math.min(1, progress));
  const splitX = PAD + innerW * p;
  return (
    <div className={`wcw-progress${disabled ? " wcw-progress--disabled" : ""}`} aria-hidden="true">
      <svg
        className="wcw-progress-line"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
      >
        <defs>
          <clipPath id={`wcw-walked-${idSuffix}`}>
            <rect x="0" y="0" width={splitX} height={H} />
          </clipPath>
          <clipPath id={`wcw-remaining-${idSuffix}`}>
            <rect x={splitX} y="0" width={W - splitX} height={H} />
          </clipPath>
        </defs>
        <path
          d={path}
          fill="none"
          stroke="rgba(255, 213, 1, 0.45)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="2 4"
          clipPath={`url(#wcw-walked-${idSuffix})`}
        />
        <path
          d={path}
          fill="none"
          stroke="#C77DFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="2 4"
          clipPath={`url(#wcw-remaining-${idSuffix})`}
        />
      </svg>
      <span
        className="wcw-progress-boots"
        style={{ left: `calc(${PAD}px + (100% - ${PAD * 2}px) * ${p})` }}
      >
        <svg width="11" height="18" viewBox="0 0 28 46" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 2 C5 2 3 5 3 10 L3 32 C3 38 5 44 10 44 L17 44 C20 44 22 42 23 38 L24 32 C24 28 22 26 19 26 L18 26 L18 10 C18 5 16 2 13 2 Z" fill="#F7F3F5"/>
          <line x1="6" y1="14" x2="17" y2="14" stroke="#1E1541" strokeWidth="2" opacity="0.4"/>
          <line x1="6" y1="19" x2="17" y2="19" stroke="#1E1541" strokeWidth="2" opacity="0.4"/>
        </svg>
        <svg width="11" height="18" viewBox="0 0 28 46" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2 C23 2 25 5 25 10 L25 32 C25 38 23 44 18 44 L11 44 C8 44 6 42 5 38 L4 32 C4 28 6 26 9 26 L10 26 L10 10 C10 5 12 2 15 2 Z" fill="#F7F3F5"/>
          <line x1="11" y1="14" x2="22" y2="14" stroke="#1E1541" strokeWidth="2" opacity="0.4"/>
          <line x1="11" y1="19" x2="22" y2="19" stroke="#1E1541" strokeWidth="2" opacity="0.4"/>
        </svg>
      </span>
      <span className="wcw-progress-flag">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#FFD501" stroke="none">
          <path d="M8 3 L8 21" stroke="#FFD501" strokeWidth="2.4" strokeLinecap="round"/>
          <path d="M8 3 L18 6 L8 10 Z"/>
          <circle cx="8" cy="21" r="2"/>
        </svg>
      </span>
    </div>
  );
}

function WalkCompanionWidgetInner({
  destination = "your next stop",
  instruction = "—",
  distance = "—",
  eta = "—",
  progress = 0,
  // True when the user is within ~300 ft of the next stop. When true, the
  // skip pill swaps its label/handler to "I am here" so the user can confirm
  // arrival without leaving the widget.
  atTarget = false,
  // Shown in the empty state ("You are at <currentLocationName>") when the
  // user hasn't planned any stops yet. Reverse-geocoded from the user's
  // GPS by the parent — null/undefined renders as a "Locating…" fallback
  // until the geocode resolves.
  currentLocationName = null,
  transcript = "",
  suggestion = "",
  narration = "",
  onSkip,
  onArrived,
  onEnd,
  onExpand,
  onChat,
  onSpeakStart,
  onSpeakEnd,
}, forwardedRef) {
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speakActive, setSpeakActive] = useState(false);
  const [speakLocked, setSpeakLocked] = useState(false);
  // Push-to-talk gesture: pointerdown begins speaking, pointerup ends it.
  // While the pointer is down, dragging up past 40px latches the button into
  // a locked "always listening" mode; the next tap then exits that mode.
  const speakRef = useRef({ startY: 0, locked: false });

  const startSpeak = () => {
    setSpeakActive(true);
    onSpeakStart?.();
  };
  const stopSpeak = () => {
    setSpeakActive(false);
    setSpeakLocked(false);
    speakRef.current.locked = false;
    onSpeakEnd?.();
  };

  const onSpeakPointerDown = (e) => {
    if (speakLocked) {
      stopSpeak();
      return;
    }
    e.preventDefault();
    speakRef.current.startY = e.clientY;
    speakRef.current.locked = false;
    startSpeak();
  };
  const onSpeakPointerMove = (e) => {
    if (!speakActive || speakLocked) return;
    const dy = e.clientY - speakRef.current.startY;
    if (dy < -40) {
      speakRef.current.locked = true;
      setSpeakLocked(true);
    }
  };
  const onSpeakPointerUp = () => {
    if (speakRef.current.locked) return;
    stopSpeak();
  };

  const isEmpty = !destination;
  const listening = speakActive;
  const glowing = !!suggestion && !listening;

  // Drag-up to expand into the full-screen chat. Tracks pointerdown only when
  // the gesture starts on the widget chrome (not on a button), then watches
  // for ~60px of upward movement and calls onExpand once.
  const expandRef = useRef({ active: false, startY: 0 });
  const onWidgetPointerDown = (e) => {
    if (!onExpand) return;
    if (e.target.closest("button, [data-no-drag]")) return;
    expandRef.current = { active: true, startY: e.clientY };
  };
  const onWidgetPointerMove = (e) => {
    if (!expandRef.current.active) return;
    if (expandRef.current.startY - e.clientY > 60) {
      expandRef.current.active = false;
      onExpand?.();
    }
  };
  const onWidgetPointerEnd = () => {
    expandRef.current.active = false;
  };

  return (
    <div
      ref={forwardedRef}
      className={`wcw${listening ? " wcw--listening" : ""}${glowing ? " wcw--glow" : ""}`}
      onPointerDown={onWidgetPointerDown}
      onPointerMove={onWidgetPointerMove}
      onPointerUp={onWidgetPointerEnd}
      onPointerCancel={onWidgetPointerEnd}
    >
      <div className="wcw-status-row">
        {listening ? (
          <>
            <span className="wcw-listening-label">
              <span className="wcw-listening-dot" />
              You're saying
            </span>
          </>
        ) : paused ? (
          <span className="wcw-paused-msg">
            {"You're resting at "}
            <span className="wcw-paused-name">{destination || "your stop"}</span>
            {"."}
          </span>
        ) : isEmpty ? (
          <>
            <span className="wcw-heading-label">You are at</span>
            <span className="wcw-destination">{currentLocationName || "Locating…"}</span>
          </>
        ) : (
          <>
            <span className="wcw-heading-label">Heading to</span>
            <span className="wcw-destination">{destination}</span>
            {atTarget ? (
              <button
                type="button"
                className="wcw-skip-btn wcw-skip-btn--arrived"
                onClick={onArrived}
                aria-label={`Confirm you have arrived at ${destination}`}
              >
                <svg className="wcw-skip-flag" width="11" height="13" viewBox="0 0 24 24" fill="#FFD501" stroke="none" aria-hidden="true">
                  <path d="M8 3 L8 21" stroke="#FFD501" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M8 3 L18 6 L8 10 Z"/>
                  <circle cx="8" cy="21" r="2"/>
                </svg>
                <span>I am here</span>
              </button>
            ) : (
              <button
                type="button"
                className="wcw-skip-btn"
                onClick={onSkip}
                aria-label="Skip this stop"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                  <polygon points="4 5 13 12 4 19 4 5" />
                  <polygon points="13 5 22 12 13 19 13 5" />
                </svg>
                <span>Skip stop</span>
              </button>
            )}
          </>
        )}
      </div>

      {listening ? (
        <h2 className="wcw-turn">{`“${transcript || "…"}”`}</h2>
      ) : paused ? null : suggestion ? (
        <div className="wcw-suggestion" role="status">
          <span className="wcw-suggestion-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFD501" stroke="#B5912E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7 4 4 0 0 1 1.5 3.1V18h5v-.2a4 4 0 0 1 1.5-3.1A7 7 0 0 0 12 2z" />
            </svg>
          </span>
          <span className="wcw-suggestion-text">{suggestion}</span>
        </div>
      ) : narration ? (
        <p className="wcw-narration">{narration}</p>
      ) : isEmpty ? (
        <p className="wcw-narration wcw-narration--idle">
          <span className="wcw-idle-dots" aria-hidden="true">
            <span /><span /><span />
          </span>
          Strollo's looking around to see what's nearby — tap the mic to ask about this spot or where to head next.
        </p>
      ) : (
        <h2 className="wcw-turn">{instruction}</h2>
      )}

      {!listening && !isEmpty && (
        <div className="wcw-stats">
          <div className="wcw-stat">
            <span className="wcw-stat-label">DIST</span>
            <span className="wcw-stat-value">{paused ? "—" : distance}</span>
          </div>
          <div className="wcw-stat">
            <span className="wcw-stat-label">ETA</span>
            <span className="wcw-stat-value">{paused ? "—" : eta}</span>
          </div>
        </div>
      )}

      {!isEmpty && <ProgressStrip progress={progress} />}

      <div className="wcw-bottom">
        <div className="wcw-bottom-left">
          {onChat && (
            <button
              type="button"
              className="wcw-icon-btn"
              onClick={onChat}
              aria-label="Open chat"
              title="Open chat"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className={`wcw-icon-btn${muted ? " wcw-icon-btn--active" : ""}`}
            onClick={() => setMuted((v) => !v)}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={muted}
            title={muted ? "Unmute" : "Mute"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
              <polygon points="4 9 8 9 13 4 13 20 8 15 4 15" />
              {!muted && (
                <path d="M16.5 8.2 a4 4 0 0 1 0 7.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
              {muted && (
                <line x1="3" y1="20" x2="21" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
        <div className="wcw-bottom-right">
          <button
            type="button"
            className={`wcw-icon-btn wcw-speak${speakActive ? " wcw-speak--active" : ""}${speakLocked ? " wcw-speak--locked" : ""}`}
            onPointerDown={onSpeakPointerDown}
            onPointerMove={onSpeakPointerMove}
            onPointerUp={onSpeakPointerUp}
            onPointerCancel={onSpeakPointerUp}
            aria-label={speakLocked ? "Stop listening" : "Hold to speak — drag up to lock"}
            aria-pressed={speakActive}
            title={speakLocked ? "Tap to stop" : "Hold to speak — drag up to lock"}
          >
            <SoundBars active={speakActive} color="currentColor" />
            <span className="wcw-speak-label">Say anything</span>
            {speakLocked && (
              <span className="wcw-speak-lock" aria-hidden="true">
                <svg width="9" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" stroke="none" />
                  <path d="M8 11V7a4 4 0 1 1 8 0v4" />
                </svg>
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

const WalkCompanionWidget = React.forwardRef(WalkCompanionWidgetInner);
export default WalkCompanionWidget;
