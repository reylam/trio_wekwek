import { Compass } from 'lucide-react';
import { useWalkthrough } from './WalkthroughContext';
import type { TourId } from './tourSteps';
import { cn } from '@/lib/utils';

interface WalkthroughTriggerButtonProps {
  tourId: TourId;
  label?: string;
  className?: string;
  compactOnMobile?: boolean;
}

export default function WalkthroughTriggerButton({
  tourId,
  label = 'Panduan Tur',
  className,
  compactOnMobile = true,
}: WalkthroughTriggerButtonProps) {
  const { startTour, hasCompletedTour } = useWalkthrough();
  const completed = hasCompletedTour(tourId);

  return (
    <button
      type="button"
      onClick={() => startTour(tourId)}
      title="Mulai panduan interaktif fitur halaman ini"
      aria-label={label}
      className={cn(
        'relative inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-xs font-semibold text-primary shadow-sm transition hover:border-primary/40 hover:bg-[#EEF4FD]',
        className,
      )}
    >
      <Compass className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className={compactOnMobile ? 'hidden sm:inline' : undefined}>{label}</span>
      {!completed && (
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
