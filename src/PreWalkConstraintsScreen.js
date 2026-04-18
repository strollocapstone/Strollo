import React, { useState, useRef, useEffect, useCallback } from "react";
import "./PreWalkConstraintsScreen.css";

const DESTINATION_OPTIONS = [
  { id: "loop", label: "End where I began", subtext: "Start and end in the same spot" },
  { id: "open", label: "See where I end up", subtext: "Open exploration" },
  { id: "specific", label: "Walk me somewhere", subtext: "End at a place or neighborhood" },
];
const DURATION_OPTIONS = ["15 min", "30 min", "60 min", "120 min", "No time limit"];
const ACCESSIBILITY_OPTIONS = ["Wheelchair", "Stroller", "Hard of hearing", "Vision impaired"];
const AVOIDANCE_OPTIONS = [
  "Busy roads", "Big crowds", "Construction", "Touristy spots",
  "Bars & nightlife", "Hilly terrain", "Places I've already explored",
];

const MAP_FILTERS = [
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
    case "showOnMap":
      return <svg {...props}><polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6" /><line x1="8" y1="3" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="21" /></svg>;
    default:
      return null;
  }
}

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
      <div className="pwc-check pwc-check--on">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }
  return <div className="pwc-check pwc-check--off" />;
}

export default function PreWalkConstraintsScreen({ onGoBack, onStartWalk, embedded }) {
  const [expandedCards, setExpandedCards] = useState(new Set(["destination"]));
  const [destination, setDestination] = useState(null);
  const [destSearch, setDestSearch] = useState("");
  const [destChosen, setDestChosen] = useState("");
  const [duration, setDuration] = useState(null);
  const [customDuration, setCustomDuration] = useState("");
  const [distance, setDistance] = useState(0);
  const [distanceInput, setDistanceInput] = useState("");
  const [accessibility, setAccessibility] = useState(new Set());
  const [avoidances, setAvoidances] = useState(new Set());
  const [mapFilters, setMapFilters] = useState(
    () => new Set(MAP_FILTERS.filter((f) => f.defaultOn).map((f) => f.id))
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [durationError, setDurationError] = useState(false);
  const [distanceError, setDistanceError] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const searchRef = useRef(null);
  const searchTimer = useRef(null);

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

  useEffect(() => () => clearTimeout(searchTimer.current), []);

  useEffect(() => {
    if (destSearch.length > 0 && destination === "specific") {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, [destSearch, destination]);

  const toggle = (card) => setExpandedCards((prev) => {
    const next = new Set(prev);
    if (next.has(card)) next.delete(card);
    else next.add(card);
    return next;
  });

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
      case "destination": {
        if (destination === "specific" && destChosen) return destChosen;
        const opt = DESTINATION_OPTIONS.find((o) => o.id === destination);
        return opt?.label || "Not set";
      }
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
      case "showOnMap":
        if (mapFilters.size === 0) return "Not set";
        return `${mapFilters.size} selected`;
      default:
        return "Not set";
    }
  };

  const filteredPlaces = searchResults;

  const cards = [
    { id: "destination", label: "Type of walk" },
    { id: "duration", label: "Duration" },
    { id: "distance", label: "Distance" },
    { id: "accessibility", label: "Accessibility" },
    { id: "avoidances", label: "Avoidances" },
    { id: "showOnMap", label: "Show on Map" },
  ];

  const renderCardContent = (id) => {
    switch (id) {
      case "destination":
        return (
          <div className="pwc-card-body">
            <div className="pwc-radio-group">
              {DESTINATION_OPTIONS.map((opt) => {
                const selected = destination === opt.id;
                return (
                  <button
                    key={opt.id}
                    className={`pwc-radio-row ${selected ? "pwc-radio-row--selected" : ""}`}
                    onClick={() => { setDestination(opt.id); if (opt.id !== "specific") { setDestSearch(""); setDestChosen(""); } }}
                    role="radio"
                    aria-checked={selected}
                  >
                    <span className={`pwc-radio-circle ${selected ? "pwc-radio-circle--selected" : ""}`} />
                    <span className="pwc-radio-text">
                      <span className="pwc-radio-label">{opt.label}</span>
                      <span className="pwc-radio-sub">{opt.subtext}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {destination === "specific" && (
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

      case "showOnMap":
        return (
          <div className="pwc-card-body pwc-card-body--flush">
            <div className="pwc-filter-list">
              {MAP_FILTERS.map((filter, i) => (
                <button
                  key={filter.id}
                  className={`pwc-filter-row ${i === MAP_FILTERS.length - 1 ? "pwc-filter-row--last" : ""}`}
                  onClick={() => toggleSet(mapFilters, setMapFilters, filter.id)}
                >
                  <div className="pwc-filter-icon"><FilterIcon id={filter.id} /></div>
                  <span className="pwc-filter-label">{filter.label}</span>
                  <CheckCircle checked={mapFilters.has(filter.id)} />
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
    <div className={`pwc-screen${embedded ? " pwc-screen--embedded" : ""}`}>
      {!embedded && (
        <div className="pwc-header">
          <button className="pwc-close" onClick={onGoBack} aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34233E" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <span className="pwc-title">Plan your walk</span>
        </div>
      )}

      <div className="pwc-scroll">
        <div className="pwc-list">
          {cards.map((card) => {
            const isOpen = expandedCards.has(card.id);
            return (
              <div key={card.id} className="pwc-card">
                <button className="pwc-card-header" onClick={() => toggle(card.id)}>
                  <div className="pwc-card-left">
                    <CardIcon type={card.id} />
                    <div className="pwc-card-label">{card.label}</div>
                  </div>
                  <div className="pwc-card-value">{captionFor(card.id)}</div>
                  <ChevronIcon expanded={isOpen} />
                </button>
                {isOpen && renderCardContent(card.id)}
              </div>
            );
          })}
        </div>
      </div>

      {!embedded && (
        <div className="pwc-bottom">
          <p className="pwc-hint">You can always adjust during your walk</p>
          <button className="pwc-start-btn" onClick={() => onStartWalk?.([])}>
            Save Preferences
          </button>
        </div>
      )}
    </div>
  );
}
