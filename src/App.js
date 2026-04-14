import { useState } from 'react';
import HomeScreen from './HomeScreen';
import NavigationMapScreen from './NavigationMapScreen';
import PreWalkConstraintsScreen from './PreWalkConstraintsScreen';
import './App.css';

function App() {
  const [screen, setScreen] = useState('home');
  const [journeyItems, setJourneyItems] = useState([]);

  return (
    <div className="App">
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
    </div>
  );
}

export default App;
