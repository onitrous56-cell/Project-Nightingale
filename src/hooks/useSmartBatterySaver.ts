import {useEffect, useState} from 'react';

interface BatteryManagerLike extends EventTarget {
  charging: boolean;
  level: number;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

export interface SmartBatterySaverState {
  supported: boolean;
  levelPercent: number | null;
  charging: boolean;
  lowBatteryTriggered: boolean;
  batterySaverActive: boolean;
  manualForce: boolean;
  setManualForce: (next: boolean) => void;
}

const BATTERY_FORCE_KEY = 'ablebridge_battery_saver_force_v1';

export function useSmartBatterySaver(
  enabled: boolean,
  thresholdPercent = 20
): SmartBatterySaverState {
  const [supported, setSupported] = useState(false);
  const [levelPercent, setLevelPercent] = useState<number | null>(null);
  const [charging, setCharging] = useState<boolean>(true);
  const [manualForce, setManualForceState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BATTERY_FORCE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const setManualForce = (next: boolean) => {
    setManualForceState(next);
    try {
      localStorage.setItem(BATTERY_FORCE_KEY, next ? 'true' : 'false');
    } catch {
      // Ignore storage errors
    }
  };

  useEffect(() => {
    let batteryRef: BatteryManagerLike | null = null;
    let active = true;

    const nav = navigator as unknown as {
      getBattery?: () => Promise<BatteryManagerLike>;
    };

    if (typeof nav?.getBattery !== 'function') {
      setSupported(false);
      return;
    }

    const syncFromBattery = () => {
      if (!active || !batteryRef) return;
      setSupported(true);
      setLevelPercent(Math.round(batteryRef.level * 100));
      setCharging(Boolean(batteryRef.charging));
    };

    nav
      .getBattery()
      .then((bat) => {
        if (!active) return;
        batteryRef = bat;
        syncFromBattery();
        bat.addEventListener('levelchange', syncFromBattery);
        bat.addEventListener('chargingchange', syncFromBattery);
      })
      .catch(() => {
        if (active) setSupported(false);
      });

    return () => {
      active = false;
      if (batteryRef) {
        batteryRef.removeEventListener('levelchange', syncFromBattery);
        batteryRef.removeEventListener('chargingchange', syncFromBattery);
      }
    };
  }, []);

  const safeThreshold = Math.min(50, Math.max(5, Number(thresholdPercent) || 20));
  const lowBatteryTriggered = Boolean(
    enabled && supported && levelPercent !== null && !charging && levelPercent <= safeThreshold
  );
  const batterySaverActive = manualForce || lowBatteryTriggered;

  return {
    supported,
    levelPercent,
    charging,
    lowBatteryTriggered,
    batterySaverActive,
    manualForce,
    setManualForce,
  };
}
