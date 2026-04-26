import { useState, useRef, useEffect } from 'react';
import HomeScreen from './HomeScreen';
import NavigationMapScreen from './NavigationMapScreen';
import PreWalkConstraintsScreen from './PreferencesScreen';
import TimelineScreen from './TimelineScreen';
import QuizScreen from './QuizScreen';
import RewardScreen from './RewardScreen';
import './App.css';

function App() {
  // Preferences are session-scoped — a hard reload / cache clear resets to the quiz
  const initialQuizPrefs = null;
  const [screen, setScreen] = useState('quiz');
  const [journeyItems, setJourneyItems] = useState([]);
  const [startLocation, setStartLocation] = useState(null);
  const [lastKnownLocation, setLastKnownLocation] = useState(null);
  const [tripStartTime, setTripStartTime] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [quizPreferences, setQuizPreferences] = useState(initialQuizPrefs);
  const [openSheetOnHome, setOpenSheetOnHome] = useState(false);
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
  const lastFetchedLocationRef = useRef(null);
  const lastFetchTimeRef = useRef(0);

  const persistQuiz = () => {
    // no-op — preferences reset on each reload by design
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

  return (
    <div className="App">
      <div className="phone-frame">
        {(screen === 'home' || screen === 'constraints') && (
          <HomeScreen
            onStartWalk={(items, userLoc) => { setJourneyItems(items); setStartLocation(userLoc); setLastKnownLocation(userLoc); setTripStartTime(Date.now()); setVisitedIds(new Set()); setScreen('navigation'); }}
            onSetConstraints={() => { setConstraintsReturnScreen('home'); setScreen('constraints'); }}
            onOpenTimeline={() => setScreen('timeline')}
            onOpenQuiz={() => setScreen('quiz')}
            initialLocation={lastKnownLocation}
            initialSheetOpen={openSheetOnHome}
            onSheetOpenConsumed={() => setOpenSheetOnHome(false)}
            preferences={preferences}
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
              setSettingsHighlight(true);
              setTimeout(() => setSettingsHighlight(false), 4200);
              setQuizPending(false);
            }}
            onClose={quizPreferences ? () => setScreen('home') : null}
            onSkip={() => { setScreen('home'); setQuizPending(true); }}
          />
        )}
        {(screen === 'navigation' || screen === 'timeline') && (
          <NavigationMapScreen
            onGoBack={() => setScreen('home')}
            onSetConstraints={() => { setConstraintsReturnScreen('navigation'); setScreen('constraints'); }}
            onOpenTimeline={() => setScreen('timeline')}
            journeyItems={journeyItems}
            startLocation={startLocation}
            onJourneyChange={setJourneyItems}
            addedIds={addedIds}
            setAddedIds={setAddedIds}
            visitedIds={visitedIds}
            setVisitedIds={setVisitedIds}
            vibePreferences={quizPreferences}
            showVoice={screen === 'navigation'}
          />
        )}
        {screen === 'reward' && (
          <RewardScreen onComplete={() => setScreen('home')} />
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
            onEndWalk={() => setScreen('reward')}
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
      </div>
    </div>
  );
}

export default App;
