const API_KEY = process.env.REACT_APP_GEMINI_API_KEY;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"];

export function buildSystemPrompt({ userLocation, journeyItems, elapsedMinutes, currentStopIndex, totalStops }) {
  const stopsDescription = journeyItems
    .map((item, i) => `${i + 1}. ${item.name}${item.desc ? ` (${item.desc})` : ''}`)
    .join('\n');

  const stopsSection = stopsDescription
    ? `- Journey stops:\n${stopsDescription}`
    : '- No journey planned yet — the user is exploring freely';

  return `You are Strollo, a walking companion AI. You help users discover places to walk to.

User location: ${userLocation[0].toFixed(4)}, ${userLocation[1].toFixed(4)}
${stopsSection}

Response rules:
- Be CONCISE. Max 1-2 short sentences of intro, then jump straight to places.
- Suggest 5-8 specific, real places per response. More is better.
- For each place: just the name and one short reason to visit (under 10 words).
- Only suggest places that actually exist and are within 2km (~25 min walk) of the user's location.
- The total walk including all stops must be under 2 hours. Do NOT suggest places far away.
- Format each place as a bullet with the reason inline.

CRITICAL: After your response, you MUST append a place list using EXACTLY this format:

📍 Place Name, City | Category

Rules:
- One 📍 line per place, on its own line
- Use the simplest searchable name (no special chars, no parentheses)
- Always include city/neighborhood after comma
- Use names that appear on Google Maps or OpenStreetMap

Example response:
"Here are some great spots near you:
- Ippuku — authentic Japanese izakaya
- Cheese Board Pizza — legendary pizza with live jazz
- Tilden Regional Park — beautiful trails with bay views
- Jupiter — craft beer and outdoor patio
- Pegasus Books — charming indie bookstore

📍 Ippuku, Berkeley | Restaurant
📍 Cheese Board Pizza, Berkeley | Restaurant
📍 Tilden Regional Park, Berkeley | Park
📍 Jupiter, Berkeley | Bar
📍 Pegasus Books, Berkeley | Bookstore"

You MUST include the 📍 list whenever you suggest places. No exceptions.`;
}

// Extract place suggestions from AI response text
export function extractPlaces(text) {
  const lines = text.split('\n');
  const places = [];
  for (const line of lines) {
    const match = line.match(/📍\s*(.+?)\s*\|\s*(.+)/);
    if (match) {
      places.push({ name: match[1].trim(), desc: match[2].trim() });
    }
  }
  return places;
}

// Strip the 📍 lines from the display text
export function cleanResponseText(text) {
  return text.split('\n').filter(line => !line.match(/^📍\s/)).join('\n').trim();
}

// Clean up place name for geocoding
function cleanPlaceName(name) {
  // Remove parenthetical like "(Campanile)" or "(New)"
  let clean = name.replace(/\s*\([^)]*\)/g, '').trim();
  // Remove "The " prefix
  clean = clean.replace(/^The\s+/i, '');
  return clean;
}

// Geocode a place name using Nominatim (OpenStreetMap)
export async function geocodePlace(name, nearLat, nearLon) {
  const cleanName = cleanPlaceName(name);
  // Build search queries — try multiple variations
  const queries = [
    cleanName,                    // "Sproul Plaza, Berkeley"
    cleanName.split(',')[0],     // "Sproul Plaza" (without city)
    name,                         // original with parens etc.
  ];

  for (const q of queries) {
    try {
      const encoded = encodeURIComponent(q);
      const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&viewbox=${nearLon - 0.15},${nearLat + 0.15},${nearLon + 0.15},${nearLat - 0.15}&bounded=0`;
      const res = await fetch(url, { headers: { "User-Agent": "StrolloApp/1.0" } });
      const data = await res.json();
      if (data.length > 0) {
        console.log(`[Strollo] Geocoded "${q}" →`, data[0].display_name);
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name };
      }
    } catch (err) {
      console.warn(`[Strollo] Geocode error for "${q}":`, err);
    }
    // Rate limit: Nominatim requires 1 req/sec
    await new Promise(r => setTimeout(r, 1100));
  }
  console.warn(`[Strollo] Could not geocode: "${name}"`);
  return null;
}

// Get walking route between two points via OSRM
export async function getWalkingRoute(points) {
  if (points.length < 2) return [];
  const coords = points.map(p => `${p[1]},${p[0]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.code === 'Ok' && data.routes.length > 0) {
    const route = data.routes[0];
    return {
      coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distance: route.distance,
      duration: route.duration,
    };
  }
  return null;
}

// Fetch nearby places from Overpass with fallback endpoints
const OVERPASS_ENDPOINTS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

export async function fetchNearbyPlaces(lat, lon, radiusMeters = 800, { signal } = {}) {
  const query = `[out:json][timeout:10];(node["amenity"~"cafe|restaurant|bar|ice_cream|bakery|library|theatre"](around:${radiusMeters},${lat},${lon});node["tourism"~"museum|gallery|attraction|viewpoint"](around:${radiusMeters},${lat},${lon});node["leisure"~"park|garden"](around:${radiusMeters},${lat},${lon});node["shop"~"books|florist"](around:${radiusMeters},${lat},${lon}););out body 15;`;

  const categoryMap = {
    cafe: "Coffee", restaurant: "Restaurant", bar: "Bar",
    ice_cream: "Ice Cream", bakery: "Bakery", books: "Bookstore",
    library: "Library", theatre: "Theatre", florist: "Florist",
    museum: "Museum", gallery: "Gallery", artwork: "Art",
    viewpoint: "Viewpoint", attraction: "Attraction",
    arts_centre: "Arts", park: "Park", garden: "Garden",
  };

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        body: `data=${encodeURIComponent(query)}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal,
      });
      if (res.status === 429 || res.status === 504) continue; // try next endpoint
      if (!res.ok) continue;

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
          };
        });
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      continue; // try next endpoint
    }
  }

  throw new Error("All Overpass endpoints unavailable");
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
      maxOutputTokens: 1024,
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
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
      console.warn(`Model ${model} returned empty response, trying next...`);
      break;
    }
    console.warn(`Model ${model} unavailable, trying fallback...`);
  }
  throw new Error("Gemini is busy right now. Please try again in a moment.");
}
