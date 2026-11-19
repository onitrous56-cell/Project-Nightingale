import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  CameraOff,
  Eye,
  Pause,
  Play,
} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {MultimodalAlert} from '../types';
import {playAlertSound, speakText, triggerVibration} from '../utils/multimodal';

interface MotorCommunicatorModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  batterySaverActive?: boolean;
  onEmitAlert: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

interface ScanOption {
  id: string;
  label: string;
  spoken: string;
  directionLabel: string;
  emoji: string;
  severity: 'info' | 'warning';
}

const OPTIONS: ScanOption[] = [
  {
    id: 'yes',
    label: 'YES',
    spoken: 'Yes.',
    directionLabel: 'Tilt Up',
    emoji: '✅',
    severity: 'info',
  },
  {
    id: 'no',
    label: 'NO',
    spoken: 'No.',
    directionLabel: 'Tilt Right',
    emoji: '❌',
    severity: 'info',
  },
  {
    id: 'caregiver',
    label: 'CALL CAREGIVER',
    spoken: 'Please call my caregiver immediately.',
    directionLabel: 'Tilt Down',
    emoji: '📞',
    severity: 'warning',
  },
  {
    id: 'water',
    label: 'NEED WATER',
    spoken: 'I would like some water, please.',
    directionLabel: 'Tilt Left',
    emoji: '💧',
    severity: 'info',
  },
];

export const MotorCommunicatorModule: React.FC<MotorCommunicatorModuleProps> = ({
  onBack,
  voiceSpeed,
  batterySaverActive = false,
  onEmitAlert,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const batterySaverRef = useRef<boolean>(batterySaverActive);
  batterySaverRef.current = batterySaverActive;
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const lastCamSelectRef = useRef<number>(0);

  const [focusedIndex, setFocusedIndex] = useState(0);
  const focusedIndexRef = useRef(0);
  const [autoScanning, setAutoScanning] = useState(true);
  const [scanIntervalMs, setScanIntervalMs] = useState(2000);
  const [lastSelected, setLastSelected] = useState<ScanOption | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [motionScore, setMotionScore] = useState(0);

  useEffect(() => {
    focusedIndexRef.current = focusedIndex;
  }, [focusedIndex]);

  const selectOption = useCallback(
    (index: number, viaLabel: string) => {
      const opt = OPTIONS[index];
      setFocusedIndex(index);
      setLastSelected(opt);
      triggerVibration([100, 50, 100]);
      playAlertSound(opt.id === 'caregiver' ? 'doorbell' : 'select');
      speakText(opt.spoken, voiceSpeed);
      onEmitAlert({
        title: `Selected (${viaLabel}): ${opt.label}`,
        message: opt.spoken,
        severity: opt.severity,
        flashScreen: opt.id === 'caregiver',
      });
    },
    [onEmitAlert, voiceSpeed]
  );

  // Auto-cycle focus every 2 seconds (or user selected interval)
  useEffect(() => {
    if (!autoScanning) return;
    const id = window.setInterval(() => {
      setFocusedIndex((prev) => (prev + 1) % OPTIONS.length);
    }, scanIntervalMs);
    return () => window.clearInterval(id);
  }, [autoScanning, scanIntervalMs]);

  // Switch Access: Spacebar / Enter / Arrow keys
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        if ((e.target as HTMLElement)?.tagName === 'BUTTON') return;
        e.preventDefault();
        selectOption(focusedIndex, 'Switch Key');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectOption(0, 'Head Tilt Up');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        selectOption(1, 'Head Tilt Right');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectOption(2, 'Head Tilt Down');
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        selectOption(3, 'Head Tilt Left');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusedIndex, selectOption]);

  const stopCamera = useCallback(() => {
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
    setCameraActive(false);
  }, []);

  const startCameraMotion = useCallback(async () => {
    setCameraError(null);
    stopCamera();
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera unavailable');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'user', width: {ideal: 320}, height: {ideal: 240}},
      });
      streamRef.current = stream;
      setCameraActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const loop = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState >= 2) {
          const ctx = canvas.getContext('2d', {willReadFrequently: true});
          if (ctx) {
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
            ctx.restore();

            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            if (prevFrameRef.current) {
              let diffCount = 0;
              for (let i = 0; i < frame.length; i += 64) {
                const delta =
                  Math.abs(frame[i] - prevFrameRef.current[i]) +
                  Math.abs(frame[i + 1] - prevFrameRef.current[i + 1]);
                if (delta > 60) diffCount++;
              }
              const pct = Math.min(100, Math.round((diffCount / 220) * 100));
              setMotionScore(pct);

              const now = Date.now();
              if (pct > 62 && now - lastCamSelectRef.current > 2600) {
                lastCamSelectRef.current = now;
                selectOption(focusedIndexRef.current, 'Camera Nod / Blink');
              }
            }
            prevFrameRef.current = new Uint8ClampedArray(frame);
          }
        }
        if (batterySaverRef.current) {
          timerRef.current = window.setTimeout(loop, 250);
        } else {
          rafRef.current = requestAnimationFrame(loop);
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      setCameraError(
        'Front camera blocked or unavailable. Use Spacebar, Screen Switch Pad, or Head-Tilt simulator buttons.'
      );
      setCameraActive(false);
    }
  }, [selectOption, stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        moduleId="motor"
        title="Head-Tilt & Blink Hands-Free Communicator"
        subtitle="08 · Motor & Switch Access"
        onBack={() => {
          stopCamera();
          onBack();
        }}
        actionSlot={
          <button
            type="button"
            onClick={cameraActive ? stopCamera : startCameraMotion}
            className="btn-accent min-h-[56px] px-5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {cameraActive ? (
              <>
                <CameraOff className="w-5 h-5" aria-hidden="true" />
                <span>Stop Motion Cam</span>
              </>
            ) : (
              <>
                <Camera className="w-5 h-5" aria-hidden="true" />
                <span>Enable Head/Blink Cam</span>
              </>
            )}
          </button>
        }
      />

      {cameraError && (
        <div role="status" className="surface-elevated rounded-xl p-4 text-sm font-bold">
          {cameraError}
        </div>
      )}

      {/* Scan Controls */}
      <div className="surface-card rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setAutoScanning((v) => !v)}
            className="btn-accent min-h-[56px] px-5 rounded-xl font-bold flex items-center gap-2 cursor-pointer"
          >
            {autoScanning ? (
              <>
                <Pause className="w-5 h-5" aria-hidden="true" />
                <span>Pause 2s Auto-Scan</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5" aria-hidden="true" />
                <span>Resume Auto-Scan</span>
              </>
            )}
          </button>
          <div className="flex items-center gap-2">
            {[1500, 2000, 3000].map((ms) => (
              <button
                key={ms}
                type="button"
                onClick={() => setScanIntervalMs(ms)}
                className={`min-h-[56px] px-4 rounded-xl font-mono-nums font-bold cursor-pointer ${
                  scanIntervalMs === ms ? 'btn-accent' : 'surface-elevated'
                }`}
              >
                {(ms / 1000).toFixed(1)}s
              </button>
            ))}
          </div>
        </div>

        <p className="text-sm font-bold text-muted">
          Press <kbd className="surface-elevated px-2 py-1 rounded">Spacebar</kbd> or tap the
          Switch Pad to select focused choice
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* 4-Card Scanning Grid + Giant Switch Access Tap Pad */}
        <div className="lg:col-span-8 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {OPTIONS.map((opt, idx) => {
              const isFocused = focusedIndex === idx;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => selectOption(idx, 'Direct Tap')}
                  className={`min-h-[140px] rounded-2xl p-6 text-left flex flex-col justify-between gap-3 cursor-pointer transition-transform ${
                    isFocused
                      ? 'btn-accent ring-4 ring-yellow-300 scale-[1.01]'
                      : 'surface-card opacity-85'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-4xl" aria-hidden="true">
                      {opt.emoji}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {opt.directionLabel}
                    </span>
                  </div>
                  <div>
                    <p className="font-display text-2xl sm:text-3xl font-extrabold">{opt.label}</p>
                    <p className="text-sm font-bold opacity-85 mt-1">"{opt.spoken}"</p>
                  </div>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => selectOption(focusedIndex, 'Switch Tap Pad')}
            className="w-full min-h-[84px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display text-xl sm:text-2xl font-extrabold flex items-center justify-center gap-3 shadow-lg cursor-pointer transition-transform active:scale-[0.98]"
          >
            <Eye className="w-7 h-7" aria-hidden="true" />
            <span>SWITCH SELECT: {OPTIONS[focusedIndex].label} (TAP OR SPACE)</span>
          </button>
        </div>

        {/* Head-Tilt Simulator + Front Cam Motion Box */}
        <div className="lg:col-span-4 space-y-5">
          <div className="surface-card rounded-2xl p-5 space-y-4">
            <h2 className="font-display text-xl font-bold">Demo / Simulate Head Tilt & Blink</h2>
            <div className="grid grid-cols-3 gap-2">
              <div />
              <button
                type="button"
                onClick={() => selectOption(0, 'Head Tilt Up')}
                className="surface-elevated min-h-[60px] rounded-xl font-bold flex flex-col items-center justify-center cursor-pointer"
              >
                <ArrowUp className="w-5 h-5" aria-hidden="true" />
                <span className="text-xs">YES</span>
              </button>
              <div />
              <button
                type="button"
                onClick={() => selectOption(3, 'Head Tilt Left')}
                className="surface-elevated min-h-[60px] rounded-xl font-bold flex flex-col items-center justify-center cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" aria-hidden="true" />
                <span className="text-xs">WATER</span>
              </button>
              <button
                type="button"
                onClick={() => selectOption(focusedIndex, 'Double Blink')}
                className="btn-accent min-h-[60px] rounded-xl font-extrabold text-xs flex flex-col items-center justify-center cursor-pointer"
              >
                <Eye className="w-5 h-5" aria-hidden="true" />
                <span>BLINK</span>
              </button>
              <button
                type="button"
                onClick={() => selectOption(1, 'Head Tilt Right')}
                className="surface-elevated min-h-[60px] rounded-xl font-bold flex flex-col items-center justify-center cursor-pointer"
              >
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
                <span className="text-xs">NO</span>
              </button>
              <div />
              <button
                type="button"
                onClick={() => selectOption(2, 'Head Tilt Down')}
                className="surface-elevated min-h-[60px] rounded-xl font-bold flex flex-col items-center justify-center cursor-pointer"
              >
                <ArrowDown className="w-5 h-5" aria-hidden="true" />
                <span className="text-xs">CARE</span>
              </button>
              <div />
            </div>
          </div>

          <div className="surface-card rounded-2xl p-5 space-y-3">
            <h2 className="font-display text-lg font-bold">Camera Nod / Blink Sensor</h2>
            <video ref={videoRef} className="hidden" playsInline muted />
            <canvas
              ref={canvasRef}
              width={320}
              height={200}
              className="w-full rounded-xl bg-slate-950 border-2 border-theme aspect-[16/10] object-cover"
              aria-label="Front camera motion detector viewport"
            />
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-bold text-muted">
                <span>Motion Trigger Threshold (62%)</span>
                <span className="font-mono-nums">{motionScore}%</span>
              </div>
              <div className="h-3 rounded-full bg-black/30 border border-theme overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 ${
                    motionScore > 62 ? 'bg-emerald-400' : 'bg-sky-400'
                  }`}
                  style={{width: `${motionScore}%`}}
                />
              </div>
            </div>
            {lastSelected && (
              <div className="surface-elevated rounded-xl p-3 text-sm font-bold">
                Last Spoken: {lastSelected.emoji} {lastSelected.spoken}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
