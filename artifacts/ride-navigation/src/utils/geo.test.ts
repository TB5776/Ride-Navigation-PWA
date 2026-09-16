import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveSpeedKmh,
  distanceBetweenMeters,
  formatDuration,
  formatSpeed,
  remainingRouteDistance,
} from './geo';

test('calculates a useful great-circle distance', () => {
  const distance = distanceBetweenMeters([0, 0], [0.001, 0]);
  assert.ok(distance > 100 && distance < 120);
});

test('derives speed from consecutive GPS points', () => {
  const speed = deriveSpeedKmh(
    { coordinate: [0, 0], timestamp: 0, accuracy: 5 },
    { coordinate: [0.001, 0], timestamp: 1000, accuracy: 5 },
  );
  assert.ok(speed !== null);
  assert.ok(speed > 350 && speed < 450);
});

test('rejects implausible GPS jumps and stale intervals', () => {
  assert.equal(
    deriveSpeedKmh(
      { coordinate: [0, 0], timestamp: 0, accuracy: 5 },
      { coordinate: [1, 1], timestamp: 1000, accuracy: 5 },
    ),
    null,
  );
  assert.equal(
    deriveSpeedKmh(
      { coordinate: [0, 0], timestamp: 0, accuracy: 5 },
      { coordinate: [0.001, 0], timestamp: 61_000, accuracy: 5 },
    ),
    null,
  );
});

test('tracks remaining route distance and route deviation', () => {
  const route: [number, number][] = [
    [0, 0],
    [0.001, 0],
    [0.002, 0],
  ];
  const progress = remainingRouteDistance([0.001, 0], route);
  assert.ok(progress.distanceMeters > 100 && progress.distanceMeters < 130);
  assert.equal(progress.offRoute, false);
  assert.equal(remainingRouteDistance([1, 1], route).offRoute, true);
});

test('formats user-facing navigation values', () => {
  assert.equal(formatSpeed(10, 'kmh'), '10');
  assert.equal(formatSpeed(10, 'mph'), '6.2');
  assert.equal(formatDuration(90), '2 min');
  assert.equal(formatDuration(3_900), '1h 5m');
});