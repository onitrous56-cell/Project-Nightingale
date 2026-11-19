import {PatientProfile} from '../types';

export interface BackgroundGuardianStatus {
  wakeLockActive: boolean;
  notificationsGranted: boolean;
  nativeApkBridgeDetected: boolean;
  backgroundArmed: boolean;
}

interface AbleBridgeNativeWindow extends Window {
  AbleBridgeNative?: {
    startBackgroundGuardian?: (configJson: string) => void;
    stopBackgroundGuardian?: () => void;
  };
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
}

let wakeLockSentinel: WakeLockSentinel | null = null;

export function isNativeApkEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as AbleBridgeNativeWindow;
  return Boolean(
    win.AbleBridgeNative ||
      (win.Capacitor && typeof win.Capacitor.isNativePlatform === 'function' && win.Capacitor.isNativePlatform())
  );
}

export async function acquireGuardianWakeLock(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      return true;
    }
  } catch {
    // Wake Lock may fail if tab is hidden or battery saver is active
  }
  return false;
}

export async function releaseGuardianWakeLock(): Promise<void> {
  try {
    if (wakeLockSentinel) {
      await wakeLockSentinel.release();
      wakeLockSentinel = null;
    }
  } catch {
    wakeLockSentinel = null;
  }
}

export async function requestGuardianNotificationPermission(): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch {
    return false;
  }
}

export async function dispatchBackgroundSosNotification(
  title: string,
  body: string
): Promise<void> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      return;
    }
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, {
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: 'ablebridge-fall-sos',
          requireInteraction: true,
        });
        return;
      }
    }
    new Notification(title, {
      body,
      icon: '/pwa-192x192.png',
      tag: 'ablebridge-fall-sos',
    });
  } catch {
    // Ignore if notifications blocked in iframe
  }
}

export function syncNativeApkBackgroundConfig(profile: PatientProfile): void {
  const payload = {
    enabled: profile.backgroundGuardianEnabled,
    fallGThreshold: profile.fallGThreshold,
    inactivitySeconds: profile.inactivitySeconds,
    patientName: profile.fullName,
    caregiverName: profile.caregiverName,
    caregiverPhone: profile.caregiverPhone,
    bloodType: profile.bloodType,
    allergiesAndNotes: profile.allergiesAndNotes,
    updatedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem('ablebridge_apk_guardian_service_v1', JSON.stringify(payload));
  } catch {
    // Ignore storage issues
  }

  if (typeof window !== 'undefined') {
    const win = window as AbleBridgeNativeWindow;
    if (win.AbleBridgeNative) {
      if (profile.backgroundGuardianEnabled) {
        win.AbleBridgeNative.startBackgroundGuardian?.(JSON.stringify(payload));
      } else {
        win.AbleBridgeNative.stopBackgroundGuardian?.();
      }
    }
    if ('BroadcastChannel' in window) {
      try {
        const ch = new BroadcastChannel('ablebridge-guardian');
        ch.postMessage({type: 'CONFIG_UPDATED', payload});
        ch.close();
      } catch {
        // Ignore
      }
    }
  }
}
