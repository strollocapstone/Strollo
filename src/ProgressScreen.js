// FEATURE: progress
// LAST UPDATED BY: Seemin Masood
// UPDATE DATE: 2026-05-07
// BUILD: 25225b52
// DEPENDS ON: ./RewardScreen (getStopCollectible, getStopTint)
// CONSUMED BY: ./App.js
//
// Per-category exploration progress. Reads the user's confirmed + visited
// stops out of journeyItems / visitedIds, classifies each into a reward
// category, then surfaces the top categories with the actual collectibles
// they've earned (the same 3D SVG illustrations the trail uses) so the user
// can see at a glance what they've collected — and a friendly nudge for
// categories they're under-explored in.

import React, { useMemo, useState } from "react";
import { getStopCollectible, getStopTint } from "./RewardScreen";
import "./ProgressScreen.css";

// Category catalogue — first regex match wins. Each row also defines a
// short encouraging nudge for when the count is low (the user is
// under-explored in this kind of place).
// Order matters — when category counts tie, this list's order is the
// secondary sort key (so Books out-ranks Bakery on a 1-1 tie, etc.).
const CATEGORIES = [
  { id: "food",      label: "Food",       icon: "restaurant",    color: "#D85C5C", test: /restaurant|food|eatery|diner|bistro|trattoria|grill|kitchen|pizza|burger|sushi|ramen|thai|mexican|italian|chinese|indian|seafood|steak|taqueria|noodle|deli/, nudge: "Hungry? Try one next walk." },
  { id: "coffee",    label: "Coffee",     icon: "coffee",        color: "#8B5E3C", test: /coffee|cafe|café|espresso|roaster|brew bar/,                                                                                                                       nudge: "Always time for one more coffee stop." },
  { id: "parks",     label: "Parks",      icon: "park",          color: "#5C9F66", test: /park|garden|plaza|square|trail|greenway/,                                                                                                                         nudge: "Find a green corner to slow down in." },
  { id: "books",     label: "Books",      icon: "menu_book",     color: "#5276A8", test: /book|library|bookshop|bookstore/,                                                                                                                                nudge: "Browse a bookshop on your way." },
  { id: "art",       label: "Art",        icon: "palette",       color: "#E8884A", test: /art|studio|craft|pottery|maker|workshop|museum|gallery|exhibit|exhibition/,                                                                                      nudge: "Wander into a gallery or museum next." },
  { id: "bakery",    label: "Bakery",     icon: "bakery_dining", color: "#C49056", test: /bakery|patisserie|pastry|donut|doughnut|croissant|cake/,                                                                                                          nudge: "A pastry detour next time?" },
  { id: "icecream",  label: "Ice cream",  icon: "icecream",      color: "#EF8FB1", test: /ice cream|gelato|sorbet|frozen yogurt|froyo|creamery/,                                                                                                            nudge: "Keep an eye out for a cone." },
  { id: "bar",       label: "Bars",       icon: "local_bar",     color: "#D9962E", test: /bar|pub|brewery|brewhouse|tap room|tavern|cocktail|wine bar|lounge|nightclub/,                                                                                    nudge: "A nightcap could round out the walk." },
  { id: "music",     label: "Music",      icon: "music_note",    color: "#C45A8A", test: /music|record|vinyl|concert|venue|theatre|theater|opera|symphony/,                                                                                                  nudge: "Catch some live notes next time." },
  { id: "shoes",     label: "Shoes",      icon: "footprint",     color: "#5A4632", test: /shoe|sneaker|footwear|boot/,                                                                                                                                     nudge: "Treat your feet to a quick browse." },
  { id: "bags",      label: "Bags",       icon: "shopping_bag",  color: "#A87A4F", test: /bag|leather goods|handbag|luggage|backpack/,                                                                                                                     nudge: "Window-shop a bag boutique." },
  { id: "fashion",   label: "Fashion",    icon: "checkroom",     color: "#D85C9E", test: /clothing|apparel|boutique|fashion|vintage clothing|thrift/,                                                                                                      nudge: "Pop into a boutique you've never tried." },
  { id: "shops",     label: "Shops",      icon: "storefront",    color: "#3B7DBD", test: /shop|store|market|grocery|boutique/,                                                                                                                              nudge: "A new neighbourhood shop awaits." },
  { id: "sights",    label: "Sights",     icon: "photo_camera",  color: "#5C9FAF", test: /viewpoint|attraction|monument|landmark|tower|bridge|overlook|scenic/,                                                                                              nudge: "There's always a view worth chasing." },
];

const FALLBACK = { id: "other", label: "Other", icon: "explore", color: "#8B6E96", nudge: "Try somewhere new on your next walk." };

const TOP_N = 5;

// Mock journey used as a stand-in when the user has no real visited stops
// yet — gives the screen something to render so the layout, collectibles,
// and category nudges can be previewed end-to-end. Spread across enough
// categories that the top-6 / "see all" UX is visible. Each `desc` is
// crafted so the food classifier can pick a specific food collectible.
// Each entry carries a `neighborhood` (shown in the detail card's "Where"),
// `daysAgo` + `at` ("HH:MM" 24h) for a deterministic timestamp, and `dwellMin`
// so the detail card surfaces realistic where/when/time-spent without
// requiring a real walk. Times are spread across a couple of weeks so the
// "When" field shows a mix of "Today at …", "Yesterday", and dated entries.
const MOCK_PROGRESS_STOPS = [
  { id: "mock-1",  name: "Sightglass Coffee",        desc: "Coffee Shop",        neighborhood: "SoMa, San Francisco",         daysAgo: 0,  at: "09:42", dwellMin: 22 },
  { id: "mock-2",  name: "Blue Bottle Coffee",       desc: "Coffee Shop",        neighborhood: "Hayes Valley, San Francisco", daysAgo: 2,  at: "10:15", dwellMin: 14 },
  { id: "mock-3",  name: "Ritual Coffee Roasters",   desc: "Coffee Shop",        neighborhood: "Mission, San Francisco",      daysAgo: 5,  at: "08:55", dwellMin: 18 },
  { id: "mock-4",  name: "Four Barrel Coffee",       desc: "Coffee Shop",        neighborhood: "Mission, San Francisco",      daysAgo: 7,  at: "11:20", dwellMin: 26 },
  { id: "mock-5",  name: "Andytown Coffee",          desc: "Coffee Shop",        neighborhood: "Outer Sunset, San Francisco", daysAgo: 10, at: "10:05", dwellMin: 31 },
  { id: "mock-6",  name: "Mensho Tokyo Ramen",       desc: "Ramen Restaurant",   neighborhood: "Tenderloin, San Francisco",   daysAgo: 1,  at: "19:30", dwellMin: 48 },
  { id: "mock-7",  name: "Akiko's Sushi Bar",        desc: "Sushi Restaurant",   neighborhood: "Union Square, San Francisco", daysAgo: 4,  at: "20:10", dwellMin: 65 },
  { id: "mock-8",  name: "Tony's Pizza Napoletana",  desc: "Pizza Restaurant",   neighborhood: "North Beach, San Francisco",  daysAgo: 9,  at: "18:45", dwellMin: 52 },
  { id: "mock-9",  name: "Tartine Bakery",           desc: "Bakery",             neighborhood: "Mission, San Francisco",      daysAgo: 0,  at: "11:18", dwellMin: 17 },
  { id: "mock-10", name: "Bi-Rite Creamery",         desc: "Ice Cream",          neighborhood: "Mission, San Francisco",      daysAgo: 3,  at: "15:55", dwellMin: 12 },
  { id: "mock-11", name: "Golden Gate Park",         desc: "Park",               neighborhood: "Richmond, San Francisco",     daysAgo: 1,  at: "14:25", dwellMin: 84 },
  { id: "mock-12", name: "Dolores Park",             desc: "Park",               neighborhood: "Mission, San Francisco",      daysAgo: 6,  at: "16:40", dwellMin: 55 },
  { id: "mock-13", name: "Salesforce Park",          desc: "Park",               neighborhood: "SoMa, San Francisco",         daysAgo: 0,  at: "12:50", dwellMin: 28 },
  { id: "mock-14", name: "Buena Vista Park",         desc: "Park",               neighborhood: "Haight, San Francisco",       daysAgo: 8,  at: "10:30", dwellMin: 41 },
  { id: "mock-15", name: "City Lights Books",        desc: "Bookshop",           neighborhood: "North Beach, San Francisco",  daysAgo: 2,  at: "13:15", dwellMin: 33 },
  { id: "mock-16", name: "SFMOMA",                   desc: "Museum",             neighborhood: "SoMa, San Francisco",         daysAgo: 12, at: "14:00", dwellMin: 92 },
];

function classify(stop) {
  const text = `${stop.name || ""} ${stop.desc || stop.category || ""}`.toLowerCase();
  for (const c of CATEGORIES) {
    if (c.test.test(text)) return c.id;
  }
  return FALLBACK.id;
}

// Friendly "today at 3:42 PM" / "May 7 at 3:42 PM" for the collectible detail
// card. Falls back to a soft placeholder when we never recorded a timestamp
// (e.g. preview/mock journeys).
function formatVisitedAt(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `Today at ${time}`;
  const date = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${date} at ${time}`;
}

function formatDwellMs(ms) {
  if (!ms || ms < 30000) return null; // <30s reads as noise; hide it
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "Less than a minute";
  if (mins === 1) return "1 minute";
  if (mins < 60) return `${mins} minutes`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs}h` : `${hrs}h ${rem}m`;
}

export default function ProgressScreen({
  journeyItems = [],
  visitedIds,
  visitedAt,
  stopDwellMs,
  onGoBack,
  onPlanAnother,
}) {
  const [showAll, setShowAll] = useState(false);
  // When the user taps a collectible, surface the stop's where/when/how-long
  // in a centered modal. `null` = closed.
  const [selectedStop, setSelectedStop] = useState(null);
  const visitedSet = visitedIds instanceof Set
    ? visitedIds
    : new Set(visitedIds || []);
  const arrivalMap = visitedAt instanceof Map
    ? visitedAt
    : new Map(Object.entries(visitedAt || {}));
  const dwellMap = stopDwellMs instanceof Map
    ? stopDwellMs
    : new Map(Object.entries(stopDwellMs || {}));

  const realVisited = useMemo(
    () => journeyItems.filter((s) => visitedSet.has(s.id)),
    [journeyItems, visitedSet]
  );
  // No real walk yet → render a preview built from MOCK_PROGRESS_STOPS so
  // the screen always has something to demonstrate.
  const usingMock = realVisited.length === 0;
  const visitedStops = usingMock ? MOCK_PROGRESS_STOPS : realVisited;

  // Mock arrival/dwell so the collectible-detail modal shows realistic
  // where/when/time-spent in the preview state. Anchored to a stable
  // "now" the first time the screen mounts so the dates don't shift while
  // the user is browsing.
  const mockMaps = useMemo(() => {
    const arrivals = new Map();
    const dwells = new Map();
    const now = new Date();
    for (const s of MOCK_PROGRESS_STOPS) {
      const d = new Date(now);
      d.setDate(d.getDate() - (s.daysAgo || 0));
      const [hh, mm] = (s.at || "12:00").split(":").map(Number);
      d.setHours(hh, mm, 0, 0);
      arrivals.set(s.id, d.getTime());
      dwells.set(s.id, (s.dwellMin || 0) * 60 * 1000);
    }
    return { arrivals, dwells };
  }, []);
  const effectiveArrivals = usingMock ? mockMaps.arrivals : arrivalMap;
  const effectiveDwell = usingMock ? mockMaps.dwells : dwellMap;

  // Group visited stops by category id so each row can show the actual
  // collectibles the user collected in that category.
  const stopsByCategory = useMemo(() => {
    const map = new Map();
    for (const s of visitedStops) {
      const id = classify(s);
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(s);
    }
    return map;
  }, [visitedStops]);

  // Build the full row list — every catalogued category, plus the fallback
  // bucket if it has any. Sorted by count desc, with ties broken by the
  // category's position in CATEGORIES so the curated priority order
  // (Books before Bakery, Bakery before Ice cream, …) wins on ties.
  const allRows = useMemo(() => {
    const orderById = new Map(CATEGORIES.map((c, i) => [c.id, i]));
    orderById.set(FALLBACK.id, CATEGORIES.length);
    const list = CATEGORIES.map((c) => ({
      ...c,
      stops: stopsByCategory.get(c.id) || [],
    }));
    const otherStops = stopsByCategory.get(FALLBACK.id) || [];
    if (otherStops.length > 0) {
      list.push({ ...FALLBACK, stops: otherStops });
    }
    list.sort(
      (a, b) =>
        (b.stops.length - a.stops.length) ||
        (orderById.get(a.id) - orderById.get(b.id))
    );
    return list;
  }, [stopsByCategory]);

  const visibleRows = showAll ? allRows : allRows.slice(0, TOP_N);
  // The reference for what counts as "low" is the leader of the visible
  // section. Anything below half (or zero) gets the encouraging nudge.
  const visibleMax = visibleRows.length > 0 ? visibleRows[0].stops.length : 0;
  const isLow = (count) => visibleMax === 0 ? true : count <= Math.max(1, Math.floor(visibleMax / 2));

  const totalCollected = visitedStops.length;
  const exploredCount = allRows.filter((r) => r.stops.length > 0).length;
  const totalCategories = CATEGORIES.length;

  return (
    <div className="progress-screen">
      <div className="progress-bg-frost" />
      <div className="progress-scroll">
        <header className="progress-header">
          <h1 className="progress-title">Your exploration collection so far</h1>
          <p className="progress-subtitle">
            {totalCollected === 0
              ? "Every new spot fills your map. Explore a spot in any category and your collection grows from here."
              : `${totalCollected} treasure${totalCollected === 1 ? "" : "s"} and counting — the more you explore, the richer your collection gets.`}
          </p>
        </header>

        <section className="progress-categories" aria-label="Reward categories">
          {visibleRows.map((r) => {
            const lo = isLow(r.stops.length);
            return (
              <article
                key={r.id}
                className={`progress-category${r.stops.length === 0 ? " progress-category--empty" : ""}`}
              >
                <div className="progress-category-head">
                  <span
                    className="material-symbols-rounded progress-category-icon"
                    aria-hidden="true"
                  >
                    {r.icon}
                  </span>
                  <span className="progress-category-label">{r.label}</span>
                  <span
                    className="progress-category-count"
                    aria-label={`${r.stops.length} treasure${r.stops.length === 1 ? "" : "s"}`}
                  >
                    {r.stops.length}
                  </span>
                </div>
                {r.stops.length > 0 ? (
                  <div
                    className="progress-collectibles"
                    aria-hidden="true"
                    onWheel={(e) => {
                      // Convert vertical wheel to horizontal scroll so a
                      // trackpad / mouse-wheel can browse the overflow row
                      // without leaving the screen.
                      if (e.deltaY !== 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) {
                        e.currentTarget.scrollLeft += e.deltaY;
                      }
                    }}
                  >
                    {r.stops.map((s) => (
                      <button
                        type="button"
                        className="progress-collectible"
                        key={s.id}
                        style={{ background: getStopTint(s) }}
                        onClick={() => setSelectedStop(s)}
                        aria-label={`See details for ${s.name}`}
                      >
                        {getStopCollectible(s)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="progress-collectibles progress-collectibles--empty" aria-hidden="true">
                    <span
                      className="progress-collectible progress-collectible--ghost"
                      style={{ borderColor: `${r.color}55` }}
                    >
                      <span
                        className="material-symbols-rounded"
                        style={{ color: r.color }}
                        aria-hidden="true"
                      >
                        {r.icon}
                      </span>
                    </span>
                  </div>
                )}
                {lo && (
                  <p className="progress-category-nudge">
                    {r.stops.length === 0
                      ? `${r.nudge} ✨`
                      : `${r.nudge}`}
                  </p>
                )}
              </article>
            );
          })}
        </section>

        {allRows.length > TOP_N && (
          <button
            type="button"
            className="progress-see-all"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show top 5 only" : "See all"}
          </button>
        )}
      </div>

      {selectedStop && (
        <div
          className="progress-detail-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedStop.name} details`}
          onClick={() => setSelectedStop(null)}
        >
          <div
            className="progress-detail-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="progress-detail-close"
              onClick={() => setSelectedStop(null)}
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <span
              className="progress-detail-art"
              style={{ background: getStopTint(selectedStop) }}
              aria-hidden="true"
            >
              {getStopCollectible(selectedStop)}
            </span>
            <h2 className="progress-detail-name">{selectedStop.name}</h2>
            {selectedStop.desc && (
              <p className="progress-detail-kind">{selectedStop.desc}</p>
            )}
            <dl className="progress-detail-meta">
              {(() => {
                const when = formatVisitedAt(effectiveArrivals.get(selectedStop.id));
                const dwell = formatDwellMs(effectiveDwell.get(selectedStop.id));
                const where = selectedStop.neighborhood || selectedStop.desc || "On your route";
                return (
                  <>
                    <div className="progress-detail-row">
                      <dt>Where</dt>
                      <dd>{where}</dd>
                    </div>
                    <div className="progress-detail-row">
                      <dt>When</dt>
                      <dd>{when || "Sometime on this trip"}</dd>
                    </div>
                    <div className="progress-detail-row">
                      <dt>Time spent</dt>
                      <dd>{dwell || "A quick stop"}</dd>
                    </div>
                  </>
                );
              })()}
            </dl>
          </div>
        </div>
      )}

      {/* Bottom action bar — same vocabulary as the Reward screen so the
          two surfaces feel like one family. */}
      <div className="progress-actions">
        <button
          type="button"
          className="progress-share-btn"
          onClick={onPlanAnother || onGoBack}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6"/>
            <line x1="8" y1="3" x2="8" y2="18"/>
            <line x1="16" y1="6" x2="16" y2="21"/>
          </svg>
          <span>Plan another exploration</span>
        </button>
        <button
          type="button"
          className="progress-undo-pill"
          onClick={onGoBack}
        >
          <span>Back to my progress today</span>
        </button>
      </div>
    </div>
  );
}
