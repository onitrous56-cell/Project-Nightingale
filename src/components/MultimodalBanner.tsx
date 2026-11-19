import React from 'react';
import {AlertTriangle, BellRing, Info, X} from 'lucide-react';
import {MultimodalAlert} from '../types';

interface MultimodalBannerProps {
  alert: MultimodalAlert | null;
  onDismiss: () => void;
}

export const MultimodalBanner: React.FC<MultimodalBannerProps> = ({alert, onDismiss}) => {
  if (!alert) return null;

  const isEmergency = alert.severity === 'emergency';
  const isWarning = alert.severity === 'warning';

  const containerStyle = isEmergency
    ? 'bg-red-600 text-white border-white'
    : isWarning
      ? 'bg-[#ff5500] text-[#03050a] border-[#03050a]'
      : 'btn-accent border-transparent';

  return (
    <>
      {alert.flashScreen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-50 pointer-events-none animate-alert-border"
        />
      )}
      <div
        role="alert"
        aria-live="assertive"
        className={`fixed bottom-24 right-4 left-4 md:left-auto md:w-[440px] z-50 rounded-2xl border-2 p-4 shadow-2xl flex items-start gap-3 ${containerStyle}`}
      >
        <div className="pt-0.5 shrink-0">
          {isEmergency ? (
            <AlertTriangle className="w-6 h-6" aria-hidden="true" />
          ) : isWarning ? (
            <BellRing className="w-6 h-6" aria-hidden="true" />
          ) : (
            <Info className="w-6 h-6" aria-hidden="true" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-base leading-snug">{alert.title}</p>
          <p className="text-sm font-medium mt-1 opacity-95">{alert.message}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[48px] min-w-[48px] rounded-xl flex items-center justify-center bg-black/15 hover:bg-black/25 cursor-pointer shrink-0"
          aria-label="Dismiss alert"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </>
  );
};
