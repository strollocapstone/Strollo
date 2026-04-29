// Walk Companion minimized widget (bottom-pinned, during-walk).
//
// CANONICAL NAVIGATION MODULE — this is the single shared component for
// the dynamic-island walk widget across the app. Every place that shows
// the navigation chrome (NavigationMapScreen during a walk, LockScreen
// when the phone locks mid-walk) imports THIS file. Don't fork it: if a
// new surface needs the widget, mount this component and gate via props.
//
// Shows the next turn (biggest), current waypoint target, DIST/ETA stats,
// and a button section: End walk + Mute / Speak icons.
//
// Empty-state branch (no destination) renders the Strollo Conversation
// experience ported from the Claude-Design prototype: a Tips card with
// a GPS-grounded prose tip + prompt pills + big mic, OR a Conversation
// reel of messages with location pills, OR a minimized peek bar.
import React, { useId, useRef, useState, useEffect, useCallback } from "react";
import "./WalkCompanionWidget.css";
import {
  ConversationReel,
  PromptPills,
  SkeletonLine,
  useTipFetch,
  useTtsSpeak,
  useReverseGeocodeOnce,
} from "./strollowConversation";
import {
  sendMessage,
  buildConversationPrompt,
  extractPlaces,
  cleanResponseText,
  geocodePlace,
} from "./geminiService";
import { cancelCloudTts, isMobile } from "./cloudTtsService";

// Progress strip that replaces the divider above the buttons section.
// Renders boots → dotted curve → flag, where the boots position scales
// with `progress` (0..1) and the curve segment behind the boots is light
// purple ("walked") while the segment ahead is brand purple ("remaining").
// Five-bar sound-wave glyph; matches the audio button used in the
// HomeScreen search bar. Pass `active` to start the bouncy animation.
function SoundBars({ active, color = "#FFD501" }) {
  const cls = active ? "sw-bar sw-bar--active" : "sw-bar";
  return (
    <svg width="22" height="18" viewBox="0 0 22 18" fill={color} aria-hidden="true">
      <rect className={cls} x="1"   y="6" width="3" height="6"  rx="1.5" style={{ animationDelay: "0s"   }} />
      <rect className={cls} x="5.5" y="3" width="3" height="12" rx="1.5" style={{ animationDelay: "0.15s" }} />
      <rect className={cls} x="10"  y="0" width="3" height="18" rx="1.5" style={{ animationDelay: "0.3s"  }} />
      <rect className={cls} x="14.5" y="3" width="3" height="12" rx="1.5" style={{ animationDelay: "0.15s" }} />
      <rect className={cls} x="19"  y="6" width="3" height="6"  rx="1.5" style={{ animationDelay: "0s"   }} />
    </svg>
  );
}

function ProgressStrip({ progress, disabled = false }) {
  const idSuffix = useId().replace(/:/g, "");
  const W = 320;
  const H = 32;
  const PAD = 14;
  const innerW = W - PAD * 2;
  // Cubic-bezier wave centered on the strip: gentle up-down-up curve.
  const path = `M ${PAD} ${H / 2} C ${PAD + innerW * 0.25} 4, ${PAD + innerW * 0.45} ${H - 4}, ${PAD + innerW * 0.55} ${H / 2} S ${PAD + innerW * 0.85} 4, ${W - PAD} ${H / 2}`;
  const p = Math.max(0, Math.min(1, progress));
  const splitX = PAD + innerW * p;
  return (
    <div className={`wcw-progress${disabled ? " wcw-progress--disabled" : ""}`} aria-hidden="true">
      <svg
        className="wcw-progress-line"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
      >
        <defs>
          <clipPath id={`wcw-walked-${idSuffix}`}>
            <rect x="0" y="0" width={splitX} height={H} />
          </clipPath>
          <clipPath id={`wcw-remaining-${idSuffix}`}>
            <rect x={splitX} y="0" width={W - splitX} height={H} />
          </clipPath>
        </defs>
        <path
          d={path}
          fill="none"
          stroke="rgba(255, 213, 1, 0.45)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeDasharray="2 4"
          clipPath={`url(#wcw-walked-${idSuffix})`}
        />
        <path
          d={path}
          fill="none"
          stroke="#C77DFF"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="2 4"
          clipPath={`url(#wcw-remaining-${idSuffix})`}
        />
      </svg>
      <span
        className="wcw-progress-boots"
        style={{ left: `calc(${PAD}px + (100% - ${PAD * 2}px) * ${p})` }}
      >
        <svg width="11" height="18" viewBox="0 0 28 46" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 2 C5 2 3 5 3 10 L3 32 C3 38 5 44 10 44 L17 44 C20 44 22 42 23 38 L24 32 C24 28 22 26 19 26 L18 26 L18 10 C18 5 16 2 13 2 Z" fill="#F7F3F5"/>
          <line x1="6" y1="14" x2="17" y2="14" stroke="#1E1541" strokeWidth="2" opacity="0.4"/>
          <line x1="6" y1="19" x2="17" y2="19" stroke="#1E1541" strokeWidth="2" opacity="0.4"/>
        </svg>
        <svg width="11" height="18" viewBox="0 0 28 46" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2 C23 2 25 5 25 10 L25 32 C25 38 23 44 18 44 L11 44 C8 44 6 42 5 38 L4 32 C4 28 6 26 9 26 L10 26 L10 10 C10 5 12 2 15 2 Z" fill="#F7F3F5"/>
          <line x1="11" y1="14" x2="22" y2="14" stroke="#1E1541" strokeWidth="2" opacity="0.4"/>
          <line x1="11" y1="19" x2="22" y2="19" stroke="#1E1541" strokeWidth="2" opacity="0.4"/>
        </svg>
      </span>
      <span className="wcw-progress-flag">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#FFD501" stroke="none">
          <path d="M8 3 L8 21" stroke="#FFD501" strokeWidth="2.4" strokeLinecap="round"/>
          <path d="M8 3 L18 6 L8 10 Z"/>
          <circle cx="8" cy="21" r="2"/>
        </svg>
      </span>
    </div>
  );
}

function WalkCompanionWidgetInner({
  destination = "your next stop",
  instruction = "—",
  distance = "—",
  eta = "—",
  progress = 0,
  // True when the user is within ~300 ft of the next stop. When true, the
  // skip pill swaps its label/handler to "I'm here" so the user can confirm
  // arrival without leaving the widget.
  atTarget = false,
  // True when there's more than one upcoming confirmed stop. Skip button
  // is hidden when false (i.e. the immediate next stop is the only / final
  // one) so the user doesn't accidentally drop their last destination.
  canSkip = true,
  // Shown in the empty state ("You are at <currentLocationName>") when the
  // user hasn't planned any stops yet. Reverse-geocoded by the widget itself
  // when not provided.
  currentLocationName = null,
  transcript = "",
  suggestion = "",
  narration = "",
  // Strollo Conversation (empty-state) integration props.
  userLocation = null,         // [lat, lng] for tip generation + reverse-geocode
  vibePreferences = null,
  preferences = null,
  trip = [],                   // [{id, name}] saved-stop list for pill state
  onAddByName,                 // (name) => void; geocodes + appends to journey
  onRemoveByName,              // (name) => void
  onAiSuggestPlace,            // ({name, lat, lng, desc}) => void; AI-suggested pin
  onSkip,
  onArrived,
  onEnd,                       // eslint-disable-line no-unused-vars
  onExpand,
  onChat,
  onSpeakStart,
  onSpeakEnd,
}, forwardedRef) {
  // eslint-disable-next-line no-unused-vars
  // `paused` was a no-op state slot; kept as a const literal so existing
  // dead branches still compile until the next pass cleans them up.
  const paused = false;
  // Flip-switch TTS: at most one surface speaks at a time.
  //   "nav"  → nav maneuvers speak, conv stays silent
  //   "conv" → AI replies speak, nav stays silent
  //   "off"  → both surfaces silent
  // Auto-flips to "conv" when the conv overlay opens, back to "nav" on
  // close. Tapping either speaker icon flips manually (and cancels any
  // utterance in flight on the previous surface).
  const [speakActive, setSpeakActive] = useState(false);

  // Whether the widget is in its empty (no-destination) state. The parent
  // (NavigationMapScreen) gates `destination` via its exploration-mode
  // flag — saving a place via the pill leaves destination null, so we
  // stay in conversation. When the user taps "Start exploring · N" the
  // parent flips exploration off, destination becomes the next waypoint,
  // and the widget cleanly transitions into walking mode.
  const isEmpty = !destination;

  // ── Strollo Conversation state (only active when isEmpty) ──────────────
  // 'tips' = default; 'conversation' = reel of messages; 'minimized' = peek bar.
  const [convMode, setConvMode] = useState("tips");
  // In-walk overlay: when true (and !isEmpty), the conversation section
  // stacks above the nav chrome inside the same widget. Tapping SAY
  // ANYTHING during a walk flips this on; the × button flips it off.
  const [convOpen, setConvOpen] = useState(false);
  // Counts places appended via the conversation while the overlay is
  // open — shows the yellow "Update walk plan" CTA at the bottom of the
  // conv-section once it goes above zero. Resets each time the overlay
  // is closed (so the CTA only nags about *unconfirmed* additions).
  const [convAddedCount, setConvAddedCount] = useState(0);
  const [messages, setMessages] = useState([]);
  // TTS on by default — every Gemini reply is spoken via the browser's
  // SpeechSynthesis. User can mute via the speaker icon in the bottom row.
  const [activeVoice, setActiveVoice] = useState(() => destination ? "nav" : "conv");
  const [tipNonce, setTipNonce] = useState(0);
  // Rotating angle injected into the tip prompt while idling on Tips mode, so
  // the auto-narration feels varied across the 60s rotation cycle.
  const TIP_FLAVORS = ["history", "architecture", "hidden-detail", "food", "people-watching"];
  const [tipFlavor, setTipFlavor] = useState(TIP_FLAVORS[0]);
  const [tripToast, setTripToast] = useState(null);
  const idRef = useRef(0);
  const tripToastTimerRef = useRef(null);

  // Reverse-geocode the user's GPS once for the "You are at X" header. Falls
  // back to the prop if the parent already supplied a name.
  const { label: geoLabel, area: geoArea, status: geoStatus } = useReverseGeocodeOnce(userLocation);
  const headerLabel = currentLocationName || geoLabel;

  // GPS-grounded prose tip via Gemini, with skeleton-shimmer loading state.
  const { tip, loading: tipsLoading } = useTipFetch({
    userLocation,
    area: geoArea,
    nonce: tipNonce,
    flavor: tipFlavor,
    vibePreferences,
    preferences,
  });

  // Browser TTS for AI replies (default off).
  // The hook itself is enabled whenever any surface is live; per-surface
  // gating happens at each call site (see nav-TTS effect and pushMessage).
  const { speak: ttsSpeak, cancel: ttsCancel, prime: ttsPrime, speaking: ttsSpeaking } = useTtsSpeak({ enabled: activeVoice !== "off" });
  // Auto-restart STT after a conv-AI TTS reply finishes — set when we kick
  // off ttsSpeak for an AI reply, cleared when we honor it (or the user
  // manually cancels).
  const restartSttAfterTtsRef = useRef(false);
  const prevTtsSpeakingRef = useRef(false);

  // Auto-flip when the conv overlay opens / closes during a walk. Empty
  // state (no destination) keeps whatever the user last chose.
  useEffect(() => {
    if (isEmpty) return;
    setActiveVoice(convOpen ? "conv" : "nav");
  }, [convOpen, isEmpty]);

  // Cancel any in-flight utterance ONLY on a real flip — never on the
  // initial mount. React fast-refresh / hot-reload remounts the widget
  // mid-walk; if this effect fires on first mount, it cancels the
  // walk-start utterance the moment it's queued (every speak() call
  // immediately fires `onerror: canceled` with no `onstart` ever
  // logged). The flipMounted ref skips the first invocation.
  const flipMountedRef = useRef(false);
  useEffect(() => {
    if (!flipMountedRef.current) {
      flipMountedRef.current = true;
      return;
    }
    ttsCancel();
  }, [activeVoice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tiny flip-switch helpers — each speaker icon owns its own surface.
  const toggleNavVoice = useCallback(
    () => setActiveVoice((v) => (v === "nav" ? "off" : "nav")),
    []
  );
  const toggleConvVoice = useCallback(
    () => setActiveVoice((v) => (v === "conv" ? "off" : "conv")),
    []
  );

  // ── Navigation TTS: speaks the maneuver on three triggers (walk-start,
  // skip, new maneuver). ETA is only spoken on the very first utterance
  // per walk session — after that, the user already knows the rough
  // remaining time and we don't repeat it. Same `voiceOn` gate as the
  // AI-reply TTS so muting the speaker silences both.
  const prevDestRef = useRef(null);
  const prevInstrPrefixRef = useRef(null);
  const lastNavSpeakAtRef = useRef(0);
  // Track whether we've already announced ETA for the current walk
  // session. Resets when the destination becomes null again (walk ended).
  const announcedEtaRef = useRef(false);
  // Defer the walk-start utterance briefly so OSRM has time to populate
  // the actual turn maneuver — otherwise we'd announce the to-stop
  // fallback distance instead of the next-maneuver distance.
  const walkStartTimerRef = useRef(null);
  // Live snapshots of the props the deferred timer reads at fire-time
  // (so it speaks the LATEST instruction / ETA, not whatever was current
  // at the moment the timer was scheduled).
  const latestInstructionRef = useRef(instruction);
  const latestEtaRef = useRef(eta);
  const latestDestinationRef = useRef(destination);
  // Categorize the instruction so we only speak on real maneuver changes,
  // not on every "188 ft → 187 ft" decrement tick.
  const instrPrefix = (() => {
    const s = (instruction || "").toLowerCase().trim();
    if (s.startsWith("turn left")) return "turn left";
    if (s.startsWith("turn right")) return "turn right";
    if (s.startsWith("turn")) return "turn";
    if (s.startsWith("walk")) return "walk";
    if (s.startsWith("head")) return "head";
    if (s.startsWith("arriv")) return "arriving";
    return s.split(/\s+/)[0] || "";
  })();
  useEffect(() => {
    if (activeVoice !== "nav") return;
    if (!destination) {
      // Walk ended — clear any pending walk-start utterance AND reset
      // session refs so the next walk (even to the same destination)
      // re-fires trigger 1 cleanly. Without this reset, restarting a
      // walk to the same place produces zero TTS because prevDestRef is
      // still set from the previous session.
      if (walkStartTimerRef.current) {
        clearTimeout(walkStartTimerRef.current);
        walkStartTimerRef.current = null;
      }
      prevDestRef.current = null;
      prevInstrPrefixRef.current = null;
      lastNavSpeakAtRef.current = 0;
      return;
    }
    // Refresh the TTS user-gesture activation token. The user just took
    // an action (tapped Start exploring, or skipped, or arrived) which
    // changed destination/instruction; this effect runs synchronously in
    // the same task as that click, which is still inside the gesture
    // activation window. Priming here grants ~5 s of cover for the
    // deferred 1 s walk-start timer to actually speak.
    try { ttsPrime(); } catch (_e) {}
    // Live snapshot refs: the deferred walk-start timer reads these at
    // fire-time so it always speaks the *latest* instruction / ETA, not
    // whatever was current when the timer was scheduled.
    latestInstructionRef.current = instruction;
    latestEtaRef.current = eta;
    latestDestinationRef.current = destination;

    const buildPhrase = () => {
      const eText = (latestEtaRef.current || "").replace(/\s*min\s*$/i, "").trim();
      const eNum = parseFloat(eText);
      const word = eNum === 1 ? "minute" : "minutes";
      const ePhrase = eText && eText !== "—" ? `${eText} ${word} remaining` : "";
      const i = latestInstructionRef.current;
      const iPhrase = (i && i !== "—") ? i : "";
      return { ePhrase, iPhrase };
    };
    const PAUSE = " ... ";
    const join = (parts) => parts.filter(Boolean).join(PAUSE).trim();

    const now = Date.now();
    if (now - lastNavSpeakAtRef.current < 1500) {
      // Cooldown — leave refs untouched so transitions that happen during
      // the cooldown still get detected on the next post-cooldown render.
      return;
    }

    if (!prevDestRef.current) {
      // Trigger 1 (walking just started). Defer 1 s so OSRM's route data
      // populates — otherwise `instruction` is the to-stop fallback
      // ("walk forward 126 ft" to the destination) instead of the actual
      // next maneuver ("walk forward 69 ft" to the turn point). The
      // timer reads `latestInstructionRef` at fire-time so it always
      // speaks the freshest value, not whatever was current at schedule
      // time.
      if (walkStartTimerRef.current) clearTimeout(walkStartTimerRef.current);
      walkStartTimerRef.current = setTimeout(() => {
        walkStartTimerRef.current = null;
        const { ePhrase, iPhrase } = buildPhrase();
        const line = join([`Heading to ${latestDestinationRef.current}`, iPhrase, ePhrase]);
        lastNavSpeakAtRef.current = Date.now();
        prevDestRef.current = latestDestinationRef.current;
        prevInstrPrefixRef.current =
          (iPhrase || "").toLowerCase().split(/\s+/).slice(0, 2).join(" ");
        if (line) ttsSpeak(line);
      }, 1000);
      // Mark dest as "seen" immediately so trigger 2/3 don't ALSO fire
      // during the deferred window.
      prevDestRef.current = destination;
      prevInstrPrefixRef.current = instrPrefix;
      return;
    }

    let line = null;
    const { ePhrase, iPhrase } = buildPhrase();
    if (prevDestRef.current !== destination) {
      // Trigger 2: skipped.
      line = join([`Now heading to ${destination}`, iPhrase, ePhrase]);
    } else if (
      prevInstrPrefixRef.current !== null &&
      prevInstrPrefixRef.current !== instrPrefix
    ) {
      // Trigger 3: new maneuver category within the same destination.
      line = join([iPhrase, ePhrase]);
    }
    prevDestRef.current = destination;
    prevInstrPrefixRef.current = instrPrefix;
    if (line) {
      lastNavSpeakAtRef.current = now;
      ttsSpeak(line);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination, instrPrefix, instruction, eta, activeVoice]);

  // No cancel-on-open: calling speechSynthesis.cancel() right after
  // ttsPrime() invalidates the user-gesture activation that primes the
  // queue, and subsequent async speak() calls (Gemini's reply) silently
  // no-op. The nav-TTS effect already early-returns when convOpen is
  // true, so we simply let any in-flight maneuver utterance finish.

  // Document-wide TTS priming. The walk-start utterance fires from a 1 s
  // setTimeout AFTER the user's tap on "Start exploring" (which lives in
  // NavigationMapScreen, not inside this widget — so the widget's own
  // pointerdown handler can't catch it). Chrome / Safari then block the
  // deferred speak() because the gesture activation has expired by the
  // time the timer fires. A capture-phase pointerdown listener on the
  // document refreshes the activation token on EVERY tap anywhere on the
  // page — cheap (one silent utterance, gated by primedRef), and means
  // the first maneuver TTS reliably plays no matter where the last
  // gesture happened.
  useEffect(() => {
    const onAnyPointer = () => { try { ttsPrime(); } catch (_e) {} };
    document.addEventListener("pointerdown", onAnyPointer, { capture: true });
    return () => document.removeEventListener("pointerdown", onAnyPointer, { capture: true });
  }, [ttsPrime]);

  // ── Conversation: inline STT with polling-based silence detection ──────
  // Built from scratch with a 200ms poll that checks Date.now() against the
  // last result timestamp. Bulletproof: doesn't rely on setTimeout reset
  // chains being honored by Chrome's continuous-mode recognizer. After
  // 1s of inactivity (with at least one recognized word), we stop and
  // commit the transcript to Gemini.
  const askAiRef = useRef(null);
  const [interim, setInterim] = useState("");
  const [aiPending, setAiPending] = useState(false);
  const recogRef = useRef(null);
  const lastResultAtRef = useRef(0);
  const sessionStartedAtRef = useRef(0);
  const heardSpeechRef = useRef(false);
  const stoppedRef = useRef(true);
  const pollRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const combinedTranscriptRef = useRef("");

  const SILENCE_MS = 1000;       // 1s of silence after last word → auto-stop
  const NO_SPEECH_MS = 8000;     // 8s with nothing heard → auto-stop empty
  const MAX_LISTEN_MS = 30000;   // 30s hard cap

  // Forward declaration so handleAutoStop can call askAi via a ref.
  const handleAutoStop = useCallback((transcript) => {
    console.log("[Strollo] handleAutoStop called with:", transcript);
    setSpeakActive(false);
    onSpeakEnd?.();
    const text = (transcript || "").trim();
    if (!text) {
      console.log("[Strollo] handleAutoStop: empty transcript, returning");
      return;
    }
    const userMsg = { id: `m-${++idRef.current}`, role: "user", text };
    setMessages((ms) => {
      const next = [...ms, userMsg];
      askAiRef.current?.(text, next.slice(0, -1));
      return next;
    });
  }, [onSpeakEnd]);

  const stopConvListening = useCallback(() => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    clearInterval(pollRef.current);
    pollRef.current = null;
    const r = recogRef.current;
    if (r) {
      try { r.onresult = null; r.onerror = null; r.onend = null; } catch (e) {}
      try { r.stop(); } catch (e) {}
      try { r.abort(); } catch (e) {}
    }
    recogRef.current = null;
    const captured = (finalTranscriptRef.current || combinedTranscriptRef.current).trim();
    finalTranscriptRef.current = "";
    combinedTranscriptRef.current = "";
    setInterim("");
    handleAutoStop(captured);
  }, [handleAutoStop]);

  const startConvListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn("[STT] SpeechRecognition not supported in this browser");
      setMessages((ms) => [
        ...ms,
        {
          id: `m-${++idRef.current}`,
          role: "ai",
          text: "Voice input isn't supported in this browser. Try Chrome, Edge, or Safari.",
          places: [],
        },
      ]);
      setSpeakActive(false);
      return;
    }
    // Tear down any prior session.
    if (recogRef.current) {
      try {
        recogRef.current.onresult = null;
        recogRef.current.onerror = null;
        recogRef.current.onend = null;
      } catch (e) {}
      try { recogRef.current.abort(); } catch (e) {}
      recogRef.current = null;
    }
    // Force-release the iOS audio session so the mic isn't blocked by a
    // still-active <audio> element from a previous Cloud TTS reply.
    try { cancelCloudTts(); } catch (_e) {}
    clearInterval(pollRef.current);
    finalTranscriptRef.current = "";
    combinedTranscriptRef.current = "";
    setInterim("");
    heardSpeechRef.current = false;
    stoppedRef.current = false;
    sessionStartedAtRef.current = Date.now();
    lastResultAtRef.current = Date.now();

    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";

    r.onresult = (e) => {
      let interimText = "";
      let finalText = "";
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      finalTranscriptRef.current = finalText;
      const combined = (finalText + interimText).trim();
      combinedTranscriptRef.current = combined;
      setInterim(combined);
      if (combined) heardSpeechRef.current = true;
      lastResultAtRef.current = Date.now();
      console.log("[STT] onresult →", combined);
    };

    r.onerror = (e) => {
      if (e.error === "aborted") return;
      console.warn("[STT] error:", e.error);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        stoppedRef.current = true;
        clearInterval(pollRef.current);
        recogRef.current = null;
        setSpeakActive(false);
        setMessages((ms) => [
          ...ms,
          {
            id: `m-${++idRef.current}`,
            role: "ai",
            text: "I need microphone permission to hear you — please allow it in your browser, then tap the mic again.",
            places: [],
          },
        ]);
      }
    };

    r.onend = () => {
      // Chrome ends the recognizer on internal silence detection (~500ms).
      // If WE haven't stopped, restart so the user can keep talking.
      if (stoppedRef.current) return;
      if (recogRef.current !== r) return;
      console.log("[STT] onend → restarting (continuous mode)");
      try { r.start(); } catch (err) {
        console.warn("[STT] restart failed:", err?.name);
      }
    };

    recogRef.current = r;
    // On iOS, give the audio session ~180ms to release after we paused the
    // <audio> element above. Starting recognition immediately makes WebKit
    // route the mic into the still-active playback session, where it
    // produces no onresult events. Desktop starts immediately.
    const startNow = () => {
      if (recogRef.current !== r) return;
      try {
        r.start();
        console.log("[STT] r.start() succeeded");
      } catch (e) {
        console.warn("[STT] r.start() threw:", e?.name);
      }
    };
    if (isMobile()) setTimeout(startNow, 180);
    else startNow();

    // Polling loop — runs every 200ms and decides whether to auto-stop.
    pollRef.current = setInterval(() => {
      if (stoppedRef.current) return;
      const now = Date.now();
      const sinceLast = now - lastResultAtRef.current;
      const sessionDur = now - sessionStartedAtRef.current;

      // Hard cap.
      if (sessionDur > MAX_LISTEN_MS) {
        console.log("[STT] poll: 30s max cap reached → stop");
        stopConvListening();
        return;
      }
      // No speech detected within window.
      if (!heardSpeechRef.current && sessionDur > NO_SPEECH_MS) {
        console.log("[STT] poll: 8s no-speech timeout → stop");
        stopConvListening();
        return;
      }
      // Silence after speech.
      if (heardSpeechRef.current && sinceLast > SILENCE_MS) {
        console.log("[STT] poll: 1s silence after speech → stop");
        stopConvListening();
        return;
      }
    }, 200);
    console.log("[STT] startConvListening: session armed, poll interval running");
  }, [stopConvListening]);

  const pushMessage = useCallback((role, text, places = null) => {
    const id = `m-${++idRef.current}`;
    const msg = { id, role, text, places: places || [] };
    setMessages((ms) => [...ms, msg]);
    if (role === "ai") {
      console.log("[Strollo] AI message pushed; activeVoice =", activeVoice);
      if (activeVoice === "conv") {
        restartSttAfterTtsRef.current = true;
        ttsSpeak(text);
      }
    }
    return msg;
  }, [activeVoice, ttsSpeak]);

  const askAi = useCallback(async (userText, history) => {
    // Slim, tone-free conversation prompt — emits 📍 lines so the reel can
    // render tappable location pills under the AI message. Honors GPS,
    // reverse-geocoded area, vibe quiz, and saved category filters.
    const sys = buildConversationPrompt({
      userLocation,
      area: currentLocationName || geoArea,
      vibePreferences,
      preferences,
      query: userText,
    });
    const conv = [
      ...(history || []).slice(-6).map((m) => ({ role: m.role, text: m.text })),
      { role: "user", text: userText },
    ];

    // Retry loop — Gemini is the only source of truth. On failure we retry;
    // if we exhaust retries we surface the full error in the reel so the
    // user (or a developer) can read it instead of seeing a silent blank.
    const delays = [0, 1500, 4000];
    let lastError = null;
    setAiPending(true);
    try {
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
      }
      try {
        const raw = await sendMessage(conv, sys);
        const display = (cleanResponseText(raw) || raw || "").trim();
        if (!display) {
          lastError = new Error("Gemini returned an empty response.");
          continue;
        }
        const rawPlaces = extractPlaces(raw) || [];
        // Strict path: only render a pill + pin when Gemini emits a 📍 line
        // with real coordinates. No prose-regex fallback (it kept matching
        // verbs like "Try" + a half-name and geocoding to the wrong city).
        const places = rawPlaces.map((p) => p.name).filter(Boolean);
        pushMessage("ai", display, places);

        const firstPin = rawPlaces.find(
          (p) => p.name && typeof p.hintLat === "number" && typeof p.hintLng === "number"
        );
        console.log("[Pin] rawPlaces =", rawPlaces, "| firstPin =", firstPin);
        if (onAiSuggestPlace && firstPin) {
          // Sanity check: pin must be within ~3 km of the user. If Gemini's
          // coordinates are wildly off, skip the marker rather than
          // misleading the user.
          let withinRange = true;
          if (
            userLocation &&
            typeof userLocation[0] === "number" &&
            typeof userLocation[1] === "number"
          ) {
            const dLat = firstPin.hintLat - userLocation[0];
            const dLng = firstPin.hintLng - userLocation[1];
            const km = Math.sqrt(dLat * dLat + dLng * dLng) * 111.32;
            if (km > 3) {
              console.warn("[Pin] hint coords are", km.toFixed(2), "km from user — skipping pin");
              withinRange = false;
            }
          }
          if (withinRange) {
            console.log("[Pin] using 📍 hint coords:", firstPin.hintLat, firstPin.hintLng);
            onAiSuggestPlace({
              name: firstPin.name,
              lat: firstPin.hintLat,
              lng: firstPin.hintLng,
              desc: firstPin.desc || null,
            });
          }
        }
        return;
      } catch (e) {
        lastError = e;
        console.warn(`askAi attempt ${attempt + 1} failed:`, e);
      }
    }
    console.warn("askAi exhausted retries — surfacing error in reel.", lastError);
    // Surface the full error in the reel so the user sees exactly what's
    // failing instead of a silent blank — easier to debug API/key/quota
    // problems live.
    const errBody = lastError
      ? (lastError.stack || `${lastError.name || "Error"}: ${lastError.message || String(lastError)}`)
      : "Gemini did not return a response after 3 attempts.";
    pushMessage("ai", `[Gemini error]\n${errBody}`);
    } finally {
      setAiPending(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, currentLocationName, geoArea, vibePreferences, preferences, pushMessage, onAiSuggestPlace]);

  // Keep askAiRef pointing at the latest askAi so handleAutoStop (declared
  // before askAi for hook-ordering reasons) always invokes the current copy.
  askAiRef.current = askAi;

  // Add/remove by name → parent owns the trip state, we just notify.
  const addLocation = useCallback((name) => {
    console.log("[Add] location pill + tapped:", name, "onAddByName?", !!onAddByName);
    if (!name) return;
    if (!onAddByName) {
      console.warn("[Add] onAddByName prop is missing — parent didn't wire it");
      return;
    }
    onAddByName(name);
    setTripToast(`Added "${name}" to your trip`);
    if (tripToastTimerRef.current) clearTimeout(tripToastTimerRef.current);
    tripToastTimerRef.current = setTimeout(() => setTripToast(null), 1800);
    // If we're in-walk and the overlay is open, surface the yellow
    // "Update walk plan" CTA so the user can commit the new stop(s)
    // back to the route in one tap.
    if (convOpen && !isEmpty) {
      setConvAddedCount((n) => n + 1);
    }
  }, [onAddByName, convOpen, isEmpty]);

  const removeLocation = useCallback((name) => {
    if (!name || !onRemoveByName) return;
    onRemoveByName(name);
  }, [onRemoveByName]);

  // Prompt-pill tap → enter conversation, push prompt as user message, ask.
  // Auto-flips voice on so the AI's introduction is read aloud (the user can
  // mute via the speaker button afterwards).
  const handlePromptTap = useCallback((p) => {
    // Prime TTS inside this click — Chrome/Safari otherwise no-op the
    // async `speak()` that fires after Gemini's reply lands.
    ttsPrime();
    setConvMode("conversation");
    setActiveVoice("conv");
    const userMsg = { id: `m-${++idRef.current}`, role: "user", text: p.prompt };
    setMessages((ms) => {
      const next = [...ms, userMsg];
      askAi(p.prompt, next.slice(0, -1));
      return next;
    });
  }, [askAi, ttsPrime]);

  // Restart → fully return to the original post-"Start exploring" state:
  // clear messages + live transcript, stop listening, cancel TTS, drop the
  // "speaking" UI flag, turn voice off, and switch back to Tips mode (the
  // mode-change effect will bump tipNonce and refetch a fresh tip).
  const handleRestart = useCallback(() => {
    setMessages([]);
    setInterim("");
    finalTranscriptRef.current = "";
    stopConvListening();
    ttsCancel();
    restartSttAfterTtsRef.current = false;
    setSpeakActive(false);
    setActiveVoice("conv");
    setConvMode("tips");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopConvListening, ttsCancel]);

  // Tip auto-refresh is FROZEN: no entry bump, no idle rotation. The tip
  // rendered on first load stays in place until the user manually triggers
  // a new request (e.g. taps a prompt pill or the mic). Re-enable by
  // restoring the entry-bump effect and the 60s flavor-rotation interval.
  // (TIP_FLAVORS / setTipFlavor are kept around for the future.)

  // Cancel STT (mic) on unmount — must release the recognizer or the
  // browser keeps it open. We deliberately do NOT cancel TTS on unmount:
  // React fast-refresh / hot-reload remounts the widget mid-walk, which
  // would cancel the walk-start utterance the moment it tries to play.
  // SpeechSynthesis is global and will naturally stop when the page
  // navigates / closes, so leaking pending utterances on dev remounts
  // is harmless and keeps audio reliable.
  const cleanupRefs = useRef({ stopConvListening });
  cleanupRefs.current.stopConvListening = stopConvListening;
  useEffect(() => () => {
    cleanupRefs.current.stopConvListening?.();
    if (tripToastTimerRef.current) clearTimeout(tripToastTimerRef.current);
  }, []);

  // eslint-disable-next-line no-unused-vars
  const _silenceUnused = { geoStatus, geoLabel, geocodePlace };

  const startSpeak = () => {
    setSpeakActive(true);
    // In empty state, the persistent speak button doubles as the entry point
    // into the conversation reel: switch mode + drive our own STT recognizer
    // so the live interim transcript flows into the reel's tier-0 slot.
    if (isEmpty) {
      if (convMode !== "conversation") setConvMode("conversation");
      startConvListening();
    } else {
      // Walking-state path — open the in-walk conversation overlay above
      // the nav chrome, switch to conversation mode, and start listening.
      // Same STT/Gemini flow as empty-state.
      if (!convOpen) setConvOpen(true);
      if (convMode !== "conversation") setConvMode("conversation");
      startConvListening();
    }
    onSpeakStart?.();
  };
  const stopSpeak = () => {
    setSpeakActive(false);
    // useSpeechRecognition's onAutoStop will fire when the recognizer ends,
    // which is where the user message gets committed and Gemini is asked.
    stopConvListening();
    onSpeakEnd?.();
  };

  // Tap-to-toggle (matches the Strollo Conversation prototype's MicButton).
  // First tap → start listening; second tap → stop and commit transcript.
  const onSpeakToggle = () => {
    // Prime TTS inside this click handler so the post-Gemini speak() call
    // works (Chrome/Safari require an in-gesture activation).
    ttsPrime();
    if (speakActive) {
      // User explicitly stopped — don't re-arm the mic when the (now
      // cancelled) TTS finishes.
      restartSttAfterTtsRef.current = false;
      stopSpeak();
    } else {
      startSpeak();
    }
  };

  // After a conv-AI reply's TTS finishes, automatically re-open the mic so
  // the user can keep talking without tapping. Only fires when the AI
  // pushed the message (restartSttAfterTtsRef set) and the user hasn't
  // already started listening or cancelled.
  //
  // Mobile timing: iOS won't deliver mic input to SpeechRecognition until
  // the playback audio session has fully released. The 180ms inside
  // startConvListening is enough for a manual tap (human reaction time
  // adds buffer), but auto-restart fires on the audio.ended event, which
  // beats iOS's session swap. Add ~600ms here so the mobile path lands
  // safely.
  useEffect(() => {
    const wasSpeaking = prevTtsSpeakingRef.current;
    prevTtsSpeakingRef.current = ttsSpeaking;
    if (!wasSpeaking || ttsSpeaking) return;
    if (!restartSttAfterTtsRef.current) return;
    restartSttAfterTtsRef.current = false;
    if (speakActive) return;
    if (activeVoice !== "conv") return;
    if (!(convOpen || isEmpty)) return;
    const delay = isMobile() ? 600 : 0;
    const t = setTimeout(() => {
      // Re-check guards at fire time — user may have tapped/cancelled
      // during the delay.
      if (speakActive) return;
      if (activeVoice !== "conv") return;
      if (!(convOpen || isEmpty)) return;
      startSpeak();
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ttsSpeaking]);

  const listening = speakActive;
  // While the in-walk conversation overlay is open the conv-section already
  // shows the listening UI (interim transcript + LISTENING button). Don't
  // also morph the nav-section below the divider into a "you're saying"
  // view — keep the normal walking chrome (Heading to / turn / DIST/ETA)
  // visible so the user can still see where they're going while talking.
  const navListening = listening && !(convOpen && !isEmpty);
  const glowing = !!suggestion && !listening;

  // Drag-up to expand into the full-screen chat. Tracks pointerdown only when
  // the gesture starts on the widget chrome (not on a button), then watches
  // for ~60px of upward movement and calls onExpand once.
  const expandRef = useRef({ active: false, startY: 0 });
  const onWidgetPointerDown = (e) => {
    // Re-arm the TTS user-gesture activation on every touch — Chrome and
    // Safari let `speechSynthesis.speak()` fire silently when called from
    // an async context (the nav-TTS 1 s timer, the post-Gemini speak)
    // unless a recent gesture has primed the queue. A cheap inaudible
    // utterance from inside this handler refreshes the activation token
    // for the next ~5 s, which covers both deferred call sites.
    try { ttsPrime(); } catch (_e) {}
    if (!onExpand) return;
    if (e.target.closest("button, [data-no-drag]")) return;
    expandRef.current = { active: true, startY: e.clientY };
  };
  const onWidgetPointerMove = (e) => {
    if (!expandRef.current.active) return;
    if (expandRef.current.startY - e.clientY > 60) {
      expandRef.current.active = false;
      onExpand?.();
    }
  };
  const onWidgetPointerEnd = () => {
    expandRef.current.active = false;
  };

  return (
    <div
      ref={forwardedRef}
      className={`wcw${navListening ? " wcw--listening" : ""}${glowing ? " wcw--glow" : ""}`}
      onPointerDown={onWidgetPointerDown}
      onPointerMove={onWidgetPointerMove}
      onPointerUp={onWidgetPointerEnd}
      onPointerCancel={onWidgetPointerEnd}
    >
      {/* In-walk conversation overlay — stacks above the nav chrome inside
          the same widget. Only renders during a walk; empty-state handles
          conversation through its own branch lower in the tree. */}
      {!isEmpty && convOpen && (
        <>
          <div className="wcw-conv-section">
            <div className="wcw-status-row">
              <span className="wcw-listening-label wcw-listening-label--solo">
                <span className="wcw-listening-dot" />
                Conversation
              </span>
              {trip.length > 0 && (
                <span className="strollo-saved-badge" aria-label={`${trip.length} saved`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C8.4 2 5.5 4.9 5.5 8.5c0 4.7 6.5 12 6.5 12s6.5-7.3 6.5-12C18.5 4.9 15.6 2 12 2z" />
                    <circle cx="12" cy="8.5" r="2.4" fill="#fff" />
                  </svg>
                  {trip.length} saved
                </span>
              )}
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="wcw-icon-btn wcw-close-btn"
                onClick={() => {
                  stopConvListening();
                  setSpeakActive(false);
                  setConvOpen(false);
                  setConvAddedCount(0);
                }}
                aria-label="Close conversation"
                title="Close conversation"
                data-no-drag
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="strollo-conv-body strollo-conv-body--inline">
              <ConversationReel
                messages={messages}
                listening={speakActive}
                interim={interim}
                trip={trip}
                onAddLocation={(name) => addLocation(name)}
                onRemoveLocation={(name) => removeLocation(name)}
              />
            </div>
            <div className="wcw-bottom wcw-bottom--conv">
              <div className="wcw-bottom-left">
                <button
                  type="button"
                  className={`wcw-icon-btn${activeVoice === "conv" ? " wcw-icon-btn--active" : ""}`}
                  onClick={toggleConvVoice}
                  aria-label={activeVoice === "conv" ? "Mute AI replies" : "Unmute AI replies"}
                  aria-pressed={activeVoice === "conv"}
                  title={activeVoice === "conv" ? "AI voice on — tap to mute" : "AI voice off — tap to unmute (mutes navigation)"}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                    <polygon points="4 9 8 9 13 4 13 20 8 15 4 15" />
                    {activeVoice === "conv" && (
                      <path d="M16.5 8.2 a4 4 0 0 1 0 7.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    )}
                    {activeVoice !== "conv" && (
                      <line x1="3" y1="20" x2="21" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    )}
                  </svg>
                </button>
                <button
                  type="button"
                  className="wcw-icon-btn"
                  onClick={handleRestart}
                  disabled={messages.length === 0 && !interim}
                  aria-label="Restart conversation"
                  title="Restart conversation"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 12a8 8 0 1 0 2.5-5.8" />
                    <path d="M4 4v4h4" />
                  </svg>
                </button>
              </div>
              <div className="wcw-bottom-right">
                <button
                  type="button"
                  className={`wcw-icon-btn wcw-speak${speakActive ? " wcw-speak--active" : ""}${aiPending ? " wcw-speak--pending" : ""}`}
                  onClick={onSpeakToggle}
                  disabled={aiPending}
                  aria-label={aiPending ? "Thinking" : (speakActive ? "Stop talking" : "Tap to start talking; recording auto-stops")}
                  aria-pressed={speakActive}
                  aria-busy={aiPending}
                >
                  {aiPending
                    ? <span className="wcw-speak-spinner" aria-hidden="true" />
                    : <SoundBars active={speakActive} color="currentColor" />}
                  <span className="wcw-speak-label">{aiPending ? "Thinking" : (speakActive ? "Listening" : "Say anything")}</span>
                </button>
              </div>
            </div>
            {convAddedCount > 0 && (
              <button
                type="button"
                className="wcw-update-plan-btn"
                onClick={() => {
                  stopConvListening();
                  setSpeakActive(false);
                  setConvOpen(false);
                  setConvAddedCount(0);
                }}
                data-no-drag
              >
                Update walk plan
                {convAddedCount > 1 ? ` · ${convAddedCount}` : ""}
              </button>
            )}
          </div>
          <div className="wcw-conv-divider" aria-hidden="true" />
        </>
      )}

      <div className="wcw-status-row">
        {navListening ? (
          <>
            <span className="wcw-listening-label">
              <span className="wcw-listening-dot" />
              You're saying
            </span>
          </>
        ) : paused ? (
          <span className="wcw-paused-msg">
            {"You're resting at "}
            <span className="wcw-paused-name">{destination || "your stop"}</span>
            {"."}
          </span>
        ) : isEmpty ? (
          convMode === "conversation" ? (
            <>
              <span className="wcw-heading-label">Conversation</span>
              {trip.length > 0 && (
                <span className="strollo-saved-badge" aria-label={`${trip.length} saved`}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C8.4 2 5.5 4.9 5.5 8.5c0 4.7 6.5 12 6.5 12s6.5-7.3 6.5-12C18.5 4.9 15.6 2 12 2z" />
                    <circle cx="12" cy="8.5" r="2.4" fill="#fff" />
                  </svg>
                  {trip.length} saved
                </span>
              )}
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="wcw-icon-btn wcw-close-btn"
                onClick={() => setConvMode("tips")}
                aria-label="Close conversation"
                title="Close conversation"
                data-no-drag
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <span className="wcw-heading-label">You are at</span>
              <span className="wcw-destination">{headerLabel || "Locating…"}</span>
            </>
          )
        ) : (
          <>
            <span className="wcw-heading-label">Heading to</span>
            <span className="wcw-destination">{destination}</span>
            {atTarget ? (
              <button
                type="button"
                className="wcw-skip-btn wcw-skip-btn--arrived"
                onClick={onArrived}
                aria-label={`Confirm you have arrived at ${destination}`}
              >
                <svg className="wcw-skip-flag" width="11" height="13" viewBox="0 0 24 24" fill="#FFD501" stroke="none" aria-hidden="true">
                  <path d="M8 3 L8 21" stroke="#FFD501" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M8 3 L18 6 L8 10 Z"/>
                  <circle cx="8" cy="21" r="2"/>
                </svg>
                <span>I'm here</span>
              </button>
            ) : canSkip ? (
              <button
                type="button"
                className="wcw-skip-btn"
                onClick={onSkip}
                aria-label="Skip this stop"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                  <polygon points="4 5 13 12 4 19 4 5" />
                  <polygon points="13 5 22 12 13 19 13 5" />
                </svg>
                <span>Skip</span>
              </button>
            ) : null}
          </>
        )}
      </div>

      {/* Empty-state body = Strollo Conversation port (Tips / Reel / Minimized) */}
      {isEmpty && convMode === "tips" && (
        <div className="strollo-tips-body">
          {tipsLoading ? (
            <div className="strollo-tips-skel">
              <SkeletonLine width="92%" />
              <SkeletonLine width="76%" />
              <SkeletonLine width="58%" />
            </div>
          ) : (
            <p className="strollo-tips-tip">{tip}</p>
          )}
          <PromptPills disabled={tipsLoading} onTap={handlePromptTap} />
        </div>
      )}

      {isEmpty && convMode === "conversation" && (
        <div className="strollo-conv-body">
          <ConversationReel
            messages={messages}
            listening={speakActive}
            interim={interim}
            trip={trip}
            onAddLocation={(name) => addLocation(name)}
            onRemoveLocation={(name) => removeLocation(name)}
          />
        </div>
      )}

      {isEmpty && convMode === "minimized" && (
        <button
          type="button"
          className="strollo-peek-bar"
          onClick={() => setConvMode("tips")}
          aria-label="Expand tips"
        >
          <span className="strollo-peek-bar__label">TIPS</span>
          {headerLabel && <span className="strollo-peek-bar__loc">· {headerLabel}</span>}
        </button>
      )}

      {/* Walking-state body — preserved verbatim for non-empty journeys */}
      {!isEmpty && (
        navListening ? (
          <h2 className="wcw-turn">{`“${transcript || "…"}”`}</h2>
        ) : paused ? null : suggestion ? (
          <div className="wcw-suggestion" role="status">
            <span className="wcw-suggestion-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFD501" stroke="#B5912E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18h6" />
                <path d="M10 22h4" />
                <path d="M12 2a7 7 0 0 0-4 12.7 4 4 0 0 1 1.5 3.1V18h5v-.2a4 4 0 0 1 1.5-3.1A7 7 0 0 0 12 2z" />
              </svg>
            </span>
            <span className="wcw-suggestion-text">{suggestion}</span>
          </div>
        ) : narration ? (
          <p className="wcw-narration">{narration}</p>
        ) : (
          <div className="wcw-turn-row">
            <h2 className="wcw-turn">{instruction}</h2>
            {/* Mute / speaker toggle moved up next to the turn instruction
                so the secondary controls don't crowd the bottom row. Lower
                hierarchy than the SAY ANYTHING bar — compact, subtle. */}
            <button
              type="button"
              className={`wcw-turn-speaker${activeVoice !== "nav" ? " wcw-turn-speaker--muted" : ""}`}
              onClick={toggleNavVoice}
              aria-label={activeVoice === "nav" ? "Mute navigation" : "Unmute navigation"}
              aria-pressed={activeVoice !== "nav"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                <polygon points="4 9 8 9 13 4 13 20 8 15 4 15" />
                {activeVoice === "nav" && (
                  <path d="M16.5 8.2 a4 4 0 0 1 0 7.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                )}
                {activeVoice !== "nav" && (
                  <line x1="3" y1="20" x2="21" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        )
      )}

      {!navListening && !isEmpty && (
        <div className="wcw-stats">
          <div className="wcw-stat">
            <span className="wcw-stat-label">DIST</span>
            <span className="wcw-stat-value">{paused ? "—" : distance}</span>
          </div>
          <div className="wcw-stat">
            <span className="wcw-stat-label">ETA</span>
            <span className="wcw-stat-value">{paused ? "—" : eta}</span>
          </div>
        </div>
      )}
      {/* ProgressStrip removed per design — the dotted boots→flag strip
          was redundant with the route line + DIST/ETA stats. */}

      {!(convOpen && !isEmpty) && (
      <div className="wcw-bottom">
        <div className="wcw-bottom-left">
          {/* In empty-state Conversation mode, the left cluster swaps to
              speaker-toggle + restart (per the Strollo Conversation prototype).
              In every other state the existing chat + mute icons render. */}
          {isEmpty && convMode === "conversation" ? (
            <>
              <button
                type="button"
                className={`wcw-icon-btn${activeVoice === "conv" ? " wcw-icon-btn--active" : ""}`}
                onClick={toggleConvVoice}
                aria-label={activeVoice === "conv" ? "Mute AI replies" : "Unmute AI replies"}
                aria-pressed={activeVoice === "conv"}
                title={activeVoice === "conv" ? "AI voice on — tap to mute" : "AI voice off — tap to unmute"}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                  <polygon points="4 9 8 9 13 4 13 20 8 15 4 15" />
                  {activeVoice === "conv" && (
                    <path d="M16.5 8.2 a4 4 0 0 1 0 7.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  )}
                  {activeVoice !== "conv" && (
                    <line x1="3" y1="20" x2="21" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  )}
                </svg>
              </button>
              <button
                type="button"
                className="wcw-icon-btn"
                onClick={handleRestart}
                disabled={messages.length === 0 && !interim}
                aria-label="Restart conversation"
                title="Restart conversation"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 12a8 8 0 1 0 2.5-5.8" />
                  <path d="M4 4v4h4" />
                </svg>
              </button>
            </>
          ) : (
            <>
              {onChat && (
                <button
                  type="button"
                  className="wcw-icon-btn"
                  onClick={onChat}
                  aria-label="Open chat"
                  title="Open chat"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
              )}
              {/* Mute/speaker icon lives next to the turn instruction
                  (`.wcw-turn-speaker`) — fully removed from this row so
                  the End walk button can sit flush against the left
                  inner padding. */}
            </>
          )}
        </div>
        <div className="wcw-bottom-right">
          {/* Exit / End walk — visible in walking state and the Tips card.
              HIDDEN in Conversation mode (user is mid-interaction with
              Gemini; the speaker / restart / mic row needs the room and
              an "exit" mid-thought is the wrong affordance). Tap → 240 ms
              fade-out, then onEnd (parent's onGoBack) → home + fresh
              locate-me. */}
          {onEnd && !(isEmpty && convMode === "conversation") && (
            <button
              type="button"
              className="wcw-icon-btn wcw-end-btn"
              onClick={(e) => {
                const root = e.currentTarget.closest(".wcw");
                if (root) {
                  root.classList.add("wcw--ending");
                  setTimeout(() => onEnd && onEnd(), 240);
                } else {
                  onEnd && onEnd();
                }
              }}
              aria-label="End walk"
              title="End walk"
            >
              {/* Open-door / exit glyph (door + arrow leaving) */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className={`wcw-icon-btn wcw-speak${speakActive ? " wcw-speak--active" : ""}${aiPending ? " wcw-speak--pending" : ""}`}
            onClick={onSpeakToggle}
            disabled={aiPending}
            aria-label={aiPending ? "Thinking" : (speakActive ? "Stop talking" : "Tap to start talking; recording auto-stops")}
            aria-pressed={speakActive}
            aria-busy={aiPending}
          >
            {aiPending
              ? <span className="wcw-speak-spinner" aria-hidden="true" />
              : <SoundBars active={speakActive} color="currentColor" />}
            <span className="wcw-speak-label">{aiPending ? "Thinking" : (speakActive ? "Listening" : "Say anything")}</span>
          </button>
        </div>
      </div>
      )}

      {tripToast && (
        <div className="strollo-trip-toast" role="status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C8.4 2 5.5 4.9 5.5 8.5c0 4.7 6.5 12 6.5 12s6.5-7.3 6.5-12C18.5 4.9 15.6 2 12 2z" />
            <circle cx="12" cy="8.5" r="2.4" fill="#fff" />
          </svg>
          {tripToast}
        </div>
      )}
    </div>
  );
}

const WalkCompanionWidget = React.forwardRef(WalkCompanionWidgetInner);
export default WalkCompanionWidget;
