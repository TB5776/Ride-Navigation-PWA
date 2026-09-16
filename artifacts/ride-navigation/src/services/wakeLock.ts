export interface WakeLockController {
  acquire(): Promise<boolean>;
  release(): Promise<void>;
  isHeld(): boolean;
  dispose(): Promise<void>;
}

export function createWakeLockController(): WakeLockController {
  let sentinel: WakeLockSentinel | null = null;

  return {
    async acquire() {
      if (!('wakeLock' in navigator)) return false;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        sentinel.addEventListener('release', () => {
          sentinel = null;
        });
        return true;
      } catch {
        return false;
      }
    },
    async release() {
      await sentinel?.release().catch(() => undefined);
      sentinel = null;
    },
    isHeld() {
      return Boolean(sentinel && !sentinel.released);
    },
    async dispose() {
      await this.release();
    },
  };
}