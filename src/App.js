// FEATURE: shell
// LAST UPDATED BY: Seemin Masood
// UPDATE DATE: 2026-05-07
// BUILD: 25225b52
// DEPENDS ON: ./HomeScreen, ./NavigationMapScreen, ./PreferencesScreen, ./TimelineScreen, ./QuizScreen, ./RewardScreen, ./LoadingScreen, ./WelcomeScreen, ./DevSwitch, ./cloudTtsService
// CONSUMED BY: ./index.js (root mount)
//
// Top-level screen router. Owns the shared cross-screen state (journeyItems,
// addedIds, visitedIds, preferences, quizPreferences, etc.) and routes between
// named screens via the `screen` state. Mounts the global click-cancel for
// in-flight TTS. OUT OF SCOPE: per-screen logic, network calls, anything
// beyond "which screen is active and what state passes through props."

import { useState, useRef, useEffect } from 'react';
import HomeScreen from './HomeScreen';
import NavigationMapScreen from './NavigationMapScreen';
import PreWalkConstraintsScreen from './PreferencesScreen';
import TimelineScreen from './TimelineScreen';
import QuizScreen, { QUIZ_DECK, buildMergedPreset } from './QuizScreen';
import RewardScreen from './RewardScreen';
import ProgressScreen from './ProgressScreen';
import LoadingScreen from './LoadingScreen';
import WelcomeScreen from './WelcomeScreen';
import DevSwitch from './DevSwitch';
import { cancelCloudTts, isCloudTtsPlaying } from './cloudTtsService';
import { fetchIpLocation } from './mapUtils';
import './App.css';

function App() {
  // Preferences are session-scoped — a hard reload / cache clear resets to the quiz
  const initialQuizPrefs = null;
  const [screen, setScreen] = useState('devSwitch');
  // Tracks when the quiz is being opened straight after the welcome screen so
  // QuizScreen can use a soft fade-in instead of the slide-up sheet entry —
  // matches how WelcomeScreen reveals after the loading screen fades.
  const [quizFromIntro, setQuizFromIntro] = useState(false);
  const [journeyItems, setJourneyItems] = useState([]);
  const [startLocation, setStartLocation] = useState(null);
  const [lastKnownLocation, setLastKnownLocation] = useState(null);
  const [tripStartTime, setTripStartTime] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [quizPreferences, setQuizPreferences] = useState(initialQuizPrefs);
  const [openSheetOnHome, setOpenSheetOnHome] = useState(false);
  const [openChatOnHome, setOpenChatOnHome] = useState(false);
  // When the user opens the chat from inside the walk, we briefly switch
  // to home with the chat already open, then bounce back to navigation
  // once the chat closes. The walk state stays in App and is preserved.
  const [chatReturnScreen, setChatReturnScreen] = useState(null);
  const [constraintsReturnScreen, setConstraintsReturnScreen] = useState('home');
  // Where to send the user when they tap Back on the Timeline. Defaults
  // to navigation (the in-walk case), but the Home flag FAB sets it to
  // 'home' so backing out lands them on the home map they came from.
  const [timelineReturnScreen, setTimelineReturnScreen] = useState('navigation');
  const [settingsHighlight, setSettingsHighlight] = useState(false);
  const [quizPending, setQuizPending] = useState(false);
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [addedIds, setAddedIds] = useState(() => new Set());
  const [favedIds, setFavedIds] = useState(() => new Set());
  // Locations the user has confirmed reaching ("I am here"). The route always
  // targets the first non-visited confirmed stop; visited stops can't be
  // removed from the Timeline.
  const [visitedIds, setVisitedIds] = useState(() => new Set());
  // Map<stopId, timestamp> — wall-clock when the user confirmed reaching
  // each stop. Powers the per-stop linger-minute math on the Reward screen.
  const [visitedAt, setVisitedAt] = useState(() => new Map());
  // Map<stopId, ms> — accumulated time the user has actually been within the
  // arrival geofence of each stop (auto-tracked via WatchLocation, no tap
  // required). The Reward screen prefers this over visitedAt timestamps.
  const [stopDwellMs, setStopDwellMs] = useState(() => new Map());
  // Dev-mode widget preview: one of the WIDGET_PREVIEW_KEYS or null. The
  // NavigationMapScreen profile button opens a menu that picks one of the
  // 11 widget states; setupWidgetPreview wires up the matching journey +
  // screen, and widget overrides flow through NavigationMapScreen down to
  // WalkCompanionWidget so designers can preview each state in-context.
  const [widgetPreview, setWidgetPreview] = useState(null);
  const lastFetchedLocationRef = useRef(null);
  const lastFetchTimeRef = useRef(0);

  // Mock journey used for any preview that needs visible stops.
  const MOCK_PREVIEW_STOPS = [
    { id: "preview-1", name: "Sightglass Coffee", desc: "Coffee Shop", lat: 37.766, lng: -122.413 },
    { id: "preview-2", name: "Tartine Bakery",    desc: "Bakery",      lat: 37.761, lng: -122.424 },
    { id: "preview-3", name: "Dolores Park",      desc: "Park",        lat: 37.759, lng: -122.426 },
  ];
  const setupWidgetPreview = (key) => {
    if (!key) {
      // Exit preview — wipe the dev journey so the user sees a clean slate.
      setJourneyItems([]);
      setAddedIds(new Set());
      setVisitedIds(new Set());
      setVisitedAt(new Map());
      setStopDwellMs(new Map());
      setStartLocation(null);
      setTripStartTime(null);
      setWidgetPreview(null);
      setScreen('home');
      return;
    }
    if (key === 'no-stops') {
      // Route to navigation (not home) so the WalkCompanionWidget mounts
      // in its empty state — that's where the marauder-loader footsteps
      // and the "Strollo is looking for things you might like nearby."
      // copy live. A start anchor is required for the nav map to render
      // sensibly; fall back to a known SF coord when there's no GPS yet.
      setJourneyItems([]);
      setAddedIds(new Set());
      setVisitedIds(new Set());
      setVisitedAt(new Map());
      setStopDwellMs(new Map());
      setStartLocation(lastKnownLocation || [37.766, -122.413]);
      setTripStartTime(null);
      setScreen('navigation');
      setWidgetPreview(key);
      return;
    }
    // Every other key uses the mock journey so the timeline / map / widget
    // have something to render. The journey is identical across keys; only
    // the widget-side overrides differ (handled in NavigationMapScreen).
    setJourneyItems(MOCK_PREVIEW_STOPS);
    setAddedIds(new Set(MOCK_PREVIEW_STOPS.map((s) => s.id)));
    setVisitedIds(new Set());
    setVisitedAt(new Map());
    setStopDwellMs(new Map());
    setStartLocation(lastKnownLocation || [37.766, -122.413]);
    setTripStartTime(Date.now());
    setScreen(key === 'stops-added' ? 'home' : 'navigation');
    setWidgetPreview(key);
  };

  const persistQuiz = () => {
    // no-op — preferences reset on each reload by design
  };

  // Dev-mode shortcut: synthesize a "every card swiped YES" quiz history,
  // run it through the same preset builder the real quiz uses, then jump
  // straight to home. Mirrors QuizScreen's onComplete payload so HomeScreen
  // sees identical state to a real run.
  const handleDevMode = () => {
    const history = QUIZ_DECK.map((c) => ({ polaroidId: c.id, direction: 'up' }));
    const vibeScores = {};
    for (const h of history) {
      const card = QUIZ_DECK.find((d) => d.id === h.polaroidId);
      if (!card) continue;
      for (const v of card.vibes) vibeScores[v] = (vibeScores[v] || 0) + 1;
    }
    const mergedPreset = buildMergedPreset(history, QUIZ_DECK);
    const prefs = {
      vibeScores,
      mergedPreset,
      quizHistory: history,
      completedAt: new Date().toISOString(),
    };
    setQuizPreferences(prefs);
    if (mergedPreset) setPreferences(mergedPreset);
    setScreen('home');
  };

  // Prefetch user location as early as possible (even while the quiz is open)
  // so HomeScreen can start loading nearby places the moment it mounts.
  useEffect(() => {
    if (!navigator.geolocation) return;
    let cancelled = false;
    const setFromCoords = (coords) => {
      if (cancelled) return;
      // Some browsers / DevTools sensor overrides hand back (0, 0) when
      // there's no real fix. Skip those so HomeScreen doesn't initialise
      // its map at the Atlantic.
      if (Math.abs(coords.latitude) < 1e-6 && Math.abs(coords.longitude) < 1e-6) return;
      setLastKnownLocation([coords.latitude, coords.longitude]);
    };
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setFromCoords(coords),
      async () => {
        // Browser geolocation failed — try IP-based geolocation, then
        // fall back to MOCK_LOCATION (Sproul Plaza) so the map always
        // initialises somewhere useful.
        if (cancelled) return;
        const ipPos = await fetchIpLocation();
        if (cancelled) return;
        setLastKnownLocation(ipPos || [37.8691, -122.2596]);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
    return () => { cancelled = true; };
  }, []);

  // Universal rule: any button click stops in-flight TTS. Captures at the
  // document level so it works regardless of which screen mounted the button.
  useEffect(() => {
    const onClick = (e) => {
      const btn = e.target?.closest?.("button, [role='button']");
      if (!btn) return;
      // Stop Cloud TTS playback (mobile path) if anything is playing.
      if (isCloudTtsPlaying()) {
        try { cancelCloudTts(); } catch (_e) {}
      }
      const synth = window.speechSynthesis;
      if (!synth) return;
      // iOS Safari leaves the engine wedged if cancel() fires when nothing
      // is speaking — queued utterances after that never play. Only cancel
      // when there's actually in-flight speech to interrupt.
      if (!(synth.speaking || synth.pending)) return;
      try { synth.cancel(); } catch (_e) {}
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return (
    <div className="App">
      <div className="phone-frame">
        {screen === 'devSwitch' && (
          <DevSwitch
            onDev={handleDevMode}
            onNormalUser={() => setScreen('loading')}
          />
        )}
        {screen === 'loading' && (
          <LoadingScreen onComplete={() => setScreen('welcome')} />
        )}
        {screen === 'welcome' && (
          <WelcomeScreen onContinue={() => { setQuizFromIntro(true); setScreen('quiz'); }} />
        )}
        {/* HomeScreen also renders behind 'quiz' so the quiz's slide-down
            close animation reveals Home instead of a flash of white phone
            frame. QuizScreen's z-index keeps it on top while open. */}
        {(screen === 'home' || screen === 'constraints' || screen === 'quiz' || (screen === 'timeline' && timelineReturnScreen === 'home')) && (
          <HomeScreen
            onStartWalk={(items, userLoc) => {
              // NavigationMapScreen treats `addedIds` as the authoritative
              // "confirmed stops" list (filters journeyItems by id). Without
              // this, planned chat stops have fresh IDs that addedIds doesn't
              // know about → nextTarget is null → "No current destination".
              setJourneyItems(items);
              setAddedIds(new Set(items.map((it) => it.id)));
              setStartLocation(userLoc);
              setLastKnownLocation(userLoc);
              setTripStartTime(Date.now());
              setVisitedIds(new Set());
              setVisitedAt(new Map());
              setStopDwellMs(new Map());
              setScreen('navigation');
            }}
            onSetConstraints={() => { setConstraintsReturnScreen('home'); setScreen('constraints'); }}
            onOpenTimeline={() => { setTimelineReturnScreen('home'); setScreen('timeline'); }}
            onOpenQuiz={() => setScreen('quiz')}
            initialLocation={lastKnownLocation}
            initialSheetOpen={openSheetOnHome}
            initialChatOpen={openChatOnHome}
            onSheetOpenConsumed={() => setOpenSheetOnHome(false)}
            onChatOpenConsumed={() => setOpenChatOnHome(false)}
            onChatClose={() => {
              // If the chat was opened from inside the walk, hop back to
              // the navigation screen now that it's closed.
              if (chatReturnScreen) {
                const target = chatReturnScreen;
                setChatReturnScreen(null);
                setScreen(target);
              }
            }}
            preferences={preferences}
            vibePreferences={quizPreferences}
            nearbyPlaces={nearbyPlaces}
            setNearbyPlaces={setNearbyPlaces}
            addedIds={addedIds}
            setAddedIds={setAddedIds}
            favedIds={favedIds}
            setFavedIds={setFavedIds}
            lastFetchedLocationRef={lastFetchedLocationRef}
            lastFetchTimeRef={lastFetchTimeRef}
            settingsHighlight={settingsHighlight}
            quizPending={quizPending}
            widgetPreview={widgetPreview}
            onSetWidgetPreview={setupWidgetPreview}
          />
        )}
        {screen === 'quiz' && (
          <QuizScreen
            entryMode={quizFromIntro ? 'fade' : 'slide'}
            initialPreferences={quizPreferences}
            onComplete={(prefs) => {
              setQuizPreferences(prefs);
              persistQuiz(prefs);
              if (prefs.mergedPreset) {
                setPreferences((prev) => {
                  const seed = prefs.mergedPreset;
                  if (!prev) return seed;
                  const hasItems = (arr) => Array.isArray(arr) && arr.length > 0;
                  return {
                    destination: prev.destination ?? seed.destination,
                    destChosen: prev.destChosen ?? seed.destChosen,
                    duration: prev.duration ?? seed.duration,
                    customDuration: prev.customDuration ?? seed.customDuration,
                    distance: prev.distance ?? seed.distance,
                    accessibility: hasItems(prev.accessibility) ? prev.accessibility : (seed.accessibility || []),
                    avoidances: hasItems(prev.avoidances) ? prev.avoidances : (seed.avoidances || []),
                    mapFilters: hasItems(prev.mapFilters) ? prev.mapFilters : (seed.mapFilters || []),
                  };
                });
              }
              setScreen('home');
              setQuizFromIntro(false);
              setSettingsHighlight(true);
              setTimeout(() => setSettingsHighlight(false), 4200);
              setQuizPending(false);
            }}
            onClose={quizPreferences ? () => { setQuizFromIntro(false); setScreen('home'); } : null}
            onSkip={() => { setQuizFromIntro(false); setScreen('home'); setQuizPending(true); }}
          />
        )}
        {/* Keep NavigationMapScreen mounted while the prefs sheet is open
            from the nav flow — that way the prefs slide-down close
            animation reveals the live map + walk widget underneath
            instead of a flash of home/white. */}
        {(screen === 'navigation' || (screen === 'timeline' && timelineReturnScreen === 'navigation') || (screen === 'constraints' && constraintsReturnScreen === 'navigation')) && (
          <NavigationMapScreen
            onGoBack={() => {
              // Back arrow = abandon the walk → wipe all walk state so the
              // next Home session doesn't inherit chat-planned stop IDs that
              // would break "Start exploring".
              setJourneyItems([]);
              setAddedIds(new Set());
              setVisitedIds(new Set());
              setVisitedAt(new Map());
              setStopDwellMs(new Map());
              setStartLocation(null);
              setTripStartTime(null);
              setScreen('home');
            }}
            onEndWalk={() => setScreen('reward')}
            onSetConstraints={() => { setConstraintsReturnScreen('navigation'); setScreen('constraints'); }}
            onOpenTimeline={() => { setTimelineReturnScreen('navigation'); setScreen('timeline'); }}
            onOpenChat={() => {
              // Pop into home with the chat overlay open; remember to
              // return to the walk when the user closes the chat.
              setChatReturnScreen('navigation');
              setOpenChatOnHome(true);
              setScreen('home');
            }}
            journeyItems={journeyItems}
            startLocation={startLocation}
            onJourneyChange={setJourneyItems}
            addedIds={addedIds}
            setAddedIds={setAddedIds}
            visitedIds={visitedIds}
            setVisitedIds={setVisitedIds}
            setVisitedAt={setVisitedAt}
            setStopDwellMs={setStopDwellMs}
            vibePreferences={quizPreferences}
            preferences={preferences}
            nearbyPlaces={nearbyPlaces}
            showVoice={screen === 'navigation'}
            widgetPreview={widgetPreview}
            onSetWidgetPreview={setupWidgetPreview}
          />
        )}
        {screen === 'reward' && (
          <RewardScreen
            journeyItems={journeyItems}
            visitedIds={visitedIds}
            visitedAt={visitedAt}
            stopDwellMs={stopDwellMs}
            tripStartTime={tripStartTime}
            nearbyPlaces={nearbyPlaces}
            userLocation={lastKnownLocation}
            vibePreferences={quizPreferences}
            onComplete={() => {
              // Reward dismissed → fresh slate for the next session.
              setJourneyItems([]);
              setAddedIds(new Set());
              setVisitedIds(new Set());
              setVisitedAt(new Map());
              setStopDwellMs(new Map());
              setStartLocation(null);
              setTripStartTime(null);
              setScreen('home');
            }}
            onResume={() => setScreen('navigation')}
            onSeeProgress={() => setScreen('progress')}
          />
        )}
        {screen === 'progress' && (
          <ProgressScreen
            journeyItems={journeyItems}
            visitedIds={visitedIds}
            visitedAt={visitedAt}
            stopDwellMs={stopDwellMs}
            onGoBack={() => setScreen('reward')}
            onPlanAnother={() => {
              // Same wipe-and-home as the reward screen's onComplete so a
              // fresh exploration starts with a clean slate.
              setJourneyItems([]);
              setAddedIds(new Set());
              setVisitedIds(new Set());
              setVisitedAt(new Map());
              setStopDwellMs(new Map());
              setStartLocation(null);
              setTripStartTime(null);
              setScreen('home');
            }}
          />
        )}
        {screen === 'constraints' && (
          <PreWalkConstraintsScreen
            onGoBack={() => setScreen(constraintsReturnScreen)}
            initialPreferences={preferences}
            onSavePreferences={(prefs) => {
              setPreferences(prefs);
              if (constraintsReturnScreen === 'home') setOpenSheetOnHome(true);
              setScreen(constraintsReturnScreen);
            }}
          />
        )}
        {screen === 'timeline' && (
          <TimelineScreen
            onGoBack={() => setScreen(timelineReturnScreen)}
            onEndWalk={() => {
              // Same gate as navigation's End: reward only if the user
              // completed something; otherwise wipe + Home.
              if (visitedIds.size >= 1) {
                setScreen('reward');
              } else {
                setJourneyItems([]);
                setAddedIds(new Set());
                setVisitedIds(new Set());
                setStartLocation(null);
                setTripStartTime(null);
                setScreen('home');
              }
            }}
            nearbyPlaces={nearbyPlaces}
            setNearbyPlaces={setNearbyPlaces}
            addedIds={addedIds}
            setAddedIds={setAddedIds}
            visitedIds={visitedIds}
            userLocation={lastKnownLocation}
            startLocation={startLocation}
            tripStartTime={tripStartTime}
            journeyItems={journeyItems}
            onJourneyChange={setJourneyItems}
            preferences={preferences}
          />
        )}
        {/* Floating journey-flag FAB while the chat overlay is open during a
            walk — keeps the timeline shortcut visible even though we briefly
            switched to the home screen to reuse the chat overlay UI. Tap
            closes the chat and routes the user to the timeline. */}
        {openChatOnHome && chatReturnScreen === 'navigation' && (
          <button
            className="fab-circle bottom-right-btn bottom-right-btn--journey app-floating-flag-fab"
            onClick={() => {
              setOpenChatOnHome(false);
              setChatReturnScreen(null);
              setScreen('timeline');
            }}
            aria-label="Check journey"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#FFD501" stroke="none" aria-hidden="true">
              <path d="M8 3 L8 21" stroke="#FFD501" strokeWidth="2" strokeLinecap="round"/>
              <path d="M8 3 L18 6 L8 10 Z"/>
              <circle cx="8" cy="21" r="2"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
