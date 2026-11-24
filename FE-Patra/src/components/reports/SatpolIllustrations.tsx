import polisiReportFailedUrl from '@/assets/images/Polisi Report Failed.png';
import polisiReportSuccessUrl from '@/assets/images/Polisi Report Success.png';
import polisiReportTableUrl from '@/assets/images/Polisi Report Table.png';
import polisiReportWaveUrl from '@/assets/images/Polisi Report.png';
import { cn } from '@/lib/utils';

/**
 * Ilustrasi petugas Satpol PP memegang HT untuk kartu ringkasan Reports & Actions.
 * Memakai crop torso-atas agar proporsional di atas header tabel seperti mockup.
 */
export function SatpolRadioOfficerSvg({ className }: { className?: string }) {
  return (
    <img
      src={polisiReportTableUrl}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className={cn(
        'pointer-events-none select-none object-cover object-top',
        className,
      )}
    />
  );
}

/**
 * Ilustrasi petugas melambai ramah untuk kartu Relocation Sites & Guides.
 */
export function SatpolWaveOfficerSvg({ className }: { className?: string }) {
  return (
    <img
      src={polisiReportWaveUrl}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className={cn(
        'pointer-events-none select-none object-contain object-bottom',
        className,
      )}
    />
  );
}

/**
 * Ilustrasi petugas senior tersenyum untuk layar Submission Success.
 * Dicerminkan horizontal (-scale-x-100) agar gestur tangan mengarah ke kartu ringkasan.
 */
export function SatpolHappyOfficerSvg({ className }: { className?: string }) {
  return (
    <img
      src={polisiReportSuccessUrl}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className={cn(
        'pointer-events-none -scale-x-100 select-none object-contain object-bottom',
        className,
      )}
    />
  );
}

/**
 * Ilustrasi petugas bersiap membantu ulang untuk layar Submission Failed.
 */
export function SatpolConcernedOfficerSvg({ className }: { className?: string }) {
  return (
    <img
      src={polisiReportFailedUrl}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className={cn(
        'pointer-events-none select-none object-contain object-bottom',
        className,
      )}
    />
  );
}
