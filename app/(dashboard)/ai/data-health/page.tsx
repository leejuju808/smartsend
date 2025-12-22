'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type DriftStats = {
  alerts: number;
  [key: string]: unknown;
};

type LeakScanResponse = {
  count?: number;
  [key: string]: unknown;
};

type DedupResponse = {
  removed?: number;
  [key: string]: unknown;
};

type SplitResponse = {
  split_id?: string | null;
  [key: string]: unknown;
};

export default function DataHealth() {
  const [splitName, setSplitName] = useState(`split-${new Date().toISOString().slice(0, 10)}-strat`);
  const [seed, setSeed] = useState(1337);
  const [stats, setStats] = useState<DriftStats | null>(null);
  const [leaks, setLeaks] = useState<number | undefined>();
  const [loading, setLoading] = useState<string | null>(null);

  const withSpinner = async <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
    setLoading(key);
    try {
      return await fn();
    } finally {
      setLoading(null);
    }
  };

  const postJson = async (url: string, body?: unknown) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch (e) {
      json = { ok: false, error: 'Invalid response' };
    }
    if (!res.ok || json?.ok === false) {
      const error = json?.error || `Request failed (${res.status})`;
      throw new Error(error);
    }
    return json;
  };

  const dedup = () => withSpinner('dedup', async () => {
    try {
      const j = (await postJson('/api/ai/hygiene/dedup')) as DedupResponse & { ok: boolean };
      toast.success(`Removed ${j.removed ?? 0} dupes`);
    } catch (err: any) {
      toast.error(err.message);
    }
  });

  const buildSplit = () => withSpinner('split', async () => {
    try {
      const j = (await postJson('/api/ai/splits/build', { name: splitName, seed })) as SplitResponse & { ok: boolean };
      toast.success(`Split created: ${j.split_id}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  });

  const leakScan = () => withSpinner('leaks', async () => {
    try {
      const j = (await postJson('/api/ai/leaks/scan')) as LeakScanResponse & { ok: boolean };
      setLeaks(j.count ?? 0);
      toast.message(`Leak candidates: ${j.count ?? 0}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  });

  const driftScan = () => withSpinner('drift', async () => {
    try {
      const j = (await postJson('/api/ai/drift/scan')) as DriftStats & { ok: boolean };
      setStats(j);
      toast.success(`Drift alerts: ${j.alerts ?? 0}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  });

  const isLoading = (key: string) => loading === key;

  return (
    <div className="p-6 grid gap-6">
      <Card>
        <CardHeader><CardTitle>Data Hygiene</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-center">
          <Button onClick={dedup} disabled={isLoading('dedup')}>
            {isLoading('dedup') ? 'Deduplicating…' : 'Deduplicate Feedback'}
          </Button>
          <Button onClick={leakScan} variant="secondary" disabled={isLoading('leaks')}>
            {isLoading('leaks') ? 'Scanning…' : 'Leak Scan (Eval ↔ Train)'}
          </Button>
          {leaks !== undefined && (
            <div className="text-sm text-muted-foreground">Leak candidates: {leaks}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Build Train/Val/Test Split</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-center">
          <Input value={splitName} onChange={(e) => setSplitName(e.target.value)} placeholder="split name" />
          <Input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value))}
            className="w-32"
          />
          <Button onClick={buildSplit} disabled={isLoading('split')}>
            {isLoading('split') ? 'Creating…' : 'Create Stratified 80/10/10'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Drift Monitor</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-center">
          <Button onClick={driftScan} disabled={isLoading('drift')}>
            {isLoading('drift') ? 'Scanning…' : 'Run Drift Scan (7d)'}
          </Button>
          {stats && (
            <div className="text-sm text-muted-foreground">Alerts: {stats.alerts ?? 0}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
