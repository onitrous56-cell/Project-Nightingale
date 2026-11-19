import React, {useEffect, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {ArrowRight, ShieldCheck} from 'lucide-react';

interface StartupSplashProps {
  lowStimulationMode: boolean;
  onComplete: () => void;
}

export const StartupSplash: React.FC<StartupSplashProps> = ({
  lowStimulationMode,
  onComplete,
}) => {
  const [visible, setVisible] = useState(true);

  const reducedMotion =
    lowStimulationMode ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const duration = reducedMotion ? 900 : 2100;
    const timer = window.setTimeout(() => {
      setVisible(false);
    }, duration);
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  useEffect(() => {
    if (!visible) {
      const doneTimer = window.setTimeout(onComplete, reducedMotion ? 120 : 380);
      return () => window.clearTimeout(doneTimer);
    }
  }, [visible, onComplete, reducedMotion]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="ablebridge-startup-splash"
          initial={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: reducedMotion ? 0.15 : 0.4, ease: 'easeOut'}}
          className="fixed inset-0 z-[100] surface-canvas flex flex-col items-center justify-center px-6 text-center select-none"
          role="dialog"
          aria-label="AbleBridge Startup"
        >
          <div className="max-w-lg w-full space-y-8 flex flex-col items-center">
            {/* Kinetic Bridge & Orbital Emblem */}
            <div className="relative w-32 h-32 flex items-center justify-center">
              {!reducedMotion && (
                <>
                  <motion.div
                    initial={{scale: 0.55, opacity: 0, rotate: -45}}
                    animate={{scale: 1, opacity: 1, rotate: 0}}
                    transition={{duration: 0.75, ease: [0.16, 1, 0.3, 1]}}
                    className="absolute inset-0 rounded-full border-4 border-sky-400/50"
                  />
                  <motion.div
                    initial={{scale: 0.4, opacity: 0, rotate: 60}}
                    animate={{scale: 0.84, opacity: 0.9, rotate: 0}}
                    transition={{duration: 0.85, delay: 0.1, ease: [0.16, 1, 0.3, 1]}}
                    className="absolute inset-0 m-auto w-26 h-26 rounded-full border-2 border-amber-300/60"
                  />
                </>
              )}

              <motion.div
                initial={reducedMotion ? {opacity: 1} : {scale: 0.6, opacity: 0}}
                animate={{scale: 1, opacity: 1}}
                transition={{duration: 0.55, ease: [0.16, 1, 0.3, 1]}}
                className="w-20 h-20 rounded-2xl btn-accent flex items-center justify-center shadow-2xl"
              >
                <ShieldCheck className="w-11 h-11" aria-hidden="true" />
              </motion.div>
            </div>

            {/* Title & Subtitle */}
            <motion.div
              initial={reducedMotion ? {opacity: 1} : {y: 18, opacity: 0}}
              animate={{y: 0, opacity: 1}}
              transition={{duration: 0.6, delay: reducedMotion ? 0 : 0.18, ease: 'easeOut'}}
              className="space-y-3"
            >
              <p className="text-xs font-extrabold uppercase tracking-[0.26em] text-muted">
                Assistive Technology & Care Companion
              </p>
              <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">
                AbleBridge
              </h1>
              <p className="text-base sm:text-lg text-muted max-w-md mx-auto">
                Vision, Speech, Cognitive Routines, Mental Wellness, GPS Safety &amp; Gemini AI in one accessible space.
              </p>
            </motion.div>

            {/* Clean Progress Sweep */}
            <div className="w-full max-w-xs space-y-4">
              <div className="h-2 w-full rounded-full surface-elevated overflow-hidden">
                <motion.div
                  initial={{width: reducedMotion ? '100%' : '8%'}}
                  animate={{width: '100%'}}
                  transition={{duration: reducedMotion ? 0.4 : 1.75, ease: [0.22, 1, 0.36, 1]}}
                  className="h-full bg-sky-400 rounded-full"
                />
              </div>

              <button
                type="button"
                onClick={() => setVisible(false)}
                className="surface-elevated min-h-[56px] px-6 rounded-xl font-bold text-sm inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Enter Toolkit Now</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
