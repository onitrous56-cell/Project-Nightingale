import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AlertTriangle, Bell, Flame, Mic, MicOff, UserCheck, Volume2} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {MultimodalAlert} from '../types';
import {AlertSoundKind, playAlertSound, speakText, triggerVibration} from '../utils/multimodal';

interface SoundRadarModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  batterySaverActive?: boolean;
  onEmitAlert: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

interface SoundAlertEvent {
  title: string;
  detail: string;
  severity: 'warning' | 'emergency';
  timestamp: string;
}

const SIMULATIONS: Array<{
  id: string;
  label: string;
  soundKind: AlertSoundKind;
  detail: string;
  severity: 'warning' | 'emergency';
  spikeDb: number;
  icon: React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>;
}> = [
  {
    id: 'doorbell',
    label: 'Doorbell',
    soundKind: 'doorbell',
    detail: 'Front entrance chime detected (660 Hz & 523 Hz harmonic spike).',
    severity: 'warning',
    spikeDb: 78,
    icon: Bell,
  },
  {
    id: 'smoke',
    label: 'Smoke Alarm',
    soundKind: 'smoke',
    detail: 'URGENT 3.1 kHz pulsing alarm pattern detected! Evacuate or check area.',
    severity: 'emergency',
    spikeDb: 96,
    icon: Flame,
  },
  {
    id: 'kettle',
    label: 'Kettle Whistle',
    soundKind: 'kettle',
    detail: 'Sustained 2.2 kHz kitchen whistle detected.',
    severity: 'warning',
    spikeDb: 82,
    icon: Volume2,
  },
  {
    id: 'name',
    label: 'Name Called',
    soundKind: 'chime',
    detail: 'Direct vocal call detected nearby.',
    severity: 'warning',
    spikeDb: 74,
    icon: UserCheck,
  },
];

export const SoundRadarModule: React.FC<SoundRadarModuleProps> = ({
  onBack,
  voiceSpeed,
  batterySaverActive = false,
  onEmitAlert,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastTriggerRef = useRef<number>(0);

  const [micActive, setMicActive] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [decibels, setDecibels] = useState(38);
  const [thresholdDb, setThresholdDb] = useState(72);
  const [activeAlert, setActiveAlert] = useState<SoundAlertEvent | null>(null);
  const [simSpikeEnergy, setSimSpikeEnergy] = useState(0);

  const stopMic = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setMicActive(false);
  }, []);

  const raiseSoundAlert = useCallback(
    (title: string, detail: string, severity: 'warning' | 'emergency', spikeDb: number) => {
      const nowStr = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setActiveAlert({title, detail, severity, timestamp: nowStr});
      setDecibels(spikeDb);
      setSimSpikeEnergy(1);
      triggerVibration(
        severity === 'emergency' ? [300, 100, 300, 100, 400] : [180, 90, 180]
      );
      speakText(`${title}. ${detail}`, voiceSpeed);
      onEmitAlert({
        title,
        message: detail,
        severity,
        flashScreen: true,
      });
    },
    [onEmitAlert, voiceSpeed]
  );

  const startMic = useCallback(async () => {
    setMicError(null);
    stopMic();
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone unavailable');
      }
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext: typeof AudioContext}).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      setMicActive(true);
    } catch {
      setMicError(
        'Microphone access is blocked or unavailable. Use the Sound Simulation Triggers to test visual & haptic alerts.'
      );
      setMicActive(false);
    }
  }, [stopMic]);

  useEffect(() => {
    let angle = 0;
    const freqData = new Uint8Array(128);

    const drawRadar = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          const cx = w / 2;
          const cy = h / 2;
          const maxR = Math.min(w, h) * 0.42;

          let currentDb = 36;
          if (micActive && analyserRef.current) {
            analyserRef.current.getByteFrequencyData(freqData);
            let sum = 0;
            for (let i = 0; i < freqData.length; i++) sum += freqData[i];
            const avg = sum / freqData.length;
            currentDb = Math.round(35 + (avg / 255) * 65);
            setDecibels(currentDb);

            const now = Date.now();
            if (currentDb >= thresholdDb && now - lastTriggerRef.current > 3500) {
              lastTriggerRef.current = now;
              raiseSoundAlert(
                `Loud Sound Spike (${currentDb} dB)`,
                'Sudden ambient noise exceeded your alert threshold.',
                currentDb >= 88 ? 'emergency' : 'warning',
                currentDb
              );
            }
          } else {
            // Ambient idle wave + simulated spike decay
            const decay = Math.max(0, simSpikeEnergy - 0.025);
            if (decay !== simSpikeEnergy) setSimSpikeEnergy(decay);
            for (let i = 0; i < freqData.length; i++) {
              const wave = Math.sin(angle * 3 + i * 0.25) * 0.5 + 0.5;
              freqData[i] = Math.round(18 + wave * 28 + simSpikeEnergy * 185 * wave);
            }
          }

          ctx.fillStyle = '#070B14';
          ctx.fillRect(0, 0, w, h);

          // Concentric radar rings
          [0.25, 0.5, 0.75, 1].forEach((scale) => {
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, maxR * scale, 0, Math.PI * 2);
            ctx.stroke();
          });

          // Crosshair axes
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
          ctx.beginPath();
          ctx.moveTo(cx - maxR, cy);
          ctx.lineTo(cx + maxR, cy);
          ctx.moveTo(cx, cy - maxR);
          ctx.lineTo(cx, cy + maxR);
          ctx.stroke();

          // Radar sweep beam
          angle += 0.03;
          ctx.strokeStyle = activeAlert ? '#EF4444' : '#FFE600';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
          ctx.stroke();

          // Circular 360-degree frequency spectrum ring
          const bars = 64;
          for (let i = 0; i < bars; i++) {
            const theta = (i / bars) * Math.PI * 2;
            const val = freqData[i * 2] / 255;
            const innerR = maxR * 0.45;
            const outerR = innerR + val * maxR * 0.55;
            ctx.strokeStyle =
              val > 0.65 || activeAlert ? '#EF4444' : val > 0.35 ? '#FFE600' : '#38BDF8';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(theta) * innerR, cy + Math.sin(theta) * innerR);
            ctx.lineTo(cx + Math.cos(theta) * outerR, cy + Math.sin(theta) * outerR);
            ctx.stroke();
          }
        }
      }
      if (batterySaverActive) {
        timerRef.current = window.setTimeout(drawRadar, 240);
      } else {
        rafRef.current = requestAnimationFrame(drawRadar);
      }
    };

    if (batterySaverActive) {
      timerRef.current = window.setTimeout(drawRadar, 240);
    } else {
      rafRef.current = requestAnimationFrame(drawRadar);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [activeAlert, batterySaverActive, micActive, raiseSoundAlert, simSpikeEnergy, thresholdDb]);

  useEffect(() => {
    return () => stopMic();
  }, [stopMic]);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        moduleId="sound"
        title="Sound Alert & Visual Radar"
        subtitle="03 · Hearing Assistance"
        onBack={() => {
          stopMic();
          onBack();
        }}
        actionSlot={
          <button
            type="button"
            onClick={micActive ? stopMic : startMic}
            className="btn-accent min-h-[56px] px-5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {micActive ? (
              <>
                <MicOff className="w-5 h-5" aria-hidden="true" />
                <span>Stop Microphone</span>
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" aria-hidden="true" />
                <span>Enable Live Mic</span>
              </>
            )}
          </button>
        }
      />

      {micError && (
        <div role="status" className="surface-elevated rounded-xl p-4 text-sm font-bold">
          {micError}
        </div>
      )}

      {activeAlert && (
        <div
          role="alert"
          className={`rounded-2xl border-4 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl ${
            activeAlert.severity === 'emergency'
              ? 'bg-red-600 text-white border-[#ff5500]'
              : 'bg-[#ff5500] text-[#03050a] border-[#03050a]'
          }`}
        >
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-10 h-10 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider opacity-90">
                Detected at {activeAlert.timestamp}
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold">
                {activeAlert.title}
              </h2>
              <p className="text-base font-bold mt-1">{activeAlert.detail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveAlert(null);
              setDecibels(38);
            }}
            className="min-h-[56px] px-6 rounded-xl bg-slate-950 text-white font-extrabold text-base whitespace-nowrap cursor-pointer shrink-0"
          >
            Acknowledge Alert
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 surface-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-muted">
                {micActive ? 'Live Microphone Level' : 'Visual Sound-Wave Radar (Demo Ready)'}
              </p>
              <p className="font-mono-nums text-4xl font-extrabold">{decibels} dB</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-muted">Alert Trigger</p>
              <p className="font-mono-nums text-2xl font-bold">{thresholdDb} dB</p>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border-2 border-theme bg-slate-950 aspect-[4/3] flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={560}
              height={420}
              className="w-full h-full object-contain"
              aria-label="Live sound frequency radar display"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm font-bold">
              <label htmlFor="db-threshold">Sensitivity Threshold</label>
              <span className="font-mono-nums">{thresholdDb} dB</span>
            </div>
            <input
              id="db-threshold"
              type="range"
              min="55"
              max="95"
              step="1"
              value={thresholdDb}
              onChange={(e) => setThresholdDb(parseInt(e.target.value, 10))}
              className="w-full h-3 accent-current cursor-pointer"
            />
          </div>
        </div>

        <div className="lg:col-span-5 surface-card rounded-2xl p-5 space-y-4">
          <h2 className="font-display text-xl font-bold">Demo / Simulate Sound Triggers</h2>
          <p className="text-sm text-muted">
            Trigger realistic audio spikes to test screen-border flashing, vibration, and alert
            cards in noisy exhibition rooms:
          </p>
          <div className="grid grid-cols-1 gap-3">
            {SIMULATIONS.map((sim) => {
              const Icon = sim.icon;
              return (
                <button
                  key={sim.id}
                  type="button"
                  onClick={() => {
                    playAlertSound(sim.soundKind);
                    raiseSoundAlert(sim.label, sim.detail, sim.severity, sim.spikeDb);
                  }}
                  className={`min-h-[68px] px-5 rounded-xl font-bold text-left flex items-center justify-between gap-3 cursor-pointer transition-transform active:scale-[0.98] ${
                    sim.severity === 'emergency'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'surface-elevated'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-6 h-6 shrink-0" aria-hidden={true} />
                    <div>
                      <p className="font-display text-lg font-bold">Simulate {sim.label}</p>
                      <p className="text-xs opacity-85">Peak ~{sim.spikeDb} dB</p>
                    </div>
                  </div>
                  <span className="font-mono-nums text-sm underline underline-offset-4">
                    Trigger
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
