import type { Unit } from '@/types/navigation';

const EARTH_RADIUS_METERS = 6_371_000;

export function distanceBetweenMeters(
  first: [number, number],
  second: [number, number],
) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(second[1] - first[1]);
  const longitudeDelta = toRadians(second[0] - first[0]);
  const firstLatitude = toRadians(first[1]);
  const secondLatitude = toRadians(second[1]);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function deriveSpeedKmh(
  previous: { coordinate: [number, number]; timestamp: number; accuracy: number },
  next: { coordinate: [number, number]; timestamp: number; accuracy: number },
) {
  const seconds = (next.timestamp - previous.timestamp) / 1000;
  if (seconds <= 0 || seconds > 60) return null;
  const distance = distanceBetweenMeters(previous.coordinate, next.coordinate);
  const accuracyAllowance = Math.max(previous.accuracy, next.accuracy) * 2;
  if (distance > 1000 + accuracyAllowance) return null;
  return (distance / seconds) * 3.6;
}

export function formatDistance(meters: number, unit: Unit) {
  if (unit === 'mph') return `${(meters / 1609.344).toFixed(1)} mi`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatSpeed(speedKmh: number | null, unit: Unit) {
  if (speedKmh === null || !Number.isFinite(speedKmh) || speedKmh < 0) {
    return '—';
  }
  const converted = unit === 'mph' ? speedKmh * 0.621371 : speedKmh;
  return converted < 10 ? converted.toFixed(1) : Math.round(converted).toString();
}

export function nearestRoutePoint(
  position: [number, number],
  coordinates: [number, number][],
) {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  coordinates.forEach((coordinate, index) => {
    const distance = distanceBetweenMeters(position, coordinate);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });
  return { closestIndex, distanceMeters: closestDistance };
}

export function remainingRouteDistance(
  position: [number, number],
  coordinates: [number, number][],
) {
  if (coordinates.length < 2) {
    return { distanceMeters: 0, offRoute: false, closestIndex: 0 };
  }
  const nearest = nearestRoutePoint(position, coordinates);
  let distanceMeters = nearest.distanceMeters;
  for (let index = nearest.closestIndex; index < coordinates.length - 1; index += 1) {
    distanceMeters += distanceBetweenMeters(coordinates[index], coordinates[index + 1]);
  }
  return {
    distanceMeters,
    offRoute: nearest.distanceMeters > 100,
    closestIndex: nearest.closestIndex,
  };
}