import React from 'react';
import {Wifi, WifiOff} from 'lucide-react';
import {useFirebase} from '../contexts/FirebaseContext';

export const OfflineIndicator: React.FC = () => {
  const {browserOnline, manualOfflineMode, setManualOfflineMode, isOfflineMode} = useFirebase();

  if (!isOfflineMode) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 w-full"
    >
      <div className="surface-card rounded-2xl px-4 py-3 border-2 border-[#ff5500] flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ff5500] text-[#03050a] flex items-center justify-center shrink-0">
            <WifiOff className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-display text-sm sm:text-base font-extrabold">
              {!browserOnline
                ? 'Offline Mode Active (No Internet Connection)'
                : 'Dedicated Offline Mode Enabled'}
            </p>
            <p className="text-xs text-muted">
              Vision, Sign, Sound Radar, AAC, Routines, Cognitive Memory, Dyslexia Lens, Motor, Fall
              Guardian, Calm &amp; Stress Tracker work 100% locally. Cloud Sync, Google Maps tiles &amp;
              Cloud AI use offline fallbacks.
            </p>
          </div>
        </div>

        {manualOfflineMode && browserOnline && (
          <button
            type="button"
            onClick={() => setManualOfflineMode(false)}
            className="btn-accent min-h-[44px] px-4 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <Wifi className="w-4 h-4" aria-hidden="true" />
            <span>Reconnect Cloud Sync</span>
          </button>
        )}
      </div>
    </div>
  );
};
