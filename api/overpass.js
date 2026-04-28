// Server-side proxy for Overpass API requests. Browser-direct calls fail
// because (a) kumi.systems is currently offline and (b) overpass-api.de
// does not return permissive CORS headers, so the browser rejects responses
// even when the server processes the query. Server-to-server has no CORS,
// and racing multiple mirrors here cushions against any one being down.

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Body may arrive parsed (object) or raw (string) depending on
  // Content-Type. Normalise to a query string.
  let query;
  if (req.body && typeof req.body === "object") {
    query = req.body.query;
  } else if (typeof req.body === "string") {
    try {
      query = JSON.parse(req.body)?.query;
    } catch {
      query = req.body;
    }
  }
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "Missing query" });
    return;
  }

  const attempt = async (endpoint) => {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${endpoint}`);
    return r.json();
  };

  try {
    const data = await Promise.any(OVERPASS_ENDPOINTS.map(attempt));
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: "All Overpass endpoints unavailable" });
  }
}
