import type { DeviceCapabilities } from '@/types/navigation';

function canCreateWebGlContext() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') || canvas.getContext('webgl'),
    );
  } catch {
    return false;
  }
}

export function detectDeviceCapabilities(): DeviceCapabilities {
  const userAgent = navigator.userAgent.toLowerCase();
  const hasWebGPU = 'gpu' in navigator;
  const hasCamera =
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    Boolean(document.createElement('video').canPlayType);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return {
    isIOS: /iphone|ipad|ipod/.test(userAgent),
    isAndroid: /android/.test(userAgent),
    isStandalone,
    isSecureContext: window.isSecureContext,
    hasWebGPU,
    hasWebGL: canCreateWebGlContext(),
    hasCamera,
    hasGeolocation: 'geolocation' in navigator,
    hasWakeLock: 'wakeLock' in navigator,
    supportsAdvancedVision: hasWebGPU && hasCamera,
  };
}