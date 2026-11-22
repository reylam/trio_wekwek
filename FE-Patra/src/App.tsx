import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function App() {
  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div
        className={cn(
          'w-full max-w-lg rounded-2xl border bg-card p-8 shadow-sm space-y-4',
        )}
      >
        <div className="inline-flex items-center gap-2 rounded-full bg-accent/30 px-3 py-1 text-xs font-semibold text-primary">
          <ShieldCheck className="h-4 w-4" />
          <span>SDG 16 — Smart Governance</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">
          PATRA
        </h1>
        <p className="text-slate-600">Pantauan Transparan Ruang Publik</p>
        <div className="rounded-lg bg-video-frame px-4 py-3 font-mono text-xs text-slate-200">
          FE-Patra Ready • React 18 + Tailwind + shadcn/ui • AI Sampling: 1 FPS
        </div>
      </div>
    </main>
  );
}
