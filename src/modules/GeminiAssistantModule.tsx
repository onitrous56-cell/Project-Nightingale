import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Bot,
  Cloud,
  Eye,
  Mic,
  PhoneCall,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Video,
  Volume2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {useFirebase} from '../contexts/FirebaseContext';
import {ChatPersona, ModuleId, PatientProfile, ReminderTimeSlot} from '../types';
import {getLanguageMeta, getLocalizedModuleMeta, useAppLanguage} from '../utils/i18n';
import {speakText, stopSpeech, triggerVibration} from '../utils/multimodal';

function buildOfflineAssistiveReply(prompt: string, profile: PatientProfile): string {
  const q = prompt.toLowerCase();
  if (q.includes('calm') || q.includes('breath') || q.includes('panic') || q.includes('stress')) {
    return [
      `Offline Calm Reset for ${profile.fullName || 'you'}:`,
      '1. Breathe in slowly through your nose for 4 seconds.',
      '2. Hold gently for 4 seconds — drop your shoulders down.',
      '3. Breathe out slowly through your mouth for 6 seconds.',
      '4. Name 3 calm objects you can see right now. You can also open Sensory Calm Studio (Module 10) completely offline.',
    ].join('\n');
  }
  if (q.includes('seizure') || q.includes('epilep')) {
    return [
      'Offline Seizure First Aid Checklist:',
      '1. Stay calm and help the person gently onto their side to keep the airway clear.',
      '2. Place something soft under their head and clear away sharp furniture.',
      '3. Do NOT put anything inside their mouth or hold them down.',
      `4. Tap the red CALL CAREGIVER NOW bar at the bottom to reach ${profile.caregiverName || 'your caregiver'} (${profile.caregiverPhone}).`,
    ].join('\n');
  }
  if (q.includes('morning') || q.includes('routine') || q.includes('step') || q.includes('memory')) {
    return [
      'Offline Step-by-Step Morning Plan:',
      '1. Drink one glass of water.',
      '2. Check Cognitive Memory Aids (Module 06) and check off Morning Medication.',
      '3. Follow Routine Coach (Module 05) one step at a time with spoken voice guidance.',
    ].join('\n');
  }
  if (q.includes('hands') || q.includes('paraly') || q.includes('aac')) {
    return [
      'Offline Hands-Free & AAC Setup:',
      '1. Open Head-Tilt & Switch Scanning Communicator (Module 08) for auto-scan phrase selection.',
      '2. Open Quick Picture Board (Module 04) for instant one-tap voice phrases stored locally.',
    ].join('\n');
  }
  return [
    `Offline Assistive Mode Active — here is your local guide:`,
    '• Need spoken help? Use Quick Picture Board (04), Memory Aids (06), or Routine Coach (05).',
    '• Feeling overwhelmed? Open Sensory Calm Studio (10) or Mental Status Tracker (11).',
    `• Need urgent help? Tap CALL CAREGIVER NOW below to dial ${profile.caregiverName || 'Caregiver'} (${profile.caregiverPhone}).`,
  ].join('\n');
}

interface GeminiAssistantModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  patientProfile: PatientProfile;
  onCallCaregiver?: () => void;
  onNavigateModule?: (mod: ModuleId) => void;
}

const PERSONA_OPTIONS: Array<{id: ChatPersona; label: string; desc: string}> = [
  {
    id: 'calm_coach',
    label: 'Calm Wellness Coach',
    desc: 'Warm breathing, panic & stress guidance',
  },
  {
    id: 'caregiver_guide',
    label: 'Caregiver Support Guide',
    desc: 'Mobility, epilepsy, dementia & elder care tips',
  },
  {
    id: 'cognitive_tutor',
    label: 'Step-by-Step Tutor',
    desc: 'Plain-language steps for dyslexia, ADHD & learning',
  },
  {
    id: 'accessibility_advisor',
    label: 'AbleBridge Advisor',
    desc: 'Help choosing modules & accessibility settings',
  },
];

export const GeminiAssistantModule: React.FC<GeminiAssistantModuleProps> = ({
  onBack,
  voiceSpeed,
  patientProfile,
  onCallCaregiver,
  onNavigateModule,
}) => {
  const {
    user,
    browserOnline,
    setManualOfflineMode,
    isOfflineMode,
    chatMessages,
    saveChatMessages,
    clearChatMessages,
    addMemoryReminder,
  } = useFirebase();
  const aiName = patientProfile.aiAssistantNickname || 'Nova';
  const activeLang = useAppLanguage(patientProfile.preferredLanguage);
  const [persona, setPersona] = useState<ChatPersona>('calm_coach');
  const [model, setModel] = useState<'gemini-4-hydrogen' | 'gemini-3.1-flash-lite'>(
    'gemini-4-hydrogen'
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [autoSpeakReplies, setAutoSpeakReplies] = useState(true);
  const [listeningVoice, setListeningVoice] = useState(false);
  const [chatMode, setChatMode] = useState<'text' | 'video'>('text');

  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (chatMode === 'video') {
      navigator.mediaDevices
        .getUserMedia({video: true, audio: false})
        .then((stream) => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(() => {
          setErrorMsg('Camera access unavailable or declined.');
        });
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [chatMode]);

  const grabLiveCameraFrame = (): string | null => {
    if (!videoRef.current) return null;
    try {
      const v = videoRef.current;
      if (v.readyState < 2) return null;
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth || 640;
      canvas.height = v.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.85);
    } catch {
      return null;
    }
  };

  const askAboutLiveVideo = async (customPrompt?: string) => {
    const frame = grabLiveCameraFrame();
    const prompt =
      customPrompt ||
      'Please analyze what you see in this live camera feed and describe key objects, readable text, or safety advice for me.';
    await sendMessage(prompt, frame ?? undefined);
  };

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [chatMessages, sending]);

  const lastAssistantMessage = useMemo(() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === 'assistant') {
        return chatMessages[i];
      }
    }
    return null;
  }, [chatMessages]);

  const quickPrompts = useMemo(() => {
    const prompts = [
      'Guide me through a quick 60-second calm reset right now.',
      'Give me 3 clear steps to organize my morning routine.',
    ];
    if (patientProfile.disabilities.includes('epilepsy_seizure')) {
      prompts.push('What seizure safety checks should my caregiver keep ready?');
    } else if (patientProfile.disabilities.includes('paralysis_quadriplegia')) {
      prompts.push('How can I set up hands-free communication using AbleBridge?');
    } else {
      prompts.push('Help explain a difficult topic in very simple words.');
    }
    return prompts;
  }, [patientProfile.disabilities]);

  const sendMessage = async (textOverride?: string, imageOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;

    setErrorMsg(null);
    setInput('');
    setSending(true);
    triggerVibration(40);

    // In live video mode, automatically capture current live camera feed frame so AI can see!
    const effectiveImage =
      imageOverride !== undefined
        ? imageOverride
        : chatMode === 'video'
          ? grabLiveCameraFrame()
          : null;

    const q = text.toLowerCase();

    // Guard against modifying locked settings or PIN
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
        'Protected Caregiver Settings are securely locked with a PIN. For your safety, I cannot modify PINs, disable child lock, or unlock caregiver settings directly. Please enter your Caregiver PIN in Settings.';
      await saveChatMessages([
        {role: 'user', persona, text, modelUsed: model},
        {role: 'assistant', persona, text: securityRefusal, modelUsed: 'security-guard'},
      ]);
      if (autoSpeakReplies) {
        speakText(securityRefusal, voiceSpeed, {
          persona: patientProfile.voicePersona,
          lang: activeLang,
        });
      }
      setSending(false);
      return;
    }

    // Direct module open command from chat (natural phrasing supported)
    if (
      onNavigateModule &&
      /\b(open|launch|show|go to|take me to|switch to|start)\b/i.test(q)
    ) {
      let targetMod: ModuleId | null = null;
      let targetLabel = '';
      if (q.includes('vision') || q.includes('camera') || q.includes('currency')) { targetMod = 'vision'; targetLabel = 'Vision Narrator'; }
      else if (q.includes('dyslexia') || q.includes('reading') || q.includes('focus lens')) { targetMod = 'dyslexia'; targetLabel = 'Dyslexia Lens'; }
      else if (q.includes('routine')) { targetMod = 'routine'; targetLabel = 'Routine Coach'; }
      else if (q.includes('memory') || q.includes('photo album')) { targetMod = 'memory'; targetLabel = 'Cognitive Memory'; }
      else if (q.includes('aac') || q.includes('picture board') || q.includes('talk board')) { targetMod = 'aac'; targetLabel = 'Picture Board'; }
      else if (q.includes('fall')) { targetMod = 'fall'; targetLabel = 'Fall Guardian'; }
      else if (q.includes('sound') || q.includes('radar')) { targetMod = 'sound'; targetLabel = 'Sound Radar'; }
      else if (q.includes('motor') || q.includes('head tilt') || q.includes('blink')) { targetMod = 'motor'; targetLabel = 'Motor Communicator'; }
      else if (q.includes('calm') || q.includes('sensory') || q.includes('breath')) { targetMod = 'calm'; targetLabel = 'Sensory Calm Studio'; }
      else if (q.includes('stress') || q.includes('mood')) { targetMod = 'stress'; targetLabel = 'Stress Tracker'; }
      else if (q.includes('map') || q.includes('safe zone') || q.includes('care map')) { targetMod = 'map'; targetLabel = 'Safety Map'; }
      else if (q.includes('sign') || q.includes('gesture')) { targetMod = 'sign'; targetLabel = 'Sign Translator'; }
      else if (q.includes('magnifier') || q.includes('loupe') || q.includes('zoom')) { targetMod = 'magnifier'; targetLabel = 'Digital Magnifier'; }
      else if (q.includes('hydration') || q.includes('water') || q.includes('stretch')) { targetMod = 'hydration'; targetLabel = 'Hydration & Stretch Pacer'; }
      else if (q.includes('braille') || q.includes('morse') || q.includes('tactile')) { targetMod = 'tactile'; targetLabel = 'Braille & Haptic Morse Studio'; }
      else if (q.includes('caregiver portal') || q.includes('caregiver data')) { targetMod = 'caregiver-portal'; targetLabel = 'Caregiver Portal'; }
      else if (q.includes('toolkit') || q.includes('dashboard') || q.includes('home')) { targetMod = 'dashboard'; targetLabel = 'Assistive Toolkit'; }

      if (targetMod) {
        const reply = `Opening ${targetLabel} now!`;
        await saveChatMessages([
          {role: 'user', persona, text, modelUsed: model},
          {role: 'assistant', persona, text: reply, modelUsed: 'system-action'},
        ]);
        if (autoSpeakReplies) {
          speakText(reply, voiceSpeed, {
            persona: patientProfile.voicePersona,
            lang: activeLang,
          });
        }
        setSending(false);
        onNavigateModule(targetMod);
        return;
      }
    }

    // Direct reminder command
    if (q.includes('remind me to') || q.includes('set reminder') || q.includes('add reminder')) {
      const cleanReminder = text
        .replace(/^(hey\s+)?(nova|ai|ablebridge)?\s*(please\s+)?(set\s+a?\s*reminder(\s+to)?|remind\s+me(\s+to)?|add\s+a?\s*reminder(\s+to)?)\s*/i, '')
        .trim();
      const title = cleanReminder.length > 2 ? cleanReminder : 'Daily Reminder';
      let slot: ReminderTimeSlot = 'anytime';
      if (q.includes('morning')) slot = 'morning';
      else if (q.includes('afternoon')) slot = 'afternoon';
      else if (q.includes('evening') || q.includes('night')) slot = 'evening';

      await addMemoryReminder({
        title: title.charAt(0).toUpperCase() + title.slice(1),
        notes: `Created directly by ${aiName} assistant.`,
        timeSlot: slot,
        confirmationMessage: `Confirmed: ${title}`,
      });
      const reply = `I have set your daily reminder: "${title}" for ${slot}.`;
      await saveChatMessages([
        {role: 'user', persona, text, modelUsed: model},
        {role: 'assistant', persona, text: reply, modelUsed: 'system-action'},
      ]);
      if (autoSpeakReplies) {
        speakText(reply, voiceSpeed, {
          persona: patientProfile.voicePersona,
          lang: activeLang,
        });
      }
      setSending(false);
      return;
    }

    if (isOfflineMode) {
      const offlineReply = buildOfflineAssistiveReply(text, patientProfile);
      await saveChatMessages([
        {role: 'user', persona, text, modelUsed: 'offline-guide'},
        {role: 'assistant', persona, text: offlineReply, modelUsed: 'offline-guide'},
      ]);
      if (autoSpeakReplies) {
        speakText(offlineReply, voiceSpeed, {
          persona: patientProfile.voicePersona,
          lang: activeLang,
        });
      }
      setSending(false);
      return;
    }

    try {
      const historyPayload = chatMessages.slice(-12).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const activeLang = patientProfile.preferredLanguage || 'en-US';
      const langMeta = getLanguageMeta(activeLang);
      const patientContext = `Patient: ${patientProfile.fullName || 'Patient'}, Age: ${patientProfile.age || 'N/A'}, Preferred Language: ${langMeta.aiLanguageName}, Active conditions: ${patientProfile.disabilities.join(', ') || 'General'}`;

      const res = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          persona,
          model,
          language: activeLang,
          patientContext,
          imageDataUrl: effectiveImage || null,
        }),
      });

      const data = (await res.json()) as {
        reply?: string;
        model?: string;
        error?: string;
      };

      if (!res.ok || !data.reply) {
        setErrorMsg(data.error || 'Unable to receive reply from Gemini AI.');
        return;
      }

      await saveChatMessages([
        {role: 'user', persona, text, modelUsed: model},
        {
          role: 'assistant',
          persona,
          text: data.reply,
          modelUsed: data.model || model,
        },
      ]);

      if (autoSpeakReplies) {
        speakText(data.reply, voiceSpeed, {
          persona: patientProfile.voicePersona,
          lang: activeLang,
        });
      }
    } catch {
      const offlineFallback = buildOfflineAssistiveReply(text, patientProfile);
      await saveChatMessages([
        {role: 'user', persona, text, modelUsed: 'offline-guide'},
        {role: 'assistant', persona, text: offlineFallback, modelUsed: 'offline-guide'},
      ]);
      if (autoSpeakReplies) {
        speakText(offlineFallback, voiceSpeed, {
          persona: patientProfile.voicePersona,
          lang: activeLang,
        });
      }
    } finally {
      setSending(false);
    }
  };

  const handleVoiceInput = () => {
    const SpeechRec =
      (
        window as unknown as {
          SpeechRecognition?: new () => {
            lang: string;
            interimResults: boolean;
            onresult: (e: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void;
            onerror: () => void;
            onend: () => void;
            start: () => void;
          };
          webkitSpeechRecognition?: new () => {
            lang: string;
            interimResults: boolean;
            onresult: (e: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void;
            onerror: () => void;
            onend: () => void;
            start: () => void;
          };
        }
      ).SpeechRecognition ||
      (
        window as unknown as {
          webkitSpeechRecognition?: new () => {
            lang: string;
            interimResults: boolean;
            onresult: (e: {results: ArrayLike<ArrayLike<{transcript: string}>>}) => void;
            onerror: () => void;
            onend: () => void;
            start: () => void;
          };
        }
      ).webkitSpeechRecognition;

    if (!SpeechRec) {
      setErrorMsg('Voice dictation is not supported in this browser. Please type your message.');
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = getLanguageMeta(patientProfile.preferredLanguage || 'en-US').speechLang;
      rec.interimResults = false;
      setListeningVoice(true);
      rec.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      rec.onerror = () => setListeningVoice(false);
      rec.onend = () => setListeningVoice(false);
      rec.start();
    } catch {
      setListeningVoice(false);
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        moduleId="assistant"
        title={getLocalizedModuleMeta(activeLang, 'assistant').title}
        subtitle={`13 · ${getLocalizedModuleMeta(activeLang, 'assistant').domain}`}
        language={activeLang}
        onBack={() => {
          stopSpeech();
          onBack();
        }}
        actionSlot={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setChatMode((m) => (m === 'video' ? 'text' : 'video'))}
              className={`min-h-[56px] px-4 rounded-xl font-extrabold text-sm flex items-center gap-2 cursor-pointer ${
                chatMode === 'video' ? 'btn-accent' : 'surface-elevated'
              }`}
            >
              <Video className="w-4 h-4" aria-hidden="true" />
              <span>{chatMode === 'video' ? 'Video Chat: ON' : 'Live Video Chat'}</span>
            </button>
            <button
              type="button"
              onClick={() => setAutoSpeakReplies((v) => !v)}
              className="surface-elevated min-h-[56px] px-4 rounded-xl font-bold text-sm cursor-pointer"
            >
              Auto-Speak: {autoSpeakReplies ? 'ON' : 'OFF'}
            </button>
            {onCallCaregiver && (
              <button
                type="button"
                onClick={onCallCaregiver}
                className="min-h-[56px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <PhoneCall className="w-4 h-4" aria-hidden="true" />
                <span>Call Caregiver</span>
              </button>
            )}
            {chatMessages.length > 0 && (
              <button
                type="button"
                onClick={clearChatMessages}
                className="surface-elevated min-h-[56px] px-4 rounded-xl font-bold text-sm flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>Clear</span>
              </button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Persona & Quick Prompts Sidebar */}
        <div className="lg:col-span-4 space-y-4">
          <div className="surface-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">Assistant Role</h2>
              <span className="text-xs font-bold text-muted flex items-center gap-1">
                {isOfflineMode ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-[#ff5500]" aria-hidden="true" />
                    <span>Offline Guide</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{user ? 'Cloud Sync' : 'Online Local'}</span>
                  </>
                )}
              </span>
            </div>
            <div className="space-y-2">
              {PERSONA_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPersona(opt.id)}
                  className={`w-full min-h-[60px] p-3.5 rounded-xl text-left cursor-pointer ${
                    persona === opt.id ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  <p className="font-bold text-sm">{opt.label}</p>
                  <p className="text-xs opacity-85">{opt.desc}</p>
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-theme space-y-2">
              <p className="text-xs font-bold text-muted">Response Speed / Model</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setModel('gemini-4-hydrogen')}
                  className={`min-h-[48px] px-3 rounded-xl text-xs font-bold cursor-pointer ${
                    model === 'gemini-4-hydrogen' ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  Gemini 4 Flash
                </button>
                <button
                  type="button"
                  onClick={() => setModel('gemini-3.1-flash-lite')}
                  className={`min-h-[48px] px-3 rounded-xl text-xs font-bold cursor-pointer ${
                    model === 'gemini-3.1-flash-lite' ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  Flash Lite
                </button>
              </div>
            </div>
          </div>

          <div className="surface-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              <h3 className="font-display text-base font-bold">One-Tap Starters</h3>
            </div>
            <div className="space-y-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={sending}
                  onClick={() => sendMessage(prompt)}
                  className="surface-elevated w-full min-h-[52px] p-3 rounded-xl text-left text-xs font-bold cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Multi-Turn Conversation / Live Video View */}
        <div className="lg:col-span-8 surface-card rounded-2xl p-5 sm:p-6 flex flex-col h-[600px]">
          {chatMode === 'video' ? (
            <div className="flex-1 flex flex-col justify-between space-y-3 overflow-y-auto">
              {/* Video Viewport with HUD and Caption Overlay */}
              <div className="w-full flex-1 min-h-[300px] max-h-[380px] rounded-2xl overflow-hidden border-2 border-theme bg-black relative flex items-center justify-center shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Top Live Badge */}
                <div className="absolute top-3 left-3 bg-black/75 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-xs font-extrabold flex items-center gap-2 border border-white/20">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span>LIVE VIDEO AI FEED ({aiName})</span>
                </div>

                {sending && (
                  <div className="absolute top-3 right-3 bg-orange-600/90 text-white px-3 py-1.5 rounded-full text-xs font-extrabold shadow-lg animate-pulse">
                    <span>{aiName} is analyzing live camera frame...</span>
                  </div>
                )}

                {/* AI Spoken Subtitle Overlay */}
                {lastAssistantMessage && (
                  <div className="absolute bottom-3 left-3 right-3 bg-black/85 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-white/20 text-white shadow-2xl flex items-start justify-between gap-3 max-h-[140px] overflow-y-auto">
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-bold text-orange-400">
                        {aiName} Speaking ({lastAssistantMessage.modelUsed || 'AI Vision'}):
                      </p>
                      <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                        {lastAssistantMessage.text}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        speakText(lastAssistantMessage.text, voiceSpeed, {
                          persona: patientProfile.voicePersona,
                        })
                      }
                      className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white shrink-0 cursor-pointer"
                      aria-label="Replay audio readout"
                      title="Read aloud"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Live Video Quick Actions */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-muted">Tap to ask {aiName} about your live camera feed:</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() =>
                      askAboutLiveVideo('Describe what you see in front of me right now through this live camera feed.')
                    }
                    className="surface-elevated min-h-[48px] p-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                    <span>Describe Surroundings</span>
                  </button>

                  <button
                    type="button"
                    disabled={sending}
                    onClick={() =>
                      askAboutLiveVideo('Read and explain any printed text, signs, or labels in this live feed.')
                    }
                    className="surface-elevated min-h-[48px] p-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-400" />
                    <span>Read Printed Text</span>
                  </button>

                  <button
                    type="button"
                    disabled={sending}
                    onClick={() =>
                      askAboutLiveVideo('Check this live view for trip hazards, obstacles, stairs, or safety issues.')
                    }
                    className="surface-elevated min-h-[48px] p-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                    <span>Check Hazards</span>
                  </button>

                  <button
                    type="button"
                    disabled={sending}
                    onClick={() =>
                      askAboutLiveVideo('Identify the central object, medication, or item in this live camera feed.')
                    }
                    className="surface-elevated min-h-[48px] p-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Identify Object</span>
                  </button>
                </div>

                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs text-muted">
                    Camera remains live. Type or speak below to ask specific questions about what you see.
                  </span>
                  <button
                    type="button"
                    onClick={() => setChatMode('text')}
                    className="surface-elevated px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer shrink-0"
                  >
                    View Text Chat History
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-6 space-y-3">
                  <div className="surface-elevated w-16 h-16 rounded-2xl flex items-center justify-center">
                    <Bot className="w-8 h-8" aria-hidden="true" />
                  </div>
                  <h2 className="font-display text-2xl font-extrabold">
                    Ask {aiName} Anything
                  </h2>
                  <p className="text-sm text-muted max-w-md">
                    Adapted to {patientProfile.fullName}’s active accessibility profile. Tap a
                    starter question, start Live Video Chat, or dictate your message.
                  </p>
                </div>
              ) : (
                chatMessages.map((msg) => {
                  const isUser = msg.role === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl p-4 space-y-2 ${
                          isUser ? 'btn-accent' : 'surface-elevated'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 text-xs opacity-80 font-bold">
                          <span>{isUser ? patientProfile.fullName || 'You' : aiName}</span>
                          {!isUser && (
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() =>
                                  speakText(msg.text, voiceSpeed, {
                                    persona: patientProfile.voicePersona,
                                  })
                                }
                                className="inline-flex items-center gap-1 underline cursor-pointer"
                                aria-label="Speak response aloud"
                              >
                                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                                <span>Speak</span>
                              </button>
                              {onCallCaregiver && (
                                <button
                                  type="button"
                                  onClick={onCallCaregiver}
                                  className="inline-flex items-center gap-1 text-red-400 font-bold hover:underline cursor-pointer"
                                  aria-label="Call Caregiver Now"
                                >
                                  <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>Call Caregiver</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap">
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}

              {sending && (
                <div className="flex justify-start">
                  <div className="surface-elevated rounded-2xl px-4 py-3 text-sm font-bold text-muted">
                    {aiName} is thinking &amp; speaking...
                  </div>
                </div>
              )}
              <div ref={threadEndRef} />
            </div>
          )}

          {errorMsg && (
            <p role="alert" className="text-sm font-bold text-red-500 pt-2">
              {errorMsg}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="pt-4 mt-3 border-t border-theme flex gap-2"
          >
            <button
              type="button"
              onClick={handleVoiceInput}
              className={`min-h-[56px] min-w-[56px] rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                listeningVoice ? 'bg-red-600 text-white' : 'surface-elevated'
              }`}
              aria-label="Dictate message with microphone"
              title="Voice Dictation"
            >
              <Mic className="w-5 h-5" aria-hidden="true" />
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={4000}
              placeholder="Ask for calm breathing, simplified steps, or caregiver help..."
              className="surface-elevated flex-1 min-h-[56px] rounded-xl px-4 font-medium"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="btn-accent min-h-[56px] px-5 rounded-xl font-extrabold flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-5 h-5" aria-hidden="true" />
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};
