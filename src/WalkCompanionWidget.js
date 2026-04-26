// Walk Companion minimized widget (bottom-pinned, during-walk).
// Shows the next turn (biggest), current waypoint target, DIST/ETA stats,
// and a single "Check journey" CTA that opens the timeline.
import React, { useState } from "react";
import "./WalkCompanionWidget.css";

export default function WalkCompanionWidget({
  destination = "your next stop",
  instruction = "—",
  distance = "—",
  eta = "—",
  canSkip = false,
  checkLabel = "Journey",
  onSkip,
  onCheckJourney,
  onEnd,
}) {
  // Local toggles for the trip-pause and audio-mute buttons in the
  // actions row. They don't yet drive the actual stopwatch or audio
  // pipeline — visual state only — but the affordance is permanent.
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  // destination=null/empty signals "no current destination" — there's nothing
  // confirmed on the Timeline yet, so we hide the "Heading to" prefix and
  // render a single soft empty-state line instead.
  const isEmpty = !destination;
  return (
    <div className="wcw">
      <div className="wcw-status-row">
        {isEmpty ? (
          <span className="wcw-destination wcw-destination--empty">No current destination</span>
        ) : (
          <>
            <span className="wcw-heading-label">Heading to</span>
            <span className="wcw-destination">{destination}</span>
            {canSkip && (
              <button
                type="button"
                className="wcw-skip-btn"
                onClick={onSkip}
                aria-label="Skip this stop"
              >
                Skip
              </button>
            )}
          </>
        )}
      </div>

      <h2 className="wcw-turn">{instruction}</h2>

      <div className="wcw-stats">
        <div className="wcw-stat">
          <span className="wcw-stat-label">DIST</span>
          <span className="wcw-stat-value">{distance}</span>
        </div>
        <div className="wcw-stat">
          <span className="wcw-stat-label">ETA</span>
          <span className="wcw-stat-value">{eta}</span>
        </div>
      </div>

      <div className="wcw-actions">
        <button type="button" className="wcw-end-btn" onClick={onEnd} aria-label="End walk">
          End
        </button>
        <button
          type="button"
          className={`wcw-icon-btn${paused ? " wcw-icon-btn--active" : ""}`}
          onClick={() => setPaused((v) => !v)}
          aria-label={paused ? "Resume trip" : "Pause trip"}
          aria-pressed={paused}
          title={paused ? "Resume trip" : "Pause trip"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
            <rect x="6" y="5" width="3.4" height="14" rx="0.6" />
            <rect x="14.6" y="5" width="3.4" height="14" rx="0.6" />
            {paused && (
              <line x1="3" y1="20" x2="21" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
        </button>
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
        <button
          type="button"
          className="wcw-check-btn"
          onClick={onCheckJourney}
          aria-label="Check journey"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <polygon points="10,2 22,7 10,12" fill="#FFD501"/>
            <rect x="8" y="2" width="2" height="20" rx="1" fill="#FFD501"/>
            <circle cx="5" cy="20" r="1" fill="#FFD501"/>
            <circle cx="2" cy="17" r="1" fill="#FFD501"/>
          </svg>
          <span>{checkLabel}</span>
        </button>
      </div>
    </div>
  );
}
