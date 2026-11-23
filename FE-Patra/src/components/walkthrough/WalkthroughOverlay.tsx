import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { useWalkthrough } from './WalkthroughContext';
import type { PopoverPlacement } from './tourSteps';
import { cn } from '@/lib/utils';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
}

interface PopoverCoords {
  top: number;
  left: number;
}

const POPOVER_WIDTH = 368;
const POPOVER_GAP = 16;
const VIEWPORT_MARGIN = 16;

function findVisibleTarget(selectorValue: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${selectorValue}"]`);
  for (const el of nodes) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    ) {
      return el;
    }
  }
  return null;
}

function measureSpotlight(el: HTMLElement, padding: number): SpotlightRect {
  const r = el.getBoundingClientRect();
  const computedRadius = Number.parseFloat(window.getComputedStyle(el).borderRadius || '16');
  const radius = Number.isFinite(computedRadius)
    ? Math.min(28, Math.max(12, computedRadius + 2))
    : 16;

  // Batasi tinggi spotlight bila target sangat tinggi agar konteks tetap rapi di viewport
  const top = Math.max(8, r.top - padding);
  const left = Math.max(8, r.left - padding);
  const right = Math.min(window.innerWidth - 8, r.right + padding);
  const bottom = Math.min(window.innerHeight - 8, r.bottom + padding);

  return {
    top,
    left,
    width: Math.max(32, right - left),
    height: Math.max(32, bottom - top),
    radius,
  };
}

function computePopoverPosition(
  spot: SpotlightRect | null,
  cardWidth: number,
  cardHeight: number,
  preferred: PopoverPlacement = 'auto',
): PopoverCoords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const effW = Math.min(cardWidth, vw - VIEWPORT_MARGIN * 2);

  if (!spot) {
    return {
      top: Math.max(VIEWPORT_MARGIN, (vh - cardHeight) / 2),
      left: Math.max(VIEWPORT_MARGIN, (vw - effW) / 2),
    };
  }

  const spaceBottom = vh - (spot.top + spot.height) - VIEWPORT_MARGIN;
  const spaceTop = spot.top - VIEWPORT_MARGIN;
  const spaceRight = vw - (spot.left + spot.width) - VIEWPORT_MARGIN;
  const spaceLeft = spot.left - VIEWPORT_MARGIN;

  const fits = (side: Exclude<PopoverPlacement, 'auto'>) => {
    if (side === 'bottom') return spaceBottom >= cardHeight + POPOVER_GAP;
    if (side === 'top') return spaceTop >= cardHeight + POPOVER_GAP;
    if (side === 'right') return spaceRight >= effW + POPOVER_GAP;
    return spaceLeft >= effW + POPOVER_GAP;
  };

  const order: Array<Exclude<PopoverPlacement, 'auto'>> =
    preferred === 'auto'
      ? ['bottom', 'top', 'right', 'left']
      : [
          preferred,
          ...(['bottom', 'top', 'right', 'left'] as const).filter((s) => s !== preferred),
        ];

  const chosen = order.find(fits);

  let top: number;
  let left: number;

  if (chosen === 'bottom') {
    top = spot.top + spot.height + POPOVER_GAP;
    left = spot.left + spot.width / 2 - effW / 2;
  } else if (chosen === 'top') {
    top = spot.top - cardHeight - POPOVER_GAP;
    left = spot.left + spot.width / 2 - effW / 2;
  } else if (chosen === 'right') {
    top = spot.top + spot.height / 2 - cardHeight / 2;
    left = spot.left + spot.width + POPOVER_GAP;
  } else if (chosen === 'left') {
    top = spot.top + spot.height / 2 - cardHeight / 2;
    left = spot.left - effW - POPOVER_GAP;
  } else {
    // Fallback bersih: pojok kanan bawah / tengah bawah agar tetap menampakkan area highlight
    top = vh - cardHeight - VIEWPORT_MARGIN;
    left = vw - effW - VIEWPORT_MARGIN;
  }

  return {
    top: Math.max(VIEWPORT_MARGIN, Math.min(vh - cardHeight - VIEWPORT_MARGIN, top)),
    left: Math.max(VIEWPORT_MARGIN, Math.min(vw - effW - VIEWPORT_MARGIN, left)),
  };
}

export default function WalkthroughOverlay() {
  const { activeTour, stepIndex, currentStep, isOpen, nextStep, prevStep, goToStep, closeTour } =
    useWalkthrough();
  const location = useLocation();
  const maskId = useId().replace(/:/g, '');

  const [spot, setSpot] = useState<SpotlightRect | null>(null);
  const [popoverCoords, setPopoverCoords] = useState<PopoverCoords>({
    top: 80,
    left: 24,
  });
  const cardRef = useRef<HTMLDivElement | null>(null);
  const scrolledStepRef = useRef<string | null>(null);

  // Cari elemen target (tunggu lazy route/data selesai render) & sinkronkan posisi secara presisi
  useEffect(() => {
    if (!isOpen || !currentStep) {
      setSpot(null);
      scrolledStepRef.current = null;
      return;
    }

    let cancelled = false;
    let retryTimer: number | null = null;
    let attempts = 0;
    let trackedEl: HTMLElement | null = null;
    let resizeObs: ResizeObserver | null = null;

    const padding = currentStep.padding ?? 8;

    const updateRect = () => {
      if (cancelled || !trackedEl) return;
      if (!document.body.contains(trackedEl)) {
        trackedEl = findVisibleTarget(currentStep.target);
        if (!trackedEl) return;
      }
      setSpot(measureSpotlight(trackedEl, padding));
    };

    const locate = () => {
      if (cancelled) return;
      const el = findVisibleTarget(currentStep.target);
      if (el) {
        trackedEl = el;
        const rect = el.getBoundingClientRect();
        const outOfView = rect.top < 72 || rect.bottom > window.innerHeight - 40;
        const stepKey = `${activeTour?.id}:${currentStep.id}`;

        if (outOfView && scrolledStepRef.current !== stepKey) {
          scrolledStepRef.current = stepKey;
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          window.setTimeout(updateRect, 260);
          window.setTimeout(updateRect, 520);
        }

        updateRect();
        resizeObs = new ResizeObserver(updateRect);
        resizeObs.observe(el);
        return;
      }

      attempts += 1;
      if (attempts <= 24) {
        retryTimer = window.setTimeout(locate, 120);
      } else {
        setSpot(null);
      }
    };

    locate();
    window.addEventListener('resize', updateRect, { passive: true });
    window.addEventListener('scroll', updateRect, { passive: true, capture: true });

    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      resizeObs?.disconnect();
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [activeTour?.id, currentStep, isOpen, location.pathname]);

  // Hitung ulang posisi kartu popover setiap kali spotlight atau ukuran kartu berubah
  useLayoutEffect(() => {
    if (!isOpen || !currentStep) return;
    const cardEl = cardRef.current;
    const h = cardEl?.offsetHeight || 228;
    const w = cardEl?.offsetWidth || POPOVER_WIDTH;
    setPopoverCoords(computePopoverPosition(spot, w, h, currentStep.placement ?? 'auto'));
  }, [spot, currentStep, isOpen, stepIndex]);

  if (!isOpen || !activeTour || !currentStep) return null;

  const totalSteps = activeTour.steps.length;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;
  const stepCounter = `${String(stepIndex + 1).padStart(2, '0')} / ${String(totalSteps).padStart(2, '0')}`;

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] select-none"
      role="dialog"
      aria-modal="true"
      aria-label={`${activeTour.label} — ${currentStep.title}`}
    >
      {/* Backdrop gelap presisi dengan lubang SVG cutout */}
      <svg
        className="fixed inset-0 h-full w-full"
        aria-hidden="true"
        onClick={() => closeTour(false)}
      >
        <defs>
          <mask id={`patra-tour-mask-${maskId}`}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spot && (
              <rect
                x={spot.left}
                y={spot.top}
                width={spot.width}
                height={spot.height}
                rx={spot.radius}
                ry={spot.radius}
                fill="black"
                style={{
                  transition:
                    'x 340ms cubic-bezier(0.22, 1, 0.36, 1), y 340ms cubic-bezier(0.22, 1, 0.36, 1), width 340ms cubic-bezier(0.22, 1, 0.36, 1), height 340ms cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(11, 19, 43, 0.56)"
          mask={`url(#patra-tour-mask-${maskId})`}
        />
      </svg>

      {/* Bingkai sorotan bersih (hairline civic blue + white inner edge + corner ticks) */}
      {spot && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed"
          style={{
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            borderRadius: spot.radius,
            boxShadow:
              '0 0 0 2px #FFFFFF, 0 0 0 4px rgba(4, 63, 165, 0.85), 0 18px 44px -12px rgba(11, 19, 43, 0.45)',
            transition:
              'top 340ms cubic-bezier(0.22, 1, 0.36, 1), left 340ms cubic-bezier(0.22, 1, 0.36, 1), width 340ms cubic-bezier(0.22, 1, 0.36, 1), height 340ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          {/* Corner registration marks khas instrumen pemantauan PATRA */}
          <span className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-tl-[5px] border-l-2 border-t-2 border-white" />
          <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-tr-[5px] border-r-2 border-t-2 border-white" />
          <span className="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-bl-[5px] border-b-2 border-l-2 border-white" />
          <span className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-br-[5px] border-b-2 border-r-2 border-white" />
        </div>
      )}

      {/* Kartu Panduan Editorial (Bersih, Rapi, Responsif) */}
      <div
        ref={cardRef}
        style={{
          top: popoverCoords.top,
          left: popoverCoords.left,
          width: `min(${POPOVER_WIDTH}px, calc(100vw - ${VIEWPORT_MARGIN * 2}px))`,
          transition:
            'top 320ms cubic-bezier(0.22, 1, 0.36, 1), left 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        className="fixed overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-slate-900 shadow-[0_24px_56px_-16px_rgba(11,19,43,0.38)]"
      >
        {/* Strip aksen atas tipis PATRA */}
        <div className="h-1 w-full bg-primary" />

        <div className="p-5">
          {/* Header Meta: Nomor Langkah + Kategori + Tombol Tutup */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-[#E9F1FD] px-2 py-0.5 font-mono text-[11px] font-bold tracking-tight text-primary">
                {stepCounter}
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                {currentStep.category}
              </span>
            </div>

            <button
              type="button"
              onClick={() => closeTour(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Tutup panduan (Esc)"
              title="Tutup (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Konten Utama */}
          <h3 className="mt-3 text-[15px] font-extrabold leading-snug tracking-tight text-slate-900">
            {currentStep.title}
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
            {currentStep.description}
          </p>

          {/* Progress Segmen Interaktif (Klik untuk lompat langkah) */}
          <div className="mt-4 flex items-center gap-1.5" role="tablist" aria-label="Langkah panduan">
            {activeTour.steps.map((st, idx) => {
              const active = idx === stepIndex;
              const passed = idx < stepIndex;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => goToStep(idx)}
                  aria-label={`Langkah ${idx + 1}: ${st.title}`}
                  title={st.title}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    active
                      ? 'flex-[2] bg-primary'
                      : passed
                        ? 'flex-1 bg-primary/40 hover:bg-primary/65'
                        : 'flex-1 bg-slate-200 hover:bg-slate-300',
                  )}
                />
              );
            })}
          </div>

          {/* Footer Navigasi */}
          <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5">
            <button
              type="button"
              onClick={() => closeTour(false)}
              className="text-xs font-semibold text-slate-400 transition hover:text-slate-700"
            >
              Lewati
            </button>

            <div className="flex items-center gap-2">
              {!isFirst && (
                <button
                  type="button"
                  onClick={prevStep}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Kembali</span>
                </button>
              )}

              <button
                type="button"
                onClick={nextStep}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-primary/90"
              >
                {isLast ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Selesai</span>
                  </>
                ) : (
                  <>
                    <span>Lanjut</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
