import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Nfc,
  Pill,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import {ModuleHeader} from '../components/ModuleHeader';
import {
  LanguageCode,
  MedicineFoodRule,
  MedicineReminderItem,
  MultimodalAlert,
  RoutineCheckinEntry,
  RoutineDefinition,
} from '../types';
import {getLocalizedModuleMeta, t, useAppLanguage} from '../utils/i18n';
import {playAlertSound, speakText, triggerVibration} from '../utils/multimodal';
import {getLocalCalendarDateKey} from '../utils/patientProfile';

interface RoutineCoachModuleProps {
  onBack: () => void;
  voiceSpeed: number;
  language?: LanguageCode;
  onEmitAlert: (alert: Omit<MultimodalAlert, 'id'>) => void;
}

const ROUTINE_CHECKIN_KEY = 'ablebridge_routine_checkin_v1';
const CUSTOM_ROUTINES_KEY = 'ablebridge_custom_routines_v1';
const MEDICINE_REMINDERS_KEY = 'ablebridge_medicine_reminders_v1';

const FOOD_RULE_LABELS: Record<MedicineFoodRule, string> = {
  with_food: 'Take With Food',
  before_food: 'Take Before Meal (Empty Stomach)',
  after_food: 'Take Right After Meal',
  full_glass_water: 'Take With Full Glass of Water',
  before_sleep: 'Take Before Sleep',
  anytime: 'Take Anytime as Scheduled',
};

const INSTRUCTION_TEMPLATES: Array<{label: string; rule: MedicineFoodRule; text: string}> = [
  {
    label: 'Tablet + Water',
    rule: 'full_glass_water',
    text: '1. Sit upright and pour a full glass of water. 2. Place 1 tablet on your tongue and swallow whole (do not crush or chew). 3. Drink the rest of the water and stay upright for 10 minutes.',
  },
  {
    label: 'After Meal Dose',
    rule: 'after_food',
    text: '1. Finish your meal or light snack first to protect your stomach. 2. Check the pill name and dosage carefully. 3. Swallow the dose with half a glass of plain water.',
  },
  {
    label: 'Inhaler Puffs',
    rule: 'anytime',
    text: '1. Remove cap and shake inhaler firmly for 5 seconds. 2. Breathe out fully away from the mouthpiece. 3. Seal lips around mouthpiece, press down once while breathing in slowly and deeply, and hold breath for 10 seconds.',
  },
  {
    label: 'Liquid Syrup',
    rule: 'with_food',
    text: '1. Shake the bottle gently before opening. 2. Use the marked dosing cup or syringe (never a kitchen spoon) to measure exact milliliters. 3. Drink the dose slowly, followed by a sip of water.',
  },
];

const BUILTIN_ROUTINES: RoutineDefinition[] = [
  {
    id: 'medication',
    nfcTagId: 'NFC-PILL-01',
    nfcTagLabel: 'Pillbox Tag',
    title: 'Taking Morning Medication',
    category: 'Health & Daily Care',
    emoji: '💊',
    scheduledTime: '08:30',
    steps: [
      {
        title: 'Fill a Full Glass of Water',
        instruction: 'Pour a clean glass of room-temperature drinking water before opening your pills.',
        emoji: '🥛',
        tip: 'Place the glass on a steady flat mat.',
      },
      {
        title: 'Open the Today Compartment',
        instruction: 'Check the day label on your pill organizer and open only today’s morning slot.',
        emoji: '📅',
        tip: 'Verify the compartment matches today’s day of the week.',
      },
      {
        title: 'Swallow Medication with Water',
        instruction: 'Take the tablets one at a time with a full sip of water while sitting upright.',
        emoji: '💊',
        tip: 'Do not lie down immediately after swallowing.',
      },
      {
        title: 'Close Organizer & Mark Taken',
        instruction: 'Snap the lid closed securely and return the pillbox to its morning shelf.',
        emoji: '✅',
        tip: 'Consistent placement prevents double dosing.',
      },
    ],
  },
  {
    id: 'laundry',
    nfcTagId: 'NFC-LAUNDRY-02',
    nfcTagLabel: 'Laundry Tag',
    title: 'Operating Washing Machine',
    category: 'Home Appliances',
    emoji: '🧺',
    scheduledTime: '11:00',
    steps: [
      {
        title: 'Load Clothes Loosely',
        instruction: 'Place clothes into the drum without packing tightly. Leave a hand’s width of space at the top.',
        emoji: '👕',
        tip: 'Check pockets for keys or tissues first.',
      },
      {
        title: 'Add Detergent Pod or Liquid',
        instruction: 'Place one detergent pod inside the drum or pour liquid up to Line 1 in the tray.',
        emoji: '🫧',
        tip: 'Too much soap leaves residue.',
      },
      {
        title: 'Select Normal Warm Cycle',
        instruction: 'Turn the dial to Normal Wash and confirm the door latches with a firm click.',
        emoji: '🎛️',
        tip: 'Listen for the door click.',
      },
      {
        title: 'Press Start Button',
        instruction: 'Press and hold the Start button for one second until the timer lights up.',
        emoji: '▶️',
        tip: 'Set a 45-minute reminder to move clothes to the dryer.',
      },
    ],
  },
  {
    id: 'leaving',
    nfcTagId: 'NFC-KITCHEN-03',
    nfcTagLabel: 'Kitchen Tag',
    title: 'Leaving Home Safely',
    category: 'Safety Checklist',
    emoji: '🚪',
    scheduledTime: '14:00',
    steps: [
      {
        title: 'Check Kitchen Stove & Appliances',
        instruction: 'Confirm all stove knobs are pointing straight up to OFF and the kettle is unplugged.',
        emoji: '🍳',
        tip: 'Touch or visually inspect each dial.',
      },
      {
        title: 'Turn Off Lights & Close Windows',
        instruction: 'Switch off hallway lights and verify balcony or kitchen windows are latched.',
        emoji: '🪟',
        tip: 'Saves energy and keeps home secure.',
      },
      {
        title: 'Gather Keys, Phone & ID',
        instruction: 'Pat your pockets or bag to verify you have your house keys, charged phone, and ID card.',
        emoji: '🔑',
        tip: 'Keep keys on a bright lanyard.',
      },
      {
        title: 'Lock Front Door Firmly',
        instruction: 'Pull the front door closed and turn the deadbolt until it locks completely.',
        emoji: '🔒',
        tip: 'Give the handle one gentle test pull.',
      },
    ],
  },
];

const DEFAULT_MEDICINES: MedicineReminderItem[] = [
  {
    id: 'med_morning_vit',
    name: 'Vitamin D3 + Calcium',
    dosage: '1 tablet (500 mg)',
    scheduledTime: '08:30',
    foodRule: 'after_food',
    instructions:
      '1. Finish breakfast first so it absorbs gently. 2. Swallow 1 tablet whole with a full glass of water. 3. Do not crush or chew the tablet.',
    lastTakenDate: '',
    lastTakenTimeLabel: '',
    createdAtIso: new Date().toISOString(),
  },
  {
    id: 'med_evening_care',
    name: 'Evening Daily Care Tablet',
    dosage: '1 tablet',
    scheduledTime: '19:30',
    foodRule: 'full_glass_water',
    instructions:
      '1. Sit upright in a comfortable chair. 2. Take 1 tablet with a full glass of plain water. 3. Stay upright for 10 minutes before lying down.',
    lastTakenDate: '',
    lastTakenTimeLabel: '',
    createdAtIso: new Date().toISOString(),
  },
];

interface StoredCheckinData {
  dateKey: string;
  completedMap: Record<string, RoutineCheckinEntry>;
  scheduleOverrides: Record<string, string>;
  snoozedUntilMs: Record<string, number>;
}

function loadCheckinData(): StoredCheckinData {
  const today = getLocalCalendarDateKey();
  try {
    const raw = localStorage.getItem(ROUTINE_CHECKIN_KEY);
    if (!raw) {
      return {
        dateKey: today,
        completedMap: {},
        scheduleOverrides: {},
        snoozedUntilMs: {},
      };
    }
    const parsed = JSON.parse(raw) as Partial<StoredCheckinData>;
    const isSameDay = parsed.dateKey === today;
    return {
      dateKey: today,
      completedMap: isSameDay && parsed.completedMap ? parsed.completedMap : {},
      scheduleOverrides: parsed.scheduleOverrides ?? {},
      snoozedUntilMs: isSameDay && parsed.snoozedUntilMs ? parsed.snoozedUntilMs : {},
    };
  } catch {
    return {
      dateKey: today,
      completedMap: {},
      scheduleOverrides: {},
      snoozedUntilMs: {},
    };
  }
}

function loadCustomRoutines(): RoutineDefinition[] {
  try {
    const raw = localStorage.getItem(CUSTOM_ROUTINES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RoutineDefinition[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadMedicines(): MedicineReminderItem[] {
  try {
    const raw = localStorage.getItem(MEDICINE_REMINDERS_KEY);
    if (raw === null) {
      localStorage.setItem(MEDICINE_REMINDERS_KEY, JSON.stringify(DEFAULT_MEDICINES));
      return DEFAULT_MEDICINES;
    }
    const parsed = JSON.parse(raw) as MedicineReminderItem[];
    return Array.isArray(parsed) ? parsed : DEFAULT_MEDICINES;
  } catch {
    return DEFAULT_MEDICINES;
  }
}

function getMinutesFromTimeStr(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 23 * 60 + 59;
  return h * 60 + m;
}

function format12Hour(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export const RoutineCoachModule: React.FC<RoutineCoachModuleProps> = ({
  onBack,
  voiceSpeed,
  language,
  onEmitAlert,
}) => {
  const activeLang = useAppLanguage(language);
  const moduleMeta = getLocalizedModuleMeta(activeLang, 'routine');
  const [customRoutines, setCustomRoutines] = useState<RoutineDefinition[]>(loadCustomRoutines);
  const [checkinData, setCheckinData] = useState<StoredCheckinData>(loadCheckinData);
  const [medicines, setMedicines] = useState<MedicineReminderItem[]>(loadMedicines);
  const [nowClock, setNowClock] = useState<Date>(() => new Date());

  const [selectedId, setSelectedId] = useState<string>(BUILTIN_ROUTINES[0].id);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [completed, setCompleted] = useState<boolean>(false);

  // Add Custom Daily Task form
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskTime, setNewTaskTime] = useState('09:00');
  const [newTaskEmoji, setNewTaskEmoji] = useState('📝');

  // Add Medicine Reminder form
  const [showAddMed, setShowAddMed] = useState(false);
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('1 tablet');
  const [medTime, setMedTime] = useState('09:00');
  const [medFoodRule, setMedFoodRule] = useState<MedicineFoodRule>('with_food');
  const [medInstructions, setMedInstructions] = useState(INSTRUCTION_TEMPLATES[0].text);

  const alertedOverdueIdsRef = useRef<Set<string>>(new Set());

  const todayKey = getLocalCalendarDateKey(nowClock);

  const allRoutines = useMemo(
    () => [...BUILTIN_ROUTINES, ...customRoutines],
    [customRoutines]
  );

  const routine = allRoutines.find((r) => r.id === selectedId) ?? allRoutines[0];
  const currentStep = routine.steps[stepIndex];
  const progressPct = completed
    ? 100
    : Math.round(((stepIndex + 1) / routine.steps.length) * 100);

  // Persist custom routines, check-ins, and medicines to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_ROUTINES_KEY, JSON.stringify(customRoutines));
    } catch {
      // Ignore storage errors
    }
  }, [customRoutines]);

  useEffect(() => {
    try {
      localStorage.setItem(ROUTINE_CHECKIN_KEY, JSON.stringify(checkinData));
    } catch {
      // Ignore storage errors
    }
  }, [checkinData]);

  useEffect(() => {
    try {
      localStorage.setItem(MEDICINE_REMINDERS_KEY, JSON.stringify(medicines));
    } catch {
      // Ignore storage errors
    }
  }, [medicines]);

  // Refresh clock & rollover date key automatically every 20 seconds
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = new Date();
      setNowClock(next);
      const nextDateKey = getLocalCalendarDateKey(next);
      setCheckinData((prev) =>
        prev.dateKey === nextDateKey
          ? prev
          : {
              dateKey: nextDateKey,
              completedMap: {},
              scheduleOverrides: prev.scheduleOverrides,
              snoozedUntilMs: {},
            }
      );
    }, 20000);
    return () => window.clearInterval(id);
  }, []);

  const currentMinutesOfDay = nowClock.getHours() * 60 + nowClock.getMinutes();
  const currentMs = nowClock.getTime();

  const getRoutineScheduledTime = useCallback(
    (r: RoutineDefinition) => checkinData.scheduleOverrides[r.id] || r.scheduledTime,
    [checkinData.scheduleOverrides]
  );

  // Compute overdue daily routines and overdue medicines
  const overdueRoutines = useMemo(() => {
    return allRoutines
      .filter((r) => {
        if (checkinData.completedMap[r.id]?.completedDate === todayKey) return false;
        const snoozedUntil = checkinData.snoozedUntilMs[`routine:${r.id}`] || 0;
        if (snoozedUntil > currentMs) return false;
        const sched = getRoutineScheduledTime(r);
        return currentMinutesOfDay > getMinutesFromTimeStr(sched);
      })
      .map((r) => {
        const sched = getRoutineScheduledTime(r);
        return {
          routine: r,
          scheduledTime: sched,
          minutesOverdue: Math.max(1, currentMinutesOfDay - getMinutesFromTimeStr(sched)),
        };
      });
  }, [allRoutines, checkinData, currentMinutesOfDay, currentMs, getRoutineScheduledTime, todayKey]);

  const overdueMedicines = useMemo(() => {
    return medicines
      .filter((med) => {
        if (med.lastTakenDate === todayKey) return false;
        const snoozedUntil = checkinData.snoozedUntilMs[`med:${med.id}`] || 0;
        if (snoozedUntil > currentMs) return false;
        return currentMinutesOfDay > getMinutesFromTimeStr(med.scheduledTime);
      })
      .map((med) => ({
        med,
        minutesOverdue: Math.max(1, currentMinutesOfDay - getMinutesFromTimeStr(med.scheduledTime)),
      }));
  }, [checkinData.snoozedUntilMs, currentMinutesOfDay, currentMs, medicines, todayKey]);

  // Trigger a gentle proactive banner alert once per newly overdue task/medicine
  useEffect(() => {
    const newOverdueLabels: string[] = [];
    overdueRoutines.forEach((item) => {
      const key = `routine:${item.routine.id}`;
      if (!alertedOverdueIdsRef.current.has(key)) {
        alertedOverdueIdsRef.current.add(key);
        newOverdueLabels.push(`${item.routine.title} (due ${format12Hour(item.scheduledTime)})`);
      }
    });
    overdueMedicines.forEach((item) => {
      const key = `med:${item.med.id}`;
      if (!alertedOverdueIdsRef.current.has(key)) {
        alertedOverdueIdsRef.current.add(key);
        newOverdueLabels.push(`Medicine: ${item.med.name} (due ${format12Hour(item.med.scheduledTime)})`);
      }
    });

    if (newOverdueLabels.length > 0) {
      playAlertSound('chime');
      onEmitAlert({
        title: 'Gentle Daily Check-In Reminder',
        message: `Overdue when ready: ${newOverdueLabels.join(' · ')}`,
        severity: 'warning',
        flashScreen: false,
      });
    }
  }, [onEmitAlert, overdueMedicines, overdueRoutines]);

  const markRoutineCheckin = useCallback(
    (routineId: string, done: boolean, speakConfirm = true) => {
      const target = allRoutines.find((r) => r.id === routineId);
      setCheckinData((prev) => {
        const nextMap = {...prev.completedMap};
        if (done) {
          nextMap[routineId] = {
            completedDate: todayKey,
            completedTimeLabel: new Date().toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
            }),
            completedAtIso: new Date().toISOString(),
          };
        } else {
          delete nextMap[routineId];
        }
        return {...prev, dateKey: todayKey, completedMap: nextMap};
      });
      if (done) {
        playAlertSound('chime');
        triggerVibration([60, 40, 80]);
        if (speakConfirm && target) {
          speakText(`Checked in: ${target.title} marked complete for today.`, voiceSpeed);
        }
      }
    },
    [allRoutines, todayKey, voiceSpeed]
  );

  const snoozeItem = (snoozeKey: string, label: string) => {
    const until = Date.now() + 30 * 60 * 1000;
    alertedOverdueIdsRef.current.delete(snoozeKey);
    setCheckinData((prev) => ({
      ...prev,
      snoozedUntilMs: {...prev.snoozedUntilMs, [snoozeKey]: until},
    }));
    triggerVibration(40);
    speakText(`Snoozed ${label} for 30 minutes.`, voiceSpeed);
  };

  const launchRoutine = (target: RoutineDefinition, viaNfc: boolean) => {
    setSelectedId(target.id);
    setStepIndex(0);
    setCompleted(false);
    triggerVibration(viaNfc ? [60, 40, 120] : 80);
    playAlertSound(viaNfc ? 'nfc' : 'select');

    const first = target.steps[0];
    const intro = viaNfc
      ? `NFC Tag tapped: ${target.nfcTagLabel}. Starting ${target.title}. Step 1: ${first.title}. ${first.instruction}`
      : `Starting ${target.title}. Step 1: ${first.title}. ${first.instruction}`;
    speakText(intro, voiceSpeed);

    if (viaNfc) {
      onEmitAlert({
        title: `NFC Tag Detected: ${target.nfcTagLabel}`,
        message: `Auto-launched "${target.title}"`,
        severity: 'info',
      });
    }
  };

  const handleNextStep = () => {
    triggerVibration(80);
    if (stepIndex + 1 < routine.steps.length) {
      const nextIdx = stepIndex + 1;
      setStepIndex(nextIdx);
      const next = routine.steps[nextIdx];
      playAlertSound('select');
      speakText(`Step ${nextIdx + 1}: ${next.title}. ${next.instruction}`, voiceSpeed);
    } else {
      setCompleted(true);
      markRoutineCheckin(routine.id, true, false);
      playAlertSound('chime');
      triggerVibration([100, 60, 180]);
      speakText(`Great job! You finished and checked in ${routine.title} for today.`, voiceSpeed);
      onEmitAlert({
        title: 'Routine Check-In Saved',
        message: `${routine.title} marked completed for today.`,
        severity: 'info',
      });
    }
  };

  const handlePrevStep = () => {
    if (completed) {
      setCompleted(false);
      return;
    }
    if (stepIndex > 0) {
      const prevIdx = stepIndex - 1;
      setStepIndex(prevIdx);
      const prev = routine.steps[prevIdx];
      speakText(`Step ${prevIdx + 1}: ${prev.title}. ${prev.instruction}`, voiceSpeed);
    }
  };

  const handleAddCustomRoutine = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = newTaskTitle.trim();
    if (!cleanTitle) return;
    const newId = `custom_${Date.now()}`;
    const newRoutine: RoutineDefinition = {
      id: newId,
      nfcTagId: `TASK-${String(customRoutines.length + 1).padStart(2, '0')}`,
      nfcTagLabel: 'Daily Task',
      title: cleanTitle,
      category: 'Custom Daily Check-In',
      emoji: newTaskEmoji || '📝',
      scheduledTime: newTaskTime || '09:00',
      isCustom: true,
      steps: [
        {
          title: `Prepare for ${cleanTitle}`,
          instruction: `Gather everything you need calmly before starting ${cleanTitle}.`,
          emoji: newTaskEmoji || '📝',
          tip: 'Take your time — one step at a time.',
        },
        {
          title: `Complete ${cleanTitle}`,
          instruction: `Carry out ${cleanTitle} carefully at a steady, comfortable pace.`,
          emoji: '✨',
          tip: 'Pause briefly if you feel tired.',
        },
        {
          title: 'Confirm Daily Check-In',
          instruction: `Finish ${cleanTitle} and mark it complete in your Routine Check-In tracker.`,
          emoji: '✅',
          tip: 'Saved automatically to your device.',
        },
      ],
    };
    setCustomRoutines((prev) => [...prev, newRoutine]);
    setNewTaskTitle('');
    setShowAddTask(false);
    triggerVibration(50);
    speakText(`Added daily routine check-in ${cleanTitle} for ${format12Hour(newTaskTime)}.`, voiceSpeed);
  };

  const handleAddMedicine = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = medName.trim();
    if (!cleanName) return;
    const nextMed: MedicineReminderItem = {
      id: `med_${Date.now()}`,
      name: cleanName,
      dosage: medDosage.trim() || '1 dose',
      scheduledTime: medTime || '09:00',
      foodRule: medFoodRule,
      instructions:
        medInstructions.trim() ||
        '1. Check the medicine label carefully. 2. Take your scheduled dose with plain water. 3. Mark taken below.',
      lastTakenDate: '',
      lastTakenTimeLabel: '',
      createdAtIso: new Date().toISOString(),
    };
    setMedicines((prev) => [nextMed, ...prev]);
    setMedName('');
    setMedDosage('1 tablet');
    setShowAddMed(false);
    playAlertSound('select');
    triggerVibration(60);
    speakText(
      `Saved medicine reminder for ${nextMed.name}, ${nextMed.dosage}, at ${format12Hour(nextMed.scheduledTime)}.`,
      voiceSpeed
    );
  };

  const toggleMedicineTaken = (medId: string) => {
    setMedicines((prev) =>
      prev.map((m) => {
        if (m.id !== medId) return m;
        const alreadyDone = m.lastTakenDate === todayKey;
        if (alreadyDone) {
          return {...m, lastTakenDate: '', lastTakenTimeLabel: ''};
        }
        const nowTime = new Date().toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
        });
        playAlertSound('chime');
        triggerVibration([60, 40, 80]);
        speakText(`Confirmed ${m.name} marked taken at ${nowTime}.`, voiceSpeed);
        return {...m, lastTakenDate: todayKey, lastTakenTimeLabel: nowTime};
      })
    );
  };

  const speakMedicineGuide = (med: MedicineReminderItem) => {
    const msg = `Medicine reminder: ${med.name}. Dosage: ${med.dosage}. Scheduled for ${format12Hour(med.scheduledTime)}. ${FOOD_RULE_LABELS[med.foodRule]}. How to take: ${med.instructions}`;
    speakText(msg, voiceSpeed);
  };

  const doneRoutinesCount = allRoutines.filter(
    (r) => checkinData.completedMap[r.id]?.completedDate === todayKey
  ).length;
  const doneMedsCount = medicines.filter((m) => m.lastTakenDate === todayKey).length;
  const hasOverdue = overdueRoutines.length > 0 || overdueMedicines.length > 0;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <ModuleHeader
        title={moduleMeta.title}
        subtitle={`05 · ${moduleMeta.domain}`}
        language={activeLang}
        onBack={onBack}
      />

      {/* Gentle Proactive Overdue Notification Banner */}
      {hasOverdue && (
        <div
          role="status"
          className="rounded-3xl border-2 border-amber-400/70 bg-amber-500/12 p-5 sm:p-6 space-y-4 shadow-lg"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0">
                <Bell className="w-6 h-6" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-display text-lg sm:text-xl font-extrabold">
                  Gentle Check-In Reminder ({overdueRoutines.length + overdueMedicines.length} waiting)
                </h2>
                <p className="text-sm text-muted">
                  No rush — here are today’s tasks or medicines that passed their target time:
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const summaryParts = [
                  ...overdueRoutines.map(
                    (o) => `${o.routine.title}, scheduled at ${format12Hour(o.scheduledTime)}`
                  ),
                  ...overdueMedicines.map(
                    (o) => `${o.med.name}, ${o.med.dosage}, ${FOOD_RULE_LABELS[o.med.foodRule]}`
                  ),
                ];
                speakText(`Gentle check-in reminder. ${summaryParts.join('. ')}`, voiceSpeed);
              }}
              className="surface-elevated min-h-[46px] px-4 rounded-xl text-xs font-extrabold flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Volume2 className="w-4 h-4" aria-hidden="true" />
              <span>Read Gentle Reminder</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {overdueRoutines.map(({routine: r, scheduledTime, minutesOverdue}) => (
              <div
                key={`ov-r-${r.id}`}
                className="surface-card rounded-2xl p-4 flex flex-col justify-between gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-base">
                      {r.emoji} {r.title}
                    </p>
                    <p className="text-xs text-muted font-bold mt-0.5">
                      Target {format12Hour(scheduledTime)} · {minutesOverdue} min past
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => launchRoutine(r, false)}
                    className="btn-accent min-h-[42px] px-3.5 rounded-xl text-xs font-extrabold cursor-pointer"
                  >
                    Start Guided Steps
                  </button>
                  <button
                    type="button"
                    onClick={() => markRoutineCheckin(r.id, true)}
                    className="surface-elevated min-h-[42px] px-3.5 rounded-xl text-xs font-extrabold cursor-pointer"
                  >
                    Quick Check-In Done
                  </button>
                  <button
                    type="button"
                    onClick={() => snoozeItem(`routine:${r.id}`, r.title)}
                    className="surface-elevated min-h-[42px] px-3 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Snooze 30m
                  </button>
                </div>
              </div>
            ))}

            {overdueMedicines.map(({med, minutesOverdue}) => (
              <div
                key={`ov-m-${med.id}`}
                className="surface-card rounded-2xl p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <p className="font-bold text-base">
                    💊 {med.name} · {med.dosage}
                  </p>
                  <p className="text-xs text-muted font-bold mt-0.5">
                    Due {format12Hour(med.scheduledTime)} ({minutesOverdue} min past) ·{' '}
                    {FOOD_RULE_LABELS[med.foodRule]}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleMedicineTaken(med.id)}
                    className="btn-accent min-h-[42px] px-3.5 rounded-xl text-xs font-extrabold cursor-pointer"
                  >
                    {t(activeLang, 'markTakenNow')}
                  </button>
                  <button
                    type="button"
                    onClick={() => speakMedicineGuide(med)}
                    className="surface-elevated min-h-[42px] px-3.5 rounded-xl text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t(activeLang, 'hearHowToTake')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => snoozeItem(`med:${med.id}`, med.name)}
                    className="surface-elevated min-h-[42px] px-3 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Snooze 30m
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily Routine Check-in Tracker (LocalStorage) */}
      <div className="surface-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" aria-hidden="true" />
              <span>{t(activeLang, 'dailyCheckInTitle')} ({todayKey})</span>
            </h2>
            <p className="text-sm text-muted mt-0.5">
              Saved locally on your device · {doneRoutinesCount} of {allRoutines.length} daily
              routines checked in today
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAddTask((v) => !v)}
              className="btn-accent min-h-[46px] px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Add Daily Task</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCheckinData((prev) => ({
                  ...prev,
                  completedMap: {},
                  snoozedUntilMs: {},
                }));
                alertedOverdueIdsRef.current.clear();
                triggerVibration(40);
              }}
              className="surface-elevated min-h-[46px] px-3.5 rounded-xl text-xs font-bold cursor-pointer"
            >
              Reset Today
            </button>
          </div>
        </div>

        {showAddTask && (
          <form
            onSubmit={handleAddCustomRoutine}
            className="surface-elevated rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
          >
            <div className="sm:col-span-2 space-y-1">
              <label htmlFor="task-emoji" className="block text-xs font-bold text-muted">
                Icon
              </label>
              <select
                id="task-emoji"
                value={newTaskEmoji}
                onChange={(e) => setNewTaskEmoji(e.target.value)}
                className="surface-card w-full min-h-[48px] rounded-xl px-3 font-bold"
              >
                <option value="📝">📝 Note</option>
                <option value="🥤">🥤 Hydrate</option>
                <option value="🍽️">🍽️ Meal</option>
                <option value="🚶">🚶 Walk</option>
                <option value="🩺">🩺 Checkup</option>
              </select>
            </div>
            <div className="sm:col-span-5 space-y-1">
              <label htmlFor="task-title" className="block text-xs font-bold text-muted">
                Daily Task Name
              </label>
              <input
                id="task-title"
                type="text"
                required
                maxLength={80}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="e.g., Check Blood Sugar / Evening Stretch"
                className="surface-card w-full min-h-[48px] rounded-xl px-3.5 font-bold"
              />
            </div>
            <div className="sm:col-span-3 space-y-1">
              <label htmlFor="task-time" className="block text-xs font-bold text-muted">
                Target Check-In Time
              </label>
              <input
                id="task-time"
                type="time"
                value={newTaskTime}
                onChange={(e) => setNewTaskTime(e.target.value)}
                className="surface-card w-full min-h-[48px] rounded-xl px-3 font-mono-nums font-bold"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="btn-accent w-full min-h-[48px] rounded-xl text-sm font-extrabold cursor-pointer"
              >
                Save Task
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {allRoutines.map((r) => {
            const entry = checkinData.completedMap[r.id];
            const isDone = entry?.completedDate === todayKey;
            const sched = getRoutineScheduledTime(r);
            const isOverdue =
              !isDone && currentMinutesOfDay > getMinutesFromTimeStr(sched);

            return (
              <div
                key={`ci-${r.id}`}
                className={`surface-elevated rounded-2xl p-4 flex flex-col justify-between gap-3 border-2 ${
                  isDone
                    ? 'border-emerald-500/50'
                    : isOverdue
                      ? 'border-amber-400/70'
                      : 'border-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <span className="text-2xl shrink-0" aria-hidden="true">
                      {r.emoji}
                    </span>
                    <div>
                      <p className="font-bold text-sm sm:text-base leading-snug">{r.title}</p>
                      <p className="text-xs font-bold text-muted mt-0.5">
                        {isDone
                          ? `Checked in at ${entry.completedTimeLabel}`
                          : isOverdue
                            ? `Overdue · Target ${format12Hour(sched)}`
                            : `Due ${format12Hour(sched)}`}
                      </p>
                    </div>
                  </div>
                  {r.isCustom && (
                    <button
                      type="button"
                      onClick={() =>
                        setCustomRoutines((prev) => prev.filter((item) => item.id !== r.id))
                      }
                      aria-label={`Delete custom task ${r.title}`}
                      className="surface-card min-h-[34px] min-w-[34px] rounded-lg flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => markRoutineCheckin(r.id, !isDone)}
                    className={`flex-1 min-h-[42px] px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
                      isDone ? 'bg-emerald-500 text-slate-950' : 'btn-accent'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{isDone ? t(activeLang, 'completedToday') : t(activeLang, 'checkIn')}</span>
                  </button>
                  <input
                    type="time"
                    aria-label={`Set target time for ${r.title}`}
                    value={sched}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) return;
                      alertedOverdueIdsRef.current.delete(`routine:${r.id}`);
                      setCheckinData((prev) => ({
                        ...prev,
                        scheduleOverrides: {...prev.scheduleOverrides, [r.id]: val},
                      }));
                    }}
                    className="surface-card min-h-[42px] px-2.5 rounded-xl font-mono-nums text-xs font-bold"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Input Medicine Reminders with Clear Step-by-Step Instructions */}
      <div className="surface-card rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold flex items-center gap-2">
              <Pill className="w-5 h-5 text-[#00f5d4]" aria-hidden="true" />
              <span>{t(activeLang, 'medicineGuideTitle')}</span>
            </h2>
            <p className="text-sm text-muted mt-0.5">
              {doneMedsCount} / {medicines.length}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddMed((v) => !v)}
            className="btn-accent min-h-[48px] px-4 rounded-xl text-sm font-extrabold flex items-center gap-2 cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>{showAddMed ? t(activeLang, 'cancel') : t(activeLang, 'inputNewMedicine')}</span>
          </button>
        </div>

        {showAddMed && (
          <form
            onSubmit={handleAddMedicine}
            className="surface-elevated rounded-2xl p-5 space-y-4 border border-theme"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label htmlFor="med-name" className="block text-xs font-bold">
                  Medicine Name
                </label>
                <input
                  id="med-name"
                  type="text"
                  required
                  maxLength={100}
                  value={medName}
                  onChange={(e) => setMedName(e.target.value)}
                  placeholder="e.g., Metformin 500mg"
                  className="surface-card w-full min-h-[48px] rounded-xl px-3.5 font-bold"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="med-dose" className="block text-xs font-bold">
                  Dosage &amp; Form
                </label>
                <input
                  id="med-dose"
                  type="text"
                  maxLength={60}
                  value={medDosage}
                  onChange={(e) => setMedDosage(e.target.value)}
                  placeholder="e.g., 1 tablet / 5 ml / 2 puffs"
                  className="surface-card w-full min-h-[48px] rounded-xl px-3.5 font-bold"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="med-time" className="block text-xs font-bold">
                  Scheduled Time
                </label>
                <input
                  id="med-time"
                  type="time"
                  value={medTime}
                  onChange={(e) => setMedTime(e.target.value)}
                  className="surface-card w-full min-h-[48px] rounded-xl px-3.5 font-mono-nums font-bold"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="med-rule" className="block text-xs font-bold">
                  Food &amp; Water Rule
                </label>
                <select
                  id="med-rule"
                  value={medFoodRule}
                  onChange={(e) => setMedFoodRule(e.target.value as MedicineFoodRule)}
                  className="surface-card w-full min-h-[48px] rounded-xl px-3 font-bold"
                >
                  {(Object.keys(FOOD_RULE_LABELS) as MedicineFoodRule[]).map((key) => (
                    <option key={key} value={key}>
                      {FOOD_RULE_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-muted">Quick Time:</span>
              {[
                ['08:00', 'Morning 8 AM'],
                ['13:00', 'Afternoon 1 PM'],
                ['19:00', 'Evening 7 PM'],
                ['21:30', 'Bedtime 9:30 PM'],
              ].map(([tVal, tLbl]) => (
                <button
                  key={tVal}
                  type="button"
                  onClick={() => setMedTime(tVal)}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-bold cursor-pointer ${
                    medTime === tVal ? 'btn-accent' : 'surface-card'
                  }`}
                >
                  {tLbl}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="med-inst" className="text-xs font-bold">
                  Clear Step-by-Step Instructions (How to Take)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {INSTRUCTION_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => {
                        setMedInstructions(tpl.text);
                        setMedFoodRule(tpl.rule);
                      }}
                      className="surface-card min-h-[34px] px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" aria-hidden="true" />
                      <span>{tpl.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                id="med-inst"
                rows={3}
                maxLength={500}
                value={medInstructions}
                onChange={(e) => setMedInstructions(e.target.value)}
                placeholder="Write clear steps: 1. Sit upright... 2. Drink full glass of water..."
                className="surface-card w-full rounded-xl p-3.5 text-sm font-medium"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="btn-accent min-h-[50px] px-6 rounded-xl font-extrabold text-sm cursor-pointer"
              >
                Save Medicine Reminder
              </button>
              <button
                type="button"
                onClick={() => setShowAddMed(false)}
                className="surface-card min-h-[50px] px-4 rounded-xl font-bold text-sm cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {medicines.length === 0 ? (
          <div className="surface-elevated rounded-2xl p-6 text-center text-sm text-muted font-bold">
            No medicines added yet. Tap &ldquo;Input New Medicine&rdquo; above to add dosage, timing,
            and clear step-by-step instructions.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {medicines.map((med) => {
              const takenToday = med.lastTakenDate === todayKey;
              const isOverdue =
                !takenToday && currentMinutesOfDay > getMinutesFromTimeStr(med.scheduledTime);

              return (
                <div
                  key={med.id}
                  className={`surface-elevated rounded-2xl p-5 flex flex-col justify-between gap-4 border-2 ${
                    takenToday
                      ? 'border-emerald-500/50'
                      : isOverdue
                        ? 'border-amber-400/70'
                        : 'border-theme'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-display text-xl font-extrabold">{med.name}</h3>
                        <p className="text-sm font-bold text-muted flex flex-wrap items-center gap-2 mt-0.5">
                          <span>{med.dosage}</span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 font-mono-nums">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                            {format12Hour(med.scheduledTime)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{FOOD_RULE_LABELS[med.foodRule]}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setMedicines((prev) => prev.filter((item) => item.id !== med.id))
                        }
                        aria-label={`Remove ${med.name}`}
                        className="surface-card min-h-[40px] min-w-[40px] rounded-xl flex items-center justify-center cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="surface-card rounded-xl p-3.5 space-y-1">
                      <p className="text-xs font-extrabold uppercase tracking-wider text-muted">
                        Clear How-to-Take Instructions
                      </p>
                      <p className="text-sm leading-relaxed font-medium">{med.instructions}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleMedicineTaken(med.id)}
                      className={`flex-1 min-h-[48px] px-4 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer ${
                        takenToday ? 'bg-emerald-500 text-slate-950' : 'btn-accent'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                      <span>
                        {takenToday
                          ? `${t(activeLang, 'completedToday')} (${med.lastTakenTimeLabel})`
                          : t(activeLang, 'markTakenNow')}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => speakMedicineGuide(med)}
                      className="surface-card min-h-[48px] px-4 rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Volume2 className="w-4 h-4" aria-hidden="true" />
                      <span>{t(activeLang, 'readAloud')}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Virtual NFC Tag Tap Simulator */}
      <div className="surface-card rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Nfc className="w-5 h-5 shrink-0" aria-hidden="true" />
          <h2 className="font-display text-lg sm:text-xl font-bold">
            Simulate NFC Tag Tap (Instant Guided Steps Launch)
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {allRoutines.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => launchRoutine(item, true)}
              className={`min-h-[60px] px-4 py-3 rounded-xl font-bold flex items-center justify-between gap-3 cursor-pointer transition-transform active:scale-[0.98] ${
                selectedId === item.id ? 'btn-accent' : 'surface-elevated'
              }`}
            >
              <div className="flex items-center gap-3 text-left">
                <span className="text-2xl" aria-hidden="true">
                  {item.emoji}
                </span>
                <div>
                  <p className="text-base font-extrabold leading-tight">{item.nfcTagLabel}</p>
                  <p className="text-xs opacity-80">{item.title}</p>
                </div>
              </div>
              <span className="font-mono-nums text-xs opacity-85">{item.nfcTagId}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Step Coach Card */}
      <div className="surface-card rounded-2xl p-5 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-muted">{routine.category}</p>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold">{routine.title}</h2>
          </div>
          <p className="font-mono-nums text-lg font-extrabold">
            {completed
              ? 'All Steps Complete'
              : `Step ${stepIndex + 1} of ${routine.steps.length}`}
          </p>
        </div>

        <div
          className="h-4 rounded-full bg-black/30 border border-theme overflow-hidden"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-emerald-400 transition-all duration-300"
            style={{width: `${progressPct}%`}}
          />
        </div>

        {completed ? (
          <div className="surface-elevated rounded-2xl p-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-400" aria-hidden="true" />
            <h3 className="font-display text-3xl font-extrabold">Routine Complete &amp; Checked In!</h3>
            <p className="text-lg text-muted max-w-xl mx-auto">
              You completed every step of <strong>{routine.title}</strong> and logged today’s
              check-in.
            </p>
            <button
              type="button"
              onClick={() => launchRoutine(routine, false)}
              className="btn-accent min-h-[60px] px-8 rounded-xl font-extrabold text-lg inline-flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-5 h-5" aria-hidden="true" />
              <span>Start Routine Again</span>
            </button>
          </div>
        ) : (
          <div className="surface-elevated rounded-2xl p-6 sm:p-8 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="w-20 h-20 rounded-2xl surface-card flex items-center justify-center text-5xl shrink-0">
                <span aria-hidden="true">{currentStep.emoji}</span>
              </div>
              <div className="space-y-2">
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold">
                  {currentStep.title}
                </h3>
                <p className="text-lg sm:text-xl leading-relaxed font-medium">
                  {currentStep.instruction}
                </p>
                <p className="text-sm font-bold text-muted">Helpful tip: {currentStep.tip}</p>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={stepIndex === 0}
                className="surface-card min-h-[64px] px-5 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
              >
                <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                <span>Previous</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  speakText(
                    `Step ${stepIndex + 1}: ${currentStep.title}. ${currentStep.instruction}`,
                    voiceSpeed
                  )
                }
                className="surface-card min-h-[64px] px-6 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Volume2 className="w-5 h-5" aria-hidden="true" />
                <span>Read Step Aloud</span>
              </button>

              <button
                type="button"
                onClick={handleNextStep}
                className="btn-accent flex-1 min-h-[64px] px-6 rounded-xl font-extrabold text-lg flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-[0.98]"
              >
                <span>
                  {stepIndex + 1 === routine.steps.length ? 'Finish & Check In' : 'Done / Next Step'}
                </span>
                <ChevronRight className="w-6 h-6" aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
