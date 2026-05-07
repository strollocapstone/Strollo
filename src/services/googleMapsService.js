// FEATURE: shared-service
// LAST UPDATED BY: Eric Tsai
// UPDATE DATE: 2026-04-30
// BUILD: 7152ed6
// DEPENDS ON: env REACT_APP_GOOGLE_MAPS_API_KEY
// CONSUMED BY: ../geminiService, ../strollowConversation
//
// Thin browser wrappers around the Google Maps platform APIs that replaced
// our OSM-only stack: Routes API (walking), Places API (forward search +
// nearest-named-place reverse), Roads API (snap to roads). Every call is
// referrer-restricted via the shared maps key. All helpers return null on
// any error so callers can fall back to the legacy OSM path without
// throwing — this is intentional, the Google path is a quality upgrade,
// not a hard dependency.

const KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;

const PLACES_TEXT_URL    = "https://places.googleapis.com/v1/places:searchText";
const PLACES_NEARBY_URL  = "https://places.googleapis.com/v1/places:searchNearby";
const ROUTES_URL         = "https://routes.googleapis.com/directions/v2:computeRoutes";
const ROADS_SNAP_URL     = "https://roads.googleapis.com/v1/snapToRoads";

export function isGoogleMapsConfigured() {
  return Boolean(KEY);
}

// ── Forward search: place name → canonical {placeId, lat, lng, name} ─────
// Replaces Nominatim for "Gemini said `📍 Cheese Board Pizza, Berkeley` —
// where exactly is that?". Returns null on any error so geocodePlace can
// fall back to its existing Nominatim path.
export async function searchPlaceText(query, biasLat, biasLng, biasRadiusMeters = 2000) {
  if (!KEY || !query) return null;
  try {
    const body = {
      textQuery: query,
      languageCode: "en",
    };
    if (typeof biasLat === "number" && typeof biasLng === "number") {
      body.locationBias = {
        circle: { center: { latitude: biasLat, longitude: biasLng }, radius: biasRadiusMeters },
      };
    }
    const res = await fetch(`${PLACES_TEXT_URL}?key=${KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.formattedAddress",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn("[GoogleMaps] searchPlaceText HTTP", res.status);
      return null;
    }
    const data = await res.json();
    const top = data?.places?.[0];
    if (!top?.location) return null;
    return {
      placeId: top.id,
      name: top.displayName?.text || query,
      lat: top.location.latitude,
      lng: top.location.longitude,
      displayName: top.formattedAddress || top.displayName?.text || query,
    };
  } catch (e) {
    console.warn("[GoogleMaps] searchPlaceText threw:", e);
    return null;
  }
}

// ── Reverse-ish: lat/lng → nearest named POI ─────────────────────────────
// Better than legacy reverse-geocoding for a "you are around X" header —
// returns "Sather Tower" instead of "100 University Ave". Used by
// useReverseGeocodeOnce as the first-choice label, with the existing
// Nominatim flow as a fallback when no nearby POI exists.
const REVERSE_INCLUDED_TYPES = [
  "tourist_attraction", "park", "university", "library", "museum",
  "shopping_mall", "stadium", "transit_station", "subway_station",
];
export async function nearestNamedPlace(lat, lng, radius = 80) {
  if (!KEY || typeof lat !== "number" || typeof lng !== "number") return null;
  try {
    const body = {
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius },
      },
      maxResultCount: 1,
      rankPreference: "DISTANCE",
      includedTypes: REVERSE_INCLUDED_TYPES,
      languageCode: "en",
    };
    const res = await fetch(`${PLACES_NEARBY_URL}?key=${KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-FieldMask": "places.displayName,places.location,places.formattedAddress",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const top = data?.places?.[0];
    if (!top?.displayName?.text || !top?.location) return null;
    return {
      name: top.displayName.text,
      lat: top.location.latitude,
      lng: top.location.longitude,
      displayName: top.formattedAddress || top.displayName.text,
    };
  } catch (e) {
    return null;
  }
}

// ── Routes API: walking turn-by-turn ─────────────────────────────────────
// Replaces the OSRM demo server. Returns the same shape getWalkingRoute
// previously did so callers don't need to change:
//   { coordinates: [[lat, lng], ...], distance: meters, duration: seconds, steps: [...] }
// `points` is an array of [lat, lng] waypoints, same as before. We chain
// origin/destination/intermediates to match the multi-stop walk plan.
export async function walkingRoute(points) {
  if (!KEY || !Array.isArray(points) || points.length < 2) return null;
  try {
    const toLatLng = ([lat, lng]) => ({ location: { latLng: { latitude: lat, longitude: lng } } });
    const body = {
      origin: toLatLng(points[0]),
      destination: toLatLng(points[points.length - 1]),
      travelMode: "WALK",
      computeAlternativeRoutes: false,
      polylineEncoding: "GEO_JSON_LINESTRING",
      languageCode: "en",
      units: "METRIC",
    };
    if (points.length > 2) {
      body.intermediates = points.slice(1, -1).map(toLatLng);
    }
    const res = await fetch(`${ROUTES_URL}?key=${KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-FieldMask": [
          "routes.distanceMeters",
          "routes.duration",
          "routes.polyline.geoJsonLinestring",
          "routes.legs.steps.distanceMeters",
          "routes.legs.steps.staticDuration",
          "routes.legs.steps.navigationInstruction",
          "routes.legs.steps.startLocation",
          "routes.legs.steps.endLocation",
        ].join(","),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn("[GoogleMaps] Routes API HTTP", res.status);
      return null;
    }
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) return null;
    // GeoJSON LineString: { type: "LineString", coordinates: [[lng, lat], ...] }
    // Existing callers expect [[lat, lng], ...] — flip the order.
    const coords = (route.polyline?.geoJsonLinestring?.coordinates || []).map(
      ([lng, lat]) => [lat, lng]
    );
    const steps = (route.legs || []).flatMap((leg) => leg.steps || []).map((s) => ({
      distance: s.distanceMeters,
      // staticDuration is "12s" — strip "s" and parseFloat for seconds.
      duration: parseFloat(String(s.staticDuration || "0").replace("s", "")) || 0,
      maneuver: {
        // Routes API speaks in plain English already; map manoeuvre into the
        // OSRM-shaped slot so the existing nav-TTS / instruction renderer
        // works unchanged.
        type: s.navigationInstruction?.maneuver || "",
        modifier: "",
        instruction: s.navigationInstruction?.instructions || "",
        location: s.startLocation?.latLng
          ? [s.startLocation.latLng.longitude, s.startLocation.latLng.latitude]
          : undefined,
      },
    }));
    return {
      coordinates: coords,
      distance: route.distanceMeters,
      // duration string like "615s" — convert to seconds.
      duration: parseFloat(String(route.duration || "0").replace("s", "")) || 0,
      steps,
    };
  } catch (e) {
    console.warn("[GoogleMaps] Routes API threw:", e);
    return null;
  }
}

// ── Roads API: snap a GPS path onto the road network ─────────────────────
// Currently unused in callers, but kept here so the Phase-3-target service
// module is whole. Returns null on any error.
export async function snapToRoads(path) {
  if (!KEY || !Array.isArray(path) || path.length < 1) return null;
  try {
    const pathStr = path.map(([lat, lng]) => `${lat},${lng}`).join("|");
    const url = `${ROADS_SNAP_URL}?path=${encodeURIComponent(pathStr)}&interpolate=true&key=${KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const pts = (data?.snappedPoints || []).map((p) => [p.location.latitude, p.location.longitude]);
    return pts.length ? pts : null;
  } catch (e) {
    return null;
  }
}
