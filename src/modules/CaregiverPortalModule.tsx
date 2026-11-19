import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AdvancedMarker,
  APILoadingStatus,
  APIProvider,
  Map as GoogleMap,
  Pin,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  Activity,
  Award,
  Baby,
  CheckCircle2,
  Compass,
  Copy,
  Delete,
  Lock,
  Mail,
  MapPin,
  PhoneCall,
  Radio,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {ProfileAvatar} from '../components/ProfileAvatar';
import {DEMO_COORDS, useFirebase} from '../contexts/FirebaseContext';
import {PatientProfile, RemoteTelemetrySnapshot} from '../types';
import {stopSpeech, triggerVibration} from '../utils/multimodal';
import {generateRemoteAccessCode, isValidRemoteCodeFormat} from '../utils/patientProfile';

interface CaregiverPortalModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  patientProfile: PatientProfile;
  caregiverPin: string;
  onUpdateProfile: (patch: Partial<PatientProfile>) => void;
  onTriggerCaregiverCall: (reason?: string) => void;
}

const PortalLiveMapCanvas: React.FC<{
  lat: number;
  lng: number;
  label: string;
  isSosActive: boolean;
}> = ({lat, lng, label, isSosActive}) => {
  const map = useMap();
  const status = useApiLoadingStatus();

  useEffect(() => {
    if (
      status === APILoadingStatus.AUTH_FAILURE ||
      status === APILoadingStatus.FAILED
    ) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [status]);

  useEffect(() => {
    map?.panTo({lat, lng});
  }, [lat, lng, map]);

  return (
    <GoogleMap
      defaultCenter={{lat, lng}}
      defaultZoom={14}
      mapId="DEMO_MAP_ID"
      gestureHandling="greedy"
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      style={{width: '100%', height: '100%'}}
    >
      <AdvancedMarker position={{lat, lng}} title={label}>
        <Pin
          background={isSosActive ? '#dc2626' : '#0ea5e9'}
          borderColor={isSosActive ? '#7f1d1d' : '#0369a1'}
          glyphColor="#ffffff"
          scale={1.25}
        />
      </AdvancedMarker>
    </GoogleMap>
  );
};

export const CaregiverPortalModule: React.FC<CaregiverPortalModuleProps> = ({
  onBack,
  patientProfile,
  caregiverPin,
  onUpdateProfile,
  onTriggerCaregiverCall,
}) => {
  const {
    isOfflineMode,
    stressLogs,
    sosEvents,
    liveLocation,
    setLiveLocationState,
    publishRemoteTelemetry,
    subscribeToRemoteCode,
  } = useFirebase();

  const [portalMode, setPortalMode] = useState<'local_patient' | 'remote_code'>('local_patient');
  const [unlocked, setUnlocked] = useState<boolean>(false);
  const [pinEntry, setPinEntry] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [gpsWatchActive, setGpsWatchActive] = useState(false);
  const gpsWatchIdRef = useRef<number | null>(null);

  const [remoteInputCode, setRemoteInputCode] = useState(patientProfile.remoteAccessCode);
  const [remoteSnapshot, setRemoteSnapshot] = useState<RemoteTelemetrySnapshot | null>(null);
  const [remoteSource, setRemoteSource] = useState<'cloud' | 'local' | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const remoteUnsubRef = useRef<(() => void) | null>(null);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
      remoteUnsubRef.current?.();
    };
  }, []);

  const handlePinDigit = (digit: string) => {
    if (pinEntry.length >= 4) return;
    const next = pinEntry + digit;
    setPinEntry(next);
    setPinError(null);
    triggerVibration(30);
    if (next.length === 4) {
      if (next === caregiverPin) {
        setUnlocked(true);
        setPinEntry('');
        triggerVibration([60, 40, 60]);
      } else {
        setPinError('Incorrect Caregiver PIN.');
        triggerVibration([140, 50, 140]);
        setTimeout(() => setPinEntry(''), 420);
      }
    }
  };

  const toggleLiveGpsBroadcast = useCallback(() => {
    if (!navigator.geolocation) {
      setRemoteError('Browser geolocation is not supported on this device.');
      return;
    }

    if (gpsWatchActive) {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
      setGpsWatchActive(false);
      setLiveLocationState(DEMO_COORDS, false);
      publishRemoteTelemetry(patientProfile, 'monitoring', {
        lat: DEMO_COORDS.lat,
        lng: DEMO_COORDS.lng,
        gpsConsentActive: false,
        updatedAtIso: new Date().toISOString(),
      }).catch(() => {});
      return;
    }

    setRemoteError(null);
    setGpsWatchActive(true);
    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const nextLoc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          gpsConsentActive: true,
          updatedAtIso: new Date().toISOString(),
        };
        setLiveLocationState({lat: nextLoc.lat, lng: nextLoc.lng}, true);
        publishRemoteTelemetry(patientProfile, 'monitoring', nextLoc).catch(() => {});
      },
      () => {
        setGpsWatchActive(false);
        setRemoteError(
          'Live GPS permission was denied or unavailable. Demo location anchor remains active.'
        );
      },
      {enableHighAccuracy: true, timeout: 10000, maximumAge: 5000}
    );
  }, [gpsWatchActive, patientProfile, publishRemoteTelemetry, setLiveLocationState]);

  const handleConnectRemoteCode = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = remoteInputCode.trim().toUpperCase();
    setRemoteInputCode(cleaned);
    setRemoteError(null);
    remoteUnsubRef.current?.();

    if (!isValidRemoteCodeFormat(cleaned)) {
      setRemoteSnapshot(null);
      setRemoteError('Access code must be 8 characters (A-Z, 0-9).');
      return;
    }

    // Also ensure local telemetry mirror is freshly published if checking own code
    if (cleaned === patientProfile.remoteAccessCode) {
      publishRemoteTelemetry(patientProfile, 'monitoring').catch(() => {});
    }

    remoteUnsubRef.current = subscribeToRemoteCode(cleaned, (snap, src, errMsg) => {
      setRemoteSnapshot(snap);
      setRemoteSource(src);
      setRemoteError(errMsg || null);
    });
    triggerVibration(50);
  };

  const stressStats = useMemo(() => {
    if (stressLogs.length === 0) return {latest: 0, avg: 0, peak: 0};
    const recent = stressLogs.slice(0, 12);
    const sum = recent.reduce((acc, s) => acc + s.stressScore, 0);
    return {
      latest: recent[0].stressScore,
      avg: Number((sum / recent.length).toFixed(1)),
      peak: Math.max(...recent.map((s) => s.stressScore)),
    };
  }, [stressLogs]);

  const chartPoints = useMemo(() => {
    const ordered = [...stressLogs].slice(0, 12).reverse();
    if (ordered.length === 0) return [];
    const w = 520;
    const h = 140;
    const padX = 24;
    const padY = 18;
    const uw = w - padX * 2;
    const uh = h - padY * 2;
    return ordered.map((item, idx) => ({
      id: item.id,
      score: item.stressScore,
      x: ordered.length === 1 ? w / 2 : padX + (idx / (ordered.length - 1)) * uw,
      y: padY + uh - ((item.stressScore - 1) / 9) * uh,
    }));
  }, [stressLogs]);

  const activeMapCoords =
    portalMode === 'remote_code' && remoteSnapshot
      ? {lat: remoteSnapshot.lat, lng: remoteSnapshot.lng}
      : {lat: liveLocation.lat, lng: liveLocation.lng};

  const activeMapLabel =
    portalMode === 'remote_code' && remoteSnapshot
      ? `Remote Patient: ${remoteSnapshot.patientAlias} (${remoteSnapshot.accessCode})`
      : `${patientProfile.fullName || 'Patient'} (${liveLocation.gpsConsentActive ? 'Live GPS' : 'Demo Anchor'})`;

  const isSosMapAlert =
    portalMode === 'remote_code' && remoteSnapshot?.latestSosStatus === 'dispatched';

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        title="Caregiver Data & Live Monitor Portal"
        subtitle="Dedicated Caregiver View · Accident-Free Streak, Patient Wellness, GPS & Remote Access"
        onBack={() => {
          stopSpeech();
          onBack();
        }}
        actionSlot={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPortalMode('local_patient')}
              className={`min-h-[52px] px-4 rounded-xl text-sm font-extrabold cursor-pointer ${
                portalMode === 'local_patient' ? 'btn-accent' : 'surface-elevated'
              }`}
            >
              Patient Dashboard View
            </button>
            <button
              type="button"
              onClick={() => setPortalMode('remote_code')}
              className={`min-h-[52px] px-4 rounded-xl text-sm font-extrabold flex items-center gap-2 cursor-pointer ${
                portalMode === 'remote_code' ? 'btn-accent' : 'surface-elevated'
              }`}
            >
              <Radio className="w-4 h-4" aria-hidden="true" />
              <span>Track via Remote Code</span>
            </button>
          </div>
        }
      />

      {/* PIN Gate protects Patient Medical View & Child Mode toggle */}
      {portalMode === 'local_patient' && !unlocked ? (
        <div className="surface-card rounded-3xl p-6 sm:p-10 max-w-lg mx-auto text-center space-y-5">
          <div className="surface-elevated w-14 h-14 rounded-2xl flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-extrabold">Caregiver Portal PIN Lock</h2>
            <p className="text-sm text-muted">
              Enter your 4-digit Caregiver PIN to view medical logs or toggle Child Mode, or switch
              to <strong>Track via Remote Code</strong> above.
            </p>
          </div>
          <div className="flex justify-center gap-3">
            {[0, 1, 2, 3].map((slot) => (
              <div
                key={slot}
                className={`w-12 h-12 rounded-xl border-2 border-theme flex items-center justify-center font-mono-nums text-2xl font-extrabold ${
                  pinEntry.length > slot ? 'btn-accent' : 'surface-elevated'
                }`}
              >
                {pinEntry.length > slot ? '•' : ''}
              </div>
            ))}
          </div>
          {pinError && (
            <p role="alert" className="text-sm font-bold text-red-500">
              {pinError}
            </p>
          )}
          <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handlePinDigit(d)}
                className="surface-elevated min-h-[58px] rounded-xl font-mono-nums text-xl font-extrabold cursor-pointer"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPinEntry('')}
              className="surface-elevated min-h-[58px] rounded-xl text-xs font-bold cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handlePinDigit('0')}
              className="surface-elevated min-h-[58px] rounded-xl font-mono-nums text-xl font-extrabold cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPinEntry((p) => p.slice(0, -1))}
              className="surface-elevated min-h-[58px] rounded-xl flex items-center justify-center cursor-pointer"
              aria-label="Backspace digit"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Remote Code Mode Controls */}
          {portalMode === 'remote_code' && (
            <div className="surface-card rounded-3xl p-5 sm:p-6 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-extrabold">
                    Remote Access Caregiver Link
                  </h2>
                  <p className="text-sm text-muted">
                    Enter a patient’s 8-character Remote Access Code to view their live GPS location,
                    accident-free streak, stress score, and SOS alert status.
                  </p>
                </div>
                <form onSubmit={handleConnectRemoteCode} className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    maxLength={8}
                    value={remoteInputCode}
                    onChange={(e) => setRemoteInputCode(e.target.value.toUpperCase())}
                    placeholder="8-CHAR CODE"
                    aria-label="8-character remote access code"
                    className="surface-elevated min-h-[56px] w-44 rounded-xl px-4 font-mono-nums text-lg font-extrabold tracking-widest uppercase"
                  />
                  <button
                    type="submit"
                    className="btn-accent min-h-[56px] px-5 rounded-xl font-extrabold cursor-pointer"
                  >
                    Connect Live
                  </button>
                </form>
              </div>

              {remoteError && (
                <p role="alert" className="text-sm font-bold text-[#ff5500]">
                  {remoteError}
                </p>
              )}

              {remoteSnapshot && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  <div className="surface-elevated rounded-2xl p-4">
                    <p className="text-xs font-bold text-muted uppercase">Linked Patient</p>
                    <p className="font-display text-xl font-extrabold mt-1">
                      {remoteSnapshot.patientAlias}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      Source: {remoteSource === 'cloud' ? 'Cloud Firestore' : 'Local Mirror'}
                    </p>
                  </div>
                  <div className="surface-elevated rounded-2xl p-4">
                    <p className="text-xs font-bold text-muted uppercase">Accident-Free</p>
                    <p className="font-mono-nums text-2xl font-extrabold mt-1">
                      {remoteSnapshot.accidentFreeDays} days
                    </p>
                  </div>
                  <div className="surface-elevated rounded-2xl p-4">
                    <p className="text-xs font-bold text-muted uppercase">Latest Stress</p>
                    <p className="font-mono-nums text-2xl font-extrabold mt-1">
                      {remoteSnapshot.latestStressScore}/10
                    </p>
                    <p className="text-xs text-muted uppercase">{remoteSnapshot.latestMood}</p>
                  </div>
                  <div className="surface-elevated rounded-2xl p-4">
                    <p className="text-xs font-bold text-muted uppercase">SOS Status</p>
                    <p
                      className={`font-display text-xl font-extrabold uppercase mt-1 ${
                        remoteSnapshot.latestSosStatus === 'dispatched'
                          ? 'text-red-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {remoteSnapshot.latestSosStatus}
                    </p>
                    <p className="font-mono-nums text-xs text-muted">
                      Updated {new Date(remoteSnapshot.updatedAtIso).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Patient Summary Banner (Local Caregiver View) */}
          {portalMode === 'local_patient' && (
            <div className="surface-card rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="flex items-start sm:items-center gap-4">
                <ProfileAvatar
                  avatarDataUrl={patientProfile.avatarDataUrl}
                  fullName={patientProfile.fullName || 'Patient'}
                  size="lg"
                />
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-2xl font-extrabold">
                      {patientProfile.fullName || 'Patient'}
                    </h2>
                    {patientProfile.adultCaregiverConfirmed && (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                        <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                        Adult Caregiver Verified
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted">
                    Age {patientProfile.age || 'N/A'} · Blood {patientProfile.bloodType || 'N/A'} ·
                    Conditions: {patientProfile.disabilities.length} configured
                  </p>
                  <p className="text-xs text-muted flex flex-wrap items-center gap-3">
                    <span>
                      <Mail className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />
                      {patientProfile.alertEmail || 'No alert email saved'}
                    </span>
                    <span className="font-mono-nums">
                      <PhoneCall className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />
                      {patientProfile.caregiverPhone}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProfile({childFriendlyMode: !patientProfile.childFriendlyMode})
                  }
                  className={`min-h-[52px] px-4 rounded-xl text-sm font-extrabold flex items-center gap-2 cursor-pointer ${
                    patientProfile.childFriendlyMode ? 'btn-accent' : 'surface-elevated'
                  }`}
                >
                  <Baby className="w-4 h-4" aria-hidden="true" />
                  <span>Child Mode (PIN Unlocked): {patientProfile.childFriendlyMode ? 'ON' : 'OFF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setUnlocked(false)}
                  className="surface-elevated min-h-[52px] px-4 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer"
                >
                  <Lock className="w-4 h-4" aria-hidden="true" />
                  <span>Lock Portal</span>
                </button>
                <button
                  type="button"
                  onClick={() => onTriggerCaregiverCall('Caregiver Portal Urgent Check-In')}
                  className="min-h-[52px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-extrabold flex items-center gap-2 cursor-pointer"
                >
                  <PhoneCall className="w-4 h-4" aria-hidden="true" />
                  <span>Call &amp; Notify</span>
                </button>
              </div>
            </div>
          )}

          {/* KPI Metric Strip (Tabular Numerals) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="surface-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                  Accident-Free Streak
                </p>
                <Award className="w-5 h-5 text-[#ff5500]" aria-hidden="true" />
              </div>
              <p className="font-mono-nums text-4xl font-extrabold">
                {patientProfile.accidentFreeDays} Days
              </p>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted font-medium">
                  Auto-increments every day at midnight unless SOS triggers.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProfile({
                      accidentFreeDays: 0,
                      streakLastResetIso: new Date().toISOString(),
                    })
                  }
                  className="surface-elevated min-h-[44px] px-3 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  Reset
                </button>
              </div>
            </div>

            <div className="surface-card rounded-2xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                  Remote Access Pair Code
                </p>
                <Radio className="w-5 h-5" aria-hidden="true" />
              </div>
              <p className="font-mono-nums text-3xl font-extrabold tracking-widest">
                {patientProfile.remoteAccessCode}
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(patientProfile.remoteAccessCode).catch(() => {});
                    publishRemoteTelemetry(patientProfile, 'monitoring').catch(() => {});
                    setCodeCopied(true);
                    setTimeout(() => setCodeCopied(false), 2000);
                  }}
                  className="surface-elevated flex-1 min-h-[44px] px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{codeCopied ? 'Synced & Copied!' : 'Sync & Copy'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateProfile({remoteAccessCode: generateRemoteAccessCode()})}
                  className="surface-elevated min-h-[44px] px-3 rounded-xl text-xs font-bold cursor-pointer flex items-center gap-1"
                  title="Generate new remote code"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="surface-card rounded-2xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                  Patient Mental Stress
                </p>
                <Activity className="w-5 h-5" aria-hidden="true" />
              </div>
              <p className="font-mono-nums text-4xl font-extrabold">
                {stressStats.latest ? `${stressStats.latest}/10` : '—'}
              </p>
              <p className="text-xs text-muted font-mono-nums">
                Avg {stressStats.avg || '—'} · Peak {stressStats.peak || '—'} · {stressLogs.length}{' '}
                entries
              </p>
            </div>

            <div className="surface-card rounded-2xl p-5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                  Guardian &amp; SOS Log
                </p>
                <ShieldAlert className="w-5 h-5" aria-hidden="true" />
              </div>
              <p className="font-display text-2xl font-extrabold">
                {patientProfile.backgroundGuardianEnabled ? 'ARMED' : 'STANDBY'}
              </p>
              <p className="text-xs text-muted font-mono-nums">
                {patientProfile.fallGThreshold}G limit · {sosEvents.length} recorded SOS events
              </p>
            </div>
          </div>

          {/* Live Patient Location Map & Sync Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 surface-card rounded-3xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5" aria-hidden="true" />
                    <h3 className="font-display text-xl font-extrabold">
                      {portalMode === 'remote_code'
                        ? 'Remote Patient Live GPS Map'
                        : 'Patient Real-Time GPS & Care Telemetry'}
                    </h3>
                  </div>
                  <p className="font-mono-nums text-xs text-muted mt-0.5">
                    {activeMapCoords.lat.toFixed(5)}°, {activeMapCoords.lng.toFixed(5)}° ·{' '}
                    {activeMapLabel}
                  </p>
                </div>

                {portalMode === 'local_patient' && (
                  <button
                    type="button"
                    onClick={toggleLiveGpsBroadcast}
                    className={`min-h-[52px] px-4 rounded-xl text-sm font-extrabold flex items-center gap-2 cursor-pointer ${
                      gpsWatchActive ? 'btn-accent' : 'surface-elevated'
                    }`}
                  >
                    <Compass className="w-4 h-4" aria-hidden="true" />
                    <span>{gpsWatchActive ? 'Broadcasting Live GPS' : 'Start Live GPS Share'}</span>
                  </button>
                )}
              </div>

              <div className="w-full h-[320px] sm:h-[360px] rounded-2xl overflow-hidden border-2 border-theme">
                {isOfflineMode || !apiKey ? (
                  <div className="h-full surface-elevated flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <WifiOff className="w-10 h-10 text-[#ff5500]" aria-hidden="true" />
                    <h4 className="font-display text-lg font-extrabold">
                      {isOfflineMode ? 'Offline GPS Coordinate Mode' : 'Maps Key Not Loaded'}
                    </h4>
                    <p className="text-sm text-muted max-w-md">
                      {isOfflineMode
                        ? 'Online map tiles are paused in Offline Mode. Device GPS coordinates continue updating locally on this screen.'
                        : 'Google Maps API key unavailable in runtime. GPS coordinates are still tracked locally.'}
                    </p>
                    <p className="font-mono-nums text-xl font-extrabold">
                      {activeMapCoords.lat.toFixed(5)}°, {activeMapCoords.lng.toFixed(5)}°
                    </p>
                    <p className="text-xs font-bold text-muted">{activeMapLabel}</p>
                  </div>
                ) : (
                  <APIProvider apiKey={apiKey} libraries={['marker']}>
                    <PortalLiveMapCanvas
                      lat={activeMapCoords.lat}
                      lng={activeMapCoords.lng}
                      label={activeMapLabel}
                      isSosActive={isSosMapAlert}
                    />
                  </APIProvider>
                )}
              </div>
            </div>

            {/* Stress Trend + Recent Patient Activity */}
            <div className="lg:col-span-5 space-y-5">
              <div className="surface-card rounded-3xl p-5 space-y-3">
                <h3 className="font-display text-lg font-extrabold">
                  Patient Mental Stress Trend
                </h3>
                {chartPoints.length === 0 ? (
                  <p className="text-sm text-muted py-6 text-center">
                    No stress logs yet. Logs saved in Stress Tracker appear here automatically.
                  </p>
                ) : (
                  <svg viewBox="0 0 520 140" className="w-full h-[140px]">
                    <line
                      x1="20"
                      y1="18"
                      x2="500"
                      y2="18"
                      stroke="rgba(239,68,68,0.35)"
                      strokeDasharray="4 4"
                    />
                    <line
                      x1="20"
                      y1="70"
                      x2="500"
                      y2="70"
                      stroke="rgba(148,163,184,0.25)"
                      strokeDasharray="4 4"
                    />
                    <line
                      x1="20"
                      y1="122"
                      x2="500"
                      y2="122"
                      stroke="rgba(34,197,94,0.35)"
                      strokeDasharray="4 4"
                    />
                    {chartPoints.length > 1 && (
                      <polyline
                        fill="none"
                        stroke="#38BDF8"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={chartPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                      />
                    )}
                    {chartPoints.map((p) => (
                      <circle
                        key={p.id}
                        cx={p.x}
                        cy={p.y}
                        r="5.5"
                        fill={p.score >= 8 ? '#EF4444' : p.score >= 5 ? '#F59E0B' : '#22C55E'}
                      />
                    ))}
                  </svg>
                )}
              </div>

              <div className="surface-card rounded-3xl p-5 space-y-3">
                <h3 className="font-display text-lg font-extrabold">Recent Fall &amp; SOS Events</h3>
                {sosEvents.length === 0 ? (
                  <div className="surface-elevated rounded-xl p-4 text-sm text-muted flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" aria-hidden="true" />
                    <span>Zero SOS emergencies logged — streak remains intact.</span>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {sosEvents.slice(0, 8).map((ev) => (
                      <div
                        key={ev.id}
                        className="surface-elevated rounded-xl p-3 flex items-center justify-between gap-3"
                      >
                        <div>
                          <p className="font-bold text-sm">{ev.reason}</p>
                          <p className="font-mono-nums text-xs text-muted">
                            Peak {ev.peakG.toFixed(1)}G ·{' '}
                            {new Date(ev.createdAtIso).toLocaleTimeString()}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-extrabold uppercase px-2.5 py-1 rounded-lg ${
                            ev.status === 'dispatched'
                              ? 'bg-red-600 text-white'
                              : ev.status === 'canceled'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-[#ff5500] text-[#03050a]'
                          }`}
                        >
                          {ev.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
