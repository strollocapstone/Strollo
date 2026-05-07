// FEATURE: shared-hook + shared-ui  (multi — phase 2 splits)
// LAST UPDATED BY: Seemin Masood
// UPDATE DATE: 2026-05-07
// BUILD: cda47b3
// DEPENDS ON: ./geminiService, ./mapUtils (reverseGeocode), ./cloudTtsService, ./services/googleMapsService
// CONSUMED BY: ./WalkCompanionWidget
//
// Currently mixes: useTtsSpeak (browser + Cloud TTS bridge), useTipFetch
// (Gemini-grounded prose tip), useReverseGeocodeOnce (throttled Nominatim),
// ConversationReel (UI), PromptPills (UI), LocationPill (UI), SkeletonLine
// (UI). PHASE 2 splits into hooks/{useTtsSpeak, useTipFetch,
// useReverseGeocodeOnce} + components/{ConversationReel, PromptPills,
// LocationPill, SkeletonLine}.

// Strollo Conversation — bottom-card sub-views ported from the Claude Design
// "Strollow Conversation" prototype. All LLM calls go through Gemini
// (`sendMessage` / `buildSystemPrompt` from ./geminiService); the prototype's
// `window.claude.complete` calls are intentionally not used.
//
// Exports: PROMPT_PILLS, LocationPill, ConversationReel, useTipFetch,
// useTtsSpeak, useReverseGeocodeOnce, PromptPills, SkeletonLine.
import React, { useState, useEffect, useRef } from "react";
import { reverseGeocode } from "./mapUtils";
import { sendMessage, buildSystemPrompt } from "./geminiService";
import {
  isMobile,
  isCloudTtsConfigured,
  unlockMobileAudio,
  speakViaCloud,
  cancelCloudTts,
} from "./cloudTtsService";
import { nearestNamedPlace } from "./services/googleMapsService";

export const PROMPT_PILLS = [
  { glyph: "💎", label: "Hidden gems", prompt: "Any hidden gems within walking distance?" },
  { glyph: "☕", label: "Cafes",       prompt: "What's a great café within a few minutes of here?" },
  { glyph: "🍜", label: "Food",        prompt: "Where should I eat nearby right now?" },
];

// ── LocationPill ─────────────────────────────────────────────────────────
export function LocationPill({ name, savedIndex, onAdd, onRemove }) {
  const saved = savedIndex !== null && savedIndex !== undefined;
  return (
    <div className={`strollo-loc-pill${saved ? " strollo-loc-pill--saved" : ""}`}>
      {saved ? (
        <div className="strollo-loc-pill__avatar strollo-loc-pill__avatar--saved">
          {savedIndex + 1}
        </div>
      ) : (
        <div className="strollo-loc-pill__avatar">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
            <path
              d="M12 2C8.4 2 5.5 4.9 5.5 8.5c0 4.7 6.5 12 6.5 12s6.5-7.3 6.5-12C18.5 4.9 15.6 2 12 2z"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="8.5" r="2.4" fill="currentColor" />
          </svg>
        </div>
      )}
      <span className="strollo-loc-pill__name">{name}</span>
      {saved ? (
        <button
          type="button"
          className="strollo-loc-pill__btn strollo-loc-pill__btn--remove"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            console.log("[LocPill] − tapped for", name);
            onRemove && onRemove();
          }}
          data-no-drag
          aria-label={`Remove ${name} from trip`}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          className="strollo-loc-pill__btn strollo-loc-pill__btn--add"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            console.log("[LocPill] + tapped for", name);
            onAdd && onAdd();
          }}
          data-no-drag
          aria-label={`Add ${name} to trip`}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── ConversationReel ─────────────────────────────────────────────────────
// Newest message largest at the bottom (tier 0). Older tiers shrink+fade.
// Live interim transcript, when listening, occupies tier 0 and pushes real
// messages up by one tier. Auto-pins to bottom unless the user scrolls up.
export function ConversationReel({ messages, listening, interim, trip = [], onAddLocation, onRemoveLocation }) {
  const scrollerRef = useRef(null);
  const [userScrolled, setUserScrolled] = useState(false);

  useEffect(() => {
    if (!scrollerRef.current) return;
    if (!userScrolled) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
    }
  }, [messages, interim, listening, userScrolled]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    setUserScrolled(!atBottom);
  };

  const showInterim = listening || (interim && interim.length);
  const last = messages.length - 1;
  const tier = (i) => last - i + (showInterim ? 1 : 0);

  const styleFor = (t, role) => {
    const base = {
      transition: "all 420ms cubic-bezier(.2,.8,.2,1)",
      letterSpacing: "-0.01em",
      lineHeight: 1.28,
    };
    if (t === 0) {
      return {
        ...base,
        fontSize: role === "user" ? 22 : 26,
        fontWeight: role === "user" ? 400 : 600,
        fontStyle: role === "user" ? "italic" : "normal",
        color: role === "user" ? "rgba(255,255,255,0.72)" : "#fff",
        opacity: 1,
      };
    }
    if (t === 1) {
      return {
        ...base,
        fontSize: 17,
        fontWeight: role === "user" ? 400 : 500,
        fontStyle: role === "user" ? "italic" : "normal",
        color: "#fff",
        opacity: 0.5,
      };
    }
    if (t === 2) {
      return {
        ...base,
        fontSize: 14,
        fontWeight: role === "user" ? 400 : 500,
        fontStyle: role === "user" ? "italic" : "normal",
        color: "#fff",
        opacity: 0.3,
      };
    }
    return {
      ...base,
      fontSize: 12,
      fontWeight: role === "user" ? 400 : 500,
      fontStyle: role === "user" ? "italic" : "normal",
      color: "#fff",
      opacity: 0.18,
    };
  };

  return (
    <div ref={scrollerRef} onScroll={onScroll} className="strollo-reel">
      <div className="strollo-reel__spacer" />
      {messages.map((m, i) => {
        const t = tier(i);
        const s = styleFor(t, m.role);
        const isLatest = t === 0;
        const tierOpacity = t === 0 ? 1 : t === 1 ? 0.85 : t === 2 ? 0.7 : 0.55;
        return (
          <div
            key={m.id}
            className="strollo-reel__msg"
            style={{ animation: isLatest ? "reelIn 520ms cubic-bezier(.2,.8,.2,1) both" : undefined }}
          >
            <div
              className={`strollo-reel__role strollo-reel__role--${m.role}`}
              style={{ opacity: t === 0 ? 1 : 0.5 }}
            >
              {m.role === "user" ? "You" : "Strollo"}
            </div>
            <div style={s}>{m.text}</div>

            {m.role === "ai" && Array.isArray(m.places) && m.places.length > 0 && (
              <div className="strollo-reel__locs" style={{ opacity: tierOpacity }}>
                {m.places.map((name, k) => {
                  const tripIdx = trip.findIndex(
                    (it) => it.name && it.name.toLowerCase() === name.toLowerCase()
                  );
                  const saved = tripIdx >= 0;
                  return (
                    <LocationPill
                      key={`${m.id}-${k}-${name}`}
                      name={name}
                      savedIndex={saved ? tripIdx : null}
                      onAdd={() => onAddLocation && onAddLocation(name, m)}
                      onRemove={() => onRemoveLocation && onRemoveLocation(name)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {showInterim && (
        <div className="strollo-reel__msg">
          <div className="strollo-reel__role strollo-reel__role--user strollo-reel__role--live">
            You
            {listening && <span className="strollo-reel__pulse" aria-hidden="true" />}
          </div>
          <div
            className="strollo-reel__interim"
            style={{ color: interim ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.4)" }}
          >
            {interim || (listening ? "Listening…" : "")}
            {listening && <span className="strollo-reel__caret" aria-hidden="true" />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── PromptPills row ──────────────────────────────────────────────────────
export function PromptPills({ disabled, onTap }) {
  return (
    <div className="strollo-prompt-pills" style={{ opacity: disabled ? 0.4 : 1 }}>
      {PROMPT_PILLS.map((p, i) => (
        <button
          key={i}
          type="button"
          className="strollo-prompt-pill"
          disabled={disabled}
          onClick={() => onTap && onTap(p)}
          style={{ animation: `pillIn 460ms cubic-bezier(.2,.8,.2,1) ${120 + i * 60}ms both` }}
        >
          <span className="strollo-prompt-pill__glyph">{p.glyph}</span>
          <span>{p.label}</span>
        </button>
      ))}
    </div>
  );
}

export function SkeletonLine({ width = "100%" }) {
  return <div className="strollo-skel" style={{ width }} />;
}

// ── useTipFetch ──────────────────────────────────────────────────────────
// Single GPS-grounded prose tip via Gemini. Re-fires whenever `nonce`
// changes (parent bumps it on every re-entry to tips mode), or when the
// reverse-geocoded area changes.
export function useTipFetch({ userLocation, area, nonce, flavor = null, vibePreferences, preferences }) {
  const [tip, setTip] = useState("");
  const [loading, setLoading] = useState(true);
  // Coordinates + tip text from the last successful Gemini response, so we
  // can skip refetching when the user is within ~500 ft (152 m) of where
  // the previous tip was generated.
  const lastTipLocationRef = useRef(null);
  const lastTipRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    if (!userLocation || userLocation[0] == null) {
      // No GPS yet — keep skeleton spinning until parent provides location.
      setLoading(true);
      return;
    }

    // 500-ft cache: if the user has barely moved since the last successful
    // tip, just keep the previous tip on screen instead of refetching.
    const FT_500_KM = 0.1524;
    if (lastTipLocationRef.current && lastTipRef.current) {
      const [pLat, pLng] = lastTipLocationRef.current;
      const dLat = userLocation[0] - pLat;
      const dLng = userLocation[1] - pLng;
      // Cheap haversine — for sub-km distances flat-Earth is plenty.
      const km = Math.sqrt(dLat * dLat + dLng * dLng) * 111.32;
      if (km < FT_500_KM) {
        setTip(lastTipRef.current);
        setLoading(false);
        return;
      }
    }

    const tipPrompt = `Recommend ONE specific, doable thing to go see or try right now — 1 to 2 sentences, max 28 words.
GPS coordinates (use loosely as a hint, never quote them): ${userLocation[0].toFixed(5)}, ${userLocation[1].toFixed(5)}
Reverse-geocoded label (may be vague like "Unnamed Alley" — ignore it if it isn't useful): ${area || "unknown"}
${flavor ? `Lean this recommendation toward: ${flavor}.\n` : ""}
The recommendation should feel like a friend's tip: a kind of place (a mural-lined alley, an old bookstore, a quiet rooftop, a bakery that's busy at this hour), an action (people-watch on a stoop, taste a seasonal pastry, follow a street artist's tags), or a sensory invitation. It does NOT have to be tied to the user's exact street — it's fine to suggest something generic-but-vivid that any neighborhood plausibly has.
**Never** say "you're near <place>" or "around <area>" or echo the location label. Don't apologize for not knowing where they are. Don't say "explore" without giving a concrete thing to do.
Plain text only. No quotes. No markdown. No preamble. No "Welcome" or "Hi".`;

    const sys = buildSystemPrompt({
      userLocation,
      journeyItems: [],
      elapsedMinutes: 0,
      currentStopIndex: 0,
      totalStops: 0,
      mode: "pre-walk",
      vibePreferences,
      preferences,
    });

    // Retry loop — Gemini is the source of truth for the tip, never a
    // hardcoded fallback. If it fails, retry with backoff and leave the
    // skeleton up so the user knows something's still loading.
    (async () => {
      setLoading(true);
      const delays = [0, 1500, 4000];
      for (let attempt = 0; attempt < delays.length; attempt++) {
        if (cancelled) return;
        if (delays[attempt] > 0) {
          await new Promise((r) => setTimeout(r, delays[attempt]));
          if (cancelled) return;
        }
        try {
          const text = await sendMessage([{ role: "user", text: tipPrompt }], sys);
          if (cancelled) return;
          const clean = (text || "").trim().replace(/^["'`]+|["'`]+$/g, "").split("\n")[0];
          if (clean) {
            setTip(clean);
            setLoading(false);
            // Snapshot for the 500-ft cache so the next render reuses this.
            lastTipLocationRef.current = [userLocation[0], userLocation[1]];
            lastTipRef.current = clean;
            return;
          }
        } catch (e) {
          // swallow + retry
        }
      }
      // All retries exhausted. If we have a previous tip in cache, fall
      // back to it rather than leaving the skeleton up forever.
      if (cancelled) return;
      if (lastTipRef.current) {
        setTip(lastTipRef.current);
        setLoading(false);
      } else {
        setLoading(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, userLocation && userLocation[0], userLocation && userLocation[1], area, flavor]);

  return { tip, loading };
}

// ── useTtsSpeak ──────────────────────────────────────────────────────────
// Browser TTS for AI replies. `prime()` MUST be called from inside a user
// gesture (click handler) once before async `speak()` calls will play —
// Chrome and Safari otherwise no-op `speak()` outside of user activation.

// Module-level fallback queue. When two-tier watchdog confirms the engine
// is unrecoverably wedged (utterance never starts even after a forced
// requeue), we stash the text here and arm a one-shot pointerdown
// listener that re-attempts the speak inside the user's next gesture.
// That gesture-scoped speak() call bypasses Chrome's autoplay policy
// unconditionally, so any tap anywhere on the page unsticks audio.
let ttsPendingFallback = null;
let ttsFallbackArmed = false;
function armTtsFallback(text, speakFn) {
  ttsPendingFallback = text;
  if (ttsFallbackArmed) return;
  ttsFallbackArmed = true;
  const fire = () => {
    document.removeEventListener("pointerdown", fire, true);
    ttsFallbackArmed = false;
    const t = ttsPendingFallback;
    ttsPendingFallback = null;
    if (t) {
      console.log("[TTS] fallback: firing on pointerdown:", t.slice(0, 60));
      speakFn(t);
    }
  };
  document.addEventListener("pointerdown", fire, { capture: true });
  console.log("[TTS] fallback: armed — will speak on next tap");
}
// Restored from commit 7bb41cf (the version that audibly worked) after a
// later refactor inadvertently dropped the explicit voice pick and the
// silent-utterance prime — both turned out to be load-bearing on macOS
// Chrome, where the browser's default voice + a missing audio-sink
// warmup ship audio to a silent sink that reports speaking=true with no
// audible output. Keep rate/pitch defaults that matched the working
// build (0.88 / 1.05) and the Samantha / Google US English voice pick.
export function useTtsSpeak({ enabled, rate = 0.88, pitch = 1.05 }) {
  const utteranceRef = useRef(null);
  const primedRef = useRef(false);
  const [speaking, setSpeaking] = useState(false);

  const cancel = () => {
    try { cancelCloudTts(); } catch (_e) {}
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {
      /* ignore */
    }
    utteranceRef.current = null;
    setSpeaking(false);
  };

  // True when we should route audio through Cloud TTS (<audio>) instead of
  // window.speechSynthesis. Mobile only, and only if a TTS key is configured.
  const useCloudPath = isMobile() && isCloudTtsConfigured();

  // Establishes user activation for SpeechSynthesis — fire once from the
  // click handler. We use a single-space utterance (rather than empty)
  // because some browsers no-op an empty utterance and never grant the
  // activation we're after. Idempotent. Restored from the version that
  // audibly worked (commit 7bb41cf) — dropping the silent utterance left
  // macOS Chrome's audio sink unwarmed.
  const prime = () => {
    if (useCloudPath) {
      try { unlockMobileAudio(); } catch (_e) {}
      return;
    }
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.resume();
      if (!primedRef.current) {
        // iOS WebKit ignores volume=0 utterances and never grants audio
        // activation, so subsequent speak() calls go silent. Use volume=1
        // on a single-space utterance fired at high rate — nearly
        // inaudible in practice but registers as a real audio request.
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 1;
        u.rate = 10;
        window.speechSynthesis.speak(u);
        primedRef.current = true;
        console.log("[TTS] primed");
      }
    } catch (e) { console.warn("[TTS] prime failed:", e); }
  };

  const speak = (text) => {
    if (!enabled) return;
    if (!text) return;
    if (useCloudPath) {
      console.log("[TTS] mobile → Cloud TTS:", text.slice(0, 80));
      setSpeaking(true);
      speakViaCloud(text, { rate, pitch })
        .catch((err) => console.warn("[CloudTTS] failed:", err))
        .finally(() => setSpeaking(false));
      return;
    }
    if (!("speechSynthesis" in window)) {
      console.warn("[TTS] speechSynthesis unavailable in this browser");
      return;
    }

    const ss = window.speechSynthesis;
    // Drain stuck state. If pending utterances exist but nothing is
    // actively speaking, the queue has wedged — Chrome sometimes parks
    // an utterance in pending forever (especially after a previous
    // cancel/remount cycle or hot-reload). Clearing it lets the new
    // utterance start. We deliberately do NOT cancel when actively
    // speaking, so a long reply isn't chopped mid-sentence.
    try {
      if (ss.pending && !ss.speaking) ss.cancel();
    } catch (e) { /* ignore */ }
    try { ss.resume(); } catch (e) { /* ignore */ }

    const u = new SpeechSynthesisUtterance(text);
    // Match commit 7bb41cf (the version that worked audibly): explicit
    // voice pick + slower rate. The default voice on macOS Chrome can
    // route to a silent sink even though `speaking` flips true; picking
    // Samantha / Google US English fixes that. Rate 0.88 also matters
    // for the same reason on some engines.
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 1;
    u.lang = "en-US";
    const voices = ss.getVoices();
    const pick =
      voices.find((v) => /samantha|google us english|en-us/i.test(`${v.name} ${v.lang}`)) ||
      voices.find((v) => /^en/i.test(v.lang)) ||
      voices[0];
    if (pick) u.voice = pick;
    u.onstart = () => {
      console.log("[TTS] onstart — engine is producing audio NOW. If you can't hear it: check tab mute (right-click tab), system output device, and Chrome flags.");
      setSpeaking(true);
    };
    u.onend = () => { console.log("[TTS] onend"); setSpeaking(false); };
    u.onerror = (e) => { console.warn("[TTS] onerror:", e?.error || e); setSpeaking(false); };
    u.onboundary = (e) => { console.log("[TTS] onboundary at char", e?.charIndex, "— audio is actively streaming"); };
    u.onpause = () => { console.log("[TTS] onpause — engine paused, calling resume()"); try { ss.resume(); } catch (_e) {} };
    u.onmark = () => { console.log("[TTS] onmark"); };
    utteranceRef.current = u;
    console.log("[TTS] speaking:", text.slice(0, 80),
      "| paused=", ss.paused, "pending=", ss.pending, "speaking=", ss.speaking,
      "| voices=", ss.getVoices().length);
    try { ss.speak(u); }
    catch (e) { console.warn("[TTS] speak() threw:", e); }
    // Two-tier watchdog: if onstart hasn't fired within 600 ms, force a
    // cancel + re-speak (Chrome wedge from hot-reload / pending leftovers).
    // If even the requeue stalls another 600 ms, defer the line to the
    // next user pointerdown — guaranteed to bypass autoplay policy.
    setTimeout(() => {
      if (utteranceRef.current !== u) return;
      if (ss.speaking) return;
      console.warn("[TTS] watchdog: utterance never started, forcing requeue");
      try { ss.cancel(); } catch (_e) {}
      try { ss.speak(u); } catch (_e) {}
      setTimeout(() => {
        if (utteranceRef.current !== u) return;
        if (ss.speaking) return;
        console.warn("[TTS] watchdog tier 2: requeue also stalled — arming pointerdown fallback");
        utteranceRef.current = null;
        armTtsFallback(text, speak);
      }, 600);
    }, 600);
  };

  // Warm voices list (some browsers populate async).
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const w = () => window.speechSynthesis.getVoices();
    w();
    window.speechSynthesis.onvoiceschanged = w;
  }, []);

  // Dev-only diagnostic: expose a global helper so you can paste
  // `window.__ttsTest()` into the console and hear an unambiguous test
  // utterance with the same voice settings the app uses. If THAT also
  // produces logs but no audio, the issue is system / tab muting, not
  // the JS — speechSynthesis is reaching the audio device but the OS
  // is sinking it. Common culprits: tab mute (right-click tab → Mute
  // Site), macOS Output device set to a disconnected Bluetooth, or
  // the browser launched with --mute-audio.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__ttsTest = (text = "Audio check. If you can hear this, navigation voice should also work.") => {
      const ss = window.speechSynthesis;
      try { ss.cancel(); } catch (_e) {}
      const u = new SpeechSynthesisUtterance(text);
      u.volume = 1; u.rate = 1; u.pitch = 1;
      u.onstart = () => console.log("[ttsTest] onstart");
      u.onend = () => console.log("[ttsTest] onend");
      u.onerror = (e) => console.warn("[ttsTest] onerror:", e?.error);
      ss.speak(u);
      console.log("[ttsTest] queued. paused=", ss.paused, "speaking=", ss.speaking, "pending=", ss.pending);
    };
  }, []);

  // (Chrome 14s pause/resume keepalive removed — it was cutting off short
  // utterances. Our AI replies are 2 sentences max so the freeze bug
  // doesn't apply.)

  // Cancel on unmount.
  useEffect(() => () => cancel(), []);

  return { speak, cancel, prime, speaking };
}

// ── useReverseGeocodeOnce ────────────────────────────────────────────────
// One-shot reverse-geocode for the tips header. Re-fires only when the
// rounded coordinates change, to honor Nominatim's 1 req/sec policy.
//
// If the immediate (zoom=17) result is null or a *generic* label like
// "Unnamed Alley" / "Unnamed Road" / a raw coordinate, falls back to a
// wider zoom (14 → neighbourhood) so the header shows a real, named
// place — "You are around <neighbourhood / city>". Also exposes an
// `area` string with the verbose Nominatim display name (used by the
// AI prompt to anchor recommendations to actual nearby landmarks).
const GENERIC_LABEL_RE = /^(unnamed|unknown|no\s+name|n\/?a)/i;

async function fetchNominatim(lat, lng, zoom) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=${zoom}&addressdetails=1`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function pickName(data) {
  if (!data) return null;
  const a = data.address || {};
  const candidate =
    data.name ||
    a.attraction ||
    a.tourism ||
    a.shop ||
    a.amenity ||
    a.leisure ||
    a.building ||
    a.road ||
    a.neighbourhood ||
    a.suburb ||
    a.city_district ||
    a.city ||
    a.town ||
    a.village ||
    (data.display_name ? data.display_name.split(",")[0] : null);
  return candidate ? candidate.toString().trim() : null;
}

export function useReverseGeocodeOnce(userLocation) {
  const [label, setLabel] = useState(null);
  const [area, setArea] = useState(null);
  const [status, setStatus] = useState("idle");

  const lat = userLocation && userLocation[0];
  const lng = userLocation && userLocation[1];
  const roundedLat = lat != null ? Math.round(lat * 1000) / 1000 : null;
  const roundedLng = lng != null ? Math.round(lng * 1000) / 1000 : null;

  useEffect(() => {
    if (lat == null || lng == null) {
      setStatus("idle");
      setLabel(null);
      setArea(null);
      return;
    }
    let cancelled = false;
    setStatus("locating");
    (async () => {
      // First pass: Google Places nearby — gives us the *named landmark*
      // closest to the user (e.g. "Sather Tower") rather than a street
      // address. Returns null when no notable POI is within ~80m, in
      // which case we fall through to the Nominatim flow below for a
      // street-level / neighbourhood-level label.
      const fromGoogle = await nearestNamedPlace(lat, lng, 80);
      if (cancelled) return;
      if (fromGoogle?.name) {
        setLabel(fromGoogle.name);
        setArea(fromGoogle.displayName || fromGoogle.name);
        setStatus("ready");
        return;
      }

      // Fallback pass: street-level Nominatim (zoom=17) — same as the
      // pre-Google legacy util.
      const fine = await fetchNominatim(lat, lng, 17);
      if (cancelled) return;
      let name = pickName(fine);
      let displayArea = fine?.display_name || name;

      // If the fine label is missing / generic ("Unnamed Alley" etc.),
      // widen the lens to neighbourhood-level so we get a real, named
      // place to anchor on.
      const isGeneric = !name || GENERIC_LABEL_RE.test(name);
      if (isGeneric) {
        const coarse = await fetchNominatim(lat, lng, 14);
        if (cancelled) return;
        const coarseName = pickName(coarse);
        if (coarseName && !GENERIC_LABEL_RE.test(coarseName)) {
          name = coarseName;
          displayArea = coarse?.display_name || coarseName;
        }
      }

      if (name) {
        setLabel(name);
        setArea(displayArea || name);
        setStatus("ready");
      } else {
        setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundedLat, roundedLng]);

  return { label, area, status };
}
