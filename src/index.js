import React from 'react';
import ReactDOM from 'react-dom/client';
import L from 'leaflet';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// react-leaflet@3 was built for React 17. With React 18's concurrent
// reconciler the same DOM node is occasionally reused across screen
// transitions before leaflet's unmount cleanup runs, leaving the stale
// `_leaflet_id` attached. The next MapContainer's _initContainer then
// throws "Map container is already initialized" and the screen goes
// white in production. Patch _initContainer once to scrub a stale id +
// leftover leaflet markup before re-init. Idempotent and safe — when
// no stale state is present, the original behavior is unchanged.
const _origInitContainer = L.Map.prototype._initContainer;
L.Map.prototype._initContainer = function patchedInitContainer(id) {
  const container = typeof id === "string" ? L.DomUtil.get(id) : id;
  if (container && container._leaflet_id) {
    delete container._leaflet_id;
    // Drop any leftover leaflet panes / classes that the previous
    // instance left behind so the fresh map renders cleanly.
    container.innerHTML = "";
    container.className = container.className
      .split(/\s+/)
      .filter((c) => !/^leaflet-/.test(c))
      .join(" ");
  }
  return _origInitContainer.call(this, id);
};

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
