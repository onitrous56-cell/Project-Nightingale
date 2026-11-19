export type ThemeMode =
  | 'dark'
  | 'high-contrast'
  | 'cream'
  | 'neon'
  | 'liquid-glass'
  | 'cyber-teal'
  | 'calm-lavender'
  | 'solar-gold';

export type VoicePersona =
  | 'natural-female'
  | 'natural-male'
  | 'human-warm'
  | 'human-gentle'
  | 'robotic'
  | 'system';

export type LiveWallpaperType =
  | 'aurora-waves'
  | 'liquid-glass'
  | 'cosmic-orbs'
  | 'astrolabe'
  | 'off';

export type LanguageCode =
  | 'en-US'
  | 'ml-IN'
  | 'hi-IN'
  | 'ta-IN'
  | 'kn-IN'
  | 'te-IN'
  | 'es-ES'
  | 'fr-FR'
  | 'ar-SA';

export type TextSize = 'normal' | 'xl';
export type VoiceSpeed = 0.8 | 1.0 | 1.3;

export type ModuleId =
  | 'home-auth'
  | 'dashboard'
  | 'caregiver-portal'
  | 'vision'
  | 'sign'
  | 'sound'
  | 'aac'
  | 'routine'
  | 'memory'
  | 'dyslexia'
  | 'motor'
  | 'fall'
  | 'calm'
  | 'stress'
  | 'map'
  | 'assistant'
  | 'magnifier'
  | 'hydration'
  | 'tactile';

export type PhotoMemoryCategory = 'family' | 'home' | 'caregiver' | 'place' | 'other';

export interface PhotoMemoryItem {
  id: string;
  title: string;
  caption: string;
  category: PhotoMemoryCategory;
  imageDataUrl: string;
  createdAtIso: string;
}

export type ReminderTimeSlot = 'morning' | 'afternoon' | 'evening' | 'anytime';

export interface MemoryReminderItem {
  id: string;
  title: string;
  notes: string;
  timeSlot: ReminderTimeSlot;
  confirmationMessage: string;
  lastCompletedDate: string; // YYYY-MM-DD local calendar day
  lastCompletedTimeLabel: string;
  createdAtIso: string;
}

export interface MultimodalAlert {
  id: number;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'emergency';
  flashScreen?: boolean;
}

export interface AACTile {
  id: string;
  label: string;
  emoji: string;
  phrase: string;
  isCustom?: boolean;
}

export interface RoutineStep {
  title: string;
  instruction: string;
  emoji: string;
  tip: string;
}

export interface RoutineDefinition {
  id: string;
  nfcTagId: string;
  nfcTagLabel: string;
  title: string;
  category: string;
  emoji: string;
  scheduledTime: string; // HH:MM 24h local time
  steps: RoutineStep[];
  isCustom?: boolean;
}

export interface RoutineCheckinEntry {
  completedDate: string; // YYYY-MM-DD
  completedTimeLabel: string;
  completedAtIso: string;
}

export type MedicineFoodRule =
  | 'with_food'
  | 'before_food'
  | 'after_food'
  | 'full_glass_water'
  | 'before_sleep'
  | 'anytime';

export interface MedicineReminderItem {
  id: string;
  name: string;
  dosage: string;
  scheduledTime: string; // HH:MM 24h local time
  foodRule: MedicineFoodRule;
  instructions: string;
  lastTakenDate: string; // YYYY-MM-DD
  lastTakenTimeLabel: string;
  createdAtIso: string;
}

export type DisabilityKey =
  | 'visual_impairment'
  | 'hearing_impairment'
  | 'speech_nonverbal'
  | 'motor_limitation'
  | 'paralysis_quadriplegia'
  | 'epilepsy_seizure'
  | 'arthritis_tremor'
  | 'fall_risk'
  | 'dyslexia_learning'
  | 'learning_disabilities'
  | 'autism_sensory'
  | 'adhd_executive'
  | 'anxiety_panic'
  | 'dementia_memory'
  | 'intellectual_dev'
  | 'ptsd_depression'
  | 'stroke_aphasia'
  | 'age_mobility_frailty'
  | 'age_hearing_vision_decline'
  | 'age_cognitive_decline';

export type FunctionalModuleId = Exclude<
  ModuleId,
  'dashboard' | 'home-auth' | 'caregiver-portal'
>;

export interface PatientProfile {
  fullName: string;
  age: string;
  bloodType: string;
  allergiesAndNotes: string;
  caregiverName: string;
  caregiverPhone: string;
  alertEmail: string;
  avatarDataUrl: string;
  disabilities: DisabilityKey[];
  // Tailored preferences
  simplifiedMode: boolean;
  lowStimulationMode: boolean; // Disables flashing screen borders for ASD/PTSD/Epilepsy
  enable3DBackground: boolean; // Toggleable Three.js ambient background & live wallpaper
  childFriendlyMode: boolean; // Child-safe encouraging labels & gentle UI framing
  enabledModules: FunctionalModuleId[];
  // Background & Safety config (APK + PWA)
  backgroundGuardianEnabled: boolean;
  fallGThreshold: number; // e.g. 1.8, 2.6, 3.2
  inactivitySeconds: number;
  soundThresholdDb: number;
  // Accident-free streak & Caregiver Legal Consent + Remote Link
  accidentFreeDays: number;
  streakLastResetIso: string;
  termsAcceptedAtIso: string;
  adultCaregiverConfirmed: boolean;
  remoteAccessCode: string;
  aiAssistantNickname: string;
  talkBackEnabled: boolean;
  voicePersona: VoicePersona;
  liveWallpaperType: LiveWallpaperType;
  floatingAiEnabled: boolean;
  preferredLanguage: LanguageCode;
  smartBatterySaverEnabled: boolean;
  batterySaverThreshold: number;
}

export interface CaregiverConfig {
  pin: string;
  profile: PatientProfile;
}

export type StressMood =
  | 'calm'
  | 'focused'
  | 'anxious'
  | 'overwhelmed'
  | 'fatigued'
  | 'happy'
  | 'sad';

export type MentalStatusLevel =
  | 'stable'
  | 'elevated_stress'
  | 'sensory_overload'
  | 'panic_risk'
  | 'fatigued';

export interface StressLogEntry {
  id: string;
  stressScore: number; // 1..10
  mood: StressMood;
  mentalStatus: MentalStatusLevel;
  triggerNote: string;
  copingAction: string;
  createdAtIso: string;
}

export interface SosEventRecord {
  id: string;
  reason: string;
  peakG: number;
  status: 'active' | 'canceled' | 'dispatched';
  lat: number;
  lng: number;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface RemoteTelemetrySnapshot {
  accessCode: string;
  ownerId: string;
  patientAlias: string;
  lat: number;
  lng: number;
  gpsConsentActive: boolean;
  accidentFreeDays: number;
  latestStressScore: number;
  latestMood: StressMood;
  latestSosStatus: 'monitoring' | 'countdown' | 'dispatched';
  updatedAtIso: string;
}

export type ChatPersona =
  | 'calm_coach'
  | 'caregiver_guide'
  | 'cognitive_tutor'
  | 'accessibility_advisor';

export interface GeminiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  persona: ChatPersona;
  text: string;
  modelUsed: string;
  createdAtIso: string;
}
