'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

type Template = {
  id: string;
  slug: string;
  title: string;
  niche: 'recruiting'|'smb'|'saas'|'agency';
  use_case: string;
  description: string | null;
  content: {
    emails: Array<{ subject: string; body: string; delay_days: number; variables?: string[] }>;
  };
};

export default function TemplatesPage() {
  const sb = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [niche, setNiche] = useState<'recruiting'|'smb'|'saas'|'agency'|'all'>('recruiting');
  const [installingSlug, setInstallingSlug] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const userRes = await sb.auth.getUser();
      const user = userRes.data.user;
      if (!user) {
        window.location.href = '/auth/sign-in';
        return;
      }
      const { data: profile } = await sb.from('profiles').select('niche').eq('id', user.id).single();
      const selected = (profile?.niche as any) || 'recruiting';
      setNiche(selected);
      const { data, error } = await sb.from('sequence_templates').select('*').eq('niche', selected);
      if (!error && data) {
        setTemplates(data as any);
      }
      setLoading(false);
    })();
  }, []);

  const install = async (slug: string) => {
    setInstallingSlug(slug);
    try {
      const res = await fetch('/api/templates/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const t = await res.text();
        alert('Install failed: ' + t);
      } else {
        alert('Installed! Check your Sequences.');
      }
    } finally {
      setInstallingSlug(null);
    }
  };

  if (loading) return <div className="p-6">Loading templates…</div>;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Templates for {niche === 'recruiting' ? 'Recruiters' : niche}</h1>
      <p className="text-sm text-muted-foreground">
        Jumpstart with proven, verticalized sequences. One click installs them into your account.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map(t => (
          <Card key={t.id} className="p-4 space-y-3">
            <div>
              <div className="font-medium">{t.title}</div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.use_case.replace('_',' ')}</div>
            </div>
            <p className="text-sm text-muted-foreground">{t.description}</p>
            <div className="text-xs text-muted-foreground">
              {t.content.emails.length} steps • {t.niche}
            </div>
            <Button
              onClick={() => install(t.slug)}
              disabled={installingSlug === t.slug}
              className="w-full"
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              {installingSlug === t.slug ? 'Installing…' : 'Install into My Sequences'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}