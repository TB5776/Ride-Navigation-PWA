export type MapboxTokenSource = 'environment' | 'local' | 'none';

export interface MapboxConfiguration {
  token: string | null;
  source: MapboxTokenSource;
}

export interface MapboxConnectionResult {
  ok: boolean;
  message: string;
}

const STORAGE_KEY = 'ride-mapbox-public-token';
const environmentToken = normalizeToken(
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_MAPBOX_TOKEN,
);

export function normalizeToken(value: string | null | undefined) {
  const token = value?.trim() ?? '';
  return token || null;
}

export function isPublicMapboxToken(value: string | null | undefined) {
  return normalizeToken(value)?.startsWith('pk.') ?? false;
}

export function getStoredMapboxToken() {
  if (typeof window === 'undefined') return null;
  try {
    return normalizeToken(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function getMapboxConfiguration(): MapboxConfiguration {
  if (environmentToken) {
    return { token: environmentToken, source: 'environment' };
  }
  const localToken = getStoredMapboxToken();
  return localToken
    ? { token: localToken, source: 'local' }
    : { token: null, source: 'none' };
}

export function saveStoredMapboxToken(value: string) {
  const token = normalizeToken(value);
  if (!token) throw new Error('Enter a Mapbox public access token.');
  if (!isPublicMapboxToken(token)) {
    throw new Error('Mapbox public access tokens start with pk.');
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, token);
  } catch {
    throw new Error('This browser could not save the token locally.');
  }
}

export function clearStoredMapboxToken() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Clearing local configuration is best-effort in restricted browsers.
  }
}

export function mapboxResponseMessage(
  response: Response,
  fallback: string,
) {
  if (response.status === 401 || response.status === 403) {
    return 'Mapbox rejected this token. Check that it is a valid public token.';
  }
  return fallback;
}

export async function testMapboxConnection(
  token = getMapboxConfiguration().token,
): Promise<MapboxConnectionResult> {
  if (!token) {
    return {
      ok: false,
      message: "Mapbox isn't configured. Add a token before testing.",
    };
  }
  if (!isPublicMapboxToken(token)) {
    return {
      ok: false,
      message: 'Mapbox public access tokens start with pk.',
    };
  }
  try {
    const response = await fetch(
      `https://api.mapbox.com/styles/v1/mapbox/navigation-night-v1?access_token=${encodeURIComponent(token)}`,
    );
    if (response.ok) {
      return { ok: true, message: 'Connection successful. Mapbox is ready.' };
    }
    return {
      ok: false,
      message: mapboxResponseMessage(
        response,
        'Mapbox connection failed. Check your network and token settings.',
      ),
    };
  } catch {
    return {
      ok: false,
      message: 'Mapbox connection failed. Check your network connection.',
    };
  }
}