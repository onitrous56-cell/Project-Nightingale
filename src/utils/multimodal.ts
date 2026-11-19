import {LanguageCode, VoicePersona} from '../types';
import {
  broadcastLanguageChange,
  getLanguageMeta,
  isSupportedLanguage,
  localizeColorTerm,
} from './i18n';

export function triggerVibration(pattern: number | number[] = 120): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore if blocked in sandboxed iframe
  }
}

export const VOICE_PERSONA_LABELS: Record<VoicePersona, {label: string; desc: string}> = {
  'natural-female': {label: 'Natural Female', desc: 'Warm, clear, friendly feminine tone'},
  'natural-male': {label: 'Natural Male', desc: 'Deep, steady, resonant masculine voice'},
  'human-warm': {label: 'Human Warm', desc: 'Conversational, compassionate human cadence'},
  'human-gentle': {
    label: 'Human Gentle',
    desc: 'Soft, soothing cadence for anxiety & sensory calm',
  },
  robotic: {label: 'Synthesizer Reader', desc: 'Crisp electronic screen-reader tone'},
  system: {label: 'Device Native', desc: 'Operating system standard default voice'},
};

let currentVoicePersona: VoicePersona = 'natural-female';
let currentLanguage: LanguageCode = 'en-US';
let cachedVoices: SpeechSynthesisVoice[] = [];
let activeAudioEl: HTMLAudioElement | null = null;
let activeAudioTimer: number | null = null;
let activeTtsAbort: AbortController | null = null;
const ttsAudioCache = new Map<string, string>();
const MAX_TTS_CACHE = 45;

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const refreshVoices = () => {
    try {
      cachedVoices = window.speechSynthesis.getVoices();
    } catch {
      cachedVoices = [];
    }
  };
  refreshVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
}

export function stopSpeech(): void {
  try {
    if (activeTtsAbort) {
      activeTtsAbort.abort();
      activeTtsAbort = null;
    }
    if (activeAudioTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(activeAudioTimer);
      activeAudioTimer = null;
    }
    if (activeAudioEl) {
      activeAudioEl.pause();
      activeAudioEl.src = '';
      activeAudioEl = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    // Ignore if speechSynthesis is unavailable
  }
}

export function setGlobalVoicePersona(persona: VoicePersona): void {
  currentVoicePersona = persona;
  try {
    localStorage.setItem('ablebridge_voice_persona_v1', persona);
  } catch {
    // Ignore storage errors
  }
}

export function getGlobalVoicePersona(): VoicePersona {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('ablebridge_voice_persona_v1') as VoicePersona;
      if (stored && stored in VOICE_PERSONA_LABELS) {
        return stored;
      }
    } catch {
      // Ignore storage errors
    }
  }
  return currentVoicePersona;
}

export function setGlobalLanguage(lang: LanguageCode): void {
  currentLanguage = isSupportedLanguage(lang) ? lang : 'en-US';
  broadcastLanguageChange(currentLanguage);
}

export function getGlobalLanguage(): LanguageCode {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('ablebridge_language_v1');
      if (isSupportedLanguage(stored)) {
        return stored;
      }
    } catch {
      // Ignore storage errors
    }
  }
  return currentLanguage;
}

function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return [];
  }
  const latest = window.speechSynthesis.getVoices();
  if (latest && latest.length > 0) {
    cachedVoices = latest;
  }
  return cachedVoices;
}

function selectBestVoice(
  persona: VoicePersona,
  lang: LanguageCode
): {voice: SpeechSynthesisVoice | null; pitch: number; hasNativeVoice: boolean} {
  const voices = getAvailableVoices();
  const basePitch =
    persona === 'natural-female'
      ? 1.1
      : persona === 'natural-male'
        ? 0.88
        : persona === 'human-warm'
          ? 1.02
          : persona === 'human-gentle'
            ? 0.95
            : persona === 'robotic'
              ? 0.72
              : 1.0;

  if (!voices || voices.length === 0) {
    return {voice: null, pitch: basePitch, hasNativeVoice: false};
  }

  const langPrefix = lang.split('-')[0].toLowerCase();
  const exactLocaleVoices = voices.filter(
    (v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase()
  );
  const prefixVoices = voices.filter((v) =>
    v.lang.replace('_', '-').toLowerCase().startsWith(`${langPrefix}-`) ||
    v.lang.toLowerCase() === langPrefix
  );

  // Critical fix: NEVER fall back to English voices when the user selected a non-English language.
  // Binding an en-US SpeechSynthesisVoice to Malayalam/Hindi/Tamil/Kannada/Telugu/Arabic text causes silent failure or garbled speech.
  let candidates: SpeechSynthesisVoice[] = [];
  if (exactLocaleVoices.length > 0) {
    candidates = exactLocaleVoices;
  } else if (prefixVoices.length > 0) {
    candidates = prefixVoices;
  } else if (langPrefix === 'en') {
    const enVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
    candidates = enVoices.length > 0 ? enVoices : voices;
  } else {
    return {voice: null, pitch: basePitch, hasNativeVoice: false};
  }

  switch (persona) {
    case 'natural-female': {
      const match =
        candidates.find((v) =>
          /samantha|karen|victoria|zira|fiona|moira|tessa|veena|lekha|sohna|neerja|kalpana|heera|female|natural|neural/i.test(
            v.name
          )
        ) || candidates.find((v) => /google/i.test(v.name) && !/male/i.test(v.name));
      return {voice: match || candidates[0], pitch: basePitch, hasNativeVoice: true};
    }
    case 'natural-male': {
      const match =
        candidates.find((v) =>
          /alex|daniel|david|george|fred|tom|oliver|rishi|madhur|midhun|prabhat|male/i.test(v.name)
        ) || candidates.find((v) => /google.*male/i.test(v.name));
      return {voice: match || candidates[0], pitch: basePitch, hasNativeVoice: true};
    }
    case 'human-warm': {
      const match =
        candidates.find((v) =>
          /natural|neural|samantha|daniel|serena|steffi|premium|online/i.test(v.name)
        ) || candidates[0];
      return {voice: match, pitch: basePitch, hasNativeVoice: true};
    }
    case 'human-gentle': {
      const match =
        candidates.find((v) =>
          /victoria|karen|samantha|zira|natural|neural/i.test(v.name)
        ) || candidates[0];
      return {voice: match, pitch: basePitch, hasNativeVoice: true};
    }
    case 'robotic': {
      const match =
        candidates.find((v) =>
          /fred|zarvox|trinoids|whisper|organ/i.test(v.name)
        ) || candidates[0];
      return {voice: match, pitch: basePitch, hasNativeVoice: true};
    }
    case 'system':
    default:
      return {voice: candidates[0] || null, pitch: 1.0, hasNativeVoice: true};
  }
}

function isNetworkAllowedForTts(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (typeof window !== 'undefined') {
    try {
      if (localStorage.getItem('ablebridge_manual_offline_v1') === 'true') {
        return false;
      }
    } catch {
      // Ignore storage error
    }
  }
  return true;
}

function speakWithBrowserSynthesis(
  text: string,
  rate: number,
  activeLang: LanguageCode,
  activePersona: VoicePersona,
  options?: {
    pitch?: number;
    onWordBoundary?: (charIndex: number) => void;
    onEnd?: () => void;
  }
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    options?.onEnd?.();
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = getLanguageMeta(activeLang).speechLang;
  utterance.rate = Math.min(2.0, Math.max(0.5, rate));

  const {voice, pitch: calculatedPitch} = selectBestVoice(activePersona, activeLang);
  if (voice) {
    utterance.voice = voice;
  }
  utterance.pitch = options?.pitch ?? calculatedPitch;

  if (options?.onWordBoundary) {
    utterance.onboundary = (event) => {
      if (event.name === 'word' || typeof event.charIndex === 'number') {
        options.onWordBoundary?.(event.charIndex);
      }
    };
  }
  if (options?.onEnd) {
    utterance.onend = () => options.onEnd?.();
    utterance.onerror = () => options.onEnd?.();
  }
  window.speechSynthesis.speak(utterance);
}

function playWavBase64(
  base64Audio: string,
  rate: number,
  text: string,
  options?: {
    onWordBoundary?: (charIndex: number) => void;
    onEnd?: () => void;
  }
): void {
  const audio = new Audio(`data:audio/wav;base64,${base64Audio}`);
  audio.playbackRate = Math.min(1.6, Math.max(0.65, rate));
  activeAudioEl = audio;

  if (options?.onWordBoundary && text.trim().length > 0) {
    const wordStarts: number[] = [];
    const regex = /\S+/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      wordStarts.push(m.index);
    }
    if (wordStarts.length > 0) {
      audio.onloadedmetadata = () => {
        if (activeAudioEl !== audio) return;
        const durationMs = Math.max(800, (audio.duration || 3) * 1000 / audio.playbackRate);
        const stepMs = Math.max(180, durationMs / wordStarts.length);
        let idx = 0;
        options.onWordBoundary?.(wordStarts[0]);
        activeAudioTimer = window.setInterval(() => {
          idx += 1;
          if (idx >= wordStarts.length || activeAudioEl !== audio) {
            if (activeAudioTimer !== null) {
              window.clearInterval(activeAudioTimer);
              activeAudioTimer = null;
            }
            return;
          }
          options.onWordBoundary?.(wordStarts[idx]);
        }, stepMs);
      };
    }
  }

  audio.onended = () => {
    if (activeAudioTimer !== null) {
      window.clearInterval(activeAudioTimer);
      activeAudioTimer = null;
    }
    if (activeAudioEl === audio) {
      activeAudioEl = null;
    }
    options?.onEnd?.();
  };
  audio.onerror = () => {
    if (activeAudioTimer !== null) {
      window.clearInterval(activeAudioTimer);
      activeAudioTimer = null;
    }
    if (activeAudioEl === audio) {
      activeAudioEl = null;
    }
    options?.onEnd?.();
  };

  audio.play().catch(() => {
    if (activeAudioEl === audio) {
      activeAudioEl = null;
    }
    options?.onEnd?.();
  });
}

export function testVoicePersona(
  persona: VoicePersona,
  rate = 1.0,
  lang?: LanguageCode
): void {
  const activeLang = lang ?? getGlobalLanguage();
  const meta = getLanguageMeta(activeLang);
  const text =
    activeLang === 'en-US'
      ? `This is AbleBridge speaking in ${VOICE_PERSONA_LABELS[persona].label} voice.`
      : meta.sampleSpeech;
  speakText(text, rate, {persona, lang: activeLang});
}

export function speakText(
  text: string,
  rate = 1.0,
  options?: {
    pitch?: number;
    persona?: VoicePersona;
    lang?: LanguageCode;
    onWordBoundary?: (charIndex: number) => void;
    onEnd?: () => void;
  }
): void {
  try {
    const cleanText = text.trim();
    if (!cleanText) {
      options?.onEnd?.();
      return;
    }

    stopSpeech();

    const activeLang = options?.lang ?? getGlobalLanguage();
    const activePersona = options?.persona ?? getGlobalVoicePersona();
    const {hasNativeVoice} = selectBestVoice(activePersona, activeLang);

    // When a non-English language is selected and no native OS voice is installed,
    // use neural Gemini TTS (/api/gemini/tts) when online so Malayalam/Hindi/Tamil/Kannada/Telugu/etc. always speak accurately.
    const shouldUseCloudTts =
      activeLang !== 'en-US' && !hasNativeVoice && isNetworkAllowedForTts();

    if (shouldUseCloudTts) {
      const cacheKey = `${activeLang}|${activePersona}|${cleanText.slice(0, 900)}`;
      const cached = ttsAudioCache.get(cacheKey);
      if (cached) {
        playWavBase64(cached, rate, cleanText, options);
        return;
      }

      const controller = new AbortController();
      activeTtsAbort = controller;

      fetch('/api/gemini/tts', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          text: cleanText.slice(0, 900),
          language: activeLang,
          persona: activePersona,
        }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
          return (await res.json()) as {audioBase64?: string};
        })
        .then((data) => {
          if (controller.signal.aborted) return;
          activeTtsAbort = null;
          if (data.audioBase64) {
            if (ttsAudioCache.size >= MAX_TTS_CACHE) {
              const firstKey = ttsAudioCache.keys().next().value;
              if (firstKey) ttsAudioCache.delete(firstKey);
            }
            ttsAudioCache.set(cacheKey, data.audioBase64);
            playWavBase64(data.audioBase64, rate, cleanText, options);
          } else {
            speakWithBrowserSynthesis(cleanText, rate, activeLang, activePersona, options);
          }
        })
        .catch((err) => {
          if (err?.name === 'AbortError' || controller.signal.aborted) return;
          activeTtsAbort = null;
          speakWithBrowserSynthesis(cleanText, rate, activeLang, activePersona, options);
        });
      return;
    }

    speakWithBrowserSynthesis(cleanText, rate, activeLang, activePersona, options);
  } catch {
    options?.onEnd?.();
  }
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export type AlertSoundKind =
  | 'chime'
  | 'doorbell'
  | 'smoke'
  | 'kettle'
  | 'nfc'
  | 'sos'
  | 'select';

export function playAlertSound(kind: AlertSoundKind): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const makeTone = (
    freq: number,
    startOffset: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainLevel = 0.2
  ) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now + startOffset);
    gain.gain.setValueAtTime(0.001, now + startOffset);
    gain.gain.exponentialRampToValueAtTime(gainLevel, now + startOffset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + duration + 0.02);
  };

  switch (kind) {
    case 'doorbell':
      makeTone(659.25, 0, 0.35, 'triangle', 0.24);
      makeTone(523.25, 0.32, 0.55, 'triangle', 0.24);
      break;
    case 'smoke':
      makeTone(3100, 0, 0.16, 'square', 0.15);
      makeTone(3100, 0.22, 0.16, 'square', 0.15);
      makeTone(3100, 0.44, 0.16, 'square', 0.15);
      break;
    case 'kettle':
      makeTone(2250, 0, 0.75, 'sine', 0.18);
      break;
    case 'nfc':
      makeTone(880, 0, 0.1, 'sine', 0.18);
      makeTone(1318.5, 0.1, 0.18, 'sine', 0.18);
      break;
    case 'sos':
      makeTone(960, 0, 0.25, 'sawtooth', 0.18);
      makeTone(720, 0.26, 0.25, 'sawtooth', 0.18);
      break;
    case 'select':
      makeTone(740, 0, 0.09, 'sine', 0.15);
      break;
    case 'chime':
    default:
      makeTone(587.33, 0, 0.16, 'sine', 0.18);
      makeTone(880, 0.14, 0.25, 'sine', 0.18);
      break;
  }
}

export interface ColorAnalysis {
  name: string;
  hex: string;
  brightnessLabel: string;
  rgb: [number, number, number];
}

// Convert sRGB [0..255] to CIE L*a*b* (D65) for perceptually accurate color naming under lighting changes.
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const linearize = (c: number) => {
    const s = Math.max(0, Math.min(255, c)) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const rl = linearize(r);
  const gl = linearize(g);
  const bl = linearize(b);

  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) / 1.0;
  const z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const L = 116 * fy - 16;
  const A = 500 * (fx - fy);
  const B = 200 * (fy - fz);
  return [L, A, B];
}

interface CalibratedColor {
  name: string;
  rgb: [number, number, number];
  lab: [number, number, number];
}

const RAW_CALIBRATED_PALETTE: Array<{name: string; rgb: [number, number, number]}> = [
  {name: 'Pure Black', rgb: [16, 16, 18]},
  {name: 'Dark Charcoal', rgb: [48, 54, 64]},
  {name: 'Slate Gray', rgb: [100, 110, 125]},
  {name: 'Silver Gray', rgb: [172, 178, 186]},
  {name: 'Off-White / Cream', rgb: [242, 236, 222]},
  {name: 'Bright White', rgb: [248, 250, 252]},
  {name: 'Deep Maroon', rgb: [122, 24, 42]},
  {name: 'Crimson Red', rgb: [208, 36, 48]},
  {name: 'Rose Pink', rgb: [244, 114, 152]},
  {name: 'Magenta Pink', rgb: [214, 38, 128]},
  {name: 'Peach / Apricot', rgb: [251, 182, 142]},
  {name: 'Burnt Orange', rgb: [194, 78, 18]},
  {name: 'Coral Orange', rgb: [249, 115, 34]},
  {name: 'Warm Amber', rgb: [224, 146, 20]},
  {name: 'Warm Gold', rgb: [220, 176, 36]},
  {name: 'High-Vis Yellow', rgb: [248, 226, 38]},
  {name: 'Lemon Yellow', rgb: [250, 242, 122]},
  {name: 'Olive Green', rgb: [107, 124, 46]},
  {name: 'Lime Green', rgb: [132, 204, 22]},
  {name: 'Mint Green', rgb: [86, 214, 138]},
  {name: 'Emerald Green', rgb: [16, 152, 88]},
  {name: 'Forest Green', rgb: [22, 92, 52]},
  {name: 'Teal / Turquoise', rgb: [18, 158, 156]},
  {name: 'Cyan Blue', rgb: [34, 198, 222]},
  {name: 'Sky Blue', rgb: [68, 176, 244]},
  {name: 'Cobalt Blue', rgb: [37, 99, 235]},
  {name: 'Deep Navy Blue', rgb: [24, 38, 88]},
  {name: 'Indigo', rgb: [74, 58, 178]},
  {name: 'Soft Lavender', rgb: [186, 162, 234]},
  {name: 'Royal Purple', rgb: [128, 36, 204]},
  {name: 'Warm Beige / Sand', rgb: [212, 192, 162]},
  {name: 'Chestnut Brown', rgb: [134, 76, 44]},
  {name: 'Dark Espresso Brown', rgb: [68, 40, 24]},
];

const CALIBRATED_COLORS: CalibratedColor[] = RAW_CALIBRATED_PALETTE.map((c) => ({
  ...c,
  lab: rgbToLab(c.rgb[0], c.rgb[1], c.rgb[2]),
}));

export function classifyColor(r: number, g: number, b: number): ColorAnalysis {
  const [L, A, B] = rgbToLab(r, g, b);
  let best = CALIBRATED_COLORS[0];
  let bestDist = Infinity;

  // Weight chromatic (a*, b*) slightly higher than lightness L* so shaded colors keep accurate hue names
  for (const candidate of CALIBRATED_COLORS) {
    const dL = (L - candidate.lab[0]) * 0.78;
    const dA = A - candidate.lab[1];
    const dB = B - candidate.lab[2];
    const dist = dL * dL + dA * dA + dB * dB;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const brightnessLabel = luminance > 0.72 ? 'Bright' : luminance > 0.35 ? 'Medium' : 'Dark';

  return {
    name: best.name,
    hex,
    brightnessLabel,
    rgb: [Math.round(r), Math.round(g), Math.round(b)],
  };
}

export function localizeColorAnalysis(
  analysis: ColorAnalysis,
  lang: LanguageCode
): ColorAnalysis {
  return {
    ...analysis,
    name: localizeColorTerm(analysis.name, lang),
    brightnessLabel: localizeColorTerm(analysis.brightnessLabel, lang),
  };
}
