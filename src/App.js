import { useState, useRef } from 'react';
import HomeScreen from './HomeScreen';
import NavigationMapScreen from './NavigationMapScreen';
import PreWalkConstraintsScreen from './PreferencesScreen';
import TimelineScreen from './TimelineScreen';
import './App.css';

function App() {
  const [screen, setScreen] = useState('home');
  const [journeyItems, setJourneyItems] = useState([]);
  const [startLocation, setStartLocation] = useState(null);
  const [lastKnownLocation, setLastKnownLocation] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [openSheetOnHome, setOpenSheetOnHome] = useState(false);
  const [constraintsReturnScreen, setConstraintsReturnScreen] = useState('home');
  const [nearbyPlaces, setNearbyPlaces] = useState([]);
  const [addedIds, setAddedIds] = useState(() => new Set());
  const [favedIds, setFavedIds] = useState(() => new Set());
  const lastFetchedLocationRef = useRef(null);
  const lastFetchTimeRef = useRef(0);

  return (
    <div className="App">
      <div className="phone-frame">
        {screen === 'home' && (
          <HomeScreen
            onStartWalk={(items, userLoc) => { setJourneyItems(items); setStartLocation(userLoc); setLastKnownLocation(userLoc); setScreen('navigation'); }}
            onSetConstraints={() => { setConstraintsReturnScreen('home'); setScreen('constraints'); }}
            onOpenTimeline={() => setScreen('timeline')}
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
        {screen === 'navigation' && (
          <NavigationMapScreen
            onGoBack={() => setScreen('home')}
            onSetConstraints={() => { setConstraintsReturnScreen('navigation'); setScreen('constraints'); }}
            onOpenTimeline={() => setScreen('timeline')}
            journeyItems={journeyItems}
            startLocation={startLocation}
            onJourneyChange={setJourneyItems}
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
          <TimelineScreen onBack={() => setScreen('home')} />
        )}
      </div>
    </div>
  );
}

export default App;
