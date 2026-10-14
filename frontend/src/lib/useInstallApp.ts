import { useCallback, useEffect, useState } from 'react';

/** Chromium's deferred install prompt (not in TS DOM lib). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

declare global {
  interface Navigator {
    standalone?: boolean;
  }
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
  } catch {
    /* matchMedia unavailable — fall through */
  }
  return window.navigator.standalone === true;
}

/** iOS Safari never fires beforeinstallprompt — detect for the manual guide. */
export function detectIOS(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ reports as MacIntel with touch points.
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return false;
}

export interface InstallAppState {
  /** Deferred prompt stashed — install can be triggered (Chromium/Android/Windows). */
  canInstall: boolean;
  /** Already running installed (standalone/fullscreen/navigator.standalone). */
  isInstalled: boolean;
  /** iOS device needing the manual Share → Add to Home Screen guide. */
  isIOS: boolean;
  /** Trigger the stashed prompt. User gesture only — never auto-called. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

export function useInstallApp(): InstallAppState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => detectStandalone());
  const [isIOS] = useState<boolean>(() => detectIOS());

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      // Stash for later user gesture; suppress the automatic mini-infobar.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferred(null);
    };
    const onDisplayChange = () => setIsInstalled(detectStandalone());
    let mqStandalone: MediaQueryList | null = null;
    let mqFullscreen: MediaQueryList | null = null;
    try {
      mqStandalone = window.matchMedia('(display-mode: standalone)');
      mqFullscreen = window.matchMedia('(display-mode: fullscreen)');
      mqStandalone.addEventListener('change', onDisplayChange);
      mqFullscreen.addEventListener('change', onDisplayChange);
    } catch {
      /* older browsers — appinstalled + initial check still apply */
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      try {
        mqStandalone?.removeEventListener('change', onDisplayChange);
        mqFullscreen?.removeEventListener('change', onDisplayChange);
      } catch {
        /* noop */
      }
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return 'unavailable' as const;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferred(null);
        setIsInstalled(detectStandalone());
      }
      return choice.outcome;
    } catch {
      return 'dismissed' as const;
    }
  }, [deferred]);

  return {
    canInstall: deferred !== null && !isInstalled,
    isInstalled,
    isIOS,
    promptInstall,
  };
}
