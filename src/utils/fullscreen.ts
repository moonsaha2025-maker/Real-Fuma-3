type FullscreenDoc = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElem = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type OrientationLockCapable = ScreenOrientation & {
  lock?: (orientation: 'landscape' | 'portrait' | 'any') => Promise<void>;
  unlock?: () => void;
};

export function isFullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDoc;
  const root = document.documentElement as FullscreenElem;
  const enabled =
    doc.fullscreenEnabled !== undefined
      ? doc.fullscreenEnabled
      : doc.webkitFullscreenEnabled;
  if (enabled === false) return false;
  return Boolean(root.requestFullscreen || root.webkitRequestFullscreen);
}

export function isInFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as FullscreenDoc;
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

function tryLockLandscapeOnMobile(): void {
  if (typeof window === 'undefined') return;
  const isTouchDevice =
    window.matchMedia?.('(pointer: coarse)').matches ||
    navigator.maxTouchPoints > 0;
  if (!isTouchDevice) return;

  const orientation = window.screen?.orientation as OrientationLockCapable | undefined;
  if (orientation?.lock) {
    Promise.resolve(orientation.lock('landscape')).catch(() => {
      // Orientation lock is ignored on unsupported browsers/desktops
    });
  }
}

export async function requestAppFullscreen(
  target?: HTMLElement | null,
): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  if (isInFullscreen()) return true;
  if (!isFullscreenSupported()) return false;

  const el = (target ?? document.documentElement) as FullscreenElem;
  try {
    if (el.requestFullscreen) {
      try {
        await el.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        await el.requestFullscreen();
      }
      tryLockLandscapeOnMobile();
      return true;
    }
    if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
      tryLockLandscapeOnMobile();
      return true;
    }
  } catch {
    // Blocked when called without a recent user gesture or disallowed by host iframe
    return false;
  }
  return false;
}

export async function exitAppFullscreen(): Promise<void> {
  if (typeof document === 'undefined' || !isInFullscreen()) return;
  const doc = document as FullscreenDoc;
  try {
    if (doc.exitFullscreen) {
      await doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // Ignore exit errors
  }

  const orientation = window.screen?.orientation as OrientationLockCapable | undefined;
  try {
    orientation?.unlock?.();
  } catch {
    // Ignore unlock errors
  }
}

export function subscribeFullscreenChange(
  callback: (active: boolean) => void,
): () => void {
  if (typeof document === 'undefined') return () => {};
  const handler = () => callback(isInFullscreen());
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
  };
}
