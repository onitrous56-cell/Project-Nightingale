import {
  CaregiverConfig,
  DisabilityKey,
  FunctionalModuleId,
  PatientProfile,
  TextSize,
  ThemeMode,
  VoiceSpeed,
} from '../types';
import {isSupportedLanguage} from './i18n';

export const CAREGIVER_STORAGE_KEY = 'ablebridge_caregiver_config_v1';

export const ALL_FUNCTIONAL_MODULES: FunctionalModuleId[] = [
  'vision',
  'sign',
  'sound',
  'aac',
  'routine',
  'memory',
  'dyslexia',
  'motor',
  'fall',
  'calm',
  'stress',
  'map',
  'assistant',
  'magnifier',
  'hydration',
  'tactile',
];

const V2_NEW_MODULES: FunctionalModuleId[] = ['magnifier', 'hydration', 'tactile'];
const V2_MODULES_MIGRATED_KEY = 'ablebridge_v2_modules_migrated_v1';

export function mergeNewlyAddedToolkitModules(existing: FunctionalModuleId[]): FunctionalModuleId[] {
  try {
    if (localStorage.getItem(V2_MODULES_MIGRATED_KEY) === '1') {
      return existing;
    }
    const merged = Array.from(new Set<FunctionalModuleId>([...existing, ...V2_NEW_MODULES]));
    localStorage.setItem(V2_MODULES_MIGRATED_KEY, '1');
    return merged;
  } catch {
    return Array.from(new Set<FunctionalModuleId>([...existing, ...V2_NEW_MODULES]));
  }
}

export interface DisabilityOption {
  key: DisabilityKey;
  label: string;
  group:
    | 'Physical, Neurological & Sensory'
    | 'Mental, Cognitive & Learning'
    | 'Age-Related Physical & Cognitive';
  supportSummary: string;
}

export const DISABILITY_OPTIONS: DisabilityOption[] = [
  {
    key: 'visual_impairment',
    label: 'Visual Impairment / Color Blindness',
    group: 'Physical, Neurological & Sensory',
    supportSummary: 'High-contrast theme, XL text, Vision Narrator prioritized',
  },
  {
    key: 'hearing_impairment',
    label: 'Hearing Loss / Deafness',
    group: 'Physical, Neurological & Sensory',
    supportSummary: 'Visual Sound Radar, screen flashes, strong vibration alerts',
  },
  {
    key: 'speech_nonverbal',
    label: 'Non-Verbal / Speech Impairment',
    group: 'Physical, Neurological & Sensory',
    supportSummary: 'Quick Picture Board (AAC) & Sign Translator prioritized',
  },
  {
    key: 'motor_limitation',
    label: 'Motor / Mobility Limitation',
    group: 'Physical, Neurological & Sensory',
    supportSummary: 'Head-Tilt & Switch Scanning Communicator enabled',
  },
  {
    key: 'paralysis_quadriplegia',
    label: 'Paralysis / Quadriplegia / Severe Motor Loss',
    group: 'Physical, Neurological & Sensory',
    supportSummary: 'Auto-scan hands-free communicator, voice AI, simplified cards & SOS',
  },
  {
    key: 'epilepsy_seizure',
    label: 'Epilepsy / Seizure & Photosensitivity Alert',
    group: 'Physical, Neurological & Sensory',
    supportSummary: 'Strict zero-flash protection, 3D motion disabled, 1.8G Fall/Seizure SOS',
  },
  {
    key: 'arthritis_tremor',
    label: 'Arthritis / Parkinson’s / Hand Tremor',
    group: 'Physical, Neurological & Sensory',
    supportSummary: 'XL touch targets, switch scanning, voice companion & simplified layout',
  },
  {
    key: 'fall_risk',
    label: 'Fall Risk / Balance Safety',
    group: 'Physical, Neurological & Sensory',
    supportSummary: 'Background G-Force Guardian, Care Map & 1.8G sensitive threshold',
  },
  {
    key: 'dyslexia_learning',
    label: 'Dyslexia / Reading Difference',
    group: 'Mental, Cognitive & Learning',
    supportSummary: 'Soft Cream theme, OpenDyslexic lens & reading ruler',
  },
  {
    key: 'learning_disabilities',
    label: 'Learning Disabilities (Dyscalculia / Dysgraphia / Processing)',
    group: 'Mental, Cognitive & Learning',
    supportSummary: '0.8x slower voice, step-by-step AI tutor, Routine Coach & Reading Lens',
  },
  {
    key: 'autism_sensory',
    label: 'Autism Spectrum (ASD) / Sensory Overload',
    group: 'Mental, Cognitive & Learning',
    supportSummary: 'Low-stimulation mode (no flashes), Sensory Calm, Stress Tracker & AAC',
  },
  {
    key: 'adhd_executive',
    label: 'ADHD / Executive Function Support',
    group: 'Mental, Cognitive & Learning',
    supportSummary: 'Step-by-Step Routine Coach, Stress Tracker & simplified focus layout',
  },
  {
    key: 'anxiety_panic',
    label: 'Anxiety / Panic Disorder',
    group: 'Mental, Cognitive & Learning',
    supportSummary: 'Guided Breathing, 5-4-3-2-1 Grounding, Stress Tracker & Gemini Coach',
  },
  {
    key: 'intellectual_dev',
    label: 'Intellectual / Developmental Disability',
    group: 'Mental, Cognitive & Learning',
    supportSummary: 'Simplified dashboard, picture AAC & clear step prompts',
  },
  {
    key: 'ptsd_depression',
    label: 'PTSD / Mood & Trauma Sensitivity',
    group: 'Mental, Cognitive & Learning',
    supportSummary: 'Zero sudden flashes, grounding tools, stress logs & calm AI coach',
  },
  {
    key: 'dementia_memory',
    label: 'Dementia / Alzheimer’s Memory Support',
    group: 'Age-Related Physical & Cognitive',
    supportSummary: '0.8x slower voice, XL text, Routine Coach, Safety Map & Fall Guardian',
  },
  {
    key: 'age_mobility_frailty',
    label: 'Age-Related Mobility Frailty & Balance Decline',
    group: 'Age-Related Physical & Cognitive',
    supportSummary: 'Always-on 1.8G Fall Guardian, Safety Map & XL controls',
  },
  {
    key: 'age_hearing_vision_decline',
    label: 'Age-Related Presbycusis (Hearing) & Vision Decline',
    group: 'Age-Related Physical & Cognitive',
    supportSummary: 'High-contrast theme, XL text, 0.8x clear voice, Sound Radar & Vision Narrator',
  },
  {
    key: 'stroke_aphasia',
    label: 'Post-Stroke Aphasia & Rehabilitation Support',
    group: 'Age-Related Physical & Cognitive',
    supportSummary: 'AAC Picture Board, Head-Tilt Communicator, Routine Coach & AI Helper',
  },
  {
    key: 'age_cognitive_decline',
    label: 'Age-Related Cognitive & Memory Decline',
    group: 'Age-Related Physical & Cognitive',
    supportSummary: 'Simplified focus cards, 0.8x voice, Routine Coach & Mental Stress Tracker',
  },
];

export function generateRemoteAccessCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function isValidRemoteCodeFormat(code: string): boolean {
  return /^[A-Z0-9]{8}$/.test(code.trim().toUpperCase());
}

export function getLocalCalendarDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseCalendarDayIndex(dateOrIso: string): number | null {
  if (!dateOrIso) return null;
  const parsed = new Date(dateOrIso);
  if (Number.isNaN(parsed.getTime())) return null;
  return Math.floor(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) / 86400000);
}

/**
 * Automatically advances `accidentFreeDays` on each new calendar day when not reset.
 */
export function syncAccidentFreeStreakForNewDay(profile: PatientProfile): PatientProfile {
  const now = new Date();
  const todayDayIndex = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000
  );

  const safeCurrentDays =
    typeof profile.accidentFreeDays === 'number' && Number.isFinite(profile.accidentFreeDays)
      ? Math.max(0, Math.round(profile.accidentFreeDays))
      : 0;

  let anchorIso = profile.streakLastResetIso;
  let anchorDayIndex = parseCalendarDayIndex(anchorIso);

  if (anchorDayIndex === null) {
    anchorDayIndex = todayDayIndex - safeCurrentDays;
    anchorIso = new Date(now.getTime() - safeCurrentDays * 86400000).toISOString();
  }

  const computedDays = Math.min(36500, Math.max(0, todayDayIndex - anchorDayIndex));
  if (computedDays === safeCurrentDays && profile.streakLastResetIso === anchorIso) {
    return profile;
  }

  return {
    ...profile,
    accidentFreeDays: computedDays,
    streakLastResetIso: anchorIso,
  };
}

export const DEFAULT_PATIENT_PROFILE: PatientProfile = {
  fullName: 'Alex Rivera',
  age: '28',
  bloodType: 'O+',
  allergiesAndNotes: 'No known drug allergies. Prefers calm spoken prompts.',
  caregiverName: 'Maria Rivera',
  caregiverPhone: '+1 (555) 019-4820',
  alertEmail: '',
  avatarDataUrl: '',
  disabilities: ['anxiety_panic', 'dyslexia_learning'],
  simplifiedMode: false,
  lowStimulationMode: false,
  enable3DBackground: true,
  childFriendlyMode: false,
  enabledModules: [...ALL_FUNCTIONAL_MODULES],
  backgroundGuardianEnabled: true,
  fallGThreshold: 2.6,
  inactivitySeconds: 30,
  soundThresholdDb: 72,
  accidentFreeDays: 7,
  streakLastResetIso: new Date(Date.now() - 7 * 86400000).toISOString(),
  termsAcceptedAtIso: '',
  adultCaregiverConfirmed: false,
  remoteAccessCode: generateRemoteAccessCode(),
  aiAssistantNickname: 'Nova',
  talkBackEnabled: false,
  voicePersona: 'natural-female',
  liveWallpaperType: 'aurora-waves',
  floatingAiEnabled: true,
  preferredLanguage: 'en-US',
  smartBatterySaverEnabled: true,
  batterySaverThreshold: 20,
};

export const DEFAULT_CAREGIVER_CONFIG: CaregiverConfig = {
  pin: '1234',
  profile: DEFAULT_PATIENT_PROFILE,
};

export function loadCaregiverConfig(): CaregiverConfig {
  try {
    const raw = localStorage.getItem(CAREGIVER_STORAGE_KEY);
    if (!raw) return DEFAULT_CAREGIVER_CONFIG;
    const parsed = JSON.parse(raw) as Partial<CaregiverConfig>;
    const mergedProfile = {
      ...DEFAULT_PATIENT_PROFILE,
      ...(parsed.profile ?? {}),
    };
    const safeRemoteCode =
      typeof mergedProfile.remoteAccessCode === 'string' &&
      isValidRemoteCodeFormat(mergedProfile.remoteAccessCode)
        ? mergedProfile.remoteAccessCode.toUpperCase()
        : generateRemoteAccessCode();

    const baseProfile: PatientProfile = {
      ...mergedProfile,
      disabilities: Array.isArray(parsed.profile?.disabilities)
        ? parsed.profile.disabilities
        : DEFAULT_PATIENT_PROFILE.disabilities,
      enabledModules:
        Array.isArray(parsed.profile?.enabledModules) && parsed.profile.enabledModules.length > 0
          ? mergeNewlyAddedToolkitModules(parsed.profile.enabledModules)
          : [...ALL_FUNCTIONAL_MODULES],
      accidentFreeDays:
        typeof mergedProfile.accidentFreeDays === 'number' &&
        Number.isFinite(mergedProfile.accidentFreeDays)
          ? Math.max(0, Math.round(mergedProfile.accidentFreeDays))
          : DEFAULT_PATIENT_PROFILE.accidentFreeDays,
      remoteAccessCode: safeRemoteCode,
      preferredLanguage: isSupportedLanguage(mergedProfile.preferredLanguage)
        ? mergedProfile.preferredLanguage
        : 'en-US',
      smartBatterySaverEnabled:
        typeof mergedProfile.smartBatterySaverEnabled === 'boolean'
          ? mergedProfile.smartBatterySaverEnabled
          : true,
      batterySaverThreshold:
        typeof mergedProfile.batterySaverThreshold === 'number' &&
        Number.isFinite(mergedProfile.batterySaverThreshold)
          ? Math.min(50, Math.max(5, Math.round(mergedProfile.batterySaverThreshold)))
          : 20,
    };

    return {
      pin: parsed.pin && /^\d{4}$/.test(parsed.pin) ? parsed.pin : '1234',
      profile: syncAccidentFreeStreakForNewDay(baseProfile),
    };
  } catch {
    return DEFAULT_CAREGIVER_CONFIG;
  }
}

export function saveCaregiverConfig(config: CaregiverConfig): void {
  try {
    localStorage.setItem(CAREGIVER_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota issues
  }
}

export interface RecommendedSetup {
  theme: ThemeMode;
  textSize: TextSize;
  voiceSpeed: VoiceSpeed;
  lowStimulationMode: boolean;
  enable3DBackground: boolean;
  simplifiedMode: boolean;
  fallGThreshold: number;
  backgroundGuardianEnabled: boolean;
  recommendedModules: FunctionalModuleId[];
}

export function computeRecommendedSetup(disabilities: DisabilityKey[]): RecommendedSetup {
  const has = (k: DisabilityKey) => disabilities.includes(k);

  let theme: ThemeMode = 'dark';
  if (has('visual_impairment') || has('age_hearing_vision_decline')) {
    theme = 'high-contrast';
  } else if (
    has('dyslexia_learning') ||
    has('learning_disabilities') ||
    has('autism_sensory') ||
    has('ptsd_depression') ||
    has('epilepsy_seizure')
  ) {
    theme = 'cream';
  }

  const textSize: TextSize =
    has('visual_impairment') ||
    has('dementia_memory') ||
    has('intellectual_dev') ||
    has('arthritis_tremor') ||
    has('age_hearing_vision_decline') ||
    has('age_cognitive_decline') ||
    has('stroke_aphasia')
      ? 'xl'
      : 'normal';

  const voiceSpeed: VoiceSpeed =
    has('dementia_memory') ||
    has('intellectual_dev') ||
    has('autism_sensory') ||
    has('anxiety_panic') ||
    has('learning_disabilities') ||
    has('stroke_aphasia') ||
    has('age_hearing_vision_decline') ||
    has('age_cognitive_decline')
      ? 0.8
      : 1.0;

  const lowStimulationMode =
    has('epilepsy_seizure') ||
    has('autism_sensory') ||
    has('ptsd_depression') ||
    has('anxiety_panic');

  // Protect photosensitive epilepsy & sensory overload users from 3D motion automatically
  const enable3DBackground = !(has('epilepsy_seizure') || has('autism_sensory'));

  const simplifiedMode =
    has('dementia_memory') ||
    has('intellectual_dev') ||
    has('adhd_executive') ||
    has('autism_sensory') ||
    has('paralysis_quadriplegia') ||
    has('arthritis_tremor') ||
    has('age_cognitive_decline') ||
    has('stroke_aphasia');

  const fallGThreshold =
    has('fall_risk') ||
    has('dementia_memory') ||
    has('epilepsy_seizure') ||
    has('age_mobility_frailty') ||
    has('paralysis_quadriplegia')
      ? 1.8
      : 2.6;

  const backgroundGuardianEnabled =
    has('fall_risk') ||
    has('dementia_memory') ||
    has('motor_limitation') ||
    has('paralysis_quadriplegia') ||
    has('epilepsy_seizure') ||
    has('age_mobility_frailty') ||
    disabilities.length > 0;

  const recommended = new Set<FunctionalModuleId>();
  if (disabilities.length === 0) {
    ALL_FUNCTIONAL_MODULES.forEach((m) => recommended.add(m));
  } else {
    if (has('visual_impairment') || has('age_hearing_vision_decline')) {
      recommended.add('vision');
      recommended.add('magnifier');
      recommended.add('dyslexia');
      recommended.add('tactile');
      recommended.add('fall');
      recommended.add('assistant');
    }
    if (has('hearing_impairment') || has('age_hearing_vision_decline')) {
      recommended.add('sound');
      recommended.add('sign');
      recommended.add('tactile');
    }
    if (has('speech_nonverbal') || has('stroke_aphasia')) {
      recommended.add('aac');
      recommended.add('sign');
      recommended.add('tactile');
      recommended.add('assistant');
    }
    if (has('motor_limitation') || has('paralysis_quadriplegia') || has('arthritis_tremor')) {
      recommended.add('motor');
      recommended.add('aac');
      recommended.add('hydration');
      recommended.add('fall');
      recommended.add('assistant');
    }
    if (has('fall_risk') || has('age_mobility_frailty') || has('epilepsy_seizure')) {
      recommended.add('fall');
      recommended.add('map');
      recommended.add('routine');
      recommended.add('hydration');
    }
    if (has('dyslexia_learning') || has('learning_disabilities')) {
      recommended.add('dyslexia');
      recommended.add('magnifier');
      recommended.add('routine');
      recommended.add('memory');
      recommended.add('assistant');
    }
    if (has('autism_sensory') || has('anxiety_panic') || has('ptsd_depression') || has('epilepsy_seizure')) {
      recommended.add('calm');
      recommended.add('stress');
      recommended.add('aac');
      recommended.add('routine');
      recommended.add('hydration');
      recommended.add('assistant');
    }
    if (
      has('adhd_executive') ||
      has('dementia_memory') ||
      has('intellectual_dev') ||
      has('age_cognitive_decline') ||
      has('stroke_aphasia')
    ) {
      recommended.add('memory');
      recommended.add('routine');
      recommended.add('hydration');
      recommended.add('calm');
      recommended.add('stress');
      recommended.add('aac');
      recommended.add('fall');
      recommended.add('map');
    }
  }

  return {
    theme,
    textSize,
    voiceSpeed,
    lowStimulationMode,
    enable3DBackground,
    simplifiedMode,
    fallGThreshold,
    backgroundGuardianEnabled,
    recommendedModules: Array.from(recommended),
  };
}
