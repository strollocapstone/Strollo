import { useState, useRef } from 'react';
import HomeScreen from './HomeScreen';
import NavigationMapScreen from './NavigationMapScreen';
import PreWalkConstraintsScreen from './PreferencesScreen';
import TimelineScreen from './TimelineScreen';
import QuizScreen from './QuizScreen';
import RewardScreen from './RewardScreen';
import './App.css';

const QUIZ_STORAGE_KEY = 'strollo_quiz_preferences';

function loadQuizPreferences() {
  try {
    const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function App() {
  const initialQuizPrefs = loadQuizPreferences();
  const [screen, setScreen] = useState(initialQuizPrefs ? 'home' : 'quiz');
  const [journeyItems, setJourneyItems] = useState([]);
  const [startLocation, setStartLocation] = useState(null);
  const [lastKnownLocation, setLastKnownLocation] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [quizPreferences, setQuizPreferences] = useState(initialQuizPrefs);
  const [openSheetOnHome, setOpenSheetOnHome] = useState(false);
  const [constraintsReturnScreen, setConstraintsReturnScreen] = useState('home');
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [addedIds, setAddedIds] = useState(() => new Set());
  const [favedIds, setFavedIds] = useState(() => new Set());
  const lastFetchedLocationRef = useRef(null);
  const lastFetchTimeRef = useRef(0);

  const persistQuiz = (prefs) => {
    try { localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(prefs)); } catch {}
  };

  return (
    <div className="App">
      <div className="phone-frame">
        {screen === 'home' && (
          <HomeScreen
            onStartWalk={(items, userLoc) => { setJourneyItems(items); setStartLocation(userLoc); setLastKnownLocation(userLoc); setScreen('navigation'); }}
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
          />
        )}
        {screen === 'quiz' && (
          <QuizScreen
            initialPreferences={quizPreferences}
            onComplete={(prefs) => {
              setQuizPreferences(prefs);
              persistQuiz(prefs);
              setScreen('home');
            }}
            onClose={quizPreferences ? () => setScreen('home') : null}
          />
        )}
        {screen === 'navigation' && (
          <NavigationMapScreen
            onGoBack={() => setScreen('home')}
            onSetConstraints={() => { setConstraintsReturnScreen('navigation'); setScreen('constraints'); }}
            onOpenTimeline={() => setScreen('timeline')}
            journeyItems={journeyItems}
            startLocation={startLocation}
            onJourneyChange={setJourneyItems}
            vibePreferences={quizPreferences}
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
          <TimelineScreen onBack={() => setScreen('home')} onEndWalk={() => setScreen('reward')} />
        )}
      </div>
    </div>
  );
}

export default App;
