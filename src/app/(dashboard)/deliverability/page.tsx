"use client";

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldX } from 'lucide-react';

interface SuppItem { recipient: string; reason: string; source?: string|null; domain?: string|null; created_at: string }

export default function DeliverabilityPage() {
  const [items, setItems] = React.useState<SuppItem[]>([]);
  const [q, setQ] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState('');

  async function load() {
    setLoading(true);
    const r = await fetch(`/api/deliverability/suppressions${q ? `?q=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store' });
    const j = await r.json();
    setItems(j.items || []);
    setLoading(false);
  }
  React.useEffect(()=>{ load(); }, []);

  async function add() {
    if (!newEmail) return;
    await fetch('/api/deliverability/suppressions', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ recipient: newEmail, reason: 'manual', source: 'ui' }) });
    setNewEmail('');
    load();
  }

  async function remove(recipient: string) {
    await fetch(`/api/deliverability/suppressions/${encodeURIComponent(recipient)}`, { method:'DELETE' });
    load();
  }

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Deliverability</h1>
          <p className="text-sm text-muted-foreground">Manage suppressions and keep your sender reputation clean.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search email or domain" value={q} onChange={(e)=>setQ(e.target.value)} className="w-56"/>
          <Button onClick={load}>Search</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldX className="h-5 w-5"/>
            <CardTitle>Suppression list</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Input placeholder="email@domain.com" value={newEmail} onChange={(e)=>setNewEmail(e.target.value)} className="w-64"/>
            <Button onClick={add} size="sm">Add</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin"/></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-2 pr-4">Recipient</th>
                    <th className="py-2 pr-4">Domain</th>
                    <th className="py-2 pr-4">Reason</th>
                    <th className="py-2 pr-4">Source</th>
                    <th className="py-2 pr-4">Added</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.recipient} className="border-t">
                      <td className="py-2 pr-4 font-medium">{it.recipient}</td>
                      <td className="py-2 pr-4">{it.domain ?? '-'}</td>
                      <td className="py-2 pr-4"><Badge variant={badge(it.reason)} className="capitalize">{it.reason}</Badge></td>
                      <td className="py-2 pr-4">{it.source ?? '-'}</td>
                      <td className="py-2 pr-4">{new Date(it.created_at).toLocaleString()}</td>
                      <td className="py-2"><Button size="sm" variant="outline" onClick={()=>remove(it.recipient)}>Remove</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function badge(reason: string) {
  switch (reason) {
    case 'bounce': return 'destructive' as const;
    case 'complaint': return 'destructive' as const;
    case 'unsubscribe': return 'secondary' as const;
    case 'manual': return 'default' as const;
    default: return 'outline' as const;
  }
}