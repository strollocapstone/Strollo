// FEATURE: walk-nav
// OWNER: shared
// DEPENDS ON: leaf
// CONSUMED BY: ./NavigationMapScreen
//
// Journey-edit modal for during-walk: lets the user reorder/remove upcoming
// stops without leaving the walk. See Design.md "Journey Edit Screen
// (During-Walk)" for the spec.

// Opens from the flag icon on NavigationMapScreen.
// See Design.md "Journey Edit Screen (During-Walk)" for the full spec.
import React, { useState } from "react";

export default function JourneyEditScreen({ items = [], onClose, onGoBack }) {
  const defaultItems = items.length
    ? items
    : [{ id: 0, name: "Sightglass Coffee", desc: "SoMa · Coffee" }];
  const [stops, setStops] = useState(defaultItems);

  const removeStop = (id) => setStops((s) => s.filter((x) => x.id !== id));

  return (
    <div className="journey-overlay">
      <div className="handle-bar" style={{ margin: "0 auto 16px" }} />
      <h3 className="journey-title">Your journey</h3>

      <div className="journey-stops">
        {stops.map((stop, i) => (
          <React.Fragment key={stop.id}>
            {i > 0 && (
              <div className="add-between">
                <div className="add-between-line" />
                <button className="add-between-btn">+ Add stop</button>
                <div className="add-between-line" />
              </div>
            )}
            <div className="journey-stop">
              <div className="stop-dot" />
              <div className="stop-info">
                <span className="stop-name">{stop.name}</span>
                <span className="stop-desc">{stop.desc}</span>
              </div>
              <button className="stop-remove" onClick={() => removeStop(stop.id)} aria-label="Remove">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/>
                </svg>
              </button>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="journey-actions">
        <button className="journey-btn journey-btn--pause" onClick={onClose}>Pause walk</button>
        <button className="journey-btn journey-btn--end" onClick={onGoBack}>End walk</button>
      </div>
    </div>
  );
}
