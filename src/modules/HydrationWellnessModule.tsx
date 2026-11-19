import React, {useEffect, useState} from 'react';
import {
  BellRing,
  CheckCircle2,
  Droplets,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  StretchHorizontal,
  Volume2,
} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {MultimodalAlert} from '../types';
import {playAlertSound, speakText, stopSpeech, triggerVibration} from '../utils/multimodal';
import {getLocalCalendarDateKey} from '../utils/patientProfile';

interface HydrationWellnessModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  onEmitAlert: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

const HYDRATION_STORAGE_KEY = 'ablebridge_hydration_v1';

interface StoredHydration {
  dateKey: string;
  intakeMl: number;
  goalMl: number;
  reminderMinutes: number;
  logs: Array<{id: string; amountMl: number; timeLabel: string}>;
}

function loadHydrationState(): StoredHydration {
  const today = getLocalCalendarDateKey();
  try {
    const raw = localStorage.getItem(HYDRATION_STORAGE_KEY);
    if (!raw) {
      return {dateKey: today, intakeMl: 250, goalMl: 2000, reminderMinutes: 60, logs: []};
    }
    const parsed = JSON.parse(raw) as Partial<StoredHydration>;
    const sameDay = parsed.dateKey === today;
    return {
      dateKey: today,
      intakeMl: sameDay && typeof parsed.intakeMl === 'number' ? parsed.intakeMl : 0,
      goalMl: typeof parsed.goalMl === 'number' ? parsed.goalMl : 2000,
      reminderMinutes: typeof parsed.reminderMinutes === 'number' ? parsed.reminderMinutes : 60,
      logs: sameDay && Array.isArray(parsed.logs) ? parsed.logs : [],
    };
  } catch {
    return {dateKey: today, intakeMl: 0, goalMl: 2000, reminderMinutes: 60, logs: []};
  }
}

const GENTLE_STRETCHES = [
  {
    id: 'neck',
    title: 'Gentle Neck Side Tilt',
    durationSec: 20,
    instruction:
      'Sit tall and drop your shoulders. Slowly tilt your right ear toward your right shoulder for 10 seconds, then switch gently to the left side.',
  },
  {
    id: 'wrist',
    title: 'Wrist & Finger Release',
    durationSec: 20,
    instruction:
      'Extend both hands forward comfortably. Spread your fingers wide for 5 seconds, then curl into a soft fist and rotate your wrists slowly.',
  },
  {
    id: 'shoulder',
    title: 'Seated Shoulder Rolls',
    durationSec: 20,
    instruction:
      'Inhale slowly as you lift both shoulders up toward your ears, then roll them smoothly back and down while exhaling.',
  },
];

export const HydrationWellnessModule: React.FC<HydrationWellnessModuleProps> = ({
  onBack,
  voiceSpeed,
  onEmitAlert,
}) => {
  const [state, setState] = useState<StoredHydration>(loadHydrationState);
  const [secondsToNextDrink, setSecondsToNextDrink] = useState<number>(
    () => loadHydrationState().reminderMinutes * 60
  );
  const [activeStretchIdx, setActiveStretchIdx] = useState<number>(0);
  const [stretchRunning, setStretchRunning] = useState<boolean>(false);
  const [stretchSecondsLeft, setStretchSecondsLeft] = useState<number>(
    GENTLE_STRETCHES[0].durationSec
  );

  useEffect(() => {
    try {
      localStorage.setItem(HYDRATION_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage errors
    }
  }, [state]);

  // Drink-water countdown timer
  useEffect(() => {
    if (state.reminderMinutes <= 0) return;
    const id = window.setInterval(() => {
      setSecondsToNextDrink((prev) => {
        if (prev <= 1) {
          playAlertSound('chime');
          triggerVibration([120, 60, 120]);
          speakText('Gentle hydration reminder: please drink a small glass of water now.', voiceSpeed);
          onEmitAlert({
            title: 'Hydration Reminder',
            message: 'Time for a comforting sip or glass of water.',
            severity: 'info',
            flashScreen: false,
          });
          return state.reminderMinutes * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [onEmitAlert, state.reminderMinutes, voiceSpeed]);

  // Guided stretch countdown
  useEffect(() => {
    if (!stretchRunning) return;
    const id = window.setInterval(() => {
      setStretchSecondsLeft((prev) => {
        if (prev <= 1) {
          setStretchRunning(false);
          playAlertSound('chime');
          triggerVibration([80, 50, 100]);
          speakText('Stretch complete. Well done! Shake out your hands gently.', voiceSpeed);
          return GENTLE_STRETCHES[activeStretchIdx].durationSec;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeStretchIdx, stretchRunning, voiceSpeed]);

  const addWater = (amountMl: number) => {
    const today = getLocalCalendarDateKey();
    const timeLabel = new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
    setState((prev) => {
      const baseIntake = prev.dateKey === today ? prev.intakeMl : 0;
      const baseLogs = prev.dateKey === today ? prev.logs : [];
      const nextIntake = Math.max(0, baseIntake + amountMl);
      const nextLogs =
        amountMl > 0
          ? [{id: `w_${Date.now()}`, amountMl, timeLabel}, ...baseLogs].slice(0, 12)
          : baseLogs;
      return {
        ...prev,
        dateKey: today,
        intakeMl: nextIntake,
        logs: nextLogs,
      };
    });
    if (amountMl > 0) {
      playAlertSound('chime');
      triggerVibration(60);
      if (state.reminderMinutes > 0) {
        setSecondsToNextDrink(state.reminderMinutes * 60);
      }
      speakText(`Logged ${amountMl} milliliters of water.`, voiceSpeed);
    } else {
      triggerVibration(35);
    }
  };

  const progressPct = Math.min(100, Math.round((state.intakeMl / state.goalMl) * 100));
  const minsLeft = Math.floor(secondsToNextDrink / 60);
  const secsLeft = secondsToNextDrink % 60;
  const activeStretch = GENTLE_STRETCHES[activeStretchIdx];

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        moduleId="hydration"
        title="Hydration & Gentle Stretch Pacer"
        subtitle="15 · Daily Water Tracker, Custom Reminders & Guided Mobility Stretches"
        onBack={() => {
          stopSpeech();
          onBack();
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Water Progress & Logging */}
        <div className="lg:col-span-7 surface-card rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Droplets className="w-6 h-6 text-sky-400" aria-hidden="true" />
              <div>
                <h2 className="font-display text-2xl font-extrabold">Today’s Water Intake</h2>
                <p className="text-xs font-bold text-muted">
                  Saved locally for {state.dateKey} · Auto-resets tomorrow
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono-nums text-3xl font-extrabold">
                {state.intakeMl} / {state.goalMl} ml
              </p>
              <p className="text-xs font-bold text-muted">{progressPct}% of daily goal</p>
            </div>
          </div>

          <progress
            value={state.intakeMl}
            max={state.goalMl}
            aria-label="Daily water intake progress"
            className="w-full h-5 rounded-full overflow-hidden accent-sky-400"
          />

          {progressPct >= 100 && (
            <div className="rounded-2xl bg-emerald-500/15 border border-emerald-500/40 p-3.5 text-sm font-extrabold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />
              <span>Daily hydration goal reached! Keep sipping comfortably.</span>
            </div>
          )}

          {/* Quick Cup Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[150, 250, 500].map((ml) => (
              <button
                key={ml}
                type="button"
                onClick={() => addWater(ml)}
                className="btn-accent min-h-[60px] rounded-2xl font-extrabold text-base flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>{ml} ml</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => addWater(-150)}
              className="surface-elevated min-h-[60px] rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Minus className="w-4 h-4" aria-hidden="true" />
              <span>Undo 150ml</span>
            </button>
          </div>

          {/* Goal & Reminder Interval */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-theme">
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted uppercase">Daily Goal (ml)</p>
              <div className="grid grid-cols-3 gap-2">
                {[1500, 2000, 2500].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setState((prev) => ({...prev, goalMl: g}))}
                    className={`min-h-[44px] rounded-xl font-mono-nums text-xs font-bold cursor-pointer ${
                      state.goalMl === g ? 'btn-accent' : 'surface-elevated'
                    }`}
                  >
                    {g} ml
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-bold text-muted uppercase">Gentle Drink Reminder</p>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 30, 60, 90].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setState((prev) => ({...prev, reminderMinutes: m}));
                      if (m > 0) setSecondsToNextDrink(m * 60);
                    }}
                    className={`min-h-[44px] rounded-xl font-mono-nums text-xs font-bold cursor-pointer ${
                      state.reminderMinutes === m ? 'btn-accent' : 'surface-elevated'
                    }`}
                  >
                    {m === 0 ? 'Off' : `${m}m`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Reminder Countdown Bar */}
          <div className="surface-elevated rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <BellRing className="w-5 h-5 text-sky-400 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold text-muted">Next Hydration Nudge</p>
                <p className="font-mono-nums text-lg font-extrabold">
                  {state.reminderMinutes === 0
                    ? 'Paused'
                    : `${String(minsLeft).padStart(2, '0')}:${String(secsLeft).padStart(2, '0')}`}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                playAlertSound('chime');
                triggerVibration([100, 50, 100]);
                speakText('Reminder: take a gentle sip of water.', voiceSpeed);
                onEmitAlert({
                  title: 'Hydration Reminder',
                  message: 'Gentle cue to drink water and stay hydrated.',
                  severity: 'info',
                  flashScreen: false,
                });
              }}
              className="surface-card min-h-[44px] px-4 rounded-xl text-xs font-extrabold cursor-pointer"
            >
              Test Nudge Now
            </button>
          </div>

          {state.logs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted uppercase">Recent Sips Today</p>
              <div className="flex flex-wrap gap-2">
                {state.logs.map((entry) => (
                  <span
                    key={entry.id}
                    className="surface-elevated px-3 py-1.5 rounded-xl text-xs font-bold font-mono-nums"
                  >
                    +{entry.amountMl}ml · {entry.timeLabel}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Guided Gentle Mobility Stretches */}
        <div className="lg:col-span-5 surface-card rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex items-center gap-2">
            <StretchHorizontal className="w-5 h-5 text-[#00f5d4]" aria-hidden="true" />
            <h2 className="font-display text-xl font-bold">Guided Gentle Mobility Stretches</h2>
          </div>

          <div className="space-y-2">
            {GENTLE_STRETCHES.map((st, idx) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setActiveStretchIdx(idx);
                  setStretchRunning(false);
                  setStretchSecondsLeft(st.durationSec);
                  speakText(`${st.title}. ${st.instruction}`, voiceSpeed);
                }}
                className={`w-full min-h-[54px] px-4 rounded-xl text-left font-bold flex items-center justify-between gap-2 cursor-pointer ${
                  activeStretchIdx === idx ? 'btn-accent' : 'surface-elevated'
                }`}
              >
                <span>{st.title}</span>
                <span className="font-mono-nums text-xs">{st.durationSec}s</span>
              </button>
            ))}
          </div>

          <div className="surface-elevated rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-lg font-extrabold">{activeStretch.title}</p>
              <span className="font-mono-nums text-3xl font-extrabold text-[#00f5d4]">
                {stretchSecondsLeft}s
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted">{activeStretch.instruction}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !stretchRunning;
                  setStretchRunning(next);
                  if (next) {
                    speakText(activeStretch.instruction, voiceSpeed);
                  }
                }}
                className="btn-accent flex-1 min-h-[50px] rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {stretchRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{stretchRunning ? 'Pause' : 'Start 20s Stretch'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStretchRunning(false);
                  setStretchSecondsLeft(activeStretch.durationSec);
                }}
                aria-label="Reset stretch timer"
                className="surface-card min-h-[50px] px-4 rounded-xl font-bold text-sm flex items-center justify-center cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => speakText(activeStretch.instruction, voiceSpeed)}
                aria-label="Hear stretch instructions"
                className="surface-card min-h-[50px] px-4 rounded-xl font-bold text-sm flex items-center justify-center cursor-pointer"
              >
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
