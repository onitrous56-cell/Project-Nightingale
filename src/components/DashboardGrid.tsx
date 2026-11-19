import React from 'react';
import {
  Activity,
  AudioLines,
  Award,
  Baby,
  BookOpen,
  Bot,
  Brain,
  CheckSquare,
  Droplets,
  Eye,
  Fingerprint,
  Hand,
  HeartHandshake,
  Lock,
  MapPin,
  MessageSquare,
  PhoneCall,
  ScanEye,
  ShieldAlert,
  ShieldCheck,
  Volume2,
  Zap,
  ZoomIn,
} from 'lucide-react';
import {useFirebase} from '../contexts/FirebaseContext';
import {FunctionalModuleId, ModuleId, PatientProfile, ThemeMode} from '../types';
import {getLocalizedModuleMeta, t, useAppLanguage} from '../utils/i18n';
import {DISABILITY_OPTIONS} from '../utils/patientProfile';
import {ProfileAvatar} from './ProfileAvatar';

interface DashboardGridProps {
  patientProfile: PatientProfile;
  theme: ThemeMode;
  onSelectModule: (id: ModuleId) => void;
  onQuickMultimodalDemo: () => void;
  onOpenSettings: () => void;
  onActivateNeonTheme: () => void;
  onCallCaregiver: () => void;
}

interface ModuleCardMeta {
  id: FunctionalModuleId;
  number: string;
  domain: string;
  title: string;
  childTitle: string;
  description: string;
  childDescription: string;
  capabilities: string;
  icon: React.ComponentType<{className?: string; 'aria-hidden'?: boolean}>;
}

const MODULES: ModuleCardMeta[] = [
  {
    id: 'vision',
    number: '01',
    domain: 'Vision',
    title: 'Scene, Color & Currency Narrator',
    childTitle: 'Color & Picture Reader',
    description:
      'Live crosshair color identifier, edge contrast detector, and OCR reader for medicine bottles, bills, and signs.',
    childDescription:
      'Point the camera to hear colors out loud and read signs or labels cleanly.',
    capabilities: 'Camera + Sample Presets + Speech',
    icon: Eye,
  },
  {
    id: 'sign',
    number: '02',
    domain: 'Communication',
    title: 'Sign Language & Gesture Translator',
    childTitle: 'Hand Sign Translator',
    description:
      'Front-camera hand landmark canvas with instant gesture-to-speech translator and sentence builder.',
    childDescription: 'Tap hand signs like Hello, Help, and Water to make your device speak!',
    capabilities: 'Front Cam + Gesture Simulator',
    icon: Hand,
  },
  {
    id: 'sound',
    number: '03',
    domain: 'Hearing',
    title: 'Sound Alert & Visual Radar',
    childTitle: 'Sound Radar Buddy',
    description:
      'Real-time decibel radar that flashes, vibrates, and alerts on doorbells, smoke alarms, kettles, or voices.',
    childDescription: 'Shows a fun radar wave and tells you when a doorbell or alarm rings.',
    capabilities: 'Web Audio Mic + 4 Alert Triggers',
    icon: AudioLines,
  },
  {
    id: 'aac',
    number: '04',
    domain: 'Non-Verbal Speech',
    title: 'Quick Picture Board (AAC)',
    childTitle: 'Tap-to-Talk Picture Board',
    description:
      'Large tap-to-speak communication tiles with pinned emergency alert bar and custom saved phrases.',
    childDescription: 'Big picture buttons that speak what you need with one tap!',
    capabilities: 'Emergency Bar + Custom Tiles',
    icon: MessageSquare,
  },
  {
    id: 'routine',
    number: '05',
    domain: 'Cognitive & Memory',
    title: 'Step-by-Step Routine Coach',
    childTitle: 'Daily Quest Checklist',
    description:
      'Guided visual checklists with spoken instructions and virtual NFC tag taps for medication, laundry, and home safety.',
    childDescription: 'Easy step-by-step quests with voice help for your morning & daily routine.',
    capabilities: '3 Routines + NFC Tag Simulator',
    icon: CheckSquare,
  },
  {
    id: 'memory',
    number: '06',
    domain: 'Dementia & Learning Support',
    title: 'Cognitive Memory Aids',
    childTitle: 'Photo Album & Daily Checklist',
    description:
      'Captioned family & home Photo Memory cards with read-aloud captions plus audio-confirmed Important Daily Reminders.',
    childDescription: 'Look at helpful family photos and hear friendly voice cheers when finishing tasks!',
    capabilities: 'Photo Memory + Audio Checklists',
    icon: Brain,
  },
  {
    id: 'dyslexia',
    number: '07',
    domain: 'Learning',
    title: 'Dyslexia Reading & Focus Lens',
    childTitle: 'Friendly Reading Helper',
    description:
      'OpenDyslexic spacing, pastel color overlays, draggable reading ruler, and word-highlighted read aloud.',
    childDescription: 'Soft tinted reading paper with a line tracker and word-by-word voice.',
    capabilities: 'Reading Ruler + Word Sync',
    icon: BookOpen,
  },
  {
    id: 'motor',
    number: '08',
    domain: 'Motor & Paralysis',
    title: 'Head-Tilt & Blink Communicator',
    childTitle: 'Hands-Free Big Switch Talk',
    description:
      'Auto-scanning 4-way communicator controlled by switch tap, spacebar, head-tilt buttons, or front camera motion.',
    childDescription: 'Hands-free highlighted big buttons for Yes, No, Water, and Calling Help.',
    capabilities: '2s Auto-Scan + Motion Input',
    icon: ScanEye,
  },
  {
    id: 'fall',
    number: '09',
    domain: 'Safety & Epilepsy Guard',
    title: 'Fall & Inactivity Guardian',
    childTitle: 'Safety Shield & Fall Watch',
    description:
      'Always-on accelerometer G-force monitor with 15-second alarm countdown, giant cancel button, and GPS SOS.',
    childDescription: 'Watches out for hard bumps or falls and calls your caregiver if needed.',
    capabilities: 'Background G-Force + SOS Demo',
    icon: ShieldAlert,
  },
  {
    id: 'calm',
    number: '10',
    domain: 'Sensory Calm',
    title: 'Sensory Calm & Grounding Studio',
    childTitle: 'Calm Breathing Space',
    description:
      'Guided Box/4-7-8 breathing, 5-4-3-2-1 panic grounding, emotion check-in board, and offline rain soundscapes.',
    childDescription: 'Slow bubble breathing, gentle rain sounds, and cozy grounding games.',
    capabilities: 'Breathing + Grounding + Rain',
    icon: HeartHandshake,
  },
  {
    id: 'stress',
    number: '11',
    domain: 'Mental Status Tracking',
    title: 'Mental Status & Stress Tracker',
    childTitle: 'How Am I Feeling? Journal',
    description:
      'Log daily stress score, mood, triggers, and coping steps with live trend graphs and Gemini wellness tips.',
    childDescription: 'Pick an emoji for how you feel today and get gentle calming tips.',
    capabilities: 'Stress Chart + Offline/Cloud Sync',
    icon: Activity,
  },
  {
    id: 'map',
    number: '12',
    domain: 'Care Locator Map',
    title: 'Accessible Care & Safety Map',
    childTitle: 'Safe Places Map',
    description:
      'Interactive Google Map showing live or demo location, nearby hospitals, pharmacies, clinics, and voice-guided routes.',
    childDescription: 'Shows where you are and nearby helpful clinics and safe spots.',
    capabilities: 'Places + Offline GPS Compass',
    icon: MapPin,
  },
  {
    id: 'assistant',
    number: '13',
    domain: 'AI Care Companion',
    title: 'Gemini Assistive AI Companion',
    childTitle: 'Friendly Helper Chat',
    description:
      'Multi-turn voice-ready AI guide supporting Calm Coaching, Caregiver Help, Cognitive Tutoring, and Offline Guidance.',
    childDescription: 'Ask questions anytime in plain simple words and hear friendly answers.',
    capabilities: 'Cloud Gemini + Offline Helper',
    icon: Bot,
  },
  {
    id: 'magnifier',
    number: '14',
    domain: 'Low Vision Zoom',
    title: 'Digital Magnifier & High-Contrast Loupe',
    childTitle: 'Super Zoom & Big Text Reader',
    description:
      '1x–5x live camera zoom with Yellow/Black contrast filters, freeze-frame snapshot, torch light, and AI text read aloud.',
    childDescription: 'Zoom in on tiny words or labels and hear them read clearly out loud!',
    capabilities: '1x-5x Zoom + Freeze + Contrast',
    icon: ZoomIn,
  },
  {
    id: 'hydration',
    number: '15',
    domain: 'Daily Wellness & Mobility',
    title: 'Hydration & Gentle Stretch Pacer',
    childTitle: 'Water Cups & Easy Stretches',
    description:
      'Local-saved daily water intake tracker with gentle sip reminders and 20-second voice-guided chair stretches.',
    childDescription: 'Count your cups of water today and follow fun 20-second seated stretches!',
    capabilities: 'Water Log + Stretch Timer',
    icon: Droplets,
  },
  {
    id: 'tactile',
    number: '16',
    domain: 'Deafblind & Tactile',
    title: 'Braille & Haptic Morse Studio',
    childTitle: 'Braille Dots & Tap Morse',
    description:
      'Interactive 6-dot Braille visualizer, vibration-pulsed Morse playback, and 2-button Dot/Dash tactile composer.',
    childDescription: 'See Braille dot patterns, feel vibration rhythms, and tap out words!',
    capabilities: '6-Dot Braille + Haptic Morse',
    icon: Fingerprint,
  },
];

export const DashboardGrid: React.FC<DashboardGridProps> = ({
  patientProfile,
  theme,
  onSelectModule,
  onQuickMultimodalDemo,
  onOpenSettings,
  onActivateNeonTheme,
  onCallCaregiver,
}) => {
  const {stressLogs, isOfflineMode} = useFirebase();
  const visibleModules = MODULES.filter((m) => patientProfile.enabledModules.includes(m.id));
  const disabilityLabels = patientProfile.disabilities
    .map((key) => DISABILITY_OPTIONS.find((d) => d.key === key)?.label)
    .filter(Boolean);

  const latestStress = stressLogs[0];
  const isChild = patientProfile.childFriendlyMode;
  const lang = useAppLanguage(patientProfile.preferredLanguage);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-7 space-y-5">
      {/* Main Hero & Patient Profile + Accident-Free Streak */}
      <section className="surface-card rounded-3xl p-5 sm:p-7 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 shadow-xl">
        <div className="flex items-start gap-4 max-w-2xl">
          <ProfileAvatar
            avatarDataUrl={patientProfile.avatarDataUrl}
            fullName={patientProfile.fullName || 'Guest'}
            size="lg"
          />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-bold text-muted">
              <span>{patientProfile.fullName || 'Guest'}</span>
              {patientProfile.age && <span>· Age {patientProfile.age}</span>}
              {patientProfile.bloodType && <span>· Blood {patientProfile.bloodType}</span>}
              {latestStress && (
                <span className="font-mono-nums">· Stress {latestStress.stressScore}/10</span>
              )}
            </div>

            <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-balance">
              {isChild
                ? `Hi ${patientProfile.fullName.split(/\s+/)[0] || 'Friend'}! ${t(lang, 'heroPrompt')}`
                : patientProfile.simplifiedMode
                  ? t(lang, 'heroSimplified')
                  : t(lang, 'heroPrompt')}
            </h1>

            <p className="text-sm sm:text-base text-muted leading-relaxed">
              {isChild
                ? 'Everything has big friendly buttons and gentle voice help. You can tap Call Caregiver at the bottom anytime!'
                : disabilityLabels.length > 0
                  ? `Tailored support: ${disabilityLabels.join(' · ')}`
                  : 'Every tool combines visual cues, spoken voice feedback, and vibration with instant demo controls.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
          {/* Accident-Free Streak Highlight + Caregiver Portal Access */}
          <div className="surface-elevated rounded-2xl px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Award className="w-7 h-7 text-[#ff5500] shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                  {isChild ? t(lang, 'childStreakLabel') : t(lang, 'streakLabel')}
                </p>
                <p className="font-mono-nums text-2xl font-extrabold leading-tight">
                  {patientProfile.accidentFreeDays}{' '}
                  {patientProfile.accidentFreeDays === 1 ? t(lang, 'daySafe') : t(lang, 'daysSafe')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSelectModule('caregiver-portal')}
              className="btn-accent min-h-[44px] px-3.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              <span>{t(lang, 'caregiverData')}</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCallCaregiver}
              className="min-h-[54px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer flex-1 sm:flex-initial"
            >
              <PhoneCall className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {t(lang, 'callCaregiverShort')} {patientProfile.caregiverName || 'Caregiver'}
              </span>
            </button>

            <button
              type="button"
              onClick={onActivateNeonTheme}
              className={`min-h-[54px] px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-1.5 cursor-pointer border-2 ${
                theme === 'neon'
                  ? 'bg-[#ff5500] text-[#03050a] border-[#00f5d4]'
                  : 'surface-elevated border-[#ff5500]'
              }`}
            >
              <Zap className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{theme === 'neon' ? t(lang, 'neonOn') : t(lang, 'neonUi')}</span>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className={`min-h-[54px] px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer ${
                isChild ? 'btn-accent' : 'surface-elevated'
              }`}
              title="Child-Friendly Mode is PIN-locked in Caregiver Settings"
            >
              <Baby className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{isChild ? t(lang, 'childModePin') : t(lang, 'settings')}</span>
              <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onQuickMultimodalDemo}
              className="surface-elevated min-h-[54px] px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Volume2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t(lang, 'testAlert')}</span>
            </button>
          </div>
        </div>
      </section>

      {/* Modules Grid */}
      <section aria-label="Assistive Technology Modules">
        <div
          className={`grid gap-4 sm:gap-5 ${
            patientProfile.simplifiedMode || isChild
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {visibleModules.map((mod) => {
            const Icon = mod.icon;
            const localizedMeta = getLocalizedModuleMeta(lang, mod.id);
            const localizedTitle = isChild ? localizedMeta.childTitle : localizedMeta.title;
            const localizedDescription = isChild
              ? localizedMeta.childDescription
              : localizedMeta.description;
            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => onSelectModule(mod.id)}
                className={`surface-card rounded-2xl p-5 sm:p-6 text-left flex flex-col justify-between gap-4 cursor-pointer transition-transform hover:-translate-y-0.5 active:scale-[0.99] shadow-lg ${
                  patientProfile.simplifiedMode || isChild ? 'min-h-[210px]' : 'min-h-[192px]'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-muted">
                      {mod.number} · {localizedMeta.domain}
                    </span>
                    <div className="surface-elevated w-12 h-12 rounded-xl flex items-center justify-center shrink-0">
                      <Icon className="w-6 h-6" aria-hidden={true} />
                    </div>
                  </div>
                  <h2
                    className={`font-display font-bold leading-snug ${
                      patientProfile.simplifiedMode || isChild ? 'text-2xl' : 'text-xl'
                    }`}
                  >
                    {localizedTitle}
                  </h2>
                  <p className="text-sm text-muted leading-relaxed">
                    {localizedDescription}
                  </p>
                </div>

                <div className="pt-3 border-t border-theme flex items-center justify-between gap-2 text-sm font-bold">
                  <span className="truncate text-muted">
                    {isOfflineMode && (mod.id === 'map' || mod.id === 'assistant')
                      ? `${localizedMeta.capabilities} · ${t(lang, 'offline')}`
                      : localizedMeta.capabilities}
                  </span>
                  <span className="shrink-0 underline underline-offset-4">
                    {isChild ? t(lang, 'letsGo') : t(lang, 'openTool')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
};
