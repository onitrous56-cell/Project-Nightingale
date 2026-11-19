import React, {useEffect, useRef, useState} from 'react';
import {ArrowDown, ArrowUp, BookOpen, Camera, CameraOff, Play, Square, Upload} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {speakText, stopSpeech, triggerVibration} from '../utils/multimodal';

interface DyslexiaLensModuleProps {
  onBack: () => void;
  voiceSpeed: number;
}

type TintOverlay = 'none' | 'yellow' | 'blue' | 'mint';

const SAMPLE_PARAGRAPHS = [
  {
    label: 'Biology Sample',
    text: 'Photosynthesis is the process used by green plants and certain organisms to transform light energy into chemical energy. During photosynthesis in green plants, light energy is captured and used to convert water, carbon dioxide, and minerals into oxygen and energy-rich organic compounds.',
  },
  {
    label: 'Astronomy Sample',
    text: 'Saturn is the sixth planet from the Sun and the second-largest planet in our solar system. Adorned with thousands of beautiful ringlets, Saturn is not the only planet to have rings, but none are as spectacular or as complex as Saturn’s icy bands.',
  },
];

const TINT_STYLES: Record<TintOverlay, {label: string; bg: string; fg: string}> = {
  none: {label: 'Theme Default', bg: '', fg: ''},
  yellow: {label: 'Pastel Yellow', bg: '#FEF9C3', fg: '#1C1917'},
  blue: {label: 'Calm Blue', bg: '#DBEAFE', fg: '#0F172A'},
  mint: {label: 'Soft Mint', bg: '#DCFCE7', fg: '#064E3B'},
};

export const DyslexiaLensModule: React.FC<DyslexiaLensModuleProps> = ({
  onBack,
  voiceSpeed,
}) => {
  const readerBoxRef = useRef<HTMLDivElement | null>(null);
  const timerFallbackRef = useRef<number | null>(null);

  const [sourceText, setSourceText] = useState(SAMPLE_PARAGRAPHS[0].text);
  const [useDyslexicFont, setUseDyslexicFont] = useState(true);
  const [fontSize, setFontSize] = useState(22);
  const [letterSpacing, setLetterSpacing] = useState(0.06);
  const [lineHeight, setLineHeight] = useState(2.0);
  const [tint, setTint] = useState<TintOverlay>('yellow');

  const [rulerEnabled, setRulerEnabled] = useState(true);
  const [rulerY, setRulerY] = useState(96);
  const [isDraggingRuler, setIsDraggingRuler] = useState(false);

  const [isReading, setIsReading] = useState(false);
  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Build word token list with character offsets for speechSynthesis.onboundary mapping
  const wordTokens = React.useMemo(() => {
    const tokens: Array<{word: string; start: number; end: number}> = [];
    const regex = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(sourceText)) !== null) {
      tokens.push({
        word: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
    return tokens;
  }, [sourceText]);

  const [cameraActive, setCameraActive] = useState(false);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);

  const stopReading = () => {
    stopSpeech();
    if (timerFallbackRef.current) {
      window.clearInterval(timerFallbackRef.current);
      timerFallbackRef.current = null;
    }
    setIsReading(false);
    setActiveWordIndex(-1);
  };

  const stopCamera = () => {
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((t) => t.stop());
      liveStreamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    try {
      setUploadStatus(null);
      stopCamera();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera unavailable');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: {ideal: 'environment'}, width: {ideal: 640}, height: {ideal: 480}},
      });
      liveStreamRef.current = stream;
      setCameraActive(true);
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        await liveVideoRef.current.play();
      }
    } catch {
      setUploadStatus('Camera unavailable. You can upload an image or choose a sample paragraph.');
      setCameraActive(false);
    }
  };

  const captureAndOcrCameraFeed = async () => {
    if (!liveVideoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = liveVideoRef.current.videoWidth || 640;
    canvas.height = liveVideoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(liveVideoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      triggerVibration(50);
      stopCamera();
      setUploadStatus('Scanning live camera frame for text...');
      const win = window as unknown as {
        Tesseract?: {
          recognize: (img: string, lang: string) => Promise<{data: {text: string}}>;
        };
      };
      if (!win.Tesseract) {
        await new Promise<void>((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
          script.onload = () => resolve();
          script.onerror = () => resolve();
          document.head.appendChild(script);
        });
      }
      if (win.Tesseract) {
        try {
          const res = await win.Tesseract.recognize(dataUrl, 'eng');
          const extracted = res.data.text.trim().replace(/\s+/g, ' ');
          if (extracted.length > 3) {
            setSourceText(extracted);
            setUploadStatus('Extracted text from live camera scan.');
          } else {
            setUploadStatus('No readable text detected in camera frame.');
          }
        } catch {
          setUploadStatus('Could not read text from camera frame.');
        }
      }
    }
  };

  useEffect(() => {
    return () => {
      stopSpeech();
      stopCamera();
      if (timerFallbackRef.current) {
        window.clearInterval(timerFallbackRef.current);
      }
    };
  }, []);

  const handleReadAloud = () => {
    if (isReading) {
      stopReading();
      return;
    }
    if (!sourceText.trim() || wordTokens.length === 0) return;

    triggerVibration(60);
    setIsReading(true);
    setActiveWordIndex(0);

    let boundaryFired = false;
    // Fallback interval in case browser TTS does not emit word boundary events
    const approxMsPerWord = Math.round(370 / voiceSpeed);
    timerFallbackRef.current = window.setInterval(() => {
      if (boundaryFired) return;
      setActiveWordIndex((prev) => {
        if (prev + 1 >= wordTokens.length) {
          if (timerFallbackRef.current) window.clearInterval(timerFallbackRef.current);
          return prev;
        }
        return prev + 1;
      });
    }, approxMsPerWord);

    speakText(sourceText, voiceSpeed, {
      onWordBoundary: (charIndex) => {
        boundaryFired = true;
        const foundIdx = wordTokens.findIndex(
          (t) => charIndex >= t.start && charIndex <= t.end + 1
        );
        if (foundIdx !== -1) {
          setActiveWordIndex(foundIdx);
        }
      },
      onEnd: () => {
        if (timerFallbackRef.current) {
          window.clearInterval(timerFallbackRef.current);
          timerFallbackRef.current = null;
        }
        setIsReading(false);
        setActiveWordIndex(-1);
      },
    });
  };

  const handleRulerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRuler || !readerBoxRef.current) return;
    const rect = readerBoxRef.current.getBoundingClientRect();
    const y = Math.max(24, Math.min(rect.height - 64, e.clientY - rect.top - 28));
    setRulerY(y);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus('Extracting text from uploaded page...');
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const win = window as unknown as {
        Tesseract?: {
          recognize: (img: string, lang: string) => Promise<{data: {text: string}}>;
        };
      };
      if (!win.Tesseract) {
        await new Promise<void>((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
          script.onload = () => resolve();
          script.onerror = () => resolve();
          document.head.appendChild(script);
        });
      }
      if (win.Tesseract) {
        try {
          const res = await win.Tesseract.recognize(dataUrl, 'eng');
          const extracted = res.data.text.trim().replace(/\s+/g, ' ');
          if (extracted.length > 3) {
            setSourceText(extracted);
            setUploadStatus('Extracted text from image into Dyslexia Lens.');
          } else {
            setUploadStatus('No clear text detected; keeping current text.');
          }
        } catch {
          setUploadStatus('OCR could not read that image. You can paste text directly below.');
        }
      } else {
        setUploadStatus('OCR script offline; paste text directly or load a sample paragraph.');
      }
    };
    reader.readAsDataURL(file);
  };

  const activeTint = TINT_STYLES[tint];

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        moduleId="dyslexia"
        title="Dyslexia Reading & Focus Lens"
        subtitle="07 · Accessible Learning"
        onBack={() => {
          stopReading();
          onBack();
        }}
        actionSlot={
          <button
            type="button"
            onClick={handleReadAloud}
            className="btn-accent min-h-[56px] px-5 rounded-xl font-extrabold flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            {isReading ? (
              <>
                <Square className="w-5 h-5" aria-hidden="true" />
                <span>Stop Reading</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5" aria-hidden="true" />
                <span>Read Aloud with Highlight</span>
              </>
            )}
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Controls Column */}
        <div className="lg:col-span-4 surface-card rounded-2xl p-5 space-y-5">
          <h2 className="font-display text-xl font-bold">Lens & Spacing Controls</h2>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setUseDyslexicFont((v) => !v)}
              className={`min-h-[56px] px-3 rounded-xl font-bold text-sm cursor-pointer ${
                useDyslexicFont ? 'btn-accent' : 'surface-elevated'
              }`}
            >
              {useDyslexicFont ? 'OpenDyslexic: ON' : 'OpenDyslexic: OFF'}
            </button>
            <button
              type="button"
              onClick={() => setRulerEnabled((v) => !v)}
              className={`min-h-[56px] px-3 rounded-xl font-bold text-sm cursor-pointer ${
                rulerEnabled ? 'btn-accent' : 'surface-elevated'
              }`}
            >
              {rulerEnabled ? 'Reading Ruler: ON' : 'Reading Ruler: OFF'}
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm font-bold mb-1">
                <label htmlFor="dyslexia-size">Font Size</label>
                <span className="font-mono-nums">{fontSize}px</span>
              </div>
              <input
                id="dyslexia-size"
                type="range"
                min="18"
                max="34"
                value={fontSize}
                onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                className="w-full h-3 accent-current cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-sm font-bold mb-1">
                <label htmlFor="dyslexia-letter">Letter Spacing</label>
                <span className="font-mono-nums">{letterSpacing.toFixed(2)}em</span>
              </div>
              <input
                id="dyslexia-letter"
                type="range"
                min="0"
                max="0.16"
                step="0.02"
                value={letterSpacing}
                onChange={(e) => setLetterSpacing(parseFloat(e.target.value))}
                className="w-full h-3 accent-current cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-sm font-bold mb-1">
                <label htmlFor="dyslexia-line">Line Spacing</label>
                <span className="font-mono-nums">{lineHeight.toFixed(1)}x</span>
              </div>
              <input
                id="dyslexia-line"
                type="range"
                min="1.5"
                max="2.8"
                step="0.1"
                value={lineHeight}
                onChange={(e) => setLineHeight(parseFloat(e.target.value))}
                className="w-full h-3 accent-current cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold">Tinted Reading Overlay</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(TINT_STYLES) as TintOverlay[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTint(key)}
                  className={`min-h-[48px] px-3 rounded-xl text-sm font-bold cursor-pointer ${
                    tint === key ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  {TINT_STYLES[key].label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-theme">
            <p className="text-sm font-bold">Input Source &amp; Live Camera Scan</p>
            {cameraActive && (
              <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-black border-2 border-theme my-2 shadow-inner">
                <video
                  ref={liveVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/75 px-2.5 py-1 rounded-md text-[10px] font-bold text-white">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span>LIVE CAMERA FEED</span>
                </div>
                <button
                  type="button"
                  onClick={captureAndOcrCameraFeed}
                  className="btn-accent absolute bottom-2 left-2 right-2 min-h-[46px] rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>Capture &amp; Read Text From Live Feed</span>
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={cameraActive ? stopCamera : startCamera}
                className={`${cameraActive ? 'btn-accent' : 'surface-elevated'} min-h-[48px] px-3.5 rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer`}
              >
                {cameraActive ? (
                  <>
                    <CameraOff className="w-4 h-4" aria-hidden="true" />
                    <span>Stop Camera</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" aria-hidden="true" />
                    <span>Live Camera Scan</span>
                  </>
                )}
              </button>

              {SAMPLE_PARAGRAPHS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => {
                    stopReading();
                    setSourceText(sample.text);
                  }}
                  className="surface-elevated min-h-[48px] px-3 rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" aria-hidden="true" />
                  <span>{sample.label}</span>
                </button>
              ))}
              <label className="surface-elevated min-h-[48px] px-3 rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>Upload Page</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="sr-only" />
              </label>
            </div>
            {uploadStatus && <p className="text-xs font-bold text-muted">{uploadStatus}</p>}
          </div>
        </div>

        {/* Reading Surface + Paste Editor */}
        <div className="lg:col-span-8 space-y-5">
          {rulerEnabled && (
            <div className="surface-card rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold">
                Reading Ruler Active — Drag spotlight bar or use buttons
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRulerY((y) => Math.max(20, y - 34))}
                  className="surface-elevated min-h-[48px] px-4 rounded-xl font-bold flex items-center gap-1 cursor-pointer"
                >
                  <ArrowUp className="w-4 h-4" aria-hidden="true" />
                  <span>Line Up</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRulerY((y) => Math.min(280, y + 34))}
                  className="surface-elevated min-h-[48px] px-4 rounded-xl font-bold flex items-center gap-1 cursor-pointer"
                >
                  <ArrowDown className="w-4 h-4" aria-hidden="true" />
                  <span>Line Down</span>
                </button>
              </div>
            </div>
          )}

          {/* Formatted Reading Lens Surface */}
          <div
            ref={readerBoxRef}
            onPointerMove={handleRulerPointerMove}
            onPointerUp={() => setIsDraggingRuler(false)}
            onPointerLeave={() => setIsDraggingRuler(false)}
            className={`relative rounded-2xl border-2 border-theme p-6 sm:p-8 overflow-hidden select-text ${
              useDyslexicFont ? 'font-dyslexic' : ''
            } ${tint === 'none' ? 'surface-card' : ''}`}
            style={{
              backgroundColor: activeTint.bg || undefined,
              color: activeTint.fg || undefined,
              fontSize: `${fontSize}px`,
              letterSpacing: `${letterSpacing}em`,
              wordSpacing: useDyslexicFont ? '0.18em' : '0.06em',
              lineHeight,
            }}
          >
            <p className="relative z-10">
              {wordTokens.map((tok, idx) => {
                const isWordActive = idx === activeWordIndex;
                return (
                  <React.Fragment key={`${tok.start}-${idx}`}>
                    <span
                      className={
                        isWordActive
                          ? 'bg-amber-400 text-slate-950 rounded px-1 font-bold underline decoration-2'
                          : ''
                      }
                    >
                      {tok.word}
                    </span>{' '}
                  </React.Fragment>
                );
              })}
            </p>

            {/* Draggable Reading Ruler Dimming Bands */}
            {rulerEnabled && (
              <>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 right-0 top-0 z-20 bg-black/45 transition-all duration-75"
                  style={{height: `${rulerY}px`}}
                />
                <div
                  onPointerDown={() => setIsDraggingRuler(true)}
                  role="slider"
                  aria-label="Draggable horizontal reading ruler"
                  aria-valuenow={Math.round(rulerY)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') setRulerY((y) => Math.max(16, y - 24));
                    if (e.key === 'ArrowDown') setRulerY((y) => Math.min(300, y + 24));
                  }}
                  className="absolute left-0 right-0 z-30 h-16 border-y-4 border-blue-600 bg-transparent cursor-ns-resize flex items-center justify-end pr-3"
                  style={{top: `${rulerY}px`}}
                >
                  <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-md shadow">
                    Drag Ruler
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-0 right-0 bottom-0 z-20 bg-black/45 transition-all duration-75"
                  style={{top: `${rulerY + 64}px`}}
                />
              </>
            )}
          </div>

          {/* Paste / Edit Source Text */}
          <div className="surface-card rounded-2xl p-5 space-y-2">
            <label htmlFor="paste-dyslexia-text" className="block text-sm font-bold">
              Paste or Edit Reading Passage
            </label>
            <textarea
              id="paste-dyslexia-text"
              rows={4}
              value={sourceText}
              onChange={(e) => {
                stopReading();
                setSourceText(e.target.value);
              }}
              className="surface-elevated w-full rounded-xl p-4 text-base leading-relaxed"
            />
          </div>
        </div>
      </div>
    </section>
  );
};
