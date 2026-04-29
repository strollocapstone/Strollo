// FEATURE: reward
// LAST UPDATED BY: Eric Tsai
// UPDATE DATE: 2026-04-28
// BUILD: f718df0
// DEPENDS ON: leaf
// CONSUMED BY: ./App.js
//
// Post-walk reflection screen. Renders distance/duration stats, per-stop
// linger time (computed from `visitedAt` and `stopDwellMs` Maps that App.js
// owns), and the empty-state copy when the user ended without confirming any
// stops. PHASE 6 of the refactor splits this into a folder with StatsBlock /
// StopList / EmptyState components and pulls the linger-time math into
// `walkStats.js` so it's testable without React.

// Reward Screen — post-walk reflection.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./RewardScreen.css";
import { fetchNearbyPlaces } from "./geminiService";

// Fallback shown if no live walk data is supplied (e.g. previewing the screen).
const MOCK_WALK = {
  distanceMiles: 1.5,
  screenChecks: 2,
  totalMins: 42,
  immersedMins: 31,
  stops: [
    { id: 1, name: "Sightglass Coffee",          category: "Coffee Shop", vibe: "coffee",     immersedMins: 12, totalMins: 14, lingerMins: 14 },
    { id: 2, name: "Golden Gate Park",           category: "Park",        vibe: "park",       immersedMins: 15, totalMins: 20, lingerMins: 20 },
    { id: 3, name: "City Lights Books",          category: "Bookshop",    vibe: "bookshop",   immersedMins: 3,  totalMins: 5,  lingerMins: 5  },
    { id: 4, name: "Ferry Building Marketplace", category: "Market",      vibe: "market",     immersedMins: 1,  totalMins: 3,  lingerMins: 3  },
  ],
};

// Map an OSM-style category string (set by fetchNearbyPlaces) to a vibe key
// the screen has artwork + tints + hero imagery for.
//
// Order matters — vibeFor() iterates this object in declaration order and
// returns on first match. Place more specific cuisines (seafood, sushi)
// BEFORE the catch-all "restaurant" so a "Seafood Restaurant" or a place
// named "Lake Chalet" gets a seafood reward instead of a generic burger.
const VIBE_BY_CATEGORY = {
  coffee:     ["coffee", "cafe", "bakery", "ice cream"],
  bookshop:   ["bookstore", "library", "books"],
  park:       ["park", "garden", "viewpoint"],
  historic:   ["museum", "gallery", "art", "arts", "attraction", "theatre"],
  seafood:    ["seafood", "fish", "oyster", "crab", "lobster", "sushi", "poke", "chalet", "lake", "bay", "ocean", "harbor"],
  /* Burger is checked BEFORE the generic restaurant catch so a place
     actually named "Burger Joint" / "Diner" gets the burger reward.
     Everything else (Ethiopian, Italian, Thai, …) lands on the universal
     steaming-dish "restaurant" reward. */
  burger:     ["burger", "diner", "smashburger", "shake shack", "in-n-out"],
  restaurant: ["restaurant", "pizza", "bistro", "trattoria", "taqueria", "grill", "kitchen"],
  bar:        ["bar", "pub", "nightclub", "wine"],
  market:     ["florist", "market", "deli", "grocer"],
  waterfront: ["pier", "harbour", "marina", "beach"],
  shop:       ["jewelry", "jeweler", "boutique", "shop", "store"],
};
function vibeFor(category, name) {
  const haystack = `${category || ""} ${name || ""}`.toLowerCase();
  for (const [vibe, words] of Object.entries(VIBE_BY_CATEGORY)) {
    if (words.some((w) => haystack.includes(w))) return vibe;
  }
  return "park"; // sensible default — has both artwork + tint
}

// Build the structure the screen expects from the actual walk state. We don't
// track per-stop linger/screen-check minutes yet, so distribute the total
// elapsed time across the visited stops, weighted slightly by category
// (parks/markets get more dwell, bookshops less).
const DWELL_WEIGHT = { park: 1.4, market: 1.2, restaurant: 1.3, burger: 1.2, seafood: 1.3, bar: 1.1, coffee: 1.0, historic: 1.0, bookshop: 0.7, waterfront: 1.1, shop: 0.9 };
function buildWalkData({ journeyItems, visitedIds, visitedAt, stopDwellMs, tripStartTime }) {
  if (!journeyItems?.length) return null;

  const visitedSet = visitedIds instanceof Set ? visitedIds : new Set(visitedIds || []);
  const arrivalMap = visitedAt instanceof Map ? visitedAt : new Map(Object.entries(visitedAt || {}));
  const dwellMap = stopDwellMs instanceof Map ? stopDwellMs : new Map(Object.entries(stopDwellMs || {}));

  // Show stops the user reached OR has recorded dwell time at; fall back to
  // all journey items if neither signal is available.
  const explored = journeyItems.filter((s) => visitedSet.has(s.id) || dwellMap.has(s.id));
  const source = explored.length ? explored : journeyItems;

  const now = Date.now();
  // Real elapsed minutes from the moment the user pressed Start exploring.
  // Falls back to "1 min" only when tripStartTime is unknown (legacy paths) —
  // never the MOCK_WALK's 42 min so the headline always reflects reality.
  const totalMins = tripStartTime
    ? Math.max(1, Math.round((now - tripStartTime) / 60000))
    : 1;

  // Per-stop time-spent, in priority order:
  //   1) Real-time dwell tracker (geolocation): exact ms accumulated while
  //      the user was inside the stop's ~50m geofence.
  //   2) Arrival timestamps (user tapped "I'm here"): time between this
  //      stop's tap and the next, or "now" for the last stop.
  //   3) Weighted estimate of total trip time, when neither signal exists.
  const haveDwell = source.some((s) => dwellMap.get(s.id));
  const arrivals = source.map((s) => arrivalMap.get(s.id) ?? null);
  const haveTimestamps = arrivals.some((a) => a !== null);

  let lingerByIndex;
  if (haveDwell) {
    lingerByIndex = source.map((s) => {
      const ms = dwellMap.get(s.id) || 0;
      return Math.max(0, Math.round(ms / 60000));
    });
  } else if (haveTimestamps) {
    lingerByIndex = source.map((s, i) => {
      const start = arrivals[i];
      if (start == null) return 0;
      let endMs = now;
      for (let j = i + 1; j < arrivals.length; j++) {
        if (arrivals[j] != null) { endMs = arrivals[j]; break; }
      }
      return Math.max(0, Math.round((endMs - start) / 60000));
    });
  } else {
    const transitMins = Math.min(totalMins - 1, source.length * 4);
    const dwellPool = Math.max(1, totalMins - transitMins);
    const weights = source.map((s) => DWELL_WEIGHT[vibeFor(s.desc, s.name)] ?? 1);
    const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
    lingerByIndex = source.map((_, i) => Math.max(1, Math.round((dwellPool * weights[i]) / weightSum)));
  }

  const stops = source.map((s, i) => {
    const vibe = vibeFor(s.desc, s.name);
    const lingerMins = lingerByIndex[i];
    return {
      id: s.id,
      name: s.name,
      // Carry coords through so the per-card "suggested similar spots"
      // fetch can search around the actual stop location.
      lat: s.lat,
      lng: s.lng,
      category: s.desc || "Place",
      vibe,
      immersedMins: Math.max(0, Math.round(lingerMins * 0.85)),
      totalMins: lingerMins + 4,
      lingerMins,
    };
  });

  const immersedMins = stops.reduce((acc, s) => acc + s.immersedMins, 0);
  const skipped = journeyItems.length - source.length;
  const screenChecks = Math.max(0, Math.min(8, skipped + (totalMins > 30 ? 1 : 0)));
  const distanceMiles = Math.round((totalMins / 60) * 3 * 10) / 10;

  return { distanceMiles, screenChecks, totalMins, immersedMins, stops };
}

const HERO_BG_IMAGES = {
  coffee:     "https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=720&h=1280&fit=crop&q=80",
  park:       "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=720&h=1280&fit=crop&q=80",
  bookshop:   "https://images.unsplash.com/photo-1526243741027-444d633d7365?w=720&h=1280&fit=crop&q=80",
  historic:   "https://images.unsplash.com/photo-1534081333815-ae5019106622?w=720&h=1280&fit=crop&q=80",
  restaurant: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=720&h=1280&fit=crop&q=80",
  burger:     "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=720&h=1280&fit=crop&q=80",
  seafood:    "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=720&h=1280&fit=crop&q=80",
  bar:        "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=720&h=1280&fit=crop&q=80",
  market:     "https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=720&h=1280&fit=crop&q=80",
  waterfront: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=720&h=1280&fit=crop&q=80",
  shop:       "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=720&h=1280&fit=crop&q=80",
};

const STOP_TINTS = {
  coffee:     "radial-gradient(circle at 30% 28%, #F7D8C6 0%, #E4A988 70%, #C77F5E 100%)",
  park:       "radial-gradient(circle at 30% 28%, #E4EECB 0%, #B6CE95 70%, #7FA266 100%)",
  bookshop:   "radial-gradient(circle at 30% 28%, #FFE76B 0%, #F2B400 70%, #B68300 100%)",
  historic:   "radial-gradient(circle at 30% 28%, #D8C4EE 0%, #A67FD5 70%, #7048B3 100%)",
  restaurant: "radial-gradient(circle at 30% 28%, #FFE5C2 0%, #FFAE5E 70%, #C46A1F 100%)",
  burger:     "radial-gradient(circle at 30% 28%, #FFE08F 0%, #E69A47 70%, #7A3F0E 100%)",
  seafood:    "radial-gradient(circle at 30% 28%, #CFEFFF 0%, #67B6E5 70%, #1F689F 100%)",
  bar:        "radial-gradient(circle at 30% 28%, #F4D2F2 0%, #C97AC0 70%, #7F3D88 100%)",
  market:     "radial-gradient(circle at 30% 28%, #FFCFB2 0%, #FF9A6B 70%, #C86440 100%)",
  waterfront: "radial-gradient(circle at 30% 28%, #D9F0F3 0%, #98C9CF 70%, #608E94 100%)",
  shop:       "radial-gradient(circle at 30% 28%, #E2F4FF 0%, #92C8E9 70%, #4F84B5 100%)",
};

// Subheaders keyed by *how long* the walk lasted, not the screen-check ratio.
// Shorter walks lean encouraging so users feel rewarded for any exploration.
// First sentence reflects effort/tone, second sentence is always about the
// treasures the user just collected.
const TONE_SUBHEADERS = {
  short:  "Every step counts. Here are treasures you collected along the way.",
  medium: "You're finding your rhythm. Here are treasures you picked up along the way.",
  long:   "You're a true wanderer. Here are treasures you brought home along the way.",
};
function getToneByDuration(totalMins) {
  // > 5 min walks earn the "true wanderer" treatment — a real exploration
  // outing rather than a quick stretch around the block.
  if (totalMins > 5) return "long";
  return "short";
}

const COLLECTIBLES = {
  coffee: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-coffee-body" x1="20%" y1="10%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#C8895A" />
          <stop offset="45%" stopColor="#8B5A2B" />
          <stop offset="100%" stopColor="#4A2C12" />
        </linearGradient>
        <linearGradient id="g-coffee-steam" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#D9BEF0" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#8851D4" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="g-coffee-cream" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E0C89E" />
        </linearGradient>
      </defs>
      <path d="M52 24 C 46 34, 56 42, 50 52" stroke="url(#g-coffee-steam)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M70 20 C 64 32, 76 42, 70 54" stroke="url(#g-coffee-steam)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M88 24 C 82 34, 92 42, 86 52" stroke="url(#g-coffee-steam)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M100 72 h6 a12 12 0 0 1 12 12 v4 a12 12 0 0 1 -12 12 h-6 Z" fill="url(#g-coffee-body)" />
      <path d="M32 64 H100 V96 a20 20 0 0 1 -20 20 H52 a20 20 0 0 1 -20 -20 Z" fill="url(#g-coffee-body)" />
      <ellipse cx="66" cy="68" rx="34" ry="6" fill="url(#g-coffee-cream)" />
      <ellipse cx="48" cy="74" rx="10" ry="3" fill="#FFFFFF" opacity="0.45" />
      <path d="M38 70 Q 36 90, 40 108" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.22" fill="none" />
    </svg>
  ),
  park: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="g-park-petal" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#E1C0FA" />
          <stop offset="50%" stopColor="#A875E6" />
          <stop offset="100%" stopColor="#6B3FB8" />
        </radialGradient>
        <radialGradient id="g-park-center" cx="35%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#FFE36B" />
          <stop offset="60%" stopColor="#FF9A2B" />
          <stop offset="100%" stopColor="#B8500A" />
        </radialGradient>
        <linearGradient id="g-park-stem" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7FB56B" />
          <stop offset="100%" stopColor="#4A7A3E" />
        </linearGradient>
      </defs>
      <path d="M70 120 L 70 50" stroke="url(#g-park-stem)" strokeWidth="5" strokeLinecap="round" fill="none" />
      <ellipse cx="58" cy="86" rx="8" ry="14" fill="url(#g-park-stem)" transform="rotate(-30 58 86)" />
      <ellipse cx="84" cy="96" rx="8" ry="14" fill="url(#g-park-stem)" transform="rotate(35 84 96)" />
      <g transform="translate(70 52)">
        <ellipse cx="-22" cy="-4" rx="14" ry="20" fill="url(#g-park-petal)" transform="rotate(-40 -22 -4)" />
        <ellipse cx="22" cy="-4" rx="14" ry="20" fill="url(#g-park-petal)" transform="rotate(40 22 -4)" />
        <ellipse cx="-18" cy="20" rx="14" ry="20" fill="url(#g-park-petal)" transform="rotate(-20 -18 20)" />
        <ellipse cx="18" cy="20" rx="14" ry="20" fill="url(#g-park-petal)" transform="rotate(20 18 20)" />
        <ellipse cx="0" cy="-22" rx="14" ry="20" fill="url(#g-park-petal)" />
        <circle r="14" fill="url(#g-park-center)" />
        <ellipse cx="-4" cy="-4" rx="5" ry="3" fill="#FFFFFF" opacity="0.55" />
      </g>
    </svg>
  ),
  bookshop: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-book-cover" x1="20%" y1="10%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#5EA3FF" />
          <stop offset="50%" stopColor="#2668F0" />
          <stop offset="100%" stopColor="#0E3BA8" />
        </linearGradient>
        <linearGradient id="g-book-spine" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3378F2" />
          <stop offset="100%" stopColor="#0A2F8F" />
        </linearGradient>
        <linearGradient id="g-book-page" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C9D4E5" />
        </linearGradient>
        <linearGradient id="g-book-mark" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF7A5A" />
          <stop offset="100%" stopColor="#C82A1B" />
        </linearGradient>
      </defs>
      <path d="M 34 42 L 108 42 L 108 104 L 34 104 Z" fill="url(#g-book-page)" />
      <path d="M 38 46 L 112 46 L 112 108 L 38 108 Z" fill="#E8ECF3" />
      <path d="M 26 36 Q 22 34, 26 32 L 112 32 Q 116 34, 112 36 L 112 112 Q 116 114, 112 116 L 26 116 Q 22 114, 26 112 Z"
            fill="url(#g-book-cover)" />
      <path d="M 26 36 L 30 36 L 30 112 L 26 112 Z" fill="url(#g-book-spine)" />
      <rect x="56" y="26" width="28" height="12" rx="6" fill="url(#g-book-spine)" />
      <rect x="60" y="30" width="20" height="4" rx="2" fill="#FFFFFF" opacity="0.9" />
      <path d="M 30 38 Q 28 46, 32 54 L 44 54 Q 40 44, 46 38 Z" fill="#FFFFFF" opacity="0.22" />
      <path d="M 48 98 L 76 98 L 76 122 L 62 112 L 48 122 Z" fill="url(#g-book-mark)" />
      <path d="M 50 100 L 58 100 L 58 116 L 54 112 L 50 116 Z" fill="#FFFFFF" opacity="0.25" />
    </svg>
  ),
  historic: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-hist-glass" x1="20%" y1="10%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#FFE36B" />
          <stop offset="55%" stopColor="#FFB02E" />
          <stop offset="100%" stopColor="#A85A00" />
        </linearGradient>
        <linearGradient id="g-hist-cap" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5E4276" />
          <stop offset="100%" stopColor="#2E1C42" />
        </linearGradient>
        <radialGradient id="g-hist-flame" cx="50%" cy="60%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="40%" stopColor="#FFD501" />
          <stop offset="100%" stopColor="#FF7A2B" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d="M70 18 V28" stroke="#34233E" strokeWidth="3" strokeLinecap="round" />
      <path d="M58 28 H82" stroke="#34233E" strokeWidth="3" strokeLinecap="round" />
      <path d="M56 32 H84 L80 44 H60 Z" fill="url(#g-hist-cap)" />
      <path d="M52 46 H88 L84 54 H56 Z" fill="url(#g-hist-cap)" />
      <rect x="54" y="54" width="32" height="48" rx="6" fill="url(#g-hist-glass)" />
      <path d="M56 56 L 58 100" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.45" />
      <rect x="62" y="62" width="16" height="32" rx="3" fill="#FFF4D9" opacity="0.35" />
      <ellipse cx="70" cy="80" rx="12" ry="14" fill="url(#g-hist-flame)" />
      <circle cx="70" cy="78" r="4" fill="#FFFFFF" opacity="0.85" />
      <path d="M52 102 H88 L84 112 H56 Z" fill="url(#g-hist-cap)" />
      <rect x="60" y="112" width="20" height="5" rx="2" fill="url(#g-hist-cap)" />
    </svg>
  ),
  market: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-mkt-basket" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F2DBB7" />
          <stop offset="100%" stopColor="#A87440" />
        </linearGradient>
        <radialGradient id="g-mkt-apple" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFB088" />
          <stop offset="60%" stopColor="#E84A20" />
          <stop offset="100%" stopColor="#8C2006" />
        </radialGradient>
        <radialGradient id="g-mkt-lemon" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFF3A6" />
          <stop offset="60%" stopColor="#FFC91A" />
          <stop offset="100%" stopColor="#A87A00" />
        </radialGradient>
        <radialGradient id="g-mkt-green" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#DBF0AE" />
          <stop offset="60%" stopColor="#7CB94A" />
          <stop offset="100%" stopColor="#3E6F1A" />
        </radialGradient>
        <radialGradient id="g-mkt-berry" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#F8A6C0" />
          <stop offset="60%" stopColor="#C83E78" />
          <stop offset="100%" stopColor="#6F1440" />
        </radialGradient>
      </defs>
      <path d="M40 56 C 48 30, 92 30, 100 56" fill="none" stroke="#5C3D1F" strokeWidth="3" strokeLinecap="round" />
      <circle cx="56" cy="62" r="13" fill="url(#g-mkt-apple)" />
      <circle cx="72" cy="58" r="14" fill="url(#g-mkt-lemon)" />
      <circle cx="88" cy="64" r="13" fill="url(#g-mkt-green)" />
      <circle cx="64" cy="78" r="11" fill="url(#g-mkt-berry)" />
      <circle cx="82" cy="78" r="11" fill="url(#g-mkt-apple)" />
      <ellipse cx="52" cy="58" rx="3.5" ry="2.5" fill="#FFFFFF" opacity="0.65" />
      <ellipse cx="68" cy="54" rx="3.5" ry="2.5" fill="#FFFFFF" opacity="0.65" />
      <ellipse cx="84" cy="60" rx="3.5" ry="2.5" fill="#FFFFFF" opacity="0.65" />
      <path d="M32 66 H108 L100 112 a10 10 0 0 1 -10 8 H50 a10 10 0 0 1 -10 -8 Z" fill="url(#g-mkt-basket)" />
      <path d="M40 80 H100 M42 92 H98 M44 104 H96" stroke="#5C3D1F" strokeWidth="2" strokeLinecap="round" opacity="0.4" fill="none" />
      <path d="M34 68 L 106 68" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.55" fill="none" />
    </svg>
  ),
  waterfront: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="g-shell-body" cx="35%" cy="25%" r="80%">
          <stop offset="0%" stopColor="#FFDCC4" />
          <stop offset="50%" stopColor="#FF8E6C" />
          <stop offset="100%" stopColor="#A8391B" />
        </radialGradient>
        <linearGradient id="g-shell-rib" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF7043" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#7A200A" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <path d="M70 28 C 38 48, 24 88, 40 112 C 54 120, 86 120, 100 112 C 116 88, 102 48, 70 28 Z"
            fill="url(#g-shell-body)" />
      <path d="M70 36 C 64 58, 58 88, 50 110" stroke="url(#g-shell-rib)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M70 36 C 76 58, 82 88, 90 110" stroke="url(#g-shell-rib)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M70 36 V 108" stroke="url(#g-shell-rib)" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M58 44 C 56 60, 58 76, 60 96" stroke="url(#g-shell-rib)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M82 44 C 84 60, 82 76, 80 96" stroke="url(#g-shell-rib)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="70" cy="30" r="6" fill="#FFFFFF" />
      <circle cx="68" cy="28" r="2.5" fill="#FFFFFF" opacity="0.9" />
      <ellipse cx="52" cy="52" rx="8" ry="4" fill="#FFFFFF" opacity="0.35" transform="rotate(-20 52 52)" />
    </svg>
  ),
  restaurant: (
    /* Universal "steaming dish" — works for Ethiopian, Italian, Thai, etc.
       A round plate with a heaped serving and three rising steam wisps,
       not tied to any single cuisine. */
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="g-dish-food" cx="40%" cy="38%" r="60%">
          <stop offset="0%" stopColor="#FFE9C2" />
          <stop offset="55%" stopColor="#E69A47" />
          <stop offset="100%" stopColor="#7B3D14" />
        </radialGradient>
        <linearGradient id="g-dish-plate" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#E0DCEA" />
          <stop offset="100%" stopColor="#A89DBE" />
        </linearGradient>
        <linearGradient id="g-dish-rim" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#C4B9D6" />
          <stop offset="100%" stopColor="#7A6F92" />
        </linearGradient>
        <linearGradient id="g-dish-steam" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#D9BEF0" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#8851D4" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      {/* steam wisps */}
      <path d="M 50 30 C 44 42, 56 50, 50 62" stroke="url(#g-dish-steam)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M 70 24 C 64 38, 76 48, 70 62" stroke="url(#g-dish-steam)" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M 90 30 C 84 42, 96 50, 90 62" stroke="url(#g-dish-steam)" strokeWidth="4" strokeLinecap="round" fill="none" />
      {/* plate (top of rim) */}
      <ellipse cx="70" cy="92" rx="56" ry="14" fill="url(#g-dish-rim)" />
      {/* plate (concave) */}
      <ellipse cx="70" cy="88" rx="50" ry="11" fill="url(#g-dish-plate)" />
      {/* heaped food in the center */}
      <ellipse cx="70" cy="84" rx="34" ry="9" fill="url(#g-dish-food)" />
      <ellipse cx="62" cy="80" rx="14" ry="5" fill="#FFF6E2" opacity="0.55" />
      {/* sprinkle of garnish */}
      <circle cx="58" cy="82" r="1.6" fill="#7CC36A" />
      <circle cx="78" cy="84" r="1.4" fill="#7CC36A" />
      <circle cx="84" cy="80" r="1.6" fill="#C82A1B" />
      <circle cx="64" cy="86" r="1.2" fill="#C82A1B" />
      {/* highlight under the plate */}
      <ellipse cx="70" cy="106" rx="50" ry="4" fill="#1E1541" opacity="0.10" />
    </svg>
  ),
  burger: (
    /* Specific burger reward — only triggered when the place is actually a
       burger spot (name contains "burger" or "diner"). */
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-burger-bun-top" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFD79A" />
          <stop offset="60%" stopColor="#E69A47" />
          <stop offset="100%" stopColor="#9B5A1B" />
        </linearGradient>
        <linearGradient id="g-burger-bun-bot" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E69A47" />
          <stop offset="100%" stopColor="#7A3F0E" />
        </linearGradient>
        <linearGradient id="g-burger-patty" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7B3D20" />
          <stop offset="100%" stopColor="#3F1B0B" />
        </linearGradient>
        <linearGradient id="g-burger-cheese" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFEC6B" />
          <stop offset="100%" stopColor="#D8A300" />
        </linearGradient>
      </defs>
      <path d="M 22 64 Q 70 16 118 64 L 118 70 Q 70 56 22 70 Z" fill="url(#g-burger-bun-top)" />
      <circle cx="50" cy="48" r="2.4" fill="#FFF7E6" opacity="0.85" />
      <circle cx="70" cy="40" r="2.4" fill="#FFF7E6" opacity="0.85" />
      <circle cx="92" cy="48" r="2.4" fill="#FFF7E6" opacity="0.85" />
      <path d="M 18 72 Q 30 64 42 74 Q 54 64 66 74 Q 78 64 90 74 Q 102 64 114 74 Q 122 70 122 78 L 18 78 Q 16 72 18 72 Z" fill="#7CC36A" />
      <path d="M 18 78 L 122 78 L 116 90 L 24 90 Z" fill="url(#g-burger-cheese)" />
      <path d="M 36 90 L 30 96 L 110 96 L 104 90 Z" fill="#D8A300" opacity="0.55" />
      <rect x="18" y="90" width="104" height="14" rx="3" fill="url(#g-burger-patty)" />
      <path d="M 18 104 L 122 104 L 118 118 Q 70 132 22 118 Z" fill="url(#g-burger-bun-bot)" />
    </svg>
  ),
  bar: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-bar-glass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#D8C8F2" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id="g-bar-liquid" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFB6E1" />
          <stop offset="55%" stopColor="#E25BB1" />
          <stop offset="100%" stopColor="#7A1F66" />
        </linearGradient>
        <radialGradient id="g-bar-cherry" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFB088" />
          <stop offset="60%" stopColor="#E63B22" />
          <stop offset="100%" stopColor="#7E1808" />
        </radialGradient>
      </defs>
      {/* glass — martini cone outline */}
      <path d="M 28 38 L 112 38 L 70 92 Z" fill="url(#g-bar-glass)" stroke="#5E4276" strokeWidth="2" strokeLinejoin="round" />
      {/* liquid */}
      <path d="M 38 44 L 102 44 L 70 86 Z" fill="url(#g-bar-liquid)" />
      {/* highlight */}
      <path d="M 44 48 L 60 48 L 56 56 Z" fill="#FFFFFF" opacity="0.4" />
      {/* stem */}
      <rect x="68" y="92" width="4" height="22" fill="#5E4276" />
      {/* base */}
      <rect x="46" y="114" width="48" height="6" rx="3" fill="#5E4276" />
      {/* cocktail stick */}
      <line x1="56" y1="22" x2="80" y2="50" stroke="#5E4276" strokeWidth="2" strokeLinecap="round" />
      {/* cherry */}
      <circle cx="54" cy="20" r="7" fill="url(#g-bar-cherry)" />
      <ellipse cx="51" cy="17" rx="2.4" ry="1.6" fill="#FFFFFF" opacity="0.65" />
      <path d="M 56 14 Q 64 8 70 12" stroke="#3E6F1A" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  ),
  seafood: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-fish-body" x1="20%" y1="20%" x2="80%" y2="80%">
          <stop offset="0%" stopColor="#BDE9FF" />
          <stop offset="55%" stopColor="#5FB4E5" />
          <stop offset="100%" stopColor="#1B5E94" />
        </linearGradient>
        <linearGradient id="g-fish-fin" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7FCCEC" />
          <stop offset="100%" stopColor="#22557F" />
        </linearGradient>
        <radialGradient id="g-fish-belly" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* tail */}
      <path d="M 18 70 L 44 50 L 44 90 Z" fill="url(#g-fish-fin)" />
      <path d="M 22 70 L 42 58 L 42 82 Z" fill="#FFFFFF" opacity="0.25" />
      {/* body */}
      <path d="M 44 70 C 56 32, 102 32, 122 70 C 102 108, 56 108, 44 70 Z" fill="url(#g-fish-body)" />
      {/* belly highlight */}
      <ellipse cx="78" cy="80" rx="32" ry="14" fill="url(#g-fish-belly)" />
      {/* top fin */}
      <path d="M 70 38 Q 80 26 96 38 Q 84 44 70 44 Z" fill="url(#g-fish-fin)" />
      {/* bottom fin */}
      <path d="M 70 102 Q 80 114 96 102 Q 84 96 70 96 Z" fill="url(#g-fish-fin)" opacity="0.85" />
      {/* gill curve */}
      <path d="M 60 60 Q 64 70 60 80" stroke="#1B5E94" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.55" />
      {/* scale hints */}
      <path d="M 78 60 Q 82 64 78 68" stroke="#1B5E94" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.45" />
      <path d="M 90 64 Q 94 68 90 72" stroke="#1B5E94" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.45" />
      <path d="M 78 76 Q 82 80 78 84" stroke="#1B5E94" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.45" />
      <path d="M 90 80 Q 94 84 90 88" stroke="#1B5E94" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.45" />
      {/* eye */}
      <circle cx="106" cy="66" r="4.5" fill="#FFFFFF" />
      <circle cx="107" cy="66" r="2.4" fill="#1B5E94" />
      <circle cx="108" cy="65" r="0.9" fill="#FFFFFF" />
      {/* bubble */}
      <circle cx="124" cy="50" r="3" fill="#FFFFFF" opacity="0.7" />
      <circle cx="118" cy="44" r="1.6" fill="#FFFFFF" opacity="0.55" />
    </svg>
  ),
  shop: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-gem-light" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#A8E5FF" />
          <stop offset="100%" stopColor="#3F94D4" />
        </linearGradient>
        <linearGradient id="g-gem-mid" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7FC8F2" />
          <stop offset="100%" stopColor="#1F5F9E" />
        </linearGradient>
        <linearGradient id="g-gem-dark" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1F5F9E" />
          <stop offset="100%" stopColor="#0A2E55" />
        </linearGradient>
        <radialGradient id="g-gem-shine" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* faceted brilliant-cut gem */}
      <path d="M 38 50 L 70 22 L 102 50 L 70 122 Z" fill="url(#g-gem-light)" />
      <path d="M 38 50 L 70 50 L 70 122 Z" fill="url(#g-gem-mid)" />
      <path d="M 70 50 L 102 50 L 70 122 Z" fill="url(#g-gem-dark)" />
      {/* table facets */}
      <path d="M 38 50 L 54 36 L 70 50 Z" fill="#FFFFFF" opacity="0.55" />
      <path d="M 70 50 L 86 36 L 102 50 Z" fill="#FFFFFF" opacity="0.35" />
      <path d="M 54 36 L 70 22 L 86 36 L 70 50 Z" fill="#FFFFFF" opacity="0.45" />
      {/* sparkle highlight */}
      <circle cx="58" cy="64" r="14" fill="url(#g-gem-shine)" />
      {/* tiny corner sparkles */}
      <path d="M 110 30 l 3 6 l 6 3 l -6 3 l -3 6 l -3 -6 l -6 -3 l 6 -3 z" fill="#FFFFFF" opacity="0.85" />
      <path d="M 28 28 l 2 4 l 4 2 l -4 2 l -2 4 l -2 -4 l -4 -2 l 4 -2 z" fill="#FFFFFF" opacity="0.75" />
    </svg>
  ),
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tues","Wed","Thurs","Fri","Sat"];

function formatDateStamp(d = new Date()) {
  return `${DAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// Compact month-grid calendar — the date pill on the reward header opens this
// so the user can browse to other days. Selecting a date updates the header
// stamp; the rest of the screen still reflects the just-finished walk
// (no per-day history is persisted yet).
function CalendarOverlay({ selectedDate, onSelect, onClose }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date(selectedDate);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const monthLabel = `${["January","February","March","April","May","June","July","August","September","October","November","December"][viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
  const firstDow = viewMonth.getDay();
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sel = new Date(selectedDate);
  sel.setHours(0, 0, 0, 0);

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const stepMonth = (delta) => {
    const next = new Date(viewMonth);
    next.setMonth(next.getMonth() + delta);
    setViewMonth(next);
  };

  return (
    <div className="reward-cal-overlay" role="dialog" aria-label="Pick a date" onClick={onClose}>
      <div className="reward-cal" onClick={(e) => e.stopPropagation()}>
        <div className="reward-cal-head">
          <button type="button" className="reward-cal-nav" onClick={() => stepMonth(-1)} aria-label="Previous month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span className="reward-cal-title">{monthLabel}</span>
          <button type="button" className="reward-cal-nav" onClick={() => stepMonth(1)} aria-label="Next month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div className="reward-cal-dow">
          {["S","M","T","W","T","F","S"].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="reward-cal-grid">
          {cells.map((d, i) => {
            if (d === null) return <span key={`b-${i}`} className="reward-cal-cell reward-cal-cell--blank" />;
            const cellDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d);
            const isToday = cellDate.getTime() === today.getTime();
            const isSelected = cellDate.getTime() === sel.getTime();
            // Future dates are unselectable — there's no walk to display yet.
            const isFuture = cellDate.getTime() > today.getTime();
            return (
              <button
                key={d}
                type="button"
                className={`reward-cal-cell${isSelected ? " reward-cal-cell--selected" : ""}${isToday ? " reward-cal-cell--today" : ""}${isFuture ? " reward-cal-cell--future" : ""}`}
                onClick={() => { if (isFuture) return; onSelect(cellDate); onClose(); }}
                disabled={isFuture}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function phoneWord(n) {
  if (n === 0) return "zero times";
  if (n === 1) return "once";
  if (n === 2) return "twice";
  return `${n} times`;
}

function pickHero(stops) {
  return stops.reduce((best, s) => (s.immersedMins > best.immersedMins ? s : best), stops[0]);
}

function getTone(ratio) {
  if (ratio >= 0.7) return "celebratory";
  if (ratio >= 0.4) return "encouraging";
  return "gentle";
}

// Polished thumbs-up icon — also used for thumbs-down (rotated 180°).
function ThumbIcon({ filled, direction = "up" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      style={direction === "down" ? { transform: "rotate(180deg)" } : undefined}
    >
      {/* forearm cuff */}
      <path
        d="M3 12.5a1.5 1.5 0 0 1 1.5-1.5h2v10h-2A1.5 1.5 0 0 1 3 19.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* hand + raised thumb */}
      <path
        d="M6.5 11
           L10.5 4.2
           a1.6 1.6 0 0 1 2.9 1.3
           L12.4 10.6
           h6
           a2 2 0 0 1 1.98 2.34
           l-1.05 6.2
           A2 2 0 0 1 17.36 21
           H6.5
           Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Mirrors HomeScreen's CATEGORY_ICONS so the reward revisit cards share the
// same visual vocabulary as the home suggested-spots cards.
const CATEGORY_ICONS = {
  Coffee: "local_cafe", Restaurant: "restaurant", Bar: "local_bar",
  "Ice Cream": "icecream", Bakery: "bakery", Bookstore: "menu_book",
  Library: "local_library", Theatre: "theater_comedy", Florist: "local_florist",
  Museum: "museum", Gallery: "palette", Art: "brush",
  Viewpoint: "landscape", Attraction: "attractions", Arts: "theater_comedy",
  Park: "park", Garden: "yard",
};

// Suggested-spot card shown beneath a thumbs-upped revisit card. Visually
// matches HomeScreen's `.location-card` default state — dashed purple
// outline, frosted background, same icon + title + category styling.
function SuggestionCard({ id, name, category, isFaved, onToggleFave }) {
  const iconName = CATEGORY_ICONS[category] || "location_on";
  return (
    <div className="reward-suggestion-card">
      <div className="reward-revisit-text">
        <div className="reward-revisit-name">{name}</div>
        <div className="reward-revisit-cat">
          <span className="material-symbols-rounded reward-revisit-icon">{iconName}</span>
          <span>{category}</span>
        </div>
      </div>
      <button
        type="button"
        className={`reward-suggestion-heart${isFaved ? " reward-suggestion-heart--faved" : ""}`}
        onClick={() => onToggleFave?.(id)}
        aria-label={`${isFaved ? "Remove" : "Save"} ${name}`}
        aria-pressed={!!isFaved}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M12 21s-7-4.5-9.2-9.1C1.5 8.5 3.6 5 7.2 5c2 0 3.6 1 4.8 2.6C13.2 6 14.8 5 16.8 5c3.6 0 5.7 3.5 4.4 6.9C19 16.5 12 21 12 21z"
            fill={isFaved ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

function RevisitCard({ id, name, category, note, delay, rating, onRate }) {
  const iconName = CATEGORY_ICONS[category] || "location_on";
  return (
    <div className="reward-revisit-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="reward-revisit-text">
        <div className="reward-revisit-name">{name}</div>
        <div className="reward-revisit-cat">
          <span className="material-symbols-rounded reward-revisit-icon">{iconName}</span>
          <span>{category}</span>
        </div>
        {note && <div className="reward-revisit-note">{note}</div>}
      </div>
      <div className="reward-revisit-rating">
        <button
          className={`reward-revisit-heart${rating === "up" ? " reward-revisit-heart--faved" : ""}`}
          onClick={() => onRate(id, "up")}
          aria-label={`Yes, I'd revisit ${name}`}
          aria-pressed={rating === "up"}
        >
          <ThumbIcon direction="up" filled={rating === "up"} />
        </button>
        <button
          className={`reward-revisit-heart reward-revisit-heart--down${rating === "down" ? " reward-revisit-heart--faved" : ""}`}
          onClick={() => onRate(id, "down")}
          aria-label={`No, not for me — ${name}`}
          aria-pressed={rating === "down"}
        >
          <ThumbIcon direction="down" filled={rating === "down"} />
        </button>
      </div>
    </div>
  );
}

function TrailStop({ stop, index, isHero, isStart, isLingered }) {
  const floatDuration = 4.4 + (index % 3) * 0.6;
  const floatDelay = index * 0.45;
  return (
    <div className={`reward-trail-row reward-trail-row--${index % 2 === 0 ? "left" : "right"}`}>
      <div
        className={`reward-trail-stop${isHero ? " reward-trail-stop--hero" : ""}`}
        style={{ animationDelay: `${200 + index * 150}ms` }}
      >
        {isHero && <span className="reward-trail-sparkle reward-trail-sparkle--a" />}
        {isHero && <span className="reward-trail-sparkle reward-trail-sparkle--b" />}
        {isHero && <span className="reward-trail-sparkle reward-trail-sparkle--c" />}
        {isHero && <span className="reward-trail-sparkle reward-trail-sparkle--d" />}
        {isHero && <span className="reward-trail-sparkle reward-trail-sparkle--e" />}
        {isHero && <span className="reward-trail-halo" aria-hidden="true" />}
        <span
          className="reward-trail-stop-fill"
          style={{ background: STOP_TINTS[stop.vibe] || STOP_TINTS.park }}
        />
        <div
          className="reward-trail-stop-inner"
          style={{
            animationDuration: `${floatDuration}s`,
            animationDelay: `${floatDelay}s`,
          }}
        >
          {COLLECTIBLES[stop.vibe]}
        </div>
        {/* Tag rules: only LINGERED is shown.
            • Single stop → tagged when lingerMins > 1.
            • Multiple stops → tagged on the longest-dwell stop (computed
              in the parent), again only when its lingerMins > 1.
            START is never shown. */}
        {isLingered && (
          <span className="reward-trail-start-pill">LINGERED</span>
        )}
      </div>
      <div className="reward-trail-label">{stop.name}</div>
    </div>
  );
}

export default function RewardScreen({
  // Live walk state (passed by App.js when transitioning from Timeline).
  journeyItems,
  visitedIds,
  visitedAt,
  stopDwellMs,
  tripStartTime,
  nearbyPlaces,
  userLocation,
  // Allow callers to override either object directly (preview / Storybook).
  walkData: walkDataOverride,
  similarPlaces: similarOverride,
  onComplete, // primary nav: home
  onResume,   // user changed their mind — go back to the active walk
  onShare,
}) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const dateStamp = formatDateStamp(selectedDate);

  // Walks are only persisted for the current session. When the user picks
  // another date in the calendar we show a throwback view instead — past
  // dates render a mock walk (so the surface stays expressive), future
  // dates render the same empty state as "you haven't walked yet".
  const dateMode = useMemo(() => {
    const sel = new Date(selectedDate); sel.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (sel.getTime() > today.getTime()) return 'future';
    if (sel.getTime() < today.getTime()) return 'past';
    return 'today';
  }, [selectedDate]);

  // Build real walk data from props if available; fall back to mock for preview.
  // When the user has scrubbed to a different date, replace the live walk with
  // the throwback mock so the rest of the screen reflects what they "did" then.
  const walkData = useMemo(() => {
    if (walkDataOverride) return walkDataOverride;
    if (dateMode === 'past') return MOCK_WALK;
    return buildWalkData({ journeyItems, visitedIds, visitedAt, stopDwellMs, tripStartTime }) || MOCK_WALK;
  }, [walkDataOverride, dateMode, journeyItems, visitedIds, visitedAt, stopDwellMs, tripStartTime]);

  const hero = useMemo(() => pickHero(walkData.stops), [walkData.stops]);
  // Subheader tone is now driven by walk duration so short walks read as
  // encouraging instead of accusatory.
  const tone = getToneByDuration(walkData.totalMins);
  // Stop the user lingered at the LONGEST — earns the "LINGERED" pill on
  // the trail. Only awarded when the dwell exceeds 1 minute (anything
  // shorter shouldn't read as lingering). With a single stop the rule
  // collapses to "show LINGERED if that stop has > 1 min dwell"; with
  // multiple stops the longest-dwell wins.
  const longestLingerStopId = useMemo(() => {
    if (!walkData.stops || walkData.stops.length === 0) return null;
    let best = null;
    for (const s of walkData.stops) {
      if (s.lingerMins <= 1) continue;
      if (!best || s.lingerMins > best.lingerMins) best = s;
    }
    return best ? best.id : null;
  }, [walkData.stops]);

  const topLingerStops = useMemo(
    () => [...walkData.stops].sort((a, b) => b.lingerMins - a.lingerMins).slice(0, 2),
    [walkData.stops]
  );
  // Per-card rating: "up" | "down". Tapping the same direction toggles it
  // back off; tapping the other direction switches.
  const [ratings, setRatings] = useState(() => new Map());
  const setRating = (id, direction) => {
    setRatings((prev) => {
      const next = new Map(prev);
      if (next.get(id) === direction) next.delete(id);
      else next.set(id, direction);
      return next;
    });
  };

  // "Save for later" hearts on the suggested-spot cards beneath a rated card.
  const [favedSuggestions, setFavedSuggestions] = useState(() => new Set());
  const toggleFavedSuggestion = (id) => {
    setFavedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Per-card suggested similar spots — populated lazily when the user taps
  // thumbs-up on a card. Map<cardId, suggestion[]>.
  const [suggestionsByCard, setSuggestionsByCard] = useState(() => new Map());
  const visitedNamesRef = useRef(new Set());
  visitedNamesRef.current = new Set(walkData.stops.map((s) => s.name));

  // Fetch up to 2 nearby spots that share the rated card's vibe, excluding
  // places the user already explored. Prefer the cached HomeScreen
  // `nearbyPlaces` to avoid a network round-trip; fall back to Overpass.
  const loadSuggestionsFor = useCallback(async ({ cardId, stop }) => {
    if (suggestionsByCard.has(cardId)) return;
    const targetVibe = stop.vibe;
    const filterAndShape = (places) =>
      (places || [])
        .filter((p) => !visitedNamesRef.current.has(p.name))
        .filter((p) => vibeFor(p.desc, p.name) === targetVibe)
        .slice(0, 2)
        .map((p) => ({ id: `sugg-${cardId}-${p.id}`, name: p.name, category: p.desc }));

    // 1) Try the local cache first.
    const fromCache = filterAndShape(nearbyPlaces);
    if (fromCache.length) {
      setSuggestionsByCard((prev) => new Map(prev).set(cardId, fromCache));
      return;
    }

    // 2) Otherwise fetch around the stop (or fall back to user location).
    const lat = stop.lat ?? userLocation?.[0];
    const lon = stop.lng ?? userLocation?.[1];
    if (lat == null || lon == null) {
      setSuggestionsByCard((prev) => new Map(prev).set(cardId, []));
      return;
    }
    try {
      const places = await fetchNearbyPlaces(lat, lon, 1200);
      const shaped = filterAndShape(places);
      setSuggestionsByCard((prev) => new Map(prev).set(cardId, shaped));
    } catch (_) {
      setSuggestionsByCard((prev) => new Map(prev).set(cardId, []));
    }
  }, [nearbyPlaces, suggestionsByCard, userLocation]);

  // Hook into the rating state: when a card flips to "up", kick off the fetch.
  const rateAndMaybeLoad = useCallback((cardId, direction, stop) => {
    setRating(cardId, direction);
    if (direction === "up" && stop) {
      loadSuggestionsFor({ cardId, stop });
    }
  }, [loadSuggestionsFor]);

  // Background hero image: try Wikipedia for an actual photo of one of the
  // explored locations (hero stop), fall back to the curated vibe-based image.
  const fallbackBg = HERO_BG_IMAGES[hero.vibe] || HERO_BG_IMAGES.park;
  const [bgImage, setBgImage] = useState(fallbackBg);
  useEffect(() => {
    setBgImage(fallbackBg);
    // Walk the explored stops in dwell order; the first one with a Wikipedia
    // photo wins, so the background reflects somewhere the user actually went.
    const candidates = [...walkData.stops].sort((a, b) => b.lingerMins - a.lingerMins);
    let cancelled = false;
    (async () => {
      for (const stop of candidates) {
        if (cancelled) return;
        try {
          const res = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(stop.name)}`
          );
          if (!res.ok) continue;
          const data = await res.json();
          const img = data.originalimage?.source || data.thumbnail?.source;
          if (img) {
            setBgImage(img);
            return;
          }
        } catch (_) { /* try next stop */ }
      }
    })();
    return () => { cancelled = true; };
  }, [walkData.stops, fallbackBg]);

  // Empty state: the user ended a journey with nothing to reflect on —
  // no stops added AND no spots visited. Skip the trail/treasures UI in
  // favor of a friendly nudge to plan an actual walk.
  const visitedCount = visitedIds instanceof Set
    ? visitedIds.size
    : (visitedIds ? Object.keys(visitedIds).length : 0);
  const isEmptyJourney = !walkDataOverride && !journeyItems?.length && visitedCount === 0;

  if (isEmptyJourney) {
    return (
      <div className="reward-screen reward-screen--empty">
        <div className="reward-bg-frost reward-bg-frost--solid" />
        {/* Drifting dark fog/smoke layer — sets a quiet, hazy mood for an
            empty walk reflection. */}
        <div className="reward-empty-fog" aria-hidden="true">
          <span className="reward-empty-fog-puff reward-empty-fog-puff--1" />
          <span className="reward-empty-fog-puff reward-empty-fog-puff--2" />
          <span className="reward-empty-fog-puff reward-empty-fog-puff--3" />
          <span className="reward-empty-fog-puff reward-empty-fog-puff--4" />
        </div>
        <div className="reward-scroll reward-scroll--empty">
          <button
            type="button"
            className="reward-date-stamp"
            onClick={() => setCalendarOpen(true)}
            aria-label={`Reward for ${dateStamp}. Tap to pick a different date.`}
          >
            {dateStamp}
            <svg className="reward-date-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          {calendarOpen && (
            <CalendarOverlay
              selectedDate={selectedDate}
              onSelect={setSelectedDate}
              onClose={() => setCalendarOpen(false)}
            />
          )}
          <div className="reward-empty">
            <div className="reward-empty-art" aria-hidden="true">
              <svg viewBox="0 0 140 140" width="140" height="140">
                <defs>
                  <linearGradient id="g-empty-boot" x1="20%" y1="10%" x2="80%" y2="100%">
                    <stop offset="0%" stopColor="#A88AE0" />
                    <stop offset="100%" stopColor="#4A3B92" />
                  </linearGradient>
                </defs>
                {/* lone boot waiting for a walk */}
                <path
                  d="M48 36 C 56 24 80 22 86 38 C 88 56 76 70 70 78 C 88 82 110 96 108 116 C 106 124 96 124 88 120 L 36 100 C 28 96 28 84 36 80 C 46 74 60 60 48 36 Z"
                  fill="url(#g-empty-boot)"
                  stroke="#C5AEED"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                {/* dotted trail leading away */}
                <circle cx="24" cy="50" r="2.4" fill="#A88AE0" opacity="0.7" />
                <circle cx="14" cy="38" r="2"   fill="#A88AE0" opacity="0.55" />
                <circle cx="8"  cy="26" r="1.6" fill="#A88AE0" opacity="0.4" />
              </svg>
            </div>
            <h1 className="reward-empty-title">You've explored: absolutely nothing.</h1>
            <p className="reward-empty-body">
              The city's still out there. Start exploring — even 5 minutes counts.
            </p>
            <div className="reward-actions">
              <button
                className="reward-share-btn"
                onClick={onComplete}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6"/>
                  <line x1="8" y1="3" x2="8" y2="18"/>
                  <line x1="16" y1="6" x2="16" y2="21"/>
                </svg>
                <span>Plan an exploration</span>
              </button>
              {/* Resume only makes sense for the active (today's) walk —
                  past dates are read-only throwbacks with nothing to
                  resume into. */}
              {onResume && dateMode === 'today' && (
                <button
                  className="reward-undo-pill"
                  onClick={onResume}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E1541" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 14L4 9l5-5" />
                    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
                  </svg>
                  <span>Oops, I'm not done exploring</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`reward-screen reward-screen--${hero.vibe}`}>
      <img className="reward-bg-image" src={bgImage} alt="" aria-hidden="true" />
      <div className="reward-bg-frost" />

      <div className="reward-scroll">
        <button
          type="button"
          className="reward-date-stamp"
          onClick={() => setCalendarOpen(true)}
          aria-label={`Reward for ${dateStamp}. Tap to pick a different date.`}
        >
          {dateStamp}
          <svg className="reward-date-chevron" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        {calendarOpen && (
          <CalendarOverlay
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            onClose={() => setCalendarOpen(false)}
          />
        )}

        <h1 className="reward-headline">
          You explored <span className="reward-hl reward-hl--purple">{walkData.distanceMiles} miles</span> on foot and explored for <span className="reward-hl reward-hl--yellow">{walkData.totalMins} minutes</span>.
        </h1>

        <p className="reward-subheader">{TONE_SUBHEADERS[tone]}</p>

        <section className="reward-trail" aria-label="Your walk">
          <svg className="reward-trail-path" viewBox="0 0 280 640" preserveAspectRatio="none" aria-hidden="true">
            <path
              d="M 70 60 C 70 130, 210 150, 210 220 C 210 290, 70 310, 70 380 C 70 450, 210 470, 210 540"
              stroke="#8851D4"
              strokeWidth="2"
              strokeDasharray="3 7"
              strokeLinecap="round"
              fill="none"
              opacity="0.55"
            />
          </svg>
          <div className="reward-trail-stops">
            {walkData.stops.map((stop, i) => (
              <TrailStop
                key={stop.id}
                stop={stop}
                index={i}
                isHero={stop.id === hero.id}
                isStart={i === 0}
                isLingered={stop.id === longestLingerStopId}
              />
            ))}
          </div>
        </section>

        <section className="reward-revisit">
          <h3>Would you go to these spots again?</h3>

          {topLingerStops.map((stop, i) => {
            const cardId = `linger-${stop.id}`;
            const rating = ratings.get(cardId);
            const suggestions = suggestionsByCard.get(cardId);
            return (
              <React.Fragment key={cardId}>
                <RevisitCard
                  id={cardId}
                  name={stop.name}
                  category={stop.category}
                  note={`You spent ${stop.lingerMins} mins here.`}
                  delay={300 + i * 120}
                  rating={rating}
                  onRate={(id, dir) => rateAndMaybeLoad(id, dir, stop)}
                />
                {rating === "up" && (
                  <div className="reward-suggestions">
                    <p className="reward-suggestions-title">Suggested spots like this</p>
                    {suggestions === undefined && (
                      <p className="reward-suggestions-empty">Finding spots like this…</p>
                    )}
                    {suggestions && suggestions.length === 0 && (
                      <p className="reward-suggestions-empty">No similar spots nearby right now.</p>
                    )}
                    {suggestions && suggestions.length > 0 && suggestions.map((s) => (
                      <SuggestionCard
                        key={s.id}
                        id={s.id}
                        name={s.name}
                        category={s.category}
                        isFaved={favedSuggestions.has(s.id)}
                        onToggleFave={toggleFavedSuggestion}
                      />
                    ))}
                  </div>
                )}
                {rating === "down" && (
                  <div className="reward-feedback" role="status">
                    <p className="reward-feedback-text">We won't recommend spots like this anymore.</p>
                    <button type="button" className="reward-feedback-btn">
                      Say more. We can do better.
                    </button>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </section>

        <div className="reward-actions">
          <button
            className="reward-share-btn"
            onClick={onComplete}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="1 6 8 3 16 6 23 3 23 18 16 21 8 18 1 21 1 6"/>
              <line x1="8" y1="3" x2="8" y2="18"/>
              <line x1="16" y1="6" x2="16" y2="21"/>
            </svg>
            <span>Plan another exploration</span>
          </button>
          {/* Hidden on past-date throwbacks — there's no walk to resume. */}
          {dateMode === 'today' && (
            <button
              className="reward-undo-pill"
              onClick={onResume || onComplete}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E1541" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
              </svg>
              <span>Oops, I'm not done exploring</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
