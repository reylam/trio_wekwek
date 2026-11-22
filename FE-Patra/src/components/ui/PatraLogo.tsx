import { cn } from '@/lib/utils';

export function PatraMark({
  className,
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  const fg = inverted ? '#FFFFFF' : '#043FA5';
  const dot = inverted ? '#9EC1EB' : '#73A6E9';
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-9 w-9 shrink-0', className)}
      aria-hidden="true"
    >
      <path
        d="M37.4 14.2C34.2 9.8 29.1 7 23.3 7C13.7 7 6 14.7 6 24.3C6 33.9 13.7 41.6 23.3 41.6C29.4 41.6 34.8 38.5 37.9 33.7L31.4 29.6C29.6 32.3 26.7 34 23.3 34C17.9 34 13.6 29.7 13.6 24.3C13.6 18.9 17.9 14.6 23.3 14.6C26.5 14.6 29.3 16.1 31.1 18.5L37.4 14.2Z"
        fill={fg}
      />
      <circle cx="24.5" cy="24.3" r="4.6" fill={dot} />
    </svg>
  );
}

export function PatraWordmark({
  subtitle,
  className,
}: {
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <PatraMark className="h-9 w-9" />
      <div className="min-w-0 leading-tight">
        <div className="text-lg font-extrabold tracking-tight text-primary">PATRA</div>
        <div className="truncate text-[11px] font-medium text-slate-500">
          {subtitle ?? 'Pantauan Transparan Ruang Publik'}
        </div>
      </div>
    </div>
  );
}
