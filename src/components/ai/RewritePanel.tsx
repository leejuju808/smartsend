"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

type Tone = 'professional' | 'friendly' | 'neutral' | 'bold' | 'concise' | 'warm';
type Length = 'short' | 'medium' | 'long';
type Goal = 'get_reply' | 'book_demo' | 'qualify' | 'introduce' | 'follow_up';

interface RewriteVariant {
  subject: string;
  body: string;
}

interface RewritePanelProps {
  initialSubject?: string;
  initialBody?: string;
  lead?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    title?: string;
    website?: string;
    city?: string;
    state?: string;
    recent_signal?: string;
    pain_point?: string;
  };
  onVariantSelected?: (variant: RewriteVariant) => void;
}

export function RewritePanel({
  initialSubject = "",
  initialBody = "",
  lead,
  onVariantSelected,
}: RewritePanelProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [tone, setTone] = useState<Tone>('professional');
  const [length, setLength] = useState<Length>('medium');
  const [goal, setGoal] = useState<Goal>('get_reply');
  const [niche, setNiche] = useState('');
  const [count, setCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<RewriteVariant[]>([]);

  async function run() {
    if (!subject.trim() || !body.trim()) {
      return;
    }

    setLoading(true);
    try {
      const r = await fetch('/api/ai/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          body,
          tone,
          length,
          goal,
          niche: niche.trim() || undefined,
          count,
          lead,
        }),
      });

      if (!r.ok) {
        const error = await r.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Rewrite failed');
      }

      const j = await r.json();
      setVariants(j.variants || []);
    } catch (error) {
      console.error('Rewrite error:', error);
      // Could add toast notification here
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Smart Rewriter</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2">
          <label className="text-sm">Subject</label>
          <Input value={subject} onChange={e => setSubject(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <label className="text-sm">Body</label>
          <Textarea rows={8} value={body} onChange={e => setBody(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
          <select
            value={tone}
            onChange={e => setTone(e.target.value as Tone)}
            className="border rounded px-2 py-1"
          >
            <option value="professional">professional</option>
            <option value="friendly">friendly</option>
            <option value="neutral">neutral</option>
            <option value="bold">bold</option>
            <option value="concise">concise</option>
            <option value="warm">warm</option>
          </select>
          <select
            value={length}
            onChange={e => setLength(e.target.value as Length)}
            className="border rounded px-2 py-1"
          >
            <option value="short">short</option>
            <option value="medium">medium</option>
            <option value="long">long</option>
          </select>
          <select
            value={goal}
            onChange={e => setGoal(e.target.value as Goal)}
            className="border rounded px-2 py-1"
          >
            <option value="get_reply">get_reply</option>
            <option value="book_demo">book_demo</option>
            <option value="qualify">qualify</option>
            <option value="introduce">introduce</option>
            <option value="follow_up">follow_up</option>
          </select>
          <input
            placeholder="niche (optional)"
            value={niche}
            onChange={e => setNiche(e.target.value)}
            className="border rounded px-2 py-1"
          />
          <select
            value={count}
            onChange={e => setCount(Number(e.target.value))}
            className="border rounded px-2 py-1"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={5}>5</option>
          </select>
        </div>

        <Button disabled={loading} onClick={run}>
          {loading ? 'Rewriting…' : 'Rewrite'}
        </Button>

        {variants.length > 0 && (
          <div className="mt-4 grid gap-3">
            {variants.map((v, i) => (
              <div key={i} className="border rounded p-3">
                <div className="text-xs text-gray-500">Variant v{i + 1}</div>
                <div className="font-medium">{v.subject}</div>
                <pre className="whitespace-pre-wrap text-sm mt-1">{v.body}</pre>
                <div className="flex gap-2 mt-2">
                  <button
                    className="px-2 py-1 border rounded"
                    onClick={() => {
                      setSubject(v.subject);
                      setBody(v.body);
                      onVariantSelected?.(v);
                    }}
                  >
                    Use this
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

