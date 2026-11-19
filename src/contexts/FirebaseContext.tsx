import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  disableNetwork,
  doc,
  enableNetwork,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  CaregiverConfig,
  ChatPersona,
  GeminiChatMessage,
  MemoryReminderItem,
  MentalStatusLevel,
  PatientProfile,
  PhotoMemoryCategory,
  PhotoMemoryItem,
  ReminderTimeSlot,
  RemoteTelemetrySnapshot,
  SosEventRecord,
  StressLogEntry,
  StressMood,
  TextSize,
  ThemeMode,
  VoiceSpeed,
} from '../types';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../utils/firebase';
import {
  ALL_FUNCTIONAL_MODULES,
  CAREGIVER_STORAGE_KEY,
  generateRemoteAccessCode,
  getLocalCalendarDateKey,
  isValidRemoteCodeFormat,
  mergeNewlyAddedToolkitModules,
} from '../utils/patientProfile';

const LOCAL_STRESS_KEY = 'ablebridge_stress_logs_v1';
const LOCAL_CHAT_KEY = 'ablebridge_gemini_chat_v1';
const LOCAL_SOS_KEY = 'ablebridge_sos_events_v1';
const LOCAL_REMOTE_MAP_KEY = 'ablebridge_local_remote_links_v1';
const LOCAL_PHOTO_MEMORIES_KEY = 'ablebridge_photo_memories_v1';
const LOCAL_MEMORY_REMINDERS_KEY = 'ablebridge_memory_reminders_v1';
const LOCAL_MANUAL_OFFLINE_KEY = 'ablebridge_manual_offline_v1';

function buildDefaultSvgPhoto(title: string, bg: string, accent: string, shape: 'family' | 'home'): string {
  const artwork =
    shape === 'family'
      ? `<circle cx="90" cy="72" r="22" fill="${accent}"/><path d="M56 142c4-24 18-34 34-34s30 10 34 34" fill="${accent}"/><circle cx="152" cy="78" r="18" fill="#ffffff" opacity="0.9"/><path d="M124 142c3-20 14-28 28-28s25 8 28 28" fill="#ffffff" opacity="0.9"/>`
      : `<path d="M120 34L48 90h18v58h108V90h18L120 34z" fill="${accent}"/><rect x="104" y="106" width="32" height="42" rx="4" fill="#0f172a"/><circle cx="120" cy="76" r="10" fill="#ffffff"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><rect width="240" height="180" rx="16" fill="${bg}"/>${artwork}<text x="120" y="166" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="bold" fill="#ffffff">${title}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEFAULT_PHOTO_MEMORIES: PhotoMemoryItem[] = [
  {
    id: 'local_mem_family',
    title: 'Maria Rivera (Caregiver & Daughter)',
    caption: 'Maria visits every Wednesday & Sunday afternoon. Tap Call Caregiver anytime to talk.',
    category: 'family',
    imageDataUrl: buildDefaultSvgPhoto('Family Support', '#0a1633', '#00f5d4', 'family'),
    createdAtIso: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'local_mem_home',
    title: 'Kitchen Water & Pill Organizer',
    caption: 'Your blue weekly pillbox sits right next to the kettle on the kitchen counter.',
    category: 'home',
    imageDataUrl: buildDefaultSvgPhoto('Home Memory Station', '#1e293b', '#ff5500', 'home'),
    createdAtIso: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
];

const DEFAULT_MEMORY_REMINDERS: MemoryReminderItem[] = [
  {
    id: 'local_rem_meds',
    title: 'Take Morning Medication',
    notes: 'Use the blue pillbox in the kitchen with a full glass of water.',
    timeSlot: 'morning',
    confirmationMessage: 'Awesome! Your morning medication is confirmed as taken.',
    lastCompletedDate: '',
    lastCompletedTimeLabel: '',
    createdAtIso: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'local_rem_water',
    title: 'Drink Water & Stretch',
    notes: 'Hydrate slowly and take 3 calm breaths.',
    timeSlot: 'afternoon',
    confirmationMessage: 'Great job! Hydration and afternoon stretch confirmed.',
    lastCompletedDate: '',
    lastCompletedTimeLabel: '',
    createdAtIso: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'local_rem_lock',
    title: 'Check Front Door & Night Lamp',
    notes: 'Make sure the front door lock is turned before sleeping.',
    timeSlot: 'evening',
    confirmationMessage: 'Evening safety check confirmed. Front door and lamp checked.',
    lastCompletedDate: '',
    lastCompletedTimeLabel: '',
    createdAtIso: new Date().toISOString(),
  },
];

export const DEMO_COORDS = {lat: 37.7793, lng: -122.4193};

export interface LiveLocationState {
  lat: number;
  lng: number;
  gpsConsentActive: boolean;
  updatedAtIso: string;
}

export interface EmailSignupPayload {
  email: string;
  password: string;
  caregiverName: string;
  patientName: string;
  caregiverPhone: string;
  alertEmail: string;
}

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  cloudUserReady: boolean;
  browserOnline: boolean;
  manualOfflineMode: boolean;
  setManualOfflineMode: (enabled: boolean) => void;
  isOfflineMode: boolean;
  isSigningIn: boolean;
  authError: string | null;
  clearAuthError: () => void;
  emailVerificationPending: boolean;
  signInWithGoogle: () => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<boolean>;
  signUpWithEmail: (payload: EmailSignupPayload) => Promise<boolean>;
  resendVerificationEmail: () => Promise<boolean>;
  refreshVerificationStatus: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  deleteAccountAndData: (
    remoteAccessCode?: string,
    onLocalReset?: () => void
  ) => Promise<{ok: boolean; message: string; requiresRecentLogin?: boolean}>;
  stressLogs: StressLogEntry[];
  addStressLog: (entry: Omit<StressLogEntry, 'id' | 'createdAtIso'>) => Promise<void>;
  deleteStressLog: (id: string) => Promise<void>;
  sosEvents: SosEventRecord[];
  logSosEvent: (payload: {
    reason: string;
    peakG: number;
    lat: number;
    lng: number;
  }) => Promise<string | null>;
  updateSosEventStatus: (eventId: string, status: 'canceled' | 'dispatched') => Promise<void>;
  chatMessages: GeminiChatMessage[];
  saveChatMessages: (items: Array<Omit<GeminiChatMessage, 'id' | 'createdAtIso'>>) => Promise<void>;
  clearChatMessages: () => Promise<void>;
  photoMemories: PhotoMemoryItem[];
  addPhotoMemory: (entry: {
    title: string;
    caption: string;
    category: PhotoMemoryCategory;
    imageDataUrl: string;
  }) => Promise<void>;
  deletePhotoMemory: (id: string) => Promise<void>;
  memoryReminders: MemoryReminderItem[];
  addMemoryReminder: (entry: {
    title: string;
    notes: string;
    timeSlot: ReminderTimeSlot;
    confirmationMessage: string;
  }) => Promise<void>;
  toggleMemoryReminderDone: (id: string) => Promise<MemoryReminderItem | null>;
  resetTodayMemoryReminders: () => Promise<void>;
  deleteMemoryReminder: (id: string) => Promise<void>;
  syncCaregiverProfileToCloud: (
    config: CaregiverConfig,
    prefs: {theme: ThemeMode; textSize: TextSize; voiceSpeed: VoiceSpeed}
  ) => Promise<void>;
  loadCaregiverProfileFromCloud: () => Promise<{
    config: CaregiverConfig;
    theme: ThemeMode;
    textSize: TextSize;
    voiceSpeed: VoiceSpeed;
  } | null>;
  liveLocation: LiveLocationState;
  setLiveLocationState: (coords: {lat: number; lng: number}, gpsConsentActive: boolean) => void;
  publishRemoteTelemetry: (
    profile: PatientProfile,
    sosStatus?: 'monitoring' | 'countdown' | 'dispatched',
    locationOverride?: LiveLocationState
  ) => Promise<void>;
  subscribeToRemoteCode: (
    accessCode: string,
    onData: (
      snapshot: RemoteTelemetrySnapshot | null,
      source: 'cloud' | 'local',
      errorMsg?: string
    ) => void
  ) => () => void;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

function loadLocalJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveLocalJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota issues
  }
}

function formatAuthErrorMessage(err: unknown): string {
  const code = (err as {code?: string})?.code ?? '';
  if (code === 'auth/operation-not-allowed') {
    return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication → Sign-in method → Email/Password). Use Google Sign-In or Exhibition Guest Mode right now, or enable it in your Firebase Console.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Switch to Caregiver Sign In instead.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }
  if (code === 'auth/weak-password') {
    return 'Password must be at least 6 characters long.';
  }
  if (code === 'auth/invalid-email') {
    return 'Please enter a valid email address.';
  }
  return err instanceof Error ? err.message : 'Authentication failed.';
}

export const FirebaseProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [readyUid, setReadyUid] = useState<string | null>(null);
  const [browserOnline, setBrowserOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [manualOfflineMode, setManualOfflineState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LOCAL_MANUAL_OFFLINE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const ensureInFlightRef = useRef<{uid: string; promise: Promise<void>} | null>(null);

  const isOfflineMode = !browserOnline || manualOfflineMode;

  const setManualOfflineMode = useCallback((enabled: boolean) => {
    setManualOfflineState(enabled);
    try {
      localStorage.setItem(LOCAL_MANUAL_OFFLINE_KEY, enabled ? 'true' : 'false');
    } catch {
      // Ignore storage errors
    }
  }, []);

  useEffect(() => {
    let active = true;

    const verifyConnectivity = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (active) setBrowserOnline(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch('/api/health', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!active) return;
        setBrowserOnline(res.ok);
      } catch {
        if (active) setBrowserOnline(false);
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    const onOnline = () => {
      verifyConnectivity();
    };
    const onOffline = () => {
      if (active) setBrowserOnline(false);
    };
    const onFocusOrVisible = () => {
      if (document.visibilityState !== 'hidden') {
        verifyConnectivity();
      }
    };

    verifyConnectivity();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    const intervalId = window.setInterval(verifyConnectivity, 12000);

    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.clearInterval(intervalId);
    };
  }, []);

  const [stressLogs, setStressLogs] = useState<StressLogEntry[]>(() =>
    loadLocalJson<StressLogEntry[]>(LOCAL_STRESS_KEY, [])
  );
  const [sosEvents, setSosEvents] = useState<SosEventRecord[]>(() =>
    loadLocalJson<SosEventRecord[]>(LOCAL_SOS_KEY, [])
  );
  const [chatMessages, setChatMessages] = useState<GeminiChatMessage[]>(() =>
    loadLocalJson<GeminiChatMessage[]>(LOCAL_CHAT_KEY, [])
  );
  const [photoMemories, setPhotoMemories] = useState<PhotoMemoryItem[]>(() =>
    loadLocalJson<PhotoMemoryItem[]>(LOCAL_PHOTO_MEMORIES_KEY, DEFAULT_PHOTO_MEMORIES)
  );
  const [memoryReminders, setMemoryReminders] = useState<MemoryReminderItem[]>(() =>
    loadLocalJson<MemoryReminderItem[]>(LOCAL_MEMORY_REMINDERS_KEY, DEFAULT_MEMORY_REMINDERS)
  );

  const [liveLocation, setLiveLocation] = useState<LiveLocationState>({
    lat: DEMO_COORDS.lat,
    lng: DEMO_COORDS.lng,
    gpsConsentActive: false,
    updatedAtIso: new Date().toISOString(),
  });

  const emailVerificationPending = Boolean(user && !user.emailVerified);
  const cloudUserReady = Boolean(
    user && user.emailVerified && readyUid === user.uid && !isOfflineMode
  );

  const ensureUserAccountDoc = useCallback(
    async (u: User) => {
      if (!u.emailVerified || isOfflineMode) return;
      if (ensureInFlightRef.current && ensureInFlightRef.current.uid === u.uid) {
        return ensureInFlightRef.current.promise;
      }

      const run = async () => {
        const userPath = `users/${u.uid}`;
        const userRef = doc(db, 'users', u.uid);
        try {
          const snap = await getDoc(userRef);
          const displayName = (u.displayName || u.email || 'AbleBridge User').slice(0, 120);
          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: u.uid,
              displayName,
              role: 'caregiver',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            await updateDoc(userRef, {
              displayName,
              role: 'caregiver',
              updatedAt: serverTimestamp(),
            });
          }
          setReadyUid(u.uid);
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, userPath);
        } finally {
          if (ensureInFlightRef.current?.uid === u.uid) {
            ensureInFlightRef.current = null;
          }
        }
      };

      const promise = run();
      ensureInFlightRef.current = {uid: u.uid, promise};
      return promise;
    },
    [isOfflineMode]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u || !u.emailVerified) {
        setReadyUid(null);
        setAuthReady(true);
        return;
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Automatically sync Firestore network mode & recover user doc when returning online
  useEffect(() => {
    if (isOfflineMode) {
      disableNetwork(db).catch(() => {});
      return;
    }
    enableNetwork(db)
      .then(() => {
        if (user && user.emailVerified && readyUid !== user.uid) {
          return ensureUserAccountDoc(user);
        }
        return undefined;
      })
      .catch((err) => {
        console.error('Failed restoring Firestore network / user doc:', err);
      });
  }, [ensureUserAccountDoc, isOfflineMode, readyUid, user]);

  // Attach Firestore real-time listeners only when auth is ready, parent doc exists, AND online
  useEffect(() => {
    if (!authReady || !user || !cloudUserReady) {
      setStressLogs(loadLocalJson<StressLogEntry[]>(LOCAL_STRESS_KEY, []));
      setSosEvents(loadLocalJson<SosEventRecord[]>(LOCAL_SOS_KEY, []));
      setChatMessages(loadLocalJson<GeminiChatMessage[]>(LOCAL_CHAT_KEY, []));
      setPhotoMemories(
        loadLocalJson<PhotoMemoryItem[]>(LOCAL_PHOTO_MEMORIES_KEY, DEFAULT_PHOTO_MEMORIES)
      );
      setMemoryReminders(
        loadLocalJson<MemoryReminderItem[]>(LOCAL_MEMORY_REMINDERS_KEY, DEFAULT_MEMORY_REMINDERS)
      );
      return;
    }

    const stressPath = `users/${user.uid}/stressLogs`;
    const stressQuery = query(
      collection(db, 'users', user.uid, 'stressLogs'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubStress = onSnapshot(
      stressQuery,
      (snapshot) => {
        const nextLogs: StressLogEntry[] = snapshot.docs.map((d) => {
          const data = d.data();
          const ts = data.createdAt as Timestamp | undefined;
          return {
            id: d.id,
            stressScore: Number(data.stressScore ?? 5),
            mood: (data.mood as StressMood) || 'calm',
            mentalStatus: (data.mentalStatus as MentalStatusLevel) || 'stable',
            triggerNote: String(data.triggerNote ?? ''),
            copingAction: String(data.copingAction ?? ''),
            createdAtIso: ts ? ts.toDate().toISOString() : new Date().toISOString(),
          };
        });
        setStressLogs(nextLogs);
        saveLocalJson(LOCAL_STRESS_KEY, nextLogs.slice(0, 40));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, stressPath);
      }
    );

    const sosPath = `users/${user.uid}/sosEvents`;
    const sosQuery = query(
      collection(db, 'users', user.uid, 'sosEvents'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );

    const unsubSos = onSnapshot(
      sosQuery,
      (snapshot) => {
        const nextSos: SosEventRecord[] = snapshot.docs.map((d) => {
          const data = d.data();
          const cTs = data.createdAt as Timestamp | undefined;
          const uTs = data.updatedAt as Timestamp | undefined;
          return {
            id: d.id,
            reason: String(data.reason ?? 'SOS Event'),
            peakG: Number(data.peakG ?? 1.0),
            status: (data.status as SosEventRecord['status']) || 'active',
            lat: Number(data.lat ?? DEMO_COORDS.lat),
            lng: Number(data.lng ?? DEMO_COORDS.lng),
            createdAtIso: cTs ? cTs.toDate().toISOString() : new Date().toISOString(),
            updatedAtIso: uTs ? uTs.toDate().toISOString() : new Date().toISOString(),
          };
        });
        setSosEvents(nextSos);
        saveLocalJson(LOCAL_SOS_KEY, nextSos.slice(0, 25));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, sosPath);
      }
    );

    const chatPath = `users/${user.uid}/chatMessages`;
    const chatQuery = query(
      collection(db, 'users', user.uid, 'chatMessages'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'asc'),
      limit(40)
    );

    const unsubChat = onSnapshot(
      chatQuery,
      (snapshot) => {
        const nextChat: GeminiChatMessage[] = snapshot.docs.map((d) => {
          const data = d.data();
          const ts = data.createdAt as Timestamp | undefined;
          return {
            id: d.id,
            role: data.role === 'assistant' ? 'assistant' : 'user',
            persona: (data.persona as ChatPersona) || 'calm_coach',
            text: String(data.text ?? ''),
            modelUsed: String(data.modelUsed ?? 'gemini-4-hydrogen'),
            createdAtIso: ts ? ts.toDate().toISOString() : new Date().toISOString(),
          };
        });
        setChatMessages(nextChat);
        saveLocalJson(LOCAL_CHAT_KEY, nextChat.slice(-40));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, chatPath);
      }
    );

    const memPhotoPath = `users/${user.uid}/photoMemories`;
    const memPhotoQuery = query(
      collection(db, 'users', user.uid, 'photoMemories'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );

    const unsubPhotoMem = onSnapshot(
      memPhotoQuery,
      (snapshot) => {
        if (snapshot.empty) {
          // Keep current local memories if cloud album hasn't been populated yet
          return;
        }
        const nextPhotos: PhotoMemoryItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          const ts = data.createdAt as Timestamp | undefined;
          return {
            id: d.id,
            title: String(data.title ?? 'Memory Photo'),
            caption: String(data.caption ?? ''),
            category: (data.category as PhotoMemoryCategory) || 'other',
            imageDataUrl: String(data.imageDataUrl ?? ''),
            createdAtIso: ts ? ts.toDate().toISOString() : new Date().toISOString(),
          };
        });
        setPhotoMemories(nextPhotos);
        saveLocalJson(LOCAL_PHOTO_MEMORIES_KEY, nextPhotos.slice(0, 30));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, memPhotoPath);
      }
    );

    const remPath = `users/${user.uid}/memoryReminders`;
    const remQuery = query(
      collection(db, 'users', user.uid, 'memoryReminders'),
      where('ownerId', '==', user.uid),
      orderBy('createdAt', 'asc'),
      limit(40)
    );

    const unsubReminders = onSnapshot(
      remQuery,
      (snapshot) => {
        if (snapshot.empty) {
          return;
        }
        const nextRems: MemoryReminderItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          const ts = data.createdAt as Timestamp | undefined;
          return {
            id: d.id,
            title: String(data.title ?? 'Reminder'),
            notes: String(data.notes ?? ''),
            timeSlot: (data.timeSlot as ReminderTimeSlot) || 'anytime',
            confirmationMessage: String(data.confirmationMessage ?? ''),
            lastCompletedDate: String(data.lastCompletedDate ?? ''),
            lastCompletedTimeLabel: String(data.lastCompletedTimeLabel ?? ''),
            createdAtIso: ts ? ts.toDate().toISOString() : new Date().toISOString(),
          };
        });
        setMemoryReminders(nextRems);
        saveLocalJson(LOCAL_MEMORY_REMINDERS_KEY, nextRems.slice(0, 40));
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, remPath);
      }
    );

    return () => {
      unsubStress();
      unsubSos();
      unsubChat();
      unsubPhotoMem();
      unsubReminders();
    };
  }, [authReady, user, cloudUserReady]);

  const signInWithGoogle = async (): Promise<boolean> => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      return true;
    } catch (error) {
      setAuthError(formatAuthErrorMessage(error));
      return false;
    } finally {
      setIsSigningIn(false);
    }
  };

  const signInWithEmail = async (email: string, password: string): Promise<boolean> => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      return true;
    } catch (error) {
      setAuthError(formatAuthErrorMessage(error));
      return false;
    } finally {
      setIsSigningIn(false);
    }
  };

  const signUpWithEmail = async (payload: EmailSignupPayload): Promise<boolean> => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        payload.email.trim(),
        payload.password
      );
      const displayLabel =
        (payload.caregiverName || payload.patientName || payload.email).slice(0, 120);
      await updateProfile(cred.user, {displayName: displayLabel});
      await sendEmailVerification(cred.user).catch(() => {});
      return true;
    } catch (error) {
      setAuthError(formatAuthErrorMessage(error));
      return false;
    } finally {
      setIsSigningIn(false);
    }
  };

  const resendVerificationEmail = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    setAuthError(null);
    try {
      await sendEmailVerification(auth.currentUser);
      return true;
    } catch (error) {
      setAuthError(formatAuthErrorMessage(error));
      return false;
    }
  };

  const refreshVerificationStatus = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    const updated = auth.currentUser;
    setUser(updated);
    if (updated?.emailVerified) {
      await ensureUserAccountDoc(updated);
      return true;
    }
    return false;
  };

  const signOutUser = async () => {
    setAuthError(null);
    await signOut(auth);
  };

  const deleteAccountAndData = async (
    remoteAccessCode?: string,
    onLocalReset?: () => void
  ): Promise<{ok: boolean; message: string; requiresRecentLogin?: boolean}> => {
    const clearAllLocalStorage = () => {
      [
        CAREGIVER_STORAGE_KEY,
        LOCAL_STRESS_KEY,
        LOCAL_CHAT_KEY,
        LOCAL_SOS_KEY,
        LOCAL_REMOTE_MAP_KEY,
        LOCAL_PHOTO_MEMORIES_KEY,
        LOCAL_MEMORY_REMINDERS_KEY,
        LOCAL_MANUAL_OFFLINE_KEY,
        'ablebridge_accessibility_prefs_v1',
        'ablebridge_aac_custom_v1',
        'ablebridge_background_guardian_config_v1',
      ].forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {
          // Ignore storage removal errors
        }
      });
      setStressLogs([]);
      setSosEvents([]);
      setChatMessages([]);
      setPhotoMemories(DEFAULT_PHOTO_MEMORIES);
      setMemoryReminders(DEFAULT_MEMORY_REMINDERS);
      onLocalReset?.();
    };

    const current = auth.currentUser;
    if (!current || isOfflineMode) {
      clearAllLocalStorage();
      return {
        ok: true,
        message: isOfflineMode
          ? 'Local device data erased while offline. Connect online to also erase cloud Auth credentials.'
          : 'Local patient & caregiver data erased from this device.',
      };
    }

    const uid = current.uid;
    try {
      if (current.emailVerified) {
        const subcols = ['stressLogs', 'sosEvents', 'chatMessages', 'photoMemories', 'memoryReminders'];
        for (const sub of subcols) {
          const snap = await getDocs(
            query(collection(db, 'users', uid, sub), where('ownerId', '==', uid))
          );
          for (const item of snap.docs) {
            await deleteDoc(item.ref).catch(() => {});
          }
        }
        await deleteDoc(doc(db, 'users', uid, 'settings', 'caregiverProfile')).catch(() => {});
        if (remoteAccessCode && isValidRemoteCodeFormat(remoteAccessCode)) {
          await deleteDoc(doc(db, 'remoteLinks', remoteAccessCode.trim().toUpperCase())).catch(
            () => {}
          );
        }
        await deleteDoc(doc(db, 'users', uid)).catch(() => {});
      }

      await deleteUser(current);
      setUser(null);
      setReadyUid(null);
      clearAllLocalStorage();
      return {
        ok: true,
        message: 'Account and all cloud & local patient records permanently deleted.',
      };
    } catch (err) {
      const code = (err as {code?: string})?.code ?? '';
      if (code === 'auth/requires-recent-login') {
        return {
          ok: false,
          requiresRecentLogin: true,
          message:
            'For security, Firebase requires a fresh sign-in before deleting your login account. Please sign out and sign back in once, then tap Delete Account again.',
        };
      }
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Could not complete account deletion.',
      };
    }
  };

  const addStressLog = async (entry: Omit<StressLogEntry, 'id' | 'createdAtIso'>) => {
    const score = Math.min(10, Math.max(1, Math.round(entry.stressScore)));
    const triggerNote = entry.triggerNote.trim().slice(0, 400);
    const copingAction = entry.copingAction.trim().slice(0, 120);

    if (!user || !user.emailVerified || isOfflineMode) {
      const localItem: StressLogEntry = {
        id: `local_${Date.now()}`,
        stressScore: score,
        mood: entry.mood,
        mentalStatus: entry.mentalStatus,
        triggerNote,
        copingAction,
        createdAtIso: new Date().toISOString(),
      };
      const updated = [localItem, ...stressLogs].slice(0, 40);
      setStressLogs(updated);
      saveLocalJson(LOCAL_STRESS_KEY, updated);
      return;
    }

    const colPath = `users/${user.uid}/stressLogs`;
    try {
      await ensureUserAccountDoc(user);
      await addDoc(collection(db, 'users', user.uid, 'stressLogs'), {
        ownerId: user.uid,
        stressScore: score,
        mood: entry.mood,
        mentalStatus: entry.mentalStatus,
        triggerNote,
        copingAction,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, colPath);
    }
  };

  const deleteStressLog = async (id: string) => {
    if (!user || !user.emailVerified || isOfflineMode || id.startsWith('local_')) {
      const updated = stressLogs.filter((l) => l.id !== id);
      setStressLogs(updated);
      saveLocalJson(LOCAL_STRESS_KEY, updated);
      return;
    }
    const docPath = `users/${user.uid}/stressLogs/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'stressLogs', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  };

  const logSosEvent = async (payload: {
    reason: string;
    peakG: number;
    lat: number;
    lng: number;
  }): Promise<string | null> => {
    const safeReason = payload.reason.slice(0, 200) || 'Fall Impact Detected';
    const safePeakG = Math.min(50, Math.max(0, Number(payload.peakG)));
    const safeLat = Math.min(90, Math.max(-90, Number(payload.lat)));
    const safeLng = Math.min(180, Math.max(-180, Number(payload.lng)));

    if (!user || !user.emailVerified || isOfflineMode) {
      const nowIso = new Date().toISOString();
      const localSos: SosEventRecord = {
        id: `local_sos_${Date.now()}`,
        reason: safeReason,
        peakG: safePeakG,
        status: 'active',
        lat: safeLat,
        lng: safeLng,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
      };
      const updated = [localSos, ...sosEvents].slice(0, 25);
      setSosEvents(updated);
      saveLocalJson(LOCAL_SOS_KEY, updated);
      return localSos.id;
    }

    const colPath = `users/${user.uid}/sosEvents`;
    try {
      await ensureUserAccountDoc(user);
      const ref = await addDoc(collection(db, 'users', user.uid, 'sosEvents'), {
        ownerId: user.uid,
        reason: safeReason,
        peakG: safePeakG,
        status: 'active',
        lat: safeLat,
        lng: safeLng,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, colPath);
    }
  };

  const updateSosEventStatus = async (
    eventId: string,
    status: 'canceled' | 'dispatched'
  ) => {
    if (!eventId) return;
    if (!user || !user.emailVerified || isOfflineMode || eventId.startsWith('local_sos_')) {
      const updated = sosEvents.map((ev) =>
        ev.id === eventId ? {...ev, status, updatedAtIso: new Date().toISOString()} : ev
      );
      setSosEvents(updated);
      saveLocalJson(LOCAL_SOS_KEY, updated);
      return;
    }
    const docPath = `users/${user.uid}/sosEvents/${eventId}`;
    try {
      await updateDoc(doc(db, 'users', user.uid, 'sosEvents', eventId), {
        status,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, docPath);
    }
  };

  const saveChatMessages = async (
    items: Array<Omit<GeminiChatMessage, 'id' | 'createdAtIso'>>
  ) => {
    if (!user || !user.emailVerified || isOfflineMode) {
      const now = Date.now();
      const newLocal = items.map((item, idx) => ({
        ...item,
        id: `local_chat_${now}_${idx}`,
        text: item.text.slice(0, 6000),
        createdAtIso: new Date(now + idx).toISOString(),
      }));
      const updated = [...chatMessages, ...newLocal].slice(-40);
      setChatMessages(updated);
      saveLocalJson(LOCAL_CHAT_KEY, updated);
      return;
    }

    const colPath = `users/${user.uid}/chatMessages`;
    try {
      await ensureUserAccountDoc(user);
      for (const item of items) {
        await addDoc(collection(db, 'users', user.uid, 'chatMessages'), {
          ownerId: user.uid,
          role: item.role,
          persona: item.persona,
          text: item.text.slice(0, 6000) || '...',
          modelUsed: item.modelUsed.slice(0, 64),
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, colPath);
    }
  };

  const clearChatMessages = async () => {
    if (!user || !user.emailVerified || isOfflineMode) {
      setChatMessages([]);
      saveLocalJson(LOCAL_CHAT_KEY, []);
      return;
    }
    const toDelete = [...chatMessages];
    for (const msg of toDelete) {
      if (!msg.id.startsWith('local_')) {
        const docPath = `users/${user.uid}/chatMessages/${msg.id}`;
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'chatMessages', msg.id));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, docPath);
        }
      }
    }
  };

  const addPhotoMemory = async (entry: {
    title: string;
    caption: string;
    category: PhotoMemoryCategory;
    imageDataUrl: string;
  }) => {
    const safeTitle = entry.title.trim().slice(0, 120) || 'Saved Memory';
    const safeCaption = entry.caption.trim().slice(0, 500);
    const safeImg = entry.imageDataUrl.slice(0, 95000);
    if (!safeImg) return;

    const localItem: PhotoMemoryItem = {
      id: `local_mem_${Date.now()}`,
      title: safeTitle,
      caption: safeCaption,
      category: entry.category,
      imageDataUrl: safeImg,
      createdAtIso: new Date().toISOString(),
    };
    const nextLocal = [localItem, ...photoMemories].slice(0, 30);
    setPhotoMemories(nextLocal);
    saveLocalJson(LOCAL_PHOTO_MEMORIES_KEY, nextLocal);

    if (!user || !user.emailVerified || isOfflineMode) return;
    const colPath = `users/${user.uid}/photoMemories`;
    try {
      await ensureUserAccountDoc(user);
      await addDoc(collection(db, 'users', user.uid, 'photoMemories'), {
        ownerId: user.uid,
        title: safeTitle,
        caption: safeCaption,
        category: entry.category,
        imageDataUrl: safeImg,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, colPath);
    }
  };

  const deletePhotoMemory = async (id: string) => {
    const updated = photoMemories.filter((m) => m.id !== id);
    setPhotoMemories(updated);
    saveLocalJson(LOCAL_PHOTO_MEMORIES_KEY, updated);

    if (!user || !user.emailVerified || isOfflineMode || id.startsWith('local_')) return;
    const docPath = `users/${user.uid}/photoMemories/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'photoMemories', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  };

  const addMemoryReminder = async (entry: {
    title: string;
    notes: string;
    timeSlot: ReminderTimeSlot;
    confirmationMessage: string;
  }) => {
    const safeTitle = entry.title.trim().slice(0, 140) || 'Daily Reminder';
    const safeNotes = entry.notes.trim().slice(0, 300);
    const safeConfirm = (
      entry.confirmationMessage.trim() || `Confirmed! ${safeTitle} is marked done for today.`
    ).slice(0, 240);

    const localItem: MemoryReminderItem = {
      id: `local_rem_${Date.now()}`,
      title: safeTitle,
      notes: safeNotes,
      timeSlot: entry.timeSlot,
      confirmationMessage: safeConfirm,
      lastCompletedDate: '',
      lastCompletedTimeLabel: '',
      createdAtIso: new Date().toISOString(),
    };
    const nextLocal = [...memoryReminders, localItem].slice(0, 40);
    setMemoryReminders(nextLocal);
    saveLocalJson(LOCAL_MEMORY_REMINDERS_KEY, nextLocal);

    if (!user || !user.emailVerified || isOfflineMode) return;
    const colPath = `users/${user.uid}/memoryReminders`;
    try {
      await ensureUserAccountDoc(user);
      await addDoc(collection(db, 'users', user.uid, 'memoryReminders'), {
        ownerId: user.uid,
        title: safeTitle,
        notes: safeNotes,
        timeSlot: entry.timeSlot,
        confirmationMessage: safeConfirm,
        lastCompletedDate: '',
        lastCompletedTimeLabel: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, colPath);
    }
  };

  const toggleMemoryReminderDone = async (id: string): Promise<MemoryReminderItem | null> => {
    const todayKey = getLocalCalendarDateKey();
    const target = memoryReminders.find((r) => r.id === id);
    if (!target) return null;

    const alreadyDoneToday = target.lastCompletedDate === todayKey;
    const nextDate = alreadyDoneToday ? '' : todayKey;
    const nextTime = alreadyDoneToday
      ? ''
      : new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});

    const updatedItem: MemoryReminderItem = {
      ...target,
      lastCompletedDate: nextDate,
      lastCompletedTimeLabel: nextTime,
    };
    const updatedList = memoryReminders.map((r) => (r.id === id ? updatedItem : r));
    setMemoryReminders(updatedList);
    saveLocalJson(LOCAL_MEMORY_REMINDERS_KEY, updatedList);

    if (user && user.emailVerified && !isOfflineMode && !id.startsWith('local_')) {
      const docPath = `users/${user.uid}/memoryReminders/${id}`;
      try {
        await ensureUserAccountDoc(user);
        await updateDoc(doc(db, 'users', user.uid, 'memoryReminders', id), {
          lastCompletedDate: nextDate,
          lastCompletedTimeLabel: nextTime,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, docPath);
      }
    }
    return updatedItem;
  };

  const resetTodayMemoryReminders = async () => {
    const updatedList = memoryReminders.map((r) => ({
      ...r,
      lastCompletedDate: '',
      lastCompletedTimeLabel: '',
    }));
    setMemoryReminders(updatedList);
    saveLocalJson(LOCAL_MEMORY_REMINDERS_KEY, updatedList);

    if (!user || !user.emailVerified || isOfflineMode) return;
    await ensureUserAccountDoc(user);
    for (const r of updatedList) {
      if (!r.id.startsWith('local_')) {
        await updateDoc(doc(db, 'users', user.uid, 'memoryReminders', r.id), {
          lastCompletedDate: '',
          lastCompletedTimeLabel: '',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    }
  };

  const deleteMemoryReminder = async (id: string) => {
    const updated = memoryReminders.filter((r) => r.id !== id);
    setMemoryReminders(updated);
    saveLocalJson(LOCAL_MEMORY_REMINDERS_KEY, updated);

    if (!user || !user.emailVerified || isOfflineMode || id.startsWith('local_')) return;
    const docPath = `users/${user.uid}/memoryReminders/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'memoryReminders', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, docPath);
    }
  };

  const syncCaregiverProfileToCloud = useCallback(
    async (
      config: CaregiverConfig,
      prefs: {theme: ThemeMode; textSize: TextSize; voiceSpeed: VoiceSpeed}
    ) => {
      if (!user || !user.emailVerified || isOfflineMode) return;
      const docPath = `users/${user.uid}/settings/caregiverProfile`;
      const settingsRef = doc(db, 'users', user.uid, 'settings', 'caregiverProfile');
      try {
        await ensureUserAccountDoc(user);
        const existingSnap = await getDoc(settingsRef);
        const p = config.profile;
        const safeEnabledModules =
          Array.isArray(p.enabledModules) && p.enabledModules.length > 0
            ? p.enabledModules.slice(0, 25).map((m) => String(m))
            : ALL_FUNCTIONAL_MODULES.slice(0, 25);
        const sanitizedPayload = {
          ownerId: user.uid,
          pin: /^\d{4}$/.test(config.pin) ? config.pin : '1234',
          fullName: (p.fullName || '').slice(0, 120),
          age: (p.age || '').slice(0, 16),
          bloodType: (p.bloodType || '').slice(0, 16),
          allergiesAndNotes: (p.allergiesAndNotes || '').slice(0, 1000),
          caregiverName: (p.caregiverName || '').slice(0, 120),
          caregiverPhone: (p.caregiverPhone || '').slice(0, 40),
          alertEmail: (p.alertEmail || '').slice(0, 160),
          avatarDataUrl: (p.avatarDataUrl || '').slice(0, 95000),
          disabilities: Array.isArray(p.disabilities)
            ? p.disabilities.slice(0, 25).map((d) => String(d))
            : [],
          enabledModules: safeEnabledModules,
          simplifiedMode: Boolean(p.simplifiedMode),
          lowStimulationMode: Boolean(p.lowStimulationMode),
          enable3DBackground: Boolean(p.enable3DBackground),
          childFriendlyMode: Boolean(p.childFriendlyMode),
          backgroundGuardianEnabled: Boolean(p.backgroundGuardianEnabled),
          fallGThreshold: Math.min(6.0, Math.max(1.0, Number(p.fallGThreshold) || 2.6)),
          inactivitySeconds: Math.min(3600, Math.max(10, Math.round(Number(p.inactivitySeconds) || 30))),
          soundThresholdDb: Math.min(120, Math.max(30, Math.round(Number(p.soundThresholdDb) || 72))),
          accidentFreeDays: Math.min(36500, Math.max(0, Math.round(Number(p.accidentFreeDays ?? 0) || 0))),
          streakLastResetIso: (p.streakLastResetIso || '').slice(0, 40),
          termsAcceptedAtIso: (p.termsAcceptedAtIso || '').slice(0, 40),
          adultCaregiverConfirmed: Boolean(p.adultCaregiverConfirmed),
          remoteAccessCode: (p.remoteAccessCode || '').toUpperCase().slice(0, 16),
          theme: prefs.theme,
          textSize: prefs.textSize,
          voiceSpeed: Math.min(2.0, Math.max(0.5, Number(prefs.voiceSpeed) || 1.0)),
          aiAssistantNickname: (p.aiAssistantNickname || 'Nova').slice(0, 40),
          talkBackEnabled: Boolean(p.talkBackEnabled),
          voicePersona: [
            'natural-female',
            'natural-male',
            'human-warm',
            'human-gentle',
            'robotic',
            'system',
          ].includes(String(p.voicePersona))
            ? p.voicePersona
            : 'natural-female',
          liveWallpaperType: [
            'aurora-waves',
            'liquid-glass',
            'cosmic-orbs',
            'astrolabe',
            'off',
          ].includes(String(p.liveWallpaperType))
            ? p.liveWallpaperType
            : 'aurora-waves',
          floatingAiEnabled: p.floatingAiEnabled !== undefined ? Boolean(p.floatingAiEnabled) : true,
          preferredLanguage: [
            'en-US',
            'ml-IN',
            'hi-IN',
            'ta-IN',
            'kn-IN',
            'te-IN',
            'es-ES',
            'fr-FR',
            'ar-SA',
          ].includes(String(p.preferredLanguage))
            ? p.preferredLanguage
            : 'en-US',
          smartBatterySaverEnabled:
            p.smartBatterySaverEnabled !== undefined ? Boolean(p.smartBatterySaverEnabled) : true,
          batterySaverThreshold: Math.min(
            50,
            Math.max(5, Math.round(Number(p.batterySaverThreshold) || 20))
          ),
          updatedAt: serverTimestamp(),
        };

        if (!existingSnap.exists()) {
          await setDoc(settingsRef, {
            ...sanitizedPayload,
            createdAt: serverTimestamp(),
          });
        } else {
          await updateDoc(settingsRef, sanitizedPayload);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, docPath);
      }
    },
    [ensureUserAccountDoc, isOfflineMode, user]
  );

  const loadCaregiverProfileFromCloud = useCallback(async () => {
    if (!user || !user.emailVerified || isOfflineMode) return null;
    const docPath = `users/${user.uid}/settings/caregiverProfile`;
    try {
      await ensureUserAccountDoc(user);
      const snap = await getDoc(doc(db, 'users', user.uid, 'settings', 'caregiverProfile'));
      if (!snap.exists()) return null;
      const d = snap.data();
      const cloudCode = String(d.remoteAccessCode ?? '').trim().toUpperCase();
      return {
        config: {
          pin: /^\d{4}$/.test(String(d.pin ?? '')) ? String(d.pin) : '1234',
          profile: {
            fullName: String(d.fullName ?? ''),
            age: String(d.age ?? ''),
            bloodType: String(d.bloodType ?? ''),
            allergiesAndNotes: String(d.allergiesAndNotes ?? ''),
            caregiverName: String(d.caregiverName ?? ''),
            caregiverPhone: String(d.caregiverPhone ?? ''),
            alertEmail: String(d.alertEmail ?? ''),
            avatarDataUrl: String(d.avatarDataUrl ?? ''),
            disabilities: Array.isArray(d.disabilities) ? d.disabilities : [],
            enabledModules:
              Array.isArray(d.enabledModules) && d.enabledModules.length > 0
                ? mergeNewlyAddedToolkitModules(d.enabledModules)
                : [...ALL_FUNCTIONAL_MODULES],
            simplifiedMode: Boolean(d.simplifiedMode),
            lowStimulationMode: Boolean(d.lowStimulationMode),
            enable3DBackground:
              typeof d.enable3DBackground === 'boolean' ? d.enable3DBackground : true,
            childFriendlyMode: Boolean(d.childFriendlyMode),
            backgroundGuardianEnabled: Boolean(d.backgroundGuardianEnabled),
            fallGThreshold: Number(d.fallGThreshold ?? 2.6),
            inactivitySeconds: Number(d.inactivitySeconds ?? 30),
            soundThresholdDb: Number(d.soundThresholdDb ?? 72),
            accidentFreeDays: Number(d.accidentFreeDays ?? 0),
            streakLastResetIso: String(d.streakLastResetIso ?? ''),
            termsAcceptedAtIso: String(d.termsAcceptedAtIso ?? ''),
            adultCaregiverConfirmed: Boolean(d.adultCaregiverConfirmed),
            remoteAccessCode: isValidRemoteCodeFormat(cloudCode)
              ? cloudCode
              : generateRemoteAccessCode(),
            aiAssistantNickname: String(d.aiAssistantNickname ?? 'Nova'),
            talkBackEnabled: Boolean(d.talkBackEnabled),
            voicePersona: (d.voicePersona as any) || 'natural-female',
            liveWallpaperType: (d.liveWallpaperType as any) || 'aurora-waves',
            floatingAiEnabled: d.floatingAiEnabled !== undefined ? Boolean(d.floatingAiEnabled) : true,
            preferredLanguage: [
              'en-US',
              'ml-IN',
              'hi-IN',
              'ta-IN',
              'kn-IN',
              'te-IN',
              'es-ES',
              'fr-FR',
              'ar-SA',
            ].includes(String(d.preferredLanguage))
              ? (d.preferredLanguage as any)
              : 'en-US',
            smartBatterySaverEnabled:
              d.smartBatterySaverEnabled !== undefined
                ? Boolean(d.smartBatterySaverEnabled)
                : true,
            batterySaverThreshold: Number(d.batterySaverThreshold ?? 20),
          },
        },
        theme: (d.theme as ThemeMode) || 'dark',
        textSize: (d.textSize as TextSize) || 'normal',
        voiceSpeed: (d.voiceSpeed as VoiceSpeed) || 1.0,
      };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, docPath);
    }
  }, [ensureUserAccountDoc, isOfflineMode, user]);

  const setLiveLocationState = useCallback(
    (coords: {lat: number; lng: number}, gpsConsentActive: boolean) => {
      setLiveLocation({
        lat: Math.min(90, Math.max(-90, Number(coords.lat))),
        lng: Math.min(180, Math.max(-180, Number(coords.lng))),
        gpsConsentActive,
        updatedAtIso: new Date().toISOString(),
      });
    },
    []
  );

  const publishRemoteTelemetry = useCallback(
    async (
      profile: PatientProfile,
      sosStatus: 'monitoring' | 'countdown' | 'dispatched' = 'monitoring',
      locationOverride?: LiveLocationState
    ) => {
      const code = profile.remoteAccessCode?.trim().toUpperCase() || '';
      if (!isValidRemoteCodeFormat(code)) return;

      const loc = locationOverride ?? liveLocation;
      const latestStress = stressLogs[0];
      const firstAlias =
        (profile.fullName.trim().split(/\s+/)[0] || 'Patient').slice(0, 60) || 'Patient';

      const localSnapshot: RemoteTelemetrySnapshot = {
        accessCode: code,
        ownerId: user?.uid || 'local_device',
        patientAlias: firstAlias,
        lat: Number(loc.lat.toFixed(6)),
        lng: Number(loc.lng.toFixed(6)),
        gpsConsentActive: loc.gpsConsentActive,
        accidentFreeDays: Math.min(36500, Math.max(0, Math.round(profile.accidentFreeDays ?? 0))),
        latestStressScore: latestStress
          ? Math.min(10, Math.max(1, Math.round(latestStress.stressScore)))
          : 3,
        latestMood: latestStress?.mood || 'calm',
        latestSosStatus: sosStatus,
        updatedAtIso: new Date().toISOString(),
      };

      // Always mirror locally so same-device & offline demo tracking work seamlessly
      const map = loadLocalJson<Record<string, RemoteTelemetrySnapshot>>(LOCAL_REMOTE_MAP_KEY, {});
      map[code] = localSnapshot;
      saveLocalJson(LOCAL_REMOTE_MAP_KEY, map);

      if (!user || !user.emailVerified || isOfflineMode) return;

      const remotePath = `remoteLinks/${code}`;
      const remoteRef = doc(db, 'remoteLinks', code);
      try {
        await ensureUserAccountDoc(user);
        const snap = await getDoc(remoteRef);
        const payload = {
          ownerId: user.uid,
          patientAlias: localSnapshot.patientAlias,
          lat: localSnapshot.lat,
          lng: localSnapshot.lng,
          gpsConsentActive: localSnapshot.gpsConsentActive,
          accidentFreeDays: localSnapshot.accidentFreeDays,
          latestStressScore: localSnapshot.latestStressScore,
          latestMood: localSnapshot.latestMood,
          latestSosStatus: localSnapshot.latestSosStatus,
          updatedAt: serverTimestamp(),
        };
        if (!snap.exists()) {
          await setDoc(remoteRef, {
            ...payload,
            createdAt: serverTimestamp(),
          });
        } else if (snap.data()?.ownerId === user.uid) {
          await updateDoc(remoteRef, payload);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, remotePath);
      }
    },
    [ensureUserAccountDoc, isOfflineMode, liveLocation, stressLogs, user]
  );

  const subscribeToRemoteCode = useCallback(
    (
      accessCode: string,
      onData: (
        snapshot: RemoteTelemetrySnapshot | null,
        source: 'cloud' | 'local',
        errorMsg?: string
      ) => void
    ) => {
      const normalized = accessCode.trim().toUpperCase();
      if (!isValidRemoteCodeFormat(normalized)) {
        onData(null, 'local', 'Enter an 8-character uppercase code (letters & numbers).');
        return () => {};
      }

      const emitLocalMirror = () => {
        const map = loadLocalJson<Record<string, RemoteTelemetrySnapshot>>(
          LOCAL_REMOTE_MAP_KEY,
          {}
        );
        const hit = map[normalized] ?? null;
        if (hit) {
          onData(hit, 'local');
        } else {
          onData(
            null,
            'local',
            user
              ? 'No active session found for this code yet.'
              : 'No local session matches that code. Sign in to track remote devices across the cloud.'
          );
        }
      };

      const onStorage = (ev: StorageEvent) => {
        if (ev.key === LOCAL_REMOTE_MAP_KEY) {
          emitLocalMirror();
        }
      };
      window.addEventListener('storage', onStorage);

      if (!user || isOfflineMode) {
        emitLocalMirror();
        return () => {
          window.removeEventListener('storage', onStorage);
        };
      }

      const remoteRef = doc(db, 'remoteLinks', normalized);
      const unsub = onSnapshot(
        remoteRef,
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            const ts = d.updatedAt as Timestamp | undefined;
            onData(
              {
                accessCode: normalized,
                ownerId: String(d.ownerId ?? ''),
                patientAlias: String(d.patientAlias ?? 'Patient'),
                lat: Number(d.lat ?? DEMO_COORDS.lat),
                lng: Number(d.lng ?? DEMO_COORDS.lng),
                gpsConsentActive: Boolean(d.gpsConsentActive),
                accidentFreeDays: Number(d.accidentFreeDays ?? 0),
                latestStressScore: Number(d.latestStressScore ?? 3),
                latestMood: (d.latestMood as StressMood) || 'calm',
                latestSosStatus:
                  (d.latestSosStatus as RemoteTelemetrySnapshot['latestSosStatus']) || 'monitoring',
                updatedAtIso: ts ? ts.toDate().toISOString() : new Date().toISOString(),
              },
              'cloud'
            );
          } else {
            emitLocalMirror();
          }
        },
        (error) => {
          emitLocalMirror();
          console.warn('Remote link listener error:', error.message);
        }
      );

      return () => {
        window.removeEventListener('storage', onStorage);
        unsub();
      };
    },
    [isOfflineMode, user]
  );

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        cloudUserReady,
        browserOnline,
        manualOfflineMode,
        setManualOfflineMode,
        isOfflineMode,
        isSigningIn,
        authError,
        clearAuthError: () => setAuthError(null),
        emailVerificationPending,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resendVerificationEmail,
        refreshVerificationStatus,
        signOutUser,
        deleteAccountAndData,
        stressLogs,
        addStressLog,
        deleteStressLog,
        sosEvents,
        logSosEvent,
        updateSosEventStatus,
        chatMessages,
        saveChatMessages,
        clearChatMessages,
        photoMemories,
        addPhotoMemory,
        deletePhotoMemory,
        memoryReminders,
        addMemoryReminder,
        toggleMemoryReminderDone,
        resetTodayMemoryReminders,
        deleteMemoryReminder,
        syncCaregiverProfileToCloud,
        loadCaregiverProfileFromCloud,
        liveLocation,
        setLiveLocationState,
        publishRemoteTelemetry,
        subscribeToRemoteCode,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used inside FirebaseProvider');
  }
  return ctx;
}
