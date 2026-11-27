import { cn } from '@/lib/utils';
import patraLogogramColor from '@/assets/images/Patra-Logogram.png';
import patraLogogramBlack from '@/assets/images/Patra-LogogramBlack.png';
import patraLogogramWhite from '@/assets/images/Patra-LogogramWhite.png';

export type PatraLogoVariant = 'color' | 'white' | 'black';

export function PatraMark({
  className,
  inverted = false,
  variant,
}: {
  className?: string;
  inverted?: boolean;
  variant?: PatraLogoVariant;
}) {
  const resolvedVariant: PatraLogoVariant = variant ?? (inverted ? 'white' : 'color');
  const src =
    resolvedVariant === 'white'
      ? patraLogogramWhite
      : resolvedVariant === 'black'
        ? patraLogogramBlack
        : patraLogogramColor;

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn('h-9 w-9 shrink-0 select-none object-contain', className)}
    />
  );
}

export function PatraWordmark({
  subtitle,
  className,
  variant = 'color',
}: {
  subtitle?: string;
  className?: string;
  variant?: PatraLogoVariant;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <PatraMark variant={variant} className="h-9 w-9" />
      <div className="min-w-0 leading-tight">
        <div
          className={cn(
            'text-lg font-extrabold tracking-tight',
            variant === 'white'
              ? 'text-white'
              : variant === 'black'
                ? 'text-slate-900'
                : 'text-primary',
          )}
        >
          PATRA
        </div>
        <div
          className={cn(
            'truncate text-[11px] font-medium',
            variant === 'white' ? 'text-blue-100/85' : 'text-slate-500',
          )}
        >
          {subtitle ?? 'Pantauan Transparan Ruang Publik'}
        </div>
      </div>
    </div>
  );
}
