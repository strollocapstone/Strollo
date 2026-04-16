import React, { useState } from "react";
import "./MapFilterScreen.css";

const FILTERS = [
  { id: "ai-highlights", label: "AI Highlights", defaultOn: true },
  { id: "saved-places", label: "Saved Places", defaultOn: true },
  { id: "attractions", label: "Attractions", defaultOn: false },
  { id: "benches", label: "Benches and Picnic Areas", defaultOn: false },
  { id: "cafes", label: "Cafes", defaultOn: false },
  { id: "dog-friendly", label: "Dog Friendly", defaultOn: false },
  { id: "food", label: "Food", defaultOn: false },
  { id: "museums", label: "Museums", defaultOn: false },
  { id: "sights", label: "Sights", defaultOn: false },
  { id: "parks", label: "Parks", defaultOn: false },
];

function FilterIcon({ id }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "#34233E", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

  switch (id) {
    case "ai-highlights":
      return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill="#34233E" stroke="none" /></svg>;
    case "saved-places":
      return <svg {...p}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>;
    case "attractions":
      return <svg {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>;
    case "benches":
      return <svg {...p}><path d="M2 14h20" /><path d="M4 14v5" /><path d="M20 14v5" /><path d="M6 14V9" /><path d="M18 14V9" /><path d="M6 9h12" /></svg>;
    case "cafes":
      return <svg {...p}><path d="M17 8h1a4 4 0 0 1 0 8h-1" /><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8z" /><line x1="6" y1="2" x2="6" y2="4" /><line x1="10" y1="2" x2="10" y2="4" /><line x1="14" y1="2" x2="14" y2="4" /></svg>;
    case "dog-friendly":
      return <svg {...p}><path d="M10 5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" /><rect x="7" y="5" width="10" height="6" rx="2" /><path d="M9 11v4a1 1 0 0 1-1 1H7" /><path d="M15 11v4a1 1 0 0 0 1 1h1" /><path d="M12 11v6" /><circle cx="12" cy="20" r="2" /></svg>;
    case "food":
      return <svg {...p}><line x1="7" y1="2" x2="7" y2="22" /><line x1="3" y1="2" x2="3" y2="7" /><line x1="7" y1="2" x2="7" y2="7" /><line x1="11" y1="2" x2="11" y2="7" /><path d="M3 7c0 3 2 5 4 5s4-2 4-5" /><line x1="17" y1="2" x2="17" y2="22" /><path d="M21 2c0 4-1.5 8-4 8" /></svg>;
    case "museums":
      return <svg {...p}><path d="M2 20h20" /><path d="M3 20v-8" /><path d="M21 20v-8" /><path d="M5 12v8" /><path d="M9 12v8" /><path d="M15 12v8" /><path d="M19 12v8" /><path d="M2 12h20" /><path d="M12 3l10 9H2l10-9z" fill="none" /></svg>;
    case "sights":
      return <svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "parks":
      return <svg {...p}><path d="M12 22v-8" /><path d="M7 14l5-5 5 5" fill="none" /><path d="M5 18l7-6 7 6" fill="none" /><path d="M9 10l3-3 3 3" fill="none" /></svg>;
    default:
      return null;
  }
}

function CheckCircle({ checked }) {
  if (checked) {
    return (
      <div className="mf-check mf-check--on">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  return <div className="mf-check mf-check--off" />;
}

export default function MapFilterScreen({ onGoBack }) {
  const [enabled, setEnabled] = useState(
    () => new Set(FILTERS.filter((f) => f.defaultOn).map((f) => f.id))
  );

  const toggle = (id) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mf-screen">
      <div className="mf-header">
        <button className="mf-close" onClick={onGoBack} aria-label="Close">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34233E" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <span className="mf-title">Curate your exploration</span>
      </div>

      <div className="mf-scroll">
        <div className="mf-card">
          {FILTERS.map((filter, i) => (
            <button
              key={filter.id}
              className={`mf-row ${i === FILTERS.length - 1 ? "mf-row--last" : ""}`}
              onClick={() => toggle(filter.id)}
            >
              <div className="mf-row-icon">
                <FilterIcon id={filter.id} />
              </div>
              <span className="mf-row-label">{filter.label}</span>
              <CheckCircle checked={enabled.has(filter.id)} />
            </button>
          ))}
        </div>
      </div>

      <div className="mf-bottom">
        <button className="mf-view-btn" onClick={onGoBack}>
          View Map
        </button>
      </div>
    </div>
  );
}
