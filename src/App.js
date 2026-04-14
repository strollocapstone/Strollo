import { useState } from 'react';
import HomeScreen from './HomeScreen';
import NavigationScreen from './NavigationScreen';
import './App.css';

function App() {
  const [screen, setScreen] = useState('home');
  const [journeyItems, setJourneyItems] = useState([]);

  return (
    <div className="App">
      {screen === 'home'
        ? <HomeScreen onStartWalk={(items) => { setJourneyItems(items); setScreen('navigation'); }} />
        : <NavigationScreen onGoBack={() => setScreen('home')} journeyItems={journeyItems} />
      }
    </div>
  );
}

export default App;
