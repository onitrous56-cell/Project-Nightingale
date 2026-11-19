import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Camera, CameraOff, Hand, Trash2, Volume2} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {MultimodalAlert} from '../types';
import {playAlertSound, speakText, triggerVibration} from '../utils/multimodal';

interface SignTranslatorModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  batterySaverActive?: boolean;
  onEmitAlert: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

interface GestureItem {
  id: string;
  label: string;
  emoji: string;
  spokenPhrase: string;
  handShape: 'wave' | 'flat' | 'fist' | 'three' | 'thumbup' | 'thumbdown';
}

const GESTURES: GestureItem[] = [
  {id: 'hello', label: 'Hello', emoji: '👋', spokenPhrase: 'Hello, nice to meet you.', handShape: 'wave'},
  {id: 'thankyou', label: 'Thank You', emoji: '🙏', spokenPhrase: 'Thank you very much.', handShape: 'flat'},
  {id: 'help', label: 'Help', emoji: '🆘', spokenPhrase: 'I need help please.', handShape: 'fist'},
  {id: 'water', label: 'Water', emoji: '💧', spokenPhrase: 'May I have some water?', handShape: 'three'},
  {id: 'yes', label: 'Yes', emoji: '👍', spokenPhrase: 'Yes, I agree.', handShape: 'thumbup'},
  {id: 'no', label: 'No', emoji: '👎', spokenPhrase: 'No, thank you.', handShape: 'thumbdown'},
];

export const SignTranslatorModule: React.FC<SignTranslatorModuleProps> = ({
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
  const lastMotionTriggerRef = useRef<number>(0);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [activeGesture, setActiveGesture] = useState<GestureItem>(GESTURES[0]);
  const [sentence, setSentence] = useState<string[]>(['Hello']);
  const [motionEnergy, setMotionEnergy] = useState(0);

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

  const drawSimulatedHandSkeleton = useCallback((shape: GestureItem['handShape'], label: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, w, h);

    // Subtle alignment grid
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Palm wrist center
    const wrist = {x: w * 0.5, y: h * 0.78};
    const palm = {x: w * 0.5, y: h * 0.58};

    const fingerOffsets: Array<[number, number]> =
      shape === 'wave' || shape === 'flat'
        ? [
            [-115, -90],
            [-55, -165],
            [0, -180],
            [55, -160],
            [105, -125],
          ]
        : shape === 'three'
          ? [
              [-95, -55],
              [-45, -165],
              [0, -175],
              [48, -160],
              [70, -40],
            ]
          : shape === 'thumbup'
            ? [
                [-10, -175],
                [50, -35],
                [55, -15],
                [55, 5],
                [50, 25],
              ]
            : shape === 'thumbdown'
              ? [
                  [-10, 115],
                  [50, -35],
                  [55, -15],
                  [55, 5],
                  [50, 25],
                ]
              : [
                  [-50, -45],
                  [-25, -55],
                  [5, -55],
                  [35, -50],
                  [60, -40],
                ];

    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';

    // Wrist to palm
    ctx.beginPath();
    ctx.moveTo(wrist.x, wrist.y);
    ctx.lineTo(palm.x, palm.y);
    ctx.stroke();

    // Draw 5 fingers + joints
    fingerOffsets.forEach(([dx, dy]) => {
      const midX = palm.x + dx * 0.55;
      const midY = palm.y + dy * 0.55;
      const tipX = palm.x + dx;
      const tipY = palm.y + dy;

      ctx.strokeStyle = '#38BDF8';
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y);
      ctx.lineTo(midX, midY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();

      [
        [midX, midY],
        [tipX, tipY],
      ].forEach(([jx, jy]) => {
        ctx.fillStyle = '#FFE600';
        ctx.beginPath();
        ctx.arc(jx, jy, 8, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    ctx.fillStyle = '#FFE600';
    ctx.beginPath();
    ctx.arc(wrist.x, wrist.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(palm.x, palm.y, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`Detected Sign: ${label}`, 24, 42);
  }, []);

  const triggerGesture = useCallback(
    (gesture: GestureItem, speakNow = true) => {
      setActiveGesture(gesture);
      setSentence((prev) => [...prev.slice(-7), gesture.label]);
      triggerVibration(90);
      playAlertSound('select');
      if (speakNow) {
        speakText(gesture.spokenPhrase, voiceSpeed);
      }
      onEmitAlert({
        title: `Sign Translated: ${gesture.label}`,
        message: gesture.spokenPhrase,
        severity: 'info',
      });
      if (!cameraActive) {
        drawSimulatedHandSkeleton(gesture.handShape, gesture.label);
      }
    },
    [cameraActive, drawSimulatedHandSkeleton, onEmitAlert, voiceSpeed]
  );

  const startCamera = useCallback(async () => {
    setCameraError(null);
    stopCamera();
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API unavailable');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'user', width: {ideal: 640}, height: {ideal: 480}},
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

            // Lightweight optical hand-zone motion tracking across 3 zones
            const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            if (prevFrameRef.current) {
              let leftDiff = 0;
              let centerDiff = 0;
              let rightDiff = 0;
              const stride = 24;
              for (let y = 40; y < canvas.height - 40; y += stride) {
                for (let x = 40; x < canvas.width - 40; x += stride) {
                  const i = (y * canvas.width + x) * 4;
                  const diff =
                    Math.abs(frame[i] - prevFrameRef.current[i]) +
                    Math.abs(frame[i + 1] - prevFrameRef.current[i + 1]);
                  if (diff > 55) {
                    if (x < canvas.width * 0.35) leftDiff++;
                    else if (x > canvas.width * 0.65) rightDiff++;
                    else centerDiff++;
                  }
                }
              }
              const total = leftDiff + centerDiff + rightDiff;
              setMotionEnergy(Math.min(100, total * 2));

              // Draw tracking reticle on active motion zone
              ctx.strokeStyle = '#FFE600';
              ctx.lineWidth = 4;
              if (total > 22) {
                const zoneX =
                  leftDiff > rightDiff && leftDiff > centerDiff
                    ? canvas.width * 0.2
                    : rightDiff > leftDiff && rightDiff > centerDiff
                      ? canvas.width * 0.8
                      : canvas.width * 0.5;
                ctx.strokeRect(zoneX - 75, canvas.height * 0.32, 150, 170);

                const now = Date.now();
                if (now - lastMotionTriggerRef.current > 2400) {
                  lastMotionTriggerRef.current = now;
                  const chosen =
                    leftDiff > rightDiff && leftDiff > centerDiff
                      ? GESTURES[0]
                      : rightDiff > leftDiff && rightDiff > centerDiff
                        ? GESTURES[1]
                        : GESTURES[2];
                  triggerGesture(chosen, true);
                }
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
        'Front camera blocked or unavailable. Use the interactive Sign Gesture Simulator buttons below.'
      );
      setCameraActive(false);
    }
  }, [stopCamera, triggerGesture]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (!cameraActive) {
      drawSimulatedHandSkeleton(activeGesture.handShape, activeGesture.label);
    }
  }, [cameraActive, activeGesture, drawSimulatedHandSkeleton]);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        moduleId="sign"
        title="Sign Language & Gesture Translator"
        subtitle="02 · Communication Bridge"
        onBack={() => {
          stopCamera();
          onBack();
        }}
        actionSlot={
          <button
            type="button"
            onClick={cameraActive ? stopCamera : startCamera}
            className="btn-accent min-h-[56px] px-5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {cameraActive ? (
              <>
                <CameraOff className="w-5 h-5" aria-hidden="true" />
                <span>Stop Front Camera</span>
              </>
            ) : (
              <>
                <Camera className="w-5 h-5" aria-hidden="true" />
                <span>Start Front Camera</span>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 surface-card rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="rounded-xl overflow-hidden bg-slate-950 border-2 border-theme aspect-[4/3]">
            <video ref={videoRef} className="hidden" playsInline muted />
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className="w-full h-full object-contain"
              aria-label="Sign language gesture tracking canvas"
            />
          </div>

          <div className="surface-elevated rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-5xl" aria-hidden="true">
                {activeGesture.emoji}
              </span>
              <div>
                <p className="text-sm font-bold text-muted">Translated Output</p>
                <p className="font-display text-3xl sm:text-4xl font-extrabold">
                  {activeGesture.label}
                </p>
                <p className="text-base font-medium text-muted mt-0.5">
                  "{activeGesture.spokenPhrase}"
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => speakText(activeGesture.spokenPhrase, voiceSpeed)}
              className="btn-accent min-h-[56px] px-5 rounded-xl font-bold flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <Volume2 className="w-5 h-5" aria-hidden="true" />
              <span>Speak</span>
            </button>
          </div>

          {cameraActive && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-muted">
                <span>Live Hand Motion Energy</span>
                <span className="font-mono-nums">{motionEnergy}%</span>
              </div>
              <div className="h-3 rounded-full bg-black/40 overflow-hidden border border-theme">
                <div
                  className="h-full bg-sky-400 transition-all duration-150"
                  style={{width: `${motionEnergy}%`}}
                />
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-5">
          <div className="surface-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Hand className="w-5 h-5" aria-hidden="true" />
              <h2 className="font-display text-xl font-bold">Demo / Simulate Hand Gestures</h2>
            </div>
            <p className="text-sm text-muted">
              Tap any sign gesture to render hand landmarks, speak aloud, and build a sentence:
            </p>
            <div className="grid grid-cols-2 gap-3">
              {GESTURES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => triggerGesture(g, true)}
                  className={`min-h-[76px] p-4 rounded-xl font-bold text-left flex items-center gap-3 cursor-pointer transition-transform active:scale-[0.98] ${
                    activeGesture.id === g.id ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  <span className="text-3xl shrink-0" aria-hidden="true">
                    {g.emoji}
                  </span>
                  <span className="font-display text-lg">{g.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="surface-card rounded-2xl p-5 space-y-4">
            <h2 className="font-display text-xl font-bold">Conversation Transcript</h2>
            <div className="surface-elevated rounded-xl p-4 min-h-[76px] text-lg font-bold leading-relaxed">
              {sentence.length > 0 ? sentence.join(' · ') : 'Tap signs to compose a phrase.'}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => speakText(sentence.join('. '), voiceSpeed)}
                disabled={sentence.length === 0}
                className="btn-accent flex-1 min-h-[56px] rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Volume2 className="w-5 h-5" aria-hidden="true" />
                <span>Speak All</span>
              </button>
              <button
                type="button"
                onClick={() => setSentence([])}
                className="surface-elevated min-h-[56px] px-5 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-5 h-5" aria-hidden="true" />
                <span>Clear</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
