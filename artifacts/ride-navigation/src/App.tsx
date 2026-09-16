import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bike,
  Check,
  ChevronRight,
  Compass,
  Crosshair,
  Gauge,
  Globe2,
  LocateFixed,
  Map,
  MapPin,
  Navigation,
  PlugZap,
  Search,
  Settings2,
  Smartphone,
  X,
  Zap,
} from 'lucide-react';
import { createCameraService } from '@/services/camera';
import { detectDeviceCapabilities } from '@/services/deviceCapabilities';
import {
  clearStoredMapboxToken,
  getMapboxConfiguration,
  getStoredMapboxToken,
  isPublicMapboxToken,
  mapboxResponseMessage,
  saveStoredMapboxToken,
  testMapboxConnection,
  type MapboxTokenSource,
} from '@/services/mapboxConfig';
import { createWakeLockController } from '@/services/wakeLock';
import {
  deriveSpeedKmh,
  distanceBetweenMeters,
  formatDistance,
  formatDuration,
  formatSpeed,
  remainingRouteDistance,
} from '@/utils/geo';
import type {
  DeviceCapabilities,
  LocationState,
  NavigationRoute,
  NavigationStatus,
  PerformanceMode,
  RideMode,
  SearchResult,
  Theme,
  Unit,
} from '@/types/navigation';

type MapState = 'idle' | 'loading' | 'ready' | 'missing-token' | 'error';
type MapboxFeature = SearchResult & { geometry?: { coordinates: [number, number] } };
type MapboxRoute = {
  distance: number;
  duration: number;
  geometry: NavigationRoute['geometry'];
  legs?: Array<{
    steps?: Array<{
      distance: number;
      maneuver?: { instruction?: string; type?: string; modifier?: string };
    }>;
  }>;
};
type MapboxInstance = {
  on: (event: string, callback: () => void) => void;
  remove: () => void;
  resize: () => void;
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  addSource: (id: string, source: object) => void;
  addLayer: (layer: object) => void;
  getSource: (id: string) => { setData: (data: object) => void } | undefined;
};

declare global {
  interface Window {
    mapboxgl?: {
      accessToken: string;
      Map: new (options: object) => MapboxInstance;
    };
  }
}

const MAPBOX_SCRIPT = 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js';
const MAPBOX_STYLE = 'mapbox://styles/mapbox/navigation-night-v1';

const emptyLocation: LocationState = {
  latitude: null,
  longitude: null,
  speedKmh: null,
  heading: null,
  accuracyMeters: null,
  timestamp: null,
  status: 'unavailable',
  error: null,
};

function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Local persistence is optional in restricted browser contexts.
    }
  }, [key, value]);
  return [value, setValue] as const;
}

function App() {
  const [mode, setMode] = useStoredState<RideMode>('ride-mode', 'bike');
  const [theme, setTheme] = useStoredState<Theme>('ride-theme', 'dark');
  const [unit, setUnit] = useStoredState<Unit>('ride-unit', 'kmh');
  const [performanceMode, setPerformanceMode] =
    useStoredState<PerformanceMode>('ride-performance', 'balanced');
  const [debugMode, setDebugMode] = useStoredState('ride-debug', false);
  const [mapboxToken, setMapboxToken] = useState(
    () => getMapboxConfiguration().token,
  );
  const [mapboxTokenSource, setMapboxTokenSource] =
    useState<MapboxTokenSource>(() => getMapboxConfiguration().source);
  const [mapboxTokenDraft, setMapboxTokenDraft] = useState(
    () => getStoredMapboxToken() ?? getMapboxConfiguration().token ?? '',
  );
  const [mapboxTokenStatus, setMapboxTokenStatus] = useState<string | null>(null);
  const [mapboxTokenStatusKind, setMapboxTokenStatusKind] = useState<
    'ok' | 'error' | null
  >(null);
  const [testingMapboxToken, setTestingMapboxToken] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [location, setLocation] = useState<LocationState>(emptyLocation);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedDestination, setSelectedDestination] =
    useState<SearchResult | null>(null);
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [navigationStatus, setNavigationStatus] =
    useState<NavigationStatus>('idle');
  const [followMode, setFollowMode] = useState(true);
  const [offRoute, setOffRoute] = useState(false);
  const [remainingMeters, setRemainingMeters] = useState<number | null>(null);
  const [mapState, setMapState] = useState<MapState>(
    mapboxToken ? 'loading' : 'missing-token',
  );
  const [capabilities] = useState<DeviceCapabilities>(() =>
    detectDeviceCapabilities(),
  );
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxInstance | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const searchTimer = useRef<number | undefined>(undefined);
  const previousPointRef = useRef<{
    coordinate: [number, number];
    timestamp: number;
    accuracy: number;
  } | null>(null);
  const mapRouteDrawnRef = useRef(false);
  const wakeLockRef = useRef(createWakeLockController());
  const mapboxConfiguration = mapboxToken
    ? { token: mapboxToken, source: mapboxTokenSource }
    : { token: null, source: 'none' as const };
  const hasMapboxToken = Boolean(mapboxConfiguration.token);

  const actualTheme = useMemo(
    () =>
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : theme,
    [theme],
  );

  useEffect(() => {
    document.documentElement.classList.remove('theme-dark', 'theme-light');
    document.documentElement.classList.add(`theme-${actualTheme}`);
  }, [actualTheme]);

  useEffect(() => {
    const handler = (event: Event) =>
      setInstallPrompt(event as BeforeInstallPromptEvent);
    window.addEventListener('beforeinstallprompt', handler);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocation((current) => ({
        ...current,
        status: 'unavailable',
        error: 'This browser does not expose geolocation.',
      }));
      return;
    }
    setLocation((current) => ({
      ...current,
      status: 'acquiring',
      error: null,
    }));
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }
    watchIdRef.current = navigator.geolocation.watchPosition(
      (value) => {
        const coords = value.coords;
        const coordinate: [number, number] = [coords.longitude, coords.latitude];
        const previous = previousPointRef.current;
        const derivedSpeed =
          coords.speed !== null &&
          Number.isFinite(coords.speed) &&
          coords.speed >= 0 &&
          coords.speed <= 34
            ? coords.speed * 3.6
            : previous
              ? deriveSpeedKmh(
                  previous,
                  {
                    coordinate,
                    timestamp: value.timestamp,
                    accuracy: coords.accuracy,
                  },
                )
              : null;
        previousPointRef.current = {
          coordinate,
          timestamp: value.timestamp,
          accuracy: coords.accuracy,
        };
        setLocation({
          latitude: coords.latitude,
          longitude: coords.longitude,
          speedKmh: derivedSpeed,
          heading: Number.isFinite(coords.heading) ? coords.heading : null,
          accuracyMeters: coords.accuracy,
          timestamp: value.timestamp,
          status: coords.accuracy > 80 ? 'degraded' : 'active',
          error: null,
        });
      },
      (error) => {
        setLocation((current) => ({
          ...current,
          status: error.code === error.PERMISSION_DENIED ? 'unavailable' : 'degraded',
          error:
            error.code === error.PERMISSION_DENIED
              ? 'Location permission was denied. Check browser site settings.'
              : error.message || 'Location is temporarily unavailable.',
        }));
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLocation((current) => {
        if (
          current.status !== 'active' ||
          current.timestamp === null ||
          Date.now() - current.timestamp < 20_000
        ) {
          return current;
        }
        return { ...current, status: 'degraded' };
      });
    }, 5_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(
    () => () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      void wakeLockRef.current.dispose();
      mapRef.current?.remove();
    },
    [],
  );

  useEffect(() => {
    if (!mapboxToken || !mapNode.current) {
      mapRef.current?.remove();
      mapRef.current = null;
      setMapState('missing-token');
      return;
    }
    setMapState('loading');
    let script = document.querySelector<HTMLScriptElement>(
      `script[src="${MAPBOX_SCRIPT}"]`,
    );
    const boot = () => {
      if (!mapNode.current || !window.mapboxgl || mapRef.current) return;
      window.mapboxgl.accessToken = mapboxToken;
      try {
        const map = new window.mapboxgl.Map({
          container: mapNode.current,
          style: MAPBOX_STYLE,
          center: [0, 0],
          zoom: 1.4,
          attributionControl: true,
        });
        map.on('load', () => {
          mapRef.current = map;
          setMapState('ready');
          if (location.latitude !== null && location.longitude !== null) {
            map.setCenter([location.longitude, location.latitude]);
            map.setZoom(14);
          }
        });
        map.on('dragstart', () => setFollowMode(false));
        map.on('error', () => setMapState('error'));
      } catch {
        setMapState('error');
      }
    };
    if (window.mapboxgl) {
      boot();
    } else {
      if (!script) {
        script = document.createElement('script');
        script.src = MAPBOX_SCRIPT;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', boot);
    }
    const style = document.querySelector<HTMLLinkElement>('link[data-mapbox-style]');
    if (!style) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css';
      link.dataset.mapboxStyle = 'true';
      document.head.appendChild(link);
    }
    return () => {
      script?.removeEventListener('load', boot);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapboxToken]);

  useEffect(() => {
    if (
      followMode &&
      mapRef.current &&
      location.latitude !== null &&
      location.longitude !== null
    ) {
      mapRef.current.setCenter([location.longitude, location.latitude]);
    }
  }, [followMode, location.latitude, location.longitude]);

  useEffect(() => {
    if (!route || !mapRef.current || mapState !== 'ready') return;
    const routeFeature = {
      type: 'Feature',
      properties: {},
      geometry: route.geometry,
    };
    const currentFeature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Point',
        coordinates:
          location.latitude !== null && location.longitude !== null
            ? [location.longitude, location.latitude]
            : route.geometry.coordinates[0],
      },
    };
    const destinationFeature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Point', coordinates: route.destination.center },
    };
    const source = mapRef.current.getSource('route-line');
    if (source) source.setData(routeFeature);
    else {
      mapRef.current.addSource('route-line', {
        type: 'geojson',
        data: routeFeature,
      });
      mapRef.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route-line',
        paint: {
          'line-color': '#94e8d0',
          'line-width': 5,
          'line-opacity': 0.9,
        },
      });
    }
    const riderSource = mapRef.current.getSource('rider-point');
    if (riderSource) riderSource.setData(currentFeature);
    else {
      mapRef.current.addSource('rider-point', {
        type: 'geojson',
        data: currentFeature,
      });
      mapRef.current.addLayer({
        id: 'rider-point',
        type: 'circle',
        source: 'rider-point',
        paint: {
          'circle-radius': 7,
          'circle-color': '#94e8d0',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#0b1518',
        },
      });
    }
    const destinationSource = mapRef.current.getSource('destination-point');
    if (destinationSource) destinationSource.setData(destinationFeature);
    else {
      mapRef.current.addSource('destination-point', {
        type: 'geojson',
        data: destinationFeature,
      });
      mapRef.current.addLayer({
        id: 'destination-point',
        type: 'circle',
        source: 'destination-point',
        paint: {
          'circle-radius': 7,
          'circle-color': '#f4c95d',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#0b1518',
        },
      });
    }
    if (!mapRouteDrawnRef.current) {
      const first = route.geometry.coordinates[0];
      mapRef.current.setCenter(first);
      mapRef.current.setZoom(11);
      mapRouteDrawnRef.current = true;
    }
  }, [
    location.latitude,
    location.longitude,
    mapState,
    route,
  ]);

  useEffect(() => {
    mapRouteDrawnRef.current = false;
  }, [route]);

  useEffect(() => {
    if (!route || location.latitude === null || location.longitude === null) {
      setRemainingMeters(null);
      setOffRoute(false);
      return;
    }
    const progress = remainingRouteDistance(
      [location.longitude, location.latitude],
      route.geometry.coordinates,
    );
    setRemainingMeters(progress.distanceMeters);
    setOffRoute(progress.offRoute);
    if (navigationStatus === 'navigating' || navigationStatus === 'arriving') {
      if (progress.distanceMeters < 30) {
        setNavigationStatus('arrived');
      } else if (progress.distanceMeters < 120) {
        setNavigationStatus('arriving');
      }
    }
  }, [location.latitude, location.longitude, navigationStatus, route]);

  useEffect(() => {
    const wakeLock = wakeLockRef.current;
    const updateWakeLock = () => {
      if (navigationStatus === 'navigating' || navigationStatus === 'arriving') {
        void wakeLock.acquire();
      } else {
        void wakeLock.release();
      }
    };
    updateWakeLock();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') updateWakeLock();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [navigationStatus]);

  const runSearch = useCallback(
    (value: string) => {
      setSearch(value);
      setSelectedDestination(null);
      setRoute(null);
      setRouteError(null);
      setNavigationStatus('idle');
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
      if (!hasMapboxToken || value.trim().length < 3) {
        setSearchResults([]);
        setSearchError(
          !hasMapboxToken && value.trim().length >= 3
            ? 'Add your Mapbox access token in Settings to enable geocoding.'
            : null,
        );
        setSearching(false);
        return;
      }
      setNavigationStatus('planning');
      searchTimer.current = window.setTimeout(async () => {
        setSearching(true);
        setSearchError(null);
        try {
          const proximity =
            location.latitude !== null && location.longitude !== null
              ? `&proximity=${location.longitude},${location.latitude}`
              : '';
          const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(value.trim())}.json?autocomplete=true&limit=5${proximity}&access_token=${mapboxToken}`,
          );
          if (!response.ok) {
            throw new Error(
              mapboxResponseMessage(
                response,
                'Search unavailable. Check your connection.',
              ),
            );
          }
          const data = (await response.json()) as { features?: MapboxFeature[] };
          setSearchResults(data.features ?? []);
        } catch (error) {
          setSearchError(
            error instanceof Error
              ? error.message
              : 'Search unavailable. Check your connection.',
          );
        } finally {
          setSearching(false);
        }
      }, 280);
    },
    [hasMapboxToken, location.latitude, location.longitude, mapboxToken],
  );

  const chooseDestination = useCallback(
    async (destination: SearchResult) => {
      setSelectedDestination(destination);
      setSearch(destination.place_name);
      setSearchResults([]);
      setSearchError(null);
      setRouteError(null);
      if (!hasMapboxToken) return;
      if (location.latitude === null || location.longitude === null) {
        setRouteError(
          'Enable location before requesting a route from your current position.',
        );
        setNavigationStatus('error');
        return;
      }
      setRouteLoading(true);
      setNavigationStatus('routing');
      try {
        const profile = mode === 'bike' ? 'cycling' : 'driving';
        const start = `${location.longitude},${location.latitude}`;
        const end = `${destination.center[0]},${destination.center[1]}`;
        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/${profile}/${start};${end}?alternatives=false&geometries=geojson&overview=full&steps=true&access_token=${mapboxToken}`,
        );
          if (!response.ok) {
            throw new Error(
              mapboxResponseMessage(
                response,
                'Routing unavailable. Check your connection.',
              ),
            );
          }
        const data = (await response.json()) as { routes?: MapboxRoute[] };
        const first = data.routes?.[0];
        if (!first) throw new Error('No route was returned for this destination.');
        setRoute({
          distanceMeters: first.distance,
          durationSeconds: first.duration,
          geometry: first.geometry,
          destination,
          steps: (first.legs?.flatMap((leg) => leg.steps ?? []) ?? []).map(
            (step) => ({
              instruction: step.maneuver?.instruction ?? 'Continue',
              distanceMeters: step.distance,
              type: step.maneuver?.type ?? 'continue',
              modifier: step.maneuver?.modifier ?? null,
            }),
          ),
        });
        setNavigationStatus('planning');
      } catch (error) {
        setNavigationStatus('error');
        setRouteError(
          error instanceof Error
            ? error.message
            : 'Routing unavailable. Check your connection.',
        );
      } finally {
        setRouteLoading(false);
      }
    },
    [hasMapboxToken, location.latitude, location.longitude, mapboxToken, mode],
  );

  const applyMapboxConfiguration = useCallback(() => {
    const configuration = getMapboxConfiguration();
    setMapboxToken(configuration.token);
    setMapboxTokenSource(configuration.source);
    setMapState(configuration.token ? 'loading' : 'missing-token');
    setRouteError(null);
  }, []);

  const saveMapboxToken = () => {
    try {
      saveStoredMapboxToken(mapboxTokenDraft);
      applyMapboxConfiguration();
      setMapboxTokenStatus(
        getMapboxConfiguration().source === 'environment'
          ? 'Saved locally. The environment token remains active.'
          : 'Token saved on this device.',
      );
      setMapboxTokenStatusKind('ok');
    } catch (error) {
      setMapboxTokenStatus(
        error instanceof Error ? error.message : 'Could not save the token.',
      );
      setMapboxTokenStatusKind('error');
    }
  };

  const clearMapboxToken = () => {
    clearStoredMapboxToken();
    const configuration = getMapboxConfiguration();
    setMapboxTokenDraft(configuration.token ?? '');
    applyMapboxConfiguration();
    setMapboxTokenStatus(
      configuration.source === 'environment'
        ? 'Local token cleared. The environment token remains active.'
        : 'Token cleared from this device.',
    );
    setMapboxTokenStatusKind('ok');
  };

  const testMapboxToken = async () => {
    const candidate = mapboxTokenDraft.trim() || mapboxToken;
    setTestingMapboxToken(true);
    setMapboxTokenStatus(null);
    setMapboxTokenStatusKind(null);
    const result = await testMapboxConnection(candidate);
    setMapboxTokenStatus(result.message);
    setMapboxTokenStatusKind(result.ok ? 'ok' : 'error');
    setTestingMapboxToken(false);
  };

  const startNavigation = () => {
    if (!route) return;
    setFollowMode(true);
    setNavigationStatus('navigating');
  };

  const stopNavigation = () => {
    setNavigationStatus('idle');
    setFollowMode(true);
    setOffRoute(false);
  };

  const recenter = () => {
    setFollowMode(true);
    if (
      location.latitude === null ||
      location.longitude === null ||
      !mapRef.current
    ) {
      requestLocation();
      return;
    }
    mapRef.current.setCenter([location.longitude, location.latitude]);
    mapRef.current.setZoom(14);
  };

  const mapMessage =
    mapState === 'missing-token'
      ? "Mapbox isn't configured"
      : mapState === 'error'
        ? 'Mapbox could not load'
        : null;
  const locationLabel =
    location.status === 'active'
      ? 'Location live'
      : location.status === 'acquiring'
        ? 'Requesting location'
        : location.status === 'degraded'
          ? 'Location degraded'
          : 'Location off';
  const speed = formatSpeed(location.speedKmh, unit);
  const nextStep = route?.steps[0] ?? null;
  const showingNavigation =
    navigationStatus === 'navigating' ||
    navigationStatus === 'arriving' ||
    navigationStatus === 'arrived';

  return (
    <div className="ride-app">
      <header className="app-header">
        <a className="brand" href="/" data-testid="link-home">
          <span className="brand-mark">
            <Navigation size={17} strokeWidth={2.4} />
          </span>
          <span>
            <span className="brand-name">ride / nav</span>
            <span className="brand-subtitle">handlebar navigation</span>
          </span>
        </a>
        <div className="header-actions">
          <div className="status-pill" data-testid="status-location">
            <span
              className={`status-dot ${
                location.status === 'active'
                  ? 'live'
                  : location.status === 'acquiring' ||
                      location.status === 'degraded'
                    ? 'warn'
                    : ''
              }`}
            />
            <span>{locationLabel}</span>
          </div>
          <button
            className="icon-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            data-testid="button-open-settings"
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>

      <main className="ride-layout">
        <section className="map-stage" aria-label="Navigation map">
          {hasMapboxToken && (
            <div className="map-canvas" ref={mapNode} data-testid="mapbox-canvas" />
          )}
          <div className="map-fade" aria-hidden="true" />
          {mapMessage && (
            <div className="map-empty">
              <div className="map-empty-card" data-testid="status-map-configuration">
                <div className="map-empty-icon">
                  <Map size={18} />
                </div>
                <h2>{mapMessage}</h2>
                <p>
                  {mapState === 'missing-token'
                    ? 'Add your Mapbox access token in Settings to enable maps and navigation.'
                    : 'Check your token, network connection, and Mapbox availability. No substitute map is shown.'}
                </p>
                <button
                  className="control-button subtle"
                  style={{ marginTop: '.9rem' }}
                  onClick={() => setDebugOpen(true)}
                  data-testid="button-view-map-diagnostics"
                >
                  View diagnostics <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
          {hasMapboxToken && mapState === 'loading' && (
            <div className="map-empty">
              <div
                className="map-empty-card skeleton"
                style={{ height: '8rem' }}
                aria-label="Loading map"
                data-testid="status-map-loading"
              />
            </div>
          )}
          <div className="map-overlay-top">
            <div className="map-overlay-stack">
              <div className="map-label">
                <span className="mini-line" />{' '}
                {showingNavigation ? 'NAVIGATION ACTIVE' : 'READY TO RIDE'}
              </div>
              {route && (
                <div className="route-summary">
                  <span className="route-line" />
                  <span>
                    <strong>{route.destination.text}</strong>
                    <span>
                      {formatDistance(
                        remainingMeters ?? route.distanceMeters,
                        unit,
                      )}{' '}
                      · {formatDuration(route.durationSeconds)}
                    </span>
                  </span>
                </div>
              )}
            </div>
            <div className="map-controls">
              <button
                className="icon-button"
                onClick={recenter}
                aria-label={
                  location.latitude !== null
                    ? 'Recenter on current location'
                    : 'Enable location'
                }
                data-testid="button-recenter"
              >
                <Crosshair size={18} />
              </button>
              <button
                className="icon-button"
                onClick={() => setDebugOpen(true)}
                aria-label="Open capability diagnostics"
                data-testid="button-open-diagnostics"
              >
                <Gauge size={17} />
              </button>
            </div>
          </div>
          <div className="map-overlay-bottom">
            <div className="map-label">
              <Compass size={14} />{' '}
              {location.accuracyMeters !== null
                ? `${location.accuracyMeters.toFixed(0)} m accuracy`
                : 'Waiting for position'}
            </div>
            {showingNavigation && (
              <button
                className="control-button primary"
                onClick={stopNavigation}
                data-testid="button-stop-navigation"
              >
                Stop navigation
              </button>
            )}
          </div>
        </section>

        <aside className="side-panel">
          <section className="panel-card">
            <div className="panel-heading">
              <h2>Find a destination</h2>
              <span>{hasMapboxToken ? 'Mapbox search' : 'Needs token'}</span>
            </div>
            <div className="search-wrap">
              <Search className="search-icon" size={16} />
              <input
                className="search-input"
                type="search"
                value={search}
                onChange={(event) => runSearch(event.target.value)}
                placeholder="Search places or addresses"
                disabled={!hasMapboxToken}
                aria-label="Search destination"
                data-testid="input-destination-search"
              />
              {search && (
                <button
                  className="search-clear"
                  onClick={() => runSearch('')}
                  aria-label="Clear destination search"
                  data-testid="button-clear-search"
                >
                  <X size={15} />
                </button>
              )}
            </div>
            {searching && (
              <p className="search-note" data-testid="status-searching">
                Searching Mapbox…
              </p>
            )}
            {!searching &&
              search.trim().length >= 3 &&
              !searchError &&
              searchResults.length === 0 && (
                <p className="search-note" data-testid="status-search-no-results">
                  No places found.
                </p>
              )}
            {searchError && (
              <p
                className="search-note"
                style={{ color: 'hsl(var(--accent))' }}
                data-testid="status-search-error"
              >
                {searchError}
              </p>
            )}
            {searchResults.length > 0 && (
              <div className="result-list" role="listbox" aria-label="Destination results">
                {searchResults.map((result) => (
                  <button
                    className="result-button"
                    key={result.id}
                    onClick={() => chooseDestination(result)}
                    data-testid={`result-destination-${result.id}`}
                  >
                    <MapPin size={15} />
                    <span>
                      <strong>{result.text}</strong>
                      <span>{result.place_name}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {routeError && (
              <p
                className="search-note"
                style={{ color: 'hsl(var(--destructive))' }}
                data-testid="status-route-error"
              >
                {routeError}
              </p>
            )}
            {route && (
              <div className="route-details">
                {nextStep && (
                  <div className="next-maneuver">
                    <span>Next maneuver</span>
                    <strong>{nextStep.instruction}</strong>
                    <small>{formatDistance(nextStep.distanceMeters, unit)}</small>
                  </div>
                )}
                <button
                  className="control-button primary full-button"
                  onClick={startNavigation}
                  disabled={routeLoading || showingNavigation}
                  data-testid="button-start-navigation"
                >
                  <Navigation size={15} />{' '}
                  {routeLoading
                    ? 'Calculating route'
                    : showingNavigation
                      ? 'Navigation active'
                      : 'Start navigation'}
                </button>
              </div>
            )}
          </section>

          <section className="panel-card">
            <div className="panel-heading">
              <h2>Ride profile</h2>
              <span>route preference</span>
            </div>
            <div className="segmented" role="group" aria-label="Ride profile">
              <button
                className={mode === 'bike' ? 'active' : ''}
                onClick={() => {
                  setMode('bike');
                  setRoute(null);
                  setNavigationStatus('idle');
                }}
                data-testid="button-mode-bike"
              >
                <Bike size={15} /> Bike
              </button>
              <button
                className={mode === 'scooter' ? 'active' : ''}
                onClick={() => {
                  setMode('scooter');
                  setRoute(null);
                  setNavigationStatus('idle');
                }}
                data-testid="button-mode-scooter"
              >
                <Zap size={15} /> Scooter
              </button>
            </div>
          </section>

          <section className="panel-card" aria-label="Ride telemetry">
            <div className="panel-heading">
              <h2>Live telemetry</h2>
              <span>
                {location.status === 'active' ? 'browser GPS' : 'not connected'}
              </span>
            </div>
            <div className="speed-card">
              <div>
                <div className="speed-value" data-testid="text-current-speed">
                  {speed}
                </div>
                <div className="speed-unit">{unit === 'kmh' ? 'KM/H' : 'MPH'}</div>
              </div>
              <div className="speed-meta">
                <strong data-testid="text-ride-mode">{mode.toUpperCase()}</strong>
                <span>
                  {location.heading !== null
                    ? `${Math.round(location.heading)}° heading`
                    : 'heading unavailable'}
                </span>
              </div>
            </div>
            <div className="metrics">
              <div className="metric">
                <span>GPS accuracy</span>
                <strong data-testid="text-gps-accuracy">
                  {location.accuracyMeters !== null
                    ? `${location.accuracyMeters.toFixed(0)} m`
                    : '—'}
                </strong>
              </div>
              <div className="metric">
                <span>Position</span>
                <strong data-testid="text-position">
                  {location.latitude !== null && location.longitude !== null
                    ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
                    : '—'}
                </strong>
              </div>
            </div>
            {location.status !== 'active' && (
              <button
                className="control-button primary full-button"
                onClick={requestLocation}
                disabled={location.status === 'acquiring'}
                data-testid="button-enable-location"
              >
                <LocateFixed size={15} />{' '}
                {location.status === 'acquiring'
                  ? 'Requesting location'
                  : 'Enable location'}
              </button>
            )}
            {location.error && (
              <p
                className="search-note"
                style={{ color: 'hsl(var(--accent))' }}
                data-testid="status-location-error"
              >
                {location.error}
              </p>
            )}
          </section>

          {offRoute && (
            <div className="notice" data-testid="status-off-route">
              <Compass size={15} />
              <span>
                Off route. Navigation remains active; choose the destination again
                to request a new route.
              </span>
            </div>
          )}
          {!hasMapboxToken && (
            <div className="notice" data-testid="status-token-notice">
              <PlugZap size={15} />
              <span>
                Add your Mapbox access token in Settings to enable maps and
                navigation.
              </span>
            </div>
          )}
          {hasMapboxToken && location.latitude === null && (
            <div className="notice" data-testid="status-location-notice">
              <LocateFixed size={15} />
              <span>
                Enable browser location before searching for a route from your
                current position.
              </span>
            </div>
          )}
        </aside>
      </main>

      {settingsOpen && (
        <>
          <div
            className="sheet-backdrop"
            onClick={() => setSettingsOpen(false)}
            data-testid="button-close-settings-backdrop"
          />
          <aside className="settings-sheet" aria-label="Settings" data-testid="panel-settings">
            <div className="sheet-header">
              <div>
                <div className="eyebrow">ride / nav</div>
                <h2>Settings</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
                data-testid="button-close-settings"
              >
                <X size={18} />
              </button>
            </div>
            <div className="settings-group">
              <h3>Ride display</h3>
              <div className="setting-row">
                <div className="setting-copy">
                  <strong>Units</strong>
                  <span>Choose how speed and distance are shown.</span>
                </div>
                <select
                  className="setting-select"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value as Unit)}
                  aria-label="Units"
                  data-testid="select-units"
                >
                  <option value="kmh">Metric</option>
                  <option value="mph">Imperial</option>
                </select>
              </div>
              <div className="setting-row">
                <div className="setting-copy">
                  <strong>Appearance</strong>
                  <span>Dark is tuned for low-distraction riding.</span>
                </div>
                <select
                  className="setting-select"
                  value={theme}
                  onChange={(event) => setTheme(event.target.value as Theme)}
                  aria-label="Appearance"
                  data-testid="select-theme"
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </div>
              <div className="setting-row">
                <div className="setting-copy">
                  <strong>Performance mode</strong>
                  <span>Sets the future visual workload policy.</span>
                </div>
                <select
                  className="setting-select"
                  value={performanceMode}
                  onChange={(event) =>
                    setPerformanceMode(event.target.value as PerformanceMode)
                  }
                  aria-label="Performance mode"
                  data-testid="select-performance"
                >
                  <option value="high">High performance</option>
                  <option value="balanced">Balanced</option>
                  <option value="battery">Battery saver</option>
                </select>
              </div>
              <div className="setting-row">
                <div className="setting-copy">
                  <strong>Debug mode</strong>
                  <span>Show extended browser and navigation diagnostics.</span>
                </div>
                <select
                  className="setting-select"
                  value={debugMode ? 'on' : 'off'}
                  onChange={(event) => setDebugMode(event.target.value === 'on')}
                  aria-label="Debug mode"
                  data-testid="select-debug-mode"
                >
                  <option value="off">Off</option>
                  <option value="on">On</option>
                </select>
              </div>
            </div>
            <div className="settings-group">
              <h3>Mapbox</h3>
              <div className={`token-status ${hasMapboxToken ? 'configured' : 'missing'}`}>
                <span className="token-status-dot" aria-hidden="true" />
                <span>
                  {hasMapboxToken
                    ? mapboxTokenSource === 'environment'
                      ? 'Configured · environment token active'
                      : 'Configured · saved on this device'
                    : 'Not configured'}
                </span>
              </div>
              <label className="token-field-label" htmlFor="mapbox-token">
                Mapbox public access token
              </label>
              <input
                id="mapbox-token"
                className="token-input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={mapboxTokenDraft}
                onChange={(event) => {
                  setMapboxTokenDraft(event.target.value);
                  setMapboxTokenStatus(null);
                  setMapboxTokenStatusKind(null);
                }}
                placeholder="pk...."
                aria-describedby="mapbox-token-help"
                data-testid="input-mapbox-token"
              />
              <p id="mapbox-token-help" className="token-help">
                Public tokens begin with <code>pk.</code>. The token stays in
                this browser and is sent only to Mapbox.
              </p>
              <div className="token-actions">
                <button
                  className="control-button primary"
                  onClick={saveMapboxToken}
                  data-testid="button-save-mapbox-token"
                >
                  Save
                </button>
                <button
                  className="control-button subtle"
                  onClick={testMapboxToken}
                  disabled={testingMapboxToken}
                  data-testid="button-test-mapbox-token"
                >
                  {testingMapboxToken ? 'Testing…' : 'Test connection'}
                </button>
                <button
                  className="control-button subtle"
                  onClick={clearMapboxToken}
                  data-testid="button-clear-mapbox-token"
                >
                  Clear token
                </button>
              </div>
              {mapboxTokenStatus && (
                <p
                  className={`token-feedback ${mapboxTokenStatusKind ?? ''}`}
                  role="status"
                  data-testid="status-mapbox-token"
                >
                  {mapboxTokenStatus}
                </p>
              )}
            </div>
            <div className="settings-group">
              <h3>Capabilities</h3>
              <div className="debug-status">
                <Smartphone size={16} />
                <div>
                  <strong>Installable PWA</strong>
                  <span>
                    {installPrompt
                      ? 'Ready to install on this device.'
                      : 'Use your browser menu to install when available.'}
                  </span>
                </div>
              </div>
              <div className={`debug-status ${hasMapboxToken ? 'ok' : 'warn'}`}>
                <Map size={16} />
                <div>
                  <strong>Mapbox services</strong>
                  <span>
                    {hasMapboxToken
                      ? mapboxTokenSource === 'environment'
                        ? 'Environment token is active.'
                        : 'Local token is active.'
                      : 'Add a token in Settings to enable maps and navigation.'}
                  </span>
                </div>
              </div>
              <div
                className={`debug-status ${
                  location.status === 'active' ? 'ok' : 'warn'
                }`}
              >
                <LocateFixed size={16} />
                <div>
                  <strong>Browser location</strong>
                  <span>{locationLabel}</span>
                </div>
              </div>
            </div>
            {installPrompt && (
              <div className="install-banner">
                <Smartphone size={18} />
                <div style={{ flex: 1 }}>
                  <strong style={{ display: 'block', fontSize: '.72rem' }}>
                    Install ride / nav
                  </strong>
                  <span className="fine-print">Put the riding screen one tap away.</span>
                </div>
                <button
                  className="control-button primary"
                  onClick={async () => {
                    await installPrompt.prompt();
                    setInstallPrompt(null);
                  }}
                  data-testid="button-install-pwa"
                >
                  Install
                </button>
              </div>
            )}
            <button
              className="control-button subtle full-button"
              onClick={() => setDebugOpen(true)}
              data-testid="button-open-debug-from-settings"
            >
              Open diagnostics <ChevronRight size={14} />
            </button>
          </aside>
        </>
      )}

      {debugOpen && (
        <div
          className="route-modal"
          onClick={() => setDebugOpen(false)}
          data-testid="panel-diagnostics"
        >
          <div className="route-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <div className="eyebrow">system check</div>
                <h2>Capability diagnostics</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setDebugOpen(false)}
                aria-label="Close diagnostics"
                data-testid="button-close-diagnostics"
              >
                <X size={17} />
              </button>
            </div>
            <div className={`debug-status ${hasMapboxToken && mapState === 'ready' ? 'ok' : 'warn'}`}>
              <Map size={16} />
              <div>
                <strong>Mapbox map and services</strong>
                <span>
                  {!hasMapboxToken
                    ? "Mapbox isn't configured."
                    : mapState === 'ready'
                      ? 'Map style loaded.'
                      : mapState === 'error'
                        ? 'Map failed to load.'
                        : 'Map style is still loading.'}
                </span>
              </div>
            </div>
            <div className={`debug-status ${location.status === 'active' ? 'ok' : 'warn'}`}>
              <LocateFixed size={16} />
              <div>
                <strong>Geolocation</strong>
                <span>
                  {location.status === 'active'
                    ? 'Live browser position received.'
                    : location.status === 'acquiring'
                      ? 'Waiting for a browser position.'
                      : location.error ?? 'Not available.'}
                </span>
              </div>
            </div>
            <div className="debug-status ok">
              <Check size={16} />
              <div>
                <strong>Route integrity</strong>
                <span>
                  Routes are accepted only from Mapbox Directions; no fallback
                  coordinates or route data are used.
                </span>
              </div>
            </div>
            <div className="debug-status">
              <Globe2 size={16} />
              <div>
                <strong>Browser capabilities</strong>
                <span>
                  {capabilities.isSecureContext ? 'Secure' : 'Not secure'} context ·
                  WebGPU {capabilities.hasWebGPU ? 'yes' : 'no'} · WebGL{' '}
                  {capabilities.hasWebGL ? 'yes' : 'no'} · Camera{' '}
                  {capabilities.hasCamera ? 'yes' : 'no'} · Wake Lock{' '}
                  {capabilities.hasWakeLock ? 'yes' : 'no'}
                </span>
              </div>
            </div>
            {debugMode && (
              <div className="debug-grid">
                <span>Navigation state</span>
                <strong>{navigationStatus}</strong>
                <span>Performance mode</span>
                <strong>{performanceMode}</strong>
                <span>Remaining route</span>
                <strong>
                  {remainingMeters === null
                    ? '—'
                    : formatDistance(remainingMeters, unit)}
                </strong>
                <span>Advanced vision readiness</span>
                <strong>{capabilities.supportsAdvancedVision ? 'candidate' : 'not available'}</strong>
              </div>
            )}
            <div className="route-actions">
              <button
                className="control-button subtle"
                onClick={() => setDebugOpen(false)}
                data-testid="button-dismiss-diagnostics"
              >
                Close
              </button>
              {location.status !== 'active' && (
                <button
                  className="control-button primary"
                  onClick={() => {
                    setDebugOpen(false);
                    requestLocation();
                  }}
                  data-testid="button-request-location-diagnostics"
                >
                  <LocateFixed size={14} /> Request location
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export default App;