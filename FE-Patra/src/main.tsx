import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  clearChunkRecoveryReloadFlag,
  triggerChunkRecoveryReload,
} from '@/lib/lazyWithRetry';
import App from './App';
import './index.css';

// Tangani kegagalan preload modul dinamis Vite (mis. hash chunk berubah pasca deploy baru)
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  triggerChunkRecoveryReload();
});

// Bersihkan penanda recovery setelah aplikasi berhasil berjalan stabil
window.setTimeout(() => {
  clearChunkRecoveryReloadFlag();
}, 10_000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
