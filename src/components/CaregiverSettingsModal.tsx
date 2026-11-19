import React, {useState} from 'react';
import {
  AlertTriangle,
  Baby,
  BatteryCharging,
  Bot,
  Box,
  Check,
  Delete,
  Globe,
  KeyRound,
  Lock,
  Mail,
  MessageSquare,
  Palette,
  PhoneCall,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  Volume2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import {useFirebase} from '../contexts/FirebaseContext';
import {SmartBatterySaverState} from '../hooks/useSmartBatterySaver';
import {
  CaregiverConfig,
  DisabilityKey,
  FunctionalModuleId,
  LiveWallpaperType,
  PatientProfile,
  TextSize,
  ThemeMode,
  VoicePersona,
  VoiceSpeed,
} from '../types';
import {
  ALL_FUNCTIONAL_MODULES,
  computeRecommendedSetup,
  DISABILITY_OPTIONS,
  generateRemoteAccessCode,
} from '../utils/patientProfile';
import {
  isNativeApkEnvironment,
  requestGuardianNotificationPermission,
} from '../utils/backgroundGuardian';
import {buildCaregiverAlertLinks} from '../utils/caregiverAlerts';
import {
  getLanguageMeta,
  getLocalizedModuleMeta,
  SUPPORTED_LANGUAGES,
  t,
  useAppLanguage,
} from '../utils/i18n';
import {
  setGlobalLanguage,
  speakText,
  testVoicePersona,
  triggerVibration,
  VOICE_PERSONA_LABELS,
} from '../utils/multimodal';
import {ProfileAvatar, resizeImageFileToDataUrl} from './ProfileAvatar';

interface CaregiverSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: CaregiverConfig;
  theme: ThemeMode;
  textSize: TextSize;
  voiceSpeed: VoiceSpeed;
  batteryState?: SmartBatterySaverState;
  onUpdateConfig: (next: CaregiverConfig) => void;
  onApplyAccessibilityOverrides: (prefs: {
    theme: ThemeMode;
    textSize: TextSize;
    voiceSpeed: VoiceSpeed;
  }) => void;
  onResetAllLocalState?: () => void;
}

const MODULE_LABELS: Record<FunctionalModuleId, string> = {
  vision: '01 · Scene, Color & Currency Narrator',
  sign: '02 · Sign Language & Gesture Translator',
  sound: '03 · Sound Alert & Visual Radar',
  aac: '04 · Quick Picture Board (AAC)',
  routine: '05 · Step-by-Step Routine Coach',
  memory: '06 · Cognitive Memory Aids',
  dyslexia: '07 · Dyslexia Reading & Focus Lens',
  motor: '08 · Head-Tilt & Blink Communicator',
  fall: '09 · Fall & Inactivity Guardian',
  calm: '10 · Mental Health & Sensory Calm Studio',
  stress: '11 · Mental Status & Stress Tracker',
  map: '12 · Caregiver & Accessible Care Map',
  assistant: '13 · Gemini Assistive AI Companion',
  magnifier: '14 · Digital Magnifier & High-Contrast Loupe',
  hydration: '15 · Hydration & Gentle Stretch Pacer',
  tactile: '16 · Braille & Haptic Morse Studio',
};

export const CaregiverSettingsModal: React.FC<CaregiverSettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  theme,
  textSize,
  voiceSpeed,
  batteryState,
  onUpdateConfig,
  onApplyAccessibilityOverrides,
  onResetAllLocalState,
}) => {
  const {
    user,
    browserOnline,
    manualOfflineMode,
    setManualOfflineMode,
    deleteAccountAndData,
  } = useFirebase();
  const [unlocked, setUnlocked] = useState(false);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'patient' | 'disabilities' | 'safety' | 'security'>(
    'patient'
  );
  const [newPin, setNewPin] = useState('');
  const [pinSavedMsg, setPinSavedMsg] = useState<string | null>(null);
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm' | 'deleting'>('idle');
  const [deleteFeedback, setDeleteFeedback] = useState<string | null>(null);
  const [notifStatus, setNotifStatus] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  if (!isOpen) return null;

  const profile = config.profile;
  const activeLang = useAppLanguage(profile.preferredLanguage);

  const updateProfile = (patch: Partial<PatientProfile>) => {
    onUpdateConfig({
      ...config,
      profile: {...profile, ...patch},
    });
  };

  const handleClose = () => {
    setUnlocked(false);
    setPinEntry('');
    setPinError(null);
    setPinSavedMsg(null);
    setDeleteStep('idle');
    setDeleteFeedback(null);
    onClose();
  };

  const handlePinDigit = (digit: string) => {
    if (pinEntry.length >= 4) return;
    const next = pinEntry + digit;
    setPinEntry(next);
    setPinError(null);
    triggerVibration(30);

    if (next.length === 4) {
      if (next === config.pin) {
        setUnlocked(true);
        setPinEntry('');
        triggerVibration([60, 40, 60]);
      } else {
        setPinError(t(activeLang, 'wrongPin'));
        triggerVibration([150, 50, 150]);
        setTimeout(() => setPinEntry(''), 450);
      }
    }
  };

  const toggleDisability = (key: DisabilityKey) => {
    const exists = profile.disabilities.includes(key);
    const nextList = exists
      ? profile.disabilities.filter((d) => d !== key)
      : [...profile.disabilities, key];
    updateProfile({disabilities: nextList});
  };

  const toggleModuleEnabled = (id: FunctionalModuleId) => {
    const exists = profile.enabledModules.includes(id);
    const next = exists
      ? profile.enabledModules.filter((m) => m !== id)
      : [...profile.enabledModules, id];
    if (next.length === 0) return;
    updateProfile({enabledModules: next});
  };

  const handleApplyRecommended = () => {
    const rec = computeRecommendedSetup(profile.disabilities);
    const nextWallpaper: LiveWallpaperType = !rec.enable3DBackground
      ? 'off'
      : rec.theme === 'liquid-glass'
        ? 'liquid-glass'
        : profile.liveWallpaperType === 'off'
          ? 'aurora-waves'
          : profile.liveWallpaperType || 'aurora-waves';
    updateProfile({
      lowStimulationMode: rec.lowStimulationMode,
      enable3DBackground: rec.enable3DBackground,
      liveWallpaperType: nextWallpaper,
      simplifiedMode: rec.simplifiedMode,
      fallGThreshold: rec.fallGThreshold,
      backgroundGuardianEnabled: rec.backgroundGuardianEnabled,
      enabledModules: rec.recommendedModules,
    });
    onApplyAccessibilityOverrides({
      theme: rec.theme,
      textSize: rec.textSize,
      voiceSpeed: rec.voiceSpeed,
    });
    triggerVibration([80, 40, 100]);
    speakText(
      `Applied tailored profile for ${profile.fullName || 'patient'}.`,
      rec.voiceSpeed,
      {lang: activeLang, persona: profile.voicePersona}
    );
  };

  const handleSaveNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(newPin)) {
      setPinSavedMsg('PIN must be exactly 4 digits (0-9).');
      return;
    }
    onUpdateConfig({...config, pin: newPin});
    setNewPin('');
    setPinSavedMsg('Caregiver PIN updated.');
    triggerVibration(70);
  };

  const physicalOptions = DISABILITY_OPTIONS.filter(
    (d) => d.group === 'Physical, Neurological & Sensory'
  );
  const mentalOptions = DISABILITY_OPTIONS.filter(
    (d) => d.group === 'Mental, Cognitive & Learning'
  );
  const ageOptions = DISABILITY_OPTIONS.filter(
    (d) => d.group === 'Age-Related Physical & Cognitive'
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Caregiver Settings"
    >
      <div className="surface-card w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-5 sm:px-7 py-4 border-b border-theme flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="surface-elevated w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
              {unlocked ? (
                <ShieldCheck className="w-6 h-6 text-[#00f5d4]" aria-hidden="true" />
              ) : (
                <Lock className="w-6 h-6" aria-hidden="true" />
              )}
            </div>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-extrabold">
                {unlocked ? t(activeLang, 'settingsTitle') : t(activeLang, 'caregiverPinLock')}
              </h2>
              <p className="text-xs sm:text-sm font-bold text-muted">
                {unlocked ? t(activeLang, 'pinUnlockedSub') : t(activeLang, 'pinLockSub')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="surface-elevated min-h-[52px] min-w-[52px] rounded-xl flex items-center justify-center cursor-pointer"
            aria-label="Close settings"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Locked PIN Keypad */}
        {!unlocked ? (
          <div className="p-6 sm:p-10 flex flex-col items-center justify-center space-y-6 overflow-y-auto">
            <div className="text-center space-y-2 max-w-md">
              <p className="text-base font-bold">{t(activeLang, 'pinPrompt')}</p>
            </div>

            <div className="flex items-center gap-4" aria-label="PIN progress">
              {[0, 1, 2, 3].map((slot) => (
                <div
                  key={slot}
                  className={`w-14 h-14 rounded-2xl border-2 border-theme flex items-center justify-center font-mono-nums text-2xl font-extrabold ${
                    pinEntry.length > slot ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  {pinEntry.length > slot ? '•' : ''}
                </div>
              ))}
            </div>

            {pinError && (
              <p role="alert" className="text-sm font-extrabold text-red-500">
                {pinError}
              </p>
            )}

            <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handlePinDigit(d)}
                  className="surface-elevated min-h-[64px] rounded-2xl font-mono-nums text-2xl font-extrabold cursor-pointer active:scale-95 transition-transform"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPinEntry('');
                  setPinError(null);
                }}
                className="surface-elevated min-h-[64px] rounded-2xl text-sm font-bold cursor-pointer"
              >
                {t(activeLang, 'clear')}
              </button>
              <button
                type="button"
                onClick={() => handlePinDigit('0')}
                className="surface-elevated min-h-[64px] rounded-2xl font-mono-nums text-2xl font-extrabold cursor-pointer active:scale-95 transition-transform"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPinEntry((p) => p.slice(0, -1))}
                className="surface-elevated min-h-[64px] rounded-2xl flex items-center justify-center cursor-pointer"
                aria-label="Backspace PIN digit"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="px-5 sm:px-7 py-3 border-b border-theme flex gap-2 overflow-x-auto no-scrollbar shrink-0">
              {(
                [
                  ['patient', t(activeLang, 'tabPatient')],
                  ['disabilities', t(activeLang, 'tabDisabilities')],
                  ['safety', t(activeLang, 'tabThemesNetwork')],
                  ['security', t(activeLang, 'tabPinSecurity')],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`min-h-[50px] px-4 rounded-xl text-sm font-bold whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === id ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Scrollable Tab Content */}
            <div className="p-5 sm:p-7 overflow-y-auto space-y-6 flex-1">
              {activeTab === 'patient' && (
                <div className="space-y-5">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-5 h-5" aria-hidden="true" />
                    <h3 className="font-display text-xl font-bold">
                      Patient Personal &amp; Medical Details
                    </h3>
                  </div>

                  {/* Avatar Photo & Remote Access Code */}
                  <div className="surface-elevated rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <ProfileAvatar
                        avatarDataUrl={profile.avatarDataUrl}
                        fullName={profile.fullName || 'Patient'}
                        size="lg"
                      />
                      <div className="space-y-1">
                        <p className="font-bold text-sm">Patient Profile Picture</p>
                        <label className="btn-accent min-h-[44px] px-3.5 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer">
                          <Upload className="w-4 h-4" aria-hidden="true" />
                          <span>Upload Photo</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const url = await resizeImageFileToDataUrl(file);
                                updateProfile({avatarDataUrl: url});
                              } catch {
                                // Ignore invalid image
                              }
                            }}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="surface-card rounded-xl px-4 py-3 space-y-1">
                      <p className="text-xs font-bold text-muted flex items-center gap-1.5">
                        <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                        Remote Access Code
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="font-mono-nums text-lg font-extrabold tracking-widest">
                          {profile.remoteAccessCode}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateProfile({remoteAccessCode: generateRemoteAccessCode()})}
                          className="surface-elevated min-h-[36px] px-2.5 rounded-lg text-xs font-bold cursor-pointer"
                          title="Generate new remote code"
                        >
                          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2 space-y-1.5">
                      <label htmlFor="pt-name" className="block text-sm font-bold">
                        Patient Full Name
                      </label>
                      <input
                        id="pt-name"
                        type="text"
                        maxLength={120}
                        value={profile.fullName}
                        onChange={(e) => updateProfile({fullName: e.target.value})}
                        className="surface-elevated w-full min-h-[56px] rounded-xl px-4 font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="pt-age" className="block text-sm font-bold">
                        Age
                      </label>
                      <input
                        id="pt-age"
                        type="text"
                        maxLength={16}
                        value={profile.age}
                        onChange={(e) => updateProfile({age: e.target.value})}
                        className="surface-elevated w-full min-h-[56px] rounded-xl px-4 font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="ai-nickname" className="block text-sm font-bold">
                      AI Assistant Nickname (What patient calls the AI)
                    </label>
                    <input
                      id="ai-nickname"
                      type="text"
                      maxLength={40}
                      value={profile.aiAssistantNickname || 'Nova'}
                      onChange={(e) => updateProfile({aiAssistantNickname: e.target.value})}
                      className="surface-elevated w-full min-h-[56px] rounded-xl px-4 font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="pt-blood" className="block text-sm font-bold">
                        Blood Type
                      </label>
                      <input
                        id="pt-blood"
                        type="text"
                        maxLength={16}
                        value={profile.bloodType}
                        onChange={(e) => updateProfile({bloodType: e.target.value})}
                        className="surface-elevated w-full min-h-[56px] rounded-xl px-4 font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="cg-name" className="block text-sm font-bold">
                        Caregiver Name
                      </label>
                      <input
                        id="cg-name"
                        type="text"
                        maxLength={120}
                        value={profile.caregiverName}
                        onChange={(e) => updateProfile({caregiverName: e.target.value})}
                        className="surface-elevated w-full min-h-[56px] rounded-xl px-4 font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="cg-phone" className="block text-sm font-bold">
                        Caregiver Phone
                      </label>
                      <input
                        id="cg-phone"
                        type="tel"
                        maxLength={40}
                        value={profile.caregiverPhone}
                        onChange={(e) => updateProfile({caregiverPhone: e.target.value})}
                        className="surface-elevated w-full min-h-[56px] rounded-xl px-4 font-bold font-mono-nums"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="cg-email" className="block text-sm font-bold">
                        Alert Email Address
                      </label>
                      <input
                        id="cg-email"
                        type="email"
                        maxLength={160}
                        value={profile.alertEmail}
                        onChange={(e) => updateProfile({alertEmail: e.target.value})}
                        placeholder="caregiver@example.com"
                        className="surface-elevated w-full min-h-[56px] rounded-xl px-4 font-bold"
                      />
                    </div>
                  </div>

                  {/* Caregiver Call / SMS / Email Readiness Diagnostic */}
                  {(() => {
                    const readiness = buildCaregiverAlertLinks({
                      patientName: profile.fullName,
                      caregiverName: profile.caregiverName,
                      caregiverPhone: profile.caregiverPhone,
                      alertEmail: profile.alertEmail,
                      lat: 37.7793,
                      lng: -122.4193,
                      remoteAccessCode: profile.remoteAccessCode,
                    });
                    const activeLangMeta = getLanguageMeta(profile.preferredLanguage);
                    return (
                      <div className="surface-elevated rounded-2xl p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-extrabold flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-[#00f5d4]" aria-hidden="true" />
                            <span>Caregiver Call, SMS &amp; Email Dispatch Readiness</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => setActiveTab('safety')}
                            className="surface-card min-h-[36px] px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              Language: {activeLangMeta.nativeLabel} ({activeLangMeta.shortTag})
                            </span>
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-bold">
                          <div
                            className={`rounded-xl p-3 flex items-center gap-2 border ${
                              readiness.hasValidPhone
                                ? 'border-emerald-500/40 bg-emerald-500/10'
                                : 'border-red-500/50 bg-red-500/10'
                            }`}
                          >
                            <PhoneCall className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>
                              Call (tel:):{' '}
                              {readiness.hasValidPhone ? readiness.cleanDigits : 'Missing Phone'}
                            </span>
                          </div>
                          <div
                            className={`rounded-xl p-3 flex items-center gap-2 border ${
                              readiness.hasValidPhone
                                ? 'border-emerald-500/40 bg-emerald-500/10'
                                : 'border-red-500/50 bg-red-500/10'
                            }`}
                          >
                            <MessageSquare className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>
                              SMS (sms:): {readiness.hasValidPhone ? 'GPS Body Ready' : 'Needs Phone'}
                            </span>
                          </div>
                          <div
                            className={`rounded-xl p-3 flex items-center gap-2 border ${
                              readiness.hasValidEmail
                                ? 'border-emerald-500/40 bg-emerald-500/10'
                                : 'border-amber-500/50 bg-amber-500/10'
                            }`}
                          >
                            <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span className="truncate">
                              Email (mailto:):{' '}
                              {readiness.hasValidEmail ? readiness.alertEmail : 'Add Alert Email'}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-1.5">
                    <label htmlFor="pt-notes" className="block text-sm font-bold">
                      Medical Notes, Allergies &amp; Communication Preferences
                    </label>
                    <textarea
                      id="pt-notes"
                      rows={3}
                      maxLength={1000}
                      value={profile.allergiesAndNotes}
                      onChange={(e) => updateProfile({allergiesAndNotes: e.target.value})}
                      className="surface-elevated w-full rounded-xl p-4 font-medium"
                    />
                  </div>
                </div>
              )}

              {activeTab === 'disabilities' && (
                <div className="space-y-6">
                  <div className="surface-elevated rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-display text-lg font-bold">
                        Smart Disability &amp; Age-Care Customization
                      </h3>
                      <p className="text-sm text-muted">
                        Select physical, paralysis, epilepsy, learning, mental, or age-related
                        conditions below, then apply tailored themes, 3D safety, speech rate, and
                        visible modules.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyRecommended}
                      className="btn-accent min-h-[56px] px-5 rounded-xl font-extrabold flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-5 h-5" aria-hidden="true" />
                      <span>{t(activeLang, 'applyTailoredSetup')}</span>
                    </button>
                  </div>

                  {[
                    ['Physical, Neurological & Sensory Conditions', physicalOptions],
                    ['Mental, Cognitive & Learning Disabilities', mentalOptions],
                    ['Age-Related Physical & Cognitive Support', ageOptions],
                  ].map(([groupTitle, list]) => (
                    <div key={groupTitle as string} className="space-y-3">
                      <h4 className="font-display text-lg font-bold">{groupTitle as string}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(list as typeof DISABILITY_OPTIONS).map((opt) => {
                          const checked = profile.disabilities.includes(opt.key);
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => toggleDisability(opt.key)}
                              className={`min-h-[76px] p-4 rounded-xl text-left flex items-start gap-3 cursor-pointer ${
                                checked ? 'btn-accent' : 'surface-elevated'
                              }`}
                            >
                              <div className="w-6 h-6 rounded-md border-2 border-current flex items-center justify-center shrink-0 mt-0.5">
                                {checked && <Check className="w-4 h-4" />}
                              </div>
                              <div>
                                <p className="font-bold text-base leading-snug">{opt.label}</p>
                                <p className="text-xs opacity-85 mt-1">{opt.supportSummary}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'safety' && (
                <div className="space-y-6">
                  {/* Always-On Background G-Force Monitor */}
                  <div className="surface-elevated rounded-2xl p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="font-display text-xl font-bold">
                          Always-On G-Force Monitor (Background &amp; APK Mode)
                        </h3>
                        <p className="text-sm text-muted mt-1">
                          Keeps fall monitoring active across all screens, locks wake state when
                          open, and writes native Foreground Service rules for Android APK builds.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateProfile({
                            backgroundGuardianEnabled: !profile.backgroundGuardianEnabled,
                          })
                        }
                        className={`min-h-[56px] px-5 rounded-xl font-extrabold whitespace-nowrap cursor-pointer ${
                          profile.backgroundGuardianEnabled ? 'btn-accent' : 'surface-card'
                        }`}
                      >
                        {profile.backgroundGuardianEnabled
                          ? 'Background Monitor: ON'
                          : 'Background Monitor: OFF'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                      <div>
                        <p className="text-xs font-bold text-muted mb-1.5">Fall Impact Sensitivity</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[1.8, 2.6, 3.2].map((g) => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => updateProfile({fallGThreshold: g})}
                              className={`min-h-[48px] rounded-xl font-mono-nums text-sm font-bold cursor-pointer ${
                                profile.fallGThreshold === g ? 'btn-accent' : 'surface-card'
                              }`}
                            >
                              {g}G
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-bold text-muted mb-1.5">Inactivity Limit</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[30, 60, 300].map((sec) => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => updateProfile({inactivitySeconds: sec})}
                              className={`min-h-[48px] rounded-xl font-mono-nums text-sm font-bold cursor-pointer ${
                                profile.inactivitySeconds === sec ? 'btn-accent' : 'surface-card'
                              }`}
                            >
                              {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-bold text-muted mb-1.5">Background Alerts</p>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await requestGuardianNotificationPermission();
                            setNotifStatus(ok ? 'granted' : 'denied');
                          }}
                          className="surface-card w-full min-h-[48px] px-3 rounded-xl text-xs font-bold cursor-pointer"
                        >
                          Notifications: {notifStatus.toUpperCase()}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs font-bold text-muted">
                      Environment:{' '}
                      {isNativeApkEnvironment()
                        ? 'Native Android APK Bridge Connected (Foreground Service Ready)'
                        : 'PWA Web Mode (Wake Lock + Service Worker Notifications active; APK config synced to localStorage)'}
                    </p>
                  </div>

                  {/* Theme Picker (8 Themes including Futuristic Neon UI & Liquid Glass) */}
                  <div className="surface-elevated rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Palette className="w-5 h-5" aria-hidden="true" />
                        <p className="text-sm font-bold">{t(activeLang, 'themePaletteTitle')}</p>
                      </div>
                      <span className="text-xs font-bold text-muted">
                        Syncs with wallpaper &amp; AI orb
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(
                        [
                          ['dark', 'Dark Slate'],
                          ['high-contrast', 'Yellow / Black'],
                          ['cream', 'Soft Cream'],
                          ['neon', 'Neon UI'],
                          ['liquid-glass', 'Liquid Glass'],
                          ['cyber-teal', 'Cyber Teal'],
                          ['calm-lavender', 'Calm Lavender'],
                          ['solar-gold', 'Solar Gold'],
                        ] as Array<[ThemeMode, string]>
                      ).map(([tId, label]) => (
                        <button
                          key={tId}
                          type="button"
                          onClick={() => {
                            onApplyAccessibilityOverrides({
                              theme: tId,
                              textSize,
                              voiceSpeed,
                            });
                            if (tId === 'liquid-glass') {
                              updateProfile({
                                liveWallpaperType: 'liquid-glass',
                                enable3DBackground: true,
                                lowStimulationMode: false,
                              });
                            } else if (profile.liveWallpaperType === 'liquid-glass') {
                              updateProfile({
                                liveWallpaperType: 'aurora-waves',
                                enable3DBackground: true,
                              });
                            }
                          }}
                          className={`min-h-[52px] px-3 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
                            theme === tId ? 'btn-accent' : 'surface-card'
                          }`}
                        >
                          {tId === 'neon' && <Zap className="w-4 h-4 shrink-0" aria-hidden="true" />}
                          <span>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Live Wallpaper Style Selector */}
                  <div className="surface-elevated rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Box className="w-5 h-5" aria-hidden="true" />
                        <p className="text-sm font-bold">{t(activeLang, 'wallpaperTitle')}</p>
                      </div>
                      <span className="text-xs font-bold text-muted">
                        {batteryState?.batterySaverActive
                          ? 'Paused by Battery Saver'
                          : profile.lowStimulationMode || !profile.enable3DBackground
                            ? 'Paused / Static'
                            : 'Active & Synced'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {(
                        [
                          ['aurora-waves', 'Aurora Waves', 'Flowing silk waves'],
                          ['liquid-glass', 'Liquid Glass', 'Refracting glass orbs'],
                          ['cosmic-orbs', 'Cosmic Orbs', 'Drifting nebula spheres'],
                          ['astrolabe', '3D Astrolabe', 'Sculpture + stars'],
                          ['off', 'Static Off', 'Solid background'],
                        ] as Array<[LiveWallpaperType, string, string]>
                      ).map(([wpId, title, desc]) => {
                        const effectiveWallpaper: LiveWallpaperType = profile.enable3DBackground
                          ? profile.liveWallpaperType || 'aurora-waves'
                          : 'off';
                        const selected = effectiveWallpaper === wpId;
                        return (
                          <button
                            key={wpId}
                            type="button"
                            onClick={() => {
                              if (wpId === 'off') {
                                updateProfile({
                                  liveWallpaperType: 'off',
                                  enable3DBackground: false,
                                });
                              } else {
                                updateProfile({
                                  liveWallpaperType: wpId,
                                  enable3DBackground: true,
                                  lowStimulationMode: false,
                                });
                                if (wpId === 'liquid-glass' && theme !== 'liquid-glass') {
                                  onApplyAccessibilityOverrides({
                                    theme: 'liquid-glass',
                                    textSize,
                                    voiceSpeed,
                                  });
                                } else if (wpId !== 'liquid-glass' && theme === 'liquid-glass') {
                                  onApplyAccessibilityOverrides({
                                    theme: 'dark',
                                    textSize,
                                    voiceSpeed,
                                  });
                                }
                              }
                            }}
                            className={`min-h-[64px] p-2.5 rounded-xl text-left cursor-pointer ${
                              selected ? 'btn-accent' : 'surface-card'
                            }`}
                          >
                            <p className="text-xs sm:text-sm font-extrabold">{title}</p>
                            <p className="text-[11px] opacity-80 leading-tight mt-0.5">{desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Connectivity: Automatic Online / Offline Mode & Manual Override */}
                  <div className="surface-elevated rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      {!browserOnline || manualOfflineMode ? (
                        <WifiOff className="w-5 h-5 mt-0.5 shrink-0 text-[#ff5500]" aria-hidden="true" />
                      ) : (
                        <Wifi className="w-5 h-5 mt-0.5 shrink-0 text-[#00f5d4]" aria-hidden="true" />
                      )}
                      <div>
                        <h3 className="font-display text-lg font-bold">
                          {t(activeLang, 'networkModeTitle')} ({!browserOnline ? t(activeLang, 'offline') : manualOfflineMode ? t(activeLang, 'offline') : t(activeLang, 'online')})
                        </h3>
                        <p className="text-xs sm:text-sm text-muted mt-0.5">
                          Automatically switches to Offline Mode when internet disconnects and restores Cloud Sync when internet returns.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setManualOfflineMode(!manualOfflineMode)}
                      className={`min-h-[48px] px-4 rounded-xl text-xs sm:text-sm font-extrabold whitespace-nowrap cursor-pointer ${
                        manualOfflineMode ? 'btn-accent' : 'surface-card'
                      }`}
                    >
                      {manualOfflineMode ? 'Manual Offline: ON (Tap for Auto)' : 'Auto Online/Offline: ON'}
                    </button>
                  </div>

                  {/* Multi-Language Selector (PIN-Locked Caregiver Setting) */}
                  <div className="surface-elevated rounded-2xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Globe className="w-5 h-5" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-bold">{t(activeLang, 'appLanguageTitle')}</p>
                          <p className="text-xs text-muted">{t(activeLang, 'languageLockHint')}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          testVoicePersona(
                            profile.voicePersona || 'natural-female',
                            voiceSpeed,
                            profile.preferredLanguage || 'en-US'
                          )
                        }
                        className="btn-accent min-h-[42px] px-3.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" aria-hidden="true" />
                        <span>{t(activeLang, 'testLanguageVoice')}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {SUPPORTED_LANGUAGES.map((langOpt) => {
                        const selected = (profile.preferredLanguage || 'en-US') === langOpt.code;
                        return (
                          <button
                            key={langOpt.code}
                            type="button"
                            onClick={() => {
                              updateProfile({preferredLanguage: langOpt.code});
                              setGlobalLanguage(langOpt.code);
                              testVoicePersona(
                                profile.voicePersona || 'natural-female',
                                voiceSpeed,
                                langOpt.code
                              );
                            }}
                            className={`min-h-[60px] p-3 rounded-xl text-left cursor-pointer ${
                              selected ? 'btn-accent' : 'surface-card'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-sm font-extrabold">{langOpt.nativeLabel}</span>
                              <span className="text-[11px] font-mono-nums font-extrabold opacity-80">
                                {langOpt.shortTag}
                              </span>
                            </div>
                            <p className="text-xs opacity-80 mt-0.5">{langOpt.label}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Smart Battery Saver Settings & Live Telemetry */}
                  <div className="surface-elevated rounded-2xl p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <BatteryCharging className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
                        <div>
                          <h3 className="font-display text-lg font-bold">
                            {t(activeLang, 'smartBatteryTitle')}
                          </h3>
                          <p className="text-xs sm:text-sm text-muted mt-0.5">
                            Automatically disables 3D live wallpapers, blurs, AI companion
                            animations, and throttles high-frequency sensors when battery drops below
                            threshold.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateProfile({
                            smartBatterySaverEnabled: !(profile.smartBatterySaverEnabled ?? true),
                          })
                        }
                        className={`min-h-[48px] px-4 rounded-xl text-sm font-extrabold whitespace-nowrap cursor-pointer ${
                          (profile.smartBatterySaverEnabled ?? true) ? 'btn-accent' : 'surface-card'
                        }`}
                      >
                        {(profile.smartBatterySaverEnabled ?? true)
                          ? 'Auto Battery Saver: ON'
                          : 'Auto Battery Saver: OFF'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                      <div>
                        <p className="text-xs font-bold text-muted mb-1.5">
                          Auto-Activate Threshold
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[15, 20, 30].map((pct) => (
                            <button
                              key={pct}
                              type="button"
                              onClick={() => updateProfile({batterySaverThreshold: pct})}
                              className={`min-h-[44px] rounded-xl font-mono-nums text-sm font-bold cursor-pointer ${
                                (profile.batterySaverThreshold ?? 20) === pct
                                  ? 'btn-accent'
                                  : 'surface-card'
                              }`}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="surface-card rounded-xl px-3.5 py-2.5 text-xs space-y-0.5">
                        <p className="font-bold text-muted">Device Battery Telemetry</p>
                        <p className="font-extrabold font-mono-nums">
                          {batteryState?.supported && batteryState.levelPercent !== null
                            ? `${batteryState.levelPercent}% · ${
                                batteryState.charging ? 'Charging' : 'On Battery'
                              }`
                            : 'Browser Battery API N/A · Ready'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => batteryState?.setManualForce(!batteryState.manualForce)}
                        className={`min-h-[44px] px-3.5 rounded-xl text-xs font-extrabold cursor-pointer ${
                          batteryState?.batterySaverActive ? 'btn-accent' : 'surface-card'
                        }`}
                      >
                        {batteryState?.manualForce
                          ? 'Forced Battery Saver: ON (Tap to Disable)'
                          : batteryState?.lowBatteryTriggered
                            ? 'Active Automatically (Low Battery)'
                            : 'Force / Test Battery Saver Now'}
                      </button>
                    </div>
                  </div>

                  {/* TalkBack & AI Multiple Voice Personas */}
                  <div className="surface-elevated rounded-2xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-5 h-5" aria-hidden="true" />
                        <p className="text-sm font-bold">{t(activeLang, 'talkBackPersonaTitle')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          testVoicePersona(
                            profile.voicePersona || 'natural-female',
                            voiceSpeed,
                            profile.preferredLanguage || 'en-US'
                          )
                        }
                        className="btn-accent min-h-[42px] px-3.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Volume2 className="w-4 h-4" aria-hidden="true" />
                        <span>{t(activeLang, 'testVoice')}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {(Object.keys(VOICE_PERSONA_LABELS) as VoicePersona[]).map((vp) => {
                        const info = VOICE_PERSONA_LABELS[vp];
                        const active = (profile.voicePersona || 'natural-female') === vp;
                        return (
                          <button
                            key={vp}
                            type="button"
                            onClick={() => {
                              updateProfile({voicePersona: vp});
                              testVoicePersona(vp, voiceSpeed, profile.preferredLanguage || 'en-US');
                            }}
                            className={`min-h-[64px] p-3 rounded-xl text-left cursor-pointer ${
                              active ? 'btn-accent' : 'surface-card'
                            }`}
                          >
                            <p className="text-xs sm:text-sm font-extrabold">{info.label}</p>
                            <p className="text-[11px] opacity-80 mt-0.5">{info.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Floating Dynamic AI, 3D Background, Child-Friendly, TalkBack, Low-Stim & Focus */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        updateProfile({
                          floatingAiEnabled: !(profile.floatingAiEnabled ?? true),
                        })
                      }
                      className={`min-h-[80px] p-4 rounded-xl text-left font-bold cursor-pointer ${
                        (profile.floatingAiEnabled ?? true) ? 'btn-accent' : 'surface-elevated'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Bot className="w-5 h-5 shrink-0" aria-hidden="true" />
                        <p className="text-base font-extrabold">
                          Dynamic AI Floating Companion:{' '}
                          {(profile.floatingAiEnabled ?? true) ? 'ON' : 'OFF'}
                        </p>
                      </div>
                      <p className="text-xs opacity-85 mt-1">
                        Displays a theme-adaptive voice orb over every screen to talk, open modules,
                        and set reminders immediately.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const nextEnabled = !profile.enable3DBackground;
                        const nextWallpaper: LiveWallpaperType = !nextEnabled
                          ? 'off'
                          : profile.liveWallpaperType && profile.liveWallpaperType !== 'off'
                            ? profile.liveWallpaperType
                            : theme === 'liquid-glass'
                              ? 'liquid-glass'
                              : 'aurora-waves';
                        updateProfile({
                          enable3DBackground: nextEnabled,
                          liveWallpaperType: nextWallpaper,
                          ...(nextEnabled ? {lowStimulationMode: false} : {}),
                        });
                      }}
                      className={`min-h-[80px] p-4 rounded-xl text-left font-bold cursor-pointer ${
                        profile.enable3DBackground &&
                        !profile.lowStimulationMode &&
                        !batteryState?.batterySaverActive
                          ? 'btn-accent'
                          : 'surface-elevated'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Box className="w-5 h-5 shrink-0" aria-hidden="true" />
                        <p className="text-base font-extrabold">
                          3D &amp; Live Wallpaper: {profile.enable3DBackground ? 'ON' : 'OFF'}
                        </p>
                      </div>
                      <p className="text-xs opacity-85 mt-1">
                        {batteryState?.batterySaverActive
                          ? 'Temporarily paused by Smart Battery Saver.'
                          : profile.lowStimulationMode
                            ? 'Paused automatically while Low-Stimulation Mode is active.'
                            : 'Interactive Three.js shader live wallpaper synced to all 8 accessibility themes.'}
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        updateProfile({childFriendlyMode: !profile.childFriendlyMode})
                      }
                      className={`min-h-[80px] p-4 rounded-xl text-left font-bold cursor-pointer ${
                        profile.childFriendlyMode ? 'btn-accent' : 'surface-elevated'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Baby className="w-5 h-5 shrink-0" aria-hidden="true" />
                        <p className="text-base font-extrabold">
                          Child Mode (PIN-Locked): {profile.childFriendlyMode ? 'ON' : 'OFF'}
                        </p>
                      </div>
                      <p className="text-xs opacity-85 mt-1">
                        Locked behind your 4-digit Caregiver PIN so children cannot exit simplified cards &amp; calmer wording.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateProfile({talkBackEnabled: !profile.talkBackEnabled})}
                      className={`min-h-[80px] p-4 rounded-xl text-left font-bold cursor-pointer ${
                        profile.talkBackEnabled ? 'btn-accent' : 'surface-elevated'
                      }`}
                    >
                      <p className="text-base font-extrabold">
                        TalkBack Menu Reader: {profile.talkBackEnabled ? 'ON' : 'OFF'}
                      </p>
                      <p className="text-xs opacity-85 mt-1">
                        Reads menu buttons, options and cards aloud using your selected voice persona.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const nextLowStim = !profile.lowStimulationMode;
                        updateProfile({
                          lowStimulationMode: nextLowStim,
                          enable3DBackground: !nextLowStim,
                          liveWallpaperType: nextLowStim
                            ? 'off'
                            : theme === 'liquid-glass'
                              ? 'liquid-glass'
                              : 'aurora-waves',
                        });
                      }}
                      className={`min-h-[80px] p-4 rounded-xl text-left font-bold cursor-pointer ${
                        profile.lowStimulationMode ? 'btn-accent' : 'surface-elevated'
                      }`}
                    >
                      <p className="text-base font-extrabold">
                        Low-Stimulation Mode: {profile.lowStimulationMode ? 'ON' : 'OFF'}
                      </p>
                      <p className="text-xs opacity-85 mt-1">
                        Disables flashing borders &amp; 3D motion for Epilepsy, ASD, or PTSD.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => updateProfile({simplifiedMode: !profile.simplifiedMode})}
                      className={`min-h-[80px] p-4 rounded-xl text-left font-bold cursor-pointer ${
                        profile.simplifiedMode ? 'btn-accent' : 'surface-elevated'
                      }`}
                    >
                      <p className="text-base font-extrabold">
                        Simplified Focus: {profile.simplifiedMode ? 'ON' : 'OFF'}
                      </p>
                      <p className="text-xs opacity-85 mt-1">
                        Displays enabled tools in extra-large two-column focus cards.
                      </p>
                    </button>
                  </div>

                  {/* Visible Modules Picker */}
                  <div className="space-y-2">
                    <p className="text-sm font-bold">
                      {t(activeLang, 'visibleModulesTitle')} ({profile.enabledModules.length} /{' '}
                      {ALL_FUNCTIONAL_MODULES.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ALL_FUNCTIONAL_MODULES.map((modId, idx) => {
                        const enabled = profile.enabledModules.includes(modId);
                        const num = String(idx + 1).padStart(2, '0');
                        const modLabel = getLocalizedModuleMeta(activeLang, modId).title || MODULE_LABELS[modId];
                        return (
                          <button
                            key={modId}
                            type="button"
                            onClick={() => toggleModuleEnabled(modId)}
                            className={`min-h-[52px] px-4 rounded-xl text-left text-sm font-bold flex items-center justify-between gap-2 cursor-pointer ${
                              enabled ? 'btn-accent' : 'surface-elevated opacity-65'
                            }`}
                          >
                            <span className="truncate">
                              {num} · {modLabel}
                            </span>
                            <span className="shrink-0">
                              {enabled ? t(activeLang, 'visibleLabel') : t(activeLang, 'hiddenLabel')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'security' && (
                <div className="space-y-6 max-w-xl">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-5 h-5" aria-hidden="true" />
                      <h3 className="font-display text-xl font-bold">Change Caregiver PIN</h3>
                    </div>
                    <p className="text-sm text-muted">
                      Current Global Display: {theme} · Text {textSize.toUpperCase()} · Voice{' '}
                      {voiceSpeed.toFixed(1)}x
                    </p>
                    <form onSubmit={handleSaveNewPin} className="space-y-3">
                      <label htmlFor="new-caregiver-pin" className="block text-sm font-bold">
                        New 4-Digit Numeric PIN
                      </label>
                      <input
                        id="new-caregiver-pin"
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        pattern="\d{4}"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="Enter 4 digits"
                        className="surface-elevated w-full min-h-[56px] rounded-xl px-4 font-mono-nums text-xl font-bold tracking-widest"
                      />
                      {pinSavedMsg && <p className="text-sm font-bold">{pinSavedMsg}</p>}
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="submit"
                          className="btn-accent min-h-[56px] px-6 rounded-xl font-extrabold cursor-pointer"
                        >
                          Save New PIN
                        </button>
                        <button
                          type="button"
                          onClick={() => setUnlocked(false)}
                          className="surface-elevated min-h-[56px] px-6 rounded-xl font-bold flex items-center gap-2 cursor-pointer"
                        >
                          <Lock className="w-5 h-5" aria-hidden="true" />
                          <span>Lock Settings Now</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Permanent Account & Local Device Data Deletion */}
                  <div className="pt-5 border-t border-theme space-y-3">
                    <div className="rounded-2xl border-2 border-red-500/70 bg-red-950/20 p-5 space-y-3">
                      <div className="flex items-center gap-2 text-red-500">
                        <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
                        <h3 className="font-display text-lg font-extrabold">
                          Delete Account &amp; Erase Data
                        </h3>
                      </div>
                      <p className="text-sm text-muted">
                        {user
                          ? `Permanently deletes signed-in Firebase account (${user.email || 'Account'}), cloud telemetry, photo memories, reminders, stress logs, and clears all local device settings.`
                          : 'Erases all local device caregiver settings, custom AAC tiles, photo memories, reminders, and resets AbleBridge to factory state.'}
                      </p>

                      {deleteFeedback && (
                        <p role="alert" className="text-sm font-bold text-red-500">
                          {deleteFeedback}
                        </p>
                      )}

                      {deleteStep === 'idle' ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteStep('confirm');
                            setDeleteFeedback(null);
                          }}
                          className="min-h-[52px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-extrabold flex items-center gap-2 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                          <span>
                            {user ? 'Delete Account & Erase Cloud Data' : 'Reset & Erase Device Data'}
                          </span>
                        </button>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={deleteStep === 'deleting'}
                            onClick={async () => {
                              setDeleteStep('deleting');
                              setDeleteFeedback(null);
                              const result = await deleteAccountAndData(
                                profile.remoteAccessCode,
                                onResetAllLocalState
                              );
                              if (result.ok) {
                                handleClose();
                              } else {
                                setDeleteFeedback(result.message);
                                setDeleteStep('confirm');
                              }
                            }}
                            className="min-h-[52px] px-5 rounded-xl bg-red-700 hover:bg-red-800 text-white text-sm font-extrabold cursor-pointer disabled:opacity-60"
                          >
                            {deleteStep === 'deleting'
                              ? 'Deleting Permanently...'
                              : 'Yes, Permanently Delete Everything'}
                          </button>
                          <button
                            type="button"
                            disabled={deleteStep === 'deleting'}
                            onClick={() => {
                              setDeleteStep('idle');
                              setDeleteFeedback(null);
                            }}
                            className="surface-elevated min-h-[52px] px-4 rounded-xl text-sm font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 sm:px-7 py-4 border-t border-theme flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={handleClose}
                className="btn-accent min-h-[56px] px-8 rounded-xl font-extrabold cursor-pointer"
              >
                {t(activeLang, 'saveAndLock')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
