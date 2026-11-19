import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Activity,
  BellRing,
  CheckCircle2,
  MapPin,
  PhoneCall,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Timer,
} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {useFirebase} from '../contexts/FirebaseContext';
import {MultimodalAlert, PatientProfile} from '../types';
import {
  acquireGuardianWakeLock,
  dispatchBackgroundSosNotification,
  isNativeApkEnvironment,
  releaseGuardianWakeLock,
  requestGuardianNotificationPermission,
} from '../utils/backgroundGuardian';
import {buildCaregiverAlertLinks} from '../utils/caregiverAlerts';
import {playAlertSound, speakText, stopSpeech, triggerVibration} from '../utils/multimodal';

interface FallGuardianModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  patientProfile: PatientProfile;
  batterySaverActive?: boolean;
  autoTriggeredReason?: string | null;
  onClearAutoTrigger?: () => void;
  onOpenSafetyMap?: () => void;
  onSosDispatched?: () => void;
  onToggleBackgroundGuardian: (enabled: boolean) => void;
  onUpdateSafetyThresholds: (patch: {fallGThreshold?: number; inactivitySeconds?: number}) => void;
  onEmitAlert: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

type GuardianState = 'monitoring' | 'countdown' | 'sos';

export const FallGuardianModule: React.FC<FallGuardianModuleProps> = ({
  onBack,
  voiceSpeed,
  patientProfile,
  batterySaverActive = false,
  autoTriggeredReason,
  onClearAutoTrigger,
  onOpenSafetyMap,
  onSosDispatched,
  onToggleBackgroundGuardian,
  onUpdateSafetyThresholds,
  onEmitAlert,
}) => {
  const {
    logSosEvent,
    updateSosEventStatus,
    liveLocation,
    publishRemoteTelemetry,
    isOfflineMode,
  } = useFirebase();
  const activeSosDocIdRef = useRef<string | null>(null);
  const lastMotionSampleRef = useRef<number>(0);
  const [copiedAlert, setCopiedAlert] = useState(false);
  const [notifyLinks, setNotifyLinks] = useState<{
    telUrl: string | null;
    mailtoUrl: string | null;
    smsUrl: string | null;
    bodyText: string;
    webhookDelivered: boolean;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gHistoryRef = useRef<number[]>(Array(60).fill(1.0));
  const lastSpikeTimeRef = useRef<number>(0);
  const freeFallTimeRef = useRef<number>(0);

  const [guardianState, setGuardianState] = useState<GuardianState>('monitoring');
  const [currentG, setCurrentG] = useState<number>(1.0);
  const [peakG, setPeakG] = useState<number>(1.05);
  const [axisReadout, setAxisReadout] = useState<{x: number; y: number; z: number} | null>(null);
  const [sampleCount, setSampleCount] = useState<number>(0);
  const [motionPermission, setMotionPermission] = useState<
    'auto' | 'prompt_required' | 'granted' | 'denied'
  >(() => {
    const dm = typeof DeviceMotionEvent !== 'undefined' ? (DeviceMotionEvent as unknown as {requestPermission?: unknown}) : null;
    return typeof dm?.requestPermission === 'function' ? 'prompt_required' : 'auto';
  });
  const [inactivityRemaining, setInactivityRemaining] = useState<number>(
    patientProfile.inactivitySeconds
  );
  const [countdown, setCountdown] = useState<number>(15);
  const [triggerReason, setTriggerReason] = useState<string>('Sudden Impact Detected');
  const [sensorAvailable, setSensorAvailable] = useState<boolean>(false);
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const [notificationsReady, setNotificationsReady] = useState<boolean>(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  );

  const triggerCountdown = useCallback(
    (reason: string, spikeValue?: number) => {
      setTriggerReason(reason);
      const impactG = spikeValue ?? currentG;
      if (spikeValue) {
        setCurrentG(spikeValue);
        setPeakG((p) => Math.max(p, spikeValue));
        gHistoryRef.current = [...gHistoryRef.current.slice(1), spikeValue];
      }
      setCountdown(15);
      setGuardianState('countdown');
      playAlertSound('sos');
      triggerVibration([400, 150, 400, 150, 400]);
      speakText(
        `${reason} for ${patientProfile.fullName}. Tap I am okay within 15 seconds to cancel emergency SOS.`,
        voiceSpeed
      );
      onEmitAlert({
        title: 'FALL GUARDIAN ALERT',
        message: `${reason} — 15s countdown active.`,
        severity: 'emergency',
        flashScreen: true,
      });
      dispatchBackgroundSosNotification(
        'AbleBridge Fall Guardian Alert',
        `${reason} detected for ${patientProfile.fullName}. Open app within 15s to cancel SOS.`
      );
      logSosEvent({
        reason,
        peakG: impactG,
        lat: liveLocation.lat,
        lng: liveLocation.lng,
      })
        .then((id) => {
          activeSosDocIdRef.current = id;
        })
        .catch(() => {});
      publishRemoteTelemetry(patientProfile, 'countdown').catch(() => {});
    },
    [
      currentG,
      liveLocation.lat,
      liveLocation.lng,
      logSosEvent,
      onEmitAlert,
      patientProfile,
      publishRemoteTelemetry,
      voiceSpeed,
    ]
  );

  useEffect(() => {
    if (autoTriggeredReason) {
      triggerCountdown(autoTriggeredReason, patientProfile.fallGThreshold + 0.5);
      onClearAutoTrigger?.();
    }
  }, [autoTriggeredReason, onClearAutoTrigger, patientProfile.fallGThreshold, triggerCountdown]);

  useEffect(() => {
    setInactivityRemaining(patientProfile.inactivitySeconds);
  }, [patientProfile.inactivitySeconds]);

  useEffect(() => {
    let active = true;
    if (patientProfile.backgroundGuardianEnabled && !batterySaverActive) {
      acquireGuardianWakeLock().then((ok) => {
        if (active) setWakeLockActive(ok);
      });
    } else {
      releaseGuardianWakeLock().then(() => {
        if (active) setWakeLockActive(false);
      });
    }
    return () => {
      active = false;
    };
  }, [patientProfile.backgroundGuardianEnabled, batterySaverActive]);

  const cancelToSafe = useCallback(() => {
    stopSpeech();
    if (activeSosDocIdRef.current) {
      updateSosEventStatus(activeSosDocIdRef.current, 'canceled').catch(() => {});
      activeSosDocIdRef.current = null;
    }
    publishRemoteTelemetry(patientProfile, 'monitoring').catch(() => {});
    setNotifyLinks(null);
    setGuardianState('monitoring');
    setInactivityRemaining(patientProfile.inactivitySeconds);
    setCurrentG(1.0);
    triggerVibration(70);
    playAlertSound('select');
    speakText('Alert canceled. Guardian resumed.', voiceSpeed);
  }, [
    patientProfile,
    publishRemoteTelemetry,
    updateSosEventStatus,
    voiceSpeed,
  ]);

  useEffect(() => {
    const minUiUpdateIntervalMs = batterySaverActive ? 380 : 0;
    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      const lin = event.acceleration;

      let g = 0;
      let ax = 0;
      let ay = 0;
      let az = 0;

      if (acc && acc.x != null && acc.y != null && acc.z != null) {
        // Ignore all-zero dummy readings emitted by some desktop/headless browsers
        if (acc.x === 0 && acc.y === 0 && acc.z === 0) return;
        ax = acc.x;
        ay = acc.y;
        az = acc.z;
        g = Number((Math.hypot(ax, ay, az) / 9.81).toFixed(2));
      } else if (lin && lin.x != null && lin.y != null && lin.z != null) {
        if (lin.x === 0 && lin.y === 0 && lin.z === 0) return;
        ax = lin.x;
        ay = lin.y;
        az = lin.z;
        g = Number((1.0 + Math.hypot(ax, ay, az) / 9.81).toFixed(2));
      } else {
        return;
      }

      const now = Date.now();

      // Stage 1: Detect brief weightless free-fall dip (< 0.48G)
      if (g < 0.48) {
        freeFallTimeRef.current = now;
      }

      // Stage 2: Detect either direct high-G impact OR free-fall followed by landing impact within 1.2s
      const hadRecentFreeFall = now - freeFallTimeRef.current <= 1200;
      const twoPhaseLandingThreshold = Math.max(1.55, patientProfile.fallGThreshold * 0.72);
      const impactTriggered =
        g >= patientProfile.fallGThreshold || (hadRecentFreeFall && g >= twoPhaseLandingThreshold);

      if (impactTriggered && guardianState === 'monitoring' && now - lastSpikeTimeRef.current > 5000) {
        lastSpikeTimeRef.current = now;
        freeFallTimeRef.current = 0;
        const reason =
          g >= patientProfile.fallGThreshold
            ? `High G-Force Impact (${g.toFixed(2)}G)`
            : `Free-Fall + Landing Impact (${g.toFixed(2)}G)`;
        setCurrentG(g);
        setPeakG((p) => Math.max(p, g));
        gHistoryRef.current = [...gHistoryRef.current.slice(1), g];
        triggerCountdown(reason, g);
        return;
      }

      // Reset inactivity timer whenever genuine movement > 0.18G above baseline occurs
      if (Math.abs(g - 1.0) > 0.18 && guardianState === 'monitoring') {
        setInactivityRemaining(patientProfile.inactivitySeconds);
      }

      // Throttle UI / canvas state redraws in Battery Saver without ever dropping spike checks
      if (minUiUpdateIntervalMs > 0 && now - lastMotionSampleRef.current < minUiUpdateIntervalMs) {
        return;
      }
      lastMotionSampleRef.current = now;

      setSensorAvailable(true);
      setSampleCount((c) => c + 1);
      setAxisReadout({
        x: Number(ax.toFixed(1)),
        y: Number(ay.toFixed(1)),
        z: Number(az.toFixed(1)),
      });
      setCurrentG(g);
      setPeakG((p) => Math.max(p, g));
      gHistoryRef.current = [...gHistoryRef.current.slice(1), g];
    };

    const handleUserInteraction = () => {
      if (guardianState === 'monitoring') {
        setInactivityRemaining(patientProfile.inactivitySeconds);
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    window.addEventListener('pointerdown', handleUserInteraction, {passive: true});
    window.addEventListener('keydown', handleUserInteraction, {passive: true});
    return () => {
      window.removeEventListener('devicemotion', handleMotion);
      window.removeEventListener('pointerdown', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
    };
  }, [
    batterySaverActive,
    guardianState,
    patientProfile.fallGThreshold,
    patientProfile.inactivitySeconds,
    triggerCountdown,
  ]);

  useEffect(() => {
    if (guardianState !== 'monitoring') return;
    const stepSeconds = batterySaverActive ? 3 : 1;
    const id = window.setInterval(() => {
      if (!sensorAvailable) {
        const restG = Number((0.98 + Math.random() * 0.05).toFixed(2));
        gHistoryRef.current = [...gHistoryRef.current.slice(1), restG];
        setCurrentG(restG);
      }
      setInactivityRemaining((prev) => Math.max(0, prev - stepSeconds));
    }, stepSeconds * 1000);
    return () => window.clearInterval(id);
  }, [batterySaverActive, guardianState, sensorAvailable]);

  useEffect(() => {
    if (guardianState === 'monitoring' && inactivityRemaining === 0) {
      setInactivityRemaining(patientProfile.inactivitySeconds);
      triggerCountdown('Extended Inactivity Timeout');
    }
  }, [guardianState, inactivityRemaining, patientProfile.inactivitySeconds, triggerCountdown]);

  useEffect(() => {
    if (guardianState !== 'countdown') return;
    const id = window.setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [guardianState]);

  useEffect(() => {
    if (guardianState !== 'countdown') return;
    if (countdown === 0) {
      setGuardianState('sos');
      if (activeSosDocIdRef.current) {
        updateSosEventStatus(activeSosDocIdRef.current, 'dispatched').catch(() => {});
        activeSosDocIdRef.current = null;
      }
      onSosDispatched?.();
      publishRemoteTelemetry(patientProfile, 'dispatched').catch(() => {});

      // Always populate device-local Call / SMS / Email links immediately (works offline too)
      const localLinks = buildCaregiverAlertLinks({
        patientName: patientProfile.fullName,
        caregiverName: patientProfile.caregiverName,
        caregiverPhone: patientProfile.caregiverPhone,
        alertEmail: patientProfile.alertEmail,
        reason: triggerReason,
        lat: liveLocation.lat,
        lng: liveLocation.lng,
        remoteAccessCode: patientProfile.remoteAccessCode,
      });
      setNotifyLinks({
        telUrl: localLinks.telUrl,
        mailtoUrl: localLinks.mailtoUrl,
        smsUrl: localLinks.smsUrl,
        bodyText: localLinks.bodyText,
        webhookDelivered: false,
      });

      if (!isOfflineMode) {
        fetch('/api/alerts/notify', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            patientName: patientProfile.fullName,
            caregiverName: patientProfile.caregiverName,
            caregiverPhone: patientProfile.caregiverPhone,
            alertEmail: patientProfile.alertEmail,
            reason: triggerReason,
            lat: liveLocation.lat,
            lng: liveLocation.lng,
            remoteAccessCode: patientProfile.remoteAccessCode,
          }),
        })
          .then((r) => r.json())
          .then((d) => {
            setNotifyLinks((prev) => ({
              telUrl: d.telUrl ?? prev?.telUrl ?? localLinks.telUrl,
              mailtoUrl: d.mailtoUrl ?? prev?.mailtoUrl ?? localLinks.mailtoUrl,
              smsUrl: d.smsUrl ?? prev?.smsUrl ?? localLinks.smsUrl,
              bodyText: d.summary ?? prev?.bodyText ?? localLinks.bodyText,
              webhookDelivered: Boolean(d.webhookDelivered),
            }));
          })
          .catch(() => {});
      }

      playAlertSound('sos');
      triggerVibration([500, 150, 500, 150, 700]);
      const sosMsg = `Emergency SOS dispatched for ${patientProfile.fullName}! Alert sent to ${patientProfile.caregiverName}.`;
      speakText(sosMsg, voiceSpeed);
      dispatchBackgroundSosNotification(
        `SOS DISPATCHED: ${patientProfile.fullName}`,
        `Alert prepared for ${patientProfile.caregiverName} (${patientProfile.caregiverPhone}). Reason: ${triggerReason}.`
      );
      return;
    }
    if (countdown < 15) {
      playAlertSound('sos');
      triggerVibration(220);
    }
  }, [
    countdown,
    guardianState,
    isOfflineMode,
    liveLocation.lat,
    liveLocation.lng,
    onSosDispatched,
    patientProfile,
    publishRemoteTelemetry,
    triggerReason,
    updateSosEventStatus,
    voiceSpeed,
  ]);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#070B14';
      ctx.fillRect(0, 0, w, h);

      const yForG = (gVal: number) => h - Math.min(3.8, Math.max(0, gVal)) * (h / 4);

      ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, yForG(patientProfile.fallGThreshold));
      ctx.lineTo(w, yForG(patientProfile.fallGThreshold));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.beginPath();
      ctx.moveTo(0, yForG(1.0));
      ctx.lineTo(w, yForG(1.0));
      ctx.stroke();

      const pts = gHistoryRef.current;
      ctx.strokeStyle = guardianState === 'monitoring' ? '#38BDF8' : '#EF4444';
      ctx.lineWidth = 4;
      ctx.beginPath();
      pts.forEach((val, idx) => {
        const x = (idx / (pts.length - 1)) * w;
        const y = yForG(val);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    draw();
  }, [currentG, guardianState, patientProfile.fallGThreshold]);

  const requestMotionPermissionIfIOS = async () => {
    const dm = DeviceMotionEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof dm?.requestPermission === 'function') {
      try {
        const res = await dm.requestPermission();
        setMotionPermission(res === 'granted' ? 'granted' : 'denied');
        speakText(
          res === 'granted'
            ? 'Motion sensor permission granted. Fall detection active.'
            : 'Motion sensor permission denied. Demo and inactivity watchdogs remain active.',
          voiceSpeed
        );
      } catch {
        setMotionPermission('denied');
      }
    } else {
      setMotionPermission('auto');
      speakText(
        sensorAvailable
          ? 'Live hardware accelerometer verified and active.'
          : 'No hardware accelerometer detected in this browser. Simulator and inactivity watchdogs remain ready.',
        voiceSpeed
      );
    }
    setInactivityRemaining(patientProfile.inactivitySeconds);
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        moduleId="fall"
        title="Emergency Fall & Inactivity Guardian"
        subtitle="09 · Personal Safety, Seizure Impact & Background APK Monitor"
        onBack={() => {
          stopSpeech();
          onBack();
        }}
        actionSlot={
          <div className="flex flex-wrap gap-2">
            {onOpenSafetyMap && (
              <button
                type="button"
                onClick={onOpenSafetyMap}
                className="surface-elevated min-h-[56px] px-4 rounded-xl font-bold flex items-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <MapPin className="w-5 h-5" aria-hidden="true" />
                <span>Nearby Care Map</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => triggerCountdown('Simulated Fall Impact (3.4G)', 3.4)}
              className="min-h-[56px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <ShieldAlert className="w-5 h-5" aria-hidden="true" />
              <span>Simulate Fall</span>
            </button>
          </div>
        }
      />

      {guardianState === 'countdown' && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="rounded-3xl bg-red-600 text-white border-4 border-yellow-300 p-6 sm:p-10 text-center space-y-6 shadow-2xl"
        >
          <p className="text-lg font-extrabold uppercase tracking-wider text-yellow-200">
            {triggerReason}
          </p>
          <p className="font-mono-nums text-7xl sm:text-8xl font-extrabold leading-none">
            {countdown}s
          </p>
          <p className="text-xl font-bold max-w-xl mx-auto">
            Sending Emergency SOS for <strong>{patientProfile.fullName}</strong> to{' '}
            <strong>{patientProfile.caregiverName}</strong> unless canceled.
          </p>
          <button
            type="button"
            onClick={cancelToSafe}
            className="w-full max-w-xl mx-auto min-h-[92px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display text-2xl sm:text-3xl font-extrabold flex items-center justify-center gap-3 shadow-xl cursor-pointer transition-transform active:scale-[0.98]"
          >
            <CheckCircle2 className="w-9 h-9" aria-hidden="true" />
            <span>I AM OKAY — CANCEL</span>
          </button>
        </div>
      )}

      {guardianState === 'sos' && (
        <div
          role="alert"
          className="rounded-3xl bg-red-700 text-white border-4 border-yellow-300 p-6 sm:p-8 space-y-6 shadow-2xl"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <PhoneCall className="w-10 h-10 text-yellow-300 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-yellow-200 uppercase">
                  Emergency Protocol Active
                </p>
                <h2 className="font-display text-3xl sm:text-4xl font-extrabold">
                  SOS Dispatched for {patientProfile.fullName}
                </h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {onOpenSafetyMap && (
                <button
                  type="button"
                  onClick={onOpenSafetyMap}
                  className="min-h-[60px] px-5 rounded-xl bg-yellow-300 text-slate-950 font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <MapPin className="w-5 h-5" aria-hidden="true" />
                  <span>Open Care Map</span>
                </button>
              )}
              <button
                type="button"
                onClick={cancelToSafe}
                className="min-h-[60px] px-6 rounded-xl bg-white text-slate-950 font-extrabold flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-5 h-5" aria-hidden="true" />
                <span>Reset Guardian</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-black/35 p-5 space-y-2">
              <div className="flex items-center gap-2 text-yellow-300 font-bold">
                <MapPin className="w-5 h-5" aria-hidden="true" />
                <span>Transmitted GPS &amp; Medical ID</span>
              </div>
              <p className="font-mono-nums text-2xl font-extrabold">
                {liveLocation.lat.toFixed(4)}°, {liveLocation.lng.toFixed(4)}°
              </p>
              <p className="text-sm font-bold">
                Patient: {patientProfile.fullName} (Age {patientProfile.age || 'N/A'} · Blood{' '}
                {patientProfile.bloodType || 'N/A'})
              </p>
              <p className="text-sm opacity-90">{patientProfile.allergiesAndNotes}</p>
            </div>

            <div className="rounded-2xl bg-black/35 p-5 space-y-3">
              <p className="text-yellow-300 font-bold">Caregiver Phone &amp; Email Dispatch</p>
              <ul className="space-y-1.5 text-sm font-bold">
                <li>
                  1. Phone Contact → {patientProfile.caregiverName} ({patientProfile.caregiverPhone})
                </li>
                <li>
                  2. Alert Email → {patientProfile.alertEmail || 'Not configured yet (add in Home/Settings)'}
                </li>
                <li>
                  3. Remote Code Updated → {patientProfile.remoteAccessCode} ({notifyLinks?.webhookDelivered ? 'Webhook relayed' : 'Ready for Email/SMS'})
                </li>
              </ul>
              <div className="flex flex-wrap gap-2 pt-1">
                {notifyLinks?.telUrl && (
                  <a
                    href={notifyLinks.telUrl}
                    className="min-h-[48px] px-4 rounded-xl bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5"
                  >
                    <PhoneCall className="w-4 h-4" aria-hidden="true" />
                    <span>Dial Caregiver Now</span>
                  </a>
                )}
                {notifyLinks?.smsUrl && (
                  <a
                    href={notifyLinks.smsUrl}
                    className="min-h-[48px] px-4 rounded-xl bg-yellow-300 text-slate-950 font-extrabold text-xs flex items-center gap-1.5"
                  >
                    Send SMS Alert
                  </a>
                )}
                {notifyLinks?.mailtoUrl && (
                  <a
                    href={notifyLinks.mailtoUrl}
                    className="min-h-[48px] px-4 rounded-xl bg-white text-slate-950 font-extrabold text-xs flex items-center gap-1.5"
                  >
                    Send Email Alert
                  </a>
                )}
                {notifyLinks?.bodyText && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(notifyLinks.bodyText).catch(() => {});
                      setCopiedAlert(true);
                      setTimeout(() => setCopiedAlert(false), 2000);
                    }}
                    className="min-h-[48px] px-4 rounded-xl bg-black/50 border border-white/30 text-white font-extrabold text-xs cursor-pointer"
                  >
                    {copiedAlert ? 'GPS Alert Copied!' : 'Copy GPS Alert Text'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Always-On Background & APK Readiness Panel */}
      <div className="surface-card rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" aria-hidden="true" />
            <h2 className="font-display text-lg sm:text-xl font-bold">
              Always-On Background &amp; APK G-Force Service
            </h2>
          </div>
          <p className="text-sm text-muted">
            {isNativeApkEnvironment()
              ? 'Native Android APK Foreground Service active — monitors accelerometer even when closed.'
              : 'PWA Wake Lock + Service Worker Notifications armed across all modules; Android APK Foreground Service config synced automatically.'}
          </p>
          <p className="text-xs font-bold text-muted">
            Wake Lock: {wakeLockActive ? 'Held' : 'Standby'} · Background Notifications:{' '}
            {notificationsReady ? 'Granted' : 'Tap to Enable'} · Impact Threshold:{' '}
            {patientProfile.fallGThreshold.toFixed(1)}G
          </p>
        </div>

        <div className="flex flex-wrap gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onToggleBackgroundGuardian(!patientProfile.backgroundGuardianEnabled)}
            className={`min-h-[56px] px-5 rounded-xl font-extrabold cursor-pointer ${
              patientProfile.backgroundGuardianEnabled ? 'btn-accent' : 'surface-elevated'
            }`}
          >
            {patientProfile.backgroundGuardianEnabled
              ? 'Background Guard: ARMED'
              : 'Arm Background Guard'}
          </button>

          <button
            type="button"
            onClick={async () => {
              const granted = await requestGuardianNotificationPermission();
              setNotificationsReady(granted);
              if (granted) {
                dispatchBackgroundSosNotification(
                  'AbleBridge Background Monitor Ready',
                  `Fall alerts for ${patientProfile.fullName} will appear even when minimized.`
                );
              }
            }}
            className="surface-elevated min-h-[56px] px-4 rounded-xl font-bold flex items-center gap-2 cursor-pointer"
          >
            <BellRing className="w-5 h-5" aria-hidden="true" />
            <span>{notificationsReady ? 'Alerts Ready' : 'Enable Background Alerts'}</span>
          </button>
        </div>
      </div>

      {/* Monitoring Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 surface-card rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5" aria-hidden="true" />
              <h2 className="font-display text-xl font-bold">Live G-Force Accelerometer</h2>
            </div>
            <div className="flex gap-4 font-mono-nums text-base font-extrabold">
              <span>Current: {currentG.toFixed(2)}G</span>
              <span>Peak: {peakG.toFixed(2)}G</span>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            width={620}
            height={220}
            className="w-full rounded-xl border-2 border-theme bg-slate-950"
            aria-label="Live accelerometer G-force waveform"
          />

          <div className="surface-elevated rounded-xl px-3.5 py-2.5 text-xs font-bold flex flex-wrap items-center justify-between gap-2">
            <span>
              Sensor:{' '}
              {sensorAvailable
                ? `Hardware Live (${sampleCount} samples)`
                : motionPermission === 'prompt_required'
                  ? 'Tap Enable Motion Sensor (iOS Safari)'
                  : motionPermission === 'denied'
                    ? 'Permission Denied (Simulator Mode)'
                    : 'Waiting for Hardware / Rest Baseline'}
            </span>
            <span className="font-mono-nums text-muted">
              {axisReadout
                ? `X:${axisReadout.x} Y:${axisReadout.y} Z:${axisReadout.z} m/s²`
                : '2-Stage: Free-Fall (<0.48G) + Impact'}
            </span>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold">Trigger Threshold ({patientProfile.fallGThreshold}G)</p>
            <div className="grid grid-cols-3 gap-2">
              {[1.8, 2.6, 3.2].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => onUpdateSafetyThresholds({fallGThreshold: g})}
                  className={`min-h-[48px] rounded-xl font-mono-nums font-bold cursor-pointer ${
                    patientProfile.fallGThreshold === g ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  {g}G {g === 1.8 ? '(High)' : g === 2.6 ? '(Std)' : '(Sport)'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={requestMotionPermissionIfIOS}
              className="surface-elevated min-h-[56px] px-5 rounded-xl font-bold cursor-pointer"
            >
              {motionPermission === 'prompt_required'
                ? 'Enable iOS Motion Sensor'
                : sensorAvailable
                  ? 'Hardware Motion Active (Reset Timer)'
                  : 'Check / Calibrate G-Sensor'}
            </button>
            <button
              type="button"
              onClick={() => triggerCountdown('Simulated Fall Impact (3.4G)', 3.4)}
              className="btn-accent min-h-[56px] px-5 rounded-xl font-extrabold cursor-pointer"
            >
              Demo / Simulate Fall
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 surface-card rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Timer className="w-5 h-5" aria-hidden="true" />
            <h2 className="font-display text-xl font-bold">Inactivity Watchdog</h2>
          </div>
          <p className="text-sm text-muted">
            If no movement occurs before the timer reaches zero, the 15-second SOS countdown starts
            automatically.
          </p>
          <div className="surface-elevated rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-muted">Time Until Check-In</p>
              <p className="font-mono-nums text-4xl font-extrabold">{inactivityRemaining}s</p>
            </div>
            <button
              type="button"
              onClick={() => setInactivityRemaining(patientProfile.inactivitySeconds)}
              className="btn-accent min-h-[56px] px-4 rounded-xl font-bold cursor-pointer"
            >
              I’m Active
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold">Inactivity Window</p>
            <div className="grid grid-cols-3 gap-2">
              {[30, 60, 300].map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => {
                    onUpdateSafetyThresholds({inactivitySeconds: sec});
                    setInactivityRemaining(sec);
                  }}
                  className={`min-h-[52px] rounded-xl font-mono-nums font-bold cursor-pointer ${
                    patientProfile.inactivitySeconds === sec ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  {sec < 60 ? `${sec}s` : `${sec / 60}m`}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => triggerCountdown('Simulated Inactivity Timeout')}
            className="surface-elevated w-full min-h-[56px] rounded-xl font-bold cursor-pointer"
          >
            Simulate Inactivity Timeout
          </button>
        </div>
      </div>
    </section>
  );
};
