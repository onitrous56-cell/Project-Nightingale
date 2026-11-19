import React, {useEffect, useRef, useState} from 'react';
import {
  Delete,
  Fingerprint,
  Play,
  RotateCcw,
  Square,
  Vibrate,
  Volume2,
} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {MultimodalAlert} from '../types';
import {playAlertSound, speakText, stopSpeech, triggerVibration} from '../utils/multimodal';

interface TactileBrailleModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  lowStimulationMode?: boolean;
  onEmitAlert?: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

// 6-dot Braille patterns ordered [dot1, dot2, dot3, dot4, dot5, dot6]
const BRAILLE_MAP: Record<string, number[]> = {
  A: [1, 0, 0, 0, 0, 0],
  B: [1, 1, 0, 0, 0, 0],
  C: [1, 0, 0, 1, 0, 0],
  D: [1, 0, 0, 1, 1, 0],
  E: [1, 0, 0, 0, 1, 0],
  F: [1, 1, 0, 1, 0, 0],
  G: [1, 1, 0, 1, 1, 0],
  H: [1, 1, 0, 0, 1, 0],
  I: [0, 1, 0, 1, 0, 0],
  J: [0, 1, 0, 1, 1, 0],
  K: [1, 0, 1, 0, 0, 0],
  L: [1, 1, 1, 0, 0, 0],
  M: [1, 0, 1, 1, 0, 0],
  N: [1, 0, 1, 1, 1, 0],
  O: [1, 0, 1, 0, 1, 0],
  P: [1, 1, 1, 1, 0, 0],
  Q: [1, 1, 1, 1, 1, 0],
  R: [1, 1, 1, 0, 1, 0],
  S: [0, 1, 1, 1, 0, 0],
  T: [0, 1, 1, 1, 1, 0],
  U: [1, 0, 1, 0, 0, 1],
  V: [1, 1, 1, 0, 0, 1],
  W: [0, 1, 0, 1, 1, 1],
  X: [1, 0, 1, 1, 0, 1],
  Y: [1, 0, 1, 1, 1, 1],
  Z: [1, 0, 1, 0, 1, 1],
  '0': [0, 1, 0, 1, 1, 0],
  '1': [1, 0, 0, 0, 0, 0],
  '2': [1, 1, 0, 0, 0, 0],
  '3': [1, 0, 0, 1, 0, 0],
  '4': [1, 0, 0, 1, 1, 0],
  '5': [1, 0, 0, 0, 1, 0],
  '6': [1, 1, 0, 1, 0, 0],
  '7': [1, 1, 0, 1, 1, 0],
  '8': [1, 1, 0, 0, 1, 0],
  '9': [0, 1, 0, 1, 0, 0],
  ' ': [0, 0, 0, 0, 0, 0],
};

const MORSE_MAP: Record<string, string> = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  '0': '-----',
  '1': '.----',
  '2': '..---',
  '3': '...--',
  '4': '....-',
  '5': '.....',
  '6': '-....',
  '7': '--...',
  '8': '---..',
  '9': '----.',
};

const REVERSE_MORSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MORSE_MAP).map(([char, code]) => [code, char])
);

const QUICK_CHIPS = ['HELP', 'WATER', 'YES', 'NO', 'PAIN', 'CALL'];

export const TactileBrailleModule: React.FC<TactileBrailleModuleProps> = ({
  onBack,
  voiceSpeed,
  lowStimulationMode = false,
  onEmitAlert,
}) => {
  const [text, setText] = useState<string>('HELP');
  const [playingMorse, setPlayingMorse] = useState<boolean>(false);
  const [activeCharIdx, setActiveCharIdx] = useState<number>(-1);
  const [activeSymbol, setActiveSymbol] = useState<'.' | '-' | null>(null);
  const [slowSpeed, setSlowSpeed] = useState<boolean>(true);

  // 2-Button Morse Tap Composer
  const [currentPattern, setCurrentPattern] = useState<string>('');
  const [composedText, setComposedText] = useState<string>('');

  const cancelPlaybackRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      cancelPlaybackRef.current = true;
      stopSpeech();
    };
  }, []);

  const stopPlayback = () => {
    cancelPlaybackRef.current = true;
    setPlayingMorse(false);
    setActiveCharIdx(-1);
    setActiveSymbol(null);
  };

  const playMorseSequence = async () => {
    const upper = text.toUpperCase().slice(0, 24);
    if (!upper.trim()) return;
    cancelPlaybackRef.current = false;
    setPlayingMorse(true);

    const dotMs = slowSpeed ? 160 : 95;
    const dashMs = dotMs * 3;
    const gapMs = dotMs * 1.4;

    for (let i = 0; i < upper.length; i++) {
      if (cancelPlaybackRef.current) break;
      const ch = upper[i];
      setActiveCharIdx(i);

      if (ch === ' ') {
        setActiveSymbol(null);
        await new Promise((r) => setTimeout(r, dotMs * 4));
        continue;
      }

      const code = MORSE_MAP[ch];
      if (!code) continue;

      for (const sym of code) {
        if (cancelPlaybackRef.current) break;
        const dur = sym === '.' ? dotMs : dashMs;
        setActiveSymbol(sym === '.' ? '.' : '-');
        playAlertSound('select');
        triggerVibration(dur);
        await new Promise((r) => setTimeout(r, dur + gapMs));
      }
      setActiveSymbol(null);
      await new Promise((r) => setTimeout(r, dotMs * 2));
    }

    setPlayingMorse(false);
    setActiveCharIdx(-1);
    setActiveSymbol(null);
  };

  const handleTapCell = (ch: string) => {
    const upper = ch.toUpperCase();
    const dots = BRAILLE_MAP[upper] || [0, 0, 0, 0, 0, 0];
    const activeCount = dots.filter(Boolean).length;
    triggerVibration(Array.from({length: Math.max(1, activeCount)}, () => 45));
    playAlertSound('select');
    speakText(upper === ' ' ? 'Space' : upper, voiceSpeed);
  };

  const handleTapMorseInput = (sym: '.' | '-') => {
    triggerVibration(sym === '.' ? 60 : 180);
    playAlertSound('select');
    setCurrentPattern((prev) => (prev.length < 6 ? prev + sym : prev));
  };

  const handleCommitMorseChar = () => {
    if (!currentPattern) {
      setComposedText((prev) => (prev.endsWith(' ') || prev.length === 0 ? prev : `${prev} `));
      return;
    }
    const decoded = REVERSE_MORSE_MAP[currentPattern] || '?';
    setComposedText((prev) => prev + decoded);
    setCurrentPattern('');
    speakText(decoded, voiceSpeed);
  };

  const cleanDisplayChars = text.toUpperCase().slice(0, 18).split('');
  const decodedPreview = currentPattern ? REVERSE_MORSE_MAP[currentPattern] || '?' : '—';

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        moduleId="tactile"
        title="Braille & Haptic Morse Studio"
        subtitle="16 · 6-Dot Braille Visualizer, Tactile Morse Pulses & 2-Switch Composer"
        onBack={() => {
          stopPlayback();
          stopSpeech();
          onBack();
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Text -> 6-Dot Braille + Morse Output */}
        <div className="lg:col-span-7 surface-card rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <Fingerprint className="w-5 h-5 text-[#00f5d4]" aria-hidden="true" />
              <span>6-Dot Braille &amp; Haptic Output</span>
            </h2>
            {lowStimulationMode && (
              <span className="text-xs font-bold text-emerald-400">
                Epilepsy-Safe Calm Highlight
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              maxLength={24}
              aria-label="Enter word for Braille and Morse"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Type word or tap preset..."
              className="surface-elevated flex-1 min-h-[52px] rounded-xl px-4 font-bold text-lg uppercase tracking-wide"
            />
            <button
              type="button"
              onClick={() => speakText(text || 'Ready', voiceSpeed)}
              className="surface-elevated min-h-[52px] px-4 rounded-xl font-bold flex items-center gap-2 cursor-pointer"
            >
              <Volume2 className="w-5 h-5" aria-hidden="true" />
              <span>Speak</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  setText(chip);
                  triggerVibration(45);
                  speakText(chip, voiceSpeed);
                }}
                className={`min-h-[42px] px-3.5 rounded-xl text-xs font-extrabold cursor-pointer ${
                  text.toUpperCase() === chip ? 'btn-accent' : 'surface-elevated'
                }`}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Interactive Braille Cells */}
          <div className="flex flex-wrap gap-3">
            {cleanDisplayChars.map((ch, idx) => {
              const dots = BRAILLE_MAP[ch] || [0, 0, 0, 0, 0, 0];
              const isActive = idx === activeCharIdx;
              const morse = MORSE_MAP[ch] || '';
              return (
                <button
                  key={`${ch}-${idx}`}
                  type="button"
                  onClick={() => handleTapCell(ch)}
                  className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-2 min-w-[68px] cursor-pointer transition-colors ${
                    isActive
                      ? 'btn-accent border-[#00f5d4]'
                      : 'surface-elevated border-theme'
                  }`}
                  aria-label={`Braille cell for ${ch === ' ' ? 'space' : ch}`}
                >
                  {/* 2 columns x 3 rows standard Braille layout */}
                  <div className="grid grid-cols-2 gap-1.5" aria-hidden="true">
                    {[0, 3, 1, 4, 2, 5].map((dotIdx) => (
                      <span
                        key={dotIdx}
                        className={`w-3.5 h-3.5 rounded-full border ${
                          dots[dotIdx]
                            ? isActive
                              ? 'bg-slate-950 border-slate-950'
                              : 'bg-current border-current'
                            : 'border-current/30 opacity-30'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="font-mono-nums text-sm font-extrabold">
                    {ch === ' ' ? '␣' : ch}
                  </span>
                  <span className="font-mono-nums text-[10px] opacity-80">{morse || ' '}</span>
                </button>
              );
            })}
          </div>

          {/* Play Haptic Morse Controls */}
          <div className="pt-2 border-t border-theme flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={playingMorse ? stopPlayback : playMorseSequence}
              className="btn-accent min-h-[54px] px-5 rounded-xl font-extrabold text-sm flex items-center gap-2 cursor-pointer"
            >
              {playingMorse ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              <span>{playingMorse ? 'Stop Haptic Morse' : 'Play Haptic Morse'}</span>
            </button>

            <button
              type="button"
              onClick={() => setSlowSpeed((s) => !s)}
              className="surface-elevated min-h-[54px] px-4 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer"
            >
              <Vibrate className="w-4 h-4" aria-hidden="true" />
              <span>Pace: {slowSpeed ? 'Slow (6 WPM)' : 'Medium (12 WPM)'}</span>
            </button>

            {activeSymbol && (
              <span className="surface-elevated px-4 py-2 rounded-xl font-mono-nums text-lg font-extrabold border-2 border-[#00f5d4]">
                Pulse: {activeSymbol === '.' ? 'SHORT (·)' : 'LONG (—)'}
              </span>
            )}
          </div>
        </div>

        {/* Right: 2-Button Morse Tap Composer */}
        <div className="lg:col-span-5 surface-card rounded-2xl p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="font-display text-xl font-bold">2-Button Tactile Morse Composer</h2>
            <p className="text-sm text-muted mt-0.5">
              Tap Dot (·) and Dash (—) to compose letters with physical haptic confirmation, then
              speak your message aloud.
            </p>
          </div>

          <div className="surface-elevated rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-muted">
              <span>Pattern Buffer: {currentPattern || 'Empty'}</span>
              <span>Matches: {decodedPreview}</span>
            </div>
            <p className="font-mono-nums text-2xl font-extrabold min-h-[36px] tracking-wide">
              {composedText || 'Tap dots & dashes below...'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleTapMorseInput('.')}
              className="btn-accent min-h-[74px] rounded-2xl font-display text-2xl font-extrabold cursor-pointer active:scale-95 transition-transform"
            >
              Dot ( · )
            </button>
            <button
              type="button"
              onClick={() => handleTapMorseInput('-')}
              className="surface-elevated border-2 border-theme min-h-[74px] rounded-2xl font-display text-2xl font-extrabold cursor-pointer active:scale-95 transition-transform"
            >
              Dash ( — )
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleCommitMorseChar}
              className="btn-accent min-h-[50px] rounded-xl text-xs font-extrabold cursor-pointer"
            >
              {currentPattern ? `Add "${decodedPreview}"` : 'Add Space'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (currentPattern) {
                  setCurrentPattern((p) => p.slice(0, -1));
                } else {
                  setComposedText((t) => t.slice(0, -1));
                }
              }}
              className="surface-elevated min-h-[50px] rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
            >
              <Delete className="w-4 h-4" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentPattern('');
                setComposedText('');
              }}
              className="surface-elevated min-h-[50px] rounded-xl text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Clear</span>
            </button>
          </div>

          <button
            type="button"
            disabled={!composedText.trim()}
            onClick={() => {
              const spoken = composedText.trim();
              if (!spoken) return;
              speakText(spoken, voiceSpeed);
              onEmitAlert?.({
                title: 'Tactile Morse Message',
                message: spoken,
                severity: 'info',
                flashScreen: false,
              });
            }}
            className="btn-accent w-full min-h-[56px] rounded-xl font-extrabold text-base flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Volume2 className="w-5 h-5" aria-hidden="true" />
            <span>Speak Composed Message</span>
          </button>
        </div>
      </div>
    </section>
  );
};
