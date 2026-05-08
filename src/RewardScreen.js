// FEATURE: reward
// LAST UPDATED BY: Seemin Masood
// UPDATE DATE: 2026-05-08
// BUILD: 3d077e44
// DEPENDS ON: ./geminiService (fetchNearbyPlaces)
// CONSUMED BY: ./App.js, ./ProgressScreen (getStopCollectible, getStopTint)
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
export function vibeFor(category, name) {
  const haystack = `${category || ""} ${name || ""}`.toLowerCase();
  for (const [vibe, words] of Object.entries(VIBE_BY_CATEGORY)) {
    if (words.some((w) => haystack.includes(w))) return vibe;
  }
  return "park"; // sensible default — has both artwork + tint
}

// Food spots all share a single "restaurant" / "burger" / "seafood" / "bar"
// vibe, so without this they'd render with the same generic collectible.
// Map keywords in the stop's name + category to a Material Symbol glyph so
// each food spot reads as the kind of food it serves (ramen, sushi, soup,
// rice, steak, pizza, taco, …). Returns null for non-food vibes so the
// caller falls back to the curated COLLECTIBLES artwork.
const FOOD_VIBES = new Set(["restaurant", "burger", "seafood", "bar"]);
// Per-food signature color so each kind of food reads at a glance — broths
// warm orange, steaks deep red, sushi rose, ice cream pink, etc.
const FOOD_ICON_COLOR = {
  ramen_dining:    "#E8884A",
  set_meal:        "#D85C5C",
  rice_bowl:       "#C18B5C",
  soup_kitchen:    "#E89B5C",
  local_pizza:     "#D85C5C",
  lunch_dining:    "#D9A93E",
  outdoor_grill:   "#A8483F",
  kebab_dining:    "#8B5A3C",
  dinner_dining:   "#C45050",
  brunch_dining:   "#E8B43F",
  bakery_dining:   "#C49056",
  icecream:        "#EF8FB1",
  local_bar:       "#D9962E",
  sports_bar:      "#D9962E",
  nightlife:       "#8851D4",
  tapas:           "#D85C5C",
  restaurant:      "#B07957",
};

// Custom 3D-style food collectibles — same vocabulary as the coffee /
// historic / etc. illustrations in COLLECTIBLES (140×140 viewBox, layered
// gradients + highlights), but split out so they can be picked per food
// kind based on the stop's name.
export const FOOD_COLLECTIBLES = {
  ramen_dining: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-ramen-bowl" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E66B4E" />
          <stop offset="60%" stopColor="#B83C2A" />
          <stop offset="100%" stopColor="#7A1F12" />
        </linearGradient>
        <linearGradient id="g-ramen-broth" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFD58A" />
          <stop offset="100%" stopColor="#E89B3A" />
        </linearGradient>
      </defs>
      <path d="M48 30 C42 40, 52 48, 46 58" stroke="#D9BEF0" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" fill="none" />
      <path d="M64 26 C58 38, 70 48, 64 60" stroke="#D9BEF0" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" fill="none" />
      <path d="M82 30 C76 40, 86 48, 80 58" stroke="#D9BEF0" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" fill="none" />
      <path d="M30 64 H110 L102 110 a10 10 0 0 1 -10 8 H48 a10 10 0 0 1 -10 -8 Z" fill="url(#g-ramen-bowl)" />
      <ellipse cx="70" cy="66" rx="38" ry="6" fill="url(#g-ramen-broth)" />
      <path d="M44 64 Q56 58 70 64 T98 64" stroke="#FFE8A8" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M48 68 Q60 62 72 68 T96 68" stroke="#FFE8A8" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="56" cy="66" rx="7" ry="5" fill="#FFFAEC" />
      <ellipse cx="56" cy="66" rx="3.5" ry="2.5" fill="#F2A93A" />
      <circle cx="84" cy="65" r="2" fill="#5C9F66" />
      <circle cx="88" cy="68" r="2" fill="#5C9F66" />
      <circle cx="92" cy="64" r="2" fill="#5C9F66" />
      <ellipse cx="50" cy="76" rx="12" ry="3" fill="#FFFFFF" opacity="0.30" />
      <path d="M104 110 a8 8 0 0 0 8 -8 v-6 a8 8 0 0 0 -8 -8" fill="none" stroke="url(#g-ramen-bowl)" strokeWidth="6" strokeLinecap="round" />
    </svg>
  ),
  set_meal: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-sushi-rice" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E8DEC6" />
        </linearGradient>
        <linearGradient id="g-sushi-fish" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF9173" />
          <stop offset="100%" stopColor="#D14A2C" />
        </linearGradient>
        <linearGradient id="g-sushi-board" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#3A2A1C" />
          <stop offset="100%" stopColor="#1A0F08" />
        </linearGradient>
      </defs>
      <ellipse cx="70" cy="100" rx="50" ry="10" fill="url(#g-sushi-board)" />
      <rect x="36" y="64" width="72" height="32" rx="4" fill="#5A4632" />
      <rect x="38" y="66" width="68" height="2" rx="1" fill="#8B6A4F" opacity="0.6" />
      <rect x="44" y="56" width="20" height="32" rx="3" fill="#1E1414" />
      <rect x="46" y="56" width="16" height="32" rx="2" fill="url(#g-sushi-rice)" />
      <path d="M44 56 H64 L62 50 H46 Z" fill="url(#g-sushi-fish)" />
      <path d="M48 56 L48 50" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.55" />
      <rect x="76" y="56" width="20" height="32" rx="3" fill="#1E1414" />
      <rect x="78" y="56" width="16" height="32" rx="2" fill="url(#g-sushi-rice)" />
      <ellipse cx="86" cy="56" rx="9" ry="3" fill="url(#g-sushi-fish)" />
      <circle cx="84" cy="55" r="1" fill="#FFAE94" />
      <circle cx="88" cy="55" r="1" fill="#FFAE94" />
      <ellipse cx="56" cy="60" rx="6" ry="2" fill="#FFFFFF" opacity="0.35" />
    </svg>
  ),
  rice_bowl: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-rice-bowl" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F4D8B0" />
          <stop offset="60%" stopColor="#C28D5A" />
          <stop offset="100%" stopColor="#7A4A28" />
        </linearGradient>
        <radialGradient id="g-rice" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E8DEC6" />
        </radialGradient>
      </defs>
      <path d="M28 64 H112 L102 110 a10 10 0 0 1 -10 8 H48 a10 10 0 0 1 -10 -8 Z" fill="url(#g-rice-bowl)" />
      <ellipse cx="70" cy="64" rx="42" ry="8" fill="url(#g-rice)" />
      <ellipse cx="56" cy="62" rx="2" ry="1.4" fill="#FFFFFF" />
      <ellipse cx="64" cy="60" rx="2" ry="1.4" fill="#FFFFFF" />
      <ellipse cx="74" cy="62" rx="2" ry="1.4" fill="#FFFFFF" />
      <ellipse cx="82" cy="60" rx="2" ry="1.4" fill="#FFFFFF" />
      <circle cx="62" cy="62" r="3" fill="#5C9F66" />
      <circle cx="78" cy="62" r="3" fill="#D85C5C" />
      <ellipse cx="70" cy="60" rx="6" ry="2.5" fill="#F2A93A" />
      <ellipse cx="50" cy="74" rx="10" ry="2.5" fill="#FFFFFF" opacity="0.35" />
    </svg>
  ),
  soup_kitchen: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-soup-bowl" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F0DCB4" />
          <stop offset="100%" stopColor="#A8835A" />
        </linearGradient>
        <linearGradient id="g-soup-broth" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFC97A" />
          <stop offset="100%" stopColor="#D67E2C" />
        </linearGradient>
      </defs>
      <path d="M50 28 C44 38, 54 46, 48 56" stroke="#D9BEF0" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" fill="none" />
      <path d="M70 24 C64 36, 76 46, 70 58" stroke="#D9BEF0" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" fill="none" />
      <path d="M90 28 C84 38, 94 46, 88 56" stroke="#D9BEF0" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" fill="none" />
      <path d="M28 66 H112 L100 108 a10 10 0 0 1 -10 8 H50 a10 10 0 0 1 -10 -8 Z" fill="url(#g-soup-bowl)" />
      <ellipse cx="70" cy="66" rx="42" ry="8" fill="url(#g-soup-broth)" />
      <circle cx="58" cy="66" r="3" fill="#5C9F66" />
      <circle cx="74" cy="64" r="3" fill="#D85C5C" />
      <circle cx="82" cy="68" r="2.5" fill="#FFFAEC" />
      <ellipse cx="50" cy="78" rx="12" ry="3" fill="#FFFFFF" opacity="0.32" />
      <rect x="100" y="48" width="6" height="40" rx="3" transform="rotate(20 103 68)" fill="#3A2A1C" />
    </svg>
  ),
  local_pizza: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-pizza-cheese" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFDB88" />
          <stop offset="100%" stopColor="#E89B3A" />
        </linearGradient>
        <linearGradient id="g-pizza-crust" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E8C087" />
          <stop offset="100%" stopColor="#A06B30" />
        </linearGradient>
      </defs>
      <path d="M70 24 L116 102 L24 102 Z" fill="url(#g-pizza-crust)" />
      <path d="M70 36 L106 96 L34 96 Z" fill="url(#g-pizza-cheese)" />
      <circle cx="62" cy="64" r="6" fill="#D14A2C" />
      <circle cx="62" cy="64" r="4" fill="#FF7152" opacity="0.55" />
      <circle cx="84" cy="68" r="6" fill="#D14A2C" />
      <circle cx="84" cy="68" r="4" fill="#FF7152" opacity="0.55" />
      <circle cx="70" cy="84" r="6" fill="#D14A2C" />
      <circle cx="70" cy="84" r="4" fill="#FF7152" opacity="0.55" />
      <circle cx="50" cy="90" r="2" fill="#5C9F66" />
      <circle cx="92" cy="88" r="2" fill="#5C9F66" />
      <circle cx="76" cy="56" r="2" fill="#5C9F66" />
      <path d="M70 36 L106 96 L34 96 Z" fill="#FFFFFF" opacity="0.10" />
    </svg>
  ),
  lunch_dining: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-burger-bun" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F2C879" />
          <stop offset="100%" stopColor="#A0712A" />
        </linearGradient>
        <linearGradient id="g-burger-patty" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#9C5532" />
          <stop offset="100%" stopColor="#5A2C12" />
        </linearGradient>
      </defs>
      <ellipse cx="70" cy="46" rx="42" ry="22" fill="url(#g-burger-bun)" />
      <ellipse cx="60" cy="38" rx="6" ry="3" fill="#FFF6D8" opacity="0.7" />
      <circle cx="56" cy="42" r="1.5" fill="#FFF6D8" />
      <circle cx="78" cy="38" r="1.5" fill="#FFF6D8" />
      <circle cx="86" cy="44" r="1.5" fill="#FFF6D8" />
      <rect x="28" y="62" width="84" height="6" rx="3" fill="#5C9F66" />
      <rect x="28" y="68" width="84" height="6" rx="3" fill="#FFFAEC" />
      <ellipse cx="70" cy="80" rx="42" ry="9" fill="url(#g-burger-patty)" />
      <ellipse cx="70" cy="92" rx="40" ry="6" fill="#D85C5C" />
      <ellipse cx="70" cy="106" rx="42" ry="14" fill="url(#g-burger-bun)" />
      <ellipse cx="58" cy="100" rx="10" ry="2.5" fill="#FFFFFF" opacity="0.35" />
    </svg>
  ),
  outdoor_grill: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-steak" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#A8483F" />
          <stop offset="60%" stopColor="#7A2A1F" />
          <stop offset="100%" stopColor="#3F1108" />
        </linearGradient>
        <linearGradient id="g-steak-fat" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFF1D6" />
          <stop offset="100%" stopColor="#F0CE94" />
        </linearGradient>
      </defs>
      <ellipse cx="70" cy="100" rx="48" ry="10" fill="#1E1414" opacity="0.4" />
      <path d="M28 64 Q70 44 112 64 Q108 92 70 92 Q32 92 28 64 Z" fill="url(#g-steak)" />
      <path d="M40 60 Q70 50 100 60" fill="none" stroke="url(#g-steak-fat)" strokeWidth="3" strokeLinecap="round" />
      <path d="M44 76 Q70 68 96 76" fill="none" stroke="url(#g-steak-fat)" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <path d="M50 64 L48 86" stroke="#1E1414" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M70 60 L70 86" stroke="#1E1414" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M90 64 L92 86" stroke="#1E1414" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M40 72 H100" stroke="#1E1414" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <ellipse cx="58" cy="58" rx="14" ry="3" fill="#FFFFFF" opacity="0.18" />
    </svg>
  ),
  kebab_dining: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-taco-shell" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F2C879" />
          <stop offset="100%" stopColor="#9C5F1E" />
        </linearGradient>
        <linearGradient id="g-taco-meat" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#A8483F" />
          <stop offset="100%" stopColor="#5A2A1A" />
        </linearGradient>
      </defs>
      <path d="M22 78 Q70 24 118 78 Q118 94 100 100 Q70 110 40 100 Q22 94 22 78 Z" fill="url(#g-taco-shell)" />
      <path d="M28 78 Q70 38 112 78 Q108 86 90 86 Q70 90 50 86 Q32 86 28 78 Z" fill="url(#g-taco-meat)" />
      <circle cx="50" cy="74" r="3" fill="#5C9F66" />
      <circle cx="62" cy="68" r="3" fill="#5C9F66" />
      <circle cx="78" cy="68" r="3" fill="#FFFAEC" />
      <circle cx="86" cy="74" r="3" fill="#D85C5C" />
      <circle cx="70" cy="64" r="2.5" fill="#FFEB7E" />
      <path d="M40 96 Q70 102 100 96" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.4" fill="none" />
      <path d="M22 78 Q44 30 70 30" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.30" />
    </svg>
  ),
  dinner_dining: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="g-pasta-plate" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C9C0BD" />
        </radialGradient>
        <linearGradient id="g-pasta-sauce" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E84A2C" />
          <stop offset="100%" stopColor="#9A1F12" />
        </linearGradient>
      </defs>
      <ellipse cx="70" cy="78" rx="54" ry="20" fill="url(#g-pasta-plate)" />
      <ellipse cx="70" cy="74" rx="44" ry="14" fill="url(#g-pasta-sauce)" />
      <path d="M40 74 Q50 64 60 72 T80 72 T100 74" fill="none" stroke="#F4D77F" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M44 78 Q56 70 66 76 T86 76 T100 78" fill="none" stroke="#F4D77F" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M44 82 Q56 76 70 82 T96 82" fill="none" stroke="#F4D77F" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="62" cy="68" r="3" fill="#5C9F66" />
      <circle cx="80" cy="76" r="3" fill="#5C9F66" />
      <circle cx="72" cy="80" r="2" fill="#FFFAEC" />
      <circle cx="60" cy="80" r="2" fill="#FFFAEC" />
      <ellipse cx="56" cy="68" rx="10" ry="3" fill="#FFFFFF" opacity="0.4" />
    </svg>
  ),
  brunch_dining: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-pancake" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F2C879" />
          <stop offset="100%" stopColor="#A0712A" />
        </linearGradient>
        <linearGradient id="g-syrup" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E88B2E" />
          <stop offset="100%" stopColor="#7A4108" />
        </linearGradient>
      </defs>
      <ellipse cx="70" cy="106" rx="50" ry="6" fill="#1E1414" opacity="0.18" />
      <ellipse cx="70" cy="98" rx="44" ry="10" fill="url(#g-pancake)" />
      <ellipse cx="70" cy="84" rx="40" ry="9" fill="url(#g-pancake)" />
      <ellipse cx="70" cy="72" rx="36" ry="8" fill="url(#g-pancake)" />
      <path d="M36 70 Q44 76 52 72" fill="none" stroke="url(#g-syrup)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M52 72 Q60 84 70 80 Q80 76 88 84 Q96 90 104 84" fill="none" stroke="url(#g-syrup)" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="62" y="50" width="14" height="14" rx="2" fill="#FFF1AA" />
      <rect x="62" y="50" width="14" height="14" rx="2" fill="url(#g-syrup)" opacity="0.45" />
      <ellipse cx="56" cy="68" rx="10" ry="2.5" fill="#FFFFFF" opacity="0.4" />
    </svg>
  ),
  bakery_dining: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-croissant" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F2C879" />
          <stop offset="55%" stopColor="#C0853C" />
          <stop offset="100%" stopColor="#7A4108" />
        </linearGradient>
      </defs>
      <path d="M30 92 Q50 30 110 60 Q116 80 100 96 Q70 110 30 92 Z" fill="url(#g-croissant)" />
      <path d="M44 78 Q60 60 80 64" fill="none" stroke="#FFE0A8" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <path d="M52 88 Q66 72 88 76" fill="none" stroke="#FFE0A8" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <path d="M64 96 Q80 84 100 86" fill="none" stroke="#FFE0A8" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
      <path d="M48 70 Q42 78 46 90" fill="none" stroke="#7A4108" strokeWidth="1.5" opacity="0.55" />
      <path d="M70 60 Q66 78 76 92" fill="none" stroke="#7A4108" strokeWidth="1.5" opacity="0.55" />
      <path d="M92 64 Q90 80 100 90" fill="none" stroke="#7A4108" strokeWidth="1.5" opacity="0.55" />
      <ellipse cx="68" cy="58" rx="20" ry="6" fill="#FFFFFF" opacity="0.18" />
    </svg>
  ),
  icecream: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-icecream-cone" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F2C879" />
          <stop offset="100%" stopColor="#7A4108" />
        </linearGradient>
        <radialGradient id="g-scoop-pink" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFD0DD" />
          <stop offset="100%" stopColor="#D85C8E" />
        </radialGradient>
        <radialGradient id="g-scoop-mint" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#E1F5DA" />
          <stop offset="100%" stopColor="#5C9F66" />
        </radialGradient>
      </defs>
      <path d="M50 70 L70 120 L90 70 Z" fill="url(#g-icecream-cone)" />
      <path d="M52 74 L70 110" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M70 74 L88 70" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M58 80 L82 80" stroke="#7A4108" strokeOpacity="0.5" strokeWidth="1" />
      <circle cx="58" cy="60" r="14" fill="url(#g-scoop-mint)" />
      <circle cx="82" cy="62" r="14" fill="url(#g-scoop-pink)" />
      <ellipse cx="54" cy="54" rx="4" ry="2.5" fill="#FFFFFF" opacity="0.55" />
      <ellipse cx="78" cy="56" rx="4" ry="2.5" fill="#FFFFFF" opacity="0.55" />
      <circle cx="70" cy="50" r="3" fill="#D85C5C" />
      <path d="M70 47 L70 42" stroke="#5C9F66" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  local_bar: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-beer" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFE16E" />
          <stop offset="100%" stopColor="#C77F0F" />
        </linearGradient>
        <linearGradient id="g-glass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.10" />
        </linearGradient>
      </defs>
      <path d="M44 36 H92 L96 100 a10 10 0 0 1 -10 10 H50 a10 10 0 0 1 -10 -10 Z" fill="url(#g-beer)" />
      <ellipse cx="68" cy="36" rx="22" ry="7" fill="#FFFAEC" />
      <ellipse cx="60" cy="32" rx="6" ry="4" fill="#FFFFFF" />
      <ellipse cx="78" cy="34" rx="5" ry="3" fill="#FFFFFF" />
      <ellipse cx="68" cy="30" rx="4" ry="3" fill="#FFFFFF" />
      <path d="M44 36 H92 L96 100 a10 10 0 0 1 -10 10 H50 a10 10 0 0 1 -10 -10 Z" fill="url(#g-glass)" />
      <path d="M50 50 L48 96" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <path d="M92 44 H104 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 H94" fill="none" stroke="#C77F0F" strokeWidth="6" strokeLinecap="round" />
      <circle cx="60" cy="64" r="2" fill="#FFFFFF" opacity="0.7" />
      <circle cx="76" cy="80" r="1.5" fill="#FFFFFF" opacity="0.7" />
    </svg>
  ),
  sports_bar: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-beer2" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFE16E" />
          <stop offset="100%" stopColor="#C77F0F" />
        </linearGradient>
      </defs>
      <path d="M44 36 H92 L96 100 a10 10 0 0 1 -10 10 H50 a10 10 0 0 1 -10 -10 Z" fill="url(#g-beer2)" />
      <ellipse cx="68" cy="36" rx="22" ry="7" fill="#FFFAEC" />
      <ellipse cx="60" cy="32" rx="6" ry="4" fill="#FFFFFF" />
      <ellipse cx="78" cy="34" rx="5" ry="3" fill="#FFFFFF" />
      <path d="M50 50 L48 96" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      <path d="M92 44 H104 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 H94" fill="none" stroke="#C77F0F" strokeWidth="6" strokeLinecap="round" />
      <circle cx="60" cy="64" r="2" fill="#FFFFFF" opacity="0.7" />
      <circle cx="76" cy="80" r="1.5" fill="#FFFFFF" opacity="0.7" />
    </svg>
  ),
  nightlife: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-cocktail" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFA9CD" />
          <stop offset="100%" stopColor="#8851D4" />
        </linearGradient>
      </defs>
      <path d="M28 36 H112 L70 88 Z" fill="url(#g-cocktail)" />
      <path d="M28 36 H112" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      <line x1="70" y1="88" x2="70" y2="116" stroke="#34233E" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="70" cy="118" rx="20" ry="4" fill="#34233E" />
      <path d="M50 50 L70 50" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.55" />
      <line x1="86" y1="32" x2="78" y2="62" stroke="#5C9F66" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="78" cy="62" r="4" fill="#5C9F66" />
      <circle cx="58" cy="56" r="3" fill="#FFEB7E" />
      <ellipse cx="56" cy="50" rx="10" ry="2" fill="#FFFFFF" opacity="0.45" />
    </svg>
  ),
  tapas: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="g-tapas-plate" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C9C0BD" />
        </radialGradient>
      </defs>
      <ellipse cx="70" cy="80" rx="48" ry="14" fill="url(#g-tapas-plate)" />
      <circle cx="50" cy="74" r="8" fill="#D14A2C" />
      <circle cx="48" cy="72" r="3" fill="#FFAE94" opacity="0.7" />
      <circle cx="70" cy="68" r="9" fill="#5C9F66" />
      <circle cx="68" cy="66" r="3" fill="#A8D5B0" opacity="0.7" />
      <circle cx="92" cy="74" r="8" fill="#FFEB7E" />
      <circle cx="90" cy="72" r="3" fill="#FFFAEC" opacity="0.7" />
      <ellipse cx="56" cy="74" rx="10" ry="2.5" fill="#FFFFFF" opacity="0.35" />
    </svg>
  ),
  restaurant: (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="g-rest-plate" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C9C0BD" />
        </radialGradient>
        <radialGradient id="g-rest-dome" cx="50%" cy="0%" r="100%">
          <stop offset="0%" stopColor="#FFD89A" />
          <stop offset="60%" stopColor="#D49A2A" />
          <stop offset="100%" stopColor="#7A4108" />
        </radialGradient>
      </defs>
      <ellipse cx="70" cy="100" rx="54" ry="14" fill="url(#g-rest-plate)" />
      <path d="M22 84 Q70 32 118 84" fill="url(#g-rest-dome)" />
      <circle cx="70" cy="36" r="4" fill="#34233E" />
      <line x1="70" y1="32" x2="70" y2="22" stroke="#34233E" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M40 76 Q70 50 100 76" fill="none" stroke="#FFFAEC" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <path d="M30 84 Q70 90 110 84" stroke="#7A4108" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <ellipse cx="56" cy="100" rx="20" ry="3" fill="#FFFFFF" opacity="0.40" />
    </svg>
  ),
};
export function pickFoodIcon(name, category, vibe) {
  if (!FOOD_VIBES.has(vibe)) return null;
  const text = `${name || ""} ${category || ""}`.toLowerCase();
  if (/ramen|noodle|udon|soba/.test(text))                        return "ramen_dining";
  if (/sushi|sashimi|maki|tempura|izakaya|japanese/.test(text))    return "set_meal";
  if (/poke|rice bowl|donburi|bibimbap/.test(text))                return "rice_bowl";
  if (/soup|pho|chowder|broth|congee/.test(text))                  return "soup_kitchen";
  if (/pizza|pizzeria|slice/.test(text))                           return "local_pizza";
  if (/burger|smashburger|patty/.test(text))                       return "lunch_dining";
  if (/steak|grill|bbq|barbecue|smokehouse|chophouse/.test(text))  return "outdoor_grill";
  if (/fish|seafood|oyster|crab|lobster|shrimp|clam/.test(text))   return "set_meal";
  if (/taco|burrito|taqueria|mexican|tortilla|cantina/.test(text)) return "kebab_dining";
  if (/kebab|kabob|gyro|shawarma|falafel|mediterranean/.test(text)) return "kebab_dining";
  if (/curry|biryani|indian|thai|vietnamese|asian/.test(text))     return "ramen_dining";
  if (/pasta|trattoria|italian|risotto/.test(text))                return "dinner_dining";
  if (/breakfast|brunch|pancake|waffle|eggs|diner/.test(text))     return "brunch_dining";
  if (/bakery|pastry|patisserie|croissant|donut|doughnut|cake/.test(text)) return "bakery_dining";
  if (/ice cream|gelato|sorbet|frozen yogurt|froyo/.test(text))    return "icecream";
  if (/wine|cocktail|whisk|martini|lounge/.test(text))             return "nightlife";
  if (/beer|brewery|brewhouse|pub|tavern/.test(text))              return "sports_bar";
  if (/tapas|small plate|appetizer/.test(text))                    return "tapas";
  return "restaurant"; // generic fallback within the food family
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

export const STOP_TINTS = {
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

export const COLLECTIBLES = {
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
        <linearGradient id="g-art-frame" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFE38C" />
          <stop offset="55%" stopColor="#D49A2A" />
          <stop offset="100%" stopColor="#8E5F08" />
        </linearGradient>
        <linearGradient id="g-art-frame-inner" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8E5F08" />
          <stop offset="100%" stopColor="#FFD879" />
        </linearGradient>
        <linearGradient id="g-art-sky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFD89A" />
          <stop offset="100%" stopColor="#FF9E5C" />
        </linearGradient>
        <linearGradient id="g-art-hill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7DBE89" />
          <stop offset="100%" stopColor="#3D7E48" />
        </linearGradient>
      </defs>
      {/* Hanging cord above the frame */}
      <path d="M62 22 L70 30 L78 22" fill="none" stroke="#34233E" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <circle cx="70" cy="22" r="2" fill="#34233E" opacity="0.7" />
      {/* Outer gold frame */}
      <rect x="22" y="30" width="96" height="84" rx="6" fill="url(#g-art-frame)" />
      {/* Inner inset (darker, for depth) */}
      <rect x="28" y="36" width="84" height="72" rx="2" fill="url(#g-art-frame-inner)" opacity="0.55" />
      {/* Painted canvas — sky */}
      <rect x="32" y="40" width="76" height="34" rx="1" fill="url(#g-art-sky)" />
      {/* Sun glow */}
      <circle cx="92" cy="56" r="9" fill="#FFFFFF" opacity="0.18" />
      <circle cx="92" cy="56" r="6" fill="#FFEB7E" />
      {/* Far hill */}
      <path d="M32 72 Q 58 58 84 64 T 108 68 L 108 86 L 32 86 Z" fill="#A8D5B0" />
      {/* Near hill */}
      <path d="M32 80 Q 52 72 76 80 T 108 84 L 108 100 L 32 100 Z" fill="url(#g-art-hill)" />
      {/* Tree silhouette */}
      <path d="M52 92 L52 78 L48 78 L52 72 L56 78 L52 78 Z" fill="#2A4F2C" opacity="0.85" />
      {/* Painted canvas bottom edge */}
      <rect x="32" y="100" width="76" height="2" rx="1" fill="#5C7E51" opacity="0.6" />
      {/* Frame highlight on top edge */}
      <rect x="22" y="30" width="96" height="3" rx="1.5" fill="#FFF4D9" opacity="0.55" />
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
  Coffee: "local_cafe", "Coffee Shop": "local_cafe", Café: "local_cafe", Cafe: "local_cafe",
  Restaurant: "restaurant", Eatery: "restaurant", Diner: "restaurant",
  Bar: "local_bar", Pub: "local_bar", Brewery: "local_bar",
  "Ice Cream": "icecream", Gelato: "icecream",
  Bakery: "bakery", Pastry: "bakery",
  Bookstore: "menu_book", Bookshop: "menu_book", Books: "menu_book",
  Library: "local_library",
  Theatre: "theater_comedy", Theater: "theater_comedy",
  Florist: "local_florist",
  Museum: "museum", Gallery: "palette", Art: "brush", Arts: "theater_comedy",
  Viewpoint: "landscape", Scenic: "landscape",
  Attraction: "attractions", Monument: "attractions", Landmark: "attractions",
  Park: "park", Trail: "park", Greenway: "park",
  Garden: "yard",
  Market: "storefront", Grocery: "storefront", Shop: "storefront", Store: "storefront", Boutique: "storefront",
};

// Resolve a Material Symbols glyph for a free-form category string
// (e.g. "Coffee Shop", "Italian Restaurant"). Tries exact match first,
// then falls back to a substring scan so variants like "Coffee Shop"
// or "Italian Restaurant" still pick up the right icon. Falls back to
// the generic location pin only when nothing matches.
function categoryIcon(category) {
  if (!category) return "location_on";
  if (CATEGORY_ICONS[category]) return CATEGORY_ICONS[category];
  const cat = String(category).toLowerCase();
  for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
    if (cat.includes(key.toLowerCase())) return icon;
  }
  return "location_on";
}

// Suggested-spot card shown beneath a thumbs-upped revisit card. Visually
// matches HomeScreen's `.location-card` default state — dashed purple
// outline, frosted background, same icon + title + category styling.
function SuggestionCard({ id, name, category, isFaved, onToggleFave }) {
  const iconName = categoryIcon(category);
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
  const iconName = categoryIcon(category);
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
  const foodIconName = pickFoodIcon(stop.name, stop.category, stop.vibe);
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
          {foodIconName && FOOD_COLLECTIBLES[foodIconName]
            ? FOOD_COLLECTIBLES[foodIconName]
            : (COLLECTIBLES[stop.vibe] || FOOD_COLLECTIBLES.restaurant)}
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

// Per-shop coffee variants — picked deterministically by the stop's id so
// repeat visits to the same place keep the same collectible while different
// cafés get different cups (latte / espresso / iced / matcha).
const COFFEE_VARIANTS = [
  COLLECTIBLES.coffee, // latte with cream foam (default)
  // Espresso shot — short ceramic cup, dark crema disc.
  (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-cof2-cup" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C9C0BD" />
        </linearGradient>
        <radialGradient id="g-cof2-crema" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#7A4108" />
          <stop offset="100%" stopColor="#2C1503" />
        </radialGradient>
      </defs>
      <path d="M52 32 C 50 42, 56 50, 52 60" stroke="#D9BEF0" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" fill="none" />
      <path d="M70 28 C 66 38, 74 48, 70 58" stroke="#D9BEF0" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" fill="none" />
      <path d="M88 32 C 84 42, 92 50, 88 60" stroke="#D9BEF0" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" fill="none" />
      <path d="M44 70 H100 V100 a14 14 0 0 1 -14 14 H58 a14 14 0 0 1 -14 -14 Z" fill="url(#g-cof2-cup)" />
      <ellipse cx="72" cy="74" rx="26" ry="5" fill="url(#g-cof2-crema)" />
      <path d="M100 78 H110 a8 8 0 0 1 8 8 v4 a8 8 0 0 1 -8 8 H100" fill="none" stroke="url(#g-cof2-cup)" strokeWidth="6" strokeLinecap="round" />
      <ellipse cx="58" cy="80" rx="8" ry="2.5" fill="#FFFFFF" opacity="0.55" />
      <ellipse cx="80" cy="70" rx="6" ry="1.5" fill="#FFFFFF" opacity="0.5" />
    </svg>
  ),
  // Iced coffee — tall glass with ice cubes + straw.
  (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-cof3-glass" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#C8895A" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#4A2C12" />
        </linearGradient>
      </defs>
      <path d="M48 38 L92 38 L88 116 a8 8 0 0 1 -8 8 H60 a8 8 0 0 1 -8 -8 Z" fill="url(#g-cof3-glass)" />
      <path d="M48 38 L92 38 L88 116 a8 8 0 0 1 -8 8 H60 a8 8 0 0 1 -8 -8 Z" fill="#FFFFFF" opacity="0.18" />
      <rect x="58" y="48" width="10" height="10" rx="2" fill="#FFFFFF" opacity="0.55" />
      <rect x="72" y="58" width="10" height="10" rx="2" fill="#FFFFFF" opacity="0.55" />
      <rect x="62" y="70" width="10" height="10" rx="2" fill="#FFFFFF" opacity="0.45" />
      <rect x="76" y="78" width="9" height="9" rx="2" fill="#FFFFFF" opacity="0.40" />
      <line x1="80" y1="20" x2="80" y2="124" stroke="#5C9F66" strokeWidth="4" strokeLinecap="round" />
      <line x1="80" y1="20" x2="80" y2="124" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
      <path d="M50 50 L 48 110" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    </svg>
  ),
  // Matcha latte — green cup with foam art.
  (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-cof4-cup" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C9C0BD" />
        </linearGradient>
        <radialGradient id="g-cof4-matcha" cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#A8D5B0" />
          <stop offset="100%" stopColor="#4A7A3E" />
        </radialGradient>
      </defs>
      <path d="M50 30 C 46 40, 56 48, 50 58" stroke="#D9BEF0" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" fill="none" />
      <path d="M70 26 C 64 36, 76 46, 70 58" stroke="#D9BEF0" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" fill="none" />
      <path d="M90 30 C 86 40, 94 48, 90 58" stroke="#D9BEF0" strokeWidth="3" strokeOpacity="0.55" strokeLinecap="round" fill="none" />
      <path d="M104 76 h6 a12 12 0 0 1 12 12 v4 a12 12 0 0 1 -12 12 h-6 Z" fill="url(#g-cof4-cup)" />
      <path d="M32 68 H104 V102 a18 18 0 0 1 -18 18 H50 a18 18 0 0 1 -18 -18 Z" fill="url(#g-cof4-cup)" />
      <ellipse cx="68" cy="72" rx="34" ry="5.5" fill="url(#g-cof4-matcha)" />
      <path d="M62 70 Q 68 64 74 70 Q 68 76 62 70 Z" fill="#FFFFFF" opacity="0.65" />
      <path d="M68 64 L 68 76" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.6" />
      <ellipse cx="44" cy="78" rx="8" ry="2" fill="#FFFFFF" opacity="0.4" />
    </svg>
  ),
];

// Per-park flower variants — different blooms (cherry blossom, tulip,
// sunflower) keyed off the stop id so each park reads as its own flower.
const PARK_VARIANTS = [
  COLLECTIBLES.park, // purple petal flower (default)
  // Cherry blossom — light pink petals around small yellow centre.
  (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="g-cherry-petal" cx="30%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFE9F2" />
          <stop offset="55%" stopColor="#FFB7CE" />
          <stop offset="100%" stopColor="#D85C8E" />
        </radialGradient>
        <linearGradient id="g-cherry-branch" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5A4632" />
          <stop offset="100%" stopColor="#2C1F12" />
        </linearGradient>
      </defs>
      <path d="M22 116 Q 60 92 100 90 Q 120 88 122 80" fill="none" stroke="url(#g-cherry-branch)" strokeWidth="5" strokeLinecap="round" />
      <g transform="translate(78 60)">
        <path d="M0 -22 Q 8 -20 8 -10 Q 0 -6 -8 -10 Q -8 -20 0 -22 Z" fill="url(#g-cherry-petal)" />
        <path d="M22 -10 Q 24 0 16 6 Q 8 4 8 -4 Q 14 -12 22 -10 Z" fill="url(#g-cherry-petal)" />
        <path d="M14 18 Q 20 24 12 28 Q 4 28 4 20 Q 8 14 14 18 Z" fill="url(#g-cherry-petal)" />
        <path d="M-14 18 Q -20 24 -12 28 Q -4 28 -4 20 Q -8 14 -14 18 Z" fill="url(#g-cherry-petal)" />
        <path d="M-22 -10 Q -24 0 -16 6 Q -8 4 -8 -4 Q -14 -12 -22 -10 Z" fill="url(#g-cherry-petal)" />
        <circle r="6" fill="#FFE36B" />
        <circle r="2.5" fill="#B8500A" />
      </g>
      <circle cx="44" cy="100" r="4" fill="url(#g-cherry-petal)" />
      <circle cx="56" cy="92" r="3.5" fill="url(#g-cherry-petal)" />
      <circle cx="100" cy="68" r="3.5" fill="url(#g-cherry-petal)" />
      <circle cx="42" cy="84" r="3" fill="url(#g-cherry-petal)" />
    </svg>
  ),
  // Tulip — red cup-shaped bloom with green stem and leaf.
  (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <linearGradient id="g-tulip-bloom" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FF8B8B" />
          <stop offset="60%" stopColor="#D14A2C" />
          <stop offset="100%" stopColor="#7A1F12" />
        </linearGradient>
        <linearGradient id="g-tulip-stem" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7DBE89" />
          <stop offset="100%" stopColor="#3D7E48" />
        </linearGradient>
      </defs>
      <path d="M70 124 L 70 56" stroke="url(#g-tulip-stem)" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M70 92 Q 50 78 38 96 Q 38 102 50 100 Q 64 98 70 92 Z" fill="url(#g-tulip-stem)" />
      <path d="M50 60 Q 50 28 70 28 Q 90 28 90 60 Q 90 70 78 60 Q 70 78 62 60 Q 50 70 50 60 Z" fill="url(#g-tulip-bloom)" />
      <path d="M70 30 L 70 60" stroke="#FFFFFF" strokeOpacity="0.4" strokeWidth="1.5" />
      <ellipse cx="60" cy="40" rx="6" ry="3" fill="#FFFFFF" opacity="0.45" />
    </svg>
  ),
  // Sunflower — yellow petals around dark brown centre.
  (
    <svg viewBox="0 0 140 140" width="100%" height="100%" aria-hidden="true">
      <defs>
        <radialGradient id="g-sun-petal" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#FFF6A8" />
          <stop offset="60%" stopColor="#FFC84A" />
          <stop offset="100%" stopColor="#A66800" />
        </radialGradient>
        <radialGradient id="g-sun-center" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#7A4108" />
          <stop offset="100%" stopColor="#2C1503" />
        </radialGradient>
        <linearGradient id="g-sun-stem" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7DBE89" />
          <stop offset="100%" stopColor="#3D7E48" />
        </linearGradient>
      </defs>
      <path d="M70 124 L 70 60" stroke="url(#g-sun-stem)" strokeWidth="5" strokeLinecap="round" fill="none" />
      <ellipse cx="56" cy="98" rx="9" ry="6" fill="url(#g-sun-stem)" transform="rotate(-25 56 98)" />
      <g transform="translate(70 56)">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <ellipse key={a} cx="0" cy="-22" rx="8" ry="14" fill="url(#g-sun-petal)" transform={`rotate(${a})`} />
        ))}
        <circle r="14" fill="url(#g-sun-center)" />
        <circle r="4" cx="-3" cy="-3" fill="#FFFFFF" opacity="0.30" />
      </g>
    </svg>
  ),
];

// Stable hash → variant index. Same id always maps to the same variant so
// the user sees a consistent collectible per stop across rerenders.
function variantIndex(id, count) {
  const s = String(id || "");
  let hash = 5381;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) + hash + s.charCodeAt(i)) | 0;
  return Math.abs(hash) % count;
}

// Helper used by other screens (e.g., ProgressScreen) to render the same
// collectible illustration that the trail uses for a given stop. Picks a
// food-specific SVG when the stop's name resolves to a food kind; for
// coffee + park vibes, picks a deterministic variant by the stop's id;
// falls back to the curated COLLECTIBLES vibe artwork otherwise. Ice
// cream is detected explicitly because VIBE_BY_CATEGORY lumps it under
// "coffee" — without this guard, an ice-cream stop would render a coffee
// cup instead of a cone.
export function getStopCollectible(stop) {
  if (!stop) return null;
  const text = `${stop.name || ""} ${stop.desc || stop.category || ""}`.toLowerCase();
  if (/ice cream|gelato|sorbet|frozen yogurt|froyo|creamery/.test(text)) {
    return FOOD_COLLECTIBLES.icecream;
  }
  // Bakery is folded into the coffee vibe in VIBE_BY_CATEGORY too — short-
  // circuit so a pastry shop renders a croissant instead of a coffee cup.
  if (/bakery|patisserie|pastry|donut|doughnut|croissant|cake/.test(text)) {
    return FOOD_COLLECTIBLES.bakery_dining;
  }
  const vibe = stop.vibe || vibeFor(stop.desc || stop.category, stop.name);
  if (vibe === "coffee") {
    return COFFEE_VARIANTS[variantIndex(stop.id, COFFEE_VARIANTS.length)];
  }
  if (vibe === "park") {
    return PARK_VARIANTS[variantIndex(stop.id, PARK_VARIANTS.length)];
  }
  const foodIcon = pickFoodIcon(stop.name, stop.desc || stop.category, vibe);
  if (foodIcon && FOOD_COLLECTIBLES[foodIcon]) return FOOD_COLLECTIBLES[foodIcon];
  return COLLECTIBLES[vibe] || FOOD_COLLECTIBLES.restaurant;
}

// Returns the STOP_TINTS gradient for a given stop's vibe — used by other
// screens to back-fill the round chip behind a collectible so it matches
// the trail's vocabulary on the reward screen.
export function getStopTint(stop) {
  if (!stop) return STOP_TINTS.park;
  const vibe = stop.vibe || vibeFor(stop.desc || stop.category, stop.name);
  return STOP_TINTS[vibe] || STOP_TINTS.park;
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
  onSeeProgress, // open the per-category exploration-progress screen
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
  // We key the effect off a stable string of stop ids (plus the vibe) so the
  // fetch doesn't re-trigger every time `walkData` is rebuilt by an upstream
  // state tick (e.g., dwell-time updates), which otherwise caused the bg to
  // flash back to the fallback mid-view.
  const fallbackBg = HERO_BG_IMAGES[hero.vibe] || HERO_BG_IMAGES.park;
  const [bgImage, setBgImage] = useState(fallbackBg);
  const bgKey = useMemo(
    () => walkData.stops.map((s) => s.id).join("|") + "::" + hero.vibe,
    [walkData.stops, hero.vibe]
  );
  useEffect(() => {
    setBgImage(fallbackBg);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgKey]);

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
    <div
      className={`reward-screen reward-screen--${hero.vibe}`}
      style={{ background: STOP_TINTS[hero.vibe] || STOP_TINTS.park }}
    >
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
          {(() => {
            // Build the snaking dotted path procedurally so it always
            // starts at the first stop and ends at the last, regardless
            // of how many stops the user actually visited. Each segment
            // is a smooth S-curve between alternating left / right rows,
            // mirroring the .reward-trail-row layout.
            const n = walkData.stops.length;
            const top = 60;
            const pitch = 160;
            const xL = 70;
            const xR = 210;
            const totalH = top + Math.max(0, n - 1) * pitch + 100;
            const stops = Array.from({ length: n }, (_, i) => ({
              x: i % 2 === 0 ? xL : xR,
              y: top + i * pitch,
            }));
            let d = "";
            if (stops.length > 0) {
              d = `M ${stops[0].x} ${stops[0].y}`;
              for (let i = 1; i < stops.length; i++) {
                const p = stops[i - 1];
                const c = stops[i];
                const cp1y = p.y + 70;
                const cp2y = c.y - 70;
                d += ` C ${p.x} ${cp1y}, ${c.x} ${cp2y}, ${c.x} ${c.y}`;
              }
            }
            return (
              <svg
                className="reward-trail-path"
                viewBox={`0 0 280 ${totalH}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {n >= 2 && (
                  <path
                    d={d}
                    stroke="#8851D4"
                    strokeWidth="2"
                    strokeDasharray="3 7"
                    strokeLinecap="round"
                    fill="none"
                    opacity="0.55"
                  />
                )}
              </svg>
            );
          })()}
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
            onClick={onSeeProgress || onComplete}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {/* Open treasure chest: raised lid + clasp loop + bumpy treasure
                  mound + body with U-shaped lock plate and prominent keyhole. */}
              <path d="M3 8 Q3 3 8 3 L16 3 Q21 3 21 8 L21 10 L3 10 Z" />
              <path d="M11 10 V11.5 Q11 12 11.5 12 H12.5 Q13 12 13 11.5 V10" />
              <path d="M3 13.5 Q5.5 10.5 8 12.5 Q10 10 12 12.5 Q14 10 16 12.5 Q18.5 10.5 21 13.5" />
              <path d="M3 13.5 V20 Q3 21 4 21 H20 Q21 21 21 20 V13.5" />
              <path d="M10.5 14.5 V18.5 Q10.5 19.5 11.5 19.5 H12.5 Q13.5 19.5 13.5 18.5 V14.5" />
              <circle cx="12" cy="16.5" r="0.85" fill="currentColor" stroke="none" />
              <line x1="12" y1="17.2" x2="12" y2="18.4" />
            </svg>
            <span>See my exploration collection so far</span>
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
