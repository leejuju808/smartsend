'use client';
import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const PERSONAS = [
  { id: 'concise', label: 'Concise • Founder-to-founder' },
  { id: 'friendly', label: 'Friendly • Helpful Operator' },
  { id: 'direct', label: 'Direct • Value-first' },
  { id: 'playful', label: 'Playful • Light humor' },
  { id: 'formal', label: 'Formal • Enterprise' },
];

export default function TemplateRewriter({ initial }: { initial?: string }) {
  const { toast } = useToast();
  const [template, setTemplate] = useState<string>(initial || `Subject: Quick question

Hi {{first_name}},

Noticed {{company}} is {{pain_point}}. We built SmartSend to {{value_prop}}.

Worth a 7-min chat this week?

— Julian`);
  const [persona, setPersona] = useState<string>('concise');
  const [brevity, setBrevity] = useState<'short'|'medium'|'long'>('short');
  const [draft, setDraft] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const variables = useMemo(() => Array.from(new Set((template.match(/{{[^}]+}}/g) || []).map(v => v))), [template]);

  async function rewrite() {
    try {
      setLoading(true);
      const res = await fetch('/api/template-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, persona, brevity })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rewrite failed');

      const missing = variables.filter(v => !String(data.draft).includes(v));
      if (missing.length) {
        toast({ title: 'Variable check', description: `AI dropped variables: ${missing.join(', ')}`, variant: 'destructive' });
      }
      setDraft(data.draft);
    } catch (e:any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }

  function accept() {
    setTemplate(draft);
    setDraft('');
    toast({ title: 'Template updated' });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Persona</Label>
          <Select value={persona} onValueChange={setPersona}>
            <SelectTrigger><SelectValue placeholder="Choose persona" /></SelectTrigger>
            <SelectContent>
              {PERSONAS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Brevity</Label>
          <Select value={brevity} onValueChange={(v)=>setBrevity(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Short (3–5 sentences)</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="long">Long</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Variables detected</Label>
          <Input readOnly value={variables.join(' ')} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Current Template</Label>
          <Textarea value={template} onChange={e=>setTemplate(e.target.value)} rows={14} />
          <div className="flex gap-2"><Button onClick={rewrite} disabled={loading}>{loading ? 'Rewriting…' : 'Rewrite with AI'}</Button></div>
        </div>
        <div className="space-y-2">
          <Label>AI Draft</Label>
          <Textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={14} placeholder="Your AI rewrite will appear here" />
          <div className="flex gap-2">
            <Button onClick={accept} disabled={!draft}>Accept Draft</Button>
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">Tip: keep variables like {{first_name}} {{company}} {{pain_point}} {{value_prop}}.</div>
    </div>
  );
}

'use client';
import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const PERSONAS = [
  { id: 'concise', label: 'Concise • Founder-to-founder' },
  { id: 'friendly', label: 'Friendly • Helpful Operator' },
  { id: 'direct', label: 'Direct • Value-first' },
  { id: 'playful', label: 'Playful • Light humor' },
  { id: 'formal', label: 'Formal • Enterprise' },
];

export default function TemplateRewriter({ initial }: { initial?: string }) {
  const [template, setTemplate] = useState<string>(initial || `Subject: Quick question

Hi {{first_name}},

Noticed {{company}} is {{pain_point}}. We built SmartSend to {{value_prop}}.

Worth a 7-min chat this week?

— Julian`);
  const [persona, setPersona] = useState<string>('concise');
  const [brevity, setBrevity] = useState<'short'|'medium'|'long'>('short');
  const [draft, setDraft] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const variables = useMemo(() => Array.from(new Set((template.match(/{{[^}]+}}/g) || []).map(v => v))), [template]);

  async function rewrite() {
    try {
      setLoading(true);
      const res = await fetch('/api/template-rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, persona, brevity })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rewrite failed');

      // Guard: ensure all variables preserved
      const missing = variables.filter(v => !String(data.draft).includes(v));
      if (missing.length) {
        toast.error(`AI dropped variables: ${missing.join(', ')}`);
      }
      setDraft(data.draft);
    } catch (e:any) {
      toast.error(e.message);
    } finally { setLoading(false); }
  }

  function accept() {
    setTemplate(draft);
    setDraft('');
    toast.success('Template updated');
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label>Persona</Label>
          <Select value={persona} onValueChange={setPersona}>
            <SelectTrigger><SelectValue placeholder="Choose persona" /></SelectTrigger>
            <SelectContent>
              {PERSONAS.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Brevity</Label>
          <Select value={brevity} onValueChange={(v)=>setBrevity(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="short">Short (3–5 sentences)</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="long">Long</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Variables detected</Label>
          <Input readOnly value={variables.join(' ')} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Current Template</Label>
          <Textarea value={template} onChange={e=>setTemplate(e.target.value)} rows={14} />
          <div className="flex gap-2"><Button onClick={rewrite} disabled={loading}>{loading ? 'Rewriting…' : 'Rewrite with AI'}</Button></div>
        </div>
        <div className="space-y-2">
          <Label>AI Draft</Label>
          <Textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={14} placeholder="Your AI rewrite will appear here" />
          <div className="flex gap-2">
            <Button onClick={accept} disabled={!draft}>Accept Draft</Button>
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">Tip: keep variables like {{first_name}} {{company}} {{pain_point}} {{value_prop}}.</div>
    </div>
  );
}


