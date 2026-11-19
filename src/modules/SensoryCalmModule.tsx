import React, {useEffect, useRef, useState} from 'react';
import {CheckCircle2, HeartHandshake, Pause, Play, Sparkles, Volume2, Wind} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {MultimodalAlert} from '../types';
import {playAlertSound, speakText, stopSpeech, triggerVibration} from '../utils/multimodal';

interface SensoryCalmModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  patientName: string;
  caregiverName: string;
  onEmitAlert: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

type BreathingMode = 'box' | '478';

interface GroundingStep {
  count: number;
  sense: string;
  prompt: string;
}

const GROUNDING_STEPS: GroundingStep[] = [
  {count: 5, sense: 'See', prompt: 'Name 5 calm objects you can see around you right now.'},
  {count: 4, sense: 'Touch', prompt: 'Notice 4 things you can feel, like your chair or clothes.'},
  {count: 3, sense: 'Hear', prompt: 'Listen for 3 gentle sounds in the room.'},
  {count: 2, sense: 'Smell', prompt: 'Notice 2 scents nearby or take 2 slow breaths.'},
  {count: 1, sense: 'Safe Thought', prompt: 'Say 1 comforting fact: "I am safe right here, right now."'},
];

const EMOTION_TILES = [
  {id: 'calm', label: 'Feeling Calm', emoji: '😌', msg: 'I am feeling calm and comfortable.'},
  {id: 'overload', label: 'Sensory Overload', emoji: '🎧', msg: 'I am having sensory overload. Please lower lights and noise.'},
  {id: 'anxious', label: 'Anxious / Panic', emoji: '🫂', msg: 'I am feeling anxious. Please stay with me and speak slowly.'},
  {id: 'quiet', label: 'Need Quiet Space', emoji: '🌿', msg: 'I need a quiet space to rest for a few minutes.'},
  {id: 'confused', label: 'Feeling Confused', emoji: '🧭', msg: 'I feel confused. Please help guide me step by step.'},
  {id: 'comfort', label: 'Need Comfort', emoji: '💙', msg: 'I am feeling overwhelmed or sad and need support.'},
];

export const SensoryCalmModule: React.FC<SensoryCalmModuleProps> = ({
  onBack,
  voiceSpeed,
  patientName,
  caregiverName,
  onEmitAlert,
}) => {
  const [breathingMode, setBreathingMode] = useState<BreathingMode>('box');
  const [isBreathing, setIsBreathing] = useState(false);
  const [phaseLabel, setPhaseLabel] = useState<'Ready' | 'Inhale' | 'Hold' | 'Exhale' | 'Rest'>('Ready');
  const [phaseSeconds, setPhaseSeconds] = useState(4);
  const [voicePrompts, setVoicePrompts] = useState(true);

  const [groundingIdx, setGroundingIdx] = useState(0);
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);

  // Offline Brown/Pink Noise Soundscape via Web Audio API
  const [soundPlaying, setSoundPlaying] = useState(false);
  const [soundVolume, setSoundVolume] = useState(0.25);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const stopSoundscape = () => {
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      gainRef.current = null;
    }
    setSoundPlaying(false);
  };

  const toggleSoundscape = () => {
    if (soundPlaying) {
      stopSoundscape();
      return;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;

    // Generate soothing Brown Noise (warm rain / ocean)
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 2.8;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;

    const gain = ctx.createGain();
    gain.gain.value = soundVolume;
    gainRef.current = gain;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
    setSoundPlaying(true);
  };

  useEffect(() => {
    if (gainRef.current) {
      gainRef.current.gain.value = soundVolume;
    }
  }, [soundVolume]);

  useEffect(() => {
    return () => {
      stopSoundscape();
      stopSpeech();
    };
  }, []);

  // Guided Breathing Loop
  useEffect(() => {
    if (!isBreathing) {
      setPhaseLabel('Ready');
      return;
    }

    const phases: Array<{label: 'Inhale' | 'Hold' | 'Exhale' | 'Rest'; secs: number}> =
      breathingMode === 'box'
        ? [
            {label: 'Inhale', secs: 4},
            {label: 'Hold', secs: 4},
            {label: 'Exhale', secs: 4},
            {label: 'Rest', secs: 4},
          ]
        : [
            {label: 'Inhale', secs: 4},
            {label: 'Hold', secs: 7},
            {label: 'Exhale', secs: 8},
          ];

    let pIdx = 0;
    let remaining = phases[0].secs;
    setPhaseLabel(phases[0].label);
    setPhaseSeconds(remaining);
    if (voicePrompts) {
      speakText('Breathe in slowly.', Math.min(0.9, voiceSpeed));
    }

    const id = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        pIdx = (pIdx + 1) % phases.length;
        const nextPhase = phases[pIdx];
        remaining = nextPhase.secs;
        setPhaseLabel(nextPhase.label);
        setPhaseSeconds(remaining);
        triggerVibration(40);
        if (voicePrompts) {
          const phrase =
            nextPhase.label === 'Inhale'
              ? 'Breathe in.'
              : nextPhase.label === 'Hold'
                ? 'Hold gently.'
                : nextPhase.label === 'Exhale'
                  ? 'Breathe out slowly.'
                  : 'Rest.';
          speakText(phrase, Math.min(0.9, voiceSpeed));
        }
      } else {
        setPhaseSeconds(remaining);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [isBreathing, breathingMode, voicePrompts, voiceSpeed]);

  const orbScale =
    phaseLabel === 'Inhale' || phaseLabel === 'Hold'
      ? 'scale-110'
      : phaseLabel === 'Exhale'
        ? 'scale-90'
        : 'scale-100';

  const currentGrounding = GROUNDING_STEPS[groundingIdx];

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        moduleId="calm"
        title="Mental Health & Sensory Calm Studio"
        subtitle="10 · Mental, Emotional & Sensory Support"
        onBack={() => {
          stopSoundscape();
          stopSpeech();
          onBack();
        }}
        actionSlot={
          <button
            type="button"
            onClick={toggleSoundscape}
            className="btn-accent min-h-[56px] px-5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {soundPlaying ? (
              <>
                <Pause className="w-5 h-5" aria-hidden="true" />
                <span>Pause Rain Noise</span>
              </>
            ) : (
              <>
                <Wind className="w-5 h-5" aria-hidden="true" />
                <span>Play Calming Rain</span>
              </>
            )}
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Guided Breathing & Soundscape */}
        <div className="lg:col-span-6 surface-card rounded-2xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">Guided Breathing Pacer</h2>
              <p className="text-sm text-muted">For anxiety, panic, ADHD, or sensory overload</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBreathingMode('box')}
                className={`min-h-[48px] px-4 rounded-xl text-sm font-bold cursor-pointer ${
                  breathingMode === 'box' ? 'btn-accent' : 'surface-elevated'
                }`}
              >
                Box (4-4-4-4)
              </button>
              <button
                type="button"
                onClick={() => setBreathingMode('478')}
                className={`min-h-[48px] px-4 rounded-xl text-sm font-bold cursor-pointer ${
                  breathingMode === '478' ? 'btn-accent' : 'surface-elevated'
                }`}
              >
                Calm (4-7-8)
              </button>
            </div>
          </div>

          <div className="py-6 flex flex-col items-center justify-center">
            <div
              className={`w-48 h-48 sm:w-56 sm:h-56 rounded-full surface-elevated border-4 border-theme flex flex-col items-center justify-center transition-transform duration-1000 ease-in-out ${orbScale}`}
            >
              <p className="font-display text-3xl font-extrabold">{phaseLabel}</p>
              {isBreathing && (
                <p className="font-mono-nums text-4xl font-extrabold mt-2">{phaseSeconds}s</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setIsBreathing((v) => !v)}
              className="btn-accent flex-1 min-h-[60px] px-5 rounded-xl font-extrabold text-base flex items-center justify-center gap-2 cursor-pointer"
            >
              {isBreathing ? (
                <>
                  <Pause className="w-5 h-5" aria-hidden="true" />
                  <span>Stop Breathing Guide</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" aria-hidden="true" />
                  <span>Start Breathing Guide</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setVoicePrompts((v) => !v)}
              className="surface-elevated min-h-[60px] px-5 rounded-xl font-bold cursor-pointer"
            >
              Voice Cues: {voicePrompts ? 'ON' : 'OFF'}
            </button>
          </div>

          <div className="pt-4 border-t border-theme space-y-2">
            <div className="flex justify-between text-sm font-bold">
              <label htmlFor="calm-volume">Calming Rain Volume (Offline Synth)</label>
              <span className="font-mono-nums">{Math.round(soundVolume * 100)}%</span>
            </div>
            <input
              id="calm-volume"
              type="range"
              min="0.05"
              max="0.6"
              step="0.05"
              value={soundVolume}
              onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
              className="w-full h-3 accent-current cursor-pointer"
            />
          </div>
        </div>

        {/* Emotion Check-in & 5-4-3-2-1 Grounding */}
        <div className="lg:col-span-6 space-y-6">
          <div className="surface-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <HeartHandshake className="w-5 h-5" aria-hidden="true" />
              <h2 className="font-display text-xl font-bold">
                Emotion & Sensory Check-In ({patientName})
              </h2>
            </div>
            <p className="text-sm text-muted">
              Tap how you feel right now to speak it gently and notify {caregiverName}:
            </p>
            <div className="grid grid-cols-2 gap-3">
              {EMOTION_TILES.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => {
                    setSelectedEmotion(tile.id);
                    triggerVibration(70);
                    playAlertSound('select');
                    speakText(tile.msg, Math.min(0.95, voiceSpeed));
                    onEmitAlert({
                      title: `${patientName}: ${tile.label}`,
                      message: tile.msg,
                      severity: tile.id === 'overload' || tile.id === 'anxious' ? 'warning' : 'info',
                      flashScreen: false,
                    });
                  }}
                  className={`min-h-[76px] p-4 rounded-xl font-bold text-left flex items-center gap-3 cursor-pointer transition-transform active:scale-[0.98] ${
                    selectedEmotion === tile.id ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  <span className="text-3xl shrink-0" aria-hidden="true">
                    {tile.emoji}
                  </span>
                  <span className="font-display text-base leading-tight">{tile.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="surface-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" aria-hidden="true" />
                <h2 className="font-display text-xl font-bold">5-4-3-2-1 Grounding Exercise</h2>
              </div>
              <span className="font-mono-nums text-sm font-bold text-muted">
                Step {groundingIdx + 1} / {GROUNDING_STEPS.length}
              </span>
            </div>

            <div className="surface-elevated rounded-2xl p-5 space-y-2">
              <p className="font-display text-2xl font-extrabold">
                {currentGrounding.count} Things You Can {currentGrounding.sense}
              </p>
              <p className="text-base font-medium leading-relaxed">{currentGrounding.prompt}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => speakText(currentGrounding.prompt, Math.min(0.9, voiceSpeed))}
                className="surface-elevated min-h-[56px] px-5 rounded-xl font-bold flex items-center gap-2 cursor-pointer"
              >
                <Volume2 className="w-5 h-5" aria-hidden="true" />
                <span>Read Prompt</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = (groundingIdx + 1) % GROUNDING_STEPS.length;
                  setGroundingIdx(next);
                  triggerVibration(50);
                  speakText(GROUNDING_STEPS[next].prompt, Math.min(0.9, voiceSpeed));
                }}
                className="btn-accent flex-1 min-h-[56px] px-5 rounded-xl font-extrabold flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                <span>
                  {groundingIdx + 1 === GROUNDING_STEPS.length ? 'Restart Grounding' : 'Done · Next Sense'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
