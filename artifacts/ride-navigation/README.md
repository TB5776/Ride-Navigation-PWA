# Ride Navigation

Ride Navigation is a portrait-first Progressive Web App for cyclists and scooter riders. It combines real browser GPS with Mapbox maps, geocoding, and directions when a Mapbox public token is configured.

## Stack

- React + TypeScript
- Vite
- Mapbox GL JS
- Browser Geolocation API
- Screen Wake Lock API when available
- PWA manifest and service worker

## Development setup

1. Copy `.env.example` to `.env.local`.
2. Add a Mapbox public access token to `VITE_MAPBOX_TOKEN` if you want map, search, and routing features.
3. Start the app with:

```bash
pnpm --filter @workspace/ride-navigation run dev
```

The app still starts without a token. It shows an explicit configuration state instead of drawing a fake map or inventing search results.

## Commands

```bash
pnpm --filter @workspace/ride-navigation run typecheck
pnpm --filter @workspace/ride-navigation run build
```

## Current functionality

- Bike and Scooter ride modes, persisted locally
- Real GPS position, speed, heading, accuracy, and stale-location handling
- Kilometer and mile display settings
- Real Mapbox map, geocoding search, and Directions routing when configured
- Route geometry, destination marker, route progress, maneuver information, and recenter behavior
- Dark, light, and system themes
- Performance and debug settings persisted locally
- Browser capability detection and honest unavailable/error states
- Wake Lock support during active navigation when the browser exposes it
- Installable PWA shell with graceful offline degradation

## Current limitations

- Real Mapbox features require a valid `VITE_MAPBOX_TOKEN` and network access.
- GPS requires a secure context and a device/browser that exposes location services.
- Route progress is based on the latest browser location; it does not claim turn-by-turn spoken guidance.
- Camera, computer vision, object detection, tracking, path/lane perception, and safety warnings are intentionally not implemented in this milestone.
- Hardware behavior on a physical phone has not been claimed unless tested separately.

## Future architecture

The application leaves clear boundaries for a future local-only camera pipeline:

```text
camera -> detector -> tracker -> path/lane perception -> safety engine -> warning/audio/visualization
```

No camera frames are uploaded and no ML model is loaded by the current navigation foundation.