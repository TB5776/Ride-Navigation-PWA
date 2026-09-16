import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearStoredMapboxToken,
  getStoredMapboxToken,
  isPublicMapboxToken,
  saveStoredMapboxToken,
  testMapboxConnection,
} from './mapboxConfig';

test('recognizes only public Mapbox token prefixes', () => {
  assert.equal(isPublicMapboxToken('pk.example'), true);
  assert.equal(isPublicMapboxToken(' pk.example '), true);
  assert.equal(isPublicMapboxToken('sk.example'), false);
  assert.equal(isPublicMapboxToken(''), false);
});

test('saves and clears a token locally without exposing it through the service', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    },
  });

  saveStoredMapboxToken(' pk.local-test ');
  assert.equal(getStoredMapboxToken(), 'pk.local-test');
  clearStoredMapboxToken();
  assert.equal(getStoredMapboxToken(), null);
});

test('reports valid, invalid, and missing connection states', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  await assert.doesNotReject(async () => {
    const result = await testMapboxConnection('pk.valid-test');
    assert.equal(result.ok, true);
  });

  globalThis.fetch = async () => new Response('{}', { status: 401 });
  const invalid = await testMapboxConnection('pk.invalid-test');
  assert.equal(invalid.ok, false);
  assert.match(invalid.message, /rejected/i);

  const missing = await testMapboxConnection(null);
  assert.equal(missing.ok, false);
  assert.match(missing.message, /isn't configured/i);
  globalThis.fetch = originalFetch;
});