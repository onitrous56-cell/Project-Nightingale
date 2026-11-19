import {useCallback, useEffect, useRef, useState} from 'react';
import {AlertTriangle, Check, Copy, Mail, MessageSquare, PhoneCall, ShieldAlert, X} from 'lucide-react';
import {AccessibilityTopBar} from './components/AccessibilityTopBar';
import {AmbientThreeBackground} from './components/AmbientThreeBackground';
import {CaregiverSettingsModal} from './components/CaregiverSettingsModal';
import {DashboardGrid} from './components/DashboardGrid';
import {DynamicAiCompanion} from './components/DynamicAiCompanion';
import {HomeAuthScreen} from './components/HomeAuthScreen';
import {MultimodalBanner} from './components/MultimodalBanner';
import {OfflineIndicator} from './components/OfflineIndicator';
import {StartupSplash} from './components/StartupSplash';
import {useFirebase} from './contexts/FirebaseContext';
import {useSmartBatterySaver} from './hooks/useSmartBatterySaver';
import {AACBoardModule} from './modules/AACBoardModule';
import {CaregiverPortalModule} from './modules/CaregiverPortalModule';
import {CognitiveMemoryModule} from './modules/CognitiveMemoryModule';
import {DyslexiaLensModule} from './modules/DyslexiaLensModule';
import {FallGuardianModule} from './modules/FallGuardianModule';
import {GeminiAssistantModule} from './modules/GeminiAssistantModule';
import {HydrationWellnessModule} from './modules/HydrationWellnessModule';
import {MagnifierLoupeModule} from './modules/MagnifierLoupeModule';
import {MentalStressModule} from './modules/MentalStressModule';
import {MotorCommunicatorModule} from './modules/MotorCommunicatorModule';
import {RoutineCoachModule} from './modules/RoutineCoachModule';
import {SafetyMapModule} from './modules/SafetyMapModule';
import {SensoryCalmModule} from './modules/SensoryCalmModule';
import {SignTranslatorModule} from './modules/SignTranslatorModule';
import {SoundRadarModule} from './modules/SoundRadarModule';
import {TactileBrailleModule} from './modules/TactileBrailleModule';
import {VisionNarratorModule} from './modules/VisionNarratorModule';
import {
  CaregiverConfig,
  ModuleId,
  MultimodalAlert,
  PatientProfile,
  TextSize,
  ThemeMode,
  VoiceSpeed,
} from './types';
import {
  acquireGuardianWakeLock,
  dispatchBackgroundSosNotification,
  releaseGuardianWakeLock,
  syncNativeApkBackgroundConfig,
} from './utils/backgroundGuardian';
import {buildCaregiverAlertLinks} from './utils/caregiverAlerts';
import {getLanguageMeta, t} from './utils/i18n';
import {
  playAlertSound,
  setGlobalLanguage,
  setGlobalVoicePersona,
  speakText,
  stopSpeech,
  triggerVibration,
} from './utils/multimodal';
import {
  DEFAULT_CAREGIVER_CONFIG,
  loadCaregiverConfig,
  saveCaregiverConfig,
  syncAccidentFreeStreakForNewDay,
} from './utils/patientProfile';

const PREFS_KEY = 'ablebridge_accessibility_prefs_v1';

const THEME_META_COLOR: Record<ThemeMode, string> = {
  dark: '#090E17',
  'high-contrast': '#000000',
  cream: '#FAF5E8',
  neon: '#03050A',
  'liquid-glass': '#050B18',
  'cyber-teal': '#02080A',
  'calm-lavender': '#0C0819',
  'solar-gold': '#0D0903',
};

export default function App() {
  const {
    user,
    cloudUserReady,
    isOfflineMode,
    liveLocation,
    logSosEvent,
    publishRemoteTelemetry,
    syncCaregiverProfileToCloud,
    loadCaregiverProfileFromCloud,
  } = useFirebase();
  const [showSplash, setShowSplash] = useState(true);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [caregiverConfig, setCaregiverConfig] = useState<CaregiverConfig>(() =>
    loadCaregiverConfig()
  );
  const [backgroundFallReason, setBackgroundFallReason] = useState<string | null>(null);
  const lastGlobalSpikeRef = useRef<number>(0);
  const globalFreeFallRef = useRef<number>(0);
  const cloudHydratedRef = useRef<string | null>(null);
  const [cloudHydratedUid, setCloudHydratedUid] = useState<string | null>(null);

  const [callDialogOpen, setCallDialogOpen] = useState(false);
  const [copiedAlertText, setCopiedAlertText] = useState(false);
  const [callActionLinks, setCallActionLinks] = useState<{
    reason: string;
    telUrl: string | null;
    mailtoUrl: string | null;
    smsUrl: string | null;
    bodyText: string;
    mapsLink: string;
    hasValidPhone: boolean;
    hasValidEmail: boolean;
    webhookDelivered: boolean;
  } | null>(null);

  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {theme?: ThemeMode};
        if (parsed.theme) return parsed.theme;
      }
    } catch {
      // Ignore storage errors
    }
    return 'dark';
  });

  const [textSize, setTextSize] = useState<TextSize>(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {textSize?: TextSize};
        if (parsed.textSize) return parsed.textSize;
      }
    } catch {
      // Ignore
    }
    return 'normal';
  });

  const [voiceSpeed, setVoiceSpeed] = useState<VoiceSpeed>(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {voiceSpeed?: VoiceSpeed};
        if (parsed.voiceSpeed) return parsed.voiceSpeed;
      }
    } catch {
      // Ignore
    }
    return 1.0;
  });

  const [alert, setAlert] = useState<MultimodalAlert | null>(null);
  const dismissTimerRef = useRef<number | null>(null);

  const profile = caregiverConfig.profile;
  const activeLang = profile.preferredLanguage || 'en-US';
  const batteryState = useSmartBatterySaver(
    profile.smartBatterySaverEnabled ?? true,
    profile.batterySaverThreshold ?? 20
  );

  const updateProfilePatch = useCallback((patch: Partial<PatientProfile>) => {
    setCaregiverConfig((prev) => ({
      ...prev,
      profile: {...prev.profile, ...patch},
    }));
  }, []);

  // Listen for Google Maps Platform Demo Key Quota events globally
  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const handleResetAllLocalState = useCallback(() => {
    setCaregiverConfig(DEFAULT_CAREGIVER_CONFIG);
    setTheme('dark');
    setTextSize('normal');
    setVoiceSpeed(1.0);
    setActiveModule('home-auth');
  }, []);

  // Automatically increment accident-free streak on each new calendar day when not reset
  useEffect(() => {
    const checkDailyStreak = () => {
      setCaregiverConfig((prev) => {
        const nextProfile = syncAccidentFreeStreakForNewDay(prev.profile);
        if (nextProfile === prev.profile) return prev;
        return {...prev, profile: nextProfile};
      });
    };
    checkDailyStreak();
    window.addEventListener('focus', checkDailyStreak);
    document.addEventListener('visibilitychange', checkDailyStreak);
    const intervalId = window.setInterval(checkDailyStreak, 60000);
    return () => {
      window.removeEventListener('focus', checkDailyStreak);
      document.removeEventListener('visibilitychange', checkDailyStreak);
      window.clearInterval(intervalId);
    };
  }, []);

  // Hydrate caregiver profile from Firestore ONLY after /users/{uid} exists cleanly
  useEffect(() => {
    if (!user || !cloudUserReady) {
      if (!user) {
        cloudHydratedRef.current = null;
        setCloudHydratedUid(null);
      }
      return;
    }
    if (cloudHydratedRef.current === user.uid) return;
    cloudHydratedRef.current = user.uid;

    loadCaregiverProfileFromCloud()
      .then((cloud) => {
        if (cloud) {
          setCaregiverConfig({
            ...cloud.config,
            profile: syncAccidentFreeStreakForNewDay(cloud.config.profile),
          });
          setTheme(cloud.theme);
          setTextSize(cloud.textSize);
          setVoiceSpeed(cloud.voiceSpeed);
        }
      })
      .catch(() => {})
      .finally(() => {
        setCloudHydratedUid(user.uid);
      });
  }, [user, cloudUserReady, loadCaregiverProfileFromCloud]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-text-size', textSize);
    document.documentElement.setAttribute(
      'data-child-mode',
      profile.childFriendlyMode ? 'true' : 'false'
    );
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', THEME_META_COLOR[theme]);
    }
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({theme, textSize, voiceSpeed}));
    } catch {
      // Ignore storage errors
    }
  }, [theme, textSize, voiceSpeed, profile.childFriendlyMode]);

  // Keep global speech synthesis voice persona synced with profile
  useEffect(() => {
    setGlobalVoicePersona(profile.voicePersona || 'natural-female');
  }, [profile.voicePersona]);

  // Sync Smart Battery Saver CSS flag & Multi-Language dir/lang attributes
  useEffect(() => {
    const langMeta = getLanguageMeta(activeLang);
    document.documentElement.setAttribute(
      'data-battery-saver',
      batteryState.batterySaverActive ? 'true' : 'false'
    );
    document.documentElement.lang = activeLang;
    document.documentElement.dir = langMeta.rtl ? 'rtl' : 'ltr';
    setGlobalLanguage(activeLang);
  }, [activeLang, batteryState.batterySaverActive]);

  // TalkBack Menu Reader (reads focused or clicked buttons/links aloud when enabled)
  useEffect(() => {
    if (!profile.talkBackEnabled) return;
    const handleTalkBack = (e: MouseEvent | FocusEvent) => {
      const target = (e.target as HTMLElement)?.closest('button, a, [role="button"]');
      if (!target) return;
      const label = target.getAttribute('aria-label') || target.textContent?.trim();
      if (label && label.length < 100) {
        speakText(label, voiceSpeed, {persona: profile.voicePersona, lang: activeLang});
      }
    };
    window.addEventListener('focusin', handleTalkBack);
    window.addEventListener('click', handleTalkBack);
    return () => {
      window.removeEventListener('focusin', handleTalkBack);
      window.removeEventListener('click', handleTalkBack);
    };
  }, [activeLang, profile.talkBackEnabled, profile.voicePersona, voiceSpeed]);

  // Persist caregiver config locally, sync APK Foreground config, and debounce cloud & remote link sync
  useEffect(() => {
    saveCaregiverConfig(caregiverConfig);
    syncNativeApkBackgroundConfig(caregiverConfig.profile);

    const id = window.setTimeout(() => {
      if (cloudUserReady && user && cloudHydratedUid === user.uid) {
        publishRemoteTelemetry(caregiverConfig.profile, 'monitoring').catch(() => {});
        syncCaregiverProfileToCloud(caregiverConfig, {theme, textSize, voiceSpeed}).catch(
          () => {}
        );
      } else {
        publishRemoteTelemetry(caregiverConfig.profile, 'monitoring').catch(() => {});
      }
    }, 650);
    return () => window.clearTimeout(id);
  }, [
    caregiverConfig,
    theme,
    textSize,
    voiceSpeed,
    cloudUserReady,
    cloudHydratedUid,
    user,
    syncCaregiverProfileToCloud,
    publishRemoteTelemetry,
  ]);

  // Global always-on G-Force monitor across all modules + Wake Lock when armed
  useEffect(() => {
    if (!profile.backgroundGuardianEnabled) {
      releaseGuardianWakeLock();
      return;
    }

    if (batteryState.batterySaverActive) {
      releaseGuardianWakeLock();
    } else {
      acquireGuardianWakeLock();
    }

    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        profile.backgroundGuardianEnabled &&
        !batteryState.batterySaverActive
      ) {
        acquireGuardianWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handleGlobalMotion = (event: DeviceMotionEvent) => {
      if (activeModule === 'fall') return;

      const acc = event.accelerationIncludingGravity;
      const lin = event.acceleration;
      let g = 0;

      if (acc && acc.x != null && acc.y != null && acc.z != null) {
        if (acc.x === 0 && acc.y === 0 && acc.z === 0) return;
        g = Number((Math.hypot(acc.x, acc.y, acc.z) / 9.81).toFixed(2));
      } else if (lin && lin.x != null && lin.y != null && lin.z != null) {
        if (lin.x === 0 && lin.y === 0 && lin.z === 0) return;
        g = Number((1.0 + Math.hypot(lin.x, lin.y, lin.z) / 9.81).toFixed(2));
      } else {
        return;
      }

      const now = Date.now();
      if (g < 0.48) {
        globalFreeFallRef.current = now;
      }

      const hadRecentFreeFall = now - globalFreeFallRef.current <= 1200;
      const twoPhaseLandingThreshold = Math.max(1.55, profile.fallGThreshold * 0.72);
      const triggered =
        g >= profile.fallGThreshold || (hadRecentFreeFall && g >= twoPhaseLandingThreshold);

      if (triggered && now - lastGlobalSpikeRef.current > 6000) {
        lastGlobalSpikeRef.current = now;
        globalFreeFallRef.current = 0;
        const reason =
          g >= profile.fallGThreshold
            ? `Background G-Force Impact (${g}G)`
            : `Background Free-Fall + Landing (${g}G)`;
        setBackgroundFallReason(reason);
        setActiveModule('fall');
        dispatchBackgroundSosNotification(
          'AbleBridge Fall Detected',
          `${reason} for ${profile.fullName}. Tap to cancel within 15 seconds.`
        );
      }
    };

    window.addEventListener('devicemotion', handleGlobalMotion);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('devicemotion', handleGlobalMotion);
    };
  }, [
    activeModule,
    batteryState.batterySaverActive,
    profile.backgroundGuardianEnabled,
    profile.fallGThreshold,
    profile.fullName,
  ]);

  const emitAlert = useCallback(
    (incoming: Omit<MultimodalAlert, 'id'>) => {
      if (dismissTimerRef.current) {
        window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
      const id = Date.now();
      const suppressFlash =
        profile.lowStimulationMode || profile.disabilities.includes('epilepsy_seizure');
      setAlert({
        ...incoming,
        id,
        flashScreen: suppressFlash ? false : incoming.flashScreen,
      });
      const timeoutMs = incoming.severity === 'emergency' ? 9000 : 4800;
      dismissTimerRef.current = window.setTimeout(() => {
        setAlert((cur) => (cur?.id === id ? null : cur));
      }, timeoutMs);
    },
    [profile.lowStimulationMode, profile.disabilities]
  );

  // Global One-Tap Call Caregiver Action (available on ALL screens, works online & offline)
  const handleImmediateCaregiverCall = useCallback(
    (reason = 'Immediate Call Caregiver Button Pressed') => {
      const localLinks = buildCaregiverAlertLinks({
        patientName: profile.fullName,
        caregiverName: profile.caregiverName,
        caregiverPhone: profile.caregiverPhone,
        alertEmail: profile.alertEmail,
        reason,
        lat: liveLocation.lat,
        lng: liveLocation.lng,
        remoteAccessCode: profile.remoteAccessCode,
      });

      playAlertSound('sos');
      triggerVibration([240, 90, 240]);
      speakText(
        `${t(activeLang, 'callCaregiverNow')} ${profile.caregiverName || ''}`.trim(),
        voiceSpeed,
        {persona: profile.voicePersona, lang: activeLang}
      );
      emitAlert({
        title: `Calling ${profile.caregiverName || 'Caregiver'}`,
        message: `Phone: ${profile.caregiverPhone || 'Not set'}${
          profile.alertEmail ? ` · Email: ${profile.alertEmail}` : ''
        }`,
        severity: 'emergency',
        flashScreen: true,
      });

      setCopiedAlertText(false);
      setCallActionLinks({
        reason,
        telUrl: localLinks.telUrl,
        mailtoUrl: localLinks.mailtoUrl,
        smsUrl: localLinks.smsUrl,
        bodyText: localLinks.bodyText,
        mapsLink: localLinks.mapsLink,
        hasValidPhone: localLinks.hasValidPhone,
        hasValidEmail: localLinks.hasValidEmail,
        webhookDelivered: false,
      });
      setCallDialogOpen(true);

      logSosEvent({
        reason,
        peakG: 1.0,
        lat: liveLocation.lat,
        lng: liveLocation.lng,
      }).catch(() => {});

      if (!isOfflineMode) {
        fetch('/api/alerts/notify', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            patientName: profile.fullName,
            caregiverName: profile.caregiverName,
            caregiverPhone: profile.caregiverPhone,
            alertEmail: profile.alertEmail,
            reason,
            lat: liveLocation.lat,
            lng: liveLocation.lng,
            remoteAccessCode: profile.remoteAccessCode,
          }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!d) return;
            setCallActionLinks((prev) =>
              prev
                ? {
                    ...prev,
                    telUrl: d.telUrl ?? prev.telUrl,
                    mailtoUrl: d.mailtoUrl ?? prev.mailtoUrl,
                    smsUrl: d.smsUrl ?? prev.smsUrl,
                    webhookDelivered: Boolean(d.webhookDelivered),
                  }
                : prev
            );
          })
          .catch(() => {});
      }
    },
    [
      emitAlert,
      isOfflineMode,
      liveLocation.lat,
      liveLocation.lng,
      logSosEvent,
      profile,
      voiceSpeed,
    ]
  );

  const activateNeonTheme = () => {
    const next: ThemeMode = theme === 'neon' ? 'dark' : 'neon';
    setTheme(next);
    if (next === 'neon' && (profile.liveWallpaperType === 'liquid-glass' || profile.liveWallpaperType === 'off')) {
      updateProfilePatch({liveWallpaperType: 'aurora-waves', enable3DBackground: true});
    }
    triggerVibration(60);
    speakText(
      next === 'neon'
        ? t(activeLang, 'neonOn')
        : 'Dark Slate',
      voiceSpeed,
      {persona: profile.voicePersona, lang: activeLang}
    );
  };

  const toggleTextSize = () => {
    const next: TextSize = textSize === 'normal' ? 'xl' : 'normal';
    setTextSize(next);
    triggerVibration(50);
    speakText(next === 'xl' ? t(activeLang, 'textXl') : t(activeLang, 'textNormal'), voiceSpeed, {
      persona: profile.voicePersona,
      lang: activeLang,
    });
  };

  const cycleVoiceSpeed = () => {
    const speeds: VoiceSpeed[] = [0.8, 1.0, 1.3];
    const next = speeds[(speeds.indexOf(voiceSpeed) + 1) % speeds.length];
    setVoiceSpeed(next);
    triggerVibration(50);
    speakText(`${next}x`, next, {persona: profile.voicePersona, lang: activeLang});
  };

  const goDashboard = () => {
    stopSpeech();
    setAlert(null);
    setActiveModule('dashboard');
    triggerVibration(40);
  };

  const handleQuickMultimodalDemo = () => {
    playAlertSound('chime');
    triggerVibration([150, 75, 150]);
    const suppressFlash =
      profile.lowStimulationMode || profile.disabilities.includes('epilepsy_seizure');
    const msg = getLanguageMeta(activeLang).sampleSpeech;
    speakText(msg, voiceSpeed, {persona: profile.voicePersona, lang: activeLang});
    emitAlert({
      title: 'Multimodal Feedback Active',
      message: suppressFlash
        ? 'Calm visual banner + Web Speech audio + vibration triggered (Flashes suppressed).'
        : 'Visual flash + Web Speech audio + Haptic vibration triggered together.',
      severity: 'warning',
      flashScreen: !suppressFlash,
    });
  };

  const lowStimSafe =
    profile.lowStimulationMode || profile.disabilities.includes('epilepsy_seizure');

  return (
    <div className="min-h-screen surface-canvas relative flex flex-col">
      {showSplash && (
        <StartupSplash
          lowStimulationMode={lowStimSafe}
          onComplete={() => setShowSplash(false)}
        />
      )}

      {/* Toggleable Three.js 3D Ambient Astrolabe + Dynamic Theme-Reactive Live Wallpaper */}
      <AmbientThreeBackground
        enabled={profile.enable3DBackground}
        lowStimulationMode={lowStimSafe}
        batterySaverActive={batteryState.batterySaverActive}
        theme={theme}
        childFriendlyMode={profile.childFriendlyMode}
        wallpaperType={profile.liveWallpaperType || 'aurora-waves'}
      />

      {/* Foreground App UI Layer */}
      <div className="relative z-10 min-h-screen flex flex-col pb-24">
        {gmpQuotaExceeded && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2 text-xs md:text-sm text-center z-50 shadow-sm">
            <span>
              Google Maps Platform quota reached. If you are the app owner, visit{' '}
              <a
                href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-semibold text-amber-950 hover:text-amber-800"
              >
                maps developer site
              </a>{' '}
              for instructions to update your account.
            </span>
          </div>
        )}

        <AccessibilityTopBar
          activeModule={activeModule}
          onGoHome={goDashboard}
          onOpenHomeAuth={() => {
            stopSpeech();
            setActiveModule('home-auth');
          }}
          onOpenCaregiverPortal={() => {
            stopSpeech();
            setActiveModule('caregiver-portal');
          }}
          textSize={textSize}
          onToggleTextSize={toggleTextSize}
          voiceSpeed={voiceSpeed}
          onCycleVoiceSpeed={cycleVoiceSpeed}
          onOpenSettings={() => setSettingsOpen(true)}
          language={activeLang}
        />

        <OfflineIndicator />

        <div className="flex-1">
          {activeModule === 'home-auth' && (
            <HomeAuthScreen
              patientProfile={profile}
              onUpdateProfile={updateProfilePatch}
              onEnterDashboard={goDashboard}
              onOpenCaregiverPortal={() => setActiveModule('caregiver-portal')}
              onResetAccount={handleResetAllLocalState}
            />
          )}

          {activeModule === 'dashboard' && (
            <DashboardGrid
              patientProfile={profile}
              theme={theme}
              onSelectModule={(id) => {
                triggerVibration(50);
                setActiveModule(id);
              }}
              onQuickMultimodalDemo={handleQuickMultimodalDemo}
              onOpenSettings={() => setSettingsOpen(true)}
              onActivateNeonTheme={activateNeonTheme}
              onCallCaregiver={() => handleImmediateCaregiverCall('Dashboard Hero Call Caregiver')}
            />
          )}

          {activeModule === 'caregiver-portal' && (
            <CaregiverPortalModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              patientProfile={profile}
              caregiverPin={caregiverConfig.pin}
              onUpdateProfile={updateProfilePatch}
              onTriggerCaregiverCall={handleImmediateCaregiverCall}
            />
          )}

          {activeModule === 'vision' && (
            <VisionNarratorModule
              onBack={goDashboard}
              defaultVoiceSpeed={voiceSpeed}
              language={activeLang}
              batterySaverActive={batteryState.batterySaverActive}
              onEmitAlert={emitAlert}
            />
          )}

          {activeModule === 'sign' && (
            <SignTranslatorModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              batterySaverActive={batteryState.batterySaverActive}
              onEmitAlert={emitAlert}
            />
          )}

          {activeModule === 'sound' && (
            <SoundRadarModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              batterySaverActive={batteryState.batterySaverActive}
              onEmitAlert={emitAlert}
            />
          )}

          {activeModule === 'aac' && (
            <AACBoardModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              language={activeLang}
              onEmitAlert={emitAlert}
            />
          )}

          {activeModule === 'routine' && (
            <RoutineCoachModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              language={activeLang}
              onEmitAlert={emitAlert}
            />
          )}

          {activeModule === 'memory' && (
            <CognitiveMemoryModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              caregiverPin={caregiverConfig.pin}
              onEmitAlert={emitAlert}
            />
          )}

          {activeModule === 'dyslexia' && (
            <DyslexiaLensModule onBack={goDashboard} voiceSpeed={voiceSpeed} />
          )}

          {activeModule === 'motor' && (
            <MotorCommunicatorModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              batterySaverActive={batteryState.batterySaverActive}
              onEmitAlert={emitAlert}
            />
          )}

          {activeModule === 'fall' && (
            <FallGuardianModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              patientProfile={profile}
              batterySaverActive={batteryState.batterySaverActive}
              autoTriggeredReason={backgroundFallReason}
              onClearAutoTrigger={() => setBackgroundFallReason(null)}
              onOpenSafetyMap={() => setActiveModule('map')}
              onSosDispatched={() =>
                updateProfilePatch({
                  accidentFreeDays: 0,
                  streakLastResetIso: new Date().toISOString(),
                })
              }
              onToggleBackgroundGuardian={(enabled) =>
                updateProfilePatch({backgroundGuardianEnabled: enabled})
              }
              onUpdateSafetyThresholds={(patch) => updateProfilePatch(patch)}
              onEmitAlert={emitAlert}
            />
          )}

          {activeModule === 'calm' && (
            <SensoryCalmModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              patientName={profile.fullName || 'Patient'}
              caregiverName={profile.caregiverName || 'Caregiver'}
              onEmitAlert={emitAlert}
            />
          )}

          {activeModule === 'stress' && (
            <MentalStressModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              patientProfile={profile}
              onOpenCalmStudio={() => setActiveModule('calm')}
              onEmitAlert={emitAlert}
            />
          )}

          {activeModule === 'map' && (
            <SafetyMapModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              patientProfile={profile}
            />
          )}

          {activeModule === 'assistant' && (
            <GeminiAssistantModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              patientProfile={profile}
              onCallCaregiver={() => handleImmediateCaregiverCall('AI Assistant Call Caregiver Trigger')}
              onNavigateModule={(mod) => {
                triggerVibration(50);
                setActiveModule(mod);
              }}
            />
          )}

          {activeModule === 'magnifier' && (
            <MagnifierLoupeModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              language={activeLang}
              batterySaverActive={batteryState.batterySaverActive}
              onEmitAlert={emitAlert}
            />
          )}

          {activeModule === 'hydration' && (
            <HydrationWellnessModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              onEmitAlert={emitAlert}
            />
          )}

          {activeModule === 'tactile' && (
            <TactileBrailleModule
              onBack={goDashboard}
              voiceSpeed={voiceSpeed}
              lowStimulationMode={lowStimSafe}
              onEmitAlert={emitAlert}
            />
          )}
        </div>

        {/* Global Persistent Large "CALL CAREGIVER" Dock on ALL screens (< 12% mobile viewport height) */}
        <div
          className="fixed bottom-0 left-0 right-0 z-40 surface-card border-x-0 border-b-0 px-3 sm:px-6 py-2 shadow-2xl"
          role="region"
          aria-label="Global Emergency Caregiver Call Bar"
        >
          <div className="max-w-7xl mx-auto flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              onClick={() =>
                handleImmediateCaregiverCall('Global Call Caregiver Bar Triggered')
              }
              className="w-full min-h-[58px] rounded-2xl bg-red-600 hover:bg-red-700 text-white font-display text-base sm:text-xl font-extrabold flex items-center justify-center gap-3 shadow-xl cursor-pointer active:scale-[0.99] transition-transform"
              aria-label={`Immediately call caregiver ${profile.caregiverName} at ${profile.caregiverPhone}`}
            >
              <PhoneCall className="w-6 h-6 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {t(activeLang, 'callCaregiverNow')} · {profile.caregiverName || 'Caregiver'} (
                {profile.caregiverPhone || 'Set Phone'})
              </span>
            </button>
          </div>
        </div>

        {/* Immediate Caregiver Call, SMS & Email Alert Modal */}
        {callDialogOpen && callActionLinks && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto"
            role="alertdialog"
            aria-modal="true"
            aria-label="Caregiver Call & Alert Dispatch"
          >
            <div className="surface-card rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border-4 border-red-500 my-auto">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-7 h-7" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl sm:text-2xl font-extrabold">
                      {t(activeLang, 'caregiverCallReady')}
                    </h2>
                    <p className="text-xs sm:text-sm text-muted">
                      {profile.caregiverName || 'Caregiver'} · {profile.caregiverPhone || 'Phone not set'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCallDialogOpen(false)}
                  className="surface-elevated min-h-[48px] min-w-[48px] rounded-xl flex items-center justify-center cursor-pointer"
                  aria-label="Close call dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="surface-elevated rounded-2xl p-4 text-sm space-y-1">
                <p className="font-bold">
                  GPS Attached: {liveLocation.lat.toFixed(4)}°, {liveLocation.lng.toFixed(4)}°
                </p>
                <p className="text-muted">
                  Alert Email:{' '}
                  <strong>{profile.alertEmail || 'Not configured'}</strong>
                </p>
                {callActionLinks.webhookDelivered && (
                  <p className="text-xs font-extrabold text-emerald-500">
                    Cloud caregiver alert webhook delivered.
                  </p>
                )}
              </div>

              {(!callActionLinks.hasValidPhone || !callActionLinks.hasValidEmail) && (
                <div className="rounded-2xl border-2 border-amber-500/60 bg-amber-500/10 p-3.5 text-xs font-bold flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" aria-hidden="true" />
                    <span>
                      {!callActionLinks.hasValidPhone && !callActionLinks.hasValidEmail
                        ? 'Caregiver phone and alert email are missing.'
                        : !callActionLinks.hasValidPhone
                          ? 'Caregiver phone number is missing or invalid for Call/SMS.'
                          : 'Alert email is not configured yet for email alerts.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCallDialogOpen(false);
                      setSettingsOpen(true);
                    }}
                    className="btn-accent min-h-[38px] px-3 rounded-xl text-xs font-extrabold whitespace-nowrap cursor-pointer shrink-0"
                  >
                    Open Settings
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5">
                {callActionLinks.telUrl && (
                  <a
                    href={callActionLinks.telUrl}
                    className="min-h-[60px] rounded-2xl bg-red-600 hover:bg-red-700 text-white font-display text-lg font-extrabold flex items-center justify-center gap-2"
                  >
                    <PhoneCall className="w-5 h-5" aria-hidden="true" />
                    <span>
                      {t(activeLang, 'dialNow')} · {profile.caregiverPhone}
                    </span>
                  </a>
                )}
                {callActionLinks.smsUrl && (
                  <a
                    href={callActionLinks.smsUrl}
                    className="btn-accent min-h-[56px] rounded-2xl font-extrabold text-base flex items-center justify-center gap-2"
                  >
                    <MessageSquare className="w-5 h-5" aria-hidden="true" />
                    <span>{t(activeLang, 'sendSms')}</span>
                  </a>
                )}
                {callActionLinks.mailtoUrl && (
                  <a
                    href={callActionLinks.mailtoUrl}
                    className="surface-elevated min-h-[56px] rounded-2xl font-extrabold text-base flex items-center justify-center gap-2"
                  >
                    <Mail className="w-5 h-5" aria-hidden="true" />
                    <span>
                      {t(activeLang, 'sendEmail')} ({profile.alertEmail})
                    </span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(callActionLinks.bodyText);
                      setCopiedAlertText(true);
                      window.setTimeout(() => setCopiedAlertText(false), 3000);
                    } catch {
                      // Clipboard blocked in restricted context
                    }
                  }}
                  className="surface-elevated min-h-[52px] rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {copiedAlertText ? (
                    <Check className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                  ) : (
                    <Copy className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>
                    {copiedAlertText ? t(activeLang, 'copied') : t(activeLang, 'copyAlertText')}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        <CaregiverSettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          config={caregiverConfig}
          theme={theme}
          textSize={textSize}
          voiceSpeed={voiceSpeed}
          batteryState={batteryState}
          onUpdateConfig={setCaregiverConfig}
          onApplyAccessibilityOverrides={({theme: tMode, textSize: ts, voiceSpeed: vs}) => {
            setTheme(tMode);
            setTextSize(ts);
            setVoiceSpeed(vs);
          }}
          onResetAllLocalState={handleResetAllLocalState}
        />

        {(profile.floatingAiEnabled ?? true) && (
          <DynamicAiCompanion
            profile={profile}
            theme={theme}
            voiceSpeed={voiceSpeed}
            activeModule={activeModule}
            batterySaverActive={batteryState.batterySaverActive}
            onNavigateModule={(mod) => {
              triggerVibration(50);
              setActiveModule(mod);
            }}
            onCallCaregiver={() =>
              handleImmediateCaregiverCall('Dynamic AI Companion Call Caregiver Trigger')
            }
            onEmitAlert={emitAlert}
          />
        )}

        <MultimodalBanner alert={alert} onDismiss={() => setAlert(null)} />
      </div>
    </div>
  );
}
