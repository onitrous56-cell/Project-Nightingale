import React, {useEffect, useState} from 'react';
import {AlertOctagon, Plus, Trash2, Volume2} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {AACTile, LanguageCode, MultimodalAlert} from '../types';
import {
  getLocalizedAACTiles,
  getLocalizedModuleMeta,
  t,
  useAppLanguage,
} from '../utils/i18n';
import {playAlertSound, speakText, triggerVibration} from '../utils/multimodal';

interface AACBoardModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  language?: LanguageCode;
  onEmitAlert: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

const STORAGE_KEY = 'ablebridge_aac_custom_tiles_v1';

const EMOJI_CHOICES = [
  '😊',
  '🎧',
  '💊',
  '🏠',
  '📞',
  '🛏️',
  '🥶',
  '🥵',
  '📖',
  '🚌',
  '🥤',
  '🍎',
  '❤️',
  '👋',
  '✍️',
  '🔔',
];

export const AACBoardModule: React.FC<AACBoardModuleProps> = ({
  onBack,
  voiceSpeed,
  language,
  onEmitAlert,
}) => {
  const activeLang = useAppLanguage(language);
  const moduleMeta = getLocalizedModuleMeta(activeLang, 'aac');

  const [customTiles, setCustomTiles] = useState<AACTile[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? (JSON.parse(saved) as AACTile[]) : [];
    } catch {
      return [];
    }
  });
  const [phraseQueue, setPhraseQueue] = useState<string[]>([]);
  const [activeTileId, setActiveTileId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('😊');

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customTiles));
    } catch {
      // Ignore storage quota errors
    }
  }, [customTiles]);

  const defaultTiles = getLocalizedAACTiles(activeLang);
  const allTiles: AACTile[] = [...defaultTiles, ...customTiles];

  const handleTileTap = (tile: AACTile) => {
    setActiveTileId(tile.id);
    setPhraseQueue((prev) => [...prev.slice(-5), tile.label]);
    triggerVibration(90);
    playAlertSound('select');
    speakText(tile.phrase, voiceSpeed, {lang: activeLang});
    setTimeout(() => setActiveTileId((cur) => (cur === tile.id ? null : cur)), 700);
  };

  const handleEmergencyAlert = () => {
    const emergencyMsg = t(activeLang, 'aacEmergencyBar');
    triggerVibration([300, 100, 300, 100, 500]);
    playAlertSound('sos');
    speakText(emergencyMsg, Math.max(0.9, voiceSpeed), {lang: activeLang});
    onEmitAlert({
      title: 'AAC EMERGENCY ALERT',
      message: emergencyMsg,
      severity: 'emergency',
      flashScreen: true,
    });
  };

  const handleAddTile = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const tile: AACTile = {
      id: `custom-${Date.now()}`,
      label: trimmed,
      emoji: newEmoji,
      phrase: trimmed,
      isCustom: true,
    };
    setCustomTiles((prev) => [...prev, tile]);
    setNewLabel('');
    setShowAddForm(false);
    triggerVibration(70);
    speakText(trimmed, voiceSpeed, {lang: activeLang});
  };

  const handleDeleteCustom = (id: string) => {
    setCustomTiles((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <ModuleHeader
        title={moduleMeta.title}
        subtitle={`04 · ${moduleMeta.domain}`}
        language={activeLang}
        onBack={onBack}
        actionSlot={
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="btn-accent min-h-[56px] px-5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
            <span>{t(activeLang, 'addCustomTile')}</span>
          </button>
        }
      />

      {/* Pinned Red Emergency Alert Bar */}
      <button
        type="button"
        onClick={handleEmergencyAlert}
        className="w-full min-h-[68px] rounded-2xl bg-red-600 hover:bg-red-700 text-white border-2 border-yellow-300 px-6 py-4 font-display text-xl sm:text-2xl font-extrabold flex items-center justify-center gap-3 shadow-lg cursor-pointer transition-transform active:scale-[0.99]"
      >
        <AlertOctagon className="w-7 h-7 shrink-0" aria-hidden="true" />
        <span>{t(activeLang, 'aacEmergencyBar')}</span>
      </button>

      {/* Add Custom Tile Form */}
      {showAddForm && (
        <form onSubmit={handleAddTile} className="surface-card rounded-2xl p-5 space-y-4">
          <h2 className="font-display text-xl font-bold">{t(activeLang, 'addCustomTile')}</h2>
          <div className="space-y-2">
            <label htmlFor="custom-aac-phrase" className="block text-sm font-bold">
              Phrase to Speak
            </label>
            <input
              id="custom-aac-phrase"
              type="text"
              required
              maxLength={40}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g., Call my sister"
              className="surface-elevated w-full min-h-[56px] rounded-xl px-4 text-base font-bold"
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold">Choose Icon</p>
            <div className="grid grid-cols-8 sm:grid-cols-16 gap-2">
              {EMOJI_CHOICES.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setNewEmoji(emoji)}
                  className={`min-h-[48px] rounded-xl text-2xl flex items-center justify-center cursor-pointer ${
                    newEmoji === emoji ? 'btn-accent' : 'surface-elevated'
                  }`}
                  aria-label={`Select emoji ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="btn-accent min-h-[56px] px-6 rounded-xl font-bold cursor-pointer"
            >
              {t(activeLang, 'addCustomTile')}
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="surface-elevated min-h-[56px] px-6 rounded-xl font-bold cursor-pointer"
            >
              {t(activeLang, 'cancel')}
            </button>
          </div>
        </form>
      )}

      {/* Sentence Strip */}
      <div className="surface-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-muted">{t(activeLang, 'spokenPhraseStrip')}</p>
          <p className="text-lg font-bold truncate">
            {phraseQueue.length > 0 ? phraseQueue.join(' · ') : t(activeLang, 'tapTileHint')}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => speakText(phraseQueue.join('. '), voiceSpeed, {lang: activeLang})}
            disabled={phraseQueue.length === 0}
            className="btn-accent min-h-[56px] px-4 rounded-xl font-bold flex items-center gap-2 cursor-pointer"
          >
            <Volume2 className="w-5 h-5" aria-hidden="true" />
            <span>{t(activeLang, 'speakAll')}</span>
          </button>
          <button
            type="button"
            onClick={() => setPhraseQueue([])}
            className="surface-elevated min-h-[56px] px-4 rounded-xl font-bold cursor-pointer"
          >
            {t(activeLang, 'clear')}
          </button>
        </div>
      </div>

      {/* AAC Tile Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {allTiles.map((tile) => {
          const isActive = activeTileId === tile.id;
          return (
            <div key={tile.id} className="relative">
              <button
                type="button"
                onClick={() => handleTileTap(tile)}
                className={`w-full min-h-[128px] rounded-2xl p-4 flex flex-col items-center justify-center gap-2.5 text-center cursor-pointer transition-transform active:scale-[0.97] ${
                  isActive ? 'btn-accent ring-4 ring-yellow-300' : 'surface-card'
                }`}
              >
                <span className="text-4xl sm:text-5xl" aria-hidden="true">
                  {tile.emoji}
                </span>
                <span className="font-display text-lg font-extrabold leading-tight">
                  {tile.label}
                </span>
              </button>
              {tile.isCustom && (
                <button
                  type="button"
                  onClick={() => handleDeleteCustom(tile.id)}
                  className="absolute top-2 right-2 w-10 h-10 rounded-lg bg-red-600 text-white flex items-center justify-center cursor-pointer"
                  aria-label={`Delete custom tile ${tile.label}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
