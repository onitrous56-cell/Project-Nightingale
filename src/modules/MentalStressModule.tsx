import React, {useMemo, useState} from 'react';
import {
  Activity,
  Brain,
  CheckCircle2,
  Cloud,
  HeartPulse,
  Sparkles,
  Trash2,
  TrendingDown,
  Volume2,
} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {useFirebase} from '../contexts/FirebaseContext';
import {
  MentalStatusLevel,
  MultimodalAlert,
  PatientProfile,
  StressMood,
} from '../types';
import {playAlertSound, speakText, stopSpeech, triggerVibration} from '../utils/multimodal';

interface MentalStressModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  patientProfile: PatientProfile;
  onOpenCalmStudio: () => void;
  onEmitAlert: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

const MOOD_OPTIONS: Array<{id: StressMood; label: string; emoji: string}> = [
  {id: 'calm', label: 'Calm', emoji: '😌'},
  {id: 'focused', label: 'Focused', emoji: '🎯'},
  {id: 'happy', label: 'Happy', emoji: '🙂'},
  {id: 'fatigued', label: 'Fatigued', emoji: '😮‍💨'},
  {id: 'anxious', label: 'Anxious', emoji: '😰'},
  {id: 'overwhelmed', label: 'Overwhelmed', emoji: '🌀'},
  {id: 'sad', label: 'Low Mood', emoji: '💙'},
];

const STATUS_OPTIONS: Array<{id: MentalStatusLevel; label: string; desc: string}> = [
  {id: 'stable', label: 'Stable & Grounded', desc: 'Baseline comfort and steady focus'},
  {id: 'elevated_stress', label: 'Elevated Stress', desc: 'Noticeable tension or worry'},
  {id: 'sensory_overload', label: 'Sensory Overload', desc: 'Noise, light, or crowd strain'},
  {id: 'panic_risk', label: 'Panic / High Distress', desc: 'Needs immediate breathing or calm break'},
  {id: 'fatigued', label: 'Cognitive Fatigue', desc: 'Mental tiredness or brain fog'},
];

const COPING_ACTIONS = [
  'Guided Box Breathing',
  'Calming Rain Soundscape',
  'Quiet Dark Rest Break',
  'Talked with Caregiver',
  '5-4-3-2-1 Grounding',
  'Short Walk / Stretch',
];

export const MentalStressModule: React.FC<MentalStressModuleProps> = ({
  onBack,
  voiceSpeed,
  patientProfile,
  onOpenCalmStudio,
  onEmitAlert,
}) => {
  const {user, stressLogs, addStressLog, deleteStressLog} = useFirebase();

  const [stressScore, setStressScore] = useState<number>(4);
  const [mood, setMood] = useState<StressMood>('calm');
  const [mentalStatus, setMentalStatus] = useState<MentalStatusLevel>('stable');
  const [triggerNote, setTriggerNote] = useState<string>('');
  const [copingAction, setCopingAction] = useState<string>(COPING_ACTIONS[0]);
  const [saving, setSaving] = useState(false);

  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const stats = useMemo(() => {
    if (stressLogs.length === 0) {
      return {avg: 0, peak: 0, latest: 0};
    }
    const recent = stressLogs.slice(0, 10);
    const sum = recent.reduce((acc, item) => acc + item.stressScore, 0);
    const peak = Math.max(...recent.map((item) => item.stressScore));
    return {
      avg: Number((sum / recent.length).toFixed(1)),
      peak,
      latest: recent[0].stressScore,
    };
  }, [stressLogs]);

  const chartPoints = useMemo(() => {
    const ordered = [...stressLogs].slice(0, 12).reverse();
    if (ordered.length === 0) return [];
    const w = 520;
    const h = 150;
    const padX = 24;
    const padY = 18;
    const usableW = w - padX * 2;
    const usableH = h - padY * 2;
    return ordered.map((item, idx) => {
      const x =
        ordered.length === 1
          ? w / 2
          : padX + (idx / (ordered.length - 1)) * usableW;
      const y = padY + usableH - ((item.stressScore - 1) / 9) * usableH;
      return {x, y, score: item.stressScore, id: item.id};
    });
  }, [stressLogs]);

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addStressLog({
        stressScore,
        mood,
        mentalStatus,
        triggerNote,
        copingAction,
      });
      triggerVibration(stressScore >= 8 ? [120, 60, 120] : 55);
      playAlertSound(stressScore >= 8 ? 'chime' : 'select');
      const spoken = `Mental check-in saved. Stress level ${stressScore} out of 10. Status: ${mentalStatus.replace('_', ' ')}.`;
      speakText(spoken, voiceSpeed);

      if (stressScore >= 8 || mentalStatus === 'panic_risk') {
        onEmitAlert({
          title: `High Stress Alert (${stressScore}/10)`,
          message: `Recorded "${mentalStatus.replace('_', ' ')}" for ${patientProfile.fullName}. Consider opening Sensory Calm Studio.`,
          severity: 'warning',
          flashScreen: false,
        });
      }
      setTriggerNote('');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestInsight = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const recentTrend =
        stressLogs
          .slice(0, 5)
          .map((l) => `${l.stressScore}/10 (${l.mood})`)
          .join(', ') || 'First session check-in';
      const res = await fetch('/api/gemini/stress-insight', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          latestScore: stressScore,
          mood,
          mentalStatus,
          recentTrend,
          disabilities: patientProfile.disabilities,
          language: patientProfile.preferredLanguage || 'en-US',
        }),
      });
      const data = (await res.json()) as {insight?: string; error?: string};
      if (!res.ok || data.error) {
        setAiError(data.error || 'Unable to generate wellness insight.');
      } else if (data.insight) {
        setAiInsight(data.insight);
        speakText(data.insight, voiceSpeed);
      }
    } catch {
      setAiError('Network error while contacting Gemini wellness service.');
    } finally {
      setAiLoading(false);
    }
  };

  const stressZoneLabel =
    stressScore <= 3
      ? 'Low / Calm Zone'
      : stressScore <= 6
        ? 'Moderate Attention'
        : stressScore <= 8
          ? 'High Stress Zone'
          : 'Critical Distress Zone';

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        moduleId="stress"
        title="Mental Status & Stress Tracker"
        subtitle="11 · Stress Trend Analytics & AI Wellness Check-In"
        onBack={() => {
          stopSpeech();
          onBack();
        }}
        actionSlot={
          <button
            type="button"
            onClick={onOpenCalmStudio}
            className="btn-accent min-h-[56px] px-5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <HeartPulse className="w-5 h-5" aria-hidden="true" />
            <span>Open Calm Studio</span>
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Check-In Form */}
        <form
          onSubmit={handleSaveEntry}
          className="lg:col-span-6 surface-card rounded-2xl p-5 sm:p-6 space-y-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5" aria-hidden="true" />
              <h2 className="font-display text-xl font-bold">Log Current Mental Status</h2>
            </div>
            <span className="text-xs font-bold text-muted flex items-center gap-1.5">
              <Cloud className="w-4 h-4" aria-hidden="true" />
              {user ? 'Synced to Cloud' : 'Saved Locally'}
            </span>
          </div>

          <div className="surface-elevated rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="stress-slider" className="text-sm font-bold">
                Stress Intensity (1 = Calm, 10 = Severe)
              </label>
              <span className="font-mono-nums text-2xl font-extrabold">
                {stressScore} / 10
              </span>
            </div>
            <input
              id="stress-slider"
              type="range"
              min={1}
              max={10}
              step={1}
              value={stressScore}
              onChange={(e) => setStressScore(Number(e.target.value))}
              className="w-full h-4 accent-current cursor-pointer"
            />
            <p className="text-sm font-bold text-muted">{stressZoneLabel}</p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold">Current Mood</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MOOD_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setMood(opt.id);
                    triggerVibration(30);
                  }}
                  className={`min-h-[56px] px-3 rounded-xl font-bold text-sm flex items-center gap-2 cursor-pointer ${
                    mood === opt.id ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  <span aria-hidden="true" className="text-lg">
                    {opt.emoji}
                  </span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold">Mental &amp; Sensory Status</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setMentalStatus(st.id)}
                  className={`min-h-[60px] p-3 rounded-xl text-left cursor-pointer ${
                    mentalStatus === st.id ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  <p className="font-bold text-sm">{st.label}</p>
                  <p className="text-xs opacity-85">{st.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="coping-action" className="block text-sm font-bold">
              Active Coping Step
            </label>
            <select
              id="coping-action"
              value={copingAction}
              onChange={(e) => setCopingAction(e.target.value)}
              className="surface-elevated w-full min-h-[56px] rounded-xl px-4 font-bold"
            >
              {COPING_ACTIONS.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="trigger-note" className="block text-sm font-bold">
              Trigger or Notes (Optional, max 400 chars)
            </label>
            <textarea
              id="trigger-note"
              maxLength={400}
              rows={2}
              value={triggerNote}
              onChange={(e) => setTriggerNote(e.target.value)}
              placeholder="e.g., Bright lights in hallway, took breathing break..."
              className="surface-elevated w-full rounded-xl p-3.5 text-sm font-medium"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="btn-accent flex-1 min-h-[58px] px-5 rounded-xl font-extrabold flex items-center justify-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
              <span>{saving ? 'Saving...' : 'Save Stress Check-In'}</span>
            </button>
            <button
              type="button"
              onClick={handleRequestInsight}
              disabled={aiLoading}
              className="surface-elevated min-h-[58px] px-5 rounded-xl font-bold flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-5 h-5" aria-hidden="true" />
              <span>{aiLoading ? 'Thinking...' : 'AI Coping Plan'}</span>
            </button>
          </div>

          {aiError && (
            <p role="alert" className="text-sm font-bold text-red-400">
              {aiError}
            </p>
          )}

          {aiInsight && (
            <div className="surface-elevated rounded-2xl p-4 space-y-2 border-2 border-sky-400/50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-extrabold">Gemini Wellness Suggestion</p>
                <button
                  type="button"
                  onClick={() => speakText(aiInsight, voiceSpeed)}
                  className="surface-card min-h-[40px] px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" aria-hidden="true" />
                  <span>Read Aloud</span>
                </button>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-line">{aiInsight}</p>
            </div>
          )}
        </form>

        {/* Trend Graph & History */}
        <div className="lg:col-span-6 space-y-6">
          <div className="surface-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-5 h-5" aria-hidden="true" />
                <h2 className="font-display text-xl font-bold">Stress Trend Overview</h2>
              </div>
              <span className="font-mono-nums text-xs font-bold text-muted">
                Last {Math.min(12, stressLogs.length)} logs
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="surface-elevated rounded-xl p-3.5 text-center">
                <p className="text-xs font-bold text-muted">Latest</p>
                <p className="font-mono-nums text-2xl font-extrabold mt-0.5">
                  {stats.latest ? `${stats.latest}/10` : '—'}
                </p>
              </div>
              <div className="surface-elevated rounded-xl p-3.5 text-center">
                <p className="text-xs font-bold text-muted">Average</p>
                <p className="font-mono-nums text-2xl font-extrabold mt-0.5">
                  {stats.avg ? `${stats.avg}/10` : '—'}
                </p>
              </div>
              <div className="surface-elevated rounded-xl p-3.5 text-center">
                <p className="text-xs font-bold text-muted">Peak</p>
                <p className="font-mono-nums text-2xl font-extrabold mt-0.5">
                  {stats.peak ? `${stats.peak}/10` : '—'}
                </p>
              </div>
            </div>

            <div className="surface-elevated rounded-2xl p-3">
              {chartPoints.length === 0 ? (
                <div className="h-[150px] flex items-center justify-center text-sm text-muted font-bold">
                  Save a check-in to plot your stress curve.
                </div>
              ) : (
                <svg
                  viewBox="0 0 520 150"
                  className="w-full h-[150px]"
                  role="img"
                  aria-label="Recent stress level trend line"
                >
                  {/* Reference Lines */}
                  <line x1="20" y1="18" x2="500" y2="18" stroke="rgba(239,68,68,0.35)" strokeDasharray="4 4" />
                  <line x1="20" y1="75" x2="500" y2="75" stroke="rgba(148,163,184,0.25)" strokeDasharray="4 4" />
                  <line x1="20" y1="132" x2="500" y2="132" stroke="rgba(34,197,94,0.35)" strokeDasharray="4 4" />

                  {chartPoints.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#38BDF8"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={chartPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                    />
                  )}
                  {chartPoints.map((p) => (
                    <g key={p.id}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="6"
                        fill={p.score >= 8 ? '#EF4444' : p.score >= 5 ? '#F59E0B' : '#22C55E'}
                        stroke="#090E17"
                        strokeWidth="2"
                      />
                    </g>
                  ))}
                </svg>
              )}
            </div>
          </div>

          <div className="surface-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5" aria-hidden="true" />
              <h2 className="font-display text-xl font-bold">Recent Check-Ins</h2>
            </div>

            {stressLogs.length === 0 ? (
              <p className="text-sm text-muted">
                No mental status entries recorded yet. Use the panel on the left to log your first check-in.
              </p>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {stressLogs.map((log) => (
                  <div
                    key={log.id}
                    className="surface-elevated rounded-xl p-4 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-nums font-extrabold text-base">
                          Stress {log.stressScore}/10
                        </span>
                        <span className="text-xs font-bold text-muted uppercase">
                          · {log.mood} · {log.mentalStatus.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-muted">
                        Coping: {log.copingAction} ·{' '}
                        {new Date(log.createdAtIso).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                      {log.triggerNote && (
                        <p className="text-sm mt-1 leading-snug">{log.triggerNote}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteStressLog(log.id)}
                      className="surface-card min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
                      aria-label="Delete stress log entry"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
