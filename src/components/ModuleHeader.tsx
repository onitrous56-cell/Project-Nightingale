import React from 'react';
import {ArrowLeft} from 'lucide-react';
import {FunctionalModuleId, LanguageCode} from '../types';
import {getLocalizedModuleMeta, t, useAppLanguage} from '../utils/i18n';

interface ModuleHeaderProps {
  moduleId?: FunctionalModuleId;
  title: string;
  subtitle: string;
  language?: LanguageCode;
  onBack: () => void;
  actionSlot?: React.ReactNode;
}

export const ModuleHeader: React.FC<ModuleHeaderProps> = ({
  moduleId,
  title,
  subtitle,
  language,
  onBack,
  actionSlot,
}) => {
  const activeLang = useAppLanguage(language);
  const backLabel = t(activeLang, 'back');
  const localizedMeta = moduleId ? getLocalizedModuleMeta(activeLang, moduleId) : null;
  const displayTitle = localizedMeta ? localizedMeta.title : title;
  const numPrefix = subtitle.match(/^\d{2}/)?.[0];
  const displaySubtitle = localizedMeta
    ? numPrefix
      ? `${numPrefix} · ${localizedMeta.domain}`
      : localizedMeta.domain
    : subtitle;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-theme">
      <div className="flex items-start sm:items-center gap-3 sm:gap-4">
        <button
          type="button"
          onClick={onBack}
          className="surface-elevated min-h-[56px] min-w-[56px] px-4 rounded-xl font-bold flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-transform active:scale-[0.98]"
          aria-label={backLabel}
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          <span className="hidden sm:inline">{backLabel}</span>
        </button>
        <div>
          <p className="text-sm font-bold text-muted">{displaySubtitle}</p>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
            {displayTitle}
          </h1>
        </div>
      </div>
      {actionSlot && <div className="flex items-center gap-3 shrink-0">{actionSlot}</div>}
    </div>
  );
};
