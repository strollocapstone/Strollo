// FEATURE: shell
// OWNER: shared
// DEPENDS ON: ./HomeScreen, ./NavigationMapScreen, ./PreferencesScreen, ./TimelineScreen, ./QuizScreen, ./RewardScreen, ./LoadingScreen, ./IntroScreen, ./DevSwitch, ./cloudTtsService
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
import LoadingScreen from './LoadingScreen';
import IntroScreen from './IntroScreen';
import DevSwitch from './DevSwitch';
import { cancelCloudTts, isCloudTtsPlaying } from './cloudTtsService';
import './App.css';

function App() {
  // Preferences are session-scoped — a hard reload / cache clear resets to the quiz
  const initialQuizPrefs = null;
  const [screen, setScreen] = useState('devSwitch');
  // Tracks when the quiz is being opened straight after the intro screen so
  // QuizScreen can use a soft fade-in instead of the slide-up sheet entry —
  // matches how IntroScreen reveals after the loading screen fades.
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
  const lastFetchedLocationRef = useRef(null);
  const lastFetchTimeRef = useRef(0);

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
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (cancelled) return;
        setLastKnownLocation([coords.latitude, coords.longitude]);
      },
      () => { /* permission denied / timeout — HomeScreen will prompt again */ },
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
          <LoadingScreen onComplete={() => setScreen('intro')} />
        )}
        {screen === 'intro' && (
          <IntroScreen onContinue={() => { setQuizFromIntro(true); setScreen('quiz'); }} />
        )}
        {/* HomeScreen also renders behind 'quiz' so the quiz's slide-down
            close animation reveals Home instead of a flash of white phone
            frame. QuizScreen's z-index keeps it on top while open. */}
        {(screen === 'home' || screen === 'constraints' || screen === 'quiz') && (
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
            onOpenTimeline={() => setScreen('timeline')}
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
        {(screen === 'navigation' || screen === 'timeline' || (screen === 'constraints' && constraintsReturnScreen === 'navigation')) && (
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
            onOpenTimeline={() => setScreen('timeline')}
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
            onGoBack={() => setScreen('navigation')}
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
            addedIds={addedIds}
            setAddedIds={setAddedIds}
            visitedIds={visitedIds}
            userLocation={lastKnownLocation}
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
