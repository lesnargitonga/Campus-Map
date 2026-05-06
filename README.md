# Campus Map

Campus Map is a React and TypeScript campus navigation application built around Mapbox GL and Firebase. It combines interactive mapping with campus-oriented workflows such as point-of-interest lookup, route guidance, group coordination, lost-and-found reporting, and hazard-aware emergency routing.

## Showcase Focus

- Geospatial product design with Mapbox GL.
- Collaborative campus workflows backed by Firestore.
- Frontend state coordination across search, routing, hazards, and group sessions.

## System Capabilities

- Interactive campus map with switchable map styles.
- Point-of-interest browsing and search.
- Route building from the current location or selected POIs.
- Group session flows for collaborative navigation and shared tasks.
- Lost-and-found reporting and campus support workflows.
- Emergency and hazard-aware routing controls.

## Tech Stack

- React 18
- TypeScript 4.9
- Mapbox GL JS
- Firebase / Firestore
- Create React App tooling via `react-scripts`

## Prerequisites

- Node.js 18 or newer.
- npm.
- A Mapbox token available through `REACT_APP_MAPBOX_TOKEN` or browser local storage.
- Firebase configuration values:
  - `REACT_APP_FIREBASE_API_KEY`
  - `REACT_APP_FIREBASE_AUTH_DOMAIN`
  - `REACT_APP_FIREBASE_PROJECT_ID`
  - `REACT_APP_FIREBASE_STORAGE_BUCKET`
  - `REACT_APP_FIREBASE_MESSAGING_SENDER_ID`
  - `REACT_APP_FIREBASE_APP_ID`

## Local Development

```bash
npm install
npm start
```

Create a production build with:

```bash
npm run build
```

## Project Structure

- `src/FreshApp.tsx`: primary campus map workflow and navigation logic.
- `src/components/RoutePanel.tsx`: route planning surface.
- `src/components/GroupSessionPanel.tsx`: shared group navigation and tasks.
- `src/components/LostFoundPanel.tsx`: lost-and-found interactions.
- `src/components/POISearch.tsx`: point-of-interest search.
- `src/firebase.ts`: Firestore initialization.

## Notes

This project includes several research and documentation markdown files in the root for academic and product context. `README.md` is intended to be the quick-start entry point for the repository.