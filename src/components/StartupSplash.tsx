import React, {useEffect, useState} from 'react';
import {AnimatePresence, motion} from 'motion/react';
import {ArrowRight, ShieldCheck} from 'lucide-react';

interface StartupSplashProps {
  lowStimulationMode: boolean;
  onComplete: () => void;
}

const EXTRUDE_BADGE_LAYERS = [
  {
    id: 'extrude-deep',
    offsetX: -16,
    offsetY: 16,
    delay: 0.24,
    opacity: 0.34,
    stroke: 'var(--border-subtle)',
    strokeWidth: 2,
  },
  {
    id: 'extrude-mid',
    offsetX: -10,
    offsetY: 10,
    delay: 0.16,
    opacity: 0.62,
    stroke: '#38bdf8',
    strokeWidth: 2.25,
  },
  {
    id: 'extrude-front-rim',
    offsetX: -5,
    offsetY: 5,
    delay: 0.08,
    opacity: 0.9,
    stroke: 'var(--accent-bg)',
    strokeWidth: 2.5,
  },
] as const;

export const StartupSplash: React.FC<StartupSplashProps> = ({
  lowStimulationMode,
  onComplete,
}) => {
  const [visible, setVisible] = useState(true);

  const batterySaver =
    typeof document !== 'undefined' &&
    document.documentElement.dataset.batterySaver === 'true';

  const reducedMotion =
    lowStimulationMode ||
    batterySaver ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const duration = reducedMotion ? 900 : 2400;
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
            {/* SVG Outline Draw -> 3D Isometric Extrude Emblem */}
            <div className="relative w-36 h-36 flex items-center justify-center extrude-stage">
              {!reducedMotion &&
                EXTRUDE_BADGE_LAYERS.map((layer) => (
                  <motion.svg
                    key={layer.id}
                    viewBox="0 0 96 96"
                    aria-hidden="true"
                    initial={{x: 0, y: 0, opacity: 0, scale: 0.88}}
                    animate={{
                      x: layer.offsetX,
                      y: layer.offsetY,
                      opacity: layer.opacity,
                      scale: 1,
                    }}
                    transition={{
                      duration: 0.72,
                      delay: layer.delay,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className="absolute w-24 h-24 pointer-events-none"
                  >
                    <motion.rect
                      x="6"
                      y="6"
                      width="84"
                      height="84"
                      rx="20"
                      fill="none"
                      stroke={layer.stroke}
                      strokeWidth={layer.strokeWidth}
                      initial={{pathLength: 0}}
                      animate={{pathLength: 1}}
                      transition={{
                        duration: 0.58,
                        delay: layer.delay,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  </motion.svg>
                ))}

              {/* Foreground Badge: Wireframe Outline Trace -> Extruded Solid Lift */}
              <motion.div
                initial={
                  reducedMotion
                    ? {opacity: 1}
                    : {x: 0, y: 0, scale: 0.92, rotateX: 10, rotateY: -10}
                }
                animate={
                  reducedMotion
                    ? {opacity: 1}
                    : {x: 4, y: -4, scale: 1, rotateX: 0, rotateY: 0}
                }
                transition={{
                  duration: 0.78,
                  delay: reducedMotion ? 0 : 0.14,
                  ease: [0.16, 1, 0.3, 1],
                }}
                className="relative w-24 h-24 flex items-center justify-center"
              >
                {!reducedMotion && (
                  <svg
                    viewBox="0 0 96 96"
                    aria-hidden="true"
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  >
                    <motion.rect
                      x="6"
                      y="6"
                      width="84"
                      height="84"
                      rx="20"
                      fill="none"
                      stroke="var(--accent-bg)"
                      strokeWidth="3"
                      initial={{pathLength: 0, opacity: 1}}
                      animate={{pathLength: 1, opacity: 0.25}}
                      transition={{
                        pathLength: {duration: 0.5, ease: [0.22, 1, 0.36, 1]},
                        opacity: {duration: 0.35, delay: 0.5},
                      }}
                    />
                  </svg>
                )}

                <motion.div
                  initial={
                    reducedMotion
                      ? {opacity: 1, scale: 1}
                      : {opacity: 0, scale: 0.84}
                  }
                  animate={{opacity: 1, scale: 1}}
                  transition={{
                    duration: reducedMotion ? 0.15 : 0.45,
                    delay: reducedMotion ? 0 : 0.32,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="w-[82px] h-[82px] rounded-2xl btn-accent flex items-center justify-center shadow-2xl border-2 border-theme"
                >
                  <ShieldCheck className="w-11 h-11" aria-hidden="true" />
                </motion.div>
              </motion.div>
            </div>

            {/* Title & Subtitle with Layered Outline Extrude Echoes */}
            <motion.div
              initial={reducedMotion ? {opacity: 1} : {y: 14, opacity: 0}}
              animate={{y: 0, opacity: 1}}
              transition={{
                duration: 0.55,
                delay: reducedMotion ? 0 : 0.18,
                ease: 'easeOut',
              }}
              className="space-y-3"
            >
              <p className="text-xs font-extrabold uppercase tracking-[0.26em] text-muted">
                Assistive Technology &amp; Care Companion
              </p>

              <div className="relative inline-grid place-items-center">
                {!reducedMotion && (
                  <>
                    <motion.span
                      aria-hidden="true"
                      initial={{x: 0, y: 0, opacity: 0}}
                      animate={{x: -8, y: 8, opacity: 0.45}}
                      transition={{
                        duration: 0.62,
                        delay: 0.42,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="col-start-1 row-start-1 font-display text-5xl sm:text-6xl font-extrabold tracking-tight text-outline-extrude-soft pointer-events-none"
                    >
                      AbleBridge
                    </motion.span>
                    <motion.span
                      aria-hidden="true"
                      initial={{x: 0, y: 0, opacity: 0}}
                      animate={{x: -4, y: 4, opacity: 0.82}}
                      transition={{
                        duration: 0.58,
                        delay: 0.34,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="col-start-1 row-start-1 font-display text-5xl sm:text-6xl font-extrabold tracking-tight text-outline-extrude pointer-events-none"
                    >
                      AbleBridge
                    </motion.span>
                  </>
                )}

                <motion.h1
                  initial={
                    reducedMotion
                      ? {opacity: 1, x: 0, y: 0}
                      : {opacity: 0, x: 0, y: 4, scale: 0.96}
                  }
                  animate={
                    reducedMotion
                      ? {opacity: 1, x: 0, y: 0}
                      : {opacity: 1, x: 2, y: -2, scale: 1}
                  }
                  transition={{
                    duration: reducedMotion ? 0.15 : 0.52,
                    delay: reducedMotion ? 0 : 0.46,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="col-start-1 row-start-1 font-display text-5xl sm:text-6xl font-extrabold tracking-tight"
                >
                  AbleBridge
                </motion.h1>
              </div>

              <p className="text-base sm:text-lg text-muted max-w-md mx-auto">
                Vision, Speech, Cognitive Routines, Mental Wellness, GPS Safety &amp; Gemini AI in one accessible space.
              </p>
            </motion.div>

            {/* Clean Progress Sweep */}
            <div className="w-full max-w-xs space-y-4">
              <div className="h-2.5 w-full rounded-full surface-elevated overflow-hidden">
                <motion.div
                  initial={{width: reducedMotion ? '100%' : '8%'}}
                  animate={{width: '100%'}}
                  transition={{
                    duration: reducedMotion ? 0.4 : 2.0,
                    ease: [0.22, 1, 0.36, 1],
                  }}
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
