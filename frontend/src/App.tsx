import { useEffect, useState } from 'react';

interface HealthResponse {
  status: string;
  message: string;
  timestamp: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<HealthResponse>;
      })
      .then(setHealth)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to connect');
      });
  }, []);

  return (
    <main className="container">
      <h1>React + Express (TSX)</h1>
      <section className="card">
        <h2>Backend Status</h2>
        {health && (
          <p className="status ok">
            {health.status.toUpperCase()}: {health.message}
          </p>
        )}
        {error && <p className="status err">Offline ({error})</p>}
        {!health && !error && <p className="status">Checking backend...</p>}
      </section>
    </main>
  );
}
