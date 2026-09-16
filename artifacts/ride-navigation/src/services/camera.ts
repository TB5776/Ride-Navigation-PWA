import type { CameraService, CameraStatus } from '@/types/navigation';

export function createCameraService(): CameraService {
  let status: CameraStatus = 'idle';
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;

  return {
    async start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        status = 'unavailable';
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        await video.play();
        status = 'active';
      } catch {
        status = 'error';
      }
    },
    stop() {
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      video = null;
      status = 'idle';
    },
    isActive() {
      return status === 'active';
    },
    getVideoElement() {
      return video;
    },
    getStatus() {
      return status;
    },
  };
}