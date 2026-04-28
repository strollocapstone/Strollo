// Server-side proxy for Overpass API requests. Browser-direct calls fail
// because (a) kumi.systems is currently offline and (b) overpass-api.de
// does not return permissive CORS headers, so the browser rejects responses
// even when the server processes the query. Server-to-server has no CORS,
// and racing multiple mirrors here cushions against any one being down.

// NOTE: overpass.osm.ch is intentionally excluded — its dataset is
// limited to Switzerland, so it answers fast with `elements: []` for
// queries outside CH. With Promise.any picking the first FULFILLED
// (not first non-empty) response, that empty-but-successful reply
// always beats the real mirrors and the map ends up with zero POIs.
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
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
    // Overpass instances require a non-empty, identifiable User-Agent or
    // they return 406 Not Acceptable. Accept: application/json gets the
    // structured response we expect to parse.
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "Strollo/1.0 (https://strollo-ten.vercel.app; capstone@berkeley.edu)",
      },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} from ${endpoint}`);
    const json = await r.json();
    // Some mirrors answer 200 with `remark` indicating an internal error
    // (e.g. "runtime error: Query timed out"). Treat those as failure so
    // Promise.any moves on to the next mirror.
    if (json && json.remark && /error|timed out/i.test(json.remark) && !Array.isArray(json.elements)) {
      throw new Error(`mirror remark: ${json.remark}`);
    }
    return json;
  };

  try {
    const data = await Promise.any(OVERPASS_ENDPOINTS.map(attempt));
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json(data);
  } catch (err) {
    // err is an AggregateError when Promise.any exhausts. Surface the
    // individual mirror failures so future debugging doesn't need
    // re-deployment.
    const detail = err?.errors?.map((e) => e?.message).filter(Boolean) || [String(err)];
    console.warn("[Overpass proxy] all mirrors failed:", detail);
    res.status(502).json({ error: "All Overpass endpoints unavailable", detail });
  }
}
