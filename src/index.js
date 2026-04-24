import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
// NOTE: StrictMode disabled because react-leaflet v3's MapContainer throws
// "Map container is already initialized" on the double-mount. Restore when
// the map integration is made StrictMode-safe (or when react-leaflet is
// upgraded with a CRA-compatible build config).
root.render(<App />);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
