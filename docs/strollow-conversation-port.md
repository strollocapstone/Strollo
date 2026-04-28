# Strollow Conversation port — full-scale work log

**Branch:** `eric/remove-map-blobs`
**Window:** ~April 26 → April 28, 2026
**Scope:** Port the Claude-Design "Strollow Conversation" prototype into Strollo, wire all LLM calls to Gemini, unify the navigation widget across the app, and a long tail of UX polish.

---

## TL;DR

The bottom dynamic-island widget on Strollo was a static "Heading to / instruction / DIST / ETA" pill with one push-to-talk mic. We turned it into a full conversational surface that:

- shows GPS-grounded **Tips** by default,
- swaps to a rotating **Conversation reel** when the user taps to speak,
- drops **location pills** under each AI reply that save real spots into the trip,
- **speaks** Gemini's replies back via browser TTS, and
- **narrates the walk** itself (maneuver + remaining ETA) on the same TTS engine.

All LLM calls go through **Gemini** (`gemini-2.5-flash-lite`); the prototype's `window.claude.complete` calls are gone.

The widget is the **single canonical navigation module** — `WalkCompanionWidget` — used in both `NavigationMapScreen` (live) and `LockScreen` (kept in sync).

Two unrelated map cleanups landed on the same branch: removing decorative purple blob markers, and unifying nav-pin styling with home (yellow numbered circle).

---

## Files touched

| File | Net change | What |
|---|---|---|
| `src/WalkCompanionWidget.js` | major | Empty-state branch became Tips / Conversation / Minimized modes; STT, TTS, location-pill add, navigation TTS triggers, end-walk button, inline speaker, exit fade-out |
| `src/WalkCompanionWidget.css` | major | New classes for tips body, prompt pills, conversation reel, location pills, AI sparkle pin, end-walk red icon, fade-out keyframe, inline speaker |
| `src/strollowConversation.js` | **new** | `LocationPill`, `ConversationReel`, `PromptPills`, `SkeletonLine`, `useTipFetch`, `useTtsSpeak`, `useReverseGeocodeOnce` |
| `src/NavigationMapScreen.js` | major | Pin-tier ladder, blob removal, AI suggestion pin, exploration mode + "Start exploring · N" CTA, locate-me FAB centered above widget, on-add geocode + add-by-name, end-walk plumbing |
| `src/NavigationMapScreen.css` | medium | AI sparkle pin styling, FAB positioning above the live widget height, "Start exploring · N" pill |
| `src/HomeScreen.js` | small | Single-ring Overpass fetch (replaced the 3-ring fan-out), `chat-header-close` × button |
| `src/HomeScreen.css` | small | Close-button pinned to top-right of the chat overlay header |
| `src/geminiService.js` | medium | New `buildConversationPrompt`, stripped tone preamble from `buildSystemPrompt`, sequential Overpass with 429 backoff, walking-radius rule |
| `src/useSpeechRecognition.js` | small | Diagnostic logs around start / onresult / silence-timer / onend |
| `src/LockScreen.js` | small | Updated stale prop names to current widget API |
| `src/archive/VoiceFullScreen.js` | moved | Was unmounted earlier; archived |
| `src/archive/WalkCompanionScreen.js` | moved | Dead module (only `MuteSvg`/`SoundWaveSvg` exports were referenced by the now-archived VoiceFullScreen); archived |
| `docs/strollow-conversation-port.md` | **new** | This document |

---

## Phase 1 — Map + pin cleanup (the warm-up)

**Pulled in from Seemin's branch:** widget chrome refresh, walking-state polish, and a draft "muted" stop-pin treatment on the navigation map. Merged onto `eric/remove-map-blobs` keeping `NavigationMapScreen.js` ours.

### 1. Unify nav location pill with HomeScreen style — PR #44 (merged)
The active-destination pin on the nav map rendered as `1 [🟡🍴] Kabana` (separate badge + category icon). Home's "added" pill rendered as `[🟡 1] Kabana` (number inside the yellow circle). Folded the nav pin into one helper that produces the same markup as `makePinIcon(..., true, false, sequence, 'pill')` from HomeScreen.

### 2. Remove decorative purple blob overlay — PR #47 (merged)
The map rendered ten large purple radial-gradient ellipses scattered around the initial center. Decorative only, obscuring streets, no real meaning. Deleted `ORGANIC_RADII`, `makeBlob`, `BLOB_OFFSETS`, the `blobs` `useMemo`, and the `<Marker>` render.

### 3. Pin tier ladder synced to home
HomeScreen has a density-aware tier ladder: pill on tap/added → labeled dot at zoom ≥ 14 → mini purple dot at zoom < 14 → hidden < 12. Ported the same rules to `NavigationMapScreen` so the nav stops shrink to dots when the auto-fit zooms out.

---

## Phase 2 — Strollow Conversation port

### Design source
Claude-Design bundle at `https://api.anthropic.com/v1/design/h/pFbP2LHJPymMSiibhwwTGA` — a React + Babel-standalone prototype. Read `chats/chat1.md` (full design conversation) and the JSX components (`app.jsx`, `conversation.jsx`).

The prototype calls `window.claude.complete(prompt)` for everything. Hard rule going in: **all LLM calls must go through `geminiService.sendMessage`** (Gemini API). No new providers.

### Inventory
What Seemin already shipped and we **didn't** rebuild:
- `currentLocationName` prop and "You are at …" header
- Live STT interim shown in `wcw-turn` while listening
- `transcript` prop, `onSpeakStart` / `onSpeakEnd` callbacks
- `reverseGeocode` util in `mapUtils.js` (was orphan; we wired it up)

What we **did** build:
- Tips body (prose tip + 5 prompt pills + breathing yellow mic + locate-me pill)
- Conversation reel (rotating tier-sized messages, interim caret, auto-scroll)
- Location pills under AI replies (white chip + purple `+` ⇄ yellow numbered chip + red `×`)
- Geocode-by-name → append to journey
- Window-TTS for AI replies AND walk maneuvers
- Restart flow (clear messages, cancel TTS/STT, return to Tips)
- "Start exploring · N" exploration→walking handoff
- AI sparkle map pin

### Design → existing-component map (final)

| Prototype piece | Strollo home |
|---|---|
| `TipsCard` | Empty-state branch in `WalkCompanionWidget` |
| `ConversationCard` (header + reel + voice row) | New sub-component inside `WalkCompanionWidget`, sources from chat-overlay's `sendMessage` plumbing pattern |
| `ConversationReel` | New: `strollowConversation.js → ConversationReel` |
| `LocationPill` | New: `strollowConversation.js → LocationPill`; uses `extractPlaces` from `geminiService` |
| `window.claude.complete` for tip | `sendMessage([{role:'user',text:tipPrompt}], buildSystemPrompt({...}))` |
| `window.claude.complete` for reply | `sendMessage(history, buildConversationPrompt({...}))` (new tone-free prompt) |
| Nominatim reverse-geocode "You are at X" | `reverseGeocode(lat, lng)` in `mapUtils.js` (already there, was unused) |
| `geocodePlace` for pill add | `geminiService.geocodePlace(name, nearLat, nearLon)` |
| Trip plan state | `addedIds` + `journeyItems` in `App.js`, threaded through `NavigationMapScreen` |

---

## Phase 3 — The long tail (chronological)

This is where the real time went. Each bullet was one or more iterations.

### Conversation correctness
- **Speech-to-text plumbing.** First swung between `useSpeechRecognition` hook and an inline polling-based recognizer. Final state: hook-based, identical to home, with the homepage's silence/no-speech/max thresholds.
- **Cleanup-effect bug.** The unmount-cleanup `useEffect` had `[ttsCancel, stopConvListening]` as deps. When those callbacks recreated (e.g. after `setMessages`), React fired the cleanup function mid-session, killing the recognizer and emitting an empty `handleAutoStop` in a loop. Fixed by ref-based cleanup with empty `[]` deps so it only fires on actual unmount.
- **`onend` restart in continuous mode.** Chrome ends the recognizer after ~1 s of audio silence regardless of `continuous: true`. Restart in `onend` if we haven't explicitly stopped — `finalRef` accumulates across restarts so nothing's lost.
- **Stop button + commit path.** `stopConvListening` was missing `stoppedRef.current = true`, so `onend` re-restarted in a loop and `commitTranscriptRef.current()` never fired. Setting it before `r.stop()` fixed the flow.
- **Second-tap silence.** Tearing down the prior recognizer (`onresult/onerror/onend = null` then `abort()`) plus a brief microtask delay before `r.start()` — fixes Chrome's mic-stream-still-held InvalidStateError on rapid back-to-back sessions.
- **Auto-stop sensitivity.** Bumped silence-after-speech 1 s → 2.5 s, no-speech 5 s → 8 s; users were getting cut off mid-pause.

### TTS correctness
- **Default ON.** Speaker icon defaults to on so AI replies are spoken without a tap.
- **`prime()` inside the gesture.** Browsers (Chrome/Safari) require `speechSynthesis.speak()` to fire inside a user-gesture handler before async speech is allowed. Added a `prime()` that fires a silent `" "` utterance from `onSpeakToggle` and `handlePromptTap` (both in click context).
- **Aggressive `cancel()` was cutting utterances.** Removed the `cancel()` call from inside `speak()` — it was killing in-flight utterances when re-renders triggered a second `speak`. Just `resume()` defensively now.
- **Removed Chrome 14 s freeze keepalive.** The pause/resume keepalive was interrupting short utterances. Replies are 2 sentences max so the freeze bug doesn't apply.
- **Slowed for delight.** Default `rate: 0.88`, `pitch: 1.05` — warmer pace.

### Navigation TTS (per-walk events)
Three triggers, one effect:
- Trigger 1 (walk-start): "Heading to {dest}. {instr}. {eta} {minute(s)} remaining."
- Trigger 2 (skipped): "Now heading to {dest}. {instr}. {eta} {minute(s)} remaining."
- Trigger 3 (new maneuver category): "{instr}. {eta} {minute(s)} remaining."
- ETA later removed from triggers 2 / 3 per user request — only spoken once per session.
- Pluralization: "1 minute" vs "2 minutes".
- **Cooldown bug.** During the 1.5 s coalesce window the effect was overwriting `prevDestRef` and `prevInstrPrefixRef`, so transitions that happened during the cooldown got silently dropped (e.g. "walk forward" → "turn right"). Fix: leave refs untouched during cooldown so post-cooldown the diff still detects the change.
- **Walk-start staleness.** OSRM's route data takes ~1 s to populate after the walk starts. Without a delay, the walk-start utterance read the to-stop fallback ("walk forward 126 ft") instead of the next-maneuver distance ("walk forward 69 ft"). Defer the walk-start utterance 1 s and read `latestInstructionRef` at fire-time so it speaks the freshest values.
- **Pause between fields.** Use ` ... ` (ellipsis with surrounding spaces) instead of `. ` between segments — most browser TTS engines respect that as a longer beat.

### Tips card
- Single GPS-grounded tip from Gemini, with skeleton-shimmer loading.
- Idle rotation effect (60 s flavor cycle: history / architecture / hidden-detail / food / people-watching) — later **frozen** per user request.
- 500 ft cache: if the user hasn't moved 500 ft, reuse the cached tip instead of refetching. Falls back to the cached tip when retries exhaust instead of leaving the skeleton up forever.
- Hardcoded fallback strings removed entirely — Gemini is the only source, with retry-on-failure.

### Tip prompt evolution
- Initial: "You're near {area}…" — too geographically anchored to vague labels like "Unnamed Alley".
- Then: "find a real landmark and say 'you are around …'" — switched the prompt + the reverse-geocode helper to fall back to a wider zoom (zoom=14 → neighbourhood) when the fine-zoom (zoom=17) result is generic.
- Tone preamble (`ROLE & PERSONALITY` / `GUIDING PHILOSOPHY` / `TONE RULES`) stripped from `buildSystemPrompt` — the user wanted flatter, fact-forward replies.
- Conversation prompt (`buildConversationPrompt`) is purely instructional — recommend real walkable place(s), include a follow-up question, emit a 📍 line with sub-10 m precision.
- Single-place mode: "Recommend ONE — exactly one — real, specific nearby place".

### 📍 emission discipline
- Initial: "OMIT 📍 if not sure of coords" — Gemini interpreted that as license to skip on every reply.
- Final: HARD REQUIREMENT — "if you name ANY specific real place by name, the FINAL line MUST be `📍 Place Name, Neighborhood | Category | lat, lng`. No exceptions. If you can't be sure within 10 m, give a conceptual suggestion instead."
- Walking-radius rule: 30 min walk (2.4 km) → reverted to **15–20 min walk (1.2–1.6 km)** in conversation mode per user request.
- Verb-prefixed-name regex extraction (was scraping "Try Art" out of "Try Art of Tea") **removed** in favor of strict prompt + sanity-check (skip pin if `>3 km` from user).
- Geocode fallback: when Gemini emits a 📍 without coords, `geocodePlace(name, userLocation)` resolves via Nominatim biased to the user.
- Fast path on save: if `aiSuggestedPin` already has the coords, reuse them instead of re-geocoding — pill flips to saved instantly instead of after a 1–3 s Nominatim hit.

### Save flow (matches home pill)
- Tap `+` on a location pill → `addLocation(name)` → `onAddByName(name)` → `geocodePlace` → append `{id, name, desc:'AI', lat, lng}` to `journeyItems`, add to `addedIds`, flash trip toast, pill flips to yellow numbered chip with red `×`.
- "Start exploring · N" floating yellow CTA appears the moment ≥ 1 place is saved while in exploration mode. Click → `setIsExplorationMode(false)` → `nextTarget` un-gates → walking state takes over (same conversion home does).
- AI sparkle pin auto-hides once that name appears in `journeyItems` so the saved pin doesn't double-render.

### Exploration mode (don't auto-navigate while saving)
- New `isExplorationMode` state, initialized from `journeyItems.length === 0` (snapshotted at first render via `initialJourneyHadItemsRef`).
- While true: `nextTarget` forced to null → no OSRM route fetch → no purple polyline → widget gets `destination=null` → stays in conversation mode.
- Flips to false on "Start exploring · N" tap.
- `WalkCompanionWidget`'s `isEmpty = !destination` (live prop) — the parent is doing the gating now, the widget just reflects what it's given.

### Mic + bottom row UX
- Tap-to-toggle mic with auto-stop on silence (no press-and-hold in conversation mode).
- "SAY ANYTHING" pill in conversation, big yellow mic in tips.
- Speaker icon moved next to the turn instruction in walking mode (lower hierarchy than the persistent SAY ANYTHING).
- End walk button: red door+arrow icon, 240 ms fade-out animation on click, hidden in Conversation mode (mid-interaction), visible elsewhere.
- Bottom-row left/right margin asymmetry traced to a `display:none` mute placeholder consuming flex gap — removed entirely; `.wcw-bottom-left:empty { display: none }` collapses the empty container.

### Map controls
- "I am here" green bar above the widget removed; widget's own skip pill flips to "I'm here" within 300 ft (was 500 m).
- Skip button `canSkip={confirmedStops.length > 1}` — hidden when there's only one upcoming stop.
- Yellow flag (Check journey) FAB removed.
- Locate-me FAB now anchors above the widget via inline `bottom: ${widgetHeight + 32}px` (state-driven via ResizeObserver). Centers the user dot vertically inside the band above the widget using `map.project / unproject` offset.
- AI sparkle pin pans into the same vertical-center band when dropped (`PanAboveWidget` helper).
- Chat overlay header on home: added a top-right close button matching the rest of the chat chrome.

### Home screen Overpass 429 storm
- HomeScreen fanned out 3 rings (300 / 800 / 1500 m) per load.
- `fetchNearbyPlaces` raced both Overpass endpoints in parallel via `Promise.any`.
- Combined: **6 simultaneous Overpass requests on every map load** — second visit got 429s on every ring.
- Fix: collapse to the single 1500 m ring (strict superset of 300/800), sequence the endpoints (try kumi, fall through to overpass-api.de only on failure), add a 1.2 s backoff retry on 429.

### Other small things
- Walk widget's progress strip (boots → flag dotted line) removed per visual cleanup.
- "End walk" → `onGoBack` (not `onEndWalk`/Reward screen) so tapping it lands the user on home with HomeScreen's mount-time GPS request restoring the default locate-me.
- LockScreen's stale props (`nextWaypoint`, `turn`, `listening`, etc.) replaced with the current widget API so it actually works if mounted.

---

## Module-sharing audit

Single canonical navigation module: **`src/WalkCompanionWidget.js`**. Header comment now explicitly marks it as the canonical / single-source widget. Live consumers — both share this exact module:
- `src/NavigationMapScreen.js` (during walk + conversation reel)
- `src/LockScreen.js` (phone-lock state)

Dead modules archived to `src/archive/`:
- `WalkCompanionScreen.js` (old `WalkCompanionPill` + a different `WidgetBubble`; the only outside reference was the also-archived `VoiceFullScreen` pulling its `MuteSvg`/`SoundWaveSvg` exports)
- `VoiceFullScreen.js` (was the full-screen voice overlay; unmounted earlier when we removed the trigger)

`HomeScreen.js`'s local `WidgetBubble` is intentionally separate — it's a chat-transcript bubble, not a navigation widget.

---

## Gemini service contract (final)

**Model:** `gemini-2.5-flash-lite`. Switched briefly to `gemini-2.0-flash` and `gemini-2.5-flash` mid-session per user requests, settled back on `2.5-flash-lite` for cost.

**System-prompt builders:**
- `buildSystemPrompt({...})` — used by HomeScreen chat + the during-walk voice flow (`useJourneyVoice`). Tone preamble removed. Walking radius **30 min / 2.4 km** for the multi-place tour suggestion.
- `buildConversationPrompt({...})` — used by `WalkCompanionWidget`'s `askAi`. Pure instructions, no tone, single specific place at a time, **15–20 min / 1.2–1.6 km** walking radius, sub-10 m coordinate precision required, follow-up question always at the end.

**Helpers reused as-is:** `extractPlaces`, `cleanResponseText`, `geocodePlace`, `getWalkingRoute`, `fetchNearbyPlaces`.

**Verification gate:** `grep -ri "window.claude\|anthropic\|@anthropic" src/` returns zero hits (only one comment string referring to the old API, marked "intentionally not used").

---

## Lessons (for the next refactor)

1. **Cooldown windows must not overwrite the "last spoken" refs.** If you skip an emission inside the cooldown, leave the refs alone — otherwise post-cooldown diffs return false negatives.
2. **`useEffect` cleanup deps are a footgun for owned async resources.** If a useCallback's identity changes between renders, your cleanup fires every time — and tears down whatever it was guarding. Use a ref + empty deps for unmount-only cleanup.
3. **Browser TTS user-activation expires fast.** A click handler unlocks `speak()`, but the unlock is per-tab and doesn't survive long async chains. Prime once inside the gesture, resume defensively before each subsequent `speak`, never `cancel()` immediately before `speak()`.
4. **Continuous SR isn't actually continuous in Chrome.** It auto-ends after ~1 s of audio silence. Restart in `onend` and let your own silence timer commit the transcript.
5. **Don't fan out free-tier endpoints in parallel.** Sequence them, retry on 429, collapse redundant queries.
6. **Prompt examples leak into output.** "Try Art of Tea" as a worked example produced "📍 Try Art, …" in real responses. Use a different verb in examples, or none.
7. **One render of asymmetric padding will haunt you.** A `display:none` flex child still consumes its parent's `gap:` allotment. `:empty { display: none }` only matches when there are *zero* children.

---

## Pending follow-ups

- Replace the fixed-1 s walk-start TTS delay with a `routeReady` boolean piped from `NavigationMapScreen` so the utterance fires the moment OSRM's `routeSteps` populates (cleanest path; deferred for now).
- Consider re-enabling the 60 s tip rotation (currently frozen) once we're confident in Gemini quota usage.
- Lint cleanup pass — there are ~10 unused-var warnings accumulated from the iterative work (`ProgressStrip` import, `progress` prop on the now-removed strip, `setPaused`, `setTipNonce`, `setTipFlavor`, `_silenceUnused` etc.).
