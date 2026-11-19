import React, {useState} from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Baby,
  CheckCircle2,
  ClipboardCheck,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {useFirebase} from '../contexts/FirebaseContext';
import {PatientProfile} from '../types';
import {PRESET_AVATARS, ProfileAvatar, resizeImageFileToDataUrl} from './ProfileAvatar';
import {triggerVibration} from '../utils/multimodal';

interface HomeAuthScreenProps {
  patientProfile: PatientProfile;
  onUpdateProfile: (patch: Partial<PatientProfile>) => void;
  onEnterDashboard: () => void;
  onOpenCaregiverPortal: () => void;
  onResetAccount?: () => void;
}

export const HomeAuthScreen: React.FC<HomeAuthScreenProps> = ({
  patientProfile,
  onUpdateProfile,
  onEnterDashboard,
  onOpenCaregiverPortal,
  onResetAccount,
}) => {
  const {
    user,
    browserOnline,
    manualOfflineMode,
    setManualOfflineMode,
    isOfflineMode,
    isSigningIn,
    authError,
    clearAuthError,
    emailVerificationPending,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resendVerificationEmail,
    refreshVerificationStatus,
    signOutUser,
    deleteAccountAndData,
  } = useFirebase();

  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState(patientProfile.alertEmail || '');
  const [password, setPassword] = useState('');
  const [patientName, setPatientName] = useState(patientProfile.fullName || 'Alex Rivera');
  const [patientAge, setPatientAge] = useState(patientProfile.age || '28');
  const [caregiverName, setCaregiverName] = useState(
    patientProfile.caregiverName || 'Maria Rivera'
  );
  const [caregiverPhone, setCaregiverPhone] = useState(
    patientProfile.caregiverPhone || '+1 (555) 019-4820'
  );
  const [avatarPreview, setAvatarPreview] = useState<string>(patientProfile.avatarDataUrl || '');
  const [childMode, setChildMode] = useState<boolean>(patientProfile.childFriendlyMode);
  const [adultConfirmed, setAdultConfirmed] = useState<boolean>(
    patientProfile.adultCaregiverConfirmed
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    try {
      const compressed = await resizeImageFileToDataUrl(file);
      setAvatarPreview(compressed);
      onUpdateProfile({avatarDataUrl: compressed});
      triggerVibration(40);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to process image.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setStatusNotice(null);
    clearAuthError();

    if (!email.trim() || !email.includes('@')) {
      setFormError('Please enter a valid caregiver email address.');
      return;
    }
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    if (mode === 'signup') {
      if (!adultConfirmed) {
        setFormError(
          'Required: Please check the Adult Caregiver (18+) & Terms confirmation box before creating an account.'
        );
        triggerVibration([120, 60, 120]);
        return;
      }

      onUpdateProfile({
        fullName: patientName.trim() || 'Patient',
        age: patientAge.trim(),
        caregiverName: caregiverName.trim() || 'Caregiver',
        caregiverPhone: caregiverPhone.trim(),
        alertEmail: email.trim(),
        avatarDataUrl: avatarPreview,
        childFriendlyMode: childMode,
        adultCaregiverConfirmed: true,
        termsAcceptedAtIso: new Date().toISOString(),
      });

      const ok = await signUpWithEmail({
        email: email.trim(),
        password,
        caregiverName: caregiverName.trim() || 'Caregiver',
        patientName: patientName.trim() || 'Patient',
        caregiverPhone: caregiverPhone.trim(),
        alertEmail: email.trim(),
      });
      if (ok) {
        triggerVibration([60, 40, 80]);
        setStatusNotice(
          'Account created! Verification email sent — check your inbox to enable live cloud sync, or enter the toolkit now.'
        );
      }
    } else {
      onUpdateProfile({
        alertEmail: email.trim(),
      });
      const ok = await signInWithEmail(email.trim(), password);
      if (ok) {
        triggerVibration([60, 40, 80]);
        onEnterDashboard();
      }
    }
  };

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6"
      aria-label="AbleBridge Home and Account Setup"
    >
      {/* Hero Exhibition & Instant Launch Card */}
      <div className="surface-card rounded-3xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-2xl">
        <div className="space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-muted">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            <span>AbleBridge · Caregiver &amp; Assistive Home</span>
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-balance">
            Empowering independence with caregiver safety.
          </h1>
          <p className="text-base text-muted leading-relaxed">
            Sign in with Caregiver Email so emergency SOS alerts dispatch to your registered email
            and phone number, manage remote GPS tracking codes, or enter the toolkit right away.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerVibration(50);
              onEnterDashboard();
            }}
            className="btn-accent min-h-[60px] px-6 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 cursor-pointer shadow-lg"
          >
            <span>Enter Toolkit Immediately</span>
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => {
              triggerVibration(50);
              onOpenCaregiverPortal();
            }}
            className="surface-elevated min-h-[56px] px-6 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <UserCheck className="w-5 h-5" aria-hidden="true" />
            <span>Caregiver Data Portal &amp; Remote Track</span>
          </button>
        </div>
      </div>

      {/* Dedicated Offline Workspace Strip */}
      <div className="surface-card rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="surface-elevated w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
            {isOfflineMode ? (
              <WifiOff className="w-5 h-5 text-[#ff5500]" aria-hidden="true" />
            ) : (
              <Wifi className="w-5 h-5" aria-hidden="true" />
            )}
          </div>
          <div>
            <p className="font-display text-base font-extrabold">
              {isOfflineMode
                ? 'Offline Mode Active — Local Toolkit Ready'
                : 'Online Cloud Sync & Offline Cache Active'}
            </p>
            <p className="text-xs text-muted">
              {!browserOnline
                ? 'No internet detected. Vision, AAC, Sign, Sound Radar, Memory Aids, Dyslexia, Fall Guardian, Stress Tracker & Calm Studio work locally.'
                : manualOfflineMode
                  ? 'Manual Offline Mode enabled. Cloud requests & external APIs are paused while local tools work seamlessly.'
                  : 'Switch on Offline Mode anytime to run without network connections.'}
            </p>
          </div>
        </div>
        {browserOnline && (
          <button
            type="button"
            onClick={() => setManualOfflineMode(!manualOfflineMode)}
            className={`min-h-[50px] px-4 rounded-xl text-sm font-extrabold flex items-center gap-2 shrink-0 cursor-pointer ${
              manualOfflineMode ? 'btn-accent' : 'surface-elevated'
            }`}
          >
            {manualOfflineMode ? (
              <>
                <Wifi className="w-4 h-4" aria-hidden="true" />
                <span>Reconnect Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4" aria-hidden="true" />
                <span>Use Separate Offline Mode</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Signed-in Status Banner */}
      {user && (
        <div className="surface-card rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <ProfileAvatar
                avatarDataUrl={avatarPreview || patientProfile.avatarDataUrl}
                fullName={patientProfile.fullName || user.displayName || 'User'}
                size="md"
              />
              <div>
                <p className="font-display text-lg font-extrabold">
                  Signed in as {user.displayName || user.email}
                </p>
                <p className="text-sm text-muted">
                  Alert Email: <span className="font-bold">{patientProfile.alertEmail || user.email}</span> ·
                  Emergency Phone: <span className="font-mono-nums font-bold">{patientProfile.caregiverPhone}</span>
                </p>
                {emailVerificationPending && (
                  <p className="text-xs font-extrabold text-[#ff5500] mt-1">
                    Email verification pending — check your inbox and tap Refresh Status to activate Firestore Cloud Sync &amp; Remote Code sharing.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {emailVerificationPending && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      const verified = await refreshVerificationStatus();
                      setStatusNotice(
                        verified
                          ? 'Email verified! Cloud Sync & Remote Tracking are now live.'
                          : 'Still waiting for verification click in your email inbox.'
                      );
                    }}
                    className="btn-accent min-h-[52px] px-4 rounded-xl text-sm font-extrabold flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" aria-hidden="true" />
                    <span>Refresh Verification</span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const sent = await resendVerificationEmail();
                      if (sent) setStatusNotice('Verification email resent. Please check spam/inbox.');
                    }}
                    className="surface-elevated min-h-[52px] px-4 rounded-xl text-sm font-bold cursor-pointer"
                  >
                    Resend Email
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onEnterDashboard}
                className="btn-accent min-h-[52px] px-5 rounded-xl text-sm font-extrabold cursor-pointer"
              >
                Open Patient Dashboard
              </button>
              <button
                type="button"
                onClick={signOutUser}
                className="surface-elevated min-h-[52px] px-4 rounded-xl text-sm font-bold cursor-pointer"
              >
                Sign Out
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen((v) => !v)}
                className="min-h-[52px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>Delete Account</span>
              </button>
            </div>
          </div>

          {confirmDeleteOpen && (
            <div className="rounded-xl border-2 border-red-500 bg-red-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs sm:text-sm font-bold">
                This permanently deletes your login, cloud caregiver profile, photo memories,
                reminders, and clears this device. Continue?
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  disabled={deletingAccount}
                  onClick={async () => {
                    setDeletingAccount(true);
                    setFormError(null);
                    const res = await deleteAccountAndData(
                      patientProfile.remoteAccessCode,
                      onResetAccount
                    );
                    setDeletingAccount(false);
                    if (res.ok) {
                      setConfirmDeleteOpen(false);
                      setStatusNotice(res.message);
                    } else {
                      setFormError(res.message);
                    }
                  }}
                  className="min-h-[48px] px-4 rounded-xl bg-red-700 hover:bg-red-800 text-white text-xs font-extrabold cursor-pointer disabled:opacity-60"
                >
                  {deletingAccount ? 'Deleting...' : 'Confirm Permanent Delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(false)}
                  className="surface-elevated min-h-[48px] px-4 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Email Account Creation / Login Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-8 surface-card rounded-3xl p-5 sm:p-7 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setFormError(null);
                  clearAuthError();
                }}
                className={`min-h-[52px] px-4 rounded-xl text-sm font-extrabold flex items-center gap-2 cursor-pointer ${
                  mode === 'signup' ? 'btn-accent' : 'surface-elevated'
                }`}
              >
                <UserPlus className="w-4 h-4" aria-hidden="true" />
                <span>Create Caregiver Account</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setFormError(null);
                  clearAuthError();
                }}
                className={`min-h-[52px] px-4 rounded-xl text-sm font-extrabold flex items-center gap-2 cursor-pointer ${
                  mode === 'signin' ? 'btn-accent' : 'surface-elevated'
                }`}
              >
                <Mail className="w-4 h-4" aria-hidden="true" />
                <span>Email Sign In</span>
              </button>
            </div>

            <button
              type="button"
              onClick={async () => {
                clearAuthError();
                const ok = await signInWithGoogle();
                if (ok) onEnterDashboard();
              }}
              disabled={isSigningIn}
              className="surface-elevated min-h-[52px] px-4 rounded-xl text-sm font-bold cursor-pointer"
            >
              {isSigningIn ? 'Connecting...' : 'Sign In with Google'}
            </button>
          </div>

          {mode === 'signup' && (
            <>
              {/* Profile Picture Selector & Uploader */}
              <div className="surface-elevated rounded-2xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <ProfileAvatar avatarDataUrl={avatarPreview} fullName={patientName} size="lg" />
                    <div>
                      <p className="font-display text-base font-extrabold">
                        Patient Profile Picture
                      </p>
                      <p className="text-xs text-muted">
                        Displayed on Dashboard, Emergency ID card &amp; Caregiver Portal.
                      </p>
                    </div>
                  </div>
                  <label className="btn-accent min-h-[52px] px-4 rounded-xl font-extrabold text-sm inline-flex items-center justify-center gap-2 cursor-pointer shrink-0">
                    <Upload className="w-4 h-4" aria-hidden="true" />
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarUpload}
                      className="sr-only"
                    />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs font-bold text-muted mr-1">Or pick avatar:</span>
                  {PRESET_AVATARS.map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() => {
                        setAvatarPreview(av.svgDataUrl);
                        onUpdateProfile({avatarDataUrl: av.svgDataUrl});
                      }}
                      className={`p-1 rounded-xl border-2 cursor-pointer ${
                        avatarPreview === av.svgDataUrl ? 'border-[#ff5500]' : 'border-transparent'
                      }`}
                      title={av.label}
                    >
                      <img src={av.svgDataUrl} alt={av.label} className="w-10 h-10 rounded-lg" />
                    </button>
                  ))}
                  {avatarPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarPreview('');
                        onUpdateProfile({avatarDataUrl: ''});
                      }}
                      className="surface-card px-3 min-h-[40px] rounded-lg text-xs font-bold cursor-pointer"
                    >
                      Use Initials
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1.5">
                  <label htmlFor="signup-patient-name" className="block text-sm font-bold">
                    Patient Full Name
                  </label>
                  <input
                    id="signup-patient-name"
                    type="text"
                    required
                    maxLength={120}
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="surface-elevated w-full min-h-[54px] rounded-xl px-4 font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="signup-patient-age" className="block text-sm font-bold">
                    Patient Age
                  </label>
                  <input
                    id="signup-patient-age"
                    type="text"
                    maxLength={16}
                    value={patientAge}
                    onChange={(e) => setPatientAge(e.target.value)}
                    className="surface-elevated w-full min-h-[54px] rounded-xl px-4 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="signup-cg-name" className="block text-sm font-bold">
                    Adult Caregiver Name
                  </label>
                  <input
                    id="signup-cg-name"
                    type="text"
                    required
                    maxLength={120}
                    value={caregiverName}
                    onChange={(e) => setCaregiverName(e.target.value)}
                    className="surface-elevated w-full min-h-[54px] rounded-xl px-4 font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="signup-cg-phone" className="block text-sm font-bold">
                    Caregiver Phone (For Immediate Call &amp; SMS Alerts)
                  </label>
                  <input
                    id="signup-cg-phone"
                    type="tel"
                    required
                    maxLength={40}
                    value={caregiverPhone}
                    onChange={(e) => setCaregiverPhone(e.target.value)}
                    className="surface-elevated w-full min-h-[54px] rounded-xl px-4 font-mono-nums font-bold"
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="auth-email" className="block text-sm font-bold">
                Caregiver Alert &amp; Login Email
              </label>
              <input
                id="auth-email"
                type="email"
                required
                maxLength={160}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="caregiver@example.com"
                className="surface-elevated w-full min-h-[54px] rounded-xl px-4 font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="auth-password" className="block text-sm font-bold">
                Account Password (min 6 chars)
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="surface-elevated w-full min-h-[54px] rounded-xl px-4 font-bold"
              />
            </div>
          </div>

          {mode === 'signup' && (
            <>
              <label className="surface-elevated rounded-2xl p-4 flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={childMode}
                  onChange={(e) => {
                    setChildMode(e.target.checked);
                    onUpdateProfile({childFriendlyMode: e.target.checked});
                  }}
                  className="w-6 h-6 accent-current shrink-0 cursor-pointer"
                />
                <Baby className="w-5 h-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-bold text-sm">Enable Child-Friendly Mode (PIN-Protected After Setup)</p>
                  <p className="text-xs text-muted">
                    Uses friendly visual cards, gentle rounded buttons, and simplified wording. Only changeable inside Settings with your 4-digit PIN.
                  </p>
                </div>
              </label>

              {/* Terms & Conditions + Liability Waiver + Adult Caregiver Checkmark */}
              <div className="surface-elevated rounded-2xl p-4 sm:p-5 space-y-3 border-2 border-[#ff5500]/70">
                <div className="flex items-center gap-2 text-[#ff5500]">
                  <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <h3 className="font-display text-base font-extrabold">
                    Terms, Conditions &amp; Liability Disclaimer
                  </h3>
                </div>
                <div className="surface-card rounded-xl p-3.5 max-h-36 overflow-y-auto text-xs leading-relaxed space-y-2">
                  <p>
                    <strong>1. Assistive Companion Only (Not a Medical Device):</strong> AbleBridge
                    is an educational &amp; assistive software toolkit designed to support daily
                    communication, sensory comfort, routines, and caregiver notifications.
                  </p>
                  <p>
                    <strong>2. Limitation of Liability — Accidents &amp; Death:</strong> By creating
                    or using an AbleBridge account, you expressly understand and agree that the
                    creators, developers, contributors, and maintainers of AbleBridge are{' '}
                    <strong>
                      NOT responsible or liable for any accident, injury, fall, seizure complication,
                      delayed or missed emergency alert, sensor failure, network outage, or death
                    </strong>{' '}
                    arising out of or connected with use of this application. Always dial local
                    emergency services (911 / 112 / 999) in any life-threatening emergency.
                  </p>
                  <p>
                    <strong>3. Adult Caregiver Supervision:</strong> Accounts for minors or
                    dependent patients must be created and supervised by an authorized adult
                    caregiver (age 18+).
                  </p>
                </div>

                <label className="flex items-start gap-3 p-3 rounded-xl surface-card cursor-pointer">
                  <input
                    id="adult-caregiver-checkbox"
                    type="checkbox"
                    checked={adultConfirmed}
                    onChange={(e) => setAdultConfirmed(e.target.checked)}
                    className="w-6 h-6 mt-0.5 accent-current shrink-0 cursor-pointer"
                  />
                  <span className="text-xs sm:text-sm font-bold leading-snug">
                    I confirm that I am an <strong>adult caregiver (18 years or older)</strong>{' '}
                    creating and managing this account, and I accept the Terms &amp; Conditions
                    stating that the creators are not responsible for any accident, injury, or death.
                  </span>
                </label>
              </div>
            </>
          )}

          {(formError || authError) && (
            <div
              role="alert"
              className="rounded-2xl bg-red-950/80 border-2 border-red-500 text-red-100 p-4 text-sm font-bold"
            >
              {formError || authError}
            </div>
          )}

          {statusNotice && (
            <div
              role="status"
              className="rounded-2xl bg-emerald-950/80 border-2 border-emerald-400 text-emerald-100 p-4 text-sm font-bold flex items-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>{statusNotice}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSigningIn}
              className="btn-accent min-h-[60px] px-6 rounded-2xl font-extrabold text-base flex items-center justify-center gap-2 cursor-pointer flex-1"
            >
              <ClipboardCheck className="w-5 h-5" aria-hidden="true" />
              <span>
                {isSigningIn
                  ? 'Please wait...'
                  : mode === 'signup'
                    ? 'Accept Terms & Create Caregiver Account'
                    : 'Sign In to AbleBridge'}
              </span>
            </button>
          </div>
        </form>

        {/* Quick Setup & Remote Summary Column */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="surface-card rounded-3xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" aria-hidden="true" />
              <h2 className="font-display text-lg font-extrabold">What Caregiver Login Unlocks</h2>
            </div>
            <ul className="space-y-2.5 text-sm text-muted">
              <li>• Dual Emergency Alerts prepared for your saved Email &amp; Phone number.</li>
              <li>• Encrypted Caregiver Portal with Patient Stress Trends &amp; SOS logs.</li>
              <li>
                • Live GPS Patient Location Sharing via 8-character Remote Code:{' '}
                <span className="font-mono-nums font-extrabold" style={{color: 'var(--text-primary)'}}>
                  {patientProfile.remoteAccessCode}
                </span>
              </li>
              <li>• Accident-Free Streak tracking across sessions &amp; devices.</li>
            </ul>
          </div>

          <div className="surface-card rounded-3xl p-5 space-y-3">
            <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
              Instant Caregiver Phone Alert Setup
            </p>
            <p className="text-sm">
              Every screen includes a one-tap <strong>Call Caregiver</strong> bar connected to{' '}
              <span className="font-mono-nums font-bold">{patientProfile.caregiverPhone}</span>
              {patientProfile.alertEmail ? ` & ${patientProfile.alertEmail}` : ''}.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
};
