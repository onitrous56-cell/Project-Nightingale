import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Banknote,
  Camera,
  CameraOff,
  Crosshair,
  Eye,
  Palette,
  Pause,
  Play,
  Radio,
  ScanText,
  Sparkles,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {LanguageCode, MultimodalAlert} from '../types';
import {
  getLanguageMeta,
  getLocalizedModuleMeta,
  t,
  useAppLanguage,
} from '../utils/i18n';
import {
  classifyColor,
  ColorAnalysis,
  localizeColorAnalysis,
  playAlertSound,
  speakText,
  stopSpeech,
  triggerVibration,
} from '../utils/multimodal';

interface VisionNarratorModuleProps {
  onBack: () => void;
  defaultVoiceSpeed: number;
  language?: LanguageCode;
  batterySaverActive?: boolean;
  onEmitAlert: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

type NarratorMode = 'scene' | 'color' | 'currency';
type SamplePresetKey = 'medicine' | 'currency' | 'currency_inr' | 'sign';

interface SamplePreset {
  key: SamplePresetKey;
  recommendedMode: NarratorMode;
  label: string;
  sceneName: string;
  extractedText: string;
  dominantColorHint: string;
}

interface StructuredVisionResult {
  primaryResult: string;
  spokenSummary: string;
  details: string[];
  currencyTotal?: string;
  dominantColors?: string[];
  confidence?: 'high' | 'medium' | 'low';
}

const SAMPLE_PRESETS: SamplePreset[] = [
  {
    key: 'medicine',
    recommendedMode: 'scene',
    label: 'Medicine Bottle',
    sceneName: 'Prescription Bottle Label',
    extractedText:
      'RX: AMOXICILLIN 500 MG. Take 1 capsule by mouth every 8 hours with water. Refills remaining: 2.',
    dominantColorHint: 'Warm Amber & Bright White',
  },
  {
    key: 'currency_inr',
    recommendedMode: 'currency',
    label: 'Currency Note (₹500)',
    sceneName: 'Indian 500 Rupee Banknote',
    extractedText:
      'FIVE HUNDRED RUPEES (₹500) — Reserve Bank of India — Stone Gray banknote with Red Fort motif.',
    dominantColorHint: 'Slate Gray & Olive',
  },
  {
    key: 'currency',
    recommendedMode: 'currency',
    label: 'Currency Note ($20)',
    sceneName: 'Twenty Dollar Banknote',
    extractedText:
      'RESERVE NOTE — TWENTY DOLLARS ($20) — Legal Tender — Mint Green & Charcoal.',
    dominantColorHint: 'Mint Green & Charcoal',
  },
  {
    key: 'sign',
    recommendedMode: 'scene',
    label: 'Street Sign',
    sceneName: 'Pedestrian Crossing & Street Sign',
    extractedText: 'ONE WAY — OAKWOOD AVE & 4TH ST — PEDESTRIAN CROSSING AHEAD.',
    dominantColorHint: 'High-Vis Yellow & Pure Black',
  },
];

declare global {
  interface Window {
    Tesseract?: {
      recognize: (
        image: HTMLCanvasElement | string,
        lang: string,
        opts?: {logger?: (m: {status: string; progress: number}) => void}
      ) => Promise<{data: {text: string}}>;
    };
  }
}

function detectCurrencyOffline(text: string, colorName: string): string | null {
  const norm = text.toUpperCase();
  const inrMatch = norm.match(/(?:₹|RS\.?|INR|RUPEES?)\s*(2000|500|200|100|50|20|10)\b/);
  if (inrMatch) {
    return `₹${inrMatch[1]} Indian Rupee Note`;
  }
  const usdMatch = norm.match(/(?:\$|USD|DOLLARS?)\s*(100|50|20|10|5|2|1)\b/);
  if (usdMatch) {
    return `$${usdMatch[1]} US Dollar Bill`;
  }
  if (/FIVE HUNDRED RUPEES|500/.test(norm) && /RESERVE BANK|RUPEE|₹/.test(norm)) {
    return '₹500 Indian Rupee Note';
  }
  if (/TWO HUNDRED|200/.test(norm) && /RESERVE BANK|RUPEE|₹/.test(norm)) {
    return '₹200 Indian Rupee Note';
  }
  if (/TWENTY DOLLARS/.test(norm)) {
    return '$20 US Dollar Bill';
  }
  if (/BANK|RESERVE NOTE|TENDER|CURRENCY/.test(norm)) {
    return `Banknote detected (${colorName})`;
  }
  return null;
}

function createContrastEnhancedCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const srcCtx = source.getContext('2d', {willReadFrequently: true});
  const outCtx = out.getContext('2d', {willReadFrequently: true});
  if (!srcCtx || !outCtx) return source;

  const img = srcCtx.getImageData(0, 0, source.width, source.height);
  const d = img.data;
  let minLum = 255;
  let maxLum = 0;

  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const range = Math.max(24, maxLum - minLum);
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    let stretched = ((lum - minLum) / range) * 255;
    // Slight S-curve sharpening for printed typography & banknote numerals
    stretched = stretched > 128 ? Math.min(255, stretched * 1.08) : Math.max(0, stretched * 0.92);
    d[i] = stretched;
    d[i + 1] = stretched;
    d[i + 2] = stretched;
  }
  outCtx.putImageData(img, 0, 0);
  return out;
}

export const VisionNarratorModule: React.FC<VisionNarratorModuleProps> = ({
  onBack,
  defaultVoiceSpeed,
  language,
  batterySaverActive = false,
  onEmitAlert,
}) => {
  const activeLang = useAppLanguage(language);
  const moduleMeta = getLocalizedModuleMeta(activeLang, 'vision');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const batterySaverRef = useRef<boolean>(batterySaverActive);
  batterySaverRef.current = batterySaverActive;

  const [narratorMode, setNarratorMode] = useState<NarratorMode>('scene');
  const [sourceMode, setSourceMode] = useState<'camera' | 'sample'>('camera');
  const [isFrozen, setIsFrozen] = useState(false);
  const isFrozenRef = useRef(false);
  isFrozenRef.current = isFrozen;

  const [crosshairPos, setCrosshairPos] = useState<{x: number; y: number}>({x: 0.5, y: 0.5});
  const crosshairPosRef = useRef(crosshairPos);
  crosshairPosRef.current = crosshairPos;

  const [samplerBoxSize, setSamplerBoxSize] = useState<12 | 28>(12);
  const samplerBoxRef = useRef<12 | 28>(12);
  samplerBoxRef.current = samplerBoxSize;

  const [activePreset, setActivePreset] = useState<SamplePresetKey>('medicine');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [speechRate, setSpeechRate] = useState<number>(defaultVoiceSpeed);

  const [rawCrosshairColor, setRawCrosshairColor] = useState<ColorAnalysis>(() =>
    classifyColor(234, 179, 8)
  );
  const localizedColor = localizeColorAnalysis(rawCrosshairColor, activeLang);

  const [edgeLevel, setEdgeLevel] = useState<string>('High Contrast Edge');
  const [capturedText, setCapturedText] = useState<string>(
    'Live camera feed active. Select Scene, Color, or Currency mode, tap anywhere to aim crosshair, and run AI Readout.'
  );
  const [structuredResult, setStructuredResult] = useState<StructuredVisionResult | null>(null);
  const [ocrStatus, setOcrStatus] = useState<string>('Live Camera Active');
  const [isProcessingOcr, setIsProcessingOcr] = useState(false);
  const [isDescribingAi, setIsDescribingAi] = useState(false);
  const [continuousAutoReadout, setContinuousAutoReadout] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

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
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const drawSampleScene = useCallback((presetKey: SamplePresetKey) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (presetKey === 'medicine') {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#B45309';
      ctx.fillRect(w * 0.28, h * 0.14, w * 0.44, h * 0.78);
      ctx.fillStyle = '#F8FAFC';
      ctx.fillRect(w * 0.31, h * 0.05, w * 0.38, h * 0.11);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(w * 0.3, h * 0.28, w * 0.4, h * 0.48);
      ctx.fillStyle = '#DC2626';
      ctx.fillRect(w * 0.3, h * 0.28, w * 0.4, 38);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText('RX PHARMACY', w * 0.34, h * 0.28 + 27);
      ctx.fillStyle = '#0F172A';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('AMOXICILLIN 500MG', w * 0.32, h * 0.42);
      ctx.font = '22px sans-serif';
      ctx.fillText('Take 1 capsule every', w * 0.32, h * 0.51);
      ctx.fillText('8 hours with water.', w * 0.32, h * 0.58);
      ctx.fillText('Refills: 2', w * 0.32, h * 0.67);
    } else if (presetKey === 'currency_inr') {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, w, h);
      // Stone grey-olive banknote body
      ctx.fillStyle = '#9EA39A';
      ctx.fillRect(w * 0.08, h * 0.18, w * 0.84, h * 0.64);
      ctx.strokeStyle = '#585F52';
      ctx.lineWidth = 10;
      ctx.strokeRect(w * 0.1, h * 0.21, w * 0.8, h * 0.58);
      ctx.fillStyle = '#33382F';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('RESERVE BANK OF INDIA', w * 0.16, h * 0.31);
      ctx.font = 'bold 96px sans-serif';
      ctx.fillText('₹500', w * 0.38, h * 0.55);
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('FIVE HUNDRED RUPEES', w * 0.29, h * 0.69);
    } else if (presetKey === 'currency') {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#D1FAE5';
      ctx.fillRect(w * 0.1, h * 0.2, w * 0.8, h * 0.6);
      ctx.strokeStyle = '#065F46';
      ctx.lineWidth = 10;
      ctx.strokeRect(w * 0.12, h * 0.23, w * 0.76, h * 0.54);
      ctx.fillStyle = '#064E3B';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('RESERVE NOTE', w * 0.17, h * 0.33);
      ctx.font = 'bold 94px sans-serif';
      ctx.fillText('$20', w * 0.4, h * 0.55);
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('TWENTY DOLLARS', w * 0.33, h * 0.67);
    } else {
      ctx.fillStyle = '#1E293B';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#FACC15';
      ctx.fillRect(w * 0.14, h * 0.15, w * 0.72, h * 0.7);
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 10;
      ctx.strokeRect(w * 0.16, h * 0.18, w * 0.68, h * 0.64);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText('ONE WAY', w * 0.36, h * 0.35);
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText('OAKWOOD AVE & 4TH ST', w * 0.24, h * 0.52);
      ctx.font = 'bold 26px sans-serif';
      ctx.fillText('PEDESTRIAN CROSSING', w * 0.28, h * 0.66);
    }
  }, []);

  // Precision trimmed-mean outlier-filtered RGB sampling + CIELAB perceptual matching
  const samplePointAndEdges = useCallback((normX?: number, normY?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) return;

    const pos =
      typeof normX === 'number' && typeof normY === 'number'
        ? {x: normX, y: normY}
        : crosshairPosRef.current;
    const box = samplerBoxRef.current;
    const half = Math.floor(box / 2);
    const cx = Math.max(half, Math.min(canvas.width - half - 1, Math.round(pos.x * canvas.width)));
    const cy = Math.max(half, Math.min(canvas.height - half - 1, Math.round(pos.y * canvas.height)));

    const data = ctx.getImageData(cx - half, cy - half, box, box).data;
    const pixels: Array<{r: number; g: number; b: number; lum: number}> = [];
    let minLum = 255;
    let maxLum = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
      pixels.push({r, g, b, lum});
    }

    // Sort by luminance and trim top & bottom 15% to reject glare & deep sensor noise shadows
    pixels.sort((a, b) => a.lum - b.lum);
    const trimCount = Math.floor(pixels.length * 0.15);
    const trimmed = pixels.slice(trimCount, Math.max(trimCount + 1, pixels.length - trimCount));

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    for (const px of trimmed) {
      rSum += px.r;
      gSum += px.g;
      bSum += px.b;
    }

    const analysis = classifyColor(
      rSum / trimmed.length,
      gSum / trimmed.length,
      bSum / trimmed.length
    );
    setRawCrosshairColor(analysis);

    const contrastDelta = maxLum - minLum;
    setEdgeLevel(
      contrastDelta > 75
        ? 'High Contrast Boundary'
        : contrastDelta > 30
          ? 'Moderate Texture'
          : 'Uniform Surface'
    );
    return analysis;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsFrozen(false);
    stopCamera();
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API unavailable in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {ideal: 'environment'},
          width: {ideal: 1280},
          height: {ideal: 720},
        },
      });
      streamRef.current = stream;
      setSourceMode('camera');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      let frameCounter = 0;
      const renderLoop = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas && video.readyState >= 2 && !isFrozenRef.current) {
          const ctx = canvas.getContext('2d', {willReadFrequently: true});
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            frameCounter++;
            if (frameCounter % 8 === 0) {
              samplePointAndEdges();
            }
          }
        }
        if (batterySaverRef.current) {
          timerRef.current = window.setTimeout(renderLoop, 260);
        } else {
          rafRef.current = requestAnimationFrame(renderLoop);
        }
      };
      rafRef.current = requestAnimationFrame(renderLoop);
      setOcrStatus('Live HD Camera Active');
    } catch {
      setCameraError(
        'Live camera feed is unavailable or blocked in this browser preview. Switched to Interactive Demo Scenes.'
      );
      setSourceMode('sample');
      drawSampleScene('medicine');
      samplePointAndEdges();
    }
  }, [drawSampleScene, samplePointAndEdges, stopCamera]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      stopSpeech();
    };
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (sourceMode === 'sample') {
      drawSampleScene(activePreset);
      samplePointAndEdges();
    }
  }, [sourceMode, activePreset, drawSampleScene, samplePointAndEdges]);

  const speakWithState = useCallback(
    (text: string) => {
      setIsSpeaking(true);
      speakText(text, speechRate, {
        lang: activeLang,
        onEnd: () => setIsSpeaking(false),
      });
    },
    [activeLang, speechRate]
  );

  // Continuous Auto-Readout interval
  useEffect(() => {
    if (!continuousAutoReadout) return;
    const interval = setInterval(() => {
      const fresh = samplePointAndEdges();
      const loc = localizeColorAnalysis(fresh ?? rawCrosshairColor, activeLang);
      const message = `${loc.brightnessLabel} ${loc.name}.`;
      speakWithState(message);
    }, 4500);

    return () => clearInterval(interval);
  }, [activeLang, continuousAutoReadout, rawCrosshairColor, samplePointAndEdges, speakWithState]);

  const loadTesseractIfNeeded = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (window.Tesseract) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.async = true;
      script.onload = () => resolve(!!window.Tesseract);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  };

  const handleCanvasTap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = Math.max(0.06, Math.min(0.94, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0.08, Math.min(0.92, (e.clientY - rect.top) / rect.height));
    setCrosshairPos({x: nx, y: ny});
    crosshairPosRef.current = {x: nx, y: ny};
    triggerVibration(35);
    const updated = samplePointAndEdges(nx, ny);
    if (updated && narratorMode === 'color') {
      const loc = localizeColorAnalysis(updated, activeLang);
      speakWithState(`${loc.brightnessLabel} ${loc.name}`);
    }
  };

  const handleCaptureAndAnalyzeOcr = async () => {
    triggerVibration([80, 40, 80]);
    playAlertSound('chime');
    const latestColor = localizeColorAnalysis(
      samplePointAndEdges() ?? rawCrosshairColor,
      activeLang
    );

    if (sourceMode === 'sample') {
      const preset = SAMPLE_PRESETS.find((p) => p.key === activePreset) ?? SAMPLE_PRESETS[0];
      setStructuredResult({
        primaryResult: preset.sceneName,
        spokenSummary: preset.extractedText,
        details: [
          `${latestColor.brightnessLabel} ${latestColor.name} (${latestColor.hex})`,
          preset.dominantColorHint,
        ],
        confidence: 'high',
      });
      setCapturedText(preset.extractedText);
      setOcrStatus(`Analyzed ${preset.sceneName}`);
      speakWithState(preset.extractedText);
      onEmitAlert({
        title: `Vision Narrator: ${preset.sceneName}`,
        message: `${latestColor.name} · ${preset.extractedText}`,
        severity: 'info',
      });
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsProcessingOcr(true);
    setOcrStatus('Enhancing contrast & loading OCR...');

    const enhancedCanvas = createContrastEnhancedCanvas(canvas);
    const ocrLang = getLanguageMeta(activeLang).ocrLang || 'eng';
    const loaded = await loadTesseractIfNeeded();

    if (loaded && window.Tesseract) {
      try {
        setOcrStatus(`Scanning text (${ocrLang})...`);
        let result;
        try {
          result = await window.Tesseract.recognize(enhancedCanvas, ocrLang, {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                setOcrStatus(`Recognizing text (${Math.round(m.progress * 100)}%)`);
              }
            },
          });
        } catch {
          // Fallback cleanly to English traineddata if regional language pack fails to fetch
          result = await window.Tesseract.recognize(enhancedCanvas, 'eng');
        }
        const cleanText = result.data.text.trim().replace(/\s+/g, ' ');
        const currencyGuess = detectCurrencyOffline(cleanText, latestColor.name);
        const finalReport =
          currencyGuess
            ? `${currencyGuess}. ${cleanText}`
            : cleanText.length > 2
              ? cleanText
              : `${latestColor.brightnessLabel} ${latestColor.name} (${latestColor.hex}) · ${edgeLevel}`;

        setStructuredResult(
          currencyGuess
            ? {
                primaryResult: currencyGuess,
                spokenSummary: finalReport,
                currencyTotal: currencyGuess.split(' ')[0],
                details: [cleanText.slice(0, 120)],
                confidence: 'medium',
              }
            : null
        );
        setCapturedText(finalReport);
        setOcrStatus('OCR Scan Complete');
        speakWithState(finalReport);
        onEmitAlert({
          title: currencyGuess || `OCR · ${latestColor.name}`,
          message: finalReport,
          severity: 'info',
        });
      } catch {
        const fallbackMsg = `${latestColor.brightnessLabel} ${latestColor.name} (${latestColor.hex}) · ${edgeLevel}.`;
        setCapturedText(fallbackMsg);
        setOcrStatus('Color & Contrast analyzed');
        speakWithState(fallbackMsg);
      }
    } else {
      const fallbackMsg = `${latestColor.brightnessLabel} ${latestColor.name} (${latestColor.hex}) · ${edgeLevel}.`;
      setCapturedText(fallbackMsg);
      setOcrStatus('Offline Color & Contrast complete');
      speakWithState(fallbackMsg);
    }
    setIsProcessingOcr(false);
  };

  const handleAiVisionAnalyze = async (forcedMode?: NarratorMode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const modeToRun = forcedMode ?? narratorMode;

    triggerVibration([60, 30, 60]);
    playAlertSound('chime');
    setIsDescribingAi(true);
    setOcrStatus('AI Vision analyzing frame...');
    const latestRaw = samplePointAndEdges() ?? rawCrosshairColor;
    const latestLoc = localizeColorAnalysis(latestRaw, activeLang);

    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const res = await fetch('/api/gemini/vision-analyze', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          imageDataUrl: dataUrl,
          mode: modeToRun,
          language: activeLang,
          crosshairHint: `Point at (${Math.round(crosshairPos.x * 100)}%, ${Math.round(
            crosshairPos.y * 100
          )}%): ${latestRaw.brightnessLabel} ${latestRaw.name} (${latestRaw.hex}), ${edgeLevel}`,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'AI vision service unavailable');
      }

      const data = (await res.json()) as StructuredVisionResult;
      setStructuredResult(data);
      const displaySummary = data.spokenSummary || data.primaryResult || 'Analysis complete.';
      setCapturedText(displaySummary);
      setOcrStatus(`AI (${modeToRun.toUpperCase()}) · ${(data.confidence || 'high').toUpperCase()}`);
      speakWithState(displaySummary);
      onEmitAlert({
        title: data.primaryResult || 'Vision Narrator',
        message: displaySummary.slice(0, 120),
        severity: 'info',
      });
    } catch {
      const preset =
        sourceMode === 'sample'
          ? SAMPLE_PRESETS.find((p) => p.key === activePreset)
          : undefined;
      const fallbackMsg = preset
        ? `${preset.sceneName}: ${preset.extractedText} (${latestLoc.brightnessLabel} ${latestLoc.name})`
        : `${latestLoc.brightnessLabel} ${latestLoc.name} (${latestLoc.hex}) · ${edgeLevel}`;
      setStructuredResult({
        primaryResult: preset ? preset.sceneName : `${latestLoc.brightnessLabel} ${latestLoc.name}`,
        spokenSummary: fallbackMsg,
        details: [edgeLevel, latestLoc.hex],
        confidence: 'medium',
      });
      setCapturedText(fallbackMsg);
      setOcrStatus('Offline Color/Preset Fallback');
      speakWithState(fallbackMsg);
    } finally {
      setIsDescribingAi(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    stopCamera();
    setSourceMode('sample');
    setIsFrozen(false);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', {willReadFrequently: true});
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        samplePointAndEdges();
        await handleAiVisionAnalyze(narratorMode);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleAnnounceColorOnly = () => {
    triggerVibration(70);
    const latest = localizeColorAnalysis(
      samplePointAndEdges() ?? rawCrosshairColor,
      activeLang
    );
    const msg = `${latest.brightnessLabel} ${latest.name}.`;
    setStructuredResult({
      primaryResult: `${latest.brightnessLabel} ${latest.name}`,
      spokenSummary: msg,
      dominantColors: [latest.name],
      details: [`Hex ${latest.hex}`, edgeLevel],
      confidence: 'high',
    });
    setCapturedText(`${latest.brightnessLabel} ${latest.name} (${latest.hex}) · ${edgeLevel}`);
    speakWithState(msg);
    onEmitAlert({
      title: `${latest.name}`,
      message: `${latest.hex} · ${edgeLevel}`,
      severity: 'info',
    });
  };

  const primaryAiButtonLabel =
    narratorMode === 'currency'
      ? t(activeLang, 'aiIdentifyCurrency')
      : narratorMode === 'color'
        ? t(activeLang, 'aiIdentifyColor')
        : t(activeLang, 'aiSceneReadout');

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        title={moduleMeta.title}
        subtitle={`01 · ${moduleMeta.domain}`}
        language={activeLang}
        onBack={() => {
          stopCamera();
          stopSpeech();
          onBack();
        }}
        actionSlot={
          <div className="flex flex-wrap items-center gap-2">
            {sourceMode === 'camera' && (
              <button
                type="button"
                onClick={() => {
                  const next = !isFrozen;
                  setIsFrozen(next);
                  triggerVibration(40);
                  if (next) samplePointAndEdges();
                }}
                className={`min-h-[54px] px-4 rounded-xl font-bold flex items-center gap-2 cursor-pointer ${
                  isFrozen ? 'bg-amber-500 text-black' : 'surface-elevated'
                }`}
              >
                {isFrozen ? (
                  <>
                    <Play className="w-4 h-4" aria-hidden="true" />
                    <span>{t(activeLang, 'unfreezeFrame')}</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4" aria-hidden="true" />
                    <span>{t(activeLang, 'freezeFrame')}</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={
                sourceMode === 'camera'
                  ? () => {
                      stopCamera();
                      setSourceMode('sample');
                    }
                  : startCamera
              }
              className="btn-accent min-h-[54px] px-5 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer shadow-md"
            >
              {sourceMode === 'camera' ? (
                <>
                  <CameraOff className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <span>{t(activeLang, 'switchToDemo')}</span>
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <span>{t(activeLang, 'enableLiveCamera')}</span>
                </>
              )}
            </button>
          </div>
        }
      />

      {/* Dedicated Mode Selector: Scene & Labels / Color & Pattern / Currency & Notes */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3" role="tablist" aria-label="Narrator Focus Mode">
        {[
          {id: 'scene' as const, label: t(activeLang, 'modeScene'), Icon: Eye},
          {id: 'color' as const, label: t(activeLang, 'modeColor'), Icon: Palette},
          {id: 'currency' as const, label: t(activeLang, 'modeCurrency'), Icon: Banknote},
        ].map((item) => {
          const active = narratorMode === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setNarratorMode(item.id);
                triggerVibration(40);
                playAlertSound('select');
              }}
              className={`min-h-[54px] px-3 py-2.5 rounded-2xl font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer transition-all ${
                active ? 'btn-accent shadow-md' : 'surface-card border border-theme'
              }`}
            >
              <item.Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      {cameraError && (
        <div role="status" className="surface-elevated rounded-xl p-4 text-sm font-bold border-l-4 border-amber-500">
          {cameraError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Live Camera / Scene Viewport */}
        <div className="lg:col-span-7 surface-card rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-theme aspect-[4/3] shadow-inner">
            <video ref={videoRef} className="hidden" playsInline muted autoPlay />
            <canvas
              ref={canvasRef}
              width={960}
              height={720}
              onClick={handleCanvasTap}
              className="w-full h-full object-contain cursor-crosshair"
              aria-label="Vision Narrator live analysis viewport. Tap anywhere to move sampling crosshair."
            />

            {/* Live Feed Status */}
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-xs font-bold text-white pointer-events-none">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isFrozen
                    ? 'bg-sky-400'
                    : sourceMode === 'camera'
                      ? 'bg-red-500 animate-pulse'
                      : 'bg-amber-400'
                }`}
                aria-hidden="true"
              />
              <span>
                {isFrozen
                  ? 'FROZEN FRAME'
                  : sourceMode === 'camera'
                    ? t(activeLang, 'liveCameraFeed')
                    : t(activeLang, 'demoSceneView')}
              </span>
            </div>

            {/* Sampler Radius & Reset Crosshair Quick Pill */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSamplerBoxSize((prev) => (prev === 12 ? 28 : 12))}
                className="bg-black/75 backdrop-blur-md text-white px-2.5 py-1.5 rounded-lg border border-white/20 text-xs font-bold cursor-pointer"
                title="Toggle spot vs wide color sampling area"
              >
                {samplerBoxSize === 12 ? 'Spot 12px' : 'Wide 28px'}
              </button>
              {(Math.abs(crosshairPos.x - 0.5) > 0.04 || Math.abs(crosshairPos.y - 0.5) > 0.04) && (
                <button
                  type="button"
                  onClick={() => {
                    setCrosshairPos({x: 0.5, y: 0.5});
                    crosshairPosRef.current = {x: 0.5, y: 0.5};
                    samplePointAndEdges(0.5, 0.5);
                  }}
                  className="bg-orange-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Center</span>
                </button>
              )}
            </div>

            {/* Interactive Positioned Crosshair Overlay */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{left: `${crosshairPos.x * 100}%`, top: `${crosshairPos.y * 100}%`}}
            >
              <div
                className={`rounded-full border-2 border-dashed border-orange-400 shadow-[0_0_16px_rgba(255,85,0,0.65)] flex items-center justify-center transition-all ${
                  samplerBoxSize === 12 ? 'w-16 h-16' : 'w-24 h-24'
                }`}
              >
                <div
                  className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                  style={{backgroundColor: localizedColor.hex}}
                />
              </div>
            </div>

            {/* Bottom Live CIELAB Color Tracker Bar */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between bg-black/80 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/15 text-xs text-white pointer-events-none">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-5 h-5 rounded-md border border-white/40 shrink-0"
                  style={{backgroundColor: localizedColor.hex}}
                  aria-hidden="true"
                />
                <span className="font-extrabold truncate">
                  {localizedColor.brightnessLabel} {localizedColor.name}
                </span>
                <span className="text-white/60 font-mono-nums shrink-0">{localizedColor.hex}</span>
              </div>
              <span className="font-bold text-orange-400 shrink-0 ml-2">{edgeLevel}</span>
            </div>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleAiVisionAnalyze()}
              disabled={isDescribingAi}
              className="btn-accent min-h-[58px] px-5 rounded-xl font-extrabold text-base flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <Sparkles className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{isDescribingAi ? '...' : primaryAiButtonLabel}</span>
            </button>

            <button
              type="button"
              onClick={handleCaptureAndAnalyzeOcr}
              disabled={isProcessingOcr}
              className="surface-elevated min-h-[58px] px-5 rounded-xl font-extrabold text-base flex items-center justify-center gap-2 cursor-pointer"
            >
              <ScanText className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{isProcessingOcr ? '...' : t(activeLang, 'scanPrintedText')}</span>
            </button>

            <button
              type="button"
              onClick={handleAnnounceColorOnly}
              className="surface-elevated min-h-[56px] px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Volume2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t(activeLang, 'speakCrosshairColor')}</span>
            </button>

            <label className="surface-elevated min-h-[56px] px-5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t(activeLang, 'analyzeUploadedPhoto')}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="sr-only"
              />
            </label>
          </div>

          {/* Continuous Auto-Readout Switch */}
          <div className="surface-card rounded-xl p-4 flex items-center justify-between gap-3 border border-theme">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Radio className="w-4 h-4 text-orange-500" aria-hidden="true" />
                <span>{t(activeLang, 'continuousAutoReadout')}</span>
              </div>
              <p className="text-xs text-muted">
                Tap anywhere on the preview to reposition the color crosshair.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={continuousAutoReadout}
              onClick={() => {
                const next = !continuousAutoReadout;
                setContinuousAutoReadout(next);
                triggerVibration(50);
                if (!next) {
                  stopSpeech();
                  setIsSpeaking(false);
                }
              }}
              className={`w-14 h-8 rounded-full transition-colors relative cursor-pointer ${
                continuousAutoReadout ? 'bg-orange-500' : 'bg-slate-700'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white transition-transform ${
                  continuousAutoReadout ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Right Column: Structured Readout & Demo Presets */}
        <div className="lg:col-span-5 space-y-5">
          <div className="surface-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-orange-500" aria-hidden="true" />
                <h2 className="font-display text-xl font-bold">
                  {t(activeLang, 'sceneOcrReadout')}
                </h2>
              </div>
              <span className="text-xs font-bold text-muted">{ocrStatus}</span>
            </div>

            {structuredResult && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-lg bg-orange-500/20 text-orange-300 border border-orange-500/40 text-xs font-extrabold">
                  {structuredResult.primaryResult}
                </span>
                {structuredResult.currencyTotal && (
                  <span className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-extrabold">
                    Total: {structuredResult.currencyTotal}
                  </span>
                )}
              </div>
            )}

            <div className="surface-elevated rounded-xl p-4 text-base leading-relaxed font-medium min-h-[100px] border border-theme space-y-2">
              <p>{capturedText}</p>
              {structuredResult?.details && structuredResult.details.length > 0 && (
                <ul className="text-xs text-muted list-disc pl-5 space-y-1">
                  {structuredResult.details.slice(0, 4).map((d, idx) => (
                    <li key={idx}>{d}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => speakWithState(capturedText)}
                className="btn-accent flex-1 min-h-[56px] rounded-xl font-bold text-base flex items-center justify-center gap-2 cursor-pointer"
              >
                <Volume2 className="w-5 h-5" aria-hidden="true" />
                <span>{t(activeLang, 'readAloud')}</span>
              </button>
              {isSpeaking && (
                <button
                  type="button"
                  onClick={() => {
                    stopSpeech();
                    setIsSpeaking(false);
                  }}
                  className="surface-elevated min-h-[56px] px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <VolumeX className="w-4 h-4" aria-hidden="true" />
                  <span>{t(activeLang, 'silence')}</span>
                </button>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-theme">
              <div className="flex items-center justify-between text-sm font-bold">
                <label htmlFor="vision-speed">{t(activeLang, 'narrationSpeed')}</label>
                <span className="font-mono-nums">{speechRate.toFixed(2)}x</span>
              </div>
              <input
                id="vision-speed"
                type="range"
                min="0.6"
                max="1.6"
                step="0.1"
                value={speechRate}
                onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                className="w-full h-3 accent-orange-500 cursor-pointer"
              />
            </div>
          </div>

          <div className="surface-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-orange-500 shrink-0" aria-hidden="true" />
              <h2 className="font-display text-xl font-bold">{t(activeLang, 'demoPresets')}</h2>
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              {SAMPLE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setIsFrozen(false);
                    setSourceMode('sample');
                    setActivePreset(preset.key);
                    setNarratorMode(preset.recommendedMode);
                    setStructuredResult({
                      primaryResult: preset.sceneName,
                      spokenSummary: preset.extractedText,
                      details: [preset.dominantColorHint],
                      confidence: 'high',
                    });
                    setCapturedText(preset.extractedText);
                    setOcrStatus(`${preset.label}`);
                    triggerVibration(60);
                    speakWithState(preset.extractedText);
                  }}
                  className={`min-h-[54px] px-4 rounded-xl text-left font-bold flex items-center justify-between gap-3 cursor-pointer ${
                    sourceMode === 'sample' && activePreset === preset.key
                      ? 'btn-accent'
                      : 'surface-elevated'
                  }`}
                >
                  <span>{preset.label}</span>
                  <span className="text-xs opacity-80">{preset.dominantColorHint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
