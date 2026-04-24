// Walk Companion minimized widget (bottom-pinned, during-walk).
// Shows the next turn (biggest), current waypoint target, DIST/ETA stats,
// and a single "Check journey" CTA that opens the timeline.
import React from "react";
import "./WalkCompanionWidget.css";

export default function WalkCompanionWidget({
  destination = "your next stop",
  instruction = "—",
  distance = "—",
  eta = "—",
  canSkip = false,
  onSkip,
  onCheckJourney,
  onEnd,
}) {
  return (
    <div className="wcw">
      <div className="wcw-status-row">
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
          <span>Check journey</span>
        </button>
      </div>
    </div>
  );
}
