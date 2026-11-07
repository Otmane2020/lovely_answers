import { useEffect, useState } from 'react';

export default function CloudHealth() {
  const [result, setResult] = useState<object | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cloud-health`, {
      cache: 'no-store', signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json();
      if (typeof data.ok !== 'boolean' || typeof data.latencyMs !== 'number') throw new Error('Invalid health response');
      setResult(data);
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ ok: false, status: 'UNAVAILABLE', latencyMs: null });
    });
    return () => controller.abort();
  }, []);
  return <pre className="m-2 whitespace-pre-wrap text-sm font-mono text-foreground">{result ? JSON.stringify(result) : 'Checking…'}</pre>;
}