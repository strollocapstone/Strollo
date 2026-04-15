import { useState } from 'react';
import HomeScreen from './HomeScreen';
import NavigationMapScreen from './NavigationMapScreen';
import PreWalkConstraintsScreen from './PreWalkConstraintsScreen';
import TimelineScreen from './TimelineScreen';
import BottomNav from './BottomNav';
import './App.css';

function App() {
  const [tab, setTab] = useState('map');
  const [screen, setScreen] = useState('home');
  const [journeyItems, setJourneyItems] = useState([]);

  const showBottomNav = screen === 'home';

  return (
    <div className="App">
      <div className="phone-frame">
        {tab === 'map' && (
          <>
            {screen === 'home' && (
              <HomeScreen
                onStartWalk={(items) => { setJourneyItems(items); setScreen('navigation'); }}
                onSetConstraints={() => setScreen('constraints')}
              />
            )}
            {screen === 'navigation' && (
              <NavigationMapScreen
                onGoBack={() => setScreen('home')}
                journeyItems={journeyItems}
              />
            )}
            {screen === 'constraints' && (
              <PreWalkConstraintsScreen onGoBack={() => setScreen('home')} />
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
