import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  WALKTHROUGH_TOURS,
  type TourDefinition,
  type TourId,
  type WalkthroughStep,
} from './tourSteps';

const STORAGE_KEY = 'patra:walkthrough:completed:v1';

function readCompletedTours(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveCompletedTour(tourId: TourId): Record<string, boolean> {
  const next = { ...readCompletedTours(), [tourId]: true };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Abaikan bila storage dibatasi browser
  }
  return next;
}

interface WalkthroughContextValue {
  activeTour: TourDefinition | null;
  stepIndex: number;
  currentStep: WalkthroughStep | null;
  isOpen: boolean;
  startTour: (tourId: TourId, startIndex?: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;
  closeTour: (markDone?: boolean) => void;
  hasCompletedTour: (tourId: TourId) => boolean;
}

const WalkthroughContext = createContext<WalkthroughContextValue | null>(null);

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTourId, setActiveTourId] = useState<TourId | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>(() =>
    readCompletedTours(),
  );

  const activeTour = activeTourId ? WALKTHROUGH_TOURS[activeTourId] : null;
  const currentStep = activeTour ? (activeTour.steps[stepIndex] ?? null) : null;

  const ensureStepRoute = useCallback(
    (step: WalkthroughStep | null) => {
      if (!step?.route) return;
      if (location.pathname !== step.route) {
        navigate(step.route);
      }
    },
    [location.pathname, navigate],
  );

  const startTour = useCallback(
    (tourId: TourId, startIndex = 0) => {
      const def = WALKTHROUGH_TOURS[tourId];
      if (!def || def.steps.length === 0) return;
      const clamped = Math.max(0, Math.min(def.steps.length - 1, startIndex));
      setActiveTourId(tourId);
      setStepIndex(clamped);
      const firstStep = def.steps[clamped];
      if (firstStep?.route && location.pathname !== firstStep.route) {
        navigate(firstStep.route);
      }
    },
    [location.pathname, navigate],
  );

  const closeTour = useCallback(
    (markDone = false) => {
      if (markDone && activeTourId) {
        setCompletedMap(saveCompletedTour(activeTourId));
      }
      setActiveTourId(null);
      setStepIndex(0);
    },
    [activeTourId],
  );

  const goToStep = useCallback(
    (index: number) => {
      if (!activeTour) return;
      const clamped = Math.max(0, Math.min(activeTour.steps.length - 1, index));
      setStepIndex(clamped);
      ensureStepRoute(activeTour.steps[clamped] ?? null);
    },
    [activeTour, ensureStepRoute],
  );

  const nextStep = useCallback(() => {
    if (!activeTour) return;
    if (stepIndex >= activeTour.steps.length - 1) {
      closeTour(true);
      return;
    }
    const nextIdx = stepIndex + 1;
    setStepIndex(nextIdx);
    ensureStepRoute(activeTour.steps[nextIdx] ?? null);
  }, [activeTour, closeTour, ensureStepRoute, stepIndex]);

  const prevStep = useCallback(() => {
    if (!activeTour || stepIndex <= 0) return;
    const prevIdx = stepIndex - 1;
    setStepIndex(prevIdx);
    ensureStepRoute(activeTour.steps[prevIdx] ?? null);
  }, [activeTour, ensureStepRoute, stepIndex]);

  const hasCompletedTour = useCallback(
    (tourId: TourId) => Boolean(completedMap[tourId]),
    [completedMap],
  );

  // Navigasi keyboard: ArrowRight / ArrowLeft / Escape
  useEffect(() => {
    if (!activeTour) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeTour(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTour, closeTour, nextStep, prevStep]);

  const value = useMemo<WalkthroughContextValue>(
    () => ({
      activeTour,
      stepIndex,
      currentStep,
      isOpen: Boolean(activeTour && currentStep),
      startTour,
      nextStep,
      prevStep,
      goToStep,
      closeTour,
      hasCompletedTour,
    }),
    [
      activeTour,
      stepIndex,
      currentStep,
      startTour,
      nextStep,
      prevStep,
      goToStep,
      closeTour,
      hasCompletedTour,
    ],
  );

  return <WalkthroughContext.Provider value={value}>{children}</WalkthroughContext.Provider>;
}

export function useWalkthrough(): WalkthroughContextValue {
  const ctx = useContext(WalkthroughContext);
  if (!ctx) {
    throw new Error('useWalkthrough harus digunakan di dalam WalkthroughProvider');
  }
  return ctx;
}
