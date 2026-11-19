import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Camera,
  CameraOff,
  Contrast,
  Flashlight,
  Pause,
  Play,
  Sparkles,
  Volume2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {LanguageCode, MultimodalAlert} from '../types';
import {
  getLanguageMeta,
  getLocalizedModuleMeta,
  t,
  useAppLanguage,
} from '../utils/i18n';
import {playAlertSound, speakText, stopSpeech, triggerVibration} from '../utils/multimodal';

interface MagnifierLoupeModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  language?: LanguageCode;
  batterySaverActive?: boolean;
  onEmitAlert: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

type FilterMode = 'normal' | 'high-contrast' | 'yellow-black' | 'inverted';
type SampleLabelKey = 'rx_bottle' | 'cafe_menu' | 'receipt';

const SAMPLE_LABELS: Record<
  SampleLabelKey,
  {title: string; lines: string[]; spokenSample: string}
> = {
  rx_bottle: {
    title: 'Prescription Label',
    lines: [
      'ABLECARE PHARMACY · RX #40219',
      'METFORMIN HCL 500 MG TABLETS',
      'Take 1 tablet twice daily WITH MEALS.',
      'Drink a full glass of water. Keep dry.',
    ],
    spokenSample:
      'Prescription Label: Metformin 500 milligrams. Take 1 tablet twice daily with meals and a full glass of water.',
  },
  cafe_menu: {
    title: 'Small Menu Print',
    lines: [
      'DAILY SOUP & BREAD COMBO ...... $7.50',
      'CHAMOMILE HERBAL TEA .......... $3.00',
      'GLUTEN-FREE OAT BOWL .......... $6.25',
      'Please inform staff of nut allergies.',
    ],
    spokenSample:
      'Menu print: Daily Soup and Bread Combo 7 dollars 50, Chamomile Herbal Tea 3 dollars, Gluten-Free Oat Bowl 6 dollars 25.',
  },
  receipt: {
    title: 'Dosage & Expiry Stamp',
    lines: [
      'LOT: AB-9042 · EXP: 11/2027',
      'STORE AT 15°C TO 25°C (ROOM TEMP)',
      'DO NOT CRUSH OR CHEW TABLET',
    ],
    spokenSample:
      'Lot AB 9042, Expiry November 2027. Store at room temperature. Do not crush or chew tablet.',
  },
};

export const MagnifierLoupeModule: React.FC<MagnifierLoupeModuleProps> = ({
  onBack,
  voiceSpeed,
  language,
  batterySaverActive = false,
  onEmitAlert,
}) => {
  const activeLang = useAppLanguage(language);
  const moduleMeta = getLocalizedModuleMeta(activeLang, 'magnifier');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const [mode, setMode] = useState<'camera' | 'sample'>('camera');
  const [sampleKey, setSampleKey] = useState<SampleLabelKey>('rx_bottle');
  const [zoom, setZoom] = useState<number>(2.0);
  const [filterMode, setFilterMode] = useState<FilterMode>('normal');
  const [frozen, setFrozen] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [torchSupported, setTorchSupported] = useState<boolean>(false);
  const [cameraStatus, setCameraStatus] = useState<string>('Initializing live magnifier...');
  const [readoutText, setReadoutText] = useState<string>(
    'Point the camera at small print, medicine labels, or expiry stamps, then tap AI Read Text Aloud.'
  );
  const [isReadingAi, setIsReadingAi] = useState<boolean>(false);

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const filterRef = useRef(filterMode);
  filterRef.current = filterMode;
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const batteryRef = useRef(batterySaverActive);
  batteryRef.current = batterySaverActive;

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
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const applyPostFilter = (ctx: CanvasRenderingContext2D, w: number, h: number, modeVal: FilterMode) => {
    if (modeVal === 'normal') return;
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (modeVal === 'inverted') {
        d[i] = 255 - r;
        d[i + 1] = 255 - g;
        d[i + 2] = 255 - b;
      } else if (modeVal === 'high-contrast') {
        const val = lum > 128 ? 255 : 0;
        d[i] = val;
        d[i + 1] = val;
        d[i + 2] = val;
      } else if (modeVal === 'yellow-black') {
        if (lum > 125) {
          d[i] = 255;
          d[i + 1] = 230;
          d[i + 2] = 0;
        } else {
          d[i] = 0;
          d[i + 1] = 0;
          d[i + 2] = 0;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  const drawZoomedSample = useCallback(
    (key: SampleLabelKey, zoomVal: number, fMode: FilterMode) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const octx = off.getContext('2d');
      if (!octx) return;

      octx.fillStyle = '#F8FAFC';
      octx.fillRect(0, 0, w, h);
      octx.fillStyle = '#0F172A';
      octx.fillRect(0, 0, w, 56);
      octx.fillStyle = '#FFFFFF';
      octx.font = 'bold 22px sans-serif';
      octx.fillText(SAMPLE_LABELS[key].title.toUpperCase(), 28, 36);

      octx.fillStyle = '#0F172A';
      const lines = SAMPLE_LABELS[key].lines;
      lines.forEach((line, idx) => {
        octx.font = idx === 1 ? 'bold 20px sans-serif' : '17px sans-serif';
        octx.fillText(line, 28, 120 + idx * 54);
      });

      ctx.clearRect(0, 0, w, h);
      const sw = w / zoomVal;
      const sh = h / zoomVal;
      const sx = (w - sw) / 2;
      const sy = (h - sh) / 2;
      ctx.drawImage(off, sx, sy, sw, sh, 0, 0, w, h);
      applyPostFilter(ctx, w, h, fMode);
    },
    []
  );

  const startCamera = useCallback(async () => {
    stopCamera();
    setFrozen(false);
    setCameraStatus('Starting rear camera...');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera unavailable');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {ideal: 'environment'},
          width: {ideal: 1280},
          height: {ideal: 720},
        },
      });
      streamRef.current = stream;
      setMode('camera');
      setCameraStatus('Live Camera Magnifier Active');

      const track = stream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as MediaTrackCapabilities & {torch?: boolean};
        setTorchSupported(Boolean(caps.torch));
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const loop = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!frozenRef.current && video && canvas && video.readyState >= 2) {
          const ctx = canvas.getContext('2d', {willReadFrequently: true});
          if (ctx) {
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 480;
            const z = zoomRef.current;
            const sw = vw / z;
            const sh = vh / z;
            const sx = (vw - sw) / 2;
            const sy = (vh - sh) / 2;
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            applyPostFilter(ctx, canvas.width, canvas.height, filterRef.current);
          }
        }
        if (batteryRef.current) {
          timerRef.current = window.setTimeout(loop, 220);
        } else {
          rafRef.current = requestAnimationFrame(loop);
        }
      };
      rafRef.current = requestAnimationFrame(loop);
    } catch {
      setMode('sample');
      setCameraStatus('Demo Sample Print Mode (Camera Unavailable)');
      drawZoomedSample('rx_bottle', zoomRef.current, filterRef.current);
    }
  }, [drawZoomedSample, stopCamera]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      stopSpeech();
    };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (mode === 'sample' && !frozen) {
      drawZoomedSample(sampleKey, zoom, filterMode);
    }
  }, [drawZoomedSample, filterMode, frozen, mode, sampleKey, zoom]);

  // Apply hardware optical zoom constraint if available
  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || mode !== 'camera' || typeof track.getCapabilities !== 'function') return;
    const caps = track.getCapabilities() as MediaTrackCapabilities & {
      zoom?: {min: number; max: number};
    };
    if (caps.zoom) {
      const clamped = Math.min(caps.zoom.max, Math.max(caps.zoom.min, zoom));
      track.applyConstraints({advanced: [{zoom: clamped} as MediaTrackConstraintSet]}).catch(() => {});
    }
  }, [zoom, mode]);

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({advanced: [{torch: next} as MediaTrackConstraintSet]});
      setTorchOn(next);
      triggerVibration(40);
    } catch {
      setTorchSupported(false);
    }
  };

  const handleAiReadText = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    triggerVibration([60, 40, 60]);
    playAlertSound('chime');
    setIsReadingAi(true);

    if (mode === 'sample') {
      const sample = SAMPLE_LABELS[sampleKey];
      setReadoutText(sample.spokenSample);
      speakText(sample.spokenSample, voiceSpeed, {lang: activeLang});
      onEmitAlert({
        title: `Magnifier Readout: ${sample.title}`,
        message: sample.spokenSample,
        severity: 'info',
      });
      setIsReadingAi(false);
      return;
    }

    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      const langMeta = getLanguageMeta(activeLang);
      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          message: `Read all printed text visible in this magnified image clearly in ${langMeta.aiLanguageName}. Focus on medicine names, dosage, warnings, dates, or prices.`,
          persona: 'accessibility_advisor',
          model: 'gemini-4-hydrogen',
          language: activeLang,
          imageDataUrl: dataUrl,
        }),
      });
      if (!res.ok) throw new Error('Vision API unavailable');
      const data = await res.json();
      const reply = data.reply || 'No clear printed text detected.';
      setReadoutText(reply);
      speakText(reply, voiceSpeed, {lang: activeLang});
      onEmitAlert({
        title: 'Magnifier Text Readout',
        message: reply.slice(0, 110),
        severity: 'info',
      });
    } catch {
      const fallback = 'Unable to reach AI text reader offline. Hold steady or switch to Sample Print Mode.';
      setReadoutText(fallback);
      speakText(fallback, voiceSpeed, {lang: activeLang});
    } finally {
      setIsReadingAi(false);
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        title={moduleMeta.title}
        subtitle={`14 · ${moduleMeta.domain}`}
        language={activeLang}
        onBack={() => {
          stopCamera();
          stopSpeech();
          onBack();
        }}
        actionSlot={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={
                mode === 'camera'
                  ? () => {
                      stopCamera();
                      setMode('sample');
                      setCameraStatus('Demo Sample Print Mode');
                    }
                  : startCamera
              }
              className="btn-accent min-h-[52px] px-4 rounded-xl font-bold text-sm flex items-center gap-2 cursor-pointer"
            >
              {mode === 'camera' ? (
                <>
                  <CameraOff className="w-4 h-4" aria-hidden="true" />
                  <span>{t(activeLang, 'switchToDemo')}</span>
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" aria-hidden="true" />
                  <span>{t(activeLang, 'enableLiveCamera')}</span>
                </>
              )}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Loupe Viewport */}
        <div className="lg:col-span-7 surface-card rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-theme aspect-[4/3]">
            <video ref={videoRef} className="hidden" playsInline muted autoPlay />
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              className="w-full h-full object-contain"
              aria-label="Digital magnifier viewport"
            />
            <div className="absolute top-3 left-3 bg-black/80 text-white px-3 py-1.5 rounded-full text-xs font-extrabold border border-white/20 flex items-center gap-2">
              <span className="font-mono-nums text-amber-300">{zoom.toFixed(1)}x</span>
              <span>· {frozen ? 'FRAME FROZEN' : cameraStatus}</span>
            </div>
          </div>

          {/* Zoom Controls */}
          <div className="surface-elevated rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold flex items-center gap-2">
                <ZoomIn className="w-4 h-4" aria-hidden="true" />
                Magnification Level
              </span>
              <span className="font-mono-nums text-lg font-extrabold">{zoom.toFixed(1)}x</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
                aria-label="Zoom out"
                className="surface-card min-h-[48px] min-w-[48px] rounded-xl flex items-center justify-center cursor-pointer"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <input
                type="range"
                min="1"
                max="5"
                step="0.2"
                aria-label="Zoom slider"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 h-3 accent-orange-500 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(5, Number((z + 0.5).toFixed(1))))}
                aria-label="Zoom in"
                className="surface-card min-h-[48px] min-w-[48px] rounded-xl flex items-center justify-center cursor-pointer"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Freeze, Flashlight & AI Readout */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setFrozen((f) => !f);
                triggerVibration(40);
              }}
              className={`min-h-[54px] px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer ${
                frozen ? 'btn-accent' : 'surface-elevated'
              }`}
            >
              {frozen ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              <span>{frozen ? t(activeLang, 'unfreezeFrame') : t(activeLang, 'freezeFrame')}</span>
            </button>

            <button
              type="button"
              disabled={!torchSupported}
              onClick={handleToggleTorch}
              className={`min-h-[54px] px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                torchOn ? 'btn-accent' : 'surface-elevated'
              }`}
            >
              <Flashlight className="w-4 h-4" aria-hidden="true" />
              <span>{torchSupported ? (torchOn ? 'Light: ON' : 'Light: OFF') : 'No Torch HW'}</span>
            </button>

            <button
              type="button"
              disabled={isReadingAi}
              onClick={handleAiReadText}
              className="btn-accent min-h-[54px] px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <span>{isReadingAi ? '...' : t(activeLang, 'readAloud')}</span>
            </button>
          </div>
        </div>

        {/* Right: Contrast Filters, Readout & Sample Cards */}
        <div className="lg:col-span-5 space-y-5">
          <div className="surface-card rounded-2xl p-5 space-y-3">
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <Contrast className="w-5 h-5" aria-hidden="true" />
              <span>High-Contrast Color Filters</span>
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  ['normal', 'Natural Color'],
                  ['high-contrast', 'Black & White'],
                  ['yellow-black', 'Yellow on Black'],
                  ['inverted', 'Inverted Dark'],
                ] as Array<[FilterMode, string]>
              ).map(([fId, fLabel]) => (
                <button
                  key={fId}
                  type="button"
                  onClick={() => {
                    setFilterMode(fId);
                    triggerVibration(30);
                  }}
                  className={`min-h-[50px] px-3 rounded-xl text-sm font-extrabold cursor-pointer ${
                    filterMode === fId ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  {fLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="surface-card rounded-2xl p-5 space-y-3">
            <h2 className="font-display text-xl font-bold">Magnified Text Readout</h2>
            <div className="surface-elevated rounded-xl p-4 text-sm sm:text-base font-medium leading-relaxed min-h-[92px]">
              {readoutText}
            </div>
            <button
              type="button"
              onClick={() => speakText(readoutText, voiceSpeed, {lang: activeLang})}
              className="btn-accent w-full min-h-[52px] rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Volume2 className="w-5 h-5" aria-hidden="true" />
              <span>{t(activeLang, 'readAloud')}</span>
            </button>
          </div>

          <div className="surface-card rounded-2xl p-5 space-y-3">
            <h2 className="font-display text-lg font-bold">Sample Fine-Print Targets</h2>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(SAMPLE_LABELS) as SampleLabelKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setMode('sample');
                    setFrozen(false);
                    setSampleKey(key);
                    setCameraStatus(`Demo: ${SAMPLE_LABELS[key].title}`);
                    triggerVibration(35);
                  }}
                  className={`min-h-[48px] px-4 rounded-xl text-left text-sm font-bold cursor-pointer ${
                    mode === 'sample' && sampleKey === key ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  {SAMPLE_LABELS[key].title}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
