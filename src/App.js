import { useState, useRef } from 'react';
import HomeScreen from './HomeScreen';
import NavigationMapScreen from './NavigationMapScreen';
import PreWalkConstraintsScreen from './PreferencesScreen';
import TimelineScreen from './TimelineScreen';
import BottomNav from './BottomNav';
import './App.css';

function App() {
  const [tab, setTab] = useState('map');
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

  const showBottomNav = screen === 'home';

  return (
    <div className="App">
      <div className="phone-frame">
        {tab === 'map' && (
          <>
            {screen === 'home' && (
              <HomeScreen
                onStartWalk={(items, userLoc) => { setJourneyItems(items); setStartLocation(userLoc); setLastKnownLocation(userLoc); setScreen('navigation'); }}
                onSetConstraints={() => { setConstraintsReturnScreen('home'); setScreen('constraints'); }}
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
                journeyItems={journeyItems}
                startLocation={startLocation}
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
          </>
        )}

        {tab === 'timeline' && <TimelineScreen />}

        {tab === 'explore' && (
          <div className="placeholder-screen">
            <span className="material-symbols-rounded placeholder-icon">explore</span>
            <h2>Explore</h2>
            <p>Discover new places and routes.</p>
          </div>
        )}

        {tab === 'profile' && (
          <div className="placeholder-screen">
            <span className="material-symbols-rounded placeholder-icon">person</span>
            <h2>Profile</h2>
            <p>Your preferences and stats.</p>
          </div>
        )}

        {showBottomNav && (
          <BottomNav activeTab={tab} onTabChange={(t) => { setTab(t); setScreen('home'); }} />
        )}
      </div>
    </div>
  );
}

export default App;
