import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  BellRing,
  Bot,
  Compass,
  Eye,
  Heart,
  Mic,
  MicOff,
  Minimize2,
  Navigation,
  PhoneCall,
  Send,
  ShieldAlert,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {useFirebase} from '../contexts/FirebaseContext';
import {LanguageCode, ModuleId, PatientProfile, ReminderTimeSlot, ThemeMode, VoiceSpeed} from '../types';
import {getLanguageMeta, getLocalizedModuleMeta, t, useAppLanguage} from '../utils/i18n';
import {playAlertSound, speakText, stopSpeech, triggerVibration} from '../utils/multimodal';

interface DynamicAiCompanionProps {
  profile: PatientProfile;
  theme: ThemeMode;
  voiceSpeed: VoiceSpeed;
  activeModule: ModuleId;
  batterySaverActive?: boolean;
  onNavigateModule: (mod: ModuleId) => void;
  onCallCaregiver: () => void;
  onEmitAlert: (alert: {title: string; message: string; severity: 'info' | 'warning' | 'emergency'}) => void;
}

export const DynamicAiCompanion: React.FC<DynamicAiCompanionProps> = ({
  profile,
  theme,
  voiceSpeed,
  activeModule,
  batterySaverActive = false,
  onNavigateModule,
  onCallCaregiver,
  onEmitAlert,
}) => {
  const {addMemoryReminder, isOfflineMode} = useFirebase();
  const aiName = profile.aiAssistantNickname || 'Nova';
  const activeLang: LanguageCode = useAppLanguage(profile.preferredLanguage);
  const langMeta = getLanguageMeta(activeLang);

  const [isExpanded, setIsExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [lastReply, setLastReply] = useState<string>(
    `Hi ${profile.fullName || 'there'}, I am ${aiName}! I can open any module, set reminders, help you breathe, or alert your caregiver.`
  );
  const [lastActionNotice, setLastActionNotice] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<any>(null);

  const speakWithState = useCallback(
    (text: string) => {
      setIsSpeaking(true);
      speakText(text, voiceSpeed, {
        persona: profile.voicePersona,
        lang: activeLang,
        onEnd: () => setIsSpeaking(false),
      });
    },
    [activeLang, profile.voicePersona, voiceSpeed]
  );

  // Command Parser & Execution Engine
  const executeCommandOrQuery = useCallback(
    async (rawText: string) => {
      const q = rawText.trim().toLowerCase();
      if (!q) return;

      setIsThinking(true);
      setLastActionNotice(null);
      triggerVibration(40);

      // Security check: Never allow AI to modify locked settings or PIN
      if (
        q.includes('pin') ||
        q.includes('change pin') ||
        q.includes('reset pin') ||
        q.includes('unlock caregiver') ||
        q.includes('unlock setting') ||
        q.includes('child mode') ||
        q.includes('child lock') ||
        q.includes('disable lock') ||
        q.includes('bypass') ||
        q.includes('delete account') ||
        q.includes('erase data')
      ) {
        const securityRefusal =
          'Protected Caregiver Settings are securely locked with a PIN. For your safety, I cannot modify PINs, disable child lock, or alter locked caregiver settings. Please enter your Caregiver PIN in Settings.';
        setLastReply(securityRefusal);
        setLastActionNotice('Protected by Caregiver PIN');
        onEmitAlert({
          title: 'PIN Lock Protected',
          message: 'AI cannot modify PIN-locked caregiver settings.',
          severity: 'warning',
        });
        speakWithState(securityRefusal);
        setIsThinking(false);
        return;
      }

      // 1. Direct Module Navigation Intents
      if (
        q.includes('open vision') ||
        q.includes('vision narrator') ||
        q.includes('camera narrator') ||
        q.includes('describe scene')
      ) {
        onNavigateModule('vision');
        const reply = 'Opening Vision, Scene & Currency Narrator now.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Vision Narrator');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (
        q.includes('open dyslexia') ||
        q.includes('dyslexia lens') ||
        q.includes('reading lens') ||
        q.includes('bionic reading')
      ) {
        onNavigateModule('dyslexia');
        const reply = 'Opening Dyslexia & High-Readability Lens.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Dyslexia Lens');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open aac') || q.includes('picture board') || q.includes('speech board') || q.includes('talk board')) {
        onNavigateModule('aac');
        const reply = 'Opening Non-Verbal Picture Board.';
        setLastReply(reply);
        setLastActionNotice('Navigated to AAC Board');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open memory') || q.includes('photo memory') || q.includes('cognitive memory') || q.includes('reminders list')) {
        onNavigateModule('memory');
        const reply = 'Opening Cognitive Photo Memory & Daily Reminders.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Cognitive Memory');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open routine') || q.includes('nfc routine') || q.includes('routine coach') || q.includes('my steps')) {
        onNavigateModule('routine');
        const reply = 'Opening Routine Coach.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Routine Coach');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open fall') || q.includes('fall guardian') || q.includes('fall detector')) {
        onNavigateModule('fall');
        const reply = 'Opening Fall Guardian & Immobility Safety.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Fall Guardian');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open sound') || q.includes('sound radar') || q.includes('audio visualizer')) {
        onNavigateModule('sound');
        const reply = 'Opening Visual Sound Radar.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Sound Radar');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open motor') || q.includes('head tilt') || q.includes('switch communicator')) {
        onNavigateModule('motor');
        const reply = 'Opening Head-Tilt & Motor Communicator.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Motor Communicator');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open calm') || q.includes('sensory calm') || q.includes('calm studio') || q.includes('relax')) {
        onNavigateModule('calm');
        const reply = 'Opening Sensory Calm Studio.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Sensory Calm');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open stress') || q.includes('stress tracker') || q.includes('mood log')) {
        onNavigateModule('stress');
        const reply = 'Opening Mental Stress & Mood Tracker.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Stress Tracker');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open map') || q.includes('safety map') || q.includes('safe zones') || q.includes('gps')) {
        onNavigateModule('map');
        const reply = 'Opening Safety Map & Geofence Zones.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Safety Map');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open caregiver') || q.includes('caregiver portal') || q.includes('caregiver telemetry')) {
        onNavigateModule('caregiver-portal');
        const reply = 'Opening Caregiver Portal.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Caregiver Portal');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open sign') || q.includes('sign language') || q.includes('gesture translator')) {
        onNavigateModule('sign');
        const reply = 'Opening Sign Language & Gesture Translator.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Sign Translator');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open assistant') || q.includes('full chat') || q.includes('video chat')) {
        onNavigateModule('assistant');
        const reply = 'Opening Gemini Assistive AI & Live Video Chat.';
        setLastReply(reply);
        setLastActionNotice('Navigated to AI Companion');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('magnifier') || q.includes('loupe') || q.includes('zoom in')) {
        onNavigateModule('magnifier');
        const reply = 'Opening Digital Magnifier & High-Contrast Loupe.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Magnifier Loupe');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('hydration') || q.includes('drink water') || q.includes('water tracker') || q.includes('stretch')) {
        onNavigateModule('hydration');
        const reply = 'Opening Hydration & Gentle Stretch Pacer.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Hydration Pacer');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('braille') || q.includes('morse') || q.includes('tactile')) {
        onNavigateModule('tactile');
        const reply = 'Opening Braille & Haptic Morse Studio.';
        setLastReply(reply);
        setLastActionNotice('Navigated to Braille Studio');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      if (q.includes('open toolkit') || q.includes('go home') || q.includes('dashboard') || q.includes('back home')) {
        onNavigateModule('dashboard');
        const reply = 'Opening the main Assistive Toolkit grid.';
        setLastReply(reply);
        setLastActionNotice('Opened Toolkit');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      // 2. Direct Task: Call Caregiver / SOS Alert
      if (q.includes('call caregiver') || q.includes('alert caregiver') || q.includes('emergency') || q.includes('sos')) {
        onCallCaregiver();
        const reply = `Calling caregiver ${profile.caregiverName || ''} and sending emergency notification.`;
        setLastReply(reply);
        setLastActionNotice('Emergency Alert Dispatched');
        speakWithState(reply);
        setIsThinking(false);
        return;
      }

      // 3. Direct Task: Set Daily Reminder
      if (q.includes('remind me to') || q.includes('set reminder') || q.includes('add reminder')) {
        const cleanReminder = rawText
          .replace(/^(hey\s+)?(nova|ai|ablebridge)?\s*(please\s+)?(set\s+a?\s*reminder(\s+to)?|remind\s+me(\s+to)?|add\s+a?\s*reminder(\s+to)?)\s*/i, '')
          .trim();

        const title = cleanReminder.length > 2 ? cleanReminder : 'Daily Health Reminder';
        let timeSlot: ReminderTimeSlot = 'anytime';
        if (q.includes('morning') || q.includes('am')) timeSlot = 'morning';
        else if (q.includes('afternoon') || q.includes('lunch') || q.includes('noon')) timeSlot = 'afternoon';
        else if (q.includes('evening') || q.includes('night') || q.includes('pm')) timeSlot = 'evening';

        try {
          await addMemoryReminder({
            title: title.charAt(0).toUpperCase() + title.slice(1),
            notes: `Created directly via ${aiName} Dynamic AI Voice Assist.`,
            timeSlot,
            confirmationMessage: `Confirmed: ${title}. Keep up the great routine!`,
          });
          const reply = `I have set your reminder: "${title}" for ${timeSlot}.`;
          setLastReply(reply);
          setLastActionNotice(`Reminder Created: ${title}`);
          playAlertSound('chime');
          speakWithState(reply);
        } catch {
          const failMsg = 'Could not save reminder right now. Check your internet connection or use Cognitive Memory.';
          setLastReply(failMsg);
          speakWithState(failMsg);
        }
        setIsThinking(false);
        return;
      }

      // 4. Quick Calming Breathing Guide
      if (q.includes('calm me') || q.includes('panic') || q.includes('anxiety') || q.includes('breathe')) {
        const calmScript =
          'Take a slow breath in for 4 seconds... gently hold... and exhale slowly for 6 seconds. Drop your shoulders. You are safe.';
        setLastReply(calmScript);
        setLastActionNotice('Calm Reset Active');
        speakWithState(calmScript);
        setIsThinking(false);
        return;
      }

      // 5. General AI Q&A via /api/gemini/chat or Offline Knowledge
      if (isOfflineMode) {
        const offlineReply = `[Offline Mode] I am here to help you navigate AbleBridge. I can open any module (Vision, Dyslexia, Routine, AAC, Fall Guardian) or set reminders.`;
        setLastReply(offlineReply);
        speakWithState(offlineReply);
        setIsThinking(false);
        return;
      }

      try {
        const res = await fetch('/api/gemini/chat', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            message: rawText,
            persona: 'calm_coach',
            model: 'gemini-4-hydrogen',
            language: activeLang,
            patientContext: `User is using AbleBridge assistive toolkit. Active module: ${activeModule}. Preferred name: ${profile.fullName || 'Patient'}. Language: ${langMeta.aiLanguageName}. Disabilities: ${profile.disabilities.join(', ') || 'General'}. Respond in 2 short, friendly sentences. Mention if you can open a tool for them.`,
          }),
        });

        if (!res.ok) {
          throw new Error('AI service error');
        }

        const data = await res.json();
        const reply = data.reply || `I am ready to help. Try saying "Open Vision Narrator" or "Set Reminder".`;
        setLastReply(reply);
        speakWithState(reply);
      } catch {
        const fallback =
          'I am ready to assist. You can ask me to open any module like Vision Narrator or Dyslexia Lens, or set a daily reminder.';
        setLastReply(fallback);
        speakWithState(fallback);
      } finally {
        setIsThinking(false);
      }
    },
    [
      activeModule,
      addMemoryReminder,
      aiName,
      isOfflineMode,
      onCallCaregiver,
      onNavigateModule,
      profile.caregiverName,
      profile.disabilities,
      profile.fullName,
      speakWithState,
    ]
  );

  // Speech Recognition Handling
  const handleToggleVoiceInput = () => {
    if (listening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setListening(false);
      return;
    }

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      speakWithState('Speech recognition is unavailable on this device browser. Please type below.');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = langMeta.speechLang;

      rec.onstart = () => {
        setListening(true);
        triggerVibration(50);
      };

      rec.onresult = (event: any) => {
        const spoken = event.results[0]?.[0]?.transcript;
        if (spoken) {
          setInput(spoken);
          executeCommandOrQuery(spoken);
        }
      };

      rec.onerror = () => {
        setListening(false);
      };

      rec.onend = () => {
        setListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch {
      setListening(false);
    }
  };

  // Determine dynamic ring & shape adaptation based on active theme
  const getDynamicRingClasses = () => {
    switch (theme) {
      case 'liquid-glass':
        return 'backdrop-blur-2xl bg-white/15 border-2 border-white/50 shadow-[0_8px_32px_0_rgba(56,189,248,0.5)] text-white';
      case 'neon':
        return 'bg-[#03050a] border-2 border-[#ff5500] shadow-[0_0_24px_rgba(255,85,0,0.65)] text-[#00f5d4]';
      case 'cyber-teal':
        return 'bg-[#02080a] border-2 border-[#00f5c4] shadow-[0_0_22px_rgba(0,245,196,0.55)] text-[#ecfeff]';
      case 'calm-lavender':
        return 'bg-[#120a26] border-2 border-[#c084fc] shadow-[0_0_20px_rgba(192,132,252,0.45)] text-[#faf5ff]';
      case 'solar-gold':
        return 'bg-[#140b02] border-2 border-[#fbbf24] shadow-[0_0_22px_rgba(251,191,36,0.5)] text-[#fefce8]';
      case 'high-contrast':
        return 'bg-black border-4 border-[#ffe600] shadow-[0_0_0_2px_#000] text-[#ffe600]';
      case 'cream':
        return 'bg-[#faf5e8] border-2 border-[#1d4ed8] shadow-xl text-[#1c1917]';
      default:
        return 'surface-card border-2 border-theme shadow-xl text-white';
    }
  };

  const getOrbShapeClasses = () => {
    if (theme === 'neon' || theme === 'cyber-teal') return 'rounded-2xl rotate-3 hover:rotate-0';
    if (theme === 'high-contrast') return 'rounded-2xl';
    return 'rounded-full';
  };

  return (
    <aside
      aria-label={`${aiName} Floating Dynamic AI Companion`}
      className="fixed z-50 bottom-24 right-3 sm:bottom-24 sm:right-6 pointer-events-auto"
    >
      {/* Minimized Dynamic Floating Shape */}
      {!isExpanded && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setIsExpanded(true);
              handleToggleVoiceInput();
            }}
            className={`min-h-[44px] px-3 rounded-full text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-lg transition-transform active:scale-95 ${
              listening
                ? `bg-red-600 text-white ${batterySaverActive ? '' : 'animate-pulse'}`
                : getDynamicRingClasses()
            }`}
            aria-label={`Talk directly to ${aiName}`}
            title={`Tap to speak to ${aiName}`}
          >
            <Mic className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="hidden sm:inline">
              {listening ? t(activeLang, 'listening') : `${t(activeLang, 'talkToAi')} ${aiName}`}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsExpanded(true);
              triggerVibration(50);
              playAlertSound('select');
            }}
            className={`relative group w-16 h-16 sm:w-18 sm:h-18 ${getOrbShapeClasses()} flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
              batterySaverActive ? '' : 'hover:scale-110'
            } active:scale-95 ${getDynamicRingClasses()}`}
            title={`Open ${aiName} AI Companion Overlay`}
            aria-label={`Open ${aiName} Dynamic AI Companion`}
          >
            {/* Animated breathing aura rings (disabled during Battery Saver) */}
            {!batterySaverActive && (
              <span
                className={`absolute inset-0 ${getOrbShapeClasses()} animate-ping opacity-25 pointer-events-none ${
                  theme === 'neon'
                    ? 'bg-orange-500'
                    : theme === 'cyber-teal'
                      ? 'bg-teal-400'
                      : theme === 'calm-lavender'
                        ? 'bg-purple-400'
                        : theme === 'solar-gold'
                          ? 'bg-amber-400'
                          : 'bg-sky-400'
                }`}
              />
            )}
            <Bot className="w-7 h-7 sm:w-8 sm:h-8 shrink-0 transition-transform group-hover:rotate-6" />
            <span className="text-[10px] font-extrabold tracking-wider uppercase mt-0.5">
              {aiName}
            </span>
            {isSpeaking && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                <span
                  className={`w-2 h-2 rounded-full bg-white ${
                    batterySaverActive ? '' : 'animate-pulse'
                  }`}
                />
              </span>
            )}
          </button>
        </div>
      )}

      {/* Expanded Floating Dynamic Island Overlay */}
      {isExpanded && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={`${aiName} Assistant Quick Window`}
          className={`w-[92vw] sm:w-[420px] max-h-[75vh] rounded-3xl p-4 sm:p-5 flex flex-col justify-between space-y-3.5 shadow-2xl transition-all duration-300 ${getDynamicRingClasses()}`}
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between gap-3 border-b border-current/20 pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                  theme === 'neon'
                    ? 'bg-orange-500 text-black'
                    : theme === 'cream'
                      ? 'bg-[#1d4ed8] text-white'
                      : 'bg-white/20 text-white'
                }`}
              >
                <Bot className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-extrabold text-base leading-tight truncate">
                  {aiName} Dynamic Companion
                </h3>
                <p className="text-[11px] opacity-80 truncate">
                  {isOfflineMode ? 'Offline Assist Ready' : 'Adaptive Multimodal AI'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  stopSpeech();
                  setIsSpeaking(false);
                }}
                className="p-2 rounded-xl hover:bg-white/10 cursor-pointer"
                aria-label="Stop Voice Audio"
                title="Silence"
              >
                <VolumeX className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsExpanded(false);
                  triggerVibration(30);
                }}
                className="p-2 rounded-xl hover:bg-white/10 cursor-pointer"
                aria-label="Minimize Dynamic Companion"
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Action Notice Chip */}
          {lastActionNotice && (
            <div className="bg-emerald-600/90 text-white text-xs font-extrabold px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm animate-fade-in">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{lastActionNotice}</span>
            </div>
          )}

          {/* AI Spoken Speech Bubble */}
          <div
            className={`rounded-2xl p-3.5 border text-sm leading-relaxed overflow-y-auto max-h-36 min-h-[68px] space-y-1 ${
              theme === 'cream'
                ? 'bg-[#ede4ce] border-[#bfb295] text-[#1c1917]'
                : 'bg-black/40 backdrop-blur-md border-white/15 text-white'
            }`}
          >
            <div className="flex items-center justify-between text-xs opacity-75 font-bold">
              <span>{aiName}:</span>
              <button
                type="button"
                onClick={() => speakWithState(lastReply)}
                className="hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{t(activeLang, 'repeat')}</span>
              </button>
            </div>
            <p className="font-medium whitespace-pre-wrap">{lastReply}</p>
          </div>

          {/* One-Tap Direct Action Chips */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-extrabold uppercase tracking-wider opacity-75">
              {t(activeLang, 'instantControls')} · {langMeta.shortTag}
              {batterySaverActive ? ` · ${t(activeLang, 'batterySaverOn')}` : ''}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => executeCommandOrQuery('open vision narrator')}
                className="surface-elevated min-h-[44px] px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer text-left truncate"
              >
                <Eye className="w-3.5 h-3.5 shrink-0 text-orange-400" />
                <span className="truncate">{getLocalizedModuleMeta(activeLang, 'vision').title}</span>
              </button>

              <button
                type="button"
                onClick={() => executeCommandOrQuery('open dyslexia lens')}
                className="surface-elevated min-h-[44px] px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer text-left truncate"
              >
                <Compass className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                <span className="truncate">{getLocalizedModuleMeta(activeLang, 'dyslexia').title}</span>
              </button>

              <button
                type="button"
                onClick={() => executeCommandOrQuery('open routine coach')}
                className="surface-elevated min-h-[44px] px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer text-left truncate"
              >
                <Navigation className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span className="truncate">{getLocalizedModuleMeta(activeLang, 'routine').title}</span>
              </button>

              <button
                type="button"
                onClick={() => executeCommandOrQuery('set reminder to take medication')}
                className="surface-elevated min-h-[44px] px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer text-left truncate"
              >
                <BellRing className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                <span className="truncate">{t(activeLang, 'addReminder')}</span>
              </button>

              <button
                type="button"
                onClick={() => executeCommandOrQuery('calm me down with breathing')}
                className="surface-elevated min-h-[44px] px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer text-left truncate"
              >
                <Heart className="w-3.5 h-3.5 shrink-0 text-pink-400" />
                <span className="truncate">{t(activeLang, 'calmReset')}</span>
              </button>

              <button
                type="button"
                onClick={() => executeCommandOrQuery('alert my caregiver')}
                className="bg-red-600/90 hover:bg-red-600 text-white min-h-[44px] px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer text-left truncate"
              >
                <PhoneCall className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t(activeLang, 'alertCaregiver')}</span>
              </button>
            </div>
          </div>

          {/* Voice Dictation & Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) {
                const text = input;
                setInput('');
                executeCommandOrQuery(text);
              }
            }}
            className="flex items-center gap-2 pt-2 border-t border-current/15"
          >
            <button
              type="button"
              onClick={handleToggleVoiceInput}
              className={`min-h-[50px] min-w-[50px] rounded-2xl flex items-center justify-center shrink-0 cursor-pointer shadow-md transition-colors ${
                listening
                  ? 'bg-red-600 text-white animate-pulse'
                  : theme === 'cream'
                    ? 'bg-[#ede4ce] text-[#1c1917] border border-[#bfb295]'
                    : 'bg-white/20 text-white hover:bg-white/30'
              }`}
              title={listening ? 'Listening... Tap to stop' : 'Tap to speak to AI'}
              aria-label={listening ? 'Stop listening' : 'Start voice speech to AI'}
            >
              {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`${t(activeLang, 'askAiPlaceholder')}`}
              disabled={isThinking}
              className={`flex-1 min-h-[50px] px-3.5 rounded-2xl border font-medium text-xs sm:text-sm focus:outline-none focus:border-sky-400 ${
                theme === 'cream'
                  ? 'bg-[#ede4ce] border-[#bfb295] text-[#1c1917] placeholder:text-[#44403c]/70'
                  : 'bg-black/40 border-white/20 text-white placeholder:text-white/60'
              }`}
            />

            <button
              type="submit"
              disabled={isThinking || !input.trim()}
              className="btn-accent min-h-[50px] px-4 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
              aria-label="Send query"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </aside>
  );
};
