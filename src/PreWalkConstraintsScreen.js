import React, { useState, useRef, useEffect, useCallback } from "react";
import "./PreWalkConstraintsScreen.css";

const DESTINATION_OPTIONS = ["Return to start", "Open-ended", "End somewhere specific"];
const DURATION_OPTIONS = ["15 min", "30 min", "60 min", "120 min", "Open-ended"];
const ACCESSIBILITY_OPTIONS = ["Wheelchair", "Stroller", "Hard of hearing", "Vision impaired"];
const AVOIDANCE_OPTIONS = [
  "Busy roads", "Big crowds", "Construction", "Touristy spots",
  "Bars & nightlife", "Places I've already explored", "Hilly terrain",
];

function ChevronIcon({ expanded }) {
  return (
    <svg
      className={`pwc-chevron ${expanded ? "pwc-chevron--up" : ""}`}
      width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="#5A4B64" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CardIcon({ type }) {
  const props = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "#3B1F6E", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

  switch (type) {
    case "destination":
      return <svg {...props}><path d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7z" fill="none" /><circle cx="12" cy="9" r="2.5" /></svg>;
    case "duration":
      return <svg {...props}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
    case "distance":
      return <svg {...props}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>;
    case "accessibility":
      return <svg {...props}><circle cx="12" cy="4" r="2" /><path d="M12 6v6" /><path d="M8 18l4-6 4 6" /><path d="M8 12h8" /></svg>;
    case "avoidances":
      return <svg {...props}><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>;
    default:
      return null;
  }
}

export default function PreWalkConstraintsScreen({ onGoBack, onStartWalk }) {
  const [expandedCard, setExpandedCard] = useState("destination");
  const [destination, setDestination] = useState("Return to start");
  const [destSearch, setDestSearch] = useState("");
  const [destChosen, setDestChosen] = useState("");
  const [duration, setDuration] = useState(null);
  const [customDuration, setCustomDuration] = useState("");
  const [distance, setDistance] = useState(0);
  const [distanceInput, setDistanceInput] = useState("");
  const [accessibility, setAccessibility] = useState(new Set());
  const [avoidances, setAvoidances] = useState(new Set());
  const [showDropdown, setShowDropdown] = useState(false);
  const [durationError, setDurationError] = useState(false);
  const [distanceError, setDistanceError] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const searchRef = useRef(null);
  const searchTimer = useRef(null);

  // Live place search via Nominatim
  const searchPlaces = useCallback(async (query) => {
    if (!query || query.length < 2) { setSearchResults([]); return; }
    try {
      const encoded = encodeURIComponent(query);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=5`,
        { headers: { "User-Agent": "StrolloApp/1.0" } }
      );
      const data = await res.json();
      setSearchResults(data.map((r) => r.display_name.split(",").slice(0, 2).join(",")));
    } catch {
      setSearchResults([]);
    }
  }, []);

  useEffect(() => {
    if (destSearch.length > 0 && destination === "End somewhere specific") {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, [destSearch, destination]);

  // Clean up searchTimer on unmount
  useEffect(() => { return () => clearTimeout(searchTimer.current); }, []);

  const toggle = (card) => setExpandedCard((prev) => (prev === card ? null : card));

  const toggleSet = (_set, setter, val) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  };

  const handleDistanceSlider = (e) => {
    const v = parseFloat(e.target.value);
    setDistance(v);
    setDistanceInput(v > 0 ? v.toFixed(1) : "");
  };

  const handleDistanceInput = (e) => {
    const raw = e.target.value;
    setDistanceInput(raw);
    if (raw === "") { setDistance(0); setDistanceError(false); return; }
    const isNum = /^\d*\.?\d*$/.test(raw);
    setDistanceError(!isNum);
    if (isNum) {
      const v = parseFloat(raw);
      if (!isNaN(v) && v >= 0 && v <= 10) setDistance(v);
    }
  };

  const clearDistance = () => {
    setDistance(0);
    setDistanceInput("");
    setDistanceError(false);
  };

  const captionFor = (card) => {
    switch (card) {
      case "destination":
        if (destination === "End somewhere specific" && destChosen) return destChosen;
        return destination || "Not set";
      case "duration":
        if (customDuration) return customDuration;
        return duration || "Not set";
      case "distance":
        return distance > 0 ? `${distance.toFixed(1)} mi` : "Not set";
      case "accessibility":
        if (accessibility.size === 0) return "Not set";
        if (accessibility.size === 1) return [...accessibility][0];
        return `${accessibility.size} selected`;
      case "avoidances":
        if (avoidances.size === 0) return "Not set";
        return `${avoidances.size} selected`;
      default:
        return "Not set";
    }
  };

  const filteredPlaces = searchResults;

  const cards = [
    { id: "destination", label: "Destination", fullWidth: true },
    { id: "duration", label: "Duration", fullWidth: false },
    { id: "distance", label: "Distance", fullWidth: false },
    { id: "accessibility", label: "Accessibility", fullWidth: false },
    { id: "avoidances", label: "Avoidances", fullWidth: false },
  ];

  const renderCardContent = (id) => {
    switch (id) {
      case "destination":
        return (
          <div className="pwc-card-body">
            <div className="pwc-chips pwc-chips--wrap">
              {DESTINATION_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`pwc-chip ${destination === opt ? "pwc-chip--active" : ""}`}
                  onClick={() => { setDestination(opt); if (opt !== "End somewhere specific") { setDestSearch(""); setDestChosen(""); } }}
                >
                  {opt}
                </button>
              ))}
            </div>
            {destination === "End somewhere specific" && (
              <div className="pwc-search-wrapper" ref={searchRef}>
                <div className="pwc-search-input-row">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5A4B64" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    className="pwc-search-input"
                    placeholder="Search for a place or address"
                    value={destSearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDestSearch(val);
                      setShowDropdown(true);
                      clearTimeout(searchTimer.current);
                      searchTimer.current = setTimeout(() => searchPlaces(val), 300);
                    }}
                    onFocus={() => destSearch.length > 0 && setShowDropdown(true)}
                  />
                </div>
                {showDropdown && filteredPlaces.length > 0 && (
                  <div className="pwc-dropdown">
                    {filteredPlaces.map((place) => (
                      <button
                        key={place}
                        className="pwc-dropdown-item"
                        onClick={() => { setDestSearch(place); setDestChosen(place); setShowDropdown(false); }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="#8851D4">
                          <path d="M12 2C8 2 5 5 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-4-3-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
                        </svg>
                        <span>{place}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case "duration":
        return (
          <div className="pwc-card-body">
            <div className="pwc-chips pwc-chips--wrap">
              {DURATION_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`pwc-chip ${duration === opt && !customDuration ? "pwc-chip--active" : ""}`}
                  onClick={() => { setDuration(duration === opt ? null : opt); setCustomDuration(""); }}
                >
                  {opt}
                </button>
              ))}
            </div>
            <div className="pwc-distance-input-row" style={{ marginTop: 12 }}>
              <input
                type="text"
                className="pwc-distance-input"
                placeholder="Enter custom duration (e.g. 45 min)"
                value={customDuration}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomDuration(val);
                  if (val === "") { setDurationError(false); return; }
                  const isNum = /^\d*\.?\d*$/.test(val);
                  setDurationError(!isNum);
                  if (isNum) setDuration(null);
                }}
              />
              {customDuration && (
                <button className="pwc-clear-btn" onClick={() => { setCustomDuration(""); setDurationError(false); }}>Clear</button>
              )}
            </div>
            {durationError && (
              <div className="pwc-input-error">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4513B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                <span>Please enter a number</span>
              </div>
            )}
          </div>
        );

      case "distance":
        return (
          <div className="pwc-card-body">
            <div className="pwc-slider-wrapper">
              <input
                type="range" min="0" max="10" step="0.1"
                value={distance}
                onChange={handleDistanceSlider}
                className="pwc-slider"
                style={{ background: `linear-gradient(to right, #8851D4 ${distance * 10}%, #E8E4E6 ${distance * 10}%)` }}
              />
              <div className="pwc-slider-labels">
                <span>just around the block</span>
                <span>I could walk forever</span>
              </div>
            </div>
            <div className="pwc-distance-readout">
              {distance > 0 ? `${distance.toFixed(1)} mi (${(distance * 1.60934).toFixed(1)} km)` : "0 mi"}
            </div>
            <div className="pwc-distance-input-row">
              <input
                type="text"
                className="pwc-distance-input"
                placeholder="Enter distance in miles"
                value={distanceInput}
                onChange={handleDistanceInput}
              />
              {distance > 0 && (
                <button className="pwc-clear-btn" onClick={clearDistance}>Clear</button>
              )}
            </div>
            {distanceError && (
              <div className="pwc-input-error">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4513B" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                <span>Please enter a number</span>
              </div>
            )}
          </div>
        );

      case "accessibility":
        return (
          <div className="pwc-card-body">
            <div className="pwc-chips pwc-chips--wrap">
              {ACCESSIBILITY_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`pwc-chip ${accessibility.has(opt) ? "pwc-chip--active" : ""}`}
                  onClick={() => toggleSet(accessibility, setAccessibility, opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );

      case "avoidances":
        return (
          <div className="pwc-card-body">
            <div className="pwc-chips pwc-chips--wrap">
              {AVOIDANCE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  className={`pwc-chip ${avoidances.has(opt) ? "pwc-chip--active" : ""}`}
                  onClick={() => toggleSet(avoidances, setAvoidances, opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };


  return (
    <div className="pwc-screen">
      <div className="pwc-header">
        <button className="pwc-close" onClick={onGoBack} aria-label="Close">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34233E" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <span className="pwc-title">Plan your walk</span>
      </div>

      <div className="pwc-scroll">
        {expandedCard && (() => {
          const card = cards.find((c) => c.id === expandedCard);
          return (
            <div className="pwc-card pwc-card--expanded pwc-card--full pwc-expanded-top">
              <button className="pwc-card-header" onClick={() => toggle(card.id)}>
                <div className="pwc-card-left">
                  <CardIcon type={card.id} />
                  <div className="pwc-card-label">{card.label}</div>
                  <div className="pwc-card-caption">{captionFor(card.id)}</div>
                </div>
                <ChevronIcon expanded={true} />
              </button>
              {renderCardContent(card.id)}
            </div>
          );
        })()}
        <div className="pwc-grid">
          {cards.filter((c) => c.id !== expandedCard).map((card) => (
            <div key={card.id} className="pwc-card">
              <button className="pwc-card-header" onClick={() => toggle(card.id)}>
                <div className="pwc-card-left">
                  <CardIcon type={card.id} />
                  <div className="pwc-card-label">{card.label}</div>
                  <div className="pwc-card-caption">{captionFor(card.id)}</div>
                </div>
                <ChevronIcon expanded={false} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="pwc-bottom">
        <p className="pwc-hint">You can always adjust during your walk</p>
        <button className="pwc-start-btn" onClick={() => onStartWalk?.([], {
          destination,
          destChosen: destChosen || null,
          duration: duration || null,
          customDuration: customDuration || null,
          distance: distance || null,
          accessibility: [...accessibility],
          avoidances: [...avoidances],
        })}>
          Save Preferences
        </button>
      </div>
    </div>
  );
}
