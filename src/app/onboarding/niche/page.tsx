'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Briefcase } from 'lucide-react';

export default function NicheOnboardingPage() {
  const sb = createClientComponentClient();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<'recruiting'|'smb'|'saas'|'agency'|'none'>('recruiting');

  useEffect(() => {
    // Default to recruiting; could fetch current profile.niche if desired
  }, []);

  const onContinue = async () => {
    setSaving(true);
    const { data: { user }, error: userErr } = await sb.auth.getUser();
    if (userErr || !user) {
      setSaving(false);
      router.push('/auth/sign-in');
      return;
    }
    const { error } = await sb
      .from('profiles')
      .update({ niche: selected })
      .eq('id', user.id);
    setSaving(false);
    if (!error) {
      router.push('/sequences/templates');
    } else {
      alert('Failed to save niche: ' + error.message);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Choose your niche</h1>
      <p className="text-sm text-muted-foreground">
        We'll tailor SmartSendAI for your workflow. You can change this later.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { key: 'recruiting', label: 'Recruiting / Staffing', desc: 'Candidate + client outreach packs' },
          { key: 'smb', label: 'Local SMB', desc: 'Leads for service businesses' },
          { key: 'saas', label: 'B2B SaaS', desc: 'Demo booking + founder outreach' },
          { key: 'agency', label: 'Agencies', desc: 'White-label + multi-client' },
        ].map(item => (
          <Card
            key={item.key}
            onClick={() => setSelected(item.key as any)}
            className={`p-4 cursor-pointer transition hover:shadow-md ${selected === item.key ? 'ring-2 ring-primary' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{item.label}</div>
                <div className="text-sm text-muted-foreground">{item.desc}</div>
              </div>
              {selected === item.key ? <Check className="h-5 w-5" /> : <Briefcase className="h-5 w-5" />}
            </div>
          </Card>
        ))}
      </div>

      <Button onClick={onContinue} disabled={saving} className="w-full md:w-auto">
        {saving ? 'Saving…' : 'Continue'}
      </Button>
    </div>
  );
}