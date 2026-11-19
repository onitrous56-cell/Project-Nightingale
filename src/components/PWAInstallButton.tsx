import React, {useState} from 'react';
import {Download, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="btn-accent min-h-[48px] px-4 rounded-xl font-semibold text-sm flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-transform active:scale-[0.98]"
        aria-label="Install AbleBridge App"
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="surface-elevated min-h-[48px] px-4 rounded-xl font-semibold text-sm flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          <span>Install</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="surface-card w-full max-w-sm rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-4">
                <h3 id="ios-install-title" className="text-xl font-bold font-display">
                  Install on iPhone or iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="surface-elevated min-h-[48px] min-w-[48px] rounded-xl flex items-center justify-center cursor-pointer"
                  aria-label="Close install guide"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <ol className="mt-4 space-y-3 text-base text-muted list-decimal list-inside">
                <li>Tap the <strong>Share</strong> button in your Safari toolbar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Tap <strong>Add</strong> for offline exhibition & daily access.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="btn-accent mt-6 w-full min-h-[56px] rounded-xl font-bold text-base cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
