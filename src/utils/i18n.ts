import {useEffect, useState} from 'react';
import {FunctionalModuleId, LanguageCode} from '../types';
import {
  getLocalizedAACTiles,
  LOCALIZED_MODULE_CARDS,
  localizeColorTerm,
  LocalizedModuleCopy,
  MODULE_ENGLISH_META,
} from './i18nModules';

export {getLocalizedAACTiles, localizeColorTerm, MODULE_ENGLISH_META};
export type {LocalizedModuleCopy};

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  shortTag: string;
  speechLang: string;
  ocrLang: string;
  aiLanguageName: string;
  rtl?: boolean;
  sampleSpeech: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'en-US',
    label: 'English',
    nativeLabel: 'English',
    shortTag: 'EN',
    speechLang: 'en-US',
    ocrLang: 'eng',
    aiLanguageName: 'English',
    sampleSpeech: 'This is AbleBridge speaking in English.',
  },
  {
    code: 'ml-IN',
    label: 'Malayalam',
    nativeLabel: 'മലയാളം',
    shortTag: 'ML',
    speechLang: 'ml-IN',
    ocrLang: 'mal+eng',
    aiLanguageName: 'Malayalam (മലയാളം)',
    sampleSpeech: 'നമസ്കാരം, ഇത് ഏബിൾബ്രിഡ്ജ് അസിസ്റ്റീവ് വോയിസ് ആണ്.',
  },
  {
    code: 'hi-IN',
    label: 'Hindi',
    nativeLabel: 'हिन्दी',
    shortTag: 'HI',
    speechLang: 'hi-IN',
    ocrLang: 'hin+eng',
    aiLanguageName: 'Hindi (हिन्दी)',
    sampleSpeech: 'नमस्ते, यह एबलब्रिज सहायक आवाज़ है।',
  },
  {
    code: 'ta-IN',
    label: 'Tamil',
    nativeLabel: 'தமிழ்',
    shortTag: 'TA',
    speechLang: 'ta-IN',
    ocrLang: 'tam+eng',
    aiLanguageName: 'Tamil (தமிழ்)',
    sampleSpeech: 'வணக்கம், இது ஏபிள்பிரிட்ஜ் உதவிக் குரல்.',
  },
  {
    code: 'kn-IN',
    label: 'Kannada',
    nativeLabel: 'ಕನ್ನಡ',
    shortTag: 'KN',
    speechLang: 'kn-IN',
    ocrLang: 'kan+eng',
    aiLanguageName: 'Kannada (ಕನ್ನಡ)',
    sampleSpeech: 'ನಮಸ್ಕಾರ, ಇದು ಏಬಲ್‌ಬ್ರಿಡ್ಜ್ ಸಹಾಯಕ ಧ್ವನಿ.',
  },
  {
    code: 'te-IN',
    label: 'Telugu',
    nativeLabel: 'తెలుగు',
    shortTag: 'TE',
    speechLang: 'te-IN',
    ocrLang: 'tel+eng',
    aiLanguageName: 'Telugu (తెలుగు)',
    sampleSpeech: 'నమస్కారం, ఇది ఏబుల్‌బ್ರಿడ్ಜ್ సహాయక వాయిస్.',
  },
  {
    code: 'es-ES',
    label: 'Spanish',
    nativeLabel: 'Español',
    shortTag: 'ES',
    speechLang: 'es-ES',
    ocrLang: 'spa+eng',
    aiLanguageName: 'Spanish (Español)',
    sampleSpeech: 'Hola, esta es la voz de asistencia de AbleBridge.',
  },
  {
    code: 'fr-FR',
    label: 'French',
    nativeLabel: 'Français',
    shortTag: 'FR',
    speechLang: 'fr-FR',
    ocrLang: 'fra+eng',
    aiLanguageName: 'French (Français)',
    sampleSpeech: 'Bonjour, voici la voix d’assistance AbleBridge.',
  },
  {
    code: 'ar-SA',
    label: 'Arabic',
    nativeLabel: 'العربية',
    shortTag: 'AR',
    speechLang: 'ar-SA',
    ocrLang: 'ara+eng',
    aiLanguageName: 'Arabic (العربية)',
    rtl: true,
    sampleSpeech: 'مرحباً، هذا هو صوت المساعد الذكي في AbleBridge.',
  },
];

export function isSupportedLanguage(code: unknown): code is LanguageCode {
  return (
    typeof code === 'string' &&
    SUPPORTED_LANGUAGES.some((item) => item.code === code)
  );
}

export function getLanguageMeta(code?: LanguageCode | string): LanguageOption {
  const found = SUPPORTED_LANGUAGES.find((item) => item.code === code);
  return found ?? SUPPORTED_LANGUAGES[0];
}

export function getStoredAppLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'en-US';
  try {
    const direct = localStorage.getItem('ablebridge_language_v1');
    if (isSupportedLanguage(direct)) return direct;
  } catch {
    // Ignore storage issues
  }
  return 'en-US';
}

export function broadcastLanguageChange(lang: LanguageCode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('ablebridge_language_v1', lang);
    window.dispatchEvent(new CustomEvent('ablebridge-lang-change', {detail: lang}));
  } catch {
    // Ignore event dispatch errors
  }
}

export function useAppLanguage(explicitLang?: LanguageCode): LanguageCode {
  const [stored, setStored] = useState<LanguageCode>(() => getStoredAppLanguage());

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<LanguageCode>).detail;
      if (isSupportedLanguage(detail)) {
        setStored(detail);
      } else {
        setStored(getStoredAppLanguage());
      }
    };
    window.addEventListener('ablebridge-lang-change', onChange);
    return () => window.removeEventListener('ablebridge-lang-change', onChange);
  }, []);

  return isSupportedLanguage(explicitLang) ? explicitLang : stored;
}

export type TranslationKey =
  | 'toolkit'
  | 'settings'
  | 'caregiverPortal'
  | 'account'
  | 'signOut'
  | 'online'
  | 'offline'
  | 'batterySaver'
  | 'batterySaverOn'
  | 'back'
  | 'textNormal'
  | 'textXl'
  | 'neonUi'
  | 'neonOn'
  | 'childModePin'
  | 'callCaregiverNow'
  | 'callCaregiverShort'
  | 'heroPrompt'
  | 'heroSimplified'
  | 'streakLabel'
  | 'childStreakLabel'
  | 'daysSafe'
  | 'daySafe'
  | 'caregiverData'
  | 'testAlert'
  | 'openTool'
  | 'letsGo'
  | 'caregiverCallReady'
  | 'dialNow'
  | 'sendSms'
  | 'sendEmail'
  | 'copyAlertText'
  | 'copied'
  | 'talkToAi'
  | 'listening'
  | 'askAiPlaceholder'
  | 'instantControls'
  | 'addReminder'
  | 'calmReset'
  | 'alertCaregiver'
  | 'repeat'
  | 'silence'
  | 'readAloud'
  | 'clear'
  | 'cancel'
  | 'settingsTitle'
  | 'caregiverPinLock'
  | 'pinLockSub'
  | 'pinUnlockedSub'
  | 'pinPrompt'
  | 'wrongPin'
  | 'tabPatient'
  | 'tabDisabilities'
  | 'tabThemesNetwork'
  | 'tabPinSecurity'
  | 'saveAndLock'
  | 'themePaletteTitle'
  | 'wallpaperTitle'
  | 'networkModeTitle'
  | 'appLanguageTitle'
  | 'languageLockHint'
  | 'testLanguageVoice'
  | 'smartBatteryTitle'
  | 'talkBackPersonaTitle'
  | 'testVoice'
  | 'visibleModulesTitle'
  | 'visibleLabel'
  | 'hiddenLabel'
  | 'applyTailoredSetup'
  | 'enterToolkitNow'
  | 'aacEmergencyBar'
  | 'addCustomTile'
  | 'spokenPhraseStrip'
  | 'speakAll'
  | 'tapTileHint'
  | 'modeScene'
  | 'modeColor'
  | 'modeCurrency'
  | 'aiSceneReadout'
  | 'aiIdentifyCurrency'
  | 'aiIdentifyColor'
  | 'scanPrintedText'
  | 'speakCrosshairColor'
  | 'analyzeUploadedPhoto'
  | 'freezeFrame'
  | 'unfreezeFrame'
  | 'continuousAutoReadout'
  | 'sceneOcrReadout'
  | 'narrationSpeed'
  | 'demoPresets'
  | 'liveCameraFeed'
  | 'demoSceneView'
  | 'enableLiveCamera'
  | 'switchToDemo'
  | 'checkIn'
  | 'completedToday'
  | 'markTakenNow'
  | 'hearHowToTake'
  | 'inputNewMedicine'
  | 'medicineGuideTitle'
  | 'dailyCheckInTitle';

const EN_STRINGS: Record<TranslationKey, string> = {
  toolkit: 'Toolkit',
  settings: 'Settings',
  caregiverPortal: 'Caregiver Portal',
  account: 'Account',
  signOut: 'Sign Out',
  online: 'Online',
  offline: 'Offline',
  batterySaver: 'Battery',
  batterySaverOn: 'Saver ON',
  back: 'Back',
  textNormal: 'Normal',
  textXl: 'XL',
  neonUi: 'Neon Orange UI',
  neonOn: 'Neon Orange ON',
  childModePin: 'Child Mode (PIN)',
  callCaregiverNow: 'CALL CAREGIVER NOW',
  callCaregiverShort: 'Call',
  heroPrompt: 'Choose an assistive tool to launch immediately',
  heroSimplified: 'Your Focus Assistive Tools',
  streakLabel: 'Auto Accident-Free Streak',
  childStreakLabel: 'Auto Star Streak',
  daysSafe: 'Days Safe',
  daySafe: 'Day Safe',
  caregiverData: 'Caregiver Data',
  testAlert: 'Test Alert',
  openTool: 'Open',
  letsGo: 'Let’s Go',
  caregiverCallReady: 'Caregiver Call & Alert Ready',
  dialNow: 'Dial Now',
  sendSms: 'Send Emergency SMS with GPS',
  sendEmail: 'Send Alert Email',
  copyAlertText: 'Copy GPS Alert Message',
  copied: 'Copied!',
  talkToAi: 'Talk to',
  listening: 'Listening...',
  askAiPlaceholder: 'Ask AI or say "Open Vision"...',
  instantControls: 'Instant Toolkit Controls',
  addReminder: 'Add Reminder',
  calmReset: 'Calm Reset',
  alertCaregiver: 'Alert Caregiver',
  repeat: 'Repeat',
  silence: 'Silence',
  readAloud: 'Read Aloud',
  clear: 'Clear',
  cancel: 'Cancel',
  settingsTitle: 'Caregiver & Patient Settings',
  caregiverPinLock: 'Caregiver PIN Lock',
  pinLockSub: 'Protected to prevent accidental changes by patient',
  pinUnlockedSub: 'Unlocked · Configure conditions, themes, network, language & safety limits',
  pinPrompt:
    'Enter your 4-Digit Caregiver PIN to edit patient disabilities, themes, wallpaper, network sync, battery saver, language, and safety limits.',
  wrongPin: 'Incorrect Caregiver PIN. Try again.',
  tabPatient: 'Patient Details',
  tabDisabilities: 'Physical, Mental & Age Care',
  tabThemesNetwork: 'Themes, Network, Battery & 3D',
  tabPinSecurity: 'PIN & Lock',
  saveAndLock: 'Save & Lock Settings',
  themePaletteTitle: 'Display Theme & Neon UI Palette (8 Themes)',
  wallpaperTitle: 'Animated Live Wallpaper & 3D Background',
  networkModeTitle: 'Network & Offline Mode',
  appLanguageTitle: 'App Language (Text, Voice Input, TalkBack & AI Speech)',
  languageLockHint:
    'PIN-locked setting · Updates tiles, menus, speech synthesis, voice dictation, and AI responses.',
  testLanguageVoice: 'Test Language Voice',
  smartBatteryTitle: 'Smart Battery Saver (Auto Power Guard)',
  talkBackPersonaTitle: 'TalkBack & AI Speech Voice Persona',
  testVoice: 'Test Voice',
  visibleModulesTitle: 'Visible Dashboard Modules',
  visibleLabel: 'Visible',
  hiddenLabel: 'Hidden',
  applyTailoredSetup: 'Apply Tailored Setup',
  enterToolkitNow: 'Enter Toolkit Immediately',
  aacEmergencyBar: 'EMERGENCY ALERT — NEED IMMEDIATE HELP',
  addCustomTile: 'Add Custom Tile',
  spokenPhraseStrip: 'Spoken Phrase Strip',
  speakAll: 'Speak All',
  tapTileHint: 'Tap any tile below to speak immediately',
  modeScene: 'Scene & Labels',
  modeColor: 'Color & Pattern',
  modeCurrency: 'Currency & Notes',
  aiSceneReadout: 'AI Analyze Live Scene',
  aiIdentifyCurrency: 'Identify Banknote / Coin',
  aiIdentifyColor: 'Identify True Color & Fabric',
  scanPrintedText: 'Scan Printed Text (OCR)',
  speakCrosshairColor: 'Speak Crosshair Color',
  analyzeUploadedPhoto: 'Analyze Photo',
  freezeFrame: 'Freeze Frame',
  unfreezeFrame: 'Resume Live',
  continuousAutoReadout: 'Continuous Live Auto-Readout',
  sceneOcrReadout: 'Scene, Color & Currency Readout',
  narrationSpeed: 'Narration Speed',
  demoPresets: 'Demo / Simulate Presets',
  liveCameraFeed: 'LIVE CAMERA FEED',
  demoSceneView: 'DEMO SCENE VIEW',
  enableLiveCamera: 'Enable Live Camera',
  switchToDemo: 'Switch to Demo Presets',
  checkIn: 'Check In',
  completedToday: 'Completed Today',
  markTakenNow: 'Mark Taken Now',
  hearHowToTake: 'Hear How to Take',
  inputNewMedicine: 'Input New Medicine',
  medicineGuideTitle: 'Medicine Reminders & Clear How-to-Take Guide',
  dailyCheckInTitle: 'Daily Routine Check-In',
};

const EXTRA_LANGS: Partial<Record<LanguageCode, Partial<Record<TranslationKey, string>>>> = {
  'ml-IN': {
    toolkit: 'ടൂൾകിറ്റ്',
    settings: 'ക്രമീകരണങ്ങൾ',
    caregiverPortal: 'കെയർഗിവർ പോർട്ടൽ',
    account: 'അക്കൗണ്ട്',
    signOut: 'ലോഗ് ഔട്ട്',
    online: 'ഓൺലൈൻ',
    offline: 'ഓഫ്‌ലൈൻ',
    batterySaver: 'ബാറ്ററി',
    batterySaverOn: 'സേവർ ON',
    back: 'തിരികെ',
    textNormal: 'സാധാരണം',
    textXl: 'വലുത് (XL)',
    neonUi: 'നിയോൺ ഓറഞ്ച് UI',
    neonOn: 'നിയോൺ ഓറഞ്ച് ON',
    childModePin: 'കുട്ടികളുടെ മോഡ് (PIN)',
    callCaregiverNow: 'കെയർഗിവറെ ഉടൻ വിളിക്കുക',
    callCaregiverShort: 'വിളിക്കുക',
    heroPrompt: 'ഉപയോഗിക്കാൻ ഒരു സഹായ ടൂൾ തിരഞ്ഞെടുക്കുക',
    heroSimplified: 'നിങ്ങളുടെ പ്രധാന സഹായ ടൂളുകൾ',
    streakLabel: 'സുരക്ഷിത ദിന പരമ്പര',
    childStreakLabel: 'സ്റ്റാർ പരമ്പര',
    daysSafe: 'ദിവസങ്ങൾ സുരക്ഷിതം',
    daySafe: 'ദിവസം സുരക്ഷിതം',
    caregiverData: 'കെയർഗിവർ വിവരങ്ങൾ',
    testAlert: 'ടെസ്റ്റ് അലേർട്ട്',
    openTool: 'തുറക്കുക',
    letsGo: 'തുടങ്ങാം',
    caregiverCallReady: 'കെയർഗിവർ കോൾ & അലേർട്ട് തയ്യാറാണ്',
    dialNow: 'ഇപ്പോൾ വിളിക്കുക',
    sendSms: 'GPS സഹിതം SMS അയക്കുക',
    sendEmail: 'ഇമെയിൽ അലേർട്ട് അയക്കുക',
    copyAlertText: 'GPS സന്ദേശം പകർത്തുക',
    copied: 'പകർത്തി!',
    talkToAi: 'സംസാരിക്കുക:',
    listening: 'കേൾക്കുന്നു...',
    askAiPlaceholder: 'ചോദിക്കുക അല്ലെങ്കിൽ "Open Vision" പറയുക...',
    instantControls: 'വേഗത്തിലുള്ള ടൂൾ നിയന്ത്രണങ്ങൾ',
    addReminder: 'ഓർമ്മപ്പെടുത്തൽ',
    calmReset: 'ശാന്തമാക്കൽ',
    alertCaregiver: 'കെയർഗിവർ അലേർട്ട്',
    repeat: 'ആവർത്തിക്കുക',
    silence: 'നിർത്തുക',
    readAloud: 'ഉറക്കെ വായിക്കുക',
    clear: 'മായ്ക്കുക',
    cancel: 'റദ്ദാക്കുക',
    settingsTitle: 'കെയർഗിവർ & രോഗി ക്രമീകരണങ്ങൾ',
    caregiverPinLock: 'കെയർഗിവർ PIN ലോക്ക്',
    pinLockSub: 'അബദ്ധത്തിൽ മാറ്റങ്ങൾ വരാതിരിക്കാൻ ലോക്ക് ചെയ്തിരിക്കുന്നു',
    pinUnlockedSub: 'അൺലോക്ക് ചെയ്തു · തീമുകൾ, നെറ്റ്‌വർക്ക്, ഭാഷ & സുരക്ഷ ക്രമീകരിക്കുക',
    pinPrompt: 'ക്രമീകരണങ്ങളും ഭാഷയും തീമുകളും മാറ്റാൻ നിങ്ങളുടെ 4-അക്ക കെയർഗിവർ PIN നൽകുക.',
    wrongPin: 'തെറ്റായ കെയർഗിവർ PIN. വീണ്ടും ശ്രമിക്കുക.',
    tabPatient: 'രോഗിയുടെ വിവരങ്ങൾ',
    tabDisabilities: 'ആരോഗ്യ & പരിചരണ ക്രമീകരണം',
    tabThemesNetwork: 'തീമുകൾ, നെറ്റ്‌വർക്ക്, ബാറ്ററി & ഭാഷ',
    tabPinSecurity: 'PIN & സുരക്ഷ',
    saveAndLock: 'സേവ് ചെയ്ത് ലോക്ക് ചെയ്യുക',
    themePaletteTitle: 'ഡിസ്പ്ലേ തീമും നിയോൺ UI-യും (8 തീമുകൾ)',
    wallpaperTitle: 'ലൈവ് വാൾപേപ്പറും 3D പശ്ചാത്തലവും',
    networkModeTitle: 'നെറ്റ്‌വർക്കും ഓഫ്‌ലൈൻ മോഡും',
    appLanguageTitle: 'ആപ്പ് ഭാഷ (ടെക്സ്റ്റ്, ശബ്ദം, ടോക്ക്ബാക്ക് & AI)',
    languageLockHint: 'ടൈലുകൾ, മെനുകൾ, ശബ്ദ വായന, AI മറുപടികൾ എന്നിവ തിരഞ്ഞെടുത്ത ഭാഷയിലാകും.',
    testLanguageVoice: 'ഭാഷാ ശബ്ദം പരീക്ഷിക്കുക',
    smartBatteryTitle: 'സ്മാർട്ട് ബാറ്ററി സേവർ',
    talkBackPersonaTitle: 'ശബ്ദ ശൈലി (Voice Persona)',
    testVoice: 'ശബ്ദം കേൾക്കുക',
    visibleModulesTitle: 'ഡാഷ്‌ബോർഡ് ടൂളുകൾ',
    visibleLabel: 'ദൃശ്യം',
    hiddenLabel: 'മറച്ചത്',
    applyTailoredSetup: 'അനുയോജ്യമായ സെറ്റപ്പ് നൽകുക',
    enterToolkitNow: 'ടൂൾകിറ്റിലേക്ക് ഉടൻ പ്രവേശിക്കുക',
    aacEmergencyBar: 'അടിയന്തര അലേർട്ട് — ഉടൻ സഹായം വേണം',
    addCustomTile: 'പുതിയ ടൈൽ ചേർക്കുക',
    spokenPhraseStrip: 'തിരഞ്ഞെടുത്ത വാചകങ്ങൾ',
    speakAll: 'എല്ലാം വായിക്കുക',
    tapTileHint: 'സംസാരിക്കാൻ താഴെയുള്ള ഏതെങ്കിലും ചിത്രത്തിൽ തൊടുക',
    modeScene: 'ദൃശ്യം & ലേബലുകൾ',
    modeColor: 'നിറം & പാറ്റേൺ',
    modeCurrency: 'കറൻസി & നോട്ടുകൾ',
    aiSceneReadout: 'AI ദൃശ്യം വിശകലനം ചെയ്യുക',
    aiIdentifyCurrency: 'നോട്ട് / നാണയം തിരിച്ചറിയുക',
    aiIdentifyColor: 'കൃത്യമായ നിറം തിരിച്ചറിയുക',
    scanPrintedText: 'അക്ഷരങ്ങൾ സ്കാൻ ചെയ്യുക (OCR)',
    speakCrosshairColor: 'ക്രോസ്‌ഹെയർ നിറം പറയുക',
    analyzeUploadedPhoto: 'ഫോട്ടോ പരിശോധിക്കുക',
    freezeFrame: 'ഫ്രെയിം നിർത്തുക (Freeze)',
    unfreezeFrame: 'ലൈവ് തുടരുക',
    continuousAutoReadout: 'തുടർച്ചയായ ശബ്ദ വായന',
    sceneOcrReadout: 'ദൃശ്യം, നിറം & കറൻസി ഫലം',
    narrationSpeed: 'സംസാര വേഗത',
    demoPresets: 'ഡെമോ മാതൃകകൾ',
    liveCameraFeed: 'ലൈവ് ക്യാമറ ഫീഡ്',
    demoSceneView: 'ഡെമോ ദൃശ്യം',
    enableLiveCamera: 'ലൈവ് ക്യാമറ ഓണാക്കുക',
    switchToDemo: 'ഡെമോയിലേക്ക് മാറുക',
    checkIn: 'ചെക്ക് ഇൻ',
    completedToday: 'ഇന്ന് പൂർത്തിയായി',
    markTakenNow: 'ഇപ്പോൾ കഴിച്ചു',
    hearHowToTake: 'കഴിക്കേണ്ട രീതി കേൾക്കുക',
    inputNewMedicine: 'പുതിയ മരുന്ന് ചേർക്കുക',
    medicineGuideTitle: 'മരുന്ന് ഓർമ്മപ്പെടുത്തലുകളും കഴിക്കേണ്ട രീതിയും',
    dailyCheckInTitle: 'ദൈനംദിന ദിനചര്യ ചെക്ക്-ഇൻ',
  },
  'hi-IN': {
    toolkit: 'टूलकिट',
    settings: 'सेटिंग्स',
    caregiverPortal: 'केयरगिवर पोर्टल',
    account: 'खाता',
    signOut: 'साइन आउट',
    online: 'ऑनलाइन',
    offline: 'ऑफ़लाइन',
    batterySaver: 'बैटरी',
    batterySaverOn: 'सेवर ON',
    back: 'वापस',
    textNormal: 'सामान्य',
    textXl: 'बड़ा (XL)',
    neonUi: 'नियॉन ऑरेंज UI',
    neonOn: 'नियॉन ऑरेंज ON',
    childModePin: 'चाइल्ड मोड (PIN)',
    callCaregiverNow: 'केयरगिवर को अभी कॉल करें',
    callCaregiverShort: 'कॉल करें',
    heroPrompt: 'तुरंत शुरू करने के लिए एक सहायक टूल चुनें',
    heroSimplified: 'आपके मुख्य सहायक टूल',
    streakLabel: 'दुर्घटना-मुक्त स्ट्रीक',
    childStreakLabel: 'स्टार स्ट्रीक',
    daysSafe: 'दिन सुरक्षित',
    daySafe: 'दिन सुरक्षित',
    caregiverData: 'केयरगिवर डेटा',
    testAlert: 'अलर्ट जांचें',
    openTool: 'खोलें',
    letsGo: 'चलो शुरू करें',
    caregiverCallReady: 'केयरगिवर कॉल और अलर्ट तैयार',
    dialNow: 'अभी कॉल करें',
    sendSms: 'GPS के साथ SMS भेजें',
    sendEmail: 'ईमेल अलर्ट भेजें',
    copyAlertText: 'GPS अलर्ट संदेश कॉपी करें',
    copied: 'कॉपी हो गया!',
    talkToAi: 'बात करें:',
    listening: 'सुन रहा है...',
    askAiPlaceholder: 'पूछें या "Open Vision" बोलें...',
    instantControls: 'त्वरित टूल नियंत्रण',
    addReminder: 'रिमाइंडर जोड़ें',
    calmReset: 'शांत श्वास',
    alertCaregiver: 'केयरगिवर अलर्ट',
    repeat: 'दोहराएं',
    silence: 'चुप करें',
    readAloud: 'ज़ोर से पढ़ें',
    clear: 'साफ़ करें',
    cancel: 'रद्द करें',
    settingsTitle: 'केयरगिवर और मरीज़ सेटिंग्स',
    caregiverPinLock: 'केयरगिवर PIN लॉक',
    pinLockSub: 'गलती से बदलाव रोकने के लिए सुरक्षित',
    pinUnlockedSub: 'अनलॉक · थीम, नेटवर्क, भाषा और सुरक्षा सीमाएं सेट करें',
    pinPrompt: 'थीम, लाइव वॉलपेपर, नेटवर्क, बैटरी सेवर, भाषा और सुरक्षा सेटिंग्स बदलने के लिए 4-अंकीय PIN दर्ज करें।',
    wrongPin: 'गलत केयरगिवर PIN। फिर से प्रयास करें।',
    tabPatient: 'मरीज़ का विवरण',
    tabDisabilities: 'स्वास्थ्य व देखभाल सहायता',
    tabThemesNetwork: 'थीम, नेटवर्क, बैटरी व भाषा',
    tabPinSecurity: 'PIN और सुरक्षा',
    saveAndLock: 'सेव करें और लॉक करें',
    themePaletteTitle: 'डिस्प्ले थीम और नियॉन UI (8 थीम)',
    wallpaperTitle: 'लाइव वॉलपेपर और 3D बैकग्राउंड',
    networkModeTitle: 'नेटवर्क और ऑफ़लाइन मोड',
    appLanguageTitle: 'ऐप भाषा (टेक्स्ट, आवाज़, टॉकबैक और AI)',
    languageLockHint: 'सभी टाइलें, मेनू, आवाज़ आउटपुट और AI उत्तर चुनी गई भाषा में दिखेंगे।',
    testLanguageVoice: 'भाषा की आवाज़ जांचें',
    smartBatteryTitle: 'स्मार्ट बैटरी सेवर',
    talkBackPersonaTitle: 'आवाज़ शैली (Voice Persona)',
    testVoice: 'आवाज़ सुनें',
    visibleModulesTitle: 'डैशबोर्ड मॉड्यूल',
    visibleLabel: 'दिखाएं',
    hiddenLabel: 'छिपाएं',
    applyTailoredSetup: 'अनुकूलित सेटअप लागू करें',
    enterToolkitNow: 'टूलकिट तुरंत खोलें',
    aacEmergencyBar: 'आपातकालीन अलर्ट — तुरंत मदद चाहिए',
    addCustomTile: 'नई टाइल जोड़ें',
    spokenPhraseStrip: 'बोली जाने वाली पट्टी',
    speakAll: 'सभी बोलें',
    tapTileHint: 'तुरंत बोलने के लिए किसी भी टाइल पर टैप करें',
    modeScene: 'दृश्य और लेबल',
    modeColor: 'रंग और पैटर्न',
    modeCurrency: 'मुद्रा और नोट',
    aiSceneReadout: 'AI लाइव दृश्य विवरण',
    aiIdentifyCurrency: 'नोट / सिक्का पहचानें',
    aiIdentifyColor: 'सही रंग और कपड़ा पहचानें',
    scanPrintedText: 'टेक्स्ट स्कैन करें (OCR)',
    speakCrosshairColor: 'क्रॉसहेयर रंग बोलें',
    analyzeUploadedPhoto: 'फोटो जांचें',
    freezeFrame: 'फ्रेम रोकें (Freeze)',
    unfreezeFrame: 'लाइव फिर शुरू करें',
    continuousAutoReadout: 'लगातार ऑटो-वाचन',
    sceneOcrReadout: 'दृश्य, रंग और मुद्रा परिणाम',
    narrationSpeed: 'बोलने की गति',
    demoPresets: 'डेमो नमूने',
    liveCameraFeed: 'लाइव कैमरा फ़ीड',
    demoSceneView: 'डेमो दृश्य',
    enableLiveCamera: 'लाइव कैमरा चालू करें',
    switchToDemo: 'डेमो दृश्य चुनें',
    checkIn: 'चेक इन',
    completedToday: 'आज पूरा हुआ',
    markTakenNow: 'अभी ली गई',
    hearHowToTake: 'लेने का तरीका सुनें',
    inputNewMedicine: 'नई दवा जोड़ें',
    medicineGuideTitle: 'दवा रिमाइंडर और लेने की स्पष्ट विधि',
    dailyCheckInTitle: 'दैनिक दिनचर्या चेक-इन',
  },
  'ta-IN': {
    toolkit: 'கருவிகள்',
    settings: 'அமைப்புகள்',
    caregiverPortal: 'பராமரிப்பாளர்',
    account: 'கணக்கு',
    signOut: 'வெளியேறு',
    online: 'ஆன்லைன்',
    offline: 'ஆஃப்லைன்',
    batterySaver: 'பேட்டரி',
    batterySaverOn: 'சேமிப்பு ON',
    back: 'பின்செல்',
    textNormal: 'சாதாரண',
    textXl: 'பெரியது (XL)',
    neonUi: 'நியான் ஆரஞ்சு UI',
    neonOn: 'நியான் ஆரஞ்சு ON',
    childModePin: 'குழந்தை முறை (PIN)',
    callCaregiverNow: 'பராமரிப்பாளரை உடனே அழைக்கவும்',
    callCaregiverShort: 'அழை',
    heroPrompt: 'உடனடியாகத் தொடங்க ஒரு உதவி கருவியைத் தேர்ந்தெடுக்கவும்',
    heroSimplified: 'உங்கள் முக்கிய உதவி கருவிகள்',
    streakLabel: 'பாதுகாப்பான நாட்கள்',
    childStreakLabel: 'நட்சத்திர நாட்கள்',
    daysSafe: 'நாட்கள் பாதுகாப்பாக',
    daySafe: 'நாள் பாதுகாப்பாக',
    caregiverData: 'பராமரிப்பாளர் தரவு',
    testAlert: 'சோதனை அலர்ட்',
    openTool: 'திற',
    letsGo: 'தொடங்கலாம்',
    caregiverCallReady: 'அழைப்பு & எச்சரிக்கை தயார்',
    dialNow: 'இப்போது அழைக்கவும்',
    sendSms: 'GPS உடன் SMS அனுப்பு',
    sendEmail: 'மின்னஞ்சல் எச்சரிக்கை',
    copyAlertText: 'GPS செய்தியை நகலெடு',
    copied: 'நகலெடுக்கப்பட்டது!',
    talkToAi: 'பேசுங்கள்:',
    listening: 'கேட்கிறது...',
    askAiPlaceholder: 'கேளுங்கள் அல்லது "Open Vision" சொல்லுங்கள்...',
    instantControls: 'உடனடி கருவி கட்டுப்பாடுகள்',
    addReminder: 'நினைவூட்டல்',
    calmReset: 'அமைதி மூச்சு',
    alertCaregiver: 'பராமரிப்பாளர் அலர்ட்',
    repeat: 'மீண்டும் சொல்',
    silence: 'நிறுத்து',
    readAloud: 'உரக்கப் படி',
    clear: 'அழி',
    cancel: 'ரத்து',
    settingsTitle: 'பராமரிப்பாளர் & நோயாளி அமைப்புகள்',
    caregiverPinLock: 'பராமரிப்பாளர் PIN பூட்டு',
    tabPatient: 'நோயாளி விவரம்',
    tabDisabilities: 'உடல் & மன நல ஆதரவு',
    tabThemesNetwork: 'தீம்கள், நெட்வொர்க், பேட்டரி & மொழி',
    tabPinSecurity: 'PIN & பாதுகாப்பு',
    saveAndLock: 'சேமித்து பூட்டு',
    themePaletteTitle: 'காட்சி தீம் & நியான் UI (8 தீம்கள்)',
    wallpaperTitle: 'லைவ் வால்பேப்பர் & 3D பின்னணி',
    networkModeTitle: 'நெட்வொர்க் & ஆஃப்லைன் முறை',
    appLanguageTitle: 'ஆப் மொழி (உரை, குரல் & AI)',
    testLanguageVoice: 'மொழி குரலை சோதிக்கவும்',
    aacEmergencyBar: 'அவசர எச்சரிக்கை — உடனடி உதவி தேவை',
    addCustomTile: 'புதிய பட்டன் சேர்',
    speakAll: 'அனைத்தையும் பேசு',
    modeScene: 'காட்சி & லேபிள்',
    modeColor: 'நிறம் & அமைப்பு',
    modeCurrency: 'பணம் & நோட்டுகள்',
    aiSceneReadout: 'AI நேரலை காட்சி வாசிப்பு',
    aiIdentifyCurrency: 'பண நோட்டு / நாணயம் அடையாளம்',
    aiIdentifyColor: 'துல்லிய நிறம் அடையாளம்',
    scanPrintedText: 'எழுத்தை ஸ்கேன் செய் (OCR)',
    speakCrosshairColor: 'நிறத்தைச் சொல்',
    freezeFrame: 'காட்சியை நிறுத்து',
    unfreezeFrame: 'நேரலை தொடர்',
    checkIn: 'சரிபார்',
    completedToday: 'இன்று முடிந்தது',
    markTakenNow: 'எடுத்துக்கொண்டேன்',
    hearHowToTake: 'எடுக்கும் முறையைக் கேள்',
    inputNewMedicine: 'புதிய மருந்து சேர்',
  },
  'kn-IN': {
    toolkit: 'ಟೂಲ್‌ಕಿಟ್',
    settings: 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    caregiverPortal: 'ಕೇರ್‌ಗಿವರ್ ಪೋರ್ಟಲ್',
    account: 'ಖಾತೆ',
    signOut: 'ಸೈನ್ ಔಟ್',
    online: 'ಆನ್‌ಲೈನ್',
    offline: 'ಆಫ್‌ಲೈನ್',
    batterySaver: 'ಬ್ಯಾಟರಿ',
    batterySaverOn: 'ಸೇವರ್ ON',
    back: 'ಹಿಂದೆ',
    textNormal: 'ಸಾಮಾನ್ಯ',
    textXl: 'ದೊಡ್ಡದು (XL)',
    neonUi: 'ನಿಯಾನ್ ಆರೆಂಜ್ UI',
    neonOn: 'ನಿಯಾನ್ ಆರೆಂಜ್ ON',
    childModePin: 'ಮಕ್ಕಳ ಮೋಡ್ (PIN)',
    callCaregiverNow: 'ಕೇರ್‌ಗಿವರ್‌ಗೆ ಈಗಲೇ ಕರೆ ಮಾಡಿ',
    callCaregiverShort: 'ಕರೆ ಮಾಡಿ',
    heroPrompt: 'ತಕ್ಷಣ ಪ್ರಾರಂಭಿಸಲು ಸಹಾಯಕ ಟೂಲ್ ಆಯ್ಕೆಮಾಡಿ',
    heroSimplified: 'ನಿಮ್ಮ ಪ್ರಮುಖ ಸಹಾಯಕ ಟೂಲ್‌ಗಳು',
    streakLabel: 'ಸುರಕ್ಷಿತ ದಿನಗಳ ಸ್ಟ್ರೀಕ್',
    childStreakLabel: 'ಸ್ಟಾರ್ ಸ್ಟ್ರೀಕ್',
    daysSafe: 'ದಿನಗಳು ಸುರಕ್ಷಿತ',
    daySafe: 'ದಿನ ಸುರಕ್ಷಿತ',
    caregiverData: 'ಕೇರ್‌ಗಿವರ್ ಡೇಟಾ',
    testAlert: 'ಟೆಸ್ಟ್ ಅಲರ್ಟ್',
    openTool: 'ತೆರೆಯಿರಿ',
    letsGo: 'ಪ್ರಾರಂಭಿಸೋಣ',
    caregiverCallReady: 'ಕರೆ ಮತ್ತು ಅಲರ್ಟ್ ಸಿದ್ಧವಾಗಿದೆ',
    dialNow: 'ಈಗಲೇ ಕರೆ ಮಾಡಿ',
    sendSms: 'GPS ಸಹಿತ SMS ಕಳುಹಿಸಿ',
    sendEmail: 'ಇಮೇಲ್ ಅಲರ್ಟ್ ಕಳುಹಿಸಿ',
    copyAlertText: 'GPS ಸಂದೇಶ ನಕಲಿಸಿ',
    copied: 'ನಕಲಿಸಲಾಗಿದೆ!',
    talkToAi: 'ಮಾತನಾಡಿ:',
    listening: 'ಆಲಿಸುತ್ತಿದೆ...',
    askAiPlaceholder: 'ಕೇಳಿ ಅಥವಾ "Open Vision" ಹೇಳಿ...',
    instantControls: 'ತ್ವರಿತ ಟೂಲ್ ನಿಯಂತ್ರಣಗಳು',
    addReminder: 'ರಿಮೈಂಡರ್ ಸೇರಿಸಿ',
    calmReset: 'ಶಾಂತ ಉಸಿರಾಟ',
    alertCaregiver: 'ಕೇರ್‌ಗಿವರ್ ಅಲರ್ಟ್',
    repeat: 'ಮತ್ತೆ ಹೇಳಿ',
    silence: 'ನಿಲ್ಲಿಸಿ',
    readAloud: 'ಜೋರಾಗಿ ಓದಿ',
    clear: 'ಅಳಿಸಿ',
    cancel: 'ರದ್ದುಮಾಡಿ',
    settingsTitle: 'ಕೇರ್‌ಗಿವರ್ ಮತ್ತು ರೋಗಿಯ ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
    caregiverPinLock: 'ಕೇರ್‌ಗಿವರ್ PIN ಲಾಕ್',
    tabPatient: 'ರೋಗಿಯ ವಿವರಗಳು',
    tabDisabilities: 'ದೈಹಿಕ ಮತ್ತು ಮಾನಸಿಕ ಆರೈಕೆ',
    tabThemesNetwork: 'ಥೀಮ್‌ಗಳು, ನೆಟ್‌ವರ್ಕ್, ಬ್ಯಾಟರಿ & ಭಾಷೆ',
    tabPinSecurity: 'PIN ಮತ್ತು ಭದ್ರತೆ',
    saveAndLock: 'ಉಳಿಸಿ ಮತ್ತು ಲಾಕ್ ಮಾಡಿ',
    themePaletteTitle: 'ಡಿಸ್ಪ್ಲೇ ಥೀಮ್ ಮತ್ತು ನಿಯಾನ್ UI',
    wallpaperTitle: 'ಲೈವ್ ವಾಲ್‌ಪೇಪರ್ ಮತ್ತು 3D ಹಿನ್ನೆಲೆ',
    networkModeTitle: 'ನೆಟ್‌ವರ್ಕ್ ಮತ್ತು ಆಫ್‌ಲೈನ್ ಮೋಡ್',
    appLanguageTitle: 'ಆ್ಯಪ್ ಭಾಷೆ (ಪಠ್ಯ, ಧ್ವನಿ ಮತ್ತು AI)',
    testLanguageVoice: 'ಭಾಷೆಯ ಧ್ವನಿ ಪರೀಕ್ಷಿಸಿ',
    aacEmergencyBar: 'ತುರ್ತು ಎಚ್ಚರಿಕೆ — ತಕ್ಷಣ ಸಹಾಯ ಬೇಕು',
    addCustomTile: 'ಹೊಸ ಟೈಲ್ ಸೇರಿಸಿ',
    speakAll: 'ಎಲ್ಲವನ್ನೂ ಮಾತನಾಡಿ',
    modeScene: 'ದೃಶ್ಯ ಮತ್ತು ಲೇಬಲ್',
    modeColor: 'ಬಣ್ಣ ಮತ್ತು ವಿನ್ಯಾಸ',
    modeCurrency: 'ಕರೆನ್ಸಿ ಮತ್ತು ನೋಟುಗಳು',
    aiSceneReadout: 'AI ದೃಶ್ಯ ವಿವರಣೆ',
    aiIdentifyCurrency: 'ನೋಟು / ನಾಣ್ಯ ಗುರುತಿಸಿ',
    aiIdentifyColor: 'ನಿಖರ ಬಣ್ಣ ಗುರುತಿಸಿ',
    scanPrintedText: 'ಪಠ್ಯ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ (OCR)',
    speakCrosshairColor: 'ಬಣ್ಣವನ್ನು ಹೇಳಿ',
    freezeFrame: 'ಚಿತ್ರ ನಿಲ್ಲಿಸಿ',
    unfreezeFrame: 'ಲೈವ್ ಮುಂದುವರಿಸಿ',
    checkIn: 'ಚೆಕ್ ಇನ್',
    completedToday: 'ಇಂದು ಪೂರ್ಣಗೊಂಡಿದೆ',
    markTakenNow: 'ಈಗ ತೆಗೆದುಕೊಂಡೆ',
    hearHowToTake: 'ತೆಗೆದುಕೊಳ್ಳುವ ವಿಧಾನ ಕೇಳಿ',
    inputNewMedicine: 'ಹೊಸ ಔಷಧ ಸೇರಿಸಿ',
  },
  'te-IN': {
    toolkit: 'టూల్‌కిట్',
    settings: 'సెట్టింగ్‌లు',
    caregiverPortal: 'కేర్‌గివర్ పోర్ಟల్',
    account: 'ఖాతా',
    signOut: 'సైన్ అవుట్',
    online: 'ఆన్‌లైన్',
    offline: 'ఆఫ్‌లైన్',
    batterySaver: 'బ్యాటరీ',
    batterySaverOn: 'సేవర్ ON',
    back: 'వెనుకకు',
    textNormal: 'సాధారణం',
    textXl: 'పెద్దది (XL)',
    neonUi: 'నియాన్ ఆరెంజ్ UI',
    neonOn: 'నియాన్ ఆరెంజ్ ON',
    childModePin: 'పిల్లల మోడ్ (PIN)',
    callCaregiverNow: 'కేర్‌గివర్‌కు వెంటనే కాల్ చేయండి',
    callCaregiverShort: 'కాల్',
    heroPrompt: 'వెంటనే ప్రారంభించడానికి సహాయక టూల్ ఎంచుకోండి',
    heroSimplified: 'మీ ప్రధాన సహాయక టూల్స్',
    streakLabel: 'సురక్షిత రోజుల పరంపర',
    childStreakLabel: 'స్టార్ స్ట్రీక్',
    daysSafe: 'రోజులు సురక్షితం',
    daySafe: 'రోజు సురక్షితం',
    caregiverData: 'కేర్‌గివర్ డేటా',
    testAlert: 'అలర్ట్ పరీక్ష',
    openTool: 'తెరవండి',
    letsGo: 'మొదలుపెడదాం',
    caregiverCallReady: 'కాల్ & అలర్ట్ సిద్ధంగా ఉంది',
    dialNow: 'ఇప్పుడే కాల్ చేయండి',
    sendSms: 'GPS తో SMS పంపండి',
    sendEmail: 'ఇమెయిల్ అలర్ట్ పంపండి',
    copyAlertText: 'GPS సందేశాన్ని కాపీ చేయండి',
    copied: 'కాపీ అయింది!',
    talkToAi: 'మాట్లాడండి:',
    listening: 'వింటోంది...',
    askAiPlaceholder: 'అడగండి లేదా "Open Vision" చెప్పండి...',
    instantControls: 'తక్షణ టూల్ నియంత్రణలు',
    addReminder: 'రిమైండర్ జోడించు',
    calmReset: 'ప్రశాంత శ్వాస',
    alertCaregiver: 'కేర్‌గివర్ అలర్ట్',
    repeat: 'మళ్ళీ చెప్పు',
    silence: 'ఆపు',
    readAloud: 'బిగ్గరగా చదువు',
    clear: 'తుడుచు',
    cancel: 'రద్దు చేయండి',
    settingsTitle: 'కేర్‌గివర్ & పేషెంట్ సెట్టింగ్‌లు',
    caregiverPinLock: 'కేర్‌గివర్ PIN లాక్',
    tabPatient: 'పేషెంట్ వివరాలు',
    tabDisabilities: 'ఆరోగ్య & సంరక్షణ మద్దతు',
    tabThemesNetwork: 'థీమ్స్, నెట్‌వర్క్, బ్యాటరీ & భాష',
    tabPinSecurity: 'PIN & భద్రత',
    saveAndLock: 'సేవ్ చేసి లాక్ చేయండి',
    themePaletteTitle: 'డిస్‌ప్లే థీమ్ & నియాన్ UI',
    wallpaperTitle: 'లైవ్ వాల్‌పేపర్ & 3D నేపథ్యం',
    networkModeTitle: 'నెట్‌వర్క్ & ఆఫ్‌లైన్ మోడ్',
    appLanguageTitle: 'యాప్ భాష (టెక్స్ట్, వాయిస్ & AI)',
    testLanguageVoice: 'భాష వాయిస్ పరీక్షించండి',
    aacEmergencyBar: 'అత్యవసర అలర్ట్ — వెంటనే సహాయం కావాలి',
    addCustomTile: 'కొత్త టైల్ జోడించు',
    speakAll: 'అన్నీ చదువు',
    modeScene: 'దృశ్యం & లేబుల్స్',
    modeColor: 'రంగు & నమూనా',
    modeCurrency: 'కరెన్సీ & నోట్లు',
    aiSceneReadout: 'AI లైవ్ దృశ్య వివరణ',
    aiIdentifyCurrency: 'నోటు / నాణెం గుర్తించండి',
    aiIdentifyColor: 'ఖచ్చితమైన రంగు గుర్తించండి',
    scanPrintedText: 'టెక్స్ట్ స్కాన్ (OCR)',
    speakCrosshairColor: 'రంగును చెప్పు',
    freezeFrame: 'ఫ్రేమ్ ఆపండి',
    unfreezeFrame: 'లైవ్ కొనసాగించండి',
    checkIn: 'చెక్ ఇన్',
    completedToday: 'ఈరోజు పూర్తయింది',
    markTakenNow: 'ఇప్పుడే వేసుకున్నాను',
    hearHowToTake: 'వేసుకునే విధానం వినండి',
    inputNewMedicine: 'కొత్త మందు జోడించండి',
  },
  'es-ES': {
    toolkit: 'Herramientas',
    settings: 'Ajustes',
    caregiverPortal: 'Portal Cuidador',
    account: 'Cuenta',
    signOut: 'Cerrar sesión',
    online: 'En línea',
    offline: 'Sin conexión',
    batterySaver: 'Batería',
    batterySaverOn: 'Ahorro ON',
    back: 'Atrás',
    textNormal: 'Normal',
    textXl: 'XL',
    neonUi: 'UI Neón Naranja',
    neonOn: 'Neón Naranja ON',
    childModePin: 'Modo Infantil (PIN)',
    callCaregiverNow: 'LLAMAR AL CUIDADOR AHORA',
    callCaregiverShort: 'Llamar',
    heroPrompt: 'Elige una herramienta de asistencia para abrirla',
    heroSimplified: 'Tus herramientas principales',
    streakLabel: 'Racha sin accidentes',
    childStreakLabel: 'Racha de estrellas',
    daysSafe: 'Días seguros',
    daySafe: 'Día seguro',
    caregiverData: 'Datos Cuidador',
    testAlert: 'Probar alerta',
    openTool: 'Abrir',
    letsGo: '¡Vamos!',
    caregiverCallReady: 'Llamada y alerta listas',
    dialNow: 'Llamar ahora',
    sendSms: 'Enviar SMS con GPS',
    sendEmail: 'Enviar correo de alerta',
    copyAlertText: 'Copiar mensaje GPS',
    copied: '¡Copiado!',
    talkToAi: 'Hablar con',
    listening: 'Escuchando...',
    askAiPlaceholder: 'Pregunta o di "Open Vision"...',
    instantControls: 'Controles rápidos',
    addReminder: 'Recordatorio',
    calmReset: 'Respiración calma',
    alertCaregiver: 'Alertar cuidador',
    repeat: 'Repetir',
    silence: 'Silenciar',
    readAloud: 'Leer en voz alta',
    clear: 'Limpiar',
    cancel: 'Cancelar',
    settingsTitle: 'Ajustes de Cuidador y Paciente',
    caregiverPinLock: 'Bloqueo PIN de Cuidador',
    tabPatient: 'Datos del Paciente',
    tabDisabilities: 'Apoyo Físico y Mental',
    tabThemesNetwork: 'Temas, Red, Batería e Idioma',
    tabPinSecurity: 'PIN y Seguridad',
    saveAndLock: 'Guardar y Bloquear',
    themePaletteTitle: 'Tema Visual y Neón UI (8 Temas)',
    wallpaperTitle: 'Fondo Animado y 3D',
    networkModeTitle: 'Modo Red y Sin Conexión',
    appLanguageTitle: 'Idioma de la App (Texto, Voz e IA)',
    testLanguageVoice: 'Probar Voz del Idioma',
    aacEmergencyBar: 'ALERTA DE EMERGENCIA — NECESITO AYUDA',
    addCustomTile: 'Añadir Tarjeta',
    speakAll: 'Hablar Todo',
    modeScene: 'Escena y Texto',
    modeColor: 'Color y Patrón',
    modeCurrency: 'Billetes y Monedas',
    aiSceneReadout: 'Analizar Escena con IA',
    aiIdentifyCurrency: 'Identificar Billete / Moneda',
    aiIdentifyColor: 'Identificar Color Real',
    scanPrintedText: 'Escanear Texto (OCR)',
    speakCrosshairColor: 'Decir Color Central',
    freezeFrame: 'Congelar Imagen',
    unfreezeFrame: 'Reanudar Vivo',
    checkIn: 'Completar',
    completedToday: 'Completado Hoy',
    markTakenNow: 'Marcar Tomada',
    hearHowToTake: 'Escuchar Cómo Tomar',
    inputNewMedicine: 'Añadir Medicina',
  },
  'fr-FR': {
    toolkit: 'Outils',
    settings: 'Paramètres',
    caregiverPortal: 'Portail Aidant',
    account: 'Compte',
    signOut: 'Déconnexion',
    online: 'En ligne',
    offline: 'Hors ligne',
    batterySaver: 'Batterie',
    batterySaverOn: 'Éco ON',
    back: 'Retour',
    textNormal: 'Normal',
    textXl: 'XL',
    neonUi: 'UI Néon Orange',
    neonOn: 'Néon Orange ON',
    childModePin: 'Mode Enfant (PIN)',
    callCaregiverNow: 'APPELER L’AIDANT MAINTENANT',
    callCaregiverShort: 'Appeler',
    heroPrompt: 'Choisissez un outil d’assistance à lancer',
    heroSimplified: 'Vos outils d’assistance essentiels',
    streakLabel: 'Série sans accident',
    childStreakLabel: 'Série d’étoiles',
    daysSafe: 'Jours sûrs',
    daySafe: 'Jour sûr',
    caregiverData: 'Données Aidant',
    testAlert: 'Tester l’alerte',
    openTool: 'Ouvrir',
    letsGo: 'C’est parti',
    caregiverCallReady: 'Appel et alerte prêts',
    dialNow: 'Appeler maintenant',
    sendSms: 'Envoyer SMS avec GPS',
    sendEmail: 'Envoyer e-mail d’alerte',
    copyAlertText: 'Copier le message GPS',
    copied: 'Copié !',
    talkToAi: 'Parler à',
    listening: 'Écoute...',
    askAiPlaceholder: 'Demandez ou dites "Open Vision"...',
    instantControls: 'Contrôles rapides',
    addReminder: 'Rappel',
    calmReset: 'Pause calme',
    alertCaregiver: 'Alerter l’aidant',
    repeat: 'Répéter',
    silence: 'Silence',
    readAloud: 'Lire à haute voix',
    clear: 'Effacer',
    cancel: 'Annuler',
    settingsTitle: 'Paramètres Aidant & Patient',
    caregiverPinLock: 'Verrouillage PIN Aidant',
    tabPatient: 'Détails Patient',
    tabDisabilities: 'Soins Physiques & Mentaux',
    tabThemesNetwork: 'Thèmes, Réseau, Batterie & Langue',
    tabPinSecurity: 'PIN & Sécurité',
    saveAndLock: 'Enregistrer et Verrouiller',
    themePaletteTitle: 'Thème d’affichage & UI Néon',
    wallpaperTitle: 'Fond d’écran Animé & 3D',
    networkModeTitle: 'Réseau & Mode Hors Ligne',
    appLanguageTitle: 'Langue de l’application (Texte, Voix & IA)',
    testLanguageVoice: 'Tester la Voix',
    aacEmergencyBar: 'ALERTE D’URGENCE — AIDE IMMÉDIATE',
    addCustomTile: 'Ajouter une Tuile',
    speakAll: 'Tout Lire',
    modeScene: 'Scène & Texte',
    modeColor: 'Couleur & Motif',
    modeCurrency: 'Billets & Pièces',
    aiSceneReadout: 'Analyser la Scène (IA)',
    aiIdentifyCurrency: 'Identifier Billet / Pièce',
    aiIdentifyColor: 'Identifier Couleur Réelle',
    scanPrintedText: 'Scanner le Texte (OCR)',
    speakCrosshairColor: 'Dire la Couleur',
    freezeFrame: 'Figer l’image',
    unfreezeFrame: 'Reprendre Direct',
    checkIn: 'Valider',
    completedToday: 'Fait Aujourd’hui',
    markTakenNow: 'Marquer Pris',
    hearHowToTake: 'Écouter Comment Prendre',
    inputNewMedicine: 'Ajouter Médicament',
  },
  'ar-SA': {
    toolkit: 'الأدوات',
    settings: 'الإعدادات',
    caregiverPortal: 'بوابة مقدم الرعاية',
    account: 'الحساب',
    signOut: 'تسجيل الخروج',
    online: 'متصل',
    offline: 'غير متصل',
    batterySaver: 'البطارية',
    batterySaverOn: 'توفير ON',
    back: 'رجوع',
    textNormal: 'عادي',
    textXl: 'كبير جداً',
    neonUi: 'واجهة نيون برتقالية',
    neonOn: 'نيون مفعّل',
    childModePin: 'وضع الطفل (PIN)',
    callCaregiverNow: 'اتصل بمقدم الرعاية الآن',
    callCaregiverShort: 'اتصل',
    heroPrompt: 'اختر أداة مساعدة للبدء فوراً',
    heroSimplified: 'أدوات المساعدة الأساسية',
    streakLabel: 'سلسلة الأيام الآمنة',
    childStreakLabel: 'سلسلة النجوم',
    daysSafe: 'أيام آمنة',
    daySafe: 'يوم آمن',
    caregiverData: 'بيانات الرعاية',
    testAlert: 'اختبار التنبيه',
    openTool: 'فتح',
    letsGo: 'هيا نبدأ',
    caregiverCallReady: 'الاتصال والتنبيه جاهزان',
    dialNow: 'اتصل الآن',
    sendSms: 'إرسال SMS مع GPS',
    sendEmail: 'إرسال بريد تنبيه',
    copyAlertText: 'نسخ رسالة GPS',
    copied: 'تم النسخ!',
    talkToAi: 'تحدث إلى',
    listening: 'جارٍ الاستماع...',
    askAiPlaceholder: 'اسأل أو قل "Open Vision"...',
    instantControls: 'تحكم سريع بالأدوات',
    addReminder: 'إضافة تذكير',
    calmReset: 'تهدئة التنفس',
    alertCaregiver: 'تنبيه الرعاية',
    repeat: 'إعادة',
    silence: 'إيقاف الصوت',
    readAloud: 'اقرأ بصوت عالٍ',
    clear: 'مسح',
    cancel: 'إلغاء',
    settingsTitle: 'إعدادات مقدم الرعاية والمريض',
    caregiverPinLock: 'قفل PIN لمقدم الرعاية',
    tabPatient: 'بيانات المريض',
    tabDisabilities: 'الدعم الصحي والنفسي',
    tabThemesNetwork: 'المظاهر والشبكة والبطارية واللغة',
    tabPinSecurity: 'رمز PIN والأمان',
    saveAndLock: 'حفظ وقفل الإعدادات',
    themePaletteTitle: 'مظهر العرض وواجهة النيون',
    wallpaperTitle: 'الخلفية الحية وثلاثية الأبعاد',
    networkModeTitle: 'الشبكة والوضع دون اتصال',
    appLanguageTitle: 'لغة التطبيق (النص والصوت والذكاء الاصطناعي)',
    testLanguageVoice: 'اختبار صوت اللغة',
    aacEmergencyBar: 'تنبيه طوارئ — أحتاج إلى مساعدة فورية',
    addCustomTile: 'إضافة زر مخصص',
    speakAll: 'انطق الكل',
    modeScene: 'المشهد والنص',
    modeColor: 'اللون والنمط',
    modeCurrency: 'العملات والأوراق النقدية',
    aiSceneReadout: 'تحليل المشهد بالذكاء الاصطناعي',
    aiIdentifyCurrency: 'تحديد العملة / الورقة النقدية',
    aiIdentifyColor: 'تحديد اللون الحقيقي',
    scanPrintedText: 'مسح النص المطبوع',
    speakCrosshairColor: 'نطق اللون المحدد',
    freezeFrame: 'تجميد الصورة',
    unfreezeFrame: 'استئناف البث',
    checkIn: 'تسجيل الإنجاز',
    completedToday: 'تم اليوم',
    markTakenNow: 'تم التناول الآن',
    hearHowToTake: 'سماع طريقة الاستخدام',
    inputNewMedicine: 'إضافة دواء جديد',
  },
};

export function t(lang: LanguageCode | undefined, key: TranslationKey): string {
  const safeLang = isSupportedLanguage(lang) ? lang : 'en-US';
  return EXTRA_LANGS[safeLang]?.[key] ?? EN_STRINGS[key];
}

export function getLocalizedModuleMeta(
  lang: LanguageCode | undefined,
  modId: FunctionalModuleId
): LocalizedModuleCopy {
  const safeLang = isSupportedLanguage(lang) ? lang : 'en-US';
  const base = MODULE_ENGLISH_META[modId];
  const localized = LOCALIZED_MODULE_CARDS[safeLang]?.[modId];
  if (!localized) return base;
  return {
    title: localized.title ?? base.title,
    childTitle: localized.childTitle ?? localized.title ?? base.childTitle,
    domain: localized.domain ?? base.domain,
    description: localized.description ?? base.description,
    childDescription: localized.childDescription ?? localized.description ?? base.childDescription,
    capabilities: localized.capabilities ?? base.capabilities,
  };
}

export function getLocalizedModuleTitle(
  lang: LanguageCode | undefined,
  modId: FunctionalModuleId,
  fallbackTitle: string
): string {
  const meta = getLocalizedModuleMeta(lang, modId);
  return meta.title || fallbackTitle;
}
