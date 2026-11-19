import React from 'react';
import {
  Gauge,
  Globe,
  Home,
  LayoutGrid,
  Lock,
  LogOut,
  ShieldCheck,
  Type,
  UserCircle2,
} from 'lucide-react';
import {useFirebase} from '../contexts/FirebaseContext';
import {LanguageCode, ModuleId, TextSize, VoiceSpeed} from '../types';
import {getLanguageMeta, t} from '../utils/i18n';
import {PWAInstallButton} from './PWAInstallButton';

interface AccessibilityTopBarProps {
  activeModule: ModuleId;
  onGoHome: () => void;
  onOpenHomeAuth: () => void;
  onOpenCaregiverPortal: () => void;
  textSize: TextSize;
  onToggleTextSize: () => void;
  voiceSpeed: VoiceSpeed;
  onCycleVoiceSpeed: () => void;
  onOpenSettings: () => void;
  language?: LanguageCode;
}

export const AccessibilityTopBar: React.FC<AccessibilityTopBarProps> = ({
  activeModule,
  onGoHome,
  onOpenHomeAuth,
  onOpenCaregiverPortal,
  textSize,
  onToggleTextSize,
  voiceSpeed,
  onCycleVoiceSpeed,
  onOpenSettings,
  language = 'en-US',
}) => {
  const {user, signOutUser} = useFirebase();
  const langMeta = getLanguageMeta(language);

  return (
    <header
      className="sticky top-0 z-30 surface-card border-x-0 border-t-0 px-2.5 sm:px-6 py-2"
      aria-label="Global Accessibility Settings Bar"
    >
      <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onGoHome}
            className={`min-h-[48px] sm:min-h-[52px] px-2.5 sm:px-3 rounded-xl font-bold flex items-center gap-1.5 sm:gap-2 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeModule === 'dashboard' ? 'btn-accent' : 'surface-elevated'
            }`}
            aria-label="Open Assistive Toolkit Dashboard"
            title="Open Assistive Toolkit"
          >
            <Home className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span className="font-display text-sm sm:text-base tracking-tight">AbleBridge</span>
          </button>

          <button
            type="button"
            onClick={onGoHome}
            className={`hidden md:flex min-h-[52px] px-3 rounded-xl font-bold text-sm items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeModule === 'dashboard' ? 'btn-accent' : 'surface-elevated'
            }`}
            aria-label="Open Assistive Modules Grid"
          >
            <LayoutGrid className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t(language, 'toolkit')}</span>
          </button>
        </div>

        <nav
          aria-label="Scrollable Accessibility Controls"
          className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar snap-x snap-mandatory py-0.5 pr-1 touch-pan-x"
        >
          <button
            type="button"
            onClick={onToggleTextSize}
            className="snap-start surface-elevated min-h-[48px] sm:min-h-[52px] px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            aria-label={`Text Size: ${textSize === 'xl' ? 'XL' : 'Normal'}. Tap to toggle.`}
          >
            <Type className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{textSize === 'xl' ? 'XL' : 'Normal'}</span>
          </button>

          <button
            type="button"
            onClick={onCycleVoiceSpeed}
            className="snap-start surface-elevated min-h-[48px] sm:min-h-[52px] px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            aria-label={`Voice Speed: ${voiceSpeed}x. Tap to change.`}
          >
            <Gauge className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="font-mono-nums">{voiceSpeed.toFixed(1)}x</span>
          </button>

          <button
            type="button"
            onClick={onOpenCaregiverPortal}
            className={`snap-start min-h-[48px] sm:min-h-[52px] px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              activeModule === 'caregiver-portal' ? 'btn-accent' : 'surface-elevated'
            }`}
            aria-label="Open Dedicated Caregiver Data & Remote Tracker Portal"
          >
            <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t(language, 'caregiverPortal')}</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="snap-start surface-elevated min-h-[48px] sm:min-h-[52px] px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            aria-label="Open PIN-Locked Caregiver Settings"
          >
            <Lock className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t(language, 'settings')}</span>
            <span className="inline-flex items-center gap-0.5 text-[11px] font-mono-nums opacity-80">
              <Globe className="w-3 h-3" aria-hidden="true" />
              {langMeta.shortTag}
            </span>
          </button>

          {user ? (
            <button
              type="button"
              onClick={signOutUser}
              className="snap-start surface-elevated min-h-[48px] sm:min-h-[52px] px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title={`Signed in: ${user.email || user.displayName}`}
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t(language, 'signOut')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenHomeAuth}
              className="snap-start surface-elevated min-h-[48px] sm:min-h-[52px] px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t(language, 'account')}</span>
            </button>
          )}

          <div className="snap-start shrink-0">
            <PWAInstallButton />
          </div>
        </nav>
      </div>
    </header>
  );
};
