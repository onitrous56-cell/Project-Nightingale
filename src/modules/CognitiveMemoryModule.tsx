import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  BellRing,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  RotateCcw,
  Trash2,
  Unlock,
  Upload,
  Volume2,
} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {resizeImageFileToDataUrl} from '../components/ProfileAvatar';
import {useFirebase} from '../contexts/FirebaseContext';
import {
  MultimodalAlert,
  PhotoMemoryCategory,
  PhotoMemoryItem,
  ReminderTimeSlot,
} from '../types';
import {playAlertSound, speakText, stopSpeech, triggerVibration} from '../utils/multimodal';
import {getLocalCalendarDateKey} from '../utils/patientProfile';

interface CognitiveMemoryModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  caregiverPin: string;
  onEmitAlert: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

const CATEGORY_LABELS: Record<PhotoMemoryCategory, string> = {
  family: 'Family',
  caregiver: 'Caregiver',
  home: 'Home Item',
  place: 'Safe Place',
  other: 'Memory',
};

const SLOT_LABELS: Record<ReminderTimeSlot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  anytime: 'Anytime',
};

const SAMPLE_MEMORY_ARTWORKS: Array<{
  label: string;
  category: PhotoMemoryCategory;
  defaultTitle: string;
  defaultCaption: string;
  dataUrl: string;
}> = [
  {
    label: 'Keys & Bag Hook',
    category: 'home',
    defaultTitle: 'Front Door Keys & Wallet Basket',
    defaultCaption: 'House keys and wallet always stay in the orange bowl beside the front door.',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><rect width="240" height="180" rx="16" fill="#0f172a"/><circle cx="88" cy="78" r="24" fill="none" stroke="#ff5500" stroke-width="10"/><path d="M110 78h68v18h-16v-10h-14v12h-16v-20z" fill="#ff5500"/><text x="120" y="152" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="bold" fill="#f8fafc">Keys Station</text></svg>'
    )}`,
  },
  {
    label: 'Doctor & Clinic Card',
    category: 'place',
    defaultTitle: 'Dr. Patel — Neighborhood Clinic',
    defaultCaption: 'Clinic is two blocks east on Oak Street. Blue glass entrance next to the park.',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><rect width="240" height="180" rx="16" fill="#0a1633"/><rect x="82" y="38" width="76" height="76" rx="16" fill="#00f5d4"/><path d="M120 52v48M96 76h48" stroke="#03050a" stroke-width="12" stroke-linecap="round"/><text x="120" y="152" text-anchor="middle" font-family="sans-serif" font-size="14" font-weight="bold" fill="#f0fdfa">Care Clinic</text></svg>'
    )}`,
  },
];

export const CognitiveMemoryModule: React.FC<CognitiveMemoryModuleProps> = ({
  onBack,
  voiceSpeed,
  caregiverPin,
  onEmitAlert,
}) => {
  const {
    photoMemories,
    addPhotoMemory,
    deletePhotoMemory,
    memoryReminders,
    addMemoryReminder,
    toggleMemoryReminderDone,
    resetTodayMemoryReminders,
    deleteMemoryReminder,
    isOfflineMode,
  } = useFirebase();

  const [activeTab, setActiveTab] = useState<'photos' | 'reminders'>('photos');
  const [selectedMemory, setSelectedMemory] = useState<PhotoMemoryItem | null>(null);
  const [caregiverUnlocked, setCaregiverUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  // Add Photo Memory form state
  const [photoTitle, setPhotoTitle] = useState('');
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoCategory, setPhotoCategory] = useState<PhotoMemoryCategory>('family');
  const [photoDataUrl, setPhotoDataUrl] = useState('');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((t) => t.stop());
      liveStreamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    try {
      setPhotoError(null);
      stopCamera();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera is not available in this environment.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: {ideal: 'environment'}, width: {ideal: 640}, height: {ideal: 480}},
      });
      liveStreamRef.current = stream;
      setCameraActive(true);
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        await liveVideoRef.current.play();
      }
    } catch {
      setPhotoError('Unable to open camera feed. You can upload an image or select a preset.');
      setCameraActive(false);
    }
  };

  const capturePhotoFromCamera = () => {
    if (!liveVideoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = liveVideoRef.current.videoWidth || 640;
    canvas.height = liveVideoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(liveVideoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setPhotoDataUrl(dataUrl);
      triggerVibration(60);
      playAlertSound('chime');
    }
    stopCamera();
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Add Daily Reminder form state
  const [remTitle, setRemTitle] = useState('');
  const [remNotes, setRemNotes] = useState('');
  const [remSlot, setRemSlot] = useState<ReminderTimeSlot>('morning');
  const [remConfirmMsg, setRemConfirmMsg] = useState('');
  const [savingRem, setSavingRem] = useState(false);
  const [lastSpokenBanner, setLastSpokenBanner] = useState<string | null>(null);

  const todayKey = getLocalCalendarDateKey();

  const completedCount = useMemo(
    () => memoryReminders.filter((r) => r.lastCompletedDate === todayKey).length,
    [memoryReminders, todayKey]
  );

  const handleUnlockCaregiverEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim() === caregiverPin) {
      setCaregiverUnlocked(true);
      setPinInput('');
      setPinError(null);
      triggerVibration(60);
    } else {
      setPinError('Incorrect Caregiver PIN. Please try again.');
      triggerVibration([120, 60, 120]);
    }
  };

  const handleUploadMemoryImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    try {
      const compressed = await resizeImageFileToDataUrl(file);
      setPhotoDataUrl(compressed);
      triggerVibration(40);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Unable to process uploaded photo.');
    }
  };

  const handleCreatePhotoMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhotoError(null);
    if (!photoTitle.trim()) {
      setPhotoError('Please enter a title (e.g., Sister Maya or Front Door Keys).');
      return;
    }
    if (!photoDataUrl) {
      setPhotoError('Please upload a photo or pick one of the quick templates below.');
      return;
    }
    setSavingPhoto(true);
    try {
      await addPhotoMemory({
        title: photoTitle,
        caption: photoCaption || photoTitle,
        category: photoCategory,
        imageDataUrl: photoDataUrl,
      });
      setPhotoTitle('');
      setPhotoCaption('');
      setPhotoDataUrl('');
      triggerVibration(70);
      speakText(`Saved new photo memory: ${photoTitle}`, voiceSpeed);
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleCreateReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remTitle.trim()) return;
    setSavingRem(true);
    try {
      await addMemoryReminder({
        title: remTitle,
        notes: remNotes,
        timeSlot: remSlot,
        confirmationMessage:
          remConfirmMsg.trim() || `Confirmed! ${remTitle.trim()} is finished for today.`,
      });
      setRemTitle('');
      setRemNotes('');
      setRemConfirmMsg('');
      triggerVibration(70);
      speakText(`Added daily reminder: ${remTitle}`, voiceSpeed);
    } finally {
      setSavingRem(false);
    }
  };

  const handleSpeakMemory = (mem: PhotoMemoryItem) => {
    setSelectedMemory(mem);
    triggerVibration(45);
    const spoken = `${CATEGORY_LABELS[mem.category]} memory: ${mem.title}. ${mem.caption}`;
    setLastSpokenBanner(spoken);
    speakText(spoken, voiceSpeed);
  };

  const handleToggleReminder = async (id: string) => {
    const updated = await toggleMemoryReminderDone(id);
    if (!updated) return;
    const isNowDone = updated.lastCompletedDate === todayKey;
    if (isNowDone) {
      playAlertSound('chime');
      triggerVibration([80, 40, 120]);
      const spoken = `${updated.confirmationMessage} Recorded at ${updated.lastCompletedTimeLabel}.`;
      setLastSpokenBanner(spoken);
      speakText(spoken, voiceSpeed);
      onEmitAlert({
        title: 'Reminder Confirmed',
        message: spoken,
        severity: 'info',
        flashScreen: false,
      });
    } else {
      triggerVibration(40);
      const spoken = `Unchecked ${updated.title}.`;
      setLastSpokenBanner(spoken);
      speakText(spoken, voiceSpeed);
    }
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        moduleId="memory"
        title="Cognitive Memory Aids"
        subtitle={`06 · Photo Memory Album & Audio-Confirmed Daily Reminders · ${
          isOfflineMode ? 'Offline Storage Active' : 'Synced Ready'
        }`}
        onBack={() => {
          stopSpeech();
          onBack();
        }}
        actionSlot={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('photos')}
              className={`min-h-[54px] px-4 rounded-xl text-sm font-extrabold flex items-center gap-2 cursor-pointer ${
                activeTab === 'photos' ? 'btn-accent' : 'surface-elevated'
              }`}
            >
              <Camera className="w-4 h-4" aria-hidden="true" />
              <span>Photo Memory ({photoMemories.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reminders')}
              className={`min-h-[54px] px-4 rounded-xl text-sm font-extrabold flex items-center gap-2 cursor-pointer ${
                activeTab === 'reminders' ? 'btn-accent' : 'surface-elevated'
              }`}
            >
              <BellRing className="w-4 h-4" aria-hidden="true" />
              <span>
                Daily Reminders ({completedCount}/{memoryReminders.length})
              </span>
            </button>
          </div>
        }
      />

      {/* Spoken Confirmation Bar */}
      {lastSpokenBanner && (
        <div
          role="status"
          className="surface-card rounded-2xl p-4 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Volume2 className="w-6 h-6 shrink-0" aria-hidden="true" />
            <p className="text-sm sm:text-base font-bold truncate">{lastSpokenBanner}</p>
          </div>
          <button
            type="button"
            onClick={() => speakText(lastSpokenBanner, voiceSpeed)}
            className="btn-accent min-h-[44px] px-4 rounded-xl text-xs font-extrabold shrink-0 cursor-pointer"
          >
            Repeat Voice
          </button>
        </div>
      )}

      {/* Caregiver Edit Lock Bar (Prevents accidental changes/deletions by patients) */}
      <div className="surface-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="surface-elevated w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
            {caregiverUnlocked ? (
              <Unlock className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Lock className="w-5 h-5" aria-hidden="true" />
            )}
          </div>
          <div>
            <p className="font-bold text-sm sm:text-base">
              {caregiverUnlocked
                ? 'Caregiver Edit Mode Unlocked — You can upload photos & manage reminders'
                : 'Patient View Active — Enter Caregiver PIN to upload memories or add/delete reminders'}
            </p>
            {pinError && (
              <p role="alert" className="text-xs font-bold text-red-500 mt-0.5">
                {pinError}
              </p>
            )}
          </div>
        </div>

        {caregiverUnlocked ? (
          <button
            type="button"
            onClick={() => setCaregiverUnlocked(false)}
            className="surface-elevated min-h-[48px] px-4 rounded-xl text-sm font-extrabold flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Lock className="w-4 h-4" aria-hidden="true" />
            <span>Lock Caregiver Tools</span>
          </button>
        ) : (
          <form onSubmit={handleUnlockCaregiverEdit} className="flex items-center gap-2 shrink-0">
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              placeholder="4-digit PIN"
              aria-label="Caregiver 4-digit PIN"
              className="surface-elevated w-32 min-h-[48px] rounded-xl px-3 font-mono-nums text-base font-extrabold text-center"
            />
            <button
              type="submit"
              className="btn-accent min-h-[48px] px-4 rounded-xl text-sm font-extrabold cursor-pointer"
            >
              Unlock Edit
            </button>
          </form>
        )}
      </div>

      {/* TAB 1: PHOTO MEMORY */}
      {activeTab === 'photos' && (
        <div className="space-y-6">
          {/* Spotlight Card when patient taps a memory */}
          {selectedMemory && (
            <div className="surface-card rounded-3xl p-5 sm:p-6 grid grid-cols-1 md:grid-cols-12 gap-5 items-center shadow-xl">
              <div className="md:col-span-5">
                <img
                  src={selectedMemory.imageDataUrl}
                  alt={selectedMemory.title}
                  className="w-full h-60 object-cover rounded-2xl border-2 border-theme"
                />
              </div>
              <div className="md:col-span-7 space-y-3">
                <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                  {CATEGORY_LABELS[selectedMemory.category]} · Tap Hear Aloud Anytime
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-extrabold">
                  {selectedMemory.title}
                </h2>
                <p className="text-base sm:text-lg leading-relaxed">{selectedMemory.caption}</p>
                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSpeakMemory(selectedMemory)}
                    className="btn-accent min-h-[54px] px-5 rounded-xl font-extrabold flex items-center gap-2 cursor-pointer"
                  >
                    <Volume2 className="w-5 h-5" aria-hidden="true" />
                    <span>Read Memory Aloud</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedMemory(null)}
                    className="surface-elevated min-h-[54px] px-4 rounded-xl font-bold text-sm cursor-pointer"
                  >
                    Close Spotlight
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Caregiver Upload Captioned Photo Form */}
          {caregiverUnlocked && (
            <form
              onSubmit={handleCreatePhotoMemory}
              className="surface-card rounded-3xl p-5 sm:p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-extrabold">
                  Upload Captioned Photo Memory
                </h2>
                <span className="text-xs font-bold text-muted">Saved offline + synced online</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                <div className="md:col-span-4 space-y-3">
                  {cameraActive ? (
                    <div className="relative w-full h-44 rounded-2xl overflow-hidden bg-black border-2 border-theme">
                      <video
                        ref={liveVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/75 px-2.5 py-1 rounded-md text-[10px] font-bold text-white">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span>LIVE CAMERA FEED</span>
                      </div>
                      <button
                        type="button"
                        onClick={capturePhotoFromCamera}
                        className="btn-accent absolute bottom-2 left-2 right-2 min-h-[44px] rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-lg cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Snap Photo From Live Feed</span>
                      </button>
                    </div>
                  ) : photoDataUrl ? (
                    <div className="relative">
                      <img
                        src={photoDataUrl}
                        alt="Memory preview"
                        className="w-full h-44 object-cover rounded-2xl border-2 border-theme"
                      />
                      <button
                        type="button"
                        onClick={() => setPhotoDataUrl('')}
                        className="absolute top-2 right-2 bg-black/70 text-white hover:text-red-400 p-1.5 rounded-lg text-xs"
                        aria-label="Remove image"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="surface-elevated h-44 rounded-2xl flex flex-col items-center justify-center p-4 text-center text-sm text-muted">
                      <Camera className="w-8 h-8 mb-2 opacity-75" aria-hidden="true" />
                      <span>Take a live photo or upload from device</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={cameraActive ? stopCamera : startCamera}
                      className={`${cameraActive ? 'surface-elevated text-red-400' : 'btn-accent'} min-h-[50px] px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer`}
                    >
                      {cameraActive ? (
                        <>
                          <CameraOff className="w-4 h-4" aria-hidden="true" />
                          <span>Stop Camera</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4" aria-hidden="true" />
                          <span>Live Camera</span>
                        </>
                      )}
                    </button>

                    <label className="surface-elevated min-h-[50px] px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer">
                      <Upload className="w-4 h-4" aria-hidden="true" />
                      <span>Upload File</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadMemoryImage}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {SAMPLE_MEMORY_ARTWORKS.map((sample) => (
                      <button
                        key={sample.label}
                        type="button"
                        onClick={() => {
                          setPhotoDataUrl(sample.dataUrl);
                          setPhotoTitle(sample.defaultTitle);
                          setPhotoCaption(sample.defaultCaption);
                          setPhotoCategory(sample.category);
                        }}
                        className="surface-elevated px-3 min-h-[40px] rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Preset: {sample.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-8 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label htmlFor="mem-title" className="block text-xs font-bold">
                        Memory Title (Person, Room, or Object)
                      </label>
                      <input
                        id="mem-title"
                        type="text"
                        maxLength={120}
                        value={photoTitle}
                        onChange={(e) => setPhotoTitle(e.target.value)}
                        placeholder="e.g., Grandson Leo or Kitchen Tea Kettle"
                        className="surface-elevated w-full min-h-[52px] rounded-xl px-4 font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="mem-cat" className="block text-xs font-bold">
                        Category
                      </label>
                      <select
                        id="mem-cat"
                        value={photoCategory}
                        onChange={(e) => setPhotoCategory(e.target.value as PhotoMemoryCategory)}
                        className="surface-elevated w-full min-h-[52px] rounded-xl px-3 font-bold"
                      >
                        <option value="family">Family</option>
                        <option value="caregiver">Caregiver</option>
                        <option value="home">Home Item</option>
                        <option value="place">Safe Place</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="mem-caption" className="block text-xs font-bold">
                      Helpful Spoken Caption for Patient
                    </label>
                    <textarea
                      id="mem-caption"
                      rows={3}
                      maxLength={500}
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      placeholder="Write a warm, simple reminder that will be spoken aloud when tapped..."
                      className="surface-elevated w-full rounded-xl p-3 font-medium"
                    />
                  </div>

                  {photoError && (
                    <p role="alert" className="text-sm font-bold text-red-500">
                      {photoError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={savingPhoto}
                    className="btn-accent min-h-[54px] px-6 rounded-xl font-extrabold flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-5 h-5" aria-hidden="true" />
                    <span>{savingPhoto ? 'Saving Memory...' : 'Save Photo Memory Card'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* Photo Memory Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {photoMemories.map((mem) => (
              <div
                key={mem.id}
                className="surface-card rounded-3xl overflow-hidden flex flex-col justify-between shadow-lg"
              >
                <button
                  type="button"
                  onClick={() => handleSpeakMemory(mem)}
                  className="text-left flex-1 flex flex-col cursor-pointer group"
                >
                  <div className="relative h-48 w-full overflow-hidden border-b border-theme">
                    <img
                      src={mem.imageDataUrl}
                      alt={mem.title}
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                    />
                  </div>
                  <div className="p-5 space-y-2 flex-1">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                      {CATEGORY_LABELS[mem.category]}
                    </p>
                    <h3 className="font-display text-xl font-extrabold leading-snug">
                      {mem.title}
                    </h3>
                    <p className="text-sm text-muted leading-relaxed">{mem.caption}</p>
                  </div>
                </button>

                <div className="px-5 py-3 border-t border-theme flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleSpeakMemory(mem)}
                    className="btn-accent min-h-[46px] px-4 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer flex-1 justify-center"
                  >
                    <Volume2 className="w-4 h-4" aria-hidden="true" />
                    <span>Tap to Hear Caption</span>
                  </button>
                  {caregiverUnlocked && (
                    <button
                      type="button"
                      onClick={() => deletePhotoMemory(mem.id)}
                      className="surface-elevated min-h-[46px] min-w-[46px] rounded-xl flex items-center justify-center text-red-500 cursor-pointer"
                      aria-label={`Delete ${mem.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: IMPORTANT DAILY REMINDERS */}
      {activeTab === 'reminders' && (
        <div className="space-y-6">
          {/* Daily Progress Banner */}
          <div className="surface-card rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                Today’s Checklist ({todayKey})
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold">
                {completedCount} of {memoryReminders.length} Important Reminders Confirmed
              </h2>
              <p className="text-sm text-muted">
                Tap any reminder below to check it off and hear a spoken audio confirmation.
              </p>
            </div>
            {caregiverUnlocked && (
              <button
                type="button"
                onClick={async () => {
                  await resetTodayMemoryReminders();
                  speakText('All daily reminders reset for today.', voiceSpeed);
                }}
                className="surface-elevated min-h-[52px] px-4 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer shrink-0"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span>Reset Today’s Checkoffs</span>
              </button>
            )}
          </div>

          {/* Caregiver Add Reminder Form */}
          {caregiverUnlocked && (
            <form
              onSubmit={handleCreateReminder}
              className="surface-card rounded-3xl p-5 sm:p-6 space-y-4"
            >
              <h3 className="font-display text-xl font-extrabold">
                Add Important Daily Reminder
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label htmlFor="rem-title" className="block text-xs font-bold">
                    Reminder Task
                  </label>
                  <input
                    id="rem-title"
                    type="text"
                    required
                    maxLength={140}
                    value={remTitle}
                    onChange={(e) => setRemTitle(e.target.value)}
                    placeholder="e.g., Turn off stove & feed Max"
                    className="surface-elevated w-full min-h-[52px] rounded-xl px-4 font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="rem-slot" className="block text-xs font-bold">
                    Time of Day
                  </label>
                  <select
                    id="rem-slot"
                    value={remSlot}
                    onChange={(e) => setRemSlot(e.target.value as ReminderTimeSlot)}
                    className="surface-elevated w-full min-h-[52px] rounded-xl px-3 font-bold"
                  >
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                    <option value="anytime">Anytime</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="rem-notes" className="block text-xs font-bold">
                    Helpful Instruction
                  </label>
                  <input
                    id="rem-notes"
                    type="text"
                    maxLength={300}
                    value={remNotes}
                    onChange={(e) => setRemNotes(e.target.value)}
                    placeholder="Short step-by-step cue for patient"
                    className="surface-elevated w-full min-h-[52px] rounded-xl px-4 font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="rem-confirm" className="block text-xs font-bold">
                    Spoken Audio Confirmation Message
                  </label>
                  <input
                    id="rem-confirm"
                    type="text"
                    maxLength={240}
                    value={remConfirmMsg}
                    onChange={(e) => setRemConfirmMsg(e.target.value)}
                    placeholder="e.g., Wonderful! Medicine confirmed."
                    className="surface-elevated w-full min-h-[52px] rounded-xl px-4 font-medium"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingRem}
                className="btn-accent min-h-[54px] px-6 rounded-xl font-extrabold flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-5 h-5" aria-hidden="true" />
                <span>{savingRem ? 'Adding...' : 'Add Daily Reminder'}</span>
              </button>
            </form>
          )}

          {/* Interactive Audio-Confirmed Checklist */}
          <div className="space-y-3">
            {memoryReminders.map((rem) => {
              const isDone = rem.lastCompletedDate === todayKey;
              return (
                <div
                  key={rem.id}
                  className={`surface-card rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                    isDone ? 'opacity-90' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleReminder(rem.id)}
                    className="flex items-start gap-4 text-left flex-1 cursor-pointer min-h-[60px]"
                    aria-pressed={isDone}
                  >
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border-2 ${
                        isDone ? 'btn-accent border-transparent' : 'surface-elevated border-theme'
                      }`}
                    >
                      <CheckCircle2 className="w-7 h-7" aria-hidden="true" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-muted">
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{SLOT_LABELS[rem.timeSlot]}</span>
                        {isDone && rem.lastCompletedTimeLabel && (
                          <span>· Confirmed at {rem.lastCompletedTimeLabel}</span>
                        )}
                      </div>
                      <p
                        className={`font-display text-xl font-extrabold ${
                          isDone ? 'line-through opacity-75' : ''
                        }`}
                      >
                        {rem.title}
                      </p>
                      {rem.notes && <p className="text-sm text-muted">{rem.notes}</p>}
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        speakText(`${rem.title}. ${rem.notes || ''}`, voiceSpeed)
                      }
                      className="surface-elevated min-h-[52px] px-4 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Volume2 className="w-4 h-4" aria-hidden="true" />
                      <span>Read Prompt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleReminder(rem.id)}
                      className={`min-h-[52px] px-5 rounded-xl text-sm font-extrabold cursor-pointer ${
                        isDone ? 'surface-elevated' : 'btn-accent'
                      }`}
                    >
                      {isDone ? 'Done ✓' : 'Confirm Done'}
                    </button>
                    {caregiverUnlocked && (
                      <button
                        type="button"
                        onClick={() => deleteMemoryReminder(rem.id)}
                        className="surface-elevated min-h-[52px] min-w-[52px] rounded-xl flex items-center justify-center text-red-500 cursor-pointer"
                        aria-label={`Delete reminder ${rem.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
