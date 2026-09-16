export type RideMode = 'bike' | 'scooter';
export type Theme = 'dark' | 'light' | 'system';
export type Unit = 'kmh' | 'mph';
export type PerformanceMode = 'high' | 'balanced' | 'battery';
export type NavigationStatus =
  | 'idle'
  | 'planning'
  | 'routing'
  | 'navigating'
  | 'rerouting'
  | 'arriving'
  | 'arrived'
  | 'error';

export interface LocationState {
  latitude: number | null;
  longitude: number | null;
  speedKmh: number | null;
  heading: number | null;
  accuracyMeters: number | null;
  timestamp: number | null;
  status: 'unavailable' | 'acquiring' | 'active' | 'degraded';
  error: string | null;
}

export interface SearchResult {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
}

export interface NavigationStep {
  instruction: string;
  distanceMeters: number;
  type: string;
  modifier: string | null;
}

export interface NavigationRoute {
  geometry: { type: 'LineString'; coordinates: [number, number][] };
  distanceMeters: number;
  durationSeconds: number;
  steps: NavigationStep[];
  destination: SearchResult;
}

export interface DeviceCapabilities {
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  isSecureContext: boolean;
  hasWebGPU: boolean;
  hasWebGL: boolean;
  hasCamera: boolean;
  hasGeolocation: boolean;
  hasWakeLock: boolean;
  supportsAdvancedVision: boolean;
}

export type CameraStatus = 'unavailable' | 'idle' | 'active' | 'error';

export interface CameraService {
  start(): Promise<void>;
  stop(): void;
  isActive(): boolean;
  getVideoElement(): HTMLVideoElement | null;
  getStatus(): CameraStatus;
}