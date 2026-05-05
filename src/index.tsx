import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import FreshApp from './FreshApp';
// To test the minimal geolocation version independently, uncomment below and comment out App usage:
// import GeolocationDemo from './GeolocationDemo';
import './index.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import ErrorBoundary from './ErrorBoundary';

const SAFE_MODE = (process.env.REACT_APP_SAFE_MODE || '').trim() === '1';
const FRESH_MODE = (process.env.REACT_APP_FRESH || '').trim() === '1';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
  {/** For now, run only the fresh minimal app while we add features back progressively. */}
  <FreshApp />
      {/** Swap with <GeolocationDemo /> to compare raw geolocation tracking without extra logic */}
    </ErrorBoundary>
  </React.StrictMode>
);
