const API_KEY = process.env.REACT_APP_GEMINI_API_KEY;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELS = ["gemini-2.5-flash-lite"];

// Map of PreferencesScreen filter ids → human-readable category names that
// Gemini can lean toward when suggesting places. We deliberately omit the
// always-on display-only filters ("ai-highlights", "saved-places") since
// they're not place categories.
const FILTER_LABEL = {
  attractions:    "attractions and sights",
  benches:        "benches and picnic areas",
  cafes:          "cafés",
  "dog-friendly": "dog-friendly spots",
  food:           "food and restaurants",
  museums:        "museums",
  sights:         "sights and viewpoints",
  parks:          "parks and gardens",
};
const DESTINATION_LABEL = {
  loop:     "loop (start and end in the same place)",
  open:     "open exploration (no fixed end point)",
  specific: "ends at a specific place or neighborhood",
};

export function buildSystemPrompt({ userLocation, journeyItems, elapsedMinutes, currentStopIndex, totalStops, mode = 'pre-walk', vibePreferences = null, preferences = null }) {
  const stopsDescription = journeyItems
    .map((item, i) => `${i + 1}. ${item.name}${item.desc ? ` (${item.desc})` : ''}`)
    .join('\n');

  const stopsSection = stopsDescription
    ? `- Journey stops:\n${stopsDescription}`
    : '- No journey planned yet — the user is exploring freely';

  // Quiz now emits binary +1 / -1 per card (up = yes, down = no) across the
  // card's vibe tags. Score magnitude reflects how many yes/no votes landed on
  // that vibe across the deck.
  let vibeSection = '';
  if (vibePreferences && vibePreferences.vibeScores) {
    const sorted = Object.entries(vibePreferences.vibeScores).sort((a, b) => b[1] - a[1]);
    const loves = sorted.filter(([, s]) => s >= 2).map(([v]) => v);
    const likes = sorted.filter(([, s]) => s === 1).map(([v]) => v);
    const dislikes = sorted.filter(([, s]) => s <= -1).map(([v]) => v);
    const parts = [];
    if (loves.length) parts.push(`strongly prefers ${loves.join(', ')}`);
    if (likes.length) parts.push(`likes ${likes.join(', ')}`);
    if (dislikes.length) parts.push(`avoids ${dislikes.join(', ')}`);
    if (parts.length) {
      vibeSection = `\n- Vibe preferences (from quiz): ${parts.join('; ')}. Prioritize suggestions matching preferred vibes; avoid disliked ones unless nothing else fits.`;
    }
  }

  // Saved preferences from PreferencesScreen — only render lines that are set.
  let constraintsSection = '';
  if (preferences) {
    const lines = [];
    if (preferences.destination && DESTINATION_LABEL[preferences.destination]) {
      lines.push(`  · Type of walk: ${DESTINATION_LABEL[preferences.destination]}`);
    }
    const dur = preferences.customDuration || preferences.duration;
    if (dur) lines.push(`  · Duration: ≤ ${dur}`);
    if (preferences.distance != null && preferences.distance !== '') {
      lines.push(`  · Distance: ≤ ${preferences.distance} km`);
    }
    if (Array.isArray(preferences.accessibility) && preferences.accessibility.length) {
      lines.push(`  · Accessibility: ${preferences.accessibility.join(', ')}`);
    }
    if (Array.isArray(preferences.avoidances) && preferences.avoidances.length) {
      lines.push(`  · Avoid: ${preferences.avoidances.join(', ')}`);
    }
    if (Array.isArray(preferences.mapFilters) && preferences.mapFilters.length) {
      const cats = preferences.mapFilters
        .map((id) => FILTER_LABEL[id])
        .filter(Boolean);
      if (cats.length) lines.push(`  · Categories the user is interested in: ${cats.join(', ')}`);
    }
    if (lines.length) {
      constraintsSection =
        `\n- Saved preferences:\n${lines.join('\n')}\n` +
        `Honor these strictly: stay under the duration if set, lean toward the listed categories, and skip places matching any avoidance.`;
    }
  }

  const duringWalkActionRules = mode === 'during-walk' ? `

You are now in DURING-WALK voice-edit mode. The user is already walking and wants to modify the journey by voice. In addition to the 📍 add-place list described above, you MUST emit edit commands for any removals or reorders, each on its own line, using EXACTLY these formats:

REMOVE: <exact stop name as listed above>
REORDER: [Name1, Name2, Name3]

Rules:
- ADD a stop: use the existing 📍 format. The app will geocode and append it.
- REMOVE a stop: emit "REMOVE: <name>" matching the stop name exactly as it appears in the journey stops list. One REMOVE line per stop.
- REORDER stops: emit a single "REORDER: [...]" line listing ALL current stops in the desired new order. Use exact stop names.
- You may emit any combination (e.g. a REMOVE and several 📍 adds in one response).
- If the user is just chatting and doesn't want to edit, omit all action tags.` : '';

  return `You are an assistant that recommends real walkable places near the user.

CONTEXT
User GPS location (decimal degrees, lat, lng): ${userLocation[0].toFixed(6)}, ${userLocation[1].toFixed(6)}
The user is ON FOOT planning a short walking tour from this exact GPS position. Treat it as the trip start.
${stopsSection}${vibeSection}${constraintsSection}

Response rules:
- OPEN with ONE warm sentence that (a) acknowledges the search, (b) references the user's past searches and saved preferences if any are noted above, and (c) names the FIRST (closest) suggested place by name plus a brief reason. Example shape: "Based on your past searches and your love of cozy cafés, I'd suggest starting with Cheese Board Pizza — legendary slices and a live jazz vibe."
- That single sentence is the entire prose intro — do NOT add a second intro sentence and do NOT continue with prose. Jump straight to the bullet list of places after it.
- Suggest 5-8 specific, real places per response. More is better.
- For each place: just the name and one short reason to visit (under 10 words).
- WALKING TOUR ONLY: every place MUST be within a 30 minute walk of the user's GPS location (≈ 2.4 km). NEVER suggest anything beyond 2.4 km — verify each one before adding.
- Sort by walking distance from the user, CLOSEST FIRST. The first bullet MUST be one of the nearest places (within a few minutes' walk); subsequent bullets walk progressively outward but never past the 2.4 km cap. The 📍 list at the end must follow the exact same closest-to-farthest order.
- Format each place as a bullet with the reason inline.

CRITICAL: After your response, you MUST append a place list using EXACTLY this format:

📍 Place Name, City | Category | lat, lng

Rules:
- One 📍 line per place, on its own line
- Use the simplest searchable name (no special chars, no parentheses)
- Always include city/neighborhood after comma
- Use names that appear on Google Maps or OpenStreetMap
- The trailing "lat, lng" MUST be the EXACT GPS coordinates that Google Maps displays for that specific business/landmark — i.e. the lat/lng you would see if you searched the place on Google Maps and read the URL or "What's here?" pin. NOT the city center, NOT a street-block approximation, NOT a neighborhood centroid. Pin the precise building/storefront/park-entrance the place actually occupies on Google Maps.
- 6 decimal places of precision (≈ 0.1 m). Example: Ippuku in Berkeley is 37.868194, -122.259497 on Google Maps — that level of precision, not 37.87, -122.26.
- If you are not confident in the exact Google Maps coordinates for a place, DO NOT suggest that place — pick a different one you know precisely. A wrong-pin suggestion is worse than fewer suggestions.
- These coords are used DIRECTLY to drop the pin (no geocoding fallback). NEVER omit the coords. NEVER round, NEVER guess, NEVER use the same coords for two places.

Example response:
"Here are some great spots near you:
- Ippuku — authentic Japanese izakaya
- Cheese Board Pizza — legendary pizza with live jazz
- Tilden Regional Park — beautiful trails with bay views
- Jupiter — craft beer and outdoor patio
- Pegasus Books — charming indie bookstore

📍 Ippuku, Berkeley | Restaurant | 37.868194, -122.259497
📍 Cheese Board Pizza, Berkeley | Restaurant | 37.880003, -122.269078
📍 Tilden Regional Park, Berkeley | Park | 37.892312, -122.241546
📍 Jupiter, Berkeley | Bar | 37.870892, -122.268486
📍 Pegasus Books, Berkeley | Bookstore | 37.874821, -122.268339"

You MUST include the 📍 list whenever you suggest places. No exceptions.${duringWalkActionRules}`;
}

// Slim, tone-free system prompt for the conversational reel in the bottom
// widget. Pure instructions: location-aware, preference-aware, location-list
// emitting. Used by WalkCompanionWidget's askAi (NOT by HomeScreen chat).
export function buildConversationPrompt({ userLocation, area, vibePreferences, preferences, query }) {
  const lat = userLocation?.[0];
  const lng = userLocation?.[1];
  const hasGps = typeof lat === "number" && typeof lng === "number" && (lat !== 0 || lng !== 0);
  const coords = hasGps ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "unknown";
  const where = area || "an unknown location";

  // Vibe preferences (quiz-derived)
  let vibeLine = "";
  if (vibePreferences?.vibeScores) {
    const sorted = Object.entries(vibePreferences.vibeScores).sort((a, b) => b[1] - a[1]);
    const loves = sorted.filter(([, s]) => s >= 2).map(([v]) => v);
    const likes = sorted.filter(([, s]) => s === 1).map(([v]) => v);
    const dislikes = sorted.filter(([, s]) => s <= -1).map(([v]) => v);
    const parts = [];
    if (loves.length) parts.push(`loves ${loves.join(", ")}`);
    if (likes.length) parts.push(`likes ${likes.join(", ")}`);
    if (dislikes.length) parts.push(`avoids ${dislikes.join(", ")}`);
    if (parts.length) vibeLine = `\nUser vibe: ${parts.join("; ")}.`;
  }

  // Saved preferences (PreferencesScreen)
  let prefLines = "";
  if (preferences) {
    const lines = [];
    if (Array.isArray(preferences.mapFilters) && preferences.mapFilters.length) {
      const cats = preferences.mapFilters.map((id) => FILTER_LABEL[id]).filter(Boolean);
      if (cats.length) lines.push(`User's preferred categories: ${cats.join(", ")}.`);
    }
    if (Array.isArray(preferences.avoidances) && preferences.avoidances.length) {
      lines.push(`User avoids: ${preferences.avoidances.join(", ")}.`);
    }
    if (lines.length) prefLines = "\n" + lines.join("\n");
  }

  return `You are an assistant that recommends real walkable places near the user.

User location: ${where}
GPS (lat, lng): ${coords}${vibeLine}${prefLines}

User said: "${query || ""}"

Reply rules:
- Respond like a friendly local: a short, helpful suggestion in 2 sentences max (≤ 40 words total).
- The suggestion can be conceptual ("a quiet park bench", "people-watching with an iced coffee") OR a real specific place — your call based on what fits the user's request and preferences. You do NOT have to name a specific business every time.
- HARD WALKING RANGE: in this conversational mode, every specific place you recommend MUST be within a **15–20 minute walk (~1.2–1.6 km)** of the user's GPS coordinates. Never name anywhere farther — pick a closer alternative or stay conceptual instead.
- ALWAYS end the response with a brief, open-ended follow-up question that invites the user to keep talking (e.g. "Want me to find one nearby?", "Coffee or tea kind of mood?", "Looking for something quieter or more lively?"). Keep the question under 10 words.
- HARD REQUIREMENT — 📍 LINE: if you name ANY specific real place by name in your reply, the FINAL line of your response MUST be:
  📍 Place Name, Neighborhood | Category | lat, lng

  Coordinates rules (zero tolerance):
  · The lat, lng MUST be the EXACT Google-Maps coordinates for that specific place — what you'd see in the URL when searching the business / landmark on Google Maps.
  · ACCURACY REQUIREMENT: the pin must be within 10 metres of the venue's actual front door / pin location on Google Maps. That means at least 5 decimal places (1e-5° ≈ 1.1 m at this latitude); use 6 decimal places (e.g. 37.871234, -122.265432). Never round to 2-3 decimals — that's a 100m+ error and makes the pin land in the wrong block.
  · If you are not sure of the exact coordinates within 10 m, DO NOT name the place — give a conceptual suggestion instead. A conceptual reply is always better than a misplaced pin.
  · The pin MUST be within a 15–20 minute walk (~1.2–1.6 km) of the user's GPS coordinates listed above. Never beyond.
  · Category is a single word: Cafe, Restaurant, Park, Bookstore, Bar, Bakery, Museum, Viewpoint, Gallery, etc.

  CRITICAL: in the 📍 line, "Place Name" is ONLY the venue's actual name. Never include verbs like "Try", "Visit", "Check out" — those belong in the prose, not the pin.

  Example (good):
  You'll love Cheese Board Pizza — legendary slices and live jazz on the patio. Want a sweeter follow-up?
  📍 Cheese Board Pizza, Berkeley | Restaurant | 37.880003, -122.269078

  Example (good, conceptual — no 📍):
  How about a quiet bench in a leafy plaza nearby — perfect for people-watching with a coffee. Want me to find one?

  Example (BAD — verb glued to name):
  Try Art of Tea for a quiet, bookish atmosphere…
  📍 Try Art, Berkeley | Cafe | 37.87, -122.26   ← WRONG. Should be: 📍 Art of Tea, Berkeley | Cafe | 37.871234, -122.265432

- If your suggestion is conceptual ("a quiet bench", "a sunny patio") and you do NOT name a specific real venue, OMIT the 📍 line.
- If GPS is "unknown", OMIT the 📍 line entirely (keep the prose + question).
- No preamble like "Here are…" or "Sure!". No markdown, no bullet lists, no quotes around place names.`;
}

// Extract place suggestions from AI response text. Each place gets:
//   { name, desc, reason, hintLat, hintLng }
// `reason` is matched from the inline bullet list ("- Place Name — reason").
// `hintLat`/`hintLng` come from the optional 4th `📍` field — Gemini's best-guess
// coordinates that the app uses to bias + validate the geocoder.
export function extractPlaces(text) {
  const lines = text.split('\n');
  const bullets = [];
  for (const line of lines) {
    const m = line.match(/^\s*[-•*]\s+(.+?)\s+(?:—|–|-{1,2})\s+(.+?)\s*$/);
    if (m) bullets.push({ name: m[1].trim(), reason: m[2].trim() });
  }
  const places = [];
  for (const line of lines) {
    // 📍 Name, City | Category [| lat, lng]
    const match = line.match(/📍\s*(.+?)\s*\|\s*([^|]+?)(?:\s*\|\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?))?\s*$/);
    if (!match) continue;
    const name = match[1].trim();
    const desc = match[2].trim();
    const hintLat = match[3] != null ? parseFloat(match[3]) : null;
    const hintLng = match[4] != null ? parseFloat(match[4]) : null;
    const shortName = name.split(',')[0].trim().toLowerCase();
    const matched = bullets.find((b) => {
      const bn = b.name.toLowerCase();
      return bn === shortName || bn.includes(shortName) || shortName.includes(bn);
    });
    places.push({ name, desc, reason: matched?.reason || null, hintLat, hintLng });
  }
  return places;
}

// Strip the 📍 and action lines from the display text, then keep the warm
// intro and drop any inline bullet list of places (the cards already show
// those). Stop at the first bullet marker ("- foo", "* foo", "• foo") OR
// at a colon that introduces a list. Otherwise keep the full prose intro
// (one or two sentences) so the suggestion rationale isn't truncated.
export function cleanResponseText(text) {
  let cleaned = text
    .split('\n')
    .filter(line => !line.match(/^📍\s/) && !line.match(/^REMOVE:\s/i) && !line.match(/^REORDER:\s/i))
    .join(' ')
    .trim();
  // Trim at the first colon-then-bullet ("Here are some cafés: -") OR the
  // first standalone bullet (" - foo") — those mark where the place list
  // begins inline. Whichever comes first wins.
  const colonBullet = cleaned.search(/:\s+[-•*]\s/);
  const bulletStart = cleaned.search(/(?:^|\s)[-•*]\s+\S/);
  let cut = -1;
  if (colonBullet >= 0) cut = colonBullet + 1; // include the colon
  if (bulletStart >= 0 && (cut < 0 || bulletStart < cut)) cut = bulletStart;
  if (cut > 0) cleaned = cleaned.slice(0, cut).trim();
  return cleaned;
}

// Extract edit actions from during-walk AI responses.
// Returns { adds: [{name, desc}], removes: [name], reorder: [name, ...] | null }
export function extractActions(text) {
  const adds = extractPlaces(text);
  const removes = [];
  let reorder = null;

  for (const line of text.split('\n')) {
    const remMatch = line.match(/^REMOVE:\s*(.+)$/i);
    if (remMatch) {
      removes.push(remMatch[1].trim());
      continue;
    }
    const reoMatch = line.match(/^REORDER:\s*\[(.+)\]\s*$/i);
    if (reoMatch) {
      reorder = reoMatch[1].split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  return { adds, removes, reorder };
}

// Clean up place name for geocoding
function cleanPlaceName(name) {
  // Remove parenthetical like "(Campanile)" or "(New)"
  let clean = name.replace(/\s*\([^)]*\)/g, '').trim();
  // Remove "The " prefix
  clean = clean.replace(/^The\s+/i, '');
  return clean;
}

// Geocode a place name using Nominatim (OpenStreetMap).
// `hintLat`/`hintLng` (when given) are Gemini's best-guess coords. We use them
// to (a) tighten the Nominatim viewbox around the hint instead of the user, and
// (b) sanity-check the result — if the geocode lands more than ~1.5 km from the
// hint, it's almost certainly the wrong "Berkeley Bowl" (Phoenix vs Berkeley),
// so we reject it and fall through to the next query variant.
const HINT_REJECT_KM = 3.0;
function _haversineKm(aLat, aLon, bLat, bLon) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLon - aLon);
  const s = Math.sin(dLat/2)**2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng/2)**2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

export async function geocodePlace(name, nearLat, nearLon, hintLat = null, hintLng = null) {
  const cleanName = cleanPlaceName(name);
  // Dedup query variants — short names often collapse cleanName / split(',')[0].
  const queries = Array.from(new Set([cleanName, cleanName.split(',')[0], name].filter(Boolean)));
  // Bias search around the hint when present, otherwise the user's own location.
  const centerLat = hintLat != null ? hintLat : nearLat;
  const centerLon = hintLng != null ? hintLng : nearLon;
  // Tighter viewbox when we have a hint (~5 km box) — broader otherwise (~33 km box).
  const halfDeg = hintLat != null ? 0.05 : 0.15;

  // Pass 1: viewbox-biased near the hint/user. Pass 2 (fallback): no viewbox,
  // biased only by user lat/lon — catches places where Gemini's hint was off.
  const passes = [
    { useBox: true, near: false },
    { useBox: false, near: true },
  ];

  for (const pass of passes) {
    for (const q of queries) {
      try {
        const encoded = encodeURIComponent(q);
        const url = pass.useBox
          ? `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&viewbox=${centerLon - halfDeg},${centerLat + halfDeg},${centerLon + halfDeg},${centerLat - halfDeg}&bounded=0`
          : `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;
        const res = await fetch(url, { headers: { "User-Agent": "StrolloApp/1.0" } });
        const data = await res.json();
        if (data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          // Hint-based hallucination check: reject results far from Gemini's guess.
          // Pass 2 (no viewbox) checks against the user's own location instead — keeps
          // wrong-city results out while still tolerating mildly-off hints.
          const refLat = pass.near ? nearLat : hintLat;
          const refLon = pass.near ? nearLon : hintLng;
          if (refLat != null && refLon != null) {
            const distKm = _haversineKm(lat, lng, refLat, refLon);
            const cap = pass.near ? 5.0 : HINT_REJECT_KM;
            if (distKm > cap) {
              console.warn(`[Strollo] Geocode for "${q}" landed ${distKm.toFixed(2)} km from ${pass.near ? 'user' : 'hint'} — rejecting.`);
              await new Promise(r => setTimeout(r, 1100));
              continue;
            }
          }
          console.log(`[Strollo] Geocoded "${q}" →`, data[0].display_name);
          return { lat, lng, displayName: data[0].display_name };
        }
      } catch (err) {
        console.warn(`[Strollo] Geocode error for "${q}":`, err);
      }
      await new Promise(r => setTimeout(r, 1100));
    }
  }
  console.warn(`[Strollo] Could not geocode: "${name}"`);
  return null;
}

// Get walking route between two points via OSRM (with turn-by-turn steps)
export async function getWalkingRoute(points) {
  if (points.length < 2) return [];
  const coords = points.map(p => `${p[1]},${p[0]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code === 'Ok' && data.routes.length > 0) {
    const route = data.routes[0];
    const steps = (route.legs || []).flatMap(leg => leg.steps || []).map(s => ({
      distance: s.distance,
      duration: s.duration,
      maneuver: {
        type: s.maneuver?.type,
        modifier: s.maneuver?.modifier,
        location: s.maneuver?.location, // [lng, lat]
      },
    }));
    return {
      coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distance: route.distance,
      duration: route.duration,
      steps,
    };
  }
  return null;
}

// Fetch nearby places via the /api/overpass server-side proxy. We can't
// hit Overpass directly from the browser: kumi.systems is offline and
// overpass-api.de doesn't set CORS headers, so the request is blocked
// before a response can be read. The proxy fans out to multiple mirrors
// server-side and returns the first that succeeds.
export async function fetchNearbyPlaces(lat, lon, radiusMeters = 800, { signal } = {}) {
  const query = `[out:json][timeout:6];(node["amenity"~"cafe|restaurant|bar|ice_cream|bakery|library|theatre"](around:${radiusMeters},${lat},${lon});node["tourism"~"museum|gallery|attraction|viewpoint"](around:${radiusMeters},${lat},${lon});node["leisure"~"park|garden"](around:${radiusMeters},${lat},${lon});node["shop"~"books|florist"](around:${radiusMeters},${lat},${lon}););out body 40;`;

  const categoryMap = {
    cafe: "Coffee", restaurant: "Restaurant", bar: "Bar",
    ice_cream: "Ice Cream", bakery: "Bakery", books: "Bookstore",
    library: "Library", theatre: "Theatre", florist: "Florist",
    museum: "Museum", gallery: "Gallery", artwork: "Art",
    viewpoint: "Viewpoint", attraction: "Attraction",
    arts_centre: "Arts", park: "Park", garden: "Garden",
  };

  let res;
  try {
    res = await fetch("/api/overpass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal,
    });
  } catch (err) {
    if (signal?.aborted || err?.name === "AbortError") {
      const e = new Error("Aborted");
      e.name = "AbortError";
      throw e;
    }
    throw new Error("All Overpass endpoints unavailable");
  }

  if (!res.ok) throw new Error("All Overpass endpoints unavailable");
  const data = await res.json();
  return data.elements
    .filter((el) => el.tags?.name)
    .map((el) => {
      const tag = el.tags.amenity || el.tags.tourism || el.tags.leisure || el.tags.shop || "";
      return {
        id: el.id,
        name: el.tags.name,
        desc: categoryMap[tag] || tag || "Place",
        lat: el.lat,
        lng: el.lon,
        hours: el.tags.opening_hours || null,
        website: el.tags.website || el.tags["contact:website"] || null,
        phone: el.tags.phone || el.tags["contact:phone"] || null,
      };
    });
}

export async function sendMessage(conversationHistory, systemPrompt) {
  const contents = conversationHistory.map(msg => ({
    role: msg.role === 'ai' ? 'model' : 'user',
    parts: [{ text: msg.text }]
  }));

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 4096,
    }
  };

  for (const model of MODELS) {
    const url = `${GEMINI_BASE}/${model}:generateContent`;
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
        body: JSON.stringify(body)
      });

      if (res.status === 503 && attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }

      if (res.status === 503) break; // try next model

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini API error ${res.status}: ${err}`);
      }

      const data = await res.json();
      // Thinking models (e.g. 2.5 Flash) emit a thought part before the real
      // response. Skip parts with thought:true and join the rest.
      const rawParts = data.candidates?.[0]?.content?.parts || [];
      const text = rawParts.filter(p => !p.thought).map(p => p.text || '').join('').trim()
        || rawParts[0]?.text;
      if (text) return text;
      console.warn(`Model ${model} returned empty response, trying next...`);
      break;
    }
    console.warn(`Model ${model} unavailable, trying fallback...`);
  }
  throw new Error("Gemini is busy right now. Please try again in a moment.");
}
